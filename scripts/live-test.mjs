/**
 * live-test.mjs — v15 prompt accuracy validation.
 *
 * Calls Gemini directly with the v15 prompt schema and applies calibration
 * factors to validate scoring accuracy against known judge scores.
 *
 * Run: node scripts/live-test.mjs
 * Requires: GEMINI_API_KEY in .env.local, video files in ~/Desktop/videos/
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ── Load .env.local ──────────────────────────────────────────────────────────
const envPath = path.join(ROOT, ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
    if (match) process.env[match[1]] = match[2].trim();
  }
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY not found in .env.local");
  process.exit(1);
}

// ── Calibration factors (must match src/engine/scoring.js exactly) ───────────
const CALIBRATION = {
  vault: 0.75, bars: 0.85, beam: 0.91, floor: 0.92,
};

function getCalibrationFactor(event) {
  const e = (event || "").toLowerCase();
  if (/vault/i.test(e)) return CALIBRATION.vault;
  if (/bar/i.test(e)) return CALIBRATION.bars;
  if (/beam/i.test(e)) return CALIBRATION.beam;
  if (/floor/i.test(e)) return CALIBRATION.floor;
  return 0.80;
}

// ── Test cases ───────────────────────────────────────────────────────────────
const VIDEOS_DIR = path.join(process.env.HOME, "Desktop", "videos");

const TEST_CASES = [
  { file: "differentvaultcomp.mov", event: "Vault",          realScore: 8.85,  level: "Level 6", levelCategory: "optional" },
  { file: "IMG_4061.MOV",          event: "Uneven Bars",     realScore: 8.525, level: "Level 6", levelCategory: "optional" },
  { file: "IMG_9884.MOV",          event: "Balance Beam",    realScore: 8.85,  level: "Level 6", levelCategory: "optional" },
  { file: "IMG_5178 3.mov",        event: "Floor Exercise",  realScore: 8.925, level: "Level 6", levelCategory: "optional" },
];

const BASELINE = { vault: 0.2924, floor: 0.3635, beam: 0.3756, bars: 0.4604 };
const MODEL = "gemini-2.5-flash";
const API_BASE = "https://generativelanguage.googleapis.com";

// ── Read v15 PASS1_CONFIG responseSchema from prompts.js (text extraction) ──
// Instead of importing CRA modules, we read the schema from the compiled config.
// The schema is the critical piece — it tells Gemini what JSON shape to return.
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    athlete_name: { type: "string" },
    level: { type: "string" },
    event: { type: "string" },
    gender: { type: "string" },
    start_value: { type: "number" },
    duration_seconds: { type: "number" },
    special_requirements: { type: "array", items: { type: "object", properties: { requirement: { type: "string" }, status: { type: "string", enum: ["MET", "NOT_MET"] }, comment: { type: "string" }, penalty: { type: "number" } }, required: ["requirement", "status", "comment", "penalty"] } },
    deduction_log: {
      type: "array",
      items: {
        type: "object",
        properties: {
          skill_name: { type: "string" },
          skill_order: { type: "number" },
          timestamp_start: { type: "number" },
          timestamp_end: { type: "number" },
          executed_successfully: { type: "boolean" },
          difficulty_value: { type: "number" },
          total_deduction: { type: "number" },
          deductions: { type: "array", items: { type: "object", properties: { type: { type: "string" }, body_part: { type: "string" }, description: { type: "string" }, point_value: { type: "number" } }, required: ["type", "description", "point_value"] } },
          quality_grade: { type: "number" },
          reason: { type: "string" },
          is_celebration: { type: "boolean" },
          fall_detected: { type: "boolean" },
          narrative: { type: "string" },
          injury_signal: { type: "string" },
          skill_confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["skill_name", "total_deduction", "deductions", "fall_detected", "narrative", "injury_signal", "skill_confidence"],
      },
    },
    artistry: { type: "object", properties: { expression_deduction: { type: "number" }, quality_of_movement_deduction: { type: "number" }, choreography_variety_deduction: { type: "number" }, musicality_deduction: { type: "number" }, total_artistry_deduction: { type: "number" }, notes: { type: "string" } }, required: ["total_artistry_deduction", "notes"] },
    total_execution_deductions: { type: "number" },
    total_artistry_deductions: { type: "number" },
    final_score: { type: "number" },
    score_range: { type: "object", properties: { low: { type: "number" }, high: { type: "number" } }, required: ["low", "high"] },
    confidence: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
    coaching_summary: { type: "string" },
    top_3_fixes: { type: "array", items: { type: "string" } },
    celebrations: { type: "array", items: { type: "string" } },
    primary_athlete_confidence: { type: "string", enum: ["high", "medium", "low"] },
    sv_verified: { type: "boolean" },
  },
  required: ["start_value", "final_score", "deduction_log", "coaching_summary", "primary_athlete_confidence", "sv_verified"],
};

// ── Read v15 system prompt from prompts.js source file ──────────────────────
// We extract the CORE_JUDGE_INSTRUCTION + calibration block by reading the source.
// This ensures the test uses the exact same prompt as production.
function readV15SystemPrompt() {
  const src = fs.readFileSync(path.join(ROOT, "src/engine/prompts.js"), "utf-8");
  // Extract CORE_JUDGE_INSTRUCTION (backtick template between first ` and the closing `;)
  const coreMatch = src.match(/const CORE_JUDGE_INSTRUCTION = `([\s\S]*?)`;/);
  return coreMatch ? coreMatch[1] : "";
}

function buildSystemPrompt(level, event) {
  const core = readV15SystemPrompt();
  // Read the full prompts.js source for level rules and event rules
  const src = fs.readFileSync(path.join(ROOT, "src/engine/prompts.js"), "utf-8");

  // Extract event-specific rules
  const eventKey = /vault/i.test(event) ? "VAULT" : /bar/i.test(event) ? "BARS" : /beam/i.test(event) ? "BEAM" : /floor/i.test(event) ? "FLOOR" : null;
  let eventRules = "";
  if (eventKey) {
    const regex = new RegExp(`${eventKey}: \`([\\s\\S]*?)\`,`, "m");
    const match = src.match(regex);
    if (match) eventRules = match[1];
  }

  // Extract calibration block (everything between ## CALIBRATION and the closing backtick of parts.push)
  const calMatch = src.match(/## CALIBRATION[\s\S]*?## FINAL SANITY CHECK[\s\S]*?adjust your deductions to match what a real judge panel would award\./);
  const calibration = calMatch ? calMatch[0] : "";

  return [core, `\n## GENDER: WAG (Women's Artistic Gymnastics). Apply WAG scoring framework.\n`, `## LEVEL: ${level}\nStart Value: 10.0\n`, eventRules, calibration].join("\n");
}

function buildUserPrompt(level, event) {
  return `Analyze this ${level} ${event} routine. Athlete: Test Athlete, WAG.

You are strictly forbidden from giving "benefit of the doubt." Focus on micro-deductions: toe point, knee tension, chest placement on landings, and artistry. If the form is not "picture perfect," the deduction must be taken.

For every skill: name it, note the exact timestamp when it begins and ends (in seconds from video start), list every deduction with the specific body part and position, and estimate its difficulty value.

Celebrate the good and perfect skills as well. Provide a coaching summary with the top 3 fixes. End the coaching_summary with one sentence giving the judge's holistic competitive perspective, formatted: "From a judging standpoint, [specific observation about what defined this routine competitively]."`;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

function snapToUSAG(val) {
  if (typeof val !== "number" || isNaN(val)) return 0;
  const abs = Math.abs(val);
  if (abs >= 0.40) return 0.50;
  return Math.round(abs * 20) / 20;
}

function computeCalibratedScore(scorecard, event) {
  const factor = getCalibrationFactor(event);
  const startValue = scorecard.start_value || 10.0;
  const deductionLog = scorecard.deduction_log || [];

  // Sum execution deductions with 0.30/skill cap (falls exempt)
  let executionTotal = 0;
  for (const entry of deductionLog) {
    let skillTotal = 0;
    if (Array.isArray(entry.deductions) && entry.deductions.length > 0) {
      for (const d of entry.deductions) skillTotal += snapToUSAG(Math.abs(d.point_value || 0));
    } else {
      skillTotal = snapToUSAG(Math.abs(entry.total_deduction || 0));
    }
    const hasFall = skillTotal >= 0.50 || (entry.deductions || []).some(d => /fall/i.test(d.type || "") || /fall/i.test(d.description || ""));
    if (skillTotal > 0.30 && !hasFall) skillTotal = 0.30;
    executionTotal += skillTotal;
  }

  // Artistry
  const artistryTotal = Math.abs(scorecard.artistry?.total_artistry_deduction || 0);

  // Apply calibration
  const calibratedExec = +(executionTotal * factor).toFixed(3);
  const calibratedArt = +(artistryTotal * factor).toFixed(3);
  const totalDed = calibratedExec + calibratedArt;
  const codeScore = Math.max(0, +(startValue - totalDed).toFixed(3));

  // Blend: trust AI holistic if within 0.30 of code
  const aiScore = scorecard.final_score;
  if (typeof aiScore === "number" && aiScore > 0 && Math.abs(codeScore - aiScore) <= 0.30) {
    return { finalScore: aiScore, source: "ai_holistic", codeScore, factor };
  }
  return { finalScore: codeScore, source: "code_override", codeScore, factor };
}

// ── Gemini File API ─────────────────────────────────────────────────────────

async function uploadFile(filePath) {
  const stat = fs.statSync(filePath);
  const mime = filePath.toLowerCase().endsWith(".mov") ? "video/quicktime" : "video/mp4";
  console.log(`  Uploading ${path.basename(filePath)} (${(stat.size / 1e6).toFixed(1)}MB)...`);

  const initRes = await fetch(`${API_BASE}/upload/v1beta/files?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable", "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(stat.size),
      "X-Goog-Upload-Header-Content-Type": mime, "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { displayName: "test_" + Date.now() } }),
  });
  if (!initRes.ok) throw new Error(`Upload init failed (${initRes.status})`);
  const uploadUrl = initRes.headers.get("X-Goog-Upload-URL") || initRes.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("No upload URL");

  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: { "X-Goog-Upload-Command": "upload, finalize", "X-Goog-Upload-Offset": "0", "Content-Length": String(stat.size) },
    body: fs.readFileSync(filePath),
  });
  if (!uploadRes.ok) throw new Error(`Upload failed (${uploadRes.status})`);
  const data = await uploadRes.json();
  const fileUri = data.file?.uri, fileName = data.file?.name;
  if (!fileUri) throw new Error("No fileUri");

  console.log("  Waiting for processing...");
  for (let i = 0; i < 30; i++) {
    await wait(2000);
    const poll = await fetch(`${API_BASE}/v1beta/${fileName}?key=${GEMINI_API_KEY}`);
    if (poll.ok) {
      const pd = await poll.json();
      if (pd.state === "ACTIVE") { console.log("  File ready."); return { fileUri, fileName, mimeType: mime }; }
      if (pd.state === "FAILED") throw new Error("Processing failed");
    }
    process.stdout.write(".");
  }
  throw new Error("Processing timeout");
}

async function deleteFile(fn) { try { await fetch(`${API_BASE}/v1beta/${fn}?key=${GEMINI_API_KEY}`, { method: "DELETE" }); } catch {} }

// ── Call Gemini ─────────────────────────────────────────────────────────────

async function callGemini(fileUri, mimeType, systemPrompt, userPrompt) {
  const body = {
    contents: [{ parts: [{ file_data: { file_uri: fileUri, mime_type: mimeType } }, { text: userPrompt }] }],
    generationConfig: { temperature: 0, topP: 0.95, maxOutputTokens: 16384, responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
    systemInstruction: { parts: [{ text: systemPrompt }] },
    thinkingConfig: { thinkingBudget: 8192 },
  };

  const res = await fetch(`${API_BASE}/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });

  if (!res.ok) {
    if (res.status === 400) {
      // Retry without thinkingConfig
      delete body.thinkingConfig;
      const r2 = await fetch(`${API_BASE}/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!r2.ok) throw new Error(`Gemini retry failed (${r2.status})`);
      return extractJSON(await r2.json());
    }
    throw new Error(`Gemini failed (${res.status}): ${(await res.text()).substring(0, 200)}`);
  }
  return extractJSON(await res.json());
}

function extractJSON(data) {
  const parts = data.candidates?.[0]?.content?.parts || [];
  const text = parts.filter(p => p.text && !p.thought).map(p => p.text).join("\n")
    || parts.map(p => p.text || "").join("\n");
  const i = text.indexOf("{"), j = text.lastIndexOf("}");
  return (i !== -1 && j > i) ? text.slice(i, j + 1) : text;
}

// ── Run one test ────────────────────────────────────────────────────────────

async function runTest(tc) {
  const fp = path.join(VIDEOS_DIR, tc.file);
  if (!fs.existsSync(fp)) {
    console.log(`  SKIPPED: ${tc.file} not found`);
    return { event: tc.event, level: tc.level, ai: null, judge: tc.realScore, delta: null, pass: false, status: "SKIPPED" };
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(`${tc.event} | ${tc.level} | Judge: ${tc.realScore}`);
  console.log("═".repeat(60));
  const t0 = Date.now();

  let file;
  try { file = await uploadFile(fp); } catch (e) {
    console.log(`  Upload failed: ${e.message}. Retry in 5s...`);
    await wait(5000);
    try { file = await uploadFile(fp); } catch (e2) {
      return { event: tc.event, level: tc.level, ai: null, judge: tc.realScore, delta: null, pass: false, status: "UPLOAD_FAIL" };
    }
  }

  const sys = buildSystemPrompt(tc.level, tc.event);
  const usr = buildUserPrompt(tc.level, tc.event);
  console.log(`  v15 prompt: ${sys.length} char system, ${usr.length} char user`);

  let rawText;
  try { rawText = await callGemini(file.fileUri, file.mimeType, sys, usr); } catch (e) {
    console.error(`  Gemini failed: ${e.message}`);
    await deleteFile(file.fileName);
    return { event: tc.event, level: tc.level, ai: null, judge: tc.realScore, delta: null, pass: false, status: "GEMINI_FAIL" };
  }

  let sc;
  try { sc = JSON.parse(rawText); } catch {
    console.error(`  Parse failed. Raw: ${rawText?.substring(0, 200)}`);
    fs.writeFileSync(path.join(__dirname, `debug-${tc.event.replace(/\s/g, "_").toLowerCase()}.json`), rawText || "EMPTY");
    await deleteFile(file.fileName);
    return { event: tc.event, level: tc.level, ai: null, judge: tc.realScore, delta: null, pass: false, status: "PARSE_FAIL" };
  }

  const scoring = computeCalibratedScore(sc, tc.event);
  const delta = Math.abs(scoring.finalScore - tc.realScore);
  const pass = delta <= 0.20;

  const skills = sc.deduction_log || [];
  console.log(`  Skills: ${skills.length}`);
  for (const s of skills.slice(0, 8)) {
    console.log(`    ${s.skill_name || "?"} ${s.total_deduction > 0 ? `[-${s.total_deduction.toFixed(2)}]` : "[clean]"}`);
  }
  console.log(`  Gemini holistic: ${sc.final_score} | Calibrated: ${scoring.finalScore.toFixed(3)} (${scoring.source}, factor ${scoring.factor})`);
  console.log(`  AI: ${scoring.finalScore.toFixed(3)}  |  Judge: ${tc.realScore}  |  Δ ${delta.toFixed(3)} ${pass ? "✅" : "❌"}  |  ${((Date.now() - t0) / 1000).toFixed(0)}s`);

  fs.writeFileSync(path.join(__dirname, `debug-${tc.event.replace(/\s/g, "_").toLowerCase()}.json`), JSON.stringify(sc, null, 2));
  await deleteFile(file.fileName);

  return { event: tc.event, level: tc.level, ai: scoring.finalScore, judge: tc.realScore, delta, pass, status: "OK", source: scoring.source, factor: scoring.factor };
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("STRIVE — v15 Prompt Accuracy Validation\n");
  console.log(`Model: ${MODEL} | Temperature: 0 | Calibrated scoring`);
  console.log(`Videos dir: ${VIDEOS_DIR}`);
  console.log(`Videos found: ${fs.existsSync(VIDEOS_DIR) ? fs.readdirSync(VIDEOS_DIR).length : 0}\n`);

  const results = [];
  for (const tc of TEST_CASES) {
    try { results.push(await runTest(tc)); } catch (e) {
      console.error(`  ❌ ${tc.event}: ${e.message}`);
      results.push({ event: tc.event, level: tc.level, ai: null, judge: tc.realScore, delta: null, pass: false, status: "ERROR" });
    }
    await wait(3000);
  }

  console.log(`\n${"═".repeat(70)}`);
  console.log(`${"Event".padEnd(18)} ${"Level".padEnd(10)} ${"AI".padEnd(8)} ${"Judge".padEnd(8)} ${"Delta".padEnd(8)} Result`);
  console.log("-".repeat(70));
  let passCount = 0;
  for (const r of results) {
    const ai = r.ai != null ? r.ai.toFixed(3) : r.status;
    const d = r.delta != null ? r.delta.toFixed(3) : "N/A";
    console.log(`${r.event.padEnd(18)} ${r.level.padEnd(10)} ${ai.padEnd(8)} ${r.judge.toFixed(3).padEnd(8)} ${d.padEnd(8)} ${r.pass ? "✅" : r.status === "SKIPPED" ? "⏭" : "❌"}`);
    if (r.pass) passCount++;
  }
  const valid = results.filter(r => r.delta != null);
  const avgDelta = valid.length > 0 ? valid.reduce((s, r) => s + r.delta, 0) / valid.length : null;
  console.log("-".repeat(70));
  console.log(`${passCount}/${results.length} pass (≤0.20) | avg Δ ${avgDelta != null ? avgDelta.toFixed(3) : "N/A"}`);
  console.log(`Baseline: vault ${BASELINE.vault} | floor ${BASELINE.floor} | beam ${BASELINE.beam} | bars ${BASELINE.bars}`);

  fs.writeFileSync(path.join(__dirname, "v15-delta-report.json"), JSON.stringify({
    timestamp: new Date().toISOString(), model: MODEL, promptVersion: "v15_ip_compliant",
    scoringVersion: "2.0", results, avgDelta, passRate: results.length > 0 ? passCount / results.length : 0,
    preSprintBaseline: BASELINE,
  }, null, 2));
  console.log(`\nReport: scripts/v15-delta-report.json`);
}

main().catch(e => { console.error(e); process.exit(1); });
