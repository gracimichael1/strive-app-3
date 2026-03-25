#!/usr/bin/env node

/**
 * Pipeline A — NAWGJ Scoresheet Extraction
 * Downloads NAWGJ practice judging videos and extracts scores via Gemini 2.5 Flash.
 * Output: pipeline-a/output/scores.csv
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, appendFileSync, existsSync, unlinkSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP_DIR = join(__dirname, 'tmp');
const OUTPUT_DIR = join(__dirname, 'output');
const ERRORS_DIR = join(__dirname, 'errors');
const SCORES_CSV = join(OUTPUT_DIR, 'scores.csv');
const PROCESSED_FILE = join(__dirname, 'processed.txt');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY not set. Source .env.local or export it.');
  process.exit(1);
}

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}`;

const MAX_FILE_SIZE_MB = 500;
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '10', 10);
const LIMIT = parseInt(process.env.LIMIT || '0', 10); // 0 = no limit

// Use updated yt-dlp binary if available, fall back to PATH
const YTDLP = existsSync('/tmp/yt-dlp-new') ? '/tmp/yt-dlp-new' : 'yt-dlp';

// --- Helpers ---

function getProcessedIds() {
  const ids = new Set();
  // From processed.txt
  if (existsSync(PROCESSED_FILE)) {
    readFileSync(PROCESSED_FILE, 'utf-8').split('\n').filter(Boolean).forEach(id => ids.add(id));
  }
  // Also check CSV for any video_ids already written (dedup safety)
  if (existsSync(SCORES_CSV)) {
    const lines = readFileSync(SCORES_CSV, 'utf-8').split('\n').slice(1); // skip header
    for (const line of lines) {
      const id = line.split(',')[0];
      if (id) ids.add(id);
    }
  }
  return ids;
}

function markProcessed(videoId) {
  appendFileSync(PROCESSED_FILE, videoId + '\n');
}

function ensureCsvHeader() {
  if (!existsSync(SCORES_CSV)) {
    writeFileSync(SCORES_CSV, 'video_id,title,level,event,final_score,start_value,deductions_json,extracted_at\n');
  }
}

function csvEscape(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function appendScoreRow(row) {
  const line = [
    row.video_id,
    csvEscape(row.title),
    csvEscape(row.level),
    csvEscape(row.event),
    row.final_score ?? '',
    row.start_value ?? '',
    csvEscape(row.deductions_json),
    row.extracted_at,
  ].join(',');
  appendFileSync(SCORES_CSV, line + '\n');
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// --- Video List ---

function fetchVideoList() {
  console.log('Fetching NAWGJ video list...');
  const channelUrl = 'https://www.youtube.com/channel/UCL9YScHn-_g6ul7eUI5_sZA';
  const raw = execSync(
    `${YTDLP} --flat-playlist --print "%(id)s|%(title)s|%(duration)s" "${channelUrl}" 2>/dev/null`,
    { maxBuffer: 10 * 1024 * 1024, encoding: 'utf-8' }
  );
  const videos = raw.trim().split('\n').filter(Boolean).map(line => {
    const [id, title, duration] = line.split('|');
    return { id, title, duration: parseFloat(duration) || 0 };
  });
  console.log(`Found ${videos.length} total videos on channel.`);
  return videos;
}

function filterTargetVideos(videos) {
  // Target: Level 5-8 videos with routines (SCORED, ALL EIGHT, Rapid Review, practice judging, routines)
  const pattern = /level\s+[5-8]/i;
  const typePattern = /scored|all\s+eight|rapid\s+review|practice\s+judg|routines|updated|rr\b/i;
  return videos.filter(v => pattern.test(v.title) && typePattern.test(v.title));
}

// --- Download ---

function downloadVideo(videoId) {
  const outPath = join(TMP_DIR, `${videoId}.mp4`);
  if (existsSync(outPath)) return outPath;
  try {
    // Video-only (audio not needed for score extraction), no ffmpeg required
    execSync(
      `${YTDLP} -f "bestvideo[height<=720][ext=mp4]/bestvideo[height<=720]/best[height<=720]" ` +
      `-o "${outPath}" -- "${videoId}" 2>&1`,
      { maxBuffer: 5 * 1024 * 1024, encoding: 'utf-8', timeout: 300000 }
    );
  } catch (e) {
    // Try simpler format selection as fallback
    try {
      execSync(
        `${YTDLP} -f "best[height<=720]" -o "${outPath}" -- "${videoId}" 2>&1`,
        { maxBuffer: 5 * 1024 * 1024, encoding: 'utf-8', timeout: 300000 }
      );
    } catch (e2) {
      throw new Error(`Download failed: ${e2.message?.slice(0, 200)}`);
    }
  }
  // Check file size
  const stat = statSync(outPath);
  const sizeMB = stat.size / (1024 * 1024);
  if (sizeMB > MAX_FILE_SIZE_MB) {
    unlinkSync(outPath);
    throw new Error(`File too large: ${sizeMB.toFixed(0)}MB (limit ${MAX_FILE_SIZE_MB}MB)`);
  }
  return outPath;
}

// --- Gemini Upload & Extract ---

async function uploadToGemini(filePath) {
  const stat = statSync(filePath);
  const fileSize = stat.size;
  const mimeType = 'video/mp4';

  // Step 1: Start resumable upload
  const initRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(fileSize),
        'X-Goog-Upload-Header-Content-Type': mimeType,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file: { displayName: filePath.split('/').pop() } }),
    }
  );
  if (!initRes.ok) {
    const body = await initRes.text();
    throw new Error(`Upload init failed (${initRes.status}): ${body.slice(0, 300)}`);
  }
  const uploadUrl = initRes.headers.get('X-Goog-Upload-URL');
  if (!uploadUrl) throw new Error('No upload URL in response');

  // Step 2: Upload file bytes
  const fileBytes = readFileSync(filePath);
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Command': 'upload, finalize',
      'X-Goog-Upload-Offset': '0',
      'Content-Length': String(fileSize),
    },
    body: fileBytes,
  });
  if (!uploadRes.ok) {
    const body = await uploadRes.text();
    throw new Error(`Upload failed (${uploadRes.status}): ${body.slice(0, 300)}`);
  }
  const uploadData = await uploadRes.json();
  return uploadData.file;
}

async function waitForProcessing(fileUri, fileName) {
  const maxWait = 300000; // 5 minutes
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${GEMINI_API_KEY}`
    );
    if (!res.ok) {
      await sleep(5000);
      continue;
    }
    const data = await res.json();
    if (data.state === 'ACTIVE') return data;
    if (data.state === 'FAILED') throw new Error(`File processing failed: ${JSON.stringify(data.error)}`);
    await sleep(5000);
  }
  throw new Error('File processing timed out after 5 minutes');
}

async function extractWithGemini(fileUri) {
  const prompt = `This is a gymnastics judging practice video from NAWGJ (National Association of Women's Gymnastics Judges). The video may contain multiple routines.

For EACH routine shown, extract:
1) The gymnast's level (e.g. Level 5, Level 6, Level 7, Level 8, Xcel Gold)
2) The event (floor, beam, bars, or vault)
3) The final score shown on screen
4) The start value if shown
5) Each deduction listed with the amount

Return as a JSON array where each element represents one routine:
[
  {
    "level": "Level 7",
    "event": "bars",
    "final_score": 8.95,
    "start_value": 10.0,
    "deductions": [{"description": "leg separation on kip", "amount": 0.10}],
    "routine_number": 1
  }
]

If any field is not visible or determinable, return null for that field.
If only one routine is shown, still return an array with one element.
Return JSON only, no other text.`;

  const res = await fetch(`${GEMINI_URL}:generateContent?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { fileData: { mimeType: 'video/mp4', fileUri } },
          { text: prompt },
        ],
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 65536,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${body.slice(0, 500)}`);
  }

  const data = await res.json();
  // Gemini 2.5 Flash may return thinking + text parts — find the text part
  const parts = data.candidates?.[0]?.content?.parts || [];
  const textPart = parts.find(p => p.text && !p.thought);
  const text = textPart?.text || parts.find(p => p.text)?.text;
  if (!text) {
    const finishReason = data.candidates?.[0]?.finishReason;
    throw new Error(`No text in Gemini response (finishReason: ${finishReason}, parts: ${parts.length})`);
  }
  return text;
}

async function deleteGeminiFile(fileName) {
  try {
    await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${GEMINI_API_KEY}`,
      { method: 'DELETE' }
    );
  } catch (e) {
    // Non-critical, ignore
  }
}

function parseGeminiResponse(raw) {
  // Strip markdown fences
  let text = raw.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '');
  }
  text = text.trim();

  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch (e) {
    // Truncated JSON recovery: progressively trim to find last valid array
    if (text.startsWith('[')) {
      // Strategy: find last "},\n" or "}\n  ," which marks end of a complete object
      // Then close the array
      const patterns = [/\}\s*,\s*\{[^}]*$/s, /\}\s*,?\s*$/s];
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
          const cutPoint = match.index + match[0].indexOf('}') + 1;
          const attempt = text.slice(0, cutPoint) + ']';
          try {
            const result = JSON.parse(attempt);
            console.log(`  (Recovered ${result.length} routine(s) from truncated JSON)`);
            return result;
          } catch (e2) { /* try next pattern */ }
        }
      }
      // Brute force: walk backwards from end finding each }, try to close
      let pos = text.length - 1;
      while (pos > 0) {
        pos = text.lastIndexOf('}', pos - 1);
        if (pos <= 0) break;
        try {
          const result = JSON.parse(text.slice(0, pos + 1) + ']');
          console.log(`  (Recovered ${result.length} routine(s) from truncated JSON)`);
          return result;
        } catch (e2) { /* keep looking */ }
      }
    }
    throw e; // Re-throw original error
  }
}

// --- Main Pipeline ---

async function processVideo(video, processedIds) {
  const { id, title } = video;

  if (processedIds.has(id)) {
    console.log(`  Skip ${id} — already processed`);
    return { status: 'skipped' };
  }

  let filePath = null;
  let geminiFile = null;

  try {
    // Download
    console.log(`  Downloading ${id}...`);
    filePath = downloadVideo(id);
    const sizeMB = (statSync(filePath).size / (1024 * 1024)).toFixed(1);
    console.log(`  Downloaded ${sizeMB}MB`);

    // Upload to Gemini
    console.log(`  Uploading to Gemini...`);
    geminiFile = await uploadToGemini(filePath);
    console.log(`  Waiting for processing...`);
    await waitForProcessing(geminiFile.uri, geminiFile.name);

    // Extract
    console.log(`  Extracting scores...`);
    const rawResponse = await extractWithGemini(geminiFile.uri);

    // Parse
    let routines;
    try {
      routines = parseGeminiResponse(rawResponse);
      if (!Array.isArray(routines)) routines = [routines];
    } catch (parseErr) {
      // Log raw response for debugging
      writeFileSync(join(ERRORS_DIR, `${id}_raw.txt`), rawResponse);
      throw new Error(`JSON parse failed: ${parseErr.message}`);
    }

    // Log if empty
    if (routines.length === 0) {
      writeFileSync(join(ERRORS_DIR, `${id}_empty.txt`), rawResponse);
      console.log(`  Warning: Gemini returned 0 routines for ${id}`);
    }

    // Write rows
    const now = new Date().toISOString();
    let extractedCount = 0;
    for (const routine of routines) {
      appendScoreRow({
        video_id: id,
        title,
        level: routine.level || null,
        event: routine.event || null,
        final_score: routine.final_score ?? null,
        start_value: routine.start_value ?? null,
        deductions_json: routine.deductions ? JSON.stringify(routine.deductions) : '',
        extracted_at: now,
      });
      extractedCount++;
    }

    markProcessed(id);
    const firstScore = routines[0]?.final_score ?? 'N/A';
    const event = routines[0]?.event ?? 'unknown';
    const level = routines[0]?.level ?? 'unknown';
    console.log(`  Extracted ${id} — ${level} ${event} score ${firstScore} (${extractedCount} routine(s))`);

    return { status: 'success', routines: extractedCount };

  } catch (err) {
    console.error(`  Failed ${id} — ${err.message}`);
    writeFileSync(join(ERRORS_DIR, `${id}_error.txt`), `${err.message}\n\n${err.stack || ''}`);
    // Don't mark as processed — allow retry on next run
    return { status: 'failed', error: err.message };

  } finally {
    // Cleanup local file
    if (filePath && existsSync(filePath)) {
      try { unlinkSync(filePath); } catch (e) { /* ignore */ }
    }
    // Cleanup Gemini file
    if (geminiFile?.name) {
      await deleteGeminiFile(geminiFile.name);
    }
  }
}

async function main() {
  console.log('=== Pipeline A — NAWGJ Score Extraction ===\n');

  ensureCsvHeader();
  const processedIds = getProcessedIds();
  console.log(`Previously processed: ${processedIds.size} videos\n`);

  // Fetch and filter videos
  let videos = fetchVideoList();
  videos = filterTargetVideos(videos);
  console.log(`Target videos (Level 5-8 with routines): ${videos.length}\n`);

  if (LIMIT > 0) {
    videos = videos.slice(0, LIMIT);
    console.log(`Limited to first ${LIMIT} videos\n`);
  }

  let totalSuccess = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  let totalRoutines = 0;

  for (let i = 0; i < videos.length; i++) {
    const video = videos[i];
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;

    if (i > 0 && i % BATCH_SIZE === 0) {
      console.log(`\n--- Batch ${batchNum} (${i}/${videos.length}) | Success: ${totalSuccess} | Failed: ${totalFailed} | Routines: ${totalRoutines} ---\n`);
    }

    console.log(`[${i + 1}/${videos.length}] ${video.title} (${video.id})`);
    const result = await processVideo(video, processedIds);

    if (result.status === 'success') {
      totalSuccess++;
      totalRoutines += result.routines || 0;
    } else if (result.status === 'failed') {
      totalFailed++;
    } else {
      totalSkipped++;
    }

    // Rate limit: brief pause between Gemini calls
    if (result.status !== 'skipped') {
      await sleep(2000);
    }
  }

  console.log('\n=== Pipeline A Complete ===');
  console.log(`Success: ${totalSuccess} | Failed: ${totalFailed} | Skipped: ${totalSkipped}`);
  console.log(`Total routines extracted: ${totalRoutines}`);
  console.log(`Output: ${SCORES_CSV}`);
}

main().catch(err => {
  console.error('Pipeline fatal error:', err);
  process.exit(1);
});
