#!/usr/bin/env node

/**
 * Pipeline A — NAWGJ Scoresheet Extraction (v2 Rewrite)
 *
 * Downloads NAWGJ scored/ALL EIGHT videos and extracts judge panel data
 * via Gemini 2.5 Flash. Outputs both CSV summary and per-routine JSON files.
 *
 * Usage:
 *   TIER=1 node pipeline-a/extract.mjs          # Tier 1: SCORED videos
 *   TIER=2 node pipeline-a/extract.mjs          # Tier 2: ALL EIGHT Project
 *   TIER=1 LIMIT=1 node pipeline-a/extract.mjs  # Test with 1 video
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, appendFileSync, existsSync, unlinkSync, statSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP_DIR = join(__dirname, 'tmp');
const OUTPUT_DIR = join(__dirname, 'output');
const JSON_DIR = join(OUTPUT_DIR, 'json');
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
const LIMIT = parseInt(process.env.LIMIT || '0', 10);
const TIER = parseInt(process.env.TIER || '1', 10);
const YTDLP = existsSync('/tmp/yt-dlp-new') ? '/tmp/yt-dlp-new' : 'yt-dlp';

// ═══════════════════════════════════════════════════════════════════════════════
// VIDEO LISTS — hardcoded from browser-verified channel map
// ═══════════════════════════════════════════════════════════════════════════════

const TIER1_VIDEOS = [
  { id: 's-ddx_f-WOs', level: 'Level 4',  event: 'floor', title: 'Level 4 Floor SCORED' },
  { id: 'vzqHSQSYGi8', level: 'Level 5',  event: 'floor', title: 'Level 5 Floor SCORED' },
  { id: 'mV0Qfca1Lao', level: 'Level 7',  event: 'floor', title: 'Level 7 Floor SCORED' },
  { id: 'JmEMuZuN3JU', level: 'Level 8',  event: 'floor', title: 'Level 8 Floor SCORED' },
  { id: '55hrDtt1i6M', level: 'Level 4',  event: 'bars',  title: 'Level 4 Bars SCORED' },
  { id: 'BhOkMKjT9lk', level: 'Level 5',  event: 'bars',  title: 'Level 5 Bars SCORED' },
  { id: 'uXNEOkp7ocM', level: 'Level 6',  event: 'bars',  title: 'Level 6 Bars ALL EIGHT' },
  { id: 'HRxlOIAiXtg', level: 'Level 8',  event: 'bars',  title: 'Level 8 Bars Project SCORED' },
  { id: 'WglomIPi76k', level: 'Level 10', event: 'bars',  title: 'Level 10 Bars Scored Routines' },
  { id: 'wrQBRscv4IY', level: 'Level 5',  event: 'beam',  title: 'Level 5 Beam SCORED' },
  { id: '1Tx2Qbr3yRo', level: 'Level 8',  event: 'beam',  title: 'Level 8 Beam SCORED' },
  { id: 'hhdhOdyH4qQ', level: 'Level 10', event: 'beam',  title: 'Level 10 Beam Scored Routines' },
  { id: 'oQKUIqneyhw', level: 'Level 4-5', event: 'vault', title: 'Level 4-5 Compulsory Vault SCORED' },
  { id: '3kKPB1fcZSk', level: 'Level 7',   event: 'vault', title: 'Level 7 Vault SCORED' },
  { id: 'iFQpXFs_Yxc', level: 'Level 8',   event: 'vault', title: 'Level 8 Vault Project SCORED' },
  { id: 'GW_Cx5tJUqM', level: 'Level 6',   event: 'vault', title: 'Level 6 Vault ALL EIGHT' },
  { id: 'rUxngMtgfZM', level: 'Level 10',  event: 'vault', title: 'Level 10 Vault Scored Routines' },
];

const TIER2_ALL_EIGHT = [
  { id: 'GW_Cx5tJUqM', level: 'Level 6', event: 'vault', title: 'Level 6 Vault ALL EIGHT' },
  { id: 'uXNEOkp7ocM', level: 'Level 6', event: 'bars',  title: 'Level 6 Bars ALL EIGHT' },
  { id: '3QbzIrYjUjY', level: 'Level 6', event: 'beam',  title: 'Level 6 Beam ALL EIGHT' },
  { id: 'Finbv8bjjCc', level: 'Level 6', event: 'floor', title: 'Level 6 Floor ALL EIGHT' },
  { id: 'qpOwL3hIu1Y', level: 'Level 7', event: 'vault', title: 'Level 7 Vault ALL EIGHT PP' },
  { id: '-NGoz9HNH3I', level: 'Level 7', event: 'bars',  title: 'Level 7 Bars ALL EIGHT' },
  { id: '1LrTKbVmdSg', level: 'Level 7', event: 'beam',  title: 'Level 7 Beam ALL EIGHT' },
  { id: 'lbUEr-vGBgM', level: 'Level 7', event: 'floor', title: 'Level 7 Floor ALL EIGHT' },
  { id: 'Rt2bUECSvBk', level: 'Level 8', event: 'vault', title: 'LEVEL 8 Vault ALL EIGHT' },
  { id: 'rY8JZ43ggVg', level: 'Level 8', event: 'bars',  title: 'Level 8 Bars ALL EIGHT' },
  { id: 'VGnAADYkF1g', level: 'Level 8', event: 'beam',  title: 'Level 8 Beam ALL EIGHT' },
  { id: 'CH4SsAONFuM', level: 'Level 8', event: 'floor', title: 'Level 8 Floor ALL EIGHT' },
  { id: 'Bidp7MA71H4', level: 'Level 9', event: 'vault', title: 'Level 9 Vault ALL EIGHT' },
  { id: '21-9IhyK2vQ', level: 'Level 9', event: 'bars',  title: 'Level 9 Bars ALL EIGHT' },
  { id: '2ouDd1KHcfw', level: 'Level 9', event: 'beam',  title: 'Level 9 Beam ALL EIGHT' },
  { id: 'J-fdfhvEzFE', level: 'Level 9', event: 'floor', title: 'Level 9 Floor ALL EIGHT' },
  { id: 'S85_5i-1R5I', level: 'Xcel Sapphire', event: 'vault', title: 'Xcel Sapphire Vault ALL EIGHT' },
  { id: 'DK_aq9DUrmo', level: 'Xcel Sapphire', event: 'bars',  title: 'Xcel Sapphire Bars ALL EIGHT' },
  { id: 'xbp0T3cvRmo', level: 'Xcel Sapphire', event: 'beam',  title: 'Xcel Sapphire Beam ALL EIGHT' },
  { id: 'nvGzRFWpxjQ', level: 'Xcel Sapphire', event: 'floor', title: 'Xcel Sapphire Floor ALL EIGHT' },
];

function getVideoList(tier) {
  if (tier === 1) return TIER1_VIDEOS;
  if (tier === 2) return TIER2_ALL_EIGHT;
  throw new Error(`Unknown tier: ${tier}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function getProcessedIds() {
  const ids = new Set();
  if (existsSync(PROCESSED_FILE)) {
    readFileSync(PROCESSED_FILE, 'utf-8').split('\n').filter(Boolean).forEach(id => ids.add(id));
  }
  if (existsSync(SCORES_CSV)) {
    readFileSync(SCORES_CSV, 'utf-8').split('\n').slice(1).forEach(line => {
      const id = line.split(',')[0];
      if (id) ids.add(id);
    });
  }
  return ids;
}

function markProcessed(videoId) {
  appendFileSync(PROCESSED_FILE, videoId + '\n');
}

function csvEscape(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function ensureDirs() {
  [TMP_DIR, OUTPUT_DIR, JSON_DIR, ERRORS_DIR].forEach(d => mkdirSync(d, { recursive: true }));
}

function ensureCsvHeader() {
  if (!existsSync(SCORES_CSV)) {
    writeFileSync(SCORES_CSV,
      'video_id,title,declared_level,declared_event,routine_number,' +
      'level,event,final_score,start_value,judge_count,' +
      'has_judge_rows,json_file,extracted_at\n'
    );
  }
}

function appendScoreRow(row) {
  const line = [
    row.video_id, csvEscape(row.title), csvEscape(row.declared_level),
    csvEscape(row.declared_event), row.routine_number ?? '',
    csvEscape(row.level), csvEscape(row.event),
    row.final_score ?? '', row.start_value ?? '', row.judge_count ?? '',
    row.has_judge_rows ? 'true' : 'false', csvEscape(row.json_file), row.extracted_at,
  ].join(',');
  appendFileSync(SCORES_CSV, line + '\n');
}

function writeRoutineJson(videoMeta, routine, extractedAt) {
  const filename = `${videoMeta.id}_r${routine.routine_number}.json`;
  const filepath = join(JSON_DIR, filename);
  writeFileSync(filepath, JSON.stringify({
    source_video: videoMeta.id,
    source_title: videoMeta.title,
    declared_level: videoMeta.level,
    declared_event: videoMeta.event,
    routine_number: routine.routine_number,
    level: routine.level || videoMeta.level,
    event: routine.event || videoMeta.event,
    final_score: routine.final_score ?? null,
    start_value: routine.start_value ?? 10.0,
    judge_count: routine.judge_count ?? null,
    judge_scores: routine.judge_scores ?? null,
    skill_names: routine.skill_names ?? null,
    judge_rows: routine.judge_rows ?? null,
    extracted_at: extractedAt,
  }, null, 2));
  return filename;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DOWNLOAD
// ═══════════════════════════════════════════════════════════════════════════════

function downloadVideo(videoId) {
  const outPath = join(TMP_DIR, `${videoId}.mp4`);
  if (existsSync(outPath)) return outPath;
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  try {
    execSync(
      `${YTDLP} --cookies-from-browser chrome ` +
      `-f "bestvideo[height<=720][ext=mp4]/bestvideo[height<=720]/best[height<=720]" ` +
      `-o "${outPath}" "${videoUrl}" 2>&1`,
      { maxBuffer: 5 * 1024 * 1024, encoding: 'utf-8', timeout: 300000 }
    );
  } catch {
    try {
      execSync(
        `${YTDLP} --cookies-from-browser chrome -f "best[height<=720]" -o "${outPath}" "${videoUrl}" 2>&1`,
        { maxBuffer: 5 * 1024 * 1024, encoding: 'utf-8', timeout: 300000 }
      );
    } catch (e2) {
      throw new Error(`Download failed: ${e2.message?.slice(0, 200)}`);
    }
  }
  const stat = statSync(outPath);
  if (stat.size / (1024 * 1024) > MAX_FILE_SIZE_MB) {
    unlinkSync(outPath);
    throw new Error(`File too large: ${(stat.size / 1e6).toFixed(0)}MB`);
  }
  return outPath;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GEMINI UPLOAD + EXTRACT
// ═══════════════════════════════════════════════════════════════════════════════

async function uploadToGemini(filePath) {
  const stat = statSync(filePath);
  const fileSize = stat.size;
  const initRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(fileSize),
        'X-Goog-Upload-Header-Content-Type': 'video/mp4', 'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file: { displayName: filePath.split('/').pop() } }),
    }
  );
  if (!initRes.ok) throw new Error(`Upload init failed (${initRes.status})`);
  const uploadUrl = initRes.headers.get('X-Goog-Upload-URL');
  if (!uploadUrl) throw new Error('No upload URL');
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'X-Goog-Upload-Command': 'upload, finalize', 'X-Goog-Upload-Offset': '0', 'Content-Length': String(fileSize) },
    body: readFileSync(filePath),
  });
  if (!uploadRes.ok) throw new Error(`Upload failed (${uploadRes.status})`);
  return (await uploadRes.json()).file;
}

async function waitForProcessing(fileName) {
  for (let i = 0; i < 60; i++) {
    await sleep(3000);
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${GEMINI_API_KEY}`);
    if (!res.ok) continue;
    const data = await res.json();
    if (data.state === 'ACTIVE') return data;
    if (data.state === 'FAILED') throw new Error('File processing failed');
    process.stdout.write('.');
  }
  throw new Error('Processing timeout');
}

async function deleteGeminiFile(fileName) {
  try { await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${GEMINI_API_KEY}`, { method: 'DELETE' }); } catch {}
}

async function extractWithGemini(fileUri, videoMeta) {
  const prompt = `This is a NAWGJ gymnastics judging video.
Video title: "${videoMeta.title}"
Expected: ${videoMeta.level} ${videoMeta.event} routine(s).

NAWGJ scored videos show each routine followed by a judge scoresheet table.
The scoresheet table has multiple rows (one per judge, typically 5-9 judges).
Columns: judge individual skill deductions, then execution total, then final score.
A panel-averaged final score appears at the bottom or is computed from the rows.

For EACH routine extract:
1. routine_number (integer, starting at 1)
2. level (e.g. "Level 7", "Xcel Gold")
3. event (one of: "bars", "beam", "vault", "floor")
4. final_score (the averaged/panel score shown — NOT one judge's score)
5. start_value (usually 10.0, or null if not shown)
6. judge_count (number of individual judge rows visible)
7. judge_scores (array of each judge's final score, one per row)
8. skill_names (array of column headers from scoresheet, e.g. ["Kip", "Cast", "Dismount"])
9. judge_rows (array of arrays — each inner array is one judge's row of numbers in order: [judge_final_score, execution_total, skill1_ded, skill2_ded, ...]. Use null for cells not clearly visible.)

If NO scoresheet visible: still extract routine_number, level, event. Set final_score, judge_rows to null.

Return JSON array only. No markdown fences. No prose. Start with [, end with ].

RULES:
- final_score must be the PANEL average — not one judge's score
- Do not estimate any number. If not clearly visible: null.
- One element per routine, even if only one routine shown.`;

  const res = await fetch(`${GEMINI_URL}:generateContent?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ fileData: { mimeType: 'video/mp4', fileUri } }, { text: prompt }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 65536 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini error (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  const textPart = parts.find(p => p.text && !p.thought) || parts.find(p => p.text);
  if (!textPart?.text) throw new Error(`No text (finishReason: ${data.candidates?.[0]?.finishReason})`);
  return textPart.text;
}

function parseGeminiResponse(raw) {
  let text = raw.trim();
  if (text.startsWith('```')) text = text.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '');
  text = text.trim();
  try { return JSON.parse(text); } catch {
    // Truncated array recovery
    if (text.startsWith('[')) {
      let pos = text.length - 1;
      while (pos > 0) {
        pos = text.lastIndexOf('}', pos - 1);
        if (pos <= 0) break;
        try {
          const result = JSON.parse(text.slice(0, pos + 1) + ']');
          console.log(`  (Recovered ${result.length} routine(s) from truncated JSON)`);
          return result;
        } catch { /* keep looking */ }
      }
    }
    throw new Error('JSON parse failed');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROCESS ONE VIDEO
// ═══════════════════════════════════════════════════════════════════════════════

async function processVideo(video, processedIds) {
  if (processedIds.has(video.id)) {
    console.log(`  Skip ${video.id} — already processed`);
    return { status: 'skipped' };
  }

  let filePath = null, geminiFile = null;
  try {
    console.log(`  Downloading ${video.id}...`);
    filePath = downloadVideo(video.id);
    console.log(`  Downloaded ${(statSync(filePath).size / 1e6).toFixed(1)}MB`);
    await sleep(8000 + Math.floor(Math.random() * 4000)); // 8-12s delay between downloads

    console.log(`  Uploading to Gemini...`);
    geminiFile = await uploadToGemini(filePath);
    console.log(`  Waiting for processing...`);
    await waitForProcessing(geminiFile.name);

    console.log(`  Extracting scores...`);
    const rawResponse = await extractWithGemini(geminiFile.uri, video);

    let routines;
    try {
      routines = parseGeminiResponse(rawResponse);
      if (!Array.isArray(routines)) routines = [routines];
    } catch (parseErr) {
      writeFileSync(join(ERRORS_DIR, `${video.id}_raw.txt`), rawResponse);
      throw new Error(`JSON parse failed: ${parseErr.message}`);
    }

    const now = new Date().toISOString();
    let extracted = 0;
    for (const routine of routines) {
      const jsonFile = writeRoutineJson(video, routine, now);
      appendScoreRow({
        video_id: video.id, title: video.title,
        declared_level: video.level, declared_event: video.event,
        routine_number: routine.routine_number,
        level: routine.level || video.level, event: routine.event || video.event,
        final_score: routine.final_score ?? null,
        start_value: routine.start_value ?? 10.0,
        judge_count: routine.judge_count ?? null,
        has_judge_rows: !!(routine.judge_rows?.length),
        json_file: jsonFile, extracted_at: now,
      });
      extracted++;
    }

    markProcessed(video.id);
    const scored = routines.filter(r => r.final_score != null).length;
    const withRows = routines.filter(r => r.judge_rows?.length).length;
    console.log(`  Extracted ${video.id} — ${extracted} routine(s), ${scored} scored, ${withRows} with judge rows`);
    return { status: 'success', routines: extracted, scored, withRows };

  } catch (err) {
    console.error(`  Failed ${video.id} — ${err.message}`);
    writeFileSync(join(ERRORS_DIR, `${video.id}_error.txt`), `${err.message}\n\n${err.stack || ''}`);
    return { status: 'failed', error: err.message };
  } finally {
    if (filePath && existsSync(filePath)) try { unlinkSync(filePath); } catch {}
    if (geminiFile?.name) await deleteGeminiFile(geminiFile.name);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log(`=== Pipeline A v2 — NAWGJ Score Extraction (Tier ${TIER}) ===\n`);
  ensureDirs();
  ensureCsvHeader();
  const processedIds = getProcessedIds();
  console.log(`Previously processed: ${processedIds.size} videos\n`);

  let videos = getVideoList(TIER);
  console.log(`Videos in Tier ${TIER}: ${videos.length}\n`);
  if (LIMIT > 0) { videos = videos.slice(0, LIMIT); console.log(`Limited to first ${LIMIT} videos\n`); }

  let totalSuccess = 0, totalFailed = 0, totalSkipped = 0, totalRoutines = 0, totalScored = 0, totalWithRows = 0;

  for (let i = 0; i < videos.length; i++) {
    const video = videos[i];
    if (i > 0 && i % BATCH_SIZE === 0) {
      console.log(`\n--- Batch ${Math.floor(i / BATCH_SIZE) + 1} (${i}/${videos.length}) | OK:${totalSuccess} FAIL:${totalFailed} Routines:${totalRoutines} ---\n`);
    }
    console.log(`[${i + 1}/${videos.length}] ${video.title} (${video.id})`);
    const result = await processVideo(video, processedIds);
    if (result.status === 'success') { totalSuccess++; totalRoutines += result.routines || 0; totalScored += result.scored || 0; totalWithRows += result.withRows || 0; }
    else if (result.status === 'failed') totalFailed++;
    else totalSkipped++;
    if (result.status !== 'skipped') await sleep(3000 + Math.floor(Math.random() * 2000));
  }

  console.log('\n=== Pipeline A v2 Complete ===');
  console.log(`Success: ${totalSuccess} | Failed: ${totalFailed} | Skipped: ${totalSkipped}`);
  console.log(`Total routines: ${totalRoutines} | Scored: ${totalScored} | With judge rows: ${totalWithRows}`);
  console.log(`Output: ${SCORES_CSV}`);
  console.log(`JSON:   ${JSON_DIR}`);
}

main().catch(err => { console.error('Pipeline fatal error:', err); process.exit(1); });
