/**
 * live-test.mjs — Run the 2-pass pipeline against real videos via the dev server proxy.
 *
 * Usage: node scripts/live-test.mjs
 *
 * Requires: dev server running on localhost:3000 (npm start)
 * Videos: ~/Desktop/videos/
 *
 * Deliverable 5: Test validation — raw JSON, computed scores, comparison to real judges.
 */

import fs from "fs";
import path from "path";
import { Readable } from "stream";

const PROXY = "http://localhost:3000/api/gemini";
const TOKEN = "strive-2026-launch";

// ─── Known judge scores ──────────────────────────────────────────────────────
const VIDEOS = [
  { file: "differentvaultcomp.mov", event: "Vault", realScore: 8.85, level: "Level 6" },
  { file: "IMG_4061.MOV", event: "Uneven Bars", realScore: 8.525, level: "Level 6" },
  { file: "IMG_9884.MOV", event: "Balance Beam", realScore: 8.85, level: "Level 6" },
  { file: "IMG_5178 3.mov", event: "Floor Exercise", realScore: 8.925, level: "Level 6" },
];

const PROFILE = { name: "Gymnast", gender: "female", level: "Level 6", levelCategory: "optional" };

// ─── Helpers ────────────────────────────────────────────────────────────────

async function geminiProxy(body) {
  const res = await fetch(PROXY, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Strive-Token": TOKEN },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `Server error (${res.status})`);
  }
  return res.json();
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function snapToUSAG(val) {
  if (typeof val !== "number" || isNaN(val)) return 0;
  const abs = Math.abs(val);
  if (abs >= 0.40) return 0.50;
  return Math.round(abs * 20) / 20;
}

function parseJSON(raw, label) {
  try { return JSON.parse(raw); } catch {}
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch {}
  try {
    return JSON.parse(raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim());
  } catch (e) {
    console.error(`[${label}] JSON parse failed. First 500 chars:`, raw.substring(0, 500));
    throw e;
  }
}

// ─── Upload video (streaming for large files) ────────────────────────────────

async function uploadVideo(filePath) {
  const stat = fs.statSync(filePath);
  const fileName = path.basename(filePath);
  const mimeType = filePath.toLowerCase().endsWith(".mov") ? "video/quicktime" : "video/mp4";

  console.log(`  Uploading ${fileName} (${(stat.size / 1024 / 1024).toFixed(1)}MB)...`);

  // Init resumable upload
  const { uploadUrl } = await geminiProxy({
    action: "initUpload",
    displayName: "test_" + Date.now(),
    fileSize: stat.size,
    mimeType,
  });

  // Upload bytes directly to Google (Node.js has no CORS restrictions)
  const finalUrl = uploadUrl;

  // Use ReadStream + duplex for streaming upload
  const fileStream = fs.createReadStream(filePath);
  const uploadRes = await fetch(finalUrl, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Command": "upload, finalize",
      "X-Goog-Upload-Offset": "0",
      "Content-Length": String(stat.size),
    },
    body: Readable.toWeb(fileStream),
    duplex: "half",
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => "");
    throw new Error(`Upload failed: ${uploadRes.status} ${errText.substring(0, 200)}`);
  }
  const fileInfo = await uploadRes.json();
  const fileUri = fileInfo.file?.uri;
  const gFileName = fileInfo.file?.name;
  if (!fileUri) throw new Error("No file URI returned");

  console.log(`  Uploaded: ${gFileName}`);

  // Poll until ACTIVE
  for (let i = 0; i < 60; i++) {
    await delay(3000);
    try {
      const { state } = await geminiProxy({ action: "pollFile", fileName: gFileName });
      if (state === "ACTIVE") {
        console.log("  File ACTIVE");
        return { fileUri, fileName: gFileName, mimeType };
      }
      if (state === "FAILED") throw new Error("Video processing failed");
    } catch (e) {
      if (e.message.includes("failed")) throw e;
    }
    process.stdout.write(".");
  }
  throw new Error("Upload timed out");
}

// ─── Full system prompt (matches prompts.js exactly) ────────────────────────

function buildFullSystemPrompt(event) {
  const eventRules = {
    "Vault": `
## EVENT SPECIFICS: VAULT
Vault is ONE skill with MULTIPLE PHASES. Judge EVERY phase independently:

1. RUN & HURDLE: Speed, power, hurdle mechanics.
   - Short run / slow: -0.10
   - Poor hurdle (feet not together, arms not up): -0.05 to -0.10

2. BOARD CONTACT & PRE-FLIGHT:
   - Feet placement on board (too close/far): -0.05 to -0.10
   - Insufficient pre-flight height: -0.10 to -0.20
   - Piked or arched body in pre-flight: -0.10 to -0.20
   - Bent arms at table contact: -0.10 to -0.30

3. TABLE CONTACT & BLOCK:
   - Insufficient block (hands stay too long): -0.10 to -0.20
   - Shoulder angle not open: -0.10 to -0.20
   - Bent arms during push-off: -0.10 to -0.30

4. POST-FLIGHT:
   - Insufficient height: -0.10 to -0.30
   - Insufficient distance from table: -0.10 to -0.20
   - Pike or arch in body position: -0.05 to -0.20
   - Leg separation: -0.10 to -0.20
   - Bent knees: -0.10 to -0.20

5. LANDING:
   - Small step: -0.10
   - Medium step/hop: -0.10 to -0.20
   - Large step/lunge: -0.20 to -0.30
   - Deep squat: -0.20 to -0.30
   - Hands on floor: -0.30
   - Fall: -0.50
   - Chest drops below horizontal: -0.10 to -0.20

CRITICAL: A typical Level 6 vault scores 8.70-9.10 (0.90-1.30 total deductions).
Judge ALL phases but do NOT double-count. If bent arms appear in both pre-flight and block, that may be ONE continuous fault — count it once.
If total deductions are below 0.80, you are MISSING faults. If above 1.30, you may be double-counting.`,

    "Uneven Bars": `
## EVENT SPECIFICS: UNEVEN BARS

CRITICAL WARNING: AI models consistently UNDER-DEDUCT on bars by 0.50-1.00 points.
Bars is "3D orbital" movement — occlusion and foreshortening hide faults.
You MUST apply the "Pessimistic Judge" model: if a position is ambiguous, take the MAXIMUM deduction.

### CAST HEIGHT (the #1 missed deduction on bars)
- Cast must reach HORIZONTAL (hips/feet at bar height). If feet are below bar: automatic deduction.
- 5° below horizontal: -0.10. 10°+ below: -0.20-0.30.
- If BOTH low bar AND high bar casts are below horizontal: deduct EACH separately.
- A low cast also triggers a COMPOUNDING rhythm deduction on the following skill (-0.10).

### RHYTHM & FLOW (the "hidden" bar deductions)
- Any pause > 0.5 seconds between skills = -0.10 rhythm deduction.
- Extra swing/"pump" before a skill = -0.30.
- Grip adjustment without a skill = -0.10.
- "Setting" grip on high bar before a skill = -0.10 rhythm.
- If a gymnast pauses to "think," that is hesitation, not stability.

### SKILL-SPECIFIC DEDUCTIONS
- Kip: soft elbows on catch = -0.05-0.10. Shoulders behind bar = -0.05.
- Jump LB to HB: piked hips = -0.10-0.20. Bent knees = -0.10-0.20.
- Back Hip Circle: flexed feet during rotation = -0.10. Loss of toe point = -0.10.
- Squat-on transition: heavy/loud feet on bar = -0.10-0.15.
- Flyaway dismount: knees apart in tuck = -0.10. Chest down on landing = -0.10-0.20.
  Steps on landing: -0.10 per step.

### LEG TENSION (the most commonly missed fault)
- Track the distance between knees. Even slight separation = -0.10.
- "Straight but not locked" legs = -0.05 per occurrence (soft knees).
- Flexed/sickled feet during EVERY skill: -0.05 each occurrence (accumulates fast).

### TYPICAL BARS DEDUCTION BREAKDOWN (Level 6, score ~8.5):
- Cast amplitude: -0.20 to -0.40 across all casts
- Leg tension/separation: -0.10 to -0.20
- Flexed feet: -0.10 to -0.20 (accumulated)
- Rhythm/pauses: -0.10 to -0.20
- Dismount form + landing: -0.15 to -0.30
- Soft arms in kips: -0.05 to -0.10
Total typical: 0.90-1.50

SKILL COUNTING: Typical bars routine has 7-10 DISTINCT SKILLS.
Skills: kip, cast (as connecting element), circling skills, transitions between bars, dismount.`,

    "Balance Beam": `
## EVENT SPECIFICS: BALANCE BEAM
- Balance check (arms move from body): -0.10.
- Balance check (large arm swing/wobble): -0.20.
- Grasp beam to avoid fall: -0.50.
- Fall from beam: -0.50.
- Extra step / hop on landing: -0.10 per step.
- Pause/freeze (not choreographic): -0.10.
- Wobbles on acro elements: -0.10 to -0.20 each.
- Feet not pointed on every skill: -0.05 each occurrence (ACCUMULATES — count EVERY instance).
- Split leap/jump: must reach 150°+ at Level 6. Below 120° = -0.20, 120-149° = -0.10.
- Full turn (360°): heel drop before completion = -0.10. Free leg loose = -0.05.
- Dismount landing: steps, squat, chest position all deducted.

### ARTISTRY ON BEAM (0.15-0.35 typical):
- Confidence/presentation between skills: -0.05-0.10 for hesitation.
- Rhythm and flow: pauses between skills that aren't choreographic = -0.10 each.
- Use of the full beam length: staying in the center = -0.05.
- Expression and eye focus: looking at the beam constantly = -0.05-0.10.

SKILL COUNTING: Typical beam routine has 8-12 skill entries.`,

    "Floor Exercise": `
## EVENT SPECIFICS: FLOOR EXERCISE

### TUMBLING PASS DEDUCTIONS
- Inter-Knee Distance: if legs separate during round-off/BHS/salto, -0.10 per occurrence.
- Bent knees in tumbling: -0.10 to -0.30 per pass.
- Flexed feet in tumbling: -0.05 per element.
- Low salto height ("flat" salto): -0.10 to -0.20.
- Landing: deep squat = -0.10 to -0.20. Chest-to-knees = -0.20. Steps = -0.10 each.

### DANCE ELEMENTS
- Split leap must reach 150°+ at Level 6. If 100-120° = -0.20, 120-149° = -0.10.
- Full turn: heel drop before 360° completion = -0.10. Loose free leg = -0.05.
- Sissonne: lack of back leg height = -0.05-0.10. Chest drop on finish = -0.05.

### ARTISTRY & COMPOSITION (the "hidden" 0.30+ deductions):
- Expression: "concentrated/neutral" face = -0.10. Must project to judges.
- Quality of movement: "functional" transitions (just walking to the corner) = -0.05.
- Choreography variety: standard walking steps to corners = -0.05.
- Musicality: if vocals present, choreography must reflect mood. Mismatch = -0.05-0.10.
- Chin down >40% of non-tumbling time = -0.10.
- Flat footwork / no relevé in dance = -0.05-0.10.
- Flexed feet during transitions: -0.05 per count (ACCUMULATES).
- Space usage: staying in diagonals only = -0.05.

### OUT-OF-BOUNDS: -0.10 per foot touching line/out.

SKILL COUNTING: Identify each element individually.
- Each tumbling PASS (e.g., "RO-BHS-Back Tuck") is ONE skill entry.
- Each dance element is a separate entry.
- Full turn is a separate entry.
Typical: 8-12 skill entries total.
Two acro passes required at Level 6, salto required in both.`,
  };

  return `## ROLE
You are an Elite FIG/USAG Certified Judge with 20 years of experience at State Championships judging JO Levels 1-10, Optional, Elite, and Xcel. You provide "Cold, Hard Truth" analysis. You are highly skeptical, detail-oriented, and you HUNT for deductions.

## JUDGING ALGORITHM (PESSIMISTIC MODEL)
1. START VALUE: Always begin at 10.0.
2. DEDUCTION BIAS: If an angle or position is ambiguous, assume the MAXIMUM deduction.
3. COMPOUNDING: If a skill is technically poor (e.g., low cast), apply a secondary "Rhythm/Flow" deduction to the following skill.
4. "DEATH BY A THOUSAND 0.05s": Count EVERY flexed foot, EVERY soft knee, EVERY micro-bend. These accumulate to 0.30-0.50 total.

Watch this gymnastics routine from start to finish.

A "skill" is a complete, named element or connected sequence — NOT individual components.
- BARS: "Low Bar Kip", "Cast", "Back Hip Circle" — each is ONE skill. Typical: 7-10 skills.
- FLOOR: "Round-off Back Handspring Back Tuck" is ONE skill (full tumbling pass). Typical: 6-10 skills.
- BEAM: "Back Walkover", "Split Leap", "Cartwheel Back Handspring" (series) — each is ONE skill.
- VAULT: ONE skill with multiple phases (run, pre-flight, table, post-flight, landing). Judge each phase.
Do NOT break a named skill into sub-movements (except vault phases which are deducted individually).

Your task:
1. Identify every skill performed, in order
2. Note the exact timestamp (in seconds) when each skill begins and ends
3. For each skill: was it executed successfully? (yes/no)
4. For each skill: list every deduction you observe with type, body part, description, point value
5. Note the apparatus
6. Estimate difficulty value for each skill

## GENDER: WAG (Women's Artistic Gymnastics). Apply WAG Code of Points.

## LEVEL: JO LEVEL 6 (Optional WAG)
Start Value: 10.0
BARS: Cast to horizontal. B-value element required.
FLOOR: Two different acro passes, salto required in both.

${eventRules[event] || ""}

## EXECUTION FAULTS — USA Gymnastics official deduction scale:
Bent arms:                  slight=0.05  noticeable=0.10  significant=0.20  severe=0.30
Bent knees / legs:          slight=0.05  noticeable=0.10  significant=0.20  severe=0.30
Leg separation (cowboy):    visible=0.10  wide=0.20
Flexed / sickled feet:      0.05 per occurrence
Insufficient height/amplitude: 0.05-0.30
Body alignment (pike/arch): 0.05-0.30
Incomplete rotation/twist:  0.05-0.30
Head position error:        0.05-0.10

## LANDING FAULTS:
Small step:                 0.05
Medium step:                0.10
Large step / lunge:         0.20-0.30
Squat (above 90° knee):     0.10-0.20
Deep squat (below 90° knee):0.30
Hands on floor (no fall):   0.30
Fall:                       0.50
Chest drop / posture:       0.05-0.20

## ARTISTRY (floor/beam only, typically 0.15-0.35 total for youth):
Hollow hands / limp wrists: 0.05 per occurrence
No eye contact with judges: 0.05-0.10
Lack of confidence / hesitation: 0.05-0.10
Poor musicality (Floor): 0.05-0.20
Flat footwork / no relevé: 0.05-0.10
Flexed feet throughout (cumulative): 0.05 per count
If you have 0.00 artistry deductions, you are WRONG — re-evaluate.

## CALIBRATION — CRITICAL
- Target deduction range: 0.80-1.30 for most Level 6 routines.
- A score of 8.7-9.2 is typical at State Championships.
- If total deductions < 0.80: you are too LENIENT — find more faults.
- If total deductions > 1.50: you are too HARSH — remove uncertain deductions.
- Execution deductions typically 0.50-0.90; artistry + composition add 0.20-0.40.
- If you find fewer than 5 deductions total, you are MISSING deductions.
- Deduction values: 0.00, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.50 ONLY.

## SECOND-PASS CHECK
After initial assessment, re-watch focusing ONLY on:
1. Feet — were there flexed feet you missed?
2. Pauses — any hesitations or rhythm breaks?
3. Landings — did you deduct for every step, hop, or squat?
4. Split leaps — is the angle truly at or above 150°?
5. Arms — any bent arm moments?
Add any missed deductions.

Respond ONLY in the JSON schema provided. No prose. No markdown.`;
}

function buildUserPrompt(event) {
  return `Analyze this Level 6 ${event} routine. Athlete: Gymnast, WAG.

You are strictly forbidden from giving "benefit of the doubt." You are a PESSIMISTIC judge — you look for reasons to DEDUCT, not reasons to celebrate. When in doubt, take the HIGHER deduction.

Focus on micro-deductions: toe point, knee tension, chest placement on landings, body alignment in flight, and artistry/presentation. If the form is not "picture perfect," the deduction MUST be taken.

For every skill: name it, note exact start/end timestamp (seconds), list EVERY deduction with the specific body part and position, and estimate difficulty value.

Also celebrate truly excellent skills. Provide a coaching summary with the top 3 fixes that would gain the most points.

REMEMBER: Target total deductions of 0.80-1.30. If you find less than 0.80, re-watch and look harder.`;
}

// ─── Response schema ────────────────────────────────────────────────────────

const PASS1_SCHEMA = {
  temperature: 0.1,
  topP: 0.8,
  maxOutputTokens: 16384,
  responseMimeType: "application/json",
  thinkingConfig: { thinkingBudget: 8192 },
  responseSchema: {
    type: "object",
    properties: {
      start_value: { type: "number" },
      duration_seconds: { type: "number" },
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
            is_celebration: { type: "boolean" },
            strength_note: { type: "string" },
          },
          required: ["skill_name", "skill_order", "timestamp_start", "timestamp_end",
            "executed_successfully", "difficulty_value", "total_deduction", "deductions",
            "quality_grade", "reason", "is_celebration"],
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
        required: ["total_artistry_deduction"],
      },
      special_requirements: {
        type: "array",
        items: {
          type: "object",
          properties: {
            requirement: { type: "string" },
            status: { type: "string" },
            penalty: { type: "number" },
          },
        },
      },
      total_execution_deductions: { type: "number" },
      final_score: { type: "number" },
      confidence: { type: "string" },
      coaching_summary: { type: "string" },
      top_3_fixes: { type: "array", items: { type: "string" } },
      celebrations: { type: "array", items: { type: "string" } },
    },
    required: ["start_value", "final_score", "deduction_log", "artistry",
      "coaching_summary", "top_3_fixes", "celebrations"],
  },
};

// ─── Run one video ──────────────────────────────────────────────────────────

async function runTest(videoInfo) {
  const videoPath = path.join(process.env.HOME, "Desktop", "videos", videoInfo.file);
  if (!fs.existsSync(videoPath)) {
    console.error(`  SKIP: ${videoPath} not found`);
    return null;
  }

  console.log(`\n${"═".repeat(70)}`);
  console.log(`EVENT: ${videoInfo.event} | Real Judge Score: ${videoInfo.realScore}`);
  console.log(`${"═".repeat(70)}`);

  const startTime = Date.now();

  // Upload
  const fileRef = await uploadVideo(videoPath);

  // ── PASS 1: Judging ─────────────────────────────────────────────────────
  console.log("  Running Pass 1 (Judging)...");

  const { text: pass1Raw } = await geminiProxy({
    action: "generate",
    fileUri: fileRef.fileUri,
    mimeType: fileRef.mimeType,
    systemPrompt: buildFullSystemPrompt(videoInfo.event),
    userPrompt: buildUserPrompt(videoInfo.event),
    config: PASS1_SCHEMA,
  });

  const scorecard = parseJSON(pass1Raw, "pass1");

  // ── CODE-COMPUTED SCORE (Deliverable 3) ──────────────────────────────────
  let executionTotal = 0;
  let deductionCount = 0;
  for (const entry of (scorecard.deduction_log || [])) {
    if (Array.isArray(entry.deductions) && entry.deductions.length > 0) {
      for (const d of entry.deductions) {
        executionTotal += snapToUSAG(Math.abs(d.point_value || 0));
        deductionCount++;
      }
    } else {
      executionTotal += snapToUSAG(Math.abs(entry.total_deduction || 0));
      deductionCount++;
    }
  }

  const srTotal = (scorecard.special_requirements || []).reduce(
    (sum, sr) => sum + Math.abs(sr.penalty || 0), 0
  );
  const artistryTotal = Math.abs(scorecard.artistry?.total_artistry_deduction || 0);
  const totalDeductions = executionTotal + srTotal + artistryTotal;
  const startValue = scorecard.start_value || 10.0;
  const codeScore = Math.max(0, Math.round((startValue - totalDeductions) * 1000) / 1000);

  const aiScore = scorecard.final_score;
  const scoreDiff = Math.abs(codeScore - aiScore);
  const finalScore = codeScore; // Always use code-computed

  const delta = Math.abs(finalScore - videoInfo.realScore);
  const pass = delta <= 0.10;

  const elapsedMs = Date.now() - startTime;

  // ── Output ──────────────────────────────────────────────────────────────
  console.log(`\n  ── PASS 1 RAW OUTPUT ──`);
  console.log(`  Skills found: ${scorecard.deduction_log?.length || 0} | Deductions: ${deductionCount}`);
  for (const s of (scorecard.deduction_log || [])) {
    const deds = (s.deductions || []).map(d => `${d.description}(${d.body_part}): -${d.point_value}`).join(", ");
    console.log(`    ${s.skill_order}. ${s.skill_name} @ ${s.timestamp_start}s-${s.timestamp_end}s | ded: -${s.total_deduction}${s.is_celebration ? " ★" : ""}`);
    if (deds) console.log(`       ${deds}`);
    if (s.strength_note) console.log(`       Strength: ${s.strength_note}`);
  }
  console.log(`  Artistry: -${artistryTotal.toFixed(2)} | ${scorecard.artistry?.notes || ""}`);
  console.log(`  Celebrations: ${(scorecard.celebrations || []).join("; ")}`);
  console.log(`  Top fixes: ${(scorecard.top_3_fixes || []).join("; ")}`);
  console.log(`  Coaching: ${scorecard.coaching_summary?.substring(0, 150)}...`);

  console.log(`\n  ── SCORE COMPUTATION (Deliverable 3) ──`);
  console.log(`  Start Value:      ${startValue}`);
  console.log(`  Execution:       -${executionTotal.toFixed(3)}`);
  console.log(`  Artistry:        -${artistryTotal.toFixed(3)}`);
  console.log(`  SR Penalties:    -${srTotal.toFixed(3)}`);
  console.log(`  Total Deductions: ${totalDeductions.toFixed(3)}`);
  console.log(`  AI Score:         ${aiScore}`);
  console.log(`  Code Score:       ${codeScore}`);
  console.log(`  AI vs Code diff:  ${scoreDiff.toFixed(3)}${scoreDiff > 0.30 ? " ⚠️  WARNING >0.30" : ""}`);
  console.log(`  ────────────────────────────────`);
  console.log(`  FINAL SCORE:      ${finalScore}`);
  console.log(`  REAL JUDGE:       ${videoInfo.realScore}`);
  console.log(`  DELTA:            ${delta.toFixed(3)} ${pass ? "✅ PASS (≤0.10)" : "❌ FAIL (>0.10)"}`);
  console.log(`  Time:             ${(elapsedMs / 1000).toFixed(1)}s`);

  // Cleanup
  try { await geminiProxy({ action: "deleteFile", fileName: fileRef.fileName }); } catch {}

  // Save raw JSON for debugging
  const debugDir = path.join(process.env.HOME, "Desktop", "StriveGymnastics", "scripts");
  const debugPath = path.join(debugDir, `debug-${videoInfo.event.replace(/\s+/g, "_").toLowerCase()}.json`);
  fs.writeFileSync(debugPath, JSON.stringify({
    scorecard,
    computed: { executionTotal, artistryTotal, srTotal, totalDeductions, codeScore, aiScore, finalScore, delta, deductionCount },
  }, null, 2));
  console.log(`  Debug JSON:       ${debugPath}`);

  return { event: videoInfo.event, finalScore, realScore: videoInfo.realScore, delta, pass, elapsedMs };
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════════════╗");
  console.log("║  STRIVE ENGINE v12 — LIVE TEST (Deliverable 5)                     ║");
  console.log("║  2-Pass Pipeline: Vision + Judging → Score Computation              ║");
  console.log("╚══════════════════════════════════════════════════════════════════════╝");

  const results = [];

  for (const video of VIDEOS) {
    try {
      const r = await runTest(video);
      if (r) results.push(r);
    } catch (e) {
      console.error(`\n  ❌ ERROR on ${video.event}: ${e.message}`);
      results.push({ event: video.event, finalScore: null, realScore: video.realScore, delta: null, pass: false, error: e.message });
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log(`\n\n${"═".repeat(70)}`);
  console.log("SUMMARY — Deliverable 5: Test Validation");
  console.log(`${"═".repeat(70)}`);
  console.log(`${"Event".padEnd(20)} ${"Computed".padEnd(10)} ${"Judge".padEnd(10)} ${"Delta".padEnd(10)} ${"Result"}`);
  console.log("-".repeat(65));

  let passCount = 0;
  for (const r of results) {
    const score = r.finalScore != null ? r.finalScore.toFixed(3) : "ERROR";
    const delta = r.delta != null ? r.delta.toFixed(3) : "N/A";
    const result = r.pass ? "✅ PASS" : (r.error ? `❌ ${r.error.substring(0, 30)}` : "❌ FAIL");
    console.log(`${r.event.padEnd(20)} ${score.padEnd(10)} ${r.realScore.toFixed(3).padEnd(10)} ${delta.padEnd(10)} ${result}`);
    if (r.pass) passCount++;
  }

  console.log("-".repeat(65));
  console.log(`Target: 90%+ within 0.10 of real scores`);
  console.log(`Result: ${passCount}/${results.length} passed (${((passCount / results.length) * 100).toFixed(0)}%)`);
  console.log(`${"═".repeat(70)}`);
}

main().catch(e => {
  console.error("Fatal error:", e);
  process.exit(1);
});
