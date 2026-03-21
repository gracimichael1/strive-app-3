/**
 * test-v13.mjs — Test the v13 BHPA prompt through the actual /api/gemini proxy.
 *
 * Dynamically builds the prompt by importing from prompts.js via a CRA-compatible
 * transpile step, or falls back to running the dev server's /api/gemini.
 *
 * Usage: node --experimental-vm-modules scripts/test-v13.mjs  (requires dev server on :3000)
 */

import fs from "fs";
import path from "path";
import { Readable } from "stream";

const PROXY = "http://localhost:3000/api/gemini";
const TOKEN = "strive-2026-launch";

const VIDEOS = [
  { file: "differentvaultcomp.mov", event: "Vault", realScore: 8.85, level: "JO Level 6" },
  { file: "IMG_4061.MOV", event: "Uneven Bars", realScore: 8.525, level: "JO Level 6" },
  { file: "IMG_9884.MOV", event: "Balance Beam", realScore: 8.85, level: "JO Level 6" },
  { file: "IMG_5178 3.mov", event: "Floor Exercise", realScore: 8.925, level: "JO Level 6" },
];

async function api(body) {
  const r = await fetch(PROXY, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Strive-Token": TOKEN },
    body: JSON.stringify(body),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || `${r.status}`); }
  return r.json();
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function upload(filePath) {
  const stat = fs.statSync(filePath);
  const mime = filePath.toLowerCase().endsWith(".mov") ? "video/quicktime" : "video/mp4";
  console.log(`  Upload ${path.basename(filePath)} (${(stat.size / 1e6).toFixed(1)}MB)...`);

  const { uploadUrl } = await api({
    action: "initUpload",
    displayName: "test_v13_" + Date.now(),
    fileSize: stat.size,
    mimeType: mime,
  });

  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Command": "upload, finalize",
      "X-Goog-Upload-Offset": "0",
      "Content-Length": String(stat.size),
    },
    body: Readable.toWeb(fs.createReadStream(filePath)),
    duplex: "half",
  });
  if (!res.ok) throw new Error(`Upload ${res.status}`);

  const info = await res.json();
  const uri = info.file?.uri, name = info.file?.name;
  if (!uri) throw new Error("No URI");

  for (let i = 0; i < 60; i++) {
    await wait(3000);
    const { state } = await api({ action: "pollFile", fileName: name });
    if (state === "ACTIVE") return { fileUri: uri, fileName: name, mimeType: mime };
    if (state === "FAILED") throw new Error("Processing failed");
    process.stdout.write(".");
  }
  throw new Error("Timeout");
}

// ─── Build system prompt by reading prompts.js source and extracting components ──

function buildSystemPrompt(level, event, gender) {
  const src = fs.readFileSync(
    path.join(process.env.HOME, "Desktop/StriveGymnastics/src/engine/prompts.js"),
    "utf-8"
  );

  // Extract CORE_JUDGE_INSTRUCTION
  const coreMatch = src.match(/const CORE_JUDGE_INSTRUCTION = `([\s\S]*?)`;/);
  if (!coreMatch) throw new Error("Could not extract CORE_JUDGE_INSTRUCTION");
  const core = coreMatch[1];

  // Extract level rules
  const levelKey = level.toUpperCase().replace(/\s+/g, "_");
  const levelPattern = new RegExp(`${levelKey}: \`([\\s\\S]*?)\``, "m");
  const levelMatch = src.match(levelPattern);
  const levelRules = levelMatch ? levelMatch[1] : "";

  // Extract event rules
  const eventMap = { "Uneven Bars": "BARS", "Floor Exercise": "FLOOR", "Balance Beam": "BEAM", "Vault": "VAULT" };
  const eventKey = eventMap[event] || "";
  const eventPattern = new RegExp(`${eventKey}: \`([\\s\\S]*?)\``, "m");
  const eventMatch = eventKey ? src.match(eventPattern) : null;
  const eventRules = eventMatch ? eventMatch[1] : "";

  // Extract calibration block
  const calMatch = src.match(/## CALIBRATION — CRITICAL[\s\S]*?Add any missed deductions to your final JSON\.\n\n## FINAL SANITY CHECK[\s\S]*?what a real judge panel would award\./);
  const calibration = calMatch ? calMatch[0] : "";

  const genderFull = gender === "MAG" ? "Men's Artistic Gymnastics" : "Women's Artistic Gymnastics";

  return [
    core,
    `\n## GENDER: ${gender} (${genderFull}). Apply ${gender} Code of Points.\n`,
    levelRules,
    eventRules,
    calibration,
  ].join("\n");
}

function buildUserPrompt(level, event, gender) {
  return `Analyze this ${level} ${event} routine. Athlete: the gymnast, ${gender}.

You are strictly forbidden from giving "benefit of the doubt." Focus on micro-deductions: toe point, knee tension, chest placement on landings, and artistry. If the form is not "picture perfect," the deduction must be taken.

For every skill: name it, note the exact timestamp when it begins and ends (in seconds from video start), list every deduction with the specific body part and position, and estimate its difficulty value.

Celebrate the good and perfect skills as well. Provide a coaching summary with the top 3 fixes.`;
}

// Use the exact PASS1_CONFIG
const CONFIG = {
  temperature: 0.4,
  topP: 0.95,
  maxOutputTokens: 16384,
  responseMimeType: "application/json",
  thinkingConfig: { thinkingBudget: 8192 },
  responseSchema: {
    type: "object",
    properties: {
      athlete_name: { type: "string" },
      level: { type: "string" },
      event: { type: "string" },
      gender: { type: "string" },
      start_value: { type: "number" },
      duration_seconds: { type: "number" },
      special_requirements: {
        type: "array",
        items: {
          type: "object",
          properties: {
            requirement: { type: "string" },
            status: { type: "string", enum: ["MET", "NOT_MET"] },
            comment: { type: "string" },
            penalty: { type: "number" },
          },
          required: ["requirement", "status", "comment", "penalty"],
        },
      },
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
            deductions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: { type: "string" },
                  body_part: { type: "string" },
                  description: { type: "string" },
                  point_value: { type: "number" },
                },
                required: ["type", "body_part", "description", "point_value"],
              },
            },
            quality_grade: { type: "number" },
            reason: { type: "string" },
            rule_reference: { type: "string" },
            is_celebration: { type: "boolean" },
            strength_note: { type: "string" },
          },
          required: [
            "skill_name", "skill_order", "timestamp_start", "timestamp_end",
            "executed_successfully", "difficulty_value", "total_deduction",
            "deductions", "quality_grade", "reason", "is_celebration",
          ],
        },
      },
      artistry: {
        type: "object",
        properties: {
          expression_deduction: { type: "number" },
          quality_of_movement_deduction: { type: "number" },
          choreography_variety_deduction: { type: "number" },
          musicality_deduction: { type: "number" },
          total_artistry_deduction: { type: "number" },
          notes: { type: "string" },
        },
        required: [
          "expression_deduction", "quality_of_movement_deduction",
          "choreography_variety_deduction", "musicality_deduction",
          "total_artistry_deduction", "notes",
        ],
      },
      total_execution_deductions: { type: "number" },
      total_artistry_deductions: { type: "number" },
      final_score: { type: "number" },
      score_range: {
        type: "object",
        properties: { low: { type: "number" }, high: { type: "number" } },
        required: ["low", "high"],
      },
      confidence: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
      coaching_summary: { type: "string" },
      top_3_fixes: { type: "array", items: { type: "string" } },
      celebrations: { type: "array", items: { type: "string" } },
    },
    required: [
      "start_value", "final_score", "deduction_log", "special_requirements",
      "artistry", "total_execution_deductions", "total_artistry_deductions",
      "score_range", "confidence", "coaching_summary", "top_3_fixes", "celebrations",
    ],
  },
};

// ─── Run ────────────────────────────────────────────────────────────────────

async function run(v) {
  const fp = path.join(process.env.HOME, "Desktop", "videos", v.file);
  if (!fs.existsSync(fp)) { console.error(`Video not found: ${fp}`); return null; }

  const systemPrompt = buildSystemPrompt(v.level, v.event, "WAG");
  const userPrompt = buildUserPrompt(v.level, v.event, "WAG");

  console.log(`\n${"═".repeat(60)}`);
  console.log(`${v.event} | Judge: ${v.realScore} | System prompt: ${systemPrompt.length} chars`);
  console.log(`${"═".repeat(60)}`);

  const t0 = Date.now();
  const f = await upload(fp);
  console.log("\n  Analyzing with v13 BHPA prompt...\n");

  const { text } = await api({
    action: "generate",
    fileUri: f.fileUri,
    mimeType: f.mimeType,
    systemPrompt,
    userPrompt,
    config: CONFIG,
  });

  let sc;
  try { sc = JSON.parse(text); } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) sc = JSON.parse(match[0]);
    else { console.error("JSON parse failed. Raw:", text.substring(0, 500)); return null; }
  }

  // ── Code-computed calibrated score (replicates scoring.js logic) ────────
  const EVENT_CALIBRATION = {
    VAULT: 1.35, BARS: 0.85, BEAM: 0.70, FLOOR: 0.70,
  };
  function getCalFactor(evt) {
    const e = (evt || "").toUpperCase();
    if (/VAULT/.test(e)) return EVENT_CALIBRATION.VAULT;
    if (/BAR/.test(e)) return EVENT_CALIBRATION.BARS;
    if (/BEAM/.test(e)) return EVENT_CALIBRATION.BEAM;
    if (/FLOOR/.test(e)) return EVENT_CALIBRATION.FLOOR;
    return 0.80;
  }
  function snapUSAG(n) {
    return Math.round(Math.abs(n) * 20) / 20;
  }

  const calFactor = getCalFactor(v.event);
  let rawExec = 0;
  for (const entry of (sc.deduction_log || [])) {
    if (Array.isArray(entry.deductions) && entry.deductions.length > 0) {
      for (const d of entry.deductions) rawExec += snapUSAG(d.point_value || 0);
    } else {
      rawExec += snapUSAG(entry.total_deduction || 0);
    }
  }
  const rawArt = Math.abs(sc.artistry?.total_artistry_deduction || 0);
  const srPenalty = (sc.special_requirements || []).reduce((s, r) => s + Math.abs(r.penalty || 0), 0);
  const scaledExec = Math.round(rawExec * calFactor * 1000) / 1000;
  const scaledArt = Math.round(rawArt * calFactor * 1000) / 1000;
  const codeScore = Math.round((10.0 - scaledExec - scaledArt - srPenalty) * 1000) / 1000;

  const ai = sc.final_score;
  const aiDelta = Math.abs(ai - v.realScore);
  const codeDelta = Math.abs(codeScore - v.realScore);
  const pass = codeDelta <= 0.10;
  const elapsed = ((Date.now() - t0) / 1000).toFixed(0);

  console.log("SKILLS:");
  for (const s of (sc.deduction_log || [])) {
    const star = s.is_celebration ? " ★" : "";
    const deds = (s.deductions || []).map(d => `${d.type} (${d.body_part}): -${d.point_value}`).join(", ");
    console.log(`  ${s.skill_order}. ${s.skill_name} [${s.timestamp_start}s-${s.timestamp_end}s] ded=-${s.total_deduction}${star}`);
    if (deds) console.log(`     ${deds}`);
    if (s.strength_note) console.log(`     ✦ ${s.strength_note}`);
  }

  console.log(`\nRaw Exec: -${rawExec.toFixed(3)} | Raw Art: -${rawArt} | SR: -${srPenalty}`);
  console.log(`Calibration: ×${calFactor} → Scaled Exec: -${scaledExec.toFixed(3)} | Scaled Art: -${scaledArt.toFixed(3)}`);
  console.log(`Score range: ${sc.score_range?.low} - ${sc.score_range?.high}`);

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  AI raw:  ${ai}     |  Judge: ${v.realScore}  |  Δ ${aiDelta.toFixed(3)}`);
  console.log(`  Code:    ${codeScore.toFixed(2)}   |  Judge: ${v.realScore}  |  Δ ${codeDelta.toFixed(3)} ${pass ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`  Cal: ×${calFactor}  |  Skills: ${sc.deduction_log?.length}  |  ${elapsed}s`);
  console.log("═".repeat(60));

  try { await api({ action: "deleteFile", fileName: f.fileName }); } catch {}
  const outPath = path.join(process.env.HOME, "Desktop/StriveGymnastics/scripts", `debug-v13-${v.event.replace(/\s/g, "_").toLowerCase()}.json`);
  fs.writeFileSync(outPath, JSON.stringify({ ...sc, _code_score: codeScore, _cal_factor: calFactor, _raw_exec: rawExec, _scaled_exec: scaledExec }, null, 2));
  console.log(`Full JSON: ${outPath}`);

  return { event: v.event, ai, code: codeScore, real: v.realScore, aiDelta, codeDelta, pass };
}

async function main() {
  console.log("STRIVE — v13 BHPA Prompt Test (All 4 Events)\n");
  const results = [];
  for (const v of VIDEOS) {
    try {
      const r = await run(v);
      if (r) results.push(r);
    } catch (e) {
      console.error(`  ❌ ${v.event}: ${e.message}`);
      results.push({ event: v.event, ai: null, real: v.realScore, delta: null, pass: false });
    }
  }

  // Summary table
  console.log(`\n\n${"═".repeat(60)}`);
  console.log("SUMMARY — v13 BHPA Prompt");
  console.log("═".repeat(60));
  console.log(`${"Event".padEnd(18)} ${"AI Raw".padEnd(8)} ${"Code".padEnd(8)} ${"Judge".padEnd(8)} ${"AI Δ".padEnd(8)} ${"Code Δ".padEnd(8)} Result`);
  console.log("-".repeat(70));
  let passCount = 0;
  for (const r of results) {
    const ai = r.ai != null ? r.ai.toFixed(2) : "ERR";
    const code = r.code != null ? r.code.toFixed(2) : "ERR";
    const ad = r.aiDelta != null ? r.aiDelta.toFixed(3) : "N/A";
    const cd = r.codeDelta != null ? r.codeDelta.toFixed(3) : "N/A";
    console.log(`${r.event.padEnd(18)} ${ai.padEnd(8)} ${code.padEnd(8)} ${r.real.toFixed(3).padEnd(8)} ${ad.padEnd(8)} ${cd.padEnd(8)} ${r.pass ? "✅" : "❌"}`);
    if (r.pass) passCount++;
  }
  const valid = results.filter(r => r.codeDelta != null);
  const avgAiDelta = valid.length > 0 ? (valid.reduce((s, r) => s + r.aiDelta, 0) / valid.length) : 0;
  const avgCodeDelta = valid.length > 0 ? (valid.reduce((s, r) => s + r.codeDelta, 0) / valid.length) : 0;
  console.log("-".repeat(70));
  console.log(`${passCount}/${results.length} pass | avg AI Δ ${avgAiDelta.toFixed(3)} | avg Code Δ ${avgCodeDelta.toFixed(3)}`);
  console.log("═".repeat(70));
}

main().catch(e => { console.error(e); process.exit(1); });
