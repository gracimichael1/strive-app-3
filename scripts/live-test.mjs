/**
 * live-test.mjs — Gemini Bible framework, verbatim.
 *
 * System instruction + user prompt + response schema = exactly what the doc prescribed.
 * No extra engineering. Just cue it.
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
  const r = await fetch(PROXY, { method: "POST", headers: { "Content-Type": "application/json", "X-Strive-Token": TOKEN }, body: JSON.stringify(body) });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || `${r.status}`); }
  return r.json();
}
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function upload(filePath) {
  const stat = fs.statSync(filePath);
  const mime = filePath.toLowerCase().endsWith(".mov") ? "video/quicktime" : "video/mp4";
  console.log(`  Upload ${path.basename(filePath)} (${(stat.size/1e6).toFixed(1)}MB)...`);
  const { uploadUrl } = await api({ action: "initUpload", displayName: "test_" + Date.now(), fileSize: stat.size, mimeType: mime });
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: { "X-Goog-Upload-Command": "upload, finalize", "X-Goog-Upload-Offset": "0", "Content-Length": String(stat.size) },
    body: Readable.toWeb(fs.createReadStream(filePath)), duplex: "half",
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

// ─── THE GEMINI BIBLE FRAMEWORK (verbatim from the doc) ─────────────────────

// Doc Section: "The System Instruction (The Official's Brain)"
const SYSTEM_INSTRUCTION = `## ROLE
You are an Elite FIG/USAG Certified Judge specialized in all JO levels and Xcel divisions.
Your goal is to provide a "Cold, Hard Truth" analysis.
You are highly skeptical, detail-oriented, and hunt for deductions.

## JUDGING ALGORITHM (PESSIMISTIC MODEL)
1. START VALUE (SV): Always begin at 10.0.
2. DEDUCTION BIAS: If an angle or position is ambiguous, assume the maximum deduction.
3. COMPOUNDING: If a skill is technically poor (e.g., low cast), apply a secondary "Rhythm/Flow" deduction to the following skill.
4. AMPLITUDE:
   - BARS: Cast must reach horizontal. If below, deduct 0.10-0.30.
   - FLOOR/BEAM: Split leaps must reach 150°+. Deduct 0.10 for insufficient.

## OUTPUT REQUIREMENTS
You MUST respond strictly in JSON format. Do not include conversational text.`;

function userPrompt(event, level) {
  return `Analyze this ${level} ${event} routine as a Brevet-level USAG Official at a State Championship.
You are strictly forbidden from giving "benefit of the doubt."
Focus on micro-deductions: toe point, knee tension, chest placement on landings, and artistry.
If the form is not "picture perfect," the deduction must be taken.

For every skill you identify, name it, timestamp it, and grade it 1.00-10.00 (0.05 increments).
For every skill that doesn't get a 10, describe the primary deduction in text.
Celebrate the good and perfect skills as well (is_celebration=true, strength_note).

A tumbling pass (e.g. Round-off BHS Back Tuck) is ONE skill entry, not multiple.

Your final_score should be your holistic estimate of what this routine would receive at a State Championship — the score a real panel of judges would give. ${level} State scores typically range 8.5-9.2 for routines completed without falls.`;
}

// Schema: quality_grade per skill (holistic) + text deductions (not numeric)
// final_score is Gemini's holistic State Championship estimate, NOT a mechanical sum
const CONFIG = {
  temperature: 0.1,
  maxOutputTokens: 16384,
  thinkingConfig: { thinkingBudget: 4096 },
  responseMimeType: "application/json",
  responseSchema: {
    type: "object",
    properties: {
      start_value: { type: "number" },
      skills: {
        type: "array",
        items: {
          type: "object",
          properties: {
            timestamp: { type: "string" },
            skill_name: { type: "string" },
            quality_grade: { type: "number" },
            primary_deduction: { type: "string" },
            is_celebration: { type: "boolean" },
            strength_note: { type: "string" },
          },
          required: ["timestamp", "skill_name", "quality_grade", "primary_deduction", "is_celebration"],
        },
      },
      total_execution_deductions: { type: "number" },
      total_artistry_deductions: { type: "number" },
      final_score: { type: "number" },
      coaching_summary: { type: "string" },
      top_3_fixes: { type: "array", items: { type: "string" } },
      celebrations: { type: "array", items: { type: "string" } },
    },
    required: ["start_value", "final_score", "skills", "total_execution_deductions", "coaching_summary"],
  },
};

// ─── Run ────────────────────────────────────────────────────────────────────

async function run(v) {
  const fp = path.join(process.env.HOME, "Desktop", "videos", v.file);
  if (!fs.existsSync(fp)) return null;
  console.log(`\n${"═".repeat(60)}`);
  console.log(`${v.event} | Judge: ${v.realScore}`);
  console.log(`${"═".repeat(60)}`);

  const t0 = Date.now();
  const f = await upload(fp);

  console.log("  Analyzing...");
  const { text } = await api({
    action: "generate", fileUri: f.fileUri, mimeType: f.mimeType,
    systemPrompt: SYSTEM_INSTRUCTION,
    userPrompt: userPrompt(v.event, v.level),
    config: CONFIG,
  });

  let sc;
  try { sc = JSON.parse(text); } catch {
    // Repair truncated JSON
    const start = text.indexOf("{");
    let repaired = text.substring(start);
    const ob = (repaired.match(/\{/g)||[]).length, cb = (repaired.match(/\}/g)||[]).length;
    const oq = (repaired.match(/\[/g)||[]).length, cq = (repaired.match(/\]/g)||[]).length;
    const lc = repaired.lastIndexOf(",");
    if (lc > 0) repaired = repaired.substring(0, lc);
    for (let i = 0; i < oq - cq; i++) repaired += "]";
    for (let i = 0; i < ob - cb; i++) repaired += "}";
    sc = JSON.parse(repaired);
  }

  const ai = sc.final_score;
  const delta = Math.abs(ai - v.realScore);
  const pass = delta <= 0.10;

  console.log(`\n  Skills: ${sc.skills?.length || 0}`);
  for (const s of (sc.skills || [])) {
    const star = s.is_celebration ? " ★" : "";
    console.log(`    ${s.timestamp || "?"} | ${s.skill_name} [${s.quality_grade}]${star}`);
    if (s.primary_deduction && s.primary_deduction !== "None" && s.primary_deduction !== "N/A") console.log(`       ${s.primary_deduction}`);
    if (s.strength_note) console.log(`       ✦ ${s.strength_note}`);
  }
  console.log(`  Exec: -${sc.total_execution_deductions || "?"} | Art: -${sc.total_artistry_deductions || 0}`);
  console.log(`  ${sc.coaching_summary?.substring(0, 200)}`);
  console.log(`\n  AI: ${ai}  |  Judge: ${v.realScore}  |  Δ ${delta.toFixed(3)} ${pass ? "✅" : "❌"}  |  ${((Date.now()-t0)/1000).toFixed(0)}s`);

  try { await api({ action: "deleteFile", fileName: f.fileName }); } catch {}
  fs.writeFileSync(path.join(process.env.HOME, "Desktop/StriveGymnastics/scripts", `debug-${v.event.replace(/\s/g,"_").toLowerCase()}.json`), JSON.stringify(sc, null, 2));

  return { event: v.event, ai, real: v.realScore, delta, pass };
}

async function main() {
  console.log("STRIVE — Gemini Bible Framework Test\n");
  const results = [];
  for (const v of VIDEOS) {
    try { const r = await run(v); if (r) results.push(r); }
    catch (e) { console.error(`  ❌ ${v.event}: ${e.message}`); results.push({ event: v.event, ai: null, real: v.realScore, delta: null, pass: false, err: e.message }); }
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(`${"Event".padEnd(18)} ${"AI".padEnd(8)} ${"Judge".padEnd(8)} ${"Delta".padEnd(8)} Result`);
  console.log("-".repeat(50));
  let p = 0;
  for (const r of results) {
    const ai = r.ai != null ? r.ai.toFixed(2) : "ERR";
    const d = r.delta != null ? r.delta.toFixed(3) : "N/A";
    console.log(`${r.event.padEnd(18)} ${ai.padEnd(8)} ${r.real.toFixed(3).padEnd(8)} ${d.padEnd(8)} ${r.pass ? "✅" : "❌"}`);
    if (r.pass) p++;
  }
  const valid = results.filter(r => r.delta != null);
  console.log("-".repeat(50));
  console.log(`${p}/${results.length} pass | avg Δ ${(valid.reduce((s,r)=>s+r.delta,0)/valid.length).toFixed(3)}`);
}

main().catch(e => { console.error(e); process.exit(1); });
