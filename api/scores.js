/**
 * api/scores.js — Training data collection endpoint.
 *
 * POST /api/scores — Append a scoring record to /tmp/training-data.jsonl
 * GET  /api/scores — Read back all records (for export/analysis)
 *
 * Each record: { videoId, event, level, aiScore, judgeScore, videoQualityRating, timestamp }
 *
 * Storage: JSONL file. On Vercel, /tmp is per-invocation ephemeral storage,
 * so we also support TRAINING_LOG_URL env var for a future webhook/Supabase migration.
 * For local dev (npm start), writes persist to /logs/training-data.jsonl.
 *
 * MIGRATION PATH: Replace fs writes with Supabase insert when ready.
 * The API contract (POST body, GET response) stays the same.
 */

import fs from "fs";
import path from "path";

// On Vercel serverless, /tmp is writable but ephemeral per cold start.
// For local dev, use project-root /logs/.
const LOG_DIR = process.env.VERCEL ? "/tmp" : path.join(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "training-data.jsonl");

function ensureLogDir() {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch {}
}

// ─── CORS + Auth (same pattern as gemini.js) ────────────────────────────────

const ALLOWED_ORIGINS = [
  "https://strive-app-amber.vercel.app",
  "http://localhost:3000",
  "http://localhost:3001",
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
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Strive-Token");
  res.setHeader("Vary", "Origin");
}

function validateAppToken(req, res) {
  if (!process.env.STRIVE_APP_TOKEN) {
    res.status(500).json({ error: "Server misconfigured" });
    return false;
  }
  return req.headers["x-strive-token"] === process.env.STRIVE_APP_TOKEN;
}

// ─── Validation ─────────────────────────────────────────────────────────────

const VALID_EVENTS = [
  "Vault", "Uneven Bars", "Balance Beam", "Floor Exercise",
  "High Bar", "Parallel Bars", "Rings", "Pommel Horse",
  // Accept Gemini-format event names (lowercase, abbreviated)
  "vault", "bars", "beam", "floor", "floor_exercise",
  "uneven_bars", "balance_beam", "high_bar", "parallel_bars",
  "rings", "pommel_horse",
];

function validateRecord(body) {
  const errors = [];

  if (!body.videoId || typeof body.videoId !== "string") {
    errors.push("videoId: required string");
  }
  if (!body.event || typeof body.event !== "string") {
    errors.push("event: required string");
  } else if (!VALID_EVENTS.some(v => v.toLowerCase() === body.event.toLowerCase())) {
    errors.push(`event: must be a valid gymnastics event, got '${body.event}'`);
  }
  if (!body.level || typeof body.level !== "string") {
    errors.push("level: required string");
  }
  if (typeof body.aiScore !== "number" || body.aiScore < 0 || body.aiScore > 20) {
    errors.push("aiScore: required number 0-20");
  }
  // judgeScore is optional (not always available at time of analysis)
  if (body.judgeScore !== undefined && body.judgeScore !== null) {
    if (typeof body.judgeScore !== "number" || body.judgeScore < 0 || body.judgeScore > 20) {
      errors.push("judgeScore: number 0-20 when provided");
    }
  }
  if (body.videoQualityRating !== undefined && body.videoQualityRating !== null) {
    if (typeof body.videoQualityRating !== "number" || body.videoQualityRating < 1 || body.videoQualityRating > 5) {
      errors.push("videoQualityRating: number 1-5 when provided");
    }
  }

  return errors;
}

// ─── Handler ────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();

  if (!isAllowedOrigin(req.headers.origin)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  if (!validateAppToken(req, res)) {
    if (!res.headersSent) return res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (req.method === "POST") {
    return handlePost(req, res);
  }
  if (req.method === "GET") {
    return handleGet(req, res);
  }

  return res.status(405).json({ error: "Method not allowed" });
}

// ─── POST: Append training record ───────────────────────────────────────────

async function handlePost(req, res) {
  const body = req.body || {};
  const errors = validateRecord(body);

  if (errors.length > 0) {
    return res.status(400).json({ error: "Validation failed", details: errors });
  }

  const record = {
    videoId: body.videoId,
    event: body.event,
    level: body.level,
    aiScore: body.aiScore,
    judgeScore: body.judgeScore ?? null,
    videoQualityRating: body.videoQualityRating ?? null,
    timestamp: new Date().toISOString(),
    // Extra context for future calibration
    promptVersion: body.promptVersion || null,
    calibrationFactor: body.calibrationFactor || null,
    rawExecution: body.rawExecution || null,
    scaledExecution: body.scaledExecution || null,
    skillCount: body.skillCount || null,
  };

  const line = JSON.stringify(record) + "\n";

  // Write to local file
  try {
    ensureLogDir();
    fs.appendFileSync(LOG_FILE, line, "utf-8");
  } catch (e) {
    console.error("[scores] File write failed:", e.message);
  }

  // Forward to webhook if configured (future Supabase/external DB)
  if (process.env.TRAINING_LOG_URL) {
    try {
      await fetch(process.env.TRAINING_LOG_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record),
      });
    } catch (e) {
      console.error("[scores] Webhook forward failed:", e.message);
    }
  }

  console.log(`[scores] Recorded: ${record.event} | AI: ${record.aiScore} | Judge: ${record.judgeScore}`);
  return res.status(201).json({ ok: true, record });
}

// ─── GET: Read back all records ─────────────────────────────────────────────

async function handleGet(req, res) {
  try {
    ensureLogDir();
    if (!fs.existsSync(LOG_FILE)) {
      return res.status(200).json({ records: [], count: 0 });
    }

    const raw = fs.readFileSync(LOG_FILE, "utf-8");
    const records = raw
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        try { return JSON.parse(line); }
        catch { return null; }
      })
      .filter(Boolean);

    return res.status(200).json({ records, count: records.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
