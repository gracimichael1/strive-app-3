/**
 * Test: Upload video to Gemini and run the v5_strict_brevet prompt.
 * Usage: node test-prompt.mjs
 */

const API_KEY = "AIzaSyCgTLn7WsXsCrz1deIFcfqylS6fXHQZ1QI";
const VIDEO_PATH = "/Users/mgraci/Downloads/IMG_5178 3.mov";
const MODEL = "gemini-2.5-flash";

import { readFileSync } from "fs";
import { basename } from "path";

// Xcel Gold Floor Exercise profile
const profile = { name: "the gymnast", gender: "female", level: "Xcel Gold", levelCategory: "xcel" };
const event = "Floor Exercise";

function buildPrompt() {
  const level = profile.level;
  const gender = "Women's";
  const splitMin = 120;
  const splitDed = "0.10–0.20";
  const programContext = `XCEL ${level} ROUTINE: Athlete selects their own skills within Xcel program parameters. Verify all 4 Special Requirements are present (−0.50 each if missing). Split leap/jump minimum is ${splitMin}°.`;

  return `You are a Brevet-certified USA Gymnastics judge at a State Championship. You give NO benefit of the doubt. When in doubt, take the HIGHER deduction. Your job is to find EVERY fault so the athlete can improve.

ATHLETE: ${profile.name} | ${gender} ${level} | EVENT: ${event}
${programContext}

KEY RULES:
1. INDIVIDUAL ELEMENTS: Break every skill apart for FEEDBACK purposes. A Round-off, Back Handspring, and Back Tuck in one tumbling pass = THREE separate entries. HOWEVER, connecting elements within a pass share momentum — only deduct faults you can CLEARLY SEE on each individual element. Do not assume faults on connecting elements. If a round-off looks clean, score it clean (0.00 deduction). Most elements in a competent routine have 0-1 visible faults.
2. MICRO-DEDUCTIONS: Flexed feet, soft knees, micro-bends — deduct 0.05 each, but ONLY when clearly visible. Do not guess or assume. A typical skill has 0-2 micro-faults, not 3-4.
3. LANDINGS: Only the FINAL landing of a tumbling pass gets full landing deductions. Intermediate landings (between RO and BHS, between BHS and tuck) are transitional and only deducted if there's a clear error (stumble, extra step, loss of momentum). Final landing: step = 0.05-0.10, squat = 0.10-0.20, deep squat = 0.20-0.30.
4. ARTISTRY — THE HIDDEN DEDUCTIONS (typically 0.15-0.35 total for youth):
   - Finger-tip to toe-tip engagement, arms tossed vs placed (0.05-0.10)
   - Hesitations before passes (0.05-0.10)
   - Flexed feet in dance/transitions — cumulative (0.05-0.15)
   - Composition: floor space, transitions, variety (0.05-0.10)
5. SPLIT LEAPS: ${level} requires ${splitMin}°. Short = 0.10-0.20 deduction.
6. CALIBRATION — THIS IS CRITICAL:
   - Target range for total deductions: 0.80–1.30 for most ${level} routines.
   - A score of 8.7–9.2 is typical at State Championships for ${level}.
   - If your total deductions are below 0.80, you are too LENIENT — find more faults.
   - If your total deductions are above 1.50, you are too HARSH — you are likely double-counting faults across connected elements or deducting faults you cannot clearly see. Remove uncertain deductions.
   - The sum of all individual skill deductions (execution) should typically be 0.50–0.90. Artistry + composition add another 0.20–0.40.

EXECUTION FAULTS — USA Gymnastics official deduction scale (0.05 increments only):
  Bent arms:                  slight=0.05  noticeable=0.10  significant=0.20  severe=0.30
  Bent knees / legs:          slight=0.05  noticeable=0.10  significant=0.20  severe=0.30
  Leg separation (cowboy):    visible=0.10  wide=0.20
  Flexed / sickled feet:      0.05 per occurrence
  Insufficient height/amplitude: 0.05–0.30
  Body alignment (pike/arch): 0.05–0.30
  Incomplete rotation/twist:  0.05–0.30
  Head position error:        0.05–0.10

LANDING FAULTS — judge every landing separately:
  Small step:                 0.05
  Medium step:                0.10
  Large step / lunge:         0.20–0.30
  Squat (above 90° knee):     0.10–0.20
  Deep squat (below 90° knee):0.30
  Hands on floor (no fall):   0.30
  Fall:                       0.50
  Chest drop / posture:       0.05–0.20

SPLIT LEAP/JUMP REQUIREMENT at ${level}: minimum ${splitMin}°
  105°–119° (close): −0.05–0.10
  90°–104° (short): −${splitDed}
  Below 90° (very short): −0.20–0.30

DEDUCTION VALUES: 0.00, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.50 ONLY.
Timestamps: M:SS format from video start (0:00).

Respond with ONLY a JSON object. No markdown, no backticks, no text outside the JSON.
Every element gets its own entry. Severity: "small"/"medium"/"large"/"veryLarge"/"fall".
Skills in chronological order. qualityScore = 10.0 minus that skill's total deduction.

{
  "skills": [
    {
      "timestamp": "0:05",
      "name": "Round-off",
      "type": "acro",
      "qualityScore": 9.75,
      "deduction": 0.25,
      "faults": [
        {"fault": "Legs apart during inversion", "deduction": 0.10, "severity": "medium"},
        {"fault": "Slight bent arms on floor contact", "deduction": 0.10, "severity": "medium"},
        {"fault": "Feet not together on snap-down", "deduction": 0.05, "severity": "small"}
      ],
      "strengthNote": "Strong power generation into the pass",
      "bodyMechanics": {"kneeAngle": "Slight bend at snap-down", "hipAlignment": "Good extension", "shoulderPosition": "Adequate block", "toePoint": "Pointed in flight"},
      "injuryRisk": null,
      "drillRecommendation": "T-handstand snap-downs against wall — focus on tight legs throughout."
    },
    {
      "timestamp": "0:06",
      "name": "Back Handspring",
      "type": "acro",
      "qualityScore": 9.70,
      "deduction": 0.30,
      "faults": [
        {"fault": "Bent arms in support phase", "deduction": 0.10, "severity": "medium"},
        {"fault": "Knees bent in flight", "deduction": 0.10, "severity": "medium"},
        {"fault": "Feet sickled", "deduction": 0.05, "severity": "small"},
        {"fault": "Slight leg separation", "deduction": 0.05, "severity": "small"}
      ],
      "strengthNote": "Good rebound height into next skill",
      "bodyMechanics": {"kneeAngle": "Bent through flight phase", "hipAlignment": "Slight arch", "shoulderPosition": "Arms bent at push-off", "toePoint": "Sickled"},
      "injuryRisk": "Bent arms increase wrist strain. Strengthen with handstand push-ups.",
      "drillRecommendation": "BHS over barrel — focus on straight arms and tight body."
    }
  ],
  "artistry": {
    "totalDeduction": 0.30,
    "details": [
      {"fault": "Hollow hands — fingers not engaged throughout", "deduction": 0.05},
      {"fault": "Flat feet in dance transitions — no relevé", "deduction": 0.10},
      {"fault": "Limited projection/eye contact with judges", "deduction": 0.05},
      {"fault": "Flexed toes during leaps and jumps (cumulative)", "deduction": 0.10}
    ]
  },
  "composition": {
    "totalDeduction": 0.15,
    "details": [
      {"fault": "Limited use of floor space — stayed center", "deduction": 0.05},
      {"fault": "Rushed transitions between passes", "deduction": 0.05},
      {"fault": "Energy drops between skill sequences", "deduction": 0.05}
    ]
  },
  "summary": {
    "overallScore": 8.85,
    "startValue": 10.0,
    "totalDeductions": 1.15,
    "executionDeductions": 0.70,
    "artistryDeductions": 0.30,
    "compositionDeductions": 0.15,
    "whyThisScore": "Accumulated micro-deductions across 12 individual elements (0.70 execution) combined with artistry gaps (0.30) and composition issues (0.15) produce 1.15 total deductions. The largest single deductions came from landing errors and bent arms in tumbling.",
    "celebrations": [
      "Strong tumbling power — excellent height on back tuck",
      "Full turn executed with stable balance and control",
      "Confident final pose with maturity"
    ],
    "topImprovements": [
      {"fix": "Stick landings — chest up, absorb through legs", "pointsGained": 0.20},
      {"fix": "Point toes hard through every skill — cumulative 0.15 gain", "pointsGained": 0.15},
      {"fix": "Dance presentation — relevé, finger engagement, eye contact", "pointsGained": 0.15}
    ]
  }
}

JSON RULES:
- Output ONLY the JSON. No text before or after. No markdown fences.
- Every individual element in the routine gets its own entry — do NOT combine connected skills.
- Fault deductions for a skill must sum to match its "deduction" field.
- Artistry/composition faults go in their own sections, NOT in skills array.
- Each deduction exactly two decimal places. Only values: 0.00, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.50.
- Chronological order by timestamp.
- If total deductions < 0.80, you are too lenient. Re-evaluate.
- If total deductions > 1.50, you are too harsh — remove uncertain deductions. Target: 0.90–1.20 total.`;
}

async function uploadVideo() {
  const videoData = readFileSync(VIDEO_PATH);
  const fileName = basename(VIDEO_PATH);
  console.log(`Uploading ${fileName} (${(videoData.length / 1024 / 1024).toFixed(1)} MB)...`);

  const initRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(videoData.length),
        "X-Goog-Upload-Header-Content-Type": "video/quicktime",
      },
      body: JSON.stringify({ file: { displayName: fileName } }),
    }
  );

  const uploadUrl = initRes.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("Failed to get upload URL");

  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Length": String(videoData.length),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: videoData,
  });

  const uploadData = await uploadRes.json();
  const filePath = uploadData.file?.name;
  const fileUri = uploadData.file?.uri;
  console.log(`Upload complete: ${filePath}`);

  let state = uploadData.file?.state;
  while (state === "PROCESSING") {
    console.log("  Processing video...");
    await new Promise((r) => setTimeout(r, 5000));
    const checkRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${filePath}?key=${API_KEY}`);
    const checkData = await checkRes.json();
    state = checkData.state;
  }
  if (state !== "ACTIVE") throw new Error(`Video processing failed: ${state}`);
  console.log("Video ready.\n");
  return fileUri;
}

async function analyze(fileUri) {
  const prompt = buildPrompt();
  console.log(`Sending to ${MODEL} (prompt: ${prompt.length} chars)...`);

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [
          { fileData: { mimeType: "video/quicktime", fileUri } },
          { text: prompt }
        ]}],
        generationConfig: { temperature: 0.1, maxOutputTokens: 16384, seed: 42 },
      }),
    }
  );

  const data = await res.json();
  if (!res.ok) { console.error("API error:", JSON.stringify(data, null, 2)); throw new Error("Failed"); }
  const finishReason = data.candidates?.[0]?.finishReason;
  console.log(`Finish reason: ${finishReason}`);
  if (finishReason !== "STOP") console.warn("⚠️  OUTPUT MAY BE TRUNCATED");
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function main() {
  try {
    const fileUri = await uploadVideo();
    const raw = await analyze(fileUri);
    const clean = raw.replace(/```json|```/g, "").trim();

    // Save raw output
    const { writeFileSync } = await import("fs");
    writeFileSync("test-output-raw.json", clean);
    console.log("Raw output saved to test-output-raw.json");

    let result;
    try { result = JSON.parse(clean); } catch(e) { console.log("Parse error:", e.message, "\nFirst 500 chars:", clean.slice(0,500)); return; }

    console.log("\n═══════════════════════════════════════════════");
    console.log(`  FINAL SCORE:  ${result.summary?.overallScore}`);
    console.log(`  TARGET:       8.925`);
    console.log(`  DELTA:        ${(result.summary?.overallScore - 8.925).toFixed(3)}`);
    console.log(`  Total Ded:    ${result.summary?.totalDeductions}`);
    console.log(`    Execution:  ${result.summary?.executionDeductions}`);
    console.log(`    Artistry:   ${result.summary?.artistryDeductions}`);
    console.log(`    Composition:${result.summary?.compositionDeductions}`);
    console.log("═══════════════════════════════════════════════");
    console.log(`\n  Skills (${result.skills?.length}):`);
    result.skills?.forEach(s => {
      console.log(`    ${s.timestamp}  ${s.name.padEnd(28)} qual=${s.qualityScore}  ded=−${s.deduction}  [${s.faults?.length} faults]`);
    });
    console.log(`\n  Artistry: −${result.artistry?.totalDeduction}`);
    result.artistry?.details?.forEach(d => console.log(`    −${d.deduction}  ${d.fault}`));
    console.log(`  Composition: −${result.composition?.totalDeduction}`);
    result.composition?.details?.forEach(d => console.log(`    −${d.deduction}  ${d.fault}`));
    console.log(`\n  Why: ${result.summary?.whyThisScore}`);
  } catch (e) { console.error("Error:", e.message); }
}

main();
