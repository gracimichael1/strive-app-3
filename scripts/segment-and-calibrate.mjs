#!/usr/bin/env node
/**
 * segment-and-calibrate.mjs — Per-routine calibration via video segmentation.
 *
 * For each NAWGJ source video:
 *   Pass 1: Gemini identifies routine timestamps (segmentation)
 *   ffmpeg: Cut individual routine clips
 *   Pass 2: Score each clip with v15 prompt → capture rawExec
 *   Compare rawExec vs judge deductions → ratio
 *
 * Output: pipeline-a/output/calibration-ratios-v2.csv
 *         pipeline-a/clips/{videoId}_r{N}.mp4
 *
 * Run: node scripts/segment-and-calibrate.mjs
 *   LIMIT=1 EVENT=floor node scripts/segment-and-calibrate.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const envPath = path.join(ROOT, '.env.local');
if (fs.existsSync(envPath)) { for (const l of fs.readFileSync(envPath, 'utf-8').split('\n')) { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/); if (m) process.env[m[1]] = m[2].trim(); } }
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) { console.error('GEMINI_API_KEY missing'); process.exit(1); }

const JSON_DIR = path.join(ROOT, 'pipeline-a', 'output', 'json');
const TMP_DIR = path.join(ROOT, 'pipeline-a', 'tmp');
const CLIPS_DIR = path.join(ROOT, 'pipeline-a', 'clips');
const OUTPUT_CSV = path.join(ROOT, 'pipeline-a', 'output', 'calibration-ratios-v2.csv');
const MODEL = 'gemini-2.5-flash';
const API = 'https://generativelanguage.googleapis.com';
const LIMIT = parseInt(process.env.LIMIT || '0', 10);
const FILTER_EVENT = (process.env.EVENT || '').toLowerCase();
const YTDLP = fs.existsSync('/tmp/yt-dlp-new') ? '/tmp/yt-dlp-new' : 'yt-dlp';
const FFMPEG = fs.existsSync('/tmp/ffmpeg') ? '/tmp/ffmpeg' : 'ffmpeg';
const CURRENT = { vault: 0.75, bars: 0.85, beam: 0.91, floor: 0.92 };

const VIDEOS = [
  { id: 's-ddx_f-WOs', level: 'Level 4', event: 'floor' },
  { id: 'vzqHSQSYGi8', level: 'Level 5', event: 'floor' },
  { id: 'JmEMuZuN3JU', level: 'Level 8', event: 'floor' },
  { id: '55hrDtt1i6M', level: 'Level 4', event: 'bars' },
  { id: 'BhOkMKjT9lk', level: 'Level 5', event: 'bars' },
  { id: 'uXNEOkp7ocM', level: 'Level 6', event: 'bars' },
  { id: 'HRxlOIAiXtg', level: 'Level 8', event: 'bars' },
  { id: 'wrQBRscv4IY', level: 'Level 5', event: 'beam' },
  { id: '1Tx2Qbr3yRo', level: 'Level 8', event: 'beam' },
  { id: 'hhdhOdyH4qQ', level: 'Level 10', event: 'beam' },
  { id: 'oQKUIqneyhw', level: 'Level 4-5', event: 'vault' },
  { id: '3kKPB1fcZSk', level: 'Level 7', event: 'vault' },
  { id: 'iFQpXFs_Yxc', level: 'Level 8', event: 'vault' },
  { id: 'GW_Cx5tJUqM', level: 'Level 6', event: 'vault' },
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function normEv(e) { if (!e) return null; const s = e.toLowerCase(); if (s.includes('bar')) return 'bars'; if (s.includes('beam')) return 'beam'; if (s.includes('vault')) return 'vault'; if (s.includes('floor')) return 'floor'; return null; }
function snap(v) { if (typeof v !== 'number' || isNaN(v)) return 0; const a = Math.abs(v); if (a >= 0.40) return 0.50; return Math.round(a * 20) / 20; }

function computeRaw(sc) {
  let rawExec = 0;
  for (const e of (sc.deduction_log || [])) {
    let t = 0;
    if (Array.isArray(e.deductions) && e.deductions.length > 0) { for (const d of e.deductions) t += snap(Math.abs(d.point_value || 0)); }
    else t = snap(Math.abs(e.total_deduction || 0));
    const fall = t >= 0.50 || (e.deductions || []).some(d => /fall/i.test(d.description || ''));
    if (t > 0.30 && !fall) t = 0.30;
    rawExec += t;
  }
  const art = Math.abs(sc.artistry?.total_artistry_deduction || 0);
  return { rawExec: +rawExec.toFixed(3), artistry: +art.toFixed(3) };
}

function ensureCsv() { if (!fs.existsSync(OUTPUT_CSV)) fs.writeFileSync(OUTPUT_CSV, 'video_id,routine_number,event,level,judge_final_score,judge_deductions,raw_ai_exec,raw_ai_artistry,raw_ai_total,ratio,current_factor,clip_file,computed_at\n'); }
function writeRow(r) { fs.appendFileSync(OUTPUT_CSV, [r.video_id, r.routine_number, r.event, r.level, r.judge_final_score, r.judge_deductions, r.raw_ai_exec, r.raw_ai_artistry, r.raw_ai_total, r.ratio, r.current_factor, r.clip_file, r.computed_at].join(',') + '\n'); }

function download(id) {
  const p = path.join(TMP_DIR, `${id}.mp4`);
  if (fs.existsSync(p) && fs.statSync(p).size > 1e6) return p;
  execSync(`${YTDLP} --extractor-args "youtube:player_client=android_vr" -f "best[height<=720]" -o "${p}" "https://www.youtube.com/watch?v=${id}" 2>&1`, { maxBuffer: 10e6, encoding: 'utf-8', timeout: 300000 });
  if (!fs.existsSync(p) || fs.statSync(p).size < 1e6) throw new Error('Empty download');
  return p;
}

async function upload(fp) {
  const sz = fs.statSync(fp).size;
  const r1 = await fetch(`${API}/upload/v1beta/files?key=${GEMINI_API_KEY}`, { method: 'POST', headers: { 'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start', 'X-Goog-Upload-Header-Content-Length': String(sz), 'X-Goog-Upload-Header-Content-Type': 'video/mp4', 'Content-Type': 'application/json' }, body: JSON.stringify({ file: { displayName: path.basename(fp) } }) });
  if (!r1.ok) throw new Error(`Upload init ${r1.status}`);
  const url = r1.headers.get('X-Goog-Upload-URL');
  const r2 = await fetch(url, { method: 'POST', headers: { 'X-Goog-Upload-Command': 'upload, finalize', 'X-Goog-Upload-Offset': '0', 'Content-Length': String(sz) }, body: fs.readFileSync(fp) });
  if (!r2.ok) throw new Error(`Upload ${r2.status}`);
  const d = await r2.json();
  if (!d.file?.uri) throw new Error('No URI');
  return { uri: d.file.uri, name: d.file.name };
}

async function waitFile(n) { for (let i = 0; i < 40; i++) { await sleep(3000); const r = await fetch(`${API}/v1beta/${n}?key=${GEMINI_API_KEY}`); if (r.ok) { const d = await r.json(); if (d.state === 'ACTIVE') return; if (d.state === 'FAILED') throw new Error('Failed'); } } throw new Error('Timeout'); }
async function delFile(n) { try { await fetch(`${API}/v1beta/${n}?key=${GEMINI_API_KEY}`, { method: 'DELETE' }); } catch {} }

async function segment(uri, meta) {
  const prompt = `This NAWGJ gymnastics video shows multiple ${meta.event} routines. Identify each routine's start and end timestamps in seconds. A routine starts when the gymnast begins and ends before the scoresheet appears. Add 1s padding before start and 2s after end. Return JSON array only: [{"routine_number":1,"start_seconds":0,"end_seconds":38}]`;
  const r = await fetch(`${API}/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ file_data: { file_uri: uri, mime_type: 'video/mp4' } }, { text: prompt }] }], generationConfig: { temperature: 0, maxOutputTokens: 2048, responseMimeType: 'application/json' } }) });
  if (!r.ok) throw new Error(`Seg ${r.status}`);
  const d = await r.json();
  const t = (d.candidates?.[0]?.content?.parts || []).find(p => p.text)?.text || '';
  const i = t.indexOf('['), j = t.lastIndexOf(']');
  if (i === -1 || j <= i) return [];
  try { const s = JSON.parse(t.slice(i, j + 1)); return Array.isArray(s) ? s.filter(x => typeof x.start_seconds === 'number' && typeof x.end_seconds === 'number' && x.end_seconds > x.start_seconds && x.end_seconds - x.start_seconds >= 5) : []; } catch { return []; }
}

function clip(full, start, end, out) {
  if (fs.existsSync(out) && fs.statSync(out).size > 10000) return;
  const dur = end - start;
  if (dur < 5 || dur > 300) throw new Error(`Bad dur: ${dur}s`);
  execSync(`${FFMPEG} -y -ss ${start} -i "${full}" -t ${dur} -c copy "${out}" 2>/dev/null`, { timeout: 60000 });
  if (fs.statSync(out).size < 100000) throw new Error('Empty clip');
}

function buildSys(level, event) {
  const src = fs.readFileSync(path.join(ROOT, 'src/engine/prompts.js'), 'utf-8');
  const core = (src.match(/const CORE_JUDGE_INSTRUCTION = `([\s\S]*?)`;/) || [])[1] || '';
  const ek = /vault/i.test(event) ? 'VAULT' : /bar/i.test(event) ? 'BARS' : /beam/i.test(event) ? 'BEAM' : /floor/i.test(event) ? 'FLOOR' : null;
  let er = ''; if (ek) { const m = src.match(new RegExp(`${ek}: \`([\\s\\S]*?)\`,`, 'm')); if (m) er = m[1]; }
  return [core, '\n## GENDER: WAG.\n', `## LEVEL: ${level}\n`, er].join('\n');
}

const SCHEMA = { type: 'object', properties: { start_value: { type: 'number' }, final_score: { type: 'number' }, deduction_log: { type: 'array', items: { type: 'object', properties: { skill_name: { type: 'string' }, total_deduction: { type: 'number' }, fall_detected: { type: 'boolean' }, deductions: { type: 'array', items: { type: 'object', properties: { description: { type: 'string' }, point_value: { type: 'number' } }, required: ['description', 'point_value'] } }, narrative: { type: 'string' }, injury_signal: { type: 'string' }, skill_confidence: { type: 'string', enum: ['high', 'medium', 'low'] } }, required: ['skill_name', 'total_deduction', 'fall_detected', 'deductions', 'narrative', 'injury_signal', 'skill_confidence'] } }, artistry: { type: 'object', properties: { total_artistry_deduction: { type: 'number' }, notes: { type: 'string' } }, required: ['total_artistry_deduction', 'notes'] }, coaching_summary: { type: 'string' }, primary_athlete_confidence: { type: 'string', enum: ['high', 'medium', 'low'] }, sv_verified: { type: 'boolean' } }, required: ['start_value', 'final_score', 'deduction_log', 'coaching_summary', 'primary_athlete_confidence', 'sv_verified'] };

async function score(uri, level, event) {
  const body = { contents: [{ parts: [{ file_data: { file_uri: uri, mime_type: 'video/mp4' } }, { text: `Analyze this ${level} ${event} routine. One gymnast, one routine. Score precisely.` }] }], generationConfig: { temperature: 0, topP: 0.95, maxOutputTokens: 16384, responseMimeType: 'application/json', responseSchema: SCHEMA }, systemInstruction: { parts: [{ text: buildSys(level, event) }] }, thinkingConfig: { thinkingBudget: 4096 } };
  let r = await fetch(`${API}/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok && r.status === 400) { delete body.thinkingConfig; r = await fetch(`${API}/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
  if (!r.ok) throw new Error(`Score ${r.status}`);
  const d = await r.json();
  const t = (d.candidates?.[0]?.content?.parts || []).filter(p => p.text && !p.thought).map(p => p.text).join('') || (d.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
  const i = t.indexOf('{'), j = t.lastIndexOf('}');
  if (i === -1 || j <= i) throw new Error('No JSON');
  return JSON.parse(t.slice(i, j + 1));
}

function loadJsons(vid) {
  return fs.readdirSync(JSON_DIR).filter(f => f.startsWith(vid) && f.endsWith('.json'))
    .map(f => { try { return JSON.parse(fs.readFileSync(path.join(JSON_DIR, f), 'utf-8')); } catch { return null; } })
    .filter(d => d && typeof d.final_score === 'number' && d.final_score > 0)
    .sort((a, b) => (a.routine_number || 0) - (b.routine_number || 0));
}

async function processVideo(v, done) {
  if (done.has(v.id)) return [];
  if (FILTER_EVENT && normEv(v.event) !== FILTER_EVENT) return [];
  const jsons = loadJsons(v.id);
  if (!jsons.length) { console.log(`  No judge data for ${v.id}`); return []; }

  console.log(`\n${'═'.repeat(60)}\n${v.id} | ${v.event} | ${v.level} | ${jsons.length} judge routines\n${'═'.repeat(60)}`);

  let fp; try { fp = download(v.id); console.log(`  ${(fs.statSync(fp).size / 1e6).toFixed(1)}MB`); } catch (e) { console.error(`  DL fail: ${e.message}`); return []; }
  await sleep(8000 + Math.floor(Math.random() * 4000));

  let segs = [], gf = null;
  console.log('  Pass 1: segmenting...');
  try { gf = await upload(fp); await waitFile(gf.name); segs = await segment(gf.uri, v); console.log(`  Segments: ${segs.length}`); } catch (e) { console.error(`  Seg fail: ${e.message}`); }
  if (gf?.name) await delFile(gf.name);
  if (!segs.length) { console.warn('  No segments — skip'); try { fs.unlinkSync(fp); } catch {} return []; }

  const pairs = []; const n = Math.min(segs.length, jsons.length);
  for (let i = 0; i < n; i++) pairs.push({ seg: segs[i], judge: jsons[i] });
  console.log(`  Matched: ${pairs.length} pairs`);
  await sleep(2000);

  const results = [];
  for (const { seg, judge } of pairs) {
    const cn = `${v.id}_r${seg.routine_number || judge.routine_number}.mp4`;
    const cp = path.join(CLIPS_DIR, cn);
    console.log(`\n  R${seg.routine_number} | ${seg.start_seconds}s–${seg.end_seconds}s | judge: ${judge.final_score}`);

    try { clip(fp, seg.start_seconds, seg.end_seconds, cp); console.log(`  Clip: ${cn} (${(fs.statSync(cp).size / 1e6).toFixed(1)}MB)`); }
    catch (e) { console.error(`  Clip fail: ${e.message}`); continue; }

    let cf = null;
    try {
      cf = await upload(cp); await waitFile(cf.name);
      console.log('  Pass 2: scoring...');
      const sc = await score(cf.uri, judge.level || v.level, v.event);
      const { rawExec, artistry } = computeRaw(sc);
      const total = +(rawExec + artistry).toFixed(3);
      const jd = +(10 - judge.final_score).toFixed(3);
      const ratio = jd > 0 ? +(total / jd).toFixed(3) : null;
      console.log(`  AI: exec=${rawExec} art=${artistry} total=${total} | judge ded: ${jd} | ratio: ${ratio}`);
      writeRow({ video_id: v.id, routine_number: seg.routine_number || judge.routine_number, event: normEv(v.event), level: judge.level || v.level, judge_final_score: judge.final_score, judge_deductions: jd, raw_ai_exec: rawExec, raw_ai_artistry: artistry, raw_ai_total: total, ratio, current_factor: CURRENT[normEv(v.event)] || 0.80, clip_file: cn, computed_at: new Date().toISOString() });
      results.push({ event: normEv(v.event), ratio, rawTotal: total, judgeDeductions: jd });
    } catch (e) { console.error(`  Score fail: ${e.message}`); }
    finally { if (cf?.name) await delFile(cf.name); await sleep(3000 + Math.floor(Math.random() * 2000)); }
  }

  try { fs.unlinkSync(fp); } catch {} done.add(v.id);
  return results;
}

async function main() {
  console.log('=== STRIVE Segment-and-Calibrate ===\n');
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.mkdirSync(CLIPS_DIR, { recursive: true });
  ensureCsv();

  let vids = [...VIDEOS];
  if (FILTER_EVENT) vids = vids.filter(v => normEv(v.event) === FILTER_EVENT);
  if (LIMIT > 0) vids = vids.slice(0, LIMIT);
  console.log(`Videos: ${vids.length}\n`);

  const done = new Set(), all = [];
  for (const v of vids) { try { all.push(...await processVideo(v, done)); } catch (e) { console.error(`Fatal ${v.id}: ${e.message}`); } await sleep(10000 + Math.floor(Math.random() * 5000)); }

  console.log('\n' + '═'.repeat(72));
  console.log('SEGMENT-AND-CALIBRATE RESULTS (Per-Routine)');
  console.log('═'.repeat(72));
  console.log(`Total pairs: ${all.length}\n`);
  const byEv = { floor: [], bars: [], beam: [], vault: [] };
  for (const r of all) { if (r.ratio && r.ratio > 0.05 && r.ratio < 50 && byEv[r.event]) byEv[r.event].push(r.ratio); }
  console.log('Event  | N    | Avg ratio | Empirical | Current | Action');
  console.log('-'.repeat(72));
  for (const ev of ['floor', 'bars', 'beam', 'vault']) {
    const rs = byEv[ev];
    if (!rs.length) { console.log(`${ev.padEnd(7)}| 0    | —         | —         | ${CURRENT[ev]}   | NO DATA`); continue; }
    const avg = rs.reduce((a, b) => a + b, 0) / rs.length;
    const emp = +(1 / avg).toFixed(3);
    const diff = Math.abs(emp - CURRENT[ev]);
    const act = diff < 0.05 ? 'HOLD' : diff < 0.15 ? 'REVIEW' : 'UPDATE';
    const conf = rs.length >= 20 ? 'HIGH' : rs.length >= 10 ? 'MED' : 'LOW';
    console.log(`${ev.padEnd(7)}| ${String(rs.length).padEnd(5)}| ${avg.toFixed(3).padEnd(10)}| ${emp.toFixed(3).padEnd(10)}| ${String(CURRENT[ev]).padEnd(8)}| ${act} [${conf}]`);
  }
  console.log(`\nCSV: ${OUTPUT_CSV}\nClips: ${CLIPS_DIR}`);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
