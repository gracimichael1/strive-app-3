#!/usr/bin/env node
/**
 * batch-calibrate.mjs — Empirical calibration factor computation.
 *
 * For each NAWGJ JSON file: re-download video, run v15 scoring prompt,
 * capture RAW AI deductions (before calibration), compare to judge deductions.
 * Average ratio per event = empirical calibration factor.
 *
 * Run: node scripts/batch-calibrate.mjs
 *   LIMIT=5 node scripts/batch-calibrate.mjs   # Test first 5
 *   EVENT=vault node scripts/batch-calibrate.mjs # One event only
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Load env
const envPath = path.join(ROOT, '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
    if (m) process.env[m[1]] = m[2].trim();
  }
}
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) { console.error('GEMINI_API_KEY missing'); process.exit(1); }

const JSON_DIR   = path.join(ROOT, 'pipeline-a', 'output', 'json');
const TMP_DIR    = path.join(ROOT, 'pipeline-a', 'tmp');
const OUTPUT_CSV = path.join(ROOT, 'pipeline-a', 'output', 'calibration-ratios.csv');
const MODEL      = 'gemini-2.5-flash';
const API_BASE   = 'https://generativelanguage.googleapis.com';
const LIMIT      = parseInt(process.env.LIMIT || '0', 10);
const FILTER_EVENT = (process.env.EVENT || '').toLowerCase();
const YTDLP      = fs.existsSync('/tmp/yt-dlp-new') ? '/tmp/yt-dlp-new' : 'yt-dlp';
const CURRENT_FACTORS = { vault: 0.75, bars: 0.85, beam: 0.91, floor: 0.92 };

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function normalizeEvent(event) {
  if (!event) return null;
  const e = String(event).toLowerCase();
  if (e.includes('bar')) return 'bars';
  if (e.includes('beam')) return 'beam';
  if (e.includes('vault') || e === 'vt') return 'vault';
  if (e.includes('floor') || e === 'fx') return 'floor';
  return null;
}

function snapToUSAG(val) {
  if (typeof val !== 'number' || isNaN(val)) return 0;
  const abs = Math.abs(val);
  if (abs >= 0.40) return 0.50;
  return Math.round(abs * 20) / 20;
}

function computeRawExecution(scorecard) {
  const deductionLog = scorecard.deduction_log || [];
  let rawExec = 0;
  for (const entry of deductionLog) {
    let skillTotal = 0;
    if (Array.isArray(entry.deductions) && entry.deductions.length > 0) {
      for (const d of entry.deductions) skillTotal += snapToUSAG(Math.abs(d.point_value || 0));
    } else {
      skillTotal = snapToUSAG(Math.abs(entry.total_deduction || 0));
    }
    const hasFall = skillTotal >= 0.50 || (entry.deductions || []).some(d => /fall/i.test(d.type || '') || /fall/i.test(d.description || ''));
    if (skillTotal > 0.30 && !hasFall) skillTotal = 0.30;
    rawExec += skillTotal;
  }
  const artistry = Math.abs(scorecard.artistry?.total_artistry_deduction || 0);
  return { rawExec: +rawExec.toFixed(3), artistry: +artistry.toFixed(3) };
}

// CSV
function ensureCsv() {
  if (!fs.existsSync(OUTPUT_CSV)) {
    fs.writeFileSync(OUTPUT_CSV,
      'video_id,routine_number,event,level,judge_final_score,judge_deductions,' +
      'raw_ai_exec,raw_ai_artistry,raw_ai_total,ratio,current_factor,computed_at\n');
  }
}
function writeRow(row) {
  const esc = v => { const s = String(v ?? ''); return s.includes(',') ? `"${s}"` : s; };
  fs.appendFileSync(OUTPUT_CSV, [
    row.video_id, row.routine_number, row.event, esc(row.level),
    row.judge_final_score, row.judge_deductions,
    row.raw_ai_exec, row.raw_ai_artistry, row.raw_ai_total,
    row.ratio, row.current_factor, row.computed_at,
  ].join(',') + '\n');
}

// Download
function getVideoPath(videoId) { return path.join(TMP_DIR, `${videoId}.mp4`); }

function downloadVideo(videoId) {
  const outPath = getVideoPath(videoId);
  if (fs.existsSync(outPath) && fs.statSync(outPath).size > 1000) {
    console.log(`  Using cached: ${videoId}.mp4`);
    return outPath;
  }
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  try {
    execSync(`${YTDLP} --extractor-args "youtube:player_client=android_vr" -f "best[height<=720]" -o "${outPath}" "${url}" 2>&1`,
      { maxBuffer: 5 * 1024 * 1024, encoding: 'utf-8', timeout: 300000 });
  } catch (e) {
    throw new Error(`Download failed: ${e.message?.slice(0, 200)}`);
  }
  if (!fs.existsSync(outPath) || fs.statSync(outPath).size < 1000) throw new Error('Downloaded file empty or missing');
  return outPath;
}

// Gemini File API
async function uploadToGemini(filePath) {
  const stat = fs.statSync(filePath);
  const mimeType = filePath.endsWith('.mov') ? 'video/quicktime' : 'video/mp4';
  const initRes = await fetch(`${API_BASE}/upload/v1beta/files?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(stat.size),
      'X-Goog-Upload-Header-Content-Type': mimeType, 'Content-Type': 'application/json' },
    body: JSON.stringify({ file: { displayName: path.basename(filePath) } }),
  });
  if (!initRes.ok) throw new Error(`Upload init failed (${initRes.status})`);
  const uploadUrl = initRes.headers.get('X-Goog-Upload-URL');
  if (!uploadUrl) throw new Error('No upload URL');
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'X-Goog-Upload-Command': 'upload, finalize', 'X-Goog-Upload-Offset': '0', 'Content-Length': String(stat.size) },
    body: fs.readFileSync(filePath),
  });
  if (!uploadRes.ok) throw new Error(`Upload failed (${uploadRes.status})`);
  const data = await uploadRes.json();
  if (!data.file?.uri) throw new Error('No fileUri');
  return { fileUri: data.file.uri, fileName: data.file.name, mimeType };
}

async function waitForFile(fileName) {
  for (let i = 0; i < 30; i++) {
    await sleep(3000);
    const res = await fetch(`${API_BASE}/v1beta/${fileName}?key=${GEMINI_API_KEY}`);
    if (res.ok) { const d = await res.json(); if (d.state === 'ACTIVE') return; if (d.state === 'FAILED') throw new Error('Processing failed'); }
  }
  throw new Error('Processing timeout');
}

async function deleteFile(fileName) { try { await fetch(`${API_BASE}/v1beta/${fileName}?key=${GEMINI_API_KEY}`, { method: 'DELETE' }); } catch {} }

// v15 prompt
function buildSystemPrompt(level, event) {
  const src = fs.readFileSync(path.join(ROOT, 'src/engine/prompts.js'), 'utf-8');
  const coreMatch = src.match(/const CORE_JUDGE_INSTRUCTION = `([\s\S]*?)`;/);
  const core = coreMatch ? coreMatch[1] : '';
  const eventKey = /vault/i.test(event) ? 'VAULT' : /bar/i.test(event) ? 'BARS' : /beam/i.test(event) ? 'BEAM' : /floor/i.test(event) ? 'FLOOR' : null;
  let eventRules = '';
  if (eventKey) { const m = src.match(new RegExp(`${eventKey}: \`([\\s\\S]*?)\`,`, 'm')); if (m) eventRules = m[1]; }
  return [core, `\n## GENDER: WAG. Apply WAG scoring framework.\n`, `## LEVEL: ${level}\nStart Value: 10.0\n`, eventRules].join('\n');
}

const RESPONSE_SCHEMA = {
  type: 'object', properties: {
    start_value: { type: 'number' }, final_score: { type: 'number' },
    deduction_log: { type: 'array', items: { type: 'object', properties: {
      skill_name: { type: 'string' }, total_deduction: { type: 'number' }, fall_detected: { type: 'boolean' },
      deductions: { type: 'array', items: { type: 'object', properties: { type: { type: 'string' }, description: { type: 'string' }, point_value: { type: 'number' } }, required: ['description', 'point_value'] } },
      narrative: { type: 'string' }, injury_signal: { type: 'string' }, skill_confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    }, required: ['skill_name', 'total_deduction', 'fall_detected', 'deductions', 'narrative', 'injury_signal', 'skill_confidence'] } },
    artistry: { type: 'object', properties: { total_artistry_deduction: { type: 'number' }, notes: { type: 'string' } }, required: ['total_artistry_deduction', 'notes'] },
    coaching_summary: { type: 'string' }, primary_athlete_confidence: { type: 'string', enum: ['high', 'medium', 'low'] }, sv_verified: { type: 'boolean' },
  }, required: ['start_value', 'final_score', 'deduction_log', 'coaching_summary', 'primary_athlete_confidence', 'sv_verified'],
};

async function runScoringPass(fileUri, mimeType, level, event) {
  const sys = buildSystemPrompt(level, event);
  const usr = `Analyze this ${level} ${event} routine. Athlete: NAWGJ Test Athlete, WAG.\nScore precisely. Apply all deductions. For every skill: name it, list every deduction with body part and point value. Give a final_score estimate.`;
  const body = {
    contents: [{ parts: [{ file_data: { file_uri: fileUri, mime_type: mimeType } }, { text: usr }] }],
    generationConfig: { temperature: 0, topP: 0.95, maxOutputTokens: 16384, responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
    systemInstruction: { parts: [{ text: sys }] },
    thinkingConfig: { thinkingBudget: 4096 },
  };
  const res = await fetch(`${API_BASE}/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) {
    if (res.status === 400) { delete body.thinkingConfig; const r2 = await fetch(`${API_BASE}/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); if (!r2.ok) throw new Error(`Gemini retry failed (${r2.status})`); return parseGeminiJSON(await r2.json()); }
    throw new Error(`Gemini failed (${res.status})`);
  }
  return parseGeminiJSON(await res.json());
}

function parseGeminiJSON(data) {
  const parts = data.candidates?.[0]?.content?.parts || [];
  const text = parts.filter(p => p.text && !p.thought).map(p => p.text).join('\n') || parts.map(p => p.text || '').join('\n');
  const i = text.indexOf('{'), j = text.lastIndexOf('}');
  if (i === -1 || j <= i) throw new Error('No JSON in response');
  return JSON.parse(text.slice(i, j + 1));
}

// Process one routine
async function processRoutine(jsonFile) {
  const d = JSON.parse(fs.readFileSync(path.join(JSON_DIR, jsonFile), 'utf-8'));
  const event = normalizeEvent(d.event);
  const videoId = d.source_video;
  if (!d.final_score || typeof d.final_score !== 'number') return null;
  if (FILTER_EVENT && event !== FILTER_EVENT) return null;
  if (!event) return null;

  const judgeDeductions = +(10.0 - d.final_score).toFixed(3);
  const level = d.level || d.declared_level || 'Unknown';
  console.log(`  ${videoId} r${d.routine_number} | ${event} | ${level} | judge: ${d.final_score} (ded: ${judgeDeductions})`);

  let filePath;
  try { filePath = downloadVideo(videoId); console.log(`  File: ${(fs.statSync(filePath).size / 1e6).toFixed(1)}MB`); } catch (e) { console.error(`  Download failed: ${e.message}`); return null; }
  await sleep(12000 + Math.floor(Math.random() * 6000));

  let geminiFile = null;
  try {
    console.log(`  Uploading + scoring...`);
    geminiFile = await uploadToGemini(filePath);
    await waitForFile(geminiFile.fileName);
    const scorecard = await runScoringPass(geminiFile.fileUri, geminiFile.mimeType, level, event);
    const { rawExec, artistry } = computeRawExecution(scorecard);
    const rawTotal = +(rawExec + artistry).toFixed(3);
    const ratio = judgeDeductions > 0 ? +(rawTotal / judgeDeductions).toFixed(3) : null;
    const empirical = ratio ? +(1.0 / ratio).toFixed(3) : null;
    console.log(`  AI raw: exec=${rawExec} art=${artistry} total=${rawTotal} | judge ded: ${judgeDeductions} | ratio: ${ratio} → factor: ${empirical}`);
    writeRow({ video_id: videoId, routine_number: d.routine_number, event, level, judge_final_score: d.final_score, judge_deductions: judgeDeductions, raw_ai_exec: rawExec, raw_ai_artistry: artistry, raw_ai_total: rawTotal, ratio, current_factor: CURRENT_FACTORS[event] || 0.80, computed_at: new Date().toISOString() });
    return { event, ratio, rawTotal, judgeDeductions };
  } catch (e) { console.error(`  Scoring failed: ${e.message}`); return null; }
  finally { if (geminiFile?.fileName) await deleteFile(geminiFile.fileName); }
}

// Main
async function main() {
  console.log('=== STRIVE Batch Calibration ===\n');
  if (!fs.existsSync(JSON_DIR)) { console.error('No JSON dir'); process.exit(1); }
  fs.mkdirSync(TMP_DIR, { recursive: true });
  ensureCsv();

  let files = fs.readdirSync(JSON_DIR).filter(f => f.endsWith('.json'));
  files = files.filter(f => { try { const d = JSON.parse(fs.readFileSync(path.join(JSON_DIR, f), 'utf-8')); const ev = normalizeEvent(d.event); if (!ev) return false; if (FILTER_EVENT && ev !== FILTER_EVENT) return false; return typeof d.final_score === 'number' && d.final_score > 0; } catch { return false; } });
  const eventOrder = { floor: 0, bars: 1, beam: 2, vault: 3 };
  files.sort((a, b) => { const da = JSON.parse(fs.readFileSync(path.join(JSON_DIR, a), 'utf-8')); const db = JSON.parse(fs.readFileSync(path.join(JSON_DIR, b), 'utf-8')); return (eventOrder[normalizeEvent(da.event)] ?? 9) - (eventOrder[normalizeEvent(db.event)] ?? 9); });
  if (LIMIT > 0) files = files.slice(0, LIMIT);
  console.log(`Processing ${files.length} routines\n`);

  const results = []; let lastVideoId = null;
  for (let i = 0; i < files.length; i++) {
    console.log(`\n[${i + 1}/${files.length}] ${files[i]}`);
    const d = JSON.parse(fs.readFileSync(path.join(JSON_DIR, files[i]), 'utf-8'));
    if (lastVideoId && lastVideoId !== d.source_video) { const p = getVideoPath(lastVideoId); if (fs.existsSync(p)) { fs.unlinkSync(p); console.log(`  Cleaned ${lastVideoId}.mp4`); } }
    lastVideoId = d.source_video;
    const r = await processRoutine(files[i]);
    if (r) results.push(r);
    await sleep(3000 + Math.floor(Math.random() * 2000));
  }
  if (lastVideoId) { const p = getVideoPath(lastVideoId); if (fs.existsSync(p)) fs.unlinkSync(p); }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('BATCH CALIBRATION RESULTS');
  console.log('='.repeat(80));
  console.log(`Attempted: ${files.length} | Succeeded: ${results.length}\n`);
  const byEvent = {};
  for (const r of results) { if (r.ratio && r.ratio > 0) { if (!byEvent[r.event]) byEvent[r.event] = []; byEvent[r.event].push(r.ratio); } }
  console.log('Event  | N   | Avg ratio | Empirical factor | Current factor | Action');
  console.log('-'.repeat(80));
  for (const event of ['floor', 'bars', 'beam', 'vault']) {
    const ratios = byEvent[event] || [];
    if (!ratios.length) { console.log(`${event.padEnd(7)}| 0   | —         | —                | ${CURRENT_FACTORS[event]}          | NEEDS DATA`); continue; }
    const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    const emp = +(1.0 / avg).toFixed(3);
    const diff = Math.abs(emp - CURRENT_FACTORS[event]);
    const action = diff < 0.05 ? 'HOLD' : diff < 0.15 ? 'REVIEW' : 'UPDATE';
    const conf = ratios.length >= 20 ? 'HIGH' : ratios.length >= 10 ? 'MED' : 'LOW';
    console.log(`${event.padEnd(7)}| ${String(ratios.length).padEnd(4)}| ${avg.toFixed(3).padEnd(10)}| ${emp.toFixed(3).padEnd(17)}| ${String(CURRENT_FACTORS[event]).padEnd(15)}| ${action} [${conf}]`);
  }
  console.log(`\nCSV: ${OUTPUT_CSV}`);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
