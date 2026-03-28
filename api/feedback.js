/**
 * api/feedback.js — User feedback collection endpoint (Vercel KV).
 *
 * Captures:
 *   - Skill correction flags ("this was actually a back walkover, not a back handspring")
 *   - Actual score reports ("the real judge score was 8.925")
 *   - Video quality ratings
 *
 * Storage: Vercel KV (Redis) — durable across cold starts and deployments.
 * Falls back to /tmp JSONL if KV is not configured.
 *
 * Actions:
 *   POST /api/feedback?action=flag     — Flag incorrect skill identification
 *   POST /api/feedback?action=score    — Report actual judge score
 *   GET  /api/feedback?action=list     — Retrieve all feedback (admin)
 *   GET  /api/feedback?action=stats    — Aggregated stats (admin)
 */

import fs from 'fs';
import path from 'path';

// ── CORS + Auth (same pattern as gemini.js) ──────────────────────────────────

const ALLOWED_ORIGINS = [
  'https://strive-app-amber.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001',
];

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (origin.match(/^https:\/\/strive-app.*\.vercel\.app$/)) return true;
  return false;
}

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Strive-Token');
  res.setHeader('Vary', 'Origin');
}

function validateAppToken(req) {
  if (!process.env.STRIVE_APP_TOKEN) return false;
  return req.headers['x-strive-token'] === process.env.STRIVE_APP_TOKEN;
}

// ── Vercel KV connection ─────────────────────────────────────────────────────

let kv = null;

async function getKV() {
  if (kv) return kv;
  try {
    const mod = await import('@vercel/kv');
    kv = mod.kv;
    return kv;
  } catch {
    return null;
  }
}

// ── Fallback: /tmp file storage ──────────────────────────────────────────────

const FALLBACK_DIR = process.env.VERCEL ? '/tmp' : path.join(process.cwd(), 'logs');
const FALLBACK_FILE = path.join(FALLBACK_DIR, 'feedback.jsonl');

function writeFallback(record) {
  try {
    if (!fs.existsSync(FALLBACK_DIR)) fs.mkdirSync(FALLBACK_DIR, { recursive: true });
    fs.appendFileSync(FALLBACK_FILE, JSON.stringify(record) + '\n', 'utf-8');
  } catch (e) {
    console.error('[feedback] Fallback write failed:', e.message);
  }
}

function readFallback() {
  try {
    if (!fs.existsSync(FALLBACK_FILE)) return [];
    return fs.readFileSync(FALLBACK_FILE, 'utf-8')
      .split('\n')
      .filter(l => l.trim())
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch { return []; }
}

// ── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!isAllowedOrigin(req.headers.origin)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (!validateAppToken(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const action = req.query?.action || req.body?.action;

  try {
    if (req.method === 'POST' && action === 'flag') {
      return await handleFlag(req, res);
    }
    if (req.method === 'POST' && action === 'score') {
      return await handleScore(req, res);
    }
    if (req.method === 'GET' && action === 'list') {
      return await handleList(req, res);
    }
    if (req.method === 'GET' && action === 'stats') {
      return await handleStats(req, res);
    }
    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (e) {
    console.error(`[feedback] ${action} error:`, e.message);
    return res.status(500).json({ error: e.message });
  }
}

// ── POST: Flag incorrect skill ───────────────────────────────────────────────

async function handleFlag(req, res) {
  const { analysis_id, skill_name, suggested_correction, timestamp_sec, video_id, event, level } = req.body;

  if (!skill_name || !suggested_correction) {
    return res.status(400).json({ error: 'skill_name and suggested_correction required' });
  }

  const record = {
    type: 'skill_flag',
    analysis_id: analysis_id || 'unknown',
    skill_name,
    suggested_correction: suggested_correction.substring(0, 500), // cap length
    timestamp_sec: timestamp_sec || 0,
    video_id: video_id || 'unknown',
    event: event || 'unknown',
    level: level || 'unknown',
    created_at: new Date().toISOString(),
  };

  const kvClient = await getKV();
  if (kvClient) {
    // Store in KV: append to a list, also maintain a counter per skill
    const key = `feedback:flags`;
    const existing = await kvClient.get(key) || [];
    existing.push(record);
    await kvClient.set(key, existing);

    // Track misidentification frequency per skill
    const countKey = `feedback:flag_count:${skill_name.toLowerCase().replace(/\s+/g, '_')}`;
    const count = (await kvClient.get(countKey)) || 0;
    await kvClient.set(countKey, count + 1);

    console.log(`[feedback] Flag stored in KV: "${skill_name}" → "${suggested_correction}"`);
  } else {
    writeFallback(record);
    console.log(`[feedback] Flag stored in fallback: "${skill_name}" → "${suggested_correction}"`);
  }

  return res.status(201).json({ ok: true, stored: !!kvClient ? 'kv' : 'fallback' });
}

// ── POST: Report actual judge score ──────────────────────────────────────────

async function handleScore(req, res) {
  const { analysis_id, ai_score, judge_score, event, level, video_id, skill_count } = req.body;

  if (typeof judge_score !== 'number' || judge_score < 0 || judge_score > 20) {
    return res.status(400).json({ error: 'judge_score required (number 0-20)' });
  }

  const record = {
    type: 'score_correction',
    analysis_id: analysis_id || 'unknown',
    ai_score: typeof ai_score === 'number' ? ai_score : null,
    judge_score,
    delta: typeof ai_score === 'number' ? Math.round((ai_score - judge_score) * 1000) / 1000 : null,
    event: event || 'unknown',
    level: level || 'unknown',
    video_id: video_id || 'unknown',
    skill_count: skill_count || null,
    created_at: new Date().toISOString(),
  };

  const kvClient = await getKV();
  if (kvClient) {
    const key = `feedback:scores`;
    const existing = await kvClient.get(key) || [];
    existing.push(record);
    await kvClient.set(key, existing);

    // Track per-event deltas for calibration
    if (record.delta !== null && record.event !== 'unknown') {
      const deltaKey = `feedback:delta:${record.event.toLowerCase()}`;
      const deltas = (await kvClient.get(deltaKey)) || [];
      deltas.push({ delta: record.delta, judge_score, ai_score, created_at: record.created_at });
      await kvClient.set(deltaKey, deltas);
    }

    console.log(`[feedback] Score stored in KV: AI=${ai_score} Judge=${judge_score} Delta=${record.delta}`);
  } else {
    writeFallback(record);
    console.log(`[feedback] Score stored in fallback: AI=${ai_score} Judge=${judge_score}`);
  }

  return res.status(201).json({ ok: true, delta: record.delta, stored: !!kvClient ? 'kv' : 'fallback' });
}

// ── GET: List all feedback ───────────────────────────────────────────────────

async function handleList(req, res) {
  const type = req.query?.type; // 'skill_flag' or 'score_correction'

  const kvClient = await getKV();
  let records = [];

  if (kvClient) {
    const flags = await kvClient.get('feedback:flags') || [];
    const scores = await kvClient.get('feedback:scores') || [];
    records = [...flags, ...scores];
  } else {
    records = readFallback();
  }

  if (type) {
    records = records.filter(r => r.type === type);
  }

  records.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return res.status(200).json({ records, count: records.length, source: kvClient ? 'kv' : 'fallback' });
}

// ── GET: Aggregated stats ────────────────────────────────────────────────────

async function handleStats(req, res) {
  const kvClient = await getKV();
  let flags = [];
  let scores = [];

  if (kvClient) {
    flags = await kvClient.get('feedback:flags') || [];
    scores = await kvClient.get('feedback:scores') || [];
  } else {
    const all = readFallback();
    flags = all.filter(r => r.type === 'skill_flag');
    scores = all.filter(r => r.type === 'score_correction');
  }

  // Most frequently flagged skills
  const flagCounts = {};
  for (const f of flags) {
    const key = f.skill_name || 'unknown';
    flagCounts[key] = (flagCounts[key] || 0) + 1;
  }
  const topFlagged = Object.entries(flagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([skill, count]) => ({ skill, count }));

  // Score delta stats per event
  const deltaByEvent = {};
  for (const s of scores) {
    if (s.delta == null || s.event === 'unknown') continue;
    const ev = s.event.toLowerCase();
    if (!deltaByEvent[ev]) deltaByEvent[ev] = [];
    deltaByEvent[ev].push(s.delta);
  }
  const eventStats = {};
  for (const [ev, deltas] of Object.entries(deltaByEvent)) {
    const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    eventStats[ev] = {
      count: deltas.length,
      mean_delta: Math.round(mean * 1000) / 1000,
      bias: mean > 0.05 ? 'scoring_high' : mean < -0.05 ? 'scoring_low' : 'neutral',
    };
  }

  return res.status(200).json({
    total_flags: flags.length,
    total_scores: scores.length,
    top_flagged_skills: topFlagged,
    score_delta_by_event: eventStats,
    source: kvClient ? 'kv' : 'fallback',
  });
}
