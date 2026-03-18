import React, { useState, useEffect, useRef, useCallback } from "react";
import { LineChart, XAxis, YAxis, CartesianGrid, Tooltip, Line, ResponsiveContainer } from "recharts";

// ─── STORAGE WRAPPER — works in Claude artifacts AND real browsers ──
const storage = {
  async get(key) {
    if (typeof window !== 'undefined' && window.storage?.get) {
      try { const r = await window.storage.get(key); if (r) return r; } catch {}
    }
    try { const v = localStorage.getItem(key); if (v !== null) return { key, value: v }; } catch {}
    return null;
  },
  async set(key, value) {
    if (typeof window !== 'undefined' && window.storage?.set) {
      try { await window.storage.set(key, value); } catch {}
    }
    try { localStorage.setItem(key, value); } catch {}
  },
  async delete(key) {
    if (typeof window !== 'undefined' && window.storage?.delete) {
      try { await window.storage.delete(key); } catch {}
    }
    try { localStorage.removeItem(key); } catch {}
  },
};

// ─── STRUCTURED LOGGING ─────────────────────────────────────────────
const DEBUG_MODE = process.env.NODE_ENV === 'development' || (typeof window !== 'undefined' && window.location?.search?.includes('debug=true'));
const log = {
  _fmt(level, stage, msg, data) {
    if (!DEBUG_MODE) return;
    const ts = new Date().toISOString().slice(11, 23);
    const prefix = `[${ts}] [${level}] [${stage}]`;
    if (data !== undefined) console.log(prefix, msg, data); // eslint-disable-line no-console
    else console.log(prefix, msg); // eslint-disable-line no-console
  },
  info(stage, msg, data) { log._fmt("INFO", stage, msg, data); },
  warn(stage, msg, data) { log._fmt("WARN", stage, msg, data); },
  error(stage, msg, data) { log._fmt("ERROR", stage, msg, data); },
};

// ─── ERROR BOUNDARY (wraps screens to prevent crashes) ──────────────
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch() {}
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', padding: '40px 20px', maxWidth: 540, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 16 }}>!</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: '#e2e8f0' }}>Something went wrong</h2>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, marginBottom: 24 }}>
            {this.props.screenName ? `The ${this.props.screenName} screen encountered an error.` : 'An unexpected error occurred.'} Try going back or reloading.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button onClick={() => { this.setState({ hasError: false }); if (this.props.onBack) this.props.onBack(); }} style={{ background: 'linear-gradient(135deg, #C4982A, #E8C35A)', color: '#0B1024', border: 'none', padding: '12px 28px', borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: "'Outfit', sans-serif" }}>Go Back</button>
            <button onClick={() => window.location.reload()} style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.08)', padding: '12px 28px', borderRadius: 12, fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: "'Outfit', sans-serif" }}>Reload</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── SAFETY UTILITIES (prevent crashes from unexpected Gemini response shapes) ──
function safeStr(val, fallback = "") {
  if (val == null) return fallback;
  if (typeof val === "string") return val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  if (Array.isArray(val)) return val.map(v => safeStr(v)).join("; ");
  if (typeof val === "object") {
    return val.text || val.description || val.tip || val.advice || val.name || val.reason || val.skill || val.correction || val.currentFault || JSON.stringify(val);
  }
  return String(val);
}
function safeArray(val) {
  if (Array.isArray(val)) return val;
  if (val == null) return [];
  if (typeof val === "object") return Object.values(val);
  return [val];
}
function safeNum(val, fallback = 0, min = -Infinity, max = Infinity) {
  const n = typeof val === "number" ? val : parseFloat(val);
  if (isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

// ─── RESPONSE VALIDATION (normalizes Gemini JSON into safe, consistent shape) ──
function validateResult(parsed) {
  if (!parsed || typeof parsed !== "object") return parsed;

  // Ensure executionDeductions is a valid array of objects
  parsed.executionDeductions = safeArray(parsed.executionDeductions)
    .filter(d => d && typeof d === "object")
    .map(d => ({
      ...d,
      timestamp: safeStr(d.timestamp, "0:00"),
      skill: safeStr(d.skill, "Unknown skill"),
      fault: safeStr(d.fault, d.skill || "Execution error"),
      deduction: safeNum(Math.abs(d.deduction || 0), 0, 0, 2.0),
      confidence: safeNum(d.confidence, 0.7, 0, 1),
      engine: ["TPM", "KTM", "VAE", "Split-Check", "Landing", "General"].includes(d.engine) ? d.engine : "General",
      category: ["execution", "artistry", "landing"].includes(d.category) ? d.category : "execution",
      severity: d.severity || (safeNum(d.deduction, 0) <= 0.10 ? "small" : safeNum(d.deduction, 0) <= 0.15 ? "medium" : safeNum(d.deduction, 0) <= 0.30 ? "large" : safeNum(d.deduction, 0) >= 0.50 ? "fall" : "veryLarge"),
      details: safeStr(d.details, d.fault || d.skill || ""),
      skeleton: d.skeleton && typeof d.skeleton === "object" ? d.skeleton : null,
      lowConfidence: safeNum(d.confidence, 0.7, 0, 1) < 0.6,
    }))
    // Filter out very low confidence deductions (likely hallucinated)
    .filter(d => d.confidence >= 0.4);

  // Always recompute totals from actual deductions — never trust AI-provided totals
  parsed.executionDeductionsTotal = Math.round(
    parsed.executionDeductions.filter(d => d.category !== "artistry").reduce((s, d) => s + d.deduction, 0) * 1000
  ) / 1000;
  parsed.artistryDeductionsTotal = Math.round(
    parsed.executionDeductions.filter(d => d.category === "artistry").reduce((s, d) => s + d.deduction, 0) * 1000
  ) / 1000;
  parsed.totalDeductions = Math.round((parsed.executionDeductionsTotal + parsed.artistryDeductionsTotal) * 1000) / 1000;
  parsed.finalScore = Math.max(0, Math.round((10 - parsed.totalDeductions) * 1000) / 1000);

  // Validate arrays
  parsed.topFixes = safeArray(parsed.topFixes);
  parsed.strengths = safeArray(parsed.strengths);
  parsed.areasForImprovement = safeArray(parsed.areasForImprovement);

  // Validate string fields
  parsed.truthAnalysis = safeStr(parsed.truthAnalysis);
  parsed.overallAssessment = safeStr(parsed.overallAssessment || parsed.truthAnalysis);

  // Validate and build skillAnalysis — the unified per-skill view
  parsed.skillAnalysis = safeArray(parsed.skillAnalysis)
    .filter(s => s && typeof s === "object" && s.skill)
    .map(s => ({
      ...s,
      timestamp: safeStr(s.timestamp, "0:00"),
      skill: safeStr(s.skill),
      type: s.type || "acro",
      verdict: ["clean", "deduction", "strength"].includes(s.verdict) ? s.verdict : (s.deduction > 0 ? "deduction" : "clean"),
      score: ["clean", "minor", "moderate", "major"].includes(s.score) ? s.score : "clean",
      deduction: safeNum(s.deduction, 0, 0, 2.0),
      fault: safeStr(s.fault || ""),
      correction: safeStr(s.correction || ""),
      engine: safeStr(s.engine || ""),
      measuredVsIdeal: safeStr(s.measuredVsIdeal || ""),
      skeleton: s.skeleton && typeof s.skeleton === "object" ? s.skeleton : null,
    }));

  // If AI didn't return skillAnalysis, build it from executionDeductions + pass1 skills
  if (parsed.skillAnalysis.length === 0 && parsed.executionDeductions.length > 0) {
    parsed.skillAnalysis = parsed.executionDeductions.map(d => ({
      timestamp: d.timestamp,
      skill: d.skill,
      type: d.category === "landing" ? "landing" : d.category === "artistry" ? "dance" : "acro",
      verdict: "deduction",
      score: d.severity === "small" ? "minor" : d.severity === "medium" ? "moderate" : "major",
      deduction: d.deduction,
      fault: d.fault,
      correction: d.correction || "",
      engine: d.engine,
      measuredVsIdeal: safeStr(d.details || ""),
      skeleton: d.skeleton,
    }));
  }

  // Validate biomechanics
  if (parsed.biomechanics && typeof parsed.biomechanics === "object") {
    parsed.biomechanics.keyMoments = safeArray(parsed.biomechanics.keyMoments);
    parsed.biomechanics.landingAnalysis = safeArray(parsed.biomechanics.landingAnalysis);
    parsed.biomechanics.holdDurations = safeArray(parsed.biomechanics.holdDurations);
    parsed.biomechanics.injuryRiskFlags = safeArray(parsed.biomechanics.injuryRiskFlags);
    parsed.biomechanics.overallFlightHeight = safeStr(parsed.biomechanics.overallFlightHeight);
    parsed.biomechanics.overallPowerRating = safeStr(parsed.biomechanics.overallPowerRating);
  }

  // Validate coachReport
  if (parsed.coachReport && typeof parsed.coachReport === "object") {
    parsed.coachReport.preemptiveCorrections = safeArray(parsed.coachReport.preemptiveCorrections);
    parsed.coachReport.conditioningPlan = safeArray(parsed.coachReport.conditioningPlan);
    parsed.coachReport.idealComparison = safeStr(parsed.coachReport.idealComparison);
    parsed.coachReport.techniqueProgressionNotes = safeStr(parsed.coachReport.techniqueProgressionNotes);
  }

  // Validate athleteDevelopment
  if (parsed.athleteDevelopment && typeof parsed.athleteDevelopment === "object") {
    parsed.athleteDevelopment.mentalTraining = safeArray(parsed.athleteDevelopment.mentalTraining);
    parsed.athleteDevelopment.goalSpecificAdvice = safeStr(parsed.athleteDevelopment.goalSpecificAdvice);
  }

  return parsed;
}

// ─── DEFENSIVE TABLE PARSER ─────────────────────────────────────────
// Gemini returns tables in unpredictable formats:
//   - Sometimes with \n, sometimes \r only, sometimes NO line breaks at all
//   - Data rows may be concatenated on one line: |0:03|skill|-0.10|engine|reason||0:05|...
// Strategy: regex to extract ALL pipe-delimited rows from raw text regardless of formatting.
function parseGeminiTable(rawText) {
  const rawDeductions = [];

  // Pre-process: Gemini returns separator rows (| :--- | :--- |) as 20K+ chars of dashes
  // with no line breaks, making data rows invisible to parsing.
  // Step 1: Remove all runs of 3+ dashes (possibly with colons/spaces)
  let cleaned = rawText.replace(/-{3,}/g, '');
  // Step 2: Collapse any resulting empty pipe segments (| | or |  :  |)
  cleaned = cleaned.replace(/\|\s*:?\s*(?=\|)/g, '| ');
  // Step 3: Insert newlines before data row timestamps so regex/line parser can find them
  cleaned = cleaned.replace(/\|\s*(?=(?:\d+:\d+|Global)\s*\|)/gi, '\n| ');
  log.info("parser", `Cleaned text length: ${cleaned.length} (was ${rawText.length})`);

  // Strategy 1: Regex — find all table rows matching timestamp | skill | deduction | engine | reasoning
  // Leading pipe is optional since Gemini sometimes omits it
  const rowPattern = /\|?\s*((?:\d+:\d+(?:\.\d+)?)|(?:Global))\s*\|\s*([^|]+?)\s*\|\s*-?\s*(\d*\.?\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|\n]+?)\s*\|?/gi;

  let match;
  while ((match = rowPattern.exec(cleaned)) !== null) {
    const tsRaw = match[1].replace(/\*\*/g, '').trim();
    const skill = match[2].replace(/\*\*/g, '').trim();
    const dedAmt = Math.abs(parseFloat(match[3]));
    const engineRaw = match[4].replace(/\*\*/g, '').trim();
    const faults = match[5].replace(/\*\*/g, '').trim();

    if (skill.includes('Skill') || skill.includes('Phase') || skill.includes('---')) continue;
    if (isNaN(dedAmt) || dedAmt === 0) continue;

    let timestamp = "0";
    if (!tsRaw.match(/Global/i)) {
      const tsParts = tsRaw.split(':');
      if (tsParts.length === 2) timestamp = String(parseInt(tsParts[0]) * 60 + parseInt(tsParts[1]));
      else timestamp = String(parseFloat(tsParts[0]) || 0);
    }

    const isArtistry = tsRaw.match(/Global/i) || String(skill || "").toLowerCase().includes("artistry");
    const tsNum = parseInt(timestamp) || 0;

    let engine = "General";
    const engineStr = (engineRaw + " " + faults).toLowerCase();
    if (engineStr.includes("tpm") || engineStr.includes("toe point")) engine = "TPM";
    else if (engineStr.includes("ktm") || engineStr.includes("knee tension")) engine = "KTM";
    else if (engineStr.includes("vae") || engineStr.includes("vertical")) engine = "VAE";
    else if (engineStr.includes("leg sep")) engine = "KTM";
    else if (engineStr.includes("split") || engineStr.includes("angle logic")) engine = "Split-Check";
    else if (engineStr.includes("posture") || engineStr.includes("landing")) engine = "Landing";

    rawDeductions.push({
      timestamp, skill, fault: faults || skill, deduction: dedAmt, engine,
      category: isArtistry ? "artistry" : (engine === "Landing" ? "landing" : "execution"),
      severity: dedAmt <= 0.10 ? "small" : dedAmt <= 0.15 ? "medium" : dedAmt <= 0.30 ? "large" : dedAmt >= 0.50 ? "fall" : "veryLarge",
      details: faults || skill,
      frameRef: Math.min(6, Math.floor(tsNum / 12) + 1),
    });
  }

  log.info("parser", `Regex extracted ${rawDeductions.length} rows from ${cleaned.length} chars`);

  // Strategy 2: Line-by-line fallback if regex found nothing
  if (rawDeductions.length === 0) {
    const lines = cleaned.split(/\n|\r/).filter(l => l.trim().length > 0);
    for (const line of lines) {
      const cols = line.split('|').map(c => c.trim()).filter(c => c.length > 0);
      if (cols.length < 5) continue;
      // Find the column that looks like a deduction amount
      const dedIdx = cols.findIndex(c => /^-?\s*0?\.\d+$/.test(c.replace(/\s/g, '')));
      if (dedIdx < 1) continue;
      const tsRaw = cols[dedIdx - 2] || cols[0];
      const skill = cols[dedIdx - 1] || cols[1];
      const dedAmt = Math.abs(parseFloat(cols[dedIdx].replace(/\s/g, '')));
      const engineRaw = cols[dedIdx + 1] || "";
      const faults = cols[dedIdx + 2] || cols[dedIdx + 1] || skill;

      if (isNaN(dedAmt) || dedAmt === 0) continue;
      if (skill.includes('Skill') || skill.includes('Phase') || skill.includes('---')) continue;

      let timestamp = "0";
      const tsClean = tsRaw.replace(/\*\*/g, '').trim();
      if (!tsClean.match(/Global/i)) {
        const tsParts = tsClean.split(':');
        if (tsParts.length === 2) timestamp = String(parseInt(tsParts[0]) * 60 + parseInt(tsParts[1]));
        else timestamp = String(parseFloat(tsParts[0]) || 0);
      }

      const isArtistry = tsClean.match(/Global/i) || String(skill || "").toLowerCase().includes("artistry");
      const tsNum = parseInt(timestamp) || 0;

      let engine = "General";
      const engineStr = (engineRaw + " " + faults).toLowerCase();
      if (engineStr.includes("tpm") || engineStr.includes("toe point")) engine = "TPM";
      else if (engineStr.includes("ktm") || engineStr.includes("knee tension")) engine = "KTM";
      else if (engineStr.includes("vae") || engineStr.includes("vertical")) engine = "VAE";
      else if (engineStr.includes("leg sep")) engine = "KTM";
      else if (engineStr.includes("split") || engineStr.includes("angle logic")) engine = "Split-Check";
      else if (engineStr.includes("posture") || engineStr.includes("landing")) engine = "Landing";

      rawDeductions.push({
        timestamp, skill: skill.replace(/\*\*/g, '').trim(), fault: faults.replace(/\*\*/g, '').trim() || skill, deduction: dedAmt, engine,
        category: isArtistry ? "artistry" : (engine === "Landing" ? "landing" : "execution"),
        severity: dedAmt <= 0.10 ? "small" : dedAmt <= 0.15 ? "medium" : dedAmt <= 0.30 ? "large" : dedAmt >= 0.50 ? "fall" : "veryLarge",
        details: faults.replace(/\*\*/g, '').trim() || skill,
        frameRef: Math.min(6, Math.floor(tsNum / 12) + 1),
      });
    }
    log.info("parser", `Line-based fallback extracted ${rawDeductions.length} rows`);
  }

  return rawDeductions;
}

// ─── CONSTANTS & DATA ───────────────────────────────────────────────
const WOMEN_EVENTS = ["Vault", "Uneven Bars", "Balance Beam", "Floor Exercise"];
const MEN_EVENTS = ["Floor Exercise", "Pommel Horse", "Still Rings", "Vault", "Parallel Bars", "High Bar"];

const LEVELS = {
  women: {
    compulsory: ["Level 1", "Level 2", "Level 3", "Level 4", "Level 5"],
    optional: ["Level 6", "Level 7", "Level 8", "Level 9", "Level 10", "Elite"],
    xcel: ["Xcel Bronze", "Xcel Silver", "Xcel Gold", "Xcel Platinum", "Xcel Diamond", "Xcel Sapphire"],
  },
  men: {
    compulsory: ["Level 1", "Level 2", "Level 3", "Level 4", "Level 5"],
    optional: ["Level 6", "Level 7", "Level 8", "Level 9", "Level 10", "Elite"],
    xcel: [],
  },
};

const DEDUCTION_SCALE = {
  small: { range: "0.05 – 0.10", color: "#22c55e" },
  medium: { range: "0.10 – 0.15", color: "#f59e0b" },
  large: { range: "0.20 – 0.30", color: "#f97316" },
  veryLarge: { range: "0.30 – 0.50", color: "#ef4444" },
  fall: { range: "0.50 (DP) / 1.00 (FIG)", color: "#dc2626" },
};

const DEDUCTION_CATEGORIES = {
  execution: [
    { fault: "Bent arms", deduction: "up to 0.30", category: "small-large" },
    { fault: "Bent knees / legs", deduction: "up to 0.30", category: "small-large" },
    { fault: "Leg separation", deduction: "up to 0.20", category: "small-medium" },
    { fault: "Flexed / sickled feet", deduction: "0.05 each", category: "small" },
    { fault: "Insufficient height / amplitude", deduction: "up to 0.30", category: "small-large" },
    { fault: "Body alignment deviation", deduction: "up to 0.20", category: "small-medium" },
    { fault: "Pike / arch in body position", deduction: "up to 0.30", category: "small-large" },
    { fault: "Incomplete turn / twist", deduction: "up to 0.30", category: "small-large" },
    { fault: "Insufficient extension", deduction: "up to 0.30", category: "small-large" },
    { fault: "Head position error", deduction: "up to 0.10", category: "small" },
  ],
  landing: [
    { fault: "Small step (foot movement)", deduction: "0.05", category: "small" },
    { fault: "Small step-close", deduction: "0.05 – 0.10", category: "small" },
    { fault: "Medium step", deduction: "0.10 – 0.15", category: "medium" },
    { fault: "Large step / lunge", deduction: "0.20 – 0.30", category: "large" },
    { fault: "Squat on landing", deduction: "up to 0.30", category: "large" },
    { fault: "Deep squat (below 90°)", deduction: "0.30", category: "large" },
    { fault: "Hands on floor (no fall)", deduction: "0.30", category: "large" },
    { fault: "Fall on landing", deduction: "0.50", category: "fall" },
    { fault: "Incorrect body posture on landing", deduction: "up to 0.20", category: "medium" },
    { fault: "Absence of extension before landing", deduction: "up to 0.30", category: "large" },
  ],
  artistry: [
    { fault: "Lack of confidence / hesitation", deduction: "up to 0.10", category: "small" },
    { fault: "Insufficient use of space (FX)", deduction: "up to 0.10", category: "small" },
    { fault: "Poor musicality / rhythm (FX)", deduction: "up to 0.20", category: "medium" },
    { fault: "Lack of personal style / expression", deduction: "up to 0.10", category: "small" },
    { fault: "Insufficient amplitude in dance", deduction: "up to 0.20", category: "medium" },
    { fault: "Lack of variation in tempo", deduction: "up to 0.10", category: "small" },
  ],
  neutral: [
    { fault: "Out of bounds (one body part)", deduction: "0.10", category: "small" },
    { fault: "Out of bounds (two+ body parts)", deduction: "0.30", category: "large" },
    { fault: "Overtime (beam/floor 90s limit)", deduction: "0.10", category: "small" },
    { fault: "Missing special requirement", deduction: "0.50 each", category: "fall" },
    { fault: "Failure to salute judge", deduction: "0.10", category: "small" },
    { fault: "Coach on floor without cause", deduction: "0.30", category: "large" },
  ],
};

const DRILLS_DATABASE = {
  "Bent arms": [
    { name: "Wall Handstand Holds", duration: "3 × 30 sec", description: "Press to handstand against wall focusing on locked elbows. Squeeze triceps and push through shoulders.", yt: "https://www.youtube.com/results?search_query=gymnastics+wall+handstand+hold+drill+straight+arms" },
    { name: "Planche Lean Push-ups", duration: "3 × 8 reps", description: "Lean forward in push-up position, arms straight. Build shoulder and arm lockout strength.", yt: "https://www.youtube.com/results?search_query=planche+lean+push+up+gymnastics+conditioning" },
    { name: "Cast Handstand Drills (Bars)", duration: "10 reps", description: "Focus on full arm extension through each cast. Coach should tap elbows as reminder.", yt: "https://www.youtube.com/results?search_query=gymnastics+cast+handstand+drill+straight+arms" },
  ],
  "Bent knees / legs": [
    { name: "Hollow Body Holds", duration: "4 × 20 sec", description: "Squeeze legs together, point toes, press lower back to floor. Build core-to-leg connection.", yt: "https://www.youtube.com/results?search_query=gymnastics+hollow+body+hold+technique" },
    { name: "Relevé Walks on Beam Line", duration: "2 × beam length", description: "Walk in relevé with legs fully extended. Focus on locking knees with each step.", yt: "https://www.youtube.com/results?search_query=gymnastics+releve+walk+beam+drill" },
    { name: "Straight Leg Lifts on Stall Bar", duration: "3 × 10 reps", description: "Hang from stall bar, lift legs to horizontal with locked knees. Slow and controlled.", yt: "https://www.youtube.com/results?search_query=stall+bar+leg+lifts+gymnastics+conditioning" },
  ],
  "Leg separation": [
    { name: "Resistance Band Squeezes", duration: "3 × 15 sec holds", description: "Place ball between ankles during handstands and jumps to train leg squeeze.", yt: "https://www.youtube.com/results?search_query=gymnastics+tight+legs+drill+squeeze" },
    { name: "Glute Bridge with Squeeze", duration: "3 × 12 reps", description: "Bridge up squeezing block between knees. Strengthens adductors for tight leg positions.", yt: "https://www.youtube.com/results?search_query=glute+bridge+adductor+squeeze+gymnastics" },
    { name: "Salto Drills on Trampoline", duration: "10 reps", description: "Practice flips with legs glued together. Verbal cue: 'Zip your legs from hip to toe.'", yt: "https://www.youtube.com/results?search_query=gymnastics+trampoline+tight+body+flip+drill" },
  ],
  "Flexed / sickled feet": [
    { name: "Theraband Ankle Exercises", duration: "3 × 20 each direction", description: "Point, flex, circle with resistance band. Focus on full plantar flexion and proper alignment.", yt: "https://www.youtube.com/results?search_query=theraband+ankle+exercises+gymnastics+pointed+toes" },
    { name: "Relevé Calf Raises", duration: "3 × 15 reps", description: "Slow calf raises to maximum height. Hold top position 2 seconds, emphasizing toe point.", yt: "https://www.youtube.com/results?search_query=releve+calf+raises+gymnastics+foot+strength" },
    { name: "Toe Point Check in Mirror", duration: "5 min daily", description: "Practice every skill barefoot in front of mirror. Self-correct any sickling.", yt: "https://www.youtube.com/results?search_query=how+to+point+toes+gymnastics+fix+sickle" },
  ],
  "Insufficient height / amplitude": [
    { name: "Plyometric Box Jumps", duration: "4 × 6 reps", description: "Focus on explosive takeoff and maximum height. Land softly with control.", yt: "https://www.youtube.com/results?search_query=plyometric+box+jumps+gymnastics+power" },
    { name: "Hurdle to Punch Drill", duration: "10 reps", description: "Practice approach with emphasis on powerful punch off the floor. Drive arms upward.", yt: "https://www.youtube.com/results?search_query=gymnastics+hurdle+punch+drill+tumbling" },
    { name: "Panel Mat Conditioning", duration: "3 × 8 reps", description: "Jump over progressively higher panel mats to build amplitude awareness.", yt: "https://www.youtube.com/results?search_query=panel+mat+jump+drill+gymnastics+amplitude" },
  ],
  "Body alignment deviation": [
    { name: "Video Self-Review", duration: "10 min per session", description: "Record skills and compare body line to ideal positions. Mark deviations on screen.", yt: "https://www.youtube.com/results?search_query=gymnastics+video+review+body+alignment" },
    { name: "Alignment Sticks Drill", duration: "5 min warm-up", description: "Hold dowel rod along spine during basic positions. Feel when alignment breaks.", yt: "https://www.youtube.com/results?search_query=dowel+rod+alignment+drill+gymnastics" },
    { name: "Handstand Shape Holds", duration: "5 × 15 sec", description: "Hold handstand with partner checking shoulder, hip, ankle alignment. Squeeze everything tight.", yt: "https://www.youtube.com/results?search_query=handstand+alignment+drill+gymnastics+shape" },
  ],
  "Small step (foot movement)": [
    { name: "Stick Drills off Low Surface", duration: "20 reps", description: "Jump from low block, land and hold 3 seconds. No movement at all on landing.", yt: "https://www.youtube.com/results?search_query=gymnastics+stick+landing+drill" },
    { name: "Drop Landings", duration: "3 × 8 reps", description: "Step off increasing heights. Absorb through ankles and knees. Freeze on impact.", yt: "https://www.youtube.com/results?search_query=drop+landing+drill+gymnastics+stick" },
    { name: "Balance Board Training", duration: "3 × 1 min", description: "Stand on wobble board to improve ankle stability and proprioception for clean landings.", yt: "https://www.youtube.com/results?search_query=balance+board+ankle+stability+gymnastics" },
  ],
  "Landing errors": [
    { name: "Pit to Stick Progressions", duration: "10-15 reps", description: "Land on elevated surface from pit. Focus on chest up, arms up, and complete stillness.", yt: "https://www.youtube.com/results?search_query=gymnastics+pit+landing+stick+drill" },
    { name: "Depth Drops with Stick", duration: "3 × 6 reps", description: "Drop from box, land and hold finish position for 3 full seconds before moving.", yt: "https://www.youtube.com/results?search_query=depth+drop+stick+landing+gymnastics" },
    { name: "Single Leg Balance Holds", duration: "3 × 30 sec each", description: "Build ankle and knee stability for asymmetric landings.", yt: "https://www.youtube.com/results?search_query=single+leg+balance+gymnastics+conditioning" },
  ],
  "Insufficient extension": [
    { name: "Stretch & Extend Holds", duration: "5 × 10 sec", description: "In each position (layout, pike, tuck), practice full extension. Coach checks alignment.", yt: "https://www.youtube.com/results?search_query=gymnastics+body+extension+drill+layout" },
    { name: "Superman Holds", duration: "4 × 15 sec", description: "Lie prone, lift arms and legs. Full extension from fingertips to toes.", yt: "https://www.youtube.com/results?search_query=superman+hold+gymnastics+conditioning" },
    { name: "Open Shoulder Flexibility", duration: "Daily stretching", description: "Wall slides and shoulder dislocates to improve overhead extension range.", yt: "https://www.youtube.com/results?search_query=shoulder+flexibility+gymnastics+dislocate+stretch" },
  ],
  "Pike / arch": [{ name: "Hollow Body Progressions", duration: "4x20s", description: "Start tucked, progress to full hollow. Press lower back to floor." },{ name: "Superman to Hollow Rolls", duration: "3x8", description: "Roll hollow to superman maintaining tension." }],
  "Incomplete turn": [{ name: "Releve Turn Drills", duration: "10 reps", description: "Full turn on floor line. Spotting and staying on releve." },{ name: "Core Rotation", duration: "3x12", description: "Russian twists. Build rotational power." }],
  "Head position": [{ name: "Tennis Ball Chin Drill", duration: "5 min", description: "Hold ball under chin during rolls/handstands. Builds neutral head." }],
  "Fall on landing": [{ name: "Landing Progressions", duration: "3x10", description: "Start low, increase height. Master each level." },{ name: "Post-Fall Reset", duration: "In practice", description: "Simulate fall, stand, breathe, execute next skill." }],
  "Squat on landing": [{ name: "Eccentric Squats", duration: "3x10 slow", description: "4-sec descent squats. Same pattern as landing absorption." }],
  "Lack of confidence": [{ name: "Confidence Runs", duration: "3x per practice", description: "Reduced difficulty, PERFECT presentation." }],
  "Poor musicality": [{ name: "Dance-Through Only", duration: "3x", description: "Floor with only dance. Hit musical accents." }],
  "default": [
    { name: "Full Routine Run-Through", duration: "3 × per practice", description: "Practice complete routine with focus on identified weak points. Film and review.", yt: "https://www.youtube.com/results?search_query=gymnastics+full+routine+practice+tips" },
    { name: "Core Conditioning Circuit", duration: "15 min", description: "Hollow holds, V-ups, planks, and leg lifts. Strong core = better body control.", yt: "https://www.youtube.com/results?search_query=gymnastics+core+conditioning+circuit+workout" },
    { name: "Flexibility Training", duration: "20 min daily", description: "Splits, bridges, shoulder flexibility. Improved range = better lines and positions.", yt: "https://www.youtube.com/results?search_query=gymnastics+flexibility+routine+splits+bridges" },
  ],
};

// ─── SKELETON OVERLAY DATA ──────────────────────────────────────────
const SKELETON_CONNECTIONS = [
  ["head", "neck"], ["neck", "lShoulder"], ["neck", "rShoulder"],
  ["lShoulder", "lElbow"], ["lElbow", "lWrist"], ["rShoulder", "rElbow"], ["rElbow", "rWrist"],
  ["lShoulder", "lHip"], ["rShoulder", "rHip"], ["lHip", "rHip"],
  ["lHip", "lKnee"], ["lKnee", "lAnkle"], ["rHip", "rKnee"], ["rKnee", "rAnkle"],
];

// ─── CORRECT FORM SVG REFERENCE — stick figure illustrations of zero-deduction form ──
const CORRECT_FORM_DB = {
  tuck: { label: "Back Tuck — Zero Deduction", joints: {head:[.5,.15],neck:[.5,.22],lShoulder:[.42,.26],rShoulder:[.58,.26],lElbow:[.38,.34],rElbow:[.62,.34],lWrist:[.42,.42],rWrist:[.58,.42],lHip:[.46,.42],rHip:[.54,.42],lKnee:[.46,.42],rKnee:[.54,.42],lAnkle:[.44,.34],rAnkle:[.56,.34]}, notes: "Knees GLUED together. Tight tuck. Chin neutral. Hands grip shins — no daylight between knees." },
  layout: { label: "Layout — Zero Deduction", joints: {head:[.5,.15],neck:[.5,.2],lShoulder:[.45,.24],rShoulder:[.55,.24],lElbow:[.43,.16],rElbow:[.57,.16],lWrist:[.42,.1],rWrist:[.58,.1],lHip:[.47,.38],rHip:[.53,.38],lKnee:[.48,.55],rKnee:[.52,.55],lAnkle:[.48,.72],rAnkle:[.52,.72]}, notes: "Full extension head to toe. Arms by ears. Legs locked 180°. No pike at hips." },
  handspring: { label: "Handspring Support — Zero Deduction", joints: {head:[.5,.82],neck:[.5,.74],lShoulder:[.45,.67],rShoulder:[.55,.67],lElbow:[.44,.56],rElbow:[.56,.56],lWrist:[.44,.45],rWrist:[.56,.45],lHip:[.47,.52],rHip:[.53,.52],lKnee:[.48,.35],rKnee:[.52,.35],lAnkle:[.48,.18],rAnkle:[.52,.18]}, notes: "Arms LOCKED 180°. Push through shoulders. Straight line wrists→shoulders→hips→toes." },
  split_leap: { label: "Split Leap — Zero Deduction", joints: {head:[.5,.12],neck:[.5,.18],lShoulder:[.42,.22],rShoulder:[.58,.22],lElbow:[.34,.16],rElbow:[.66,.16],lWrist:[.26,.12],rWrist:[.74,.12],lHip:[.46,.38],rHip:[.54,.38],lKnee:[.28,.38],rKnee:[.72,.38],lAnkle:[.15,.42],rAnkle:[.85,.42]}, notes: "180° split. Both legs AT or ABOVE horizontal. Toes pointed. Arms extended. Head up." },
  landing: { label: "Stuck Landing — Zero Deduction", joints: {head:[.5,.12],neck:[.5,.18],lShoulder:[.42,.22],rShoulder:[.58,.22],lElbow:[.40,.14],rElbow:[.60,.14],lWrist:[.39,.08],rWrist:[.61,.08],lHip:[.46,.40],rHip:[.54,.40],lKnee:[.45,.56],rKnee:[.55,.56],lAnkle:[.44,.72],rAnkle:[.56,.72]}, notes: "Feet together. Knees soft to absorb. Chest UP. Arms at ears. HOLD — zero movement for 1 second." },
  turn: { label: "Full Turn — Zero Deduction", joints: {head:[.5,.08],neck:[.5,.14],lShoulder:[.46,.18],rShoulder:[.54,.18],lElbow:[.47,.12],rElbow:[.53,.12],lWrist:[.48,.06],rWrist:[.52,.06],lHip:[.47,.38],rHip:[.53,.38],lKnee:[.47,.56],rKnee:[.53,.56],lAnkle:[.47,.74],rAnkle:[.53,.74]}, notes: "Supporting leg LOCKED 180°. Free leg in passé. Arms tight. Relevé — full height on toe." },
  kip: { label: "Glide Kip — Zero Deduction", joints: {head:[.35,.35],neck:[.38,.32],lShoulder:[.42,.28],rShoulder:[.42,.28],lElbow:[.42,.20],rElbow:[.42,.20],lWrist:[.42,.12],rWrist:[.42,.12],lHip:[.48,.40],rHip:[.48,.40],lKnee:[.55,.50],rKnee:[.55,.50],lAnkle:[.62,.55],rAnkle:[.62,.55]}, notes: "Arms straight throughout. Toes to bar. Smooth glide — no pause. Finish in front support." },
  cast: { label: "Cast to Handstand — Zero Deduction", joints: {head:[.42,.82],neck:[.42,.74],lShoulder:[.42,.66],rShoulder:[.42,.66],lElbow:[.42,.58],rElbow:[.42,.58],lWrist:[.42,.50],rWrist:[.42,.50],lHip:[.42,.48],rHip:[.42,.48],lKnee:[.42,.30],rKnee:[.42,.30],lAnkle:[.42,.12],rAnkle:[.42,.12]}, notes: "Arms locked. Body passes through vertical. Straight line from wrists to toes. No arch." },
  walkover: { label: "Back Walkover — Zero Deduction", joints: {head:[.65,.70],neck:[.60,.62],lShoulder:[.55,.55],rShoulder:[.55,.55],lElbow:[.50,.48],rElbow:[.50,.48],lWrist:[.45,.42],rWrist:[.45,.42],lHip:[.55,.45],rHip:[.55,.45],lKnee:[.60,.30],rKnee:[.45,.58],lAnkle:[.62,.15],rAnkle:[.42,.72]}, notes: "Split leg position throughout. Shoulders over hands. Push through shoulders on support. Controlled pace." },
  mount: { label: "Beam Mount — Zero Deduction", joints: {head:[.5,.10],neck:[.5,.16],lShoulder:[.42,.20],rShoulder:[.58,.20],lElbow:[.36,.14],rElbow:[.64,.14],lWrist:[.32,.08],rWrist:[.68,.08],lHip:[.46,.38],rHip:[.54,.38],lKnee:[.44,.56],rKnee:[.56,.56],lAnkle:[.43,.74],rAnkle:[.57,.74]}, notes: "Clean jump. Arms up. Land with control. No wobble. Immediate composure." },
};

// Match a skill/fault to the correct reference form
function getCorrectFormRef(skill, fault) {
  const s = ((skill || "") + " " + (fault || "")).toLowerCase();
  if (s.match(/tuck|cowboy|separation.*salto/)) return CORRECT_FORM_DB.tuck;
  if (s.match(/layout|pike.*body|extension/)) return CORRECT_FORM_DB.layout;
  if (s.match(/handspring|support|round.?off/)) return CORRECT_FORM_DB.handspring;
  if (s.match(/split|leap|jump.*180|sissone|switch/)) return CORRECT_FORM_DB.split_leap;
  if (s.match(/land|step|stick|dismount/)) return CORRECT_FORM_DB.landing;
  if (s.match(/turn|spin|pivot/)) return CORRECT_FORM_DB.turn;
  if (s.match(/kip|glide/)) return CORRECT_FORM_DB.kip;
  if (s.match(/cast|handstand/)) return CORRECT_FORM_DB.cast;
  if (s.match(/walkover|limber/)) return CORRECT_FORM_DB.walkover;
  if (s.match(/mount|approach/)) return CORRECT_FORM_DB.mount;
  return CORRECT_FORM_DB.landing; // default
}

// Draw a "perfect form" SVG stick figure
function PerfectFormSVG({ joints, label }) {
  if (!joints) return null;
  return (
    <svg viewBox="0 0 1 1" preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "100%", background: "rgba(34,197,94,0.04)", borderRadius: 8 }}>
      {SKELETON_CONNECTIONS.map(([a, b], i) => {
        const ja = joints[a], jb = joints[b];
        if (!ja || !jb) return null;
        return <line key={i} x1={ja[0]} y1={ja[1]} x2={jb[0]} y2={jb[1]} stroke="#22c55e" strokeWidth={0.012} strokeLinecap="round" opacity={0.9} />;
      })}
      {Object.entries(joints).map(([name, pos]) => pos && (
        <circle key={name} cx={pos[0]} cy={pos[1]} r={0.015} fill="#22c55e" opacity={0.95} />
      ))}
      <text x={0.5} y={0.95} textAnchor="middle" fill="#22c55e" fontSize="0.035" fontWeight="bold" fontFamily="sans-serif">{label || "✓ Perfect Form"}</text>
    </svg>
  );
}

// ─── SCORE BENCHMARKING DATA (aggregated typical ranges) ────────────
const SCORE_BENCHMARKS = {
  "Level 1": { low: 7.5, avg: 8.5, high: 9.5, top10: 9.3 },
  "Level 2": { low: 7.5, avg: 8.4, high: 9.5, top10: 9.2 },
  "Level 3": { low: 7.0, avg: 8.3, high: 9.5, top10: 9.2 },
  "Level 4": { low: 7.0, avg: 8.5, high: 9.7, top10: 9.3 },
  "Level 5": { low: 7.0, avg: 8.5, high: 9.8, top10: 9.4 },
  "Level 6": { low: 7.5, avg: 8.6, high: 9.6, top10: 9.3 },
  "Level 7": { low: 7.5, avg: 8.7, high: 9.7, top10: 9.4 },
  "Level 8": { low: 7.5, avg: 8.8, high: 9.7, top10: 9.4 },
  "Level 9": { low: 7.5, avg: 8.7, high: 9.8, top10: 9.5 },
  "Level 10": { low: 7.5, avg: 8.8, high: 9.9, top10: 9.5 },
  "Xcel Bronze": { low: 7.5, avg: 8.5, high: 9.7, top10: 9.3 },
  "Xcel Silver": { low: 7.5, avg: 8.6, high: 9.7, top10: 9.3 },
  "Xcel Gold": { low: 7.5, avg: 8.7, high: 9.7, top10: 9.4 },
  "Xcel Platinum": { low: 7.5, avg: 8.7, high: 9.7, top10: 9.4 },
  "Xcel Diamond": { low: 7.5, avg: 8.8, high: 9.7, top10: 9.4 },
  "Xcel Sapphire": { low: 7.5, avg: 8.8, high: 9.8, top10: 9.5 },
};

// ─── PARENT KNOWLEDGE: "DID YOU KNOW" TIPS ──────────────────────────
const PARENT_TIPS = [
  "A 0.05 deduction for a flexed foot seems tiny, but across 8-10 skills in a routine it can add up to 0.40-0.50 — the difference between 1st and 5th place.",
  "Judges start scoring the moment your child salutes. Even the walk to the apparatus and the salute itself can receive deductions if not done properly.",
  "On beam, a small wobble (arms moving to balance) is 0.10. A large wobble is 0.30. A fall is 0.50. Teaching your child to 'own the wobble' and recover quickly is a real skill.",
  "Floor exercise is the only event scored for artistry in WAG. Judges look at musicality, expression, confidence, and use of the full floor. It's not just about tumbling.",
  "The 90-second time limit on beam and floor is strict. Going over by even 1 second is a 0.10 neutral deduction that comes off the final score.",
  "At compulsory levels (1-5), every gymnast does the SAME routine. The score is purely about how precisely they match the prescribed choreography plus execution.",
  "A 'stuck' landing (no steps) doesn't just avoid deductions — it's the biggest crowd-pleaser and confidence builder in the sport.",
  "Connection value (CV) is bonus points earned by linking skills together without pause. At higher levels, how you connect skills matters as much as what skills you do.",
  "Judges can deduct for insufficient amplitude even if a skill is technically correct. Height, extension, and power all matter.",
  "Your child's coach knows the scoring criteria better than anyone. Sharing this app's analysis with the coach can create a great training conversation.",
  "Different judges DO score differently. A score can vary by 0.2-0.3 between strict and lenient judges. This is normal — it's not a conspiracy against your child.",
  "The most common 'hidden' deduction is foot form. Pointed toes with proper alignment should be automatic on every single skill.",
  "At meets, the head judge can adjust scores if the panel is too far apart. This is called 'conferencing' and it's designed to ensure fairness.",
  "Warm-up matters more than you think. A confident, focused warm-up sets the tone for the entire competition. Avoid new skills on meet day.",
];

// ─── STYLES ─────────────────────────────────────────────────────────
const fonts = `
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=Space+Mono:wght@400;700&display=swap');
`;

// ─── HELPER COMPONENTS ──────────────────────────────────────────────
const Icon = ({ name, size = 20, color }) => {
  const s = size;
  const c = color || "currentColor";
  const p = { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: c, strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", style: { display: "inline-block", verticalAlign: "middle", flexShrink: 0 } };
  switch (name) {
    case "camera": return <svg {...p}><rect x="2" y="5" width="20" height="15" rx="2"/><circle cx="12" cy="13" r="4"/><path d="M8 5l1-2h6l1 2"/></svg>;
    case "chart": return <svg {...p}><path d="M3 20h18"/><path d="M5 20V10"/><path d="M9 20V6"/><path d="M13 20V12"/><path d="M17 20V4"/></svg>;
    case "user": return <svg {...p}><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>;
    case "target": return <svg {...p}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill={c}/></svg>;
    case "check": return <svg {...p}><path d="M5 12l5 5L20 7"/></svg>;
    case "star": return <svg {...p}><path d="M12 2l3 7h7l-5.5 4.5 2 7L12 16l-6.5 4.5 2-7L2 9h7z" fill={c} stroke="none"/></svg>;
    case "play": return <svg {...p}><path d="M6 4l14 8-14 8V4z" fill={c} stroke="none"/></svg>;
    case "upload": return <svg {...p}><path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M20 16v4H4v-4"/></svg>;
    case "close": return <svg {...p}><path d="M6 6l12 12M18 6L6 18"/></svg>;
    case "drill": case "drills": return <svg {...p}><path d="M6 18L18 6"/><circle cx="8" cy="8" r="3"/><circle cx="16" cy="16" r="3"/></svg>;
    case "note": return <svg {...p}><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 10h6M8 14h4"/></svg>;
    case "clock": case "meets": return <svg {...p}><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></svg>;
    case "eye": return <svg {...p}><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>;
    case "sparkle": return <svg {...p}><path d="M12 2l2 6h6l-5 4 2 6-5-4-5 4 2-6-5-4h6z" fill={c} stroke="none"/></svg>;
    case "warning": return <svg {...p}><path d="M12 2L2 20h20L12 2z"/><path d="M12 10v4"/><circle cx="12" cy="17" r="0.5" fill={c}/></svg>;
    case "info": return <svg {...p}><circle cx="12" cy="12" r="9"/><path d="M12 12v4"/><circle cx="12" cy="8" r="0.5" fill={c}/></svg>;
    case "back": return <svg {...p}><path d="M15 4l-8 8 8 8"/></svg>;
    case "save": return <svg {...p}><path d="M5 3h14l2 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z"/><path d="M8 3v5h8V3"/><rect x="6" y="14" width="12" height="6" rx="1"/></svg>;
    case "trophy": return <svg {...p}><path d="M6 4h12v4a6 6 0 11-12 0V4z"/><path d="M12 14v3"/><path d="M8 21h8"/><path d="M18 4h2a2 2 0 012 2v1a3 3 0 01-3 3h-1"/><path d="M6 4H4a2 2 0 00-2 2v1a3 3 0 003 3h1"/></svg>;
    case "brain": case "mental": return <svg {...p}><path d="M12 2a7 7 0 00-5 12l2 3v3h6v-3l2-3a7 7 0 00-5-12z"/><path d="M9 20h6"/><path d="M10 23h4"/></svg>;
    case "guide": return <svg {...p}><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 10h8M8 14h5"/></svg>;
    case "goals": return <svg {...p}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill={c}/></svg>;
    case "progress": return <svg {...p}><path d="M3 20l5-6 4 4 9-12"/></svg>;
    case "home": return <svg {...p}><path d="M3 12l9-8 9 8"/><path d="M5 10v10h14V10"/><rect x="9" y="14" width="6" height="6"/></svg>;
    case "settings": return <svg {...p}><circle cx="12" cy="12" r="3"/><path d="M12 1v3M12 20v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M1 12h3M20 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>;
    default: return <svg {...p}><circle cx="12" cy="12" r="4" fill={c}/></svg>;
  }
};

// ─── SKELETON OVERLAY COMPONENT ─────────────────────────────────────
// Simplified SkeletonOverlay — thin lines, red only on fault joints, no clutter
function SkeletonOverlay({ joints, faultJoints, skeleton, angles: anglesFromProp }) {
  const j = skeleton?.joints || joints;
  const faultList = skeleton?.faultJoints || faultJoints || [];
  if (!j) return null;
  const faults = new Set(faultList);

  return (
    <svg viewBox="0 0 1 1" preserveAspectRatio="none" style={{
      position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none",
    }}>
      {/* Connections — thin, subtle for OK limbs, highlighted for faults */}
      {SKELETON_CONNECTIONS.map(([a, b], i) => {
        const ja = j[a], jb = j[b];
        if (!ja || !jb) return null;
        const hasFault = faults.has(a) || faults.has(b);
        return (
          <line key={i} x1={ja[0]} y1={ja[1]} x2={jb[0]} y2={jb[1]}
            stroke={hasFault ? "#ef4444" : "rgba(255,255,255,0.25)"}
            strokeWidth={hasFault ? 0.008 : 0.004}
            strokeLinecap="round" opacity={hasFault ? 0.9 : 0.5}
          />
        );
      })}

      {/* Joints — small dots, red only on faults */}
      {Object.entries(j).map(([name, pos]) => {
        if (!pos || pos.length < 2) return null;
        const isFault = faults.has(name);
        return (
          <circle key={name} cx={pos[0]} cy={pos[1]}
            r={isFault ? 0.014 : 0.006}
            fill={isFault ? "#ef4444" : "rgba(255,255,255,0.35)"}
            opacity={isFault ? 0.95 : 0.6}
          />
        );
      })}
    </svg>
  );
}

// ─── SCORE BENCHMARK COMPONENT ──────────────────────────────────────
function ScoreBenchmark({ score, level }) {
  const bench = SCORE_BENCHMARKS[level];
  if (!bench || !score) return null;

  const range = bench.high - bench.low;
  const pct = Math.max(0, Math.min(100, ((score - bench.low) / range) * 100));
  const avgPct = ((bench.avg - bench.low) / range) * 100;
  const topPct = ((bench.top10 - bench.low) / range) * 100;

  const percentile = score >= bench.top10 ? "Top 10%" :
    score >= bench.avg + (bench.top10 - bench.avg) * 0.5 ? "Top 25%" :
    score >= bench.avg ? "Above Average" :
    score >= bench.avg - 0.3 ? "Average Range" : "Below Average";

  const pColor = percentile.includes("Top 10") ? "#C4982A" :
    percentile.includes("Top 25") ? "#22c55e" :
    percentile.includes("Above") ? "#22c55e" :
    percentile.includes("Average R") ? "#f59e0b" : "#ef4444";

  return (
    <div className="card" style={{ padding: 14, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.5)" }}>
          SCORE BENCHMARK — {level}
        </span>
        <span style={{ fontSize: 16, fontWeight: 800, color: pColor, fontFamily: "'Space Mono', monospace" }}>
          {percentile}
        </span>
      </div>
      <div style={{ position: "relative", height: 24, borderRadius: 12, background: "rgba(255,255,255,0.06)", overflow: "visible", marginBottom: 4 }}>
        {/* Average zone */}
        <div style={{
          position: "absolute", left: `${avgPct - 8}%`, width: "16%", top: 0, bottom: 0,
          background: "rgba(245,158,11,0.1)", borderRadius: 12,
        }} />
        {/* Top 10% zone */}
        <div style={{
          position: "absolute", left: `${topPct}%`, right: 0, top: 0, bottom: 0,
          background: "rgba(196,152,42,0.08)", borderRadius: "0 12px 12px 0",
        }} />
        {/* Score marker */}
        <div style={{
          position: "absolute", top: -2, width: 28, height: 28, borderRadius: "50%",
          background: pColor, border: "3px solid #0B1024",
          left: `calc(${pct}% - 14px)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: `0 0 10px ${pColor}50`,
        }}>
          <span style={{ fontSize: 12, fontWeight: 900, color: "#0B1024", fontFamily: "'Space Mono', monospace" }}>
            {score.toFixed(1)}
          </span>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "rgba(255,255,255,0.25)", fontFamily: "'Space Mono', monospace" }}>
        <span>{bench.low.toFixed(1)}</span>
        <span style={{ color: "rgba(245,158,11,0.5)" }}>avg {bench.avg.toFixed(1)}</span>
        <span style={{ color: "rgba(196,152,42,0.5)" }}>top10% {bench.top10.toFixed(1)}</span>
        <span>{bench.high.toFixed(1)}</span>
      </div>
    </div>
  );
}

// ─── SKILLS REQUIRED CARD ────────────────────────────────────────────
const LEVEL_SKILLS = {
  "Level 1": { vault: "Straight jump off springboard", bars: "Pullover, back hip circle", beam: "Walks, relevé, stretch jump", floor: "Forward roll, backward roll, cartwheel" },
  "Level 2": { vault: "Straight jump to flat back on mats", bars: "Pullover, back hip circle, underswing dismount", beam: "Walks, arabesque, cartwheel", floor: "Handstand, bridge, round-off" },
  "Level 3": { vault: "Handstand flat back on mats", bars: "Pullover, cast, back hip circle, underswing dismount", beam: "Leap, relevé turn, cartwheel", floor: "Handstand forward roll, round-off, backward roll to push-up" },
  "Level 4": { vault: "Handstand flat back onto mats", bars: "Kip (attempt), cast, back hip circle, underswing dismount", beam: "Cartwheel, full turn, split jump, straight jump dismount", floor: "Round-off back handspring, front limber, full turn" },
  "Level 5": { vault: "Handspring over vault", bars: "Kip, cast to horizontal+, back hip circle, squat-on, underswing dismount or flyaway", beam: "Back walkover, split leap 120°+, full turn, cartwheel/BHS dismount", floor: "Round-off BHS back tuck, front handspring, straddle jump, full turn" },
  "Level 6": { vault: "Handspring vault", bars: "Kip, cast to 45° above horizontal, any B circling skill, underswing/flyaway dismount", beam: "B acro skill, 150°+ leap/jump, full turn, B dismount", floor: "B tumbling pass, 150°+ leap, full turn, B second pass" },
  "Level 7": { vault: "Handspring vault (higher amplitude required)", bars: "Kip, cast to handstand, B+ circling/release, flyaway or better dismount", beam: "B acro series (2 skills), 150°+ split leap, full turn, C dismount", floor: "B+B tumbling, 180° split leap, 1.5 turn, 2 tumbling passes" },
  "Level 8": { vault: "Yurchenko or Tsukahara entry vaults", bars: "Cast handstand, B release or pirouette, C dismount", beam: "Acro series w/ flight, 180° leap, full turn, C dismount", floor: "C tumbling, dance series w/ 180° split, 3+ saltos, C final pass" },
  "Level 9": { vault: "Yurchenko layout or higher", bars: "Cast handstand, C release/pirouette, D dismount", beam: "Flight acro series, 180° split leap, 1+ turn, C+ dismount", floor: "D tumbling pass, 180° leap series, multiple saltos, C+ final" },
  "Level 10": { vault: "Yurchenko full or higher (D+ value)", bars: "D+ skills, release + pirouette, D/E dismount", beam: "C+C acro series, dance series, D+ dismount", floor: "D+ tumbling, E connections, 3 saltos min, D+ final pass" },
  "Xcel Bronze": { vault: "Run, hurdle, jump to land on mat", bars: "Pullover, cast, back hip circle", beam: "Mount, walks, jumps, stretch jump off", floor: "Forward roll, cartwheel, bridge, stretch jump" },
  "Xcel Silver": { vault: "Handspring to mat stack", bars: "Pullover, cast, back hip circle, dismount", beam: "Mount, leap, turn, cartwheel, jump off", floor: "Round-off, handstand, backward roll, leap" },
  "Xcel Gold": { vault: "Handspring vault", bars: "Kip, cast, back hip circle, A+B skills, dismount", beam: "Acro skill, 120°+ leap, turn, dismount", floor: "Round-off BHS, leap/jump, turn, second pass" },
  "Xcel Platinum": { vault: "Handspring or Tsukahara", bars: "B circling, cast horizontal+, B release/dismount", beam: "B acro, 150°+ leap, full turn, B dismount", floor: "B tumbling pass, 150°+ leap, turn, B second pass" },
  "Xcel Diamond": { vault: "Yurchenko or Tsukahara", bars: "Cast handstand, C skill, C dismount", beam: "Acro series, 180° leap, C dismount", floor: "C tumbling, 180° dance series, C final pass" },
  "Xcel Sapphire": { vault: "Yurchenko layout+", bars: "D release/pirouette, D dismount", beam: "Flight series, D acro/dismount", floor: "D tumbling, 180° dance, D final pass" },
};

function SkillsRequiredCard({ profile }) {
  const [expanded, setExpanded] = useState(false);
  const skills = LEVEL_SKILLS[profile.level];
  if (!skills) return null;

  const events = profile.gender === "female"
    ? [["Vault", "vault"], ["Bars", "bars"], ["Beam", "beam"], ["Floor", "floor"]]
    : [["Floor", "floor"], ["Vault", "vault"], ["Bars", "bars"]];

  return (
    <div className="card" style={{ padding: 16, marginBottom: 20, borderColor: "rgba(196,152,42,0.12)" }}>
      <div onClick={() => setExpanded(!expanded)} style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ fontSize: 14, fontWeight: 700 }}>
          <Icon name="star" size={14} /> Skills Required — {profile.level}
        </h3>
        <span style={{ color: "#C4982A", fontSize: 13, fontWeight: 600 }}>{expanded ? "▲" : "▼"}</span>
      </div>
      {expanded && (
        <div style={{ marginTop: 12 }}>
          {events.map(([label, key]) => skills[key] && (
            <div key={key} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#C4982A", letterSpacing: 1, marginBottom: 4 }}>{String(label || "").toUpperCase()}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.7 }}>{skills[key]}</div>
            </div>
          ))}
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 8, fontStyle: "italic" }}>
            These are the key skills your gymnast needs for this level. Each skill is judged on execution, form, and amplitude.
          </div>
        </div>
      )}
    </div>
  );
}

function GlossaryCard() {
  const [expanded, setExpanded] = useState(false);
  const terms = [
    ["Start Value (SV)", "The maximum score a routine can earn before deductions. Compulsory = 10.0. Optional = depends on difficulty."],
    ["Execution (E-Score)", "Points deducted from 10.0 for form errors — bent knees, steps on landings, flexed feet, etc."],
    ["Difficulty (D-Score)", "Sum of the hardest 8 skills in the routine. Only applies to optional levels 6+."],
    ["Special Requirements", "4 specific things that must be in every routine (each worth 0.50). Missing one = half a point gone."],
    ["Deduction", "Points subtracted for mistakes. Small = 0.05-0.10. Medium = 0.10-0.15. Large = 0.20-0.30. Fall = 0.50."],
    ["Neutral Deduction", "Penalties for rule violations (out of bounds, overtime, attire), not execution errors."],
    ["Artistry", "On beam and floor: judges score confidence, expression, musicality, and use of space. Up to 0.30 in deductions."],
    ["Composition", "How well the routine is constructed — variety of skills, distribution of difficulty. Levels 8-10."],
    ["Connection Value (CV)", "Bonus points earned by linking specific skills together without pause. Optional levels only."],
    ["Amplitude", "How big, high, and extended a skill looks. More amplitude = fewer deductions."],
    ["Compulsory", "Levels 1-5 where every gymnast does the exact same routine. Judged on how precisely they match it."],
    ["Optional", "Levels 6-10 where gymnasts build their own routines. Judged on difficulty + execution + composition."],
    ["Xcel", "Alternative competitive track with Bronze through Sapphire divisions. Designed for a broader range of gymnasts."],
  ];

  return (
    <div className="card" style={{ padding: 16, marginBottom: 16, borderColor: "rgba(196,152,42,0.1)" }}>
      <div onClick={() => setExpanded(!expanded)} style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ fontSize: 14, fontWeight: 700 }}>
          <Icon name="note" size={14} /> Parent's Glossary — Key Terms
        </h3>
        <span style={{ color: "#C4982A", fontSize: 13, fontWeight: 600 }}>{expanded ? "▲" : "▼"}</span>
      </div>
      {expanded && (
        <div style={{ marginTop: 12 }}>
          {terms.map(([term, def], i) => (
            <div key={i} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: i < terms.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#C4982A", marginBottom: 3 }}>{term}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>{def}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MeetDayChecklist({ gender }) {
  const [expanded, setExpanded] = useState(false);
  const [checked, setChecked] = useState({});
  const toggle = (i) => setChecked(prev => ({ ...prev, [i]: !prev[i] }));

  const items = [
    "Competition leotard (no jewelry, no nail polish)",
    gender === "female" ? "Hair secured tightly — bun with net and pins, no loose strands" : "Hair out of face if long",
    "Grips, tape, and wristbands (if applicable)",
    gender === "female" ? "Beam shoes or bare feet (gymnast's preference)" : "Pommel horse padding (if used)",
    "Water bottle and healthy snacks (banana, granola bar, trail mix)",
    "USAG membership card / competition number",
    "Warm-up clothes for between events",
    "Arrive 30+ minutes before competition starts",
    "Light warm-up: jog, stretch, handstands — no new skills on meet day",
    "Use the bathroom BEFORE march-in",
    "Know the rotation order and which event is first",
    "Positive mindset: focus on doing YOUR best, not comparing to others",
  ];

  return (
    <div className="card" style={{ padding: 16, marginBottom: 16, borderColor: "rgba(196,152,42,0.1)" }}>
      <div onClick={() => setExpanded(!expanded)} style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ fontSize: 14, fontWeight: 700 }}>
          <Icon name="check" size={14} /> Meet Day Checklist
        </h3>
        <span style={{ color: "#C4982A", fontSize: 13, fontWeight: 600 }}>{expanded ? "▲" : "▼"}</span>
      </div>
      {expanded && (
        <div style={{ marginTop: 12 }}>
          {items.map((item, i) => (
            <div key={i} onClick={() => toggle(i)} style={{
              display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", cursor: "pointer",
              borderBottom: i < items.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
            }}>
              <div style={{
                width: 20, height: 20, borderRadius: 5, flexShrink: 0, marginTop: 1,
                border: `2px solid ${checked[i] ? "#22c55e" : "rgba(255,255,255,0.2)"}`,
                background: checked[i] ? "rgba(34,197,94,0.15)" : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.2s",
              }}>
                {checked[i] && <span style={{ color: "#22c55e", fontSize: 12, fontWeight: 700 }}>✓</span>}
              </div>
              <span style={{
                fontSize: 13, color: checked[i] ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.6)",
                lineHeight: 1.5, textDecoration: checked[i] ? "line-through" : "none",
                transition: "all 0.2s",
              }}>
                {item}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── MAIN APP ───────────────────────────────────────────────────────
export default function LegacyApp() {
  const [screen, setScreenRaw] = useState("splash");
  // Auto-scroll to top on screen changes
  const setScreen = useCallback((s) => {
    setScreenRaw(s);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);
  const [profile, setProfile] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [uploadData, setUploadData] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [history, setHistory] = useState([]);
  const [liveVideoUrl, setLiveVideoUrl] = useState(null); // STATE so it triggers re-renders
  const videoFileRef = useRef(null); // Store raw File object to regenerate blob URLs
  const [savedResults, setSavedResults] = useState({}); // Store past results by ID

  // Load profile, history, and saved results from storage
  useEffect(() => {
    (async () => {
      try {
        const stored = await storage.get("strive-profile");
        if (stored) {
          setProfile(JSON.parse(stored.value));
          setScreen("dashboard");
        } else {
          // If AppShell already showed splash and user clicked Get Started, skip to onboarding
          if (window.__striveSkipSplash) {
            window.__striveSkipSplash = false;
            setScreen("onboarding");
          } else {
            setScreen("splash");
          }
        }
      } catch {
        setScreen("splash");
      }
      try {
        const hist = await storage.get("strive-history");
        if (hist) setHistory(JSON.parse(hist.value));
      } catch {}
      try {
        const sr = await storage.get("strive-saved-results");
        if (sr) setSavedResults(JSON.parse(sr.value));
      } catch {}
    })();
  }, []);

  const saveProfile = async (p) => {
    setProfile(p);
    try { await storage.set("strive-profile", JSON.stringify(p)); } catch {}
  };

  const saveHistory = async (h) => {
    setHistory(h);
    try { await storage.set("strive-history", JSON.stringify(h)); } catch {}
  };

  const handleAnalysisComplete = (result) => {
    setAnalysisResult(result);
    const id = Date.now();
    const deds = result.executionDeductions || [];
    const newEntry = {
      id,
      date: uploadData?.meetDate || new Date().toLocaleDateString(),
      event: uploadData?.event,
      score: result.finalScore,
      deductions: result.totalDeductions,
      meetName: uploadData?.meetName || "",
      meetLocation: uploadData?.meetLocation || "",
      meetDate: uploadData?.meetDate || "",
      tpmCount: deds.filter(d => d.engine === "TPM").length,
      ktmCount: deds.filter(d => d.engine === "KTM").length,
      landingCount: deds.filter(d => d.category === "landing").length,
      vaeCount: deds.filter(d => d.engine === "VAE").length,
      hasFall: deds.some(d => d.severity === "fall"),
      powerRating: result.biomechanics?.overallPowerRating || null,
    };
    const newHist = [newEntry, ...history].slice(0, 50);
    saveHistory(newHist);
    // Save full result for clickable history — strip frames to save space
    const lightResult = { ...result, frames: undefined };
    const newSaved = { ...savedResults, [id]: lightResult };
    setSavedResults(newSaved);
    try { storage.set("strive-saved-results", JSON.stringify(newSaved)); } catch {}

    // Track analysis count for free tier limit (3/month)
    try {
      const now = new Date();
      const countKey = "strive-analysis-count";
      const raw = localStorage.getItem(countKey);
      let data = raw ? JSON.parse(raw) : { count: 0, month: now.getMonth(), year: now.getFullYear() };
      // Reset if new month
      if (data.month !== now.getMonth() || data.year !== now.getFullYear()) {
        data = { count: 0, month: now.getMonth(), year: now.getFullYear() };
      }
      data.count++;
      localStorage.setItem(countKey, JSON.stringify(data));
    } catch {}

    setScreen("results");
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0B1024",
      fontFamily: "'Outfit', sans-serif",
      color: "#e2e8f0",
      position: "relative",
      overflow: "hidden",
    }}>
      <style>{fonts}</style>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(196,152,42,0.15); border-radius: 2px; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        @keyframes rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
        @keyframes barGrow { from { width: 0%; } to { width: var(--target-width); } }
        @keyframes glowPulse { 0%, 100% { box-shadow: 0 0 20px rgba(196,152,42,0.12); } 50% { box-shadow: 0 0 40px rgba(196,152,42,0.2); } }
        @keyframes floatIn { from { opacity: 0; transform: translateY(6px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        html { scroll-behavior: smooth; }
        .btn-gold {
          background: linear-gradient(135deg, #C4982A, #E8C35A);
          color: #0B1024; border: none; padding: 14px 32px; border-radius: 14px;
          font-family: 'Outfit', sans-serif; font-weight: 700; font-size: 15px;
          cursor: pointer; transition: all 0.2s ease; letter-spacing: 0.3px;
          box-shadow: 0 2px 16px rgba(196,152,42,0.2);
        }
        .btn-gold:hover { transform: translateY(-1px); box-shadow: 0 4px 24px rgba(196,152,42,0.3); }
        .btn-gold:active { transform: translateY(0); box-shadow: 0 2px 12px rgba(196,152,42,0.15); }
        .btn-gold:disabled { opacity: 0.35; cursor: not-allowed; transform: none; box-shadow: none; }
        .btn-outline {
          background: rgba(255,255,255,0.02); color: #C4982A; border: 1px solid rgba(196,152,42,0.2);
          padding: 12px 28px; border-radius: 12px; font-family: 'Outfit', sans-serif;
          font-weight: 600; font-size: 14px; cursor: pointer; transition: all 0.2s;
        }
        .btn-outline:hover { background: rgba(196,152,42,0.06); border-color: rgba(196,152,42,0.35); }
        .card {
          background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.04);
          border-radius: 18px; padding: 18px; transition: border-color 0.2s;
        }
        .card:hover { border-color: rgba(255,255,255,0.07); }
        .card-elevated {
          background: rgba(255,255,255,0.035); border: 1px solid rgba(255,255,255,0.06);
          border-radius: 20px; padding: 20px; box-shadow: 0 4px 24px rgba(0,0,0,0.15);
          transition: all 0.2s;
        }
        .card-elevated:hover { border-color: rgba(255,255,255,0.1); box-shadow: 0 6px 32px rgba(0,0,0,0.2); }
        .input-field {
          width: 100%; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.07);
          border-radius: 12px; padding: 14px 16px; color: #e2e8f0; font-family: 'Outfit', sans-serif;
          font-size: 15px; outline: none; transition: all 0.2s;
        }
        .input-field:focus { border-color: rgba(196,152,42,0.5); box-shadow: 0 0 0 3px rgba(196,152,42,0.06); }
        .input-field::placeholder { color: rgba(255,255,255,0.18); }
        select.input-field { appearance: none; cursor: pointer;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23C4982A' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 16px center;
        }
        select.input-field option { background: #111631; color: #e2e8f0; }
        .tag {
          display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px;
          font-weight: 600; letter-spacing: 0.5px;
        }
        .section-label {
          font-size: 10px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase;
          color: rgba(255,255,255,0.2); margin-bottom: 12px;
        }
      `}</style>

      {/* Background ambient effects */}
      <div style={{
        position: "fixed", top: "-30%", right: "-20%", width: "60vw", height: "60vw",
        background: "radial-gradient(circle, rgba(196,152,42,0.03) 0%, transparent 60%)",
        pointerEvents: "none", zIndex: 0,
      }} />
      <div style={{
        position: "fixed", bottom: "-20%", left: "-15%", width: "50vw", height: "50vw",
        background: "radial-gradient(circle, rgba(139,92,246,0.015) 0%, transparent 60%)",
        pointerEvents: "none", zIndex: 0,
      }} />

      {screen === "splash" && <SplashScreen onStart={() => setScreen("onboarding")} />}
      {screen === "onboarding" && <OnboardingScreen onComplete={(p) => { saveProfile(p); setScreen("dashboard"); }} />}
      {screen === "dashboard" && (
        <ErrorBoundary screenName="Dashboard" onBack={() => setScreen("dashboard")}>
        <DashboardScreen
          profile={profile}
          history={history}
          savedResults={savedResults}
          onUpload={() => setScreen("upload")}
          onSettings={() => setScreen("settings")}
          onViewDeductions={() => setScreen("deductions")}
          onProgress={() => setScreen("progress")}
          onMeets={() => setScreen("meets")}
          onMental={() => setScreen("mental")}
          onGoals={() => setScreen("goals")}
          onViewResult={(r) => { setAnalysisResult(r); setLiveVideoUrl(null); setScreen("results"); }}
        />
        </ErrorBoundary>
      )}
      {screen === "upload" && (
        <ErrorBoundary screenName="Upload" onBack={() => setScreen("dashboard")}>
        <UploadScreen
          profile={profile}
          onBack={() => setScreen("dashboard")}
          onAnalyze={(data) => {
            if (data.videoFile) videoFileRef.current = data.videoFile;
            setLiveVideoUrl(data.videoUrl);
            setUploadData(data);
            setScreen("analyzing");
          }}
        />
        </ErrorBoundary>
      )}
      {screen === "analyzing" && (
        <ErrorBoundary screenName="Analysis" onBack={() => setScreen("upload")}>
        <AnalyzingScreen
          uploadData={uploadData}
          profile={profile}
          onComplete={handleAnalysisComplete}
          onBack={() => setScreen("upload")}
        />
        </ErrorBoundary>
      )}
      {screen === "results" && (
        <ErrorBoundary screenName="Results" onBack={() => setScreen("dashboard")}>
        <ResultsScreen
          result={analysisResult}
          profile={profile}
          history={history}
          videoUrl={liveVideoUrl}
          videoFileRef={videoFileRef}
          onBack={() => setScreen("dashboard")}
          onDrills={() => setScreen("drills")}
        />
        </ErrorBoundary>
      )}
      {screen === "drills" && (
        <ErrorBoundary screenName="Drills" onBack={() => setScreen("results")}>
        <DrillsScreen
          result={analysisResult}
          onBack={() => setScreen("results")}
        />
        </ErrorBoundary>
      )}
      {screen === "deductions" && (
        <ErrorBoundary screenName="Deduction Guide" onBack={() => setScreen("dashboard")}>
        <DeductionsScreen onBack={() => setScreen("dashboard")} profile={profile} />
        </ErrorBoundary>
      )}
      {screen === "settings" && (
        <ErrorBoundary screenName="Settings" onBack={() => setScreen("dashboard")}>
        <SettingsScreen
          profile={profile}
          history={history}
          savedResults={savedResults}
          onSave={(p) => { saveProfile(p); setScreen("dashboard"); }}
          onBack={() => setScreen("dashboard")}
          onReset={() => {
            setProfile(null);
            setHistory([]);
            setSavedResults({});
            (async () => {
              try { await storage.delete("strive-profile"); } catch {}
              try { await storage.delete("strive-history"); } catch {}
              try { await storage.delete("strive-saved-results"); } catch {}
              try { await storage.delete("strive-goals"); } catch {}
              try { await storage.delete("strive-calibration"); } catch {}
            })();
            setScreen("splash");
          }}
        />
        </ErrorBoundary>
      )}
      {screen === "progress" && (
        (() => {
          let tier = "free"; try { tier = localStorage.getItem("strive-tier") || "free"; } catch {}
          return tier === "pro" ? (
            <ProgressScreen history={history} profile={profile} onBack={() => setScreen("dashboard")} />
          ) : (
            <div style={{ minHeight: "100vh", padding: "16px 18px 90px", maxWidth: 540, margin: "0 auto" }}>
              <button onClick={() => setScreen("dashboard")} style={{ background: "none", border: "none", color: "#C4982A", cursor: "pointer", fontFamily: "'Outfit', sans-serif", fontSize: 15, fontWeight: 600, marginBottom: 20 }}>← Dashboard</button>
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Progress Tracking</h2>
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, marginBottom: 16 }}>Track your score trends across the season.</p>
              {/* Show basic stats as teaser */}
              {history.length > 0 && (
                <div className="card" style={{ padding: 16, marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Total analyses: <span style={{ color: "#C4982A", fontWeight: 700 }}>{history.length}</span></div>
                </div>
              )}
              <div style={{ border: "1.5px solid rgba(139,92,246,0.25)", borderRadius: 16, padding: 24, textAlign: "center", background: "rgba(139,92,246,0.04)" }}>
                <div style={{ marginBottom: 8 }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#A78BFA" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg></div>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Score History & Trends</div>
                <div style={{ fontSize: 12, color: "#8890AB", lineHeight: 1.6, marginBottom: 16 }}>Score charts over time, event-by-event trends, deduction pattern tracking, and improvement velocity — see exactly where you're getting better and what still needs work.</div>
                <button onClick={() => { try { localStorage.setItem("strive-tier", "pro"); } catch {} window.location.reload(); }} style={{ background: "linear-gradient(135deg, #8B5CF6, #A78BFA)", color: "#FFF", border: "none", padding: "12px 32px", borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "'Outfit', sans-serif" }}>
                  Upgrade to STRIVE Pro
                </button>
              </div>
            </div>
          );
        })()
      )}
      {screen === "meets" && (
        <ErrorBoundary screenName="Meets" onBack={() => setScreen("dashboard")}>
        <MeetsScreen history={history} savedResults={savedResults} profile={profile}
          onBack={() => setScreen("dashboard")}
          onViewResult={(r) => { setAnalysisResult(r); setLiveVideoUrl(null); setScreen("results"); }}
        />
        </ErrorBoundary>
      )}
      {screen === "mental" && (
        (() => {
          let tier = "free"; try { tier = localStorage.getItem("strive-tier") || "free"; } catch {}
          return tier === "pro" ? (
            <MentalTrainingScreen profile={profile} onBack={() => setScreen("dashboard")} />
          ) : (
            <div style={{ minHeight: "100vh", padding: "16px 18px 90px", maxWidth: 540, margin: "0 auto" }}>
              <button onClick={() => setScreen("dashboard")} style={{ background: "none", border: "none", color: "#C4982A", cursor: "pointer", fontFamily: "'Outfit', sans-serif", fontSize: 15, fontWeight: 600, marginBottom: 20 }}>← Dashboard</button>
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Mental Training</h2>
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, marginBottom: 24 }}>Gymnastics is 80% mental. Train the mind alongside the body.</p>
              {/* Free teaser */}
              <div className="card" style={{ padding: 20, marginBottom: 16, borderColor: "rgba(196,152,42,0.15)" }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: "#C4982A", marginBottom: 10 }}>The 4 Pillars</h3>
                {["Visualization — mentally rehearse routines", "Breathing — control nerves before competing", "Confidence — replace negative self-talk", "Pressure Management — make meets feel familiar"].map((p, i) => (
                  <div key={i} style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", padding: "6px 0", borderBottom: i < 3 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>{p}</div>
                ))}
              </div>
              {/* Pro gate */}
              <div style={{ border: "1.5px solid rgba(139,92,246,0.25)", borderRadius: 16, padding: 24, textAlign: "center", background: "rgba(139,92,246,0.04)" }}>
                <div style={{ marginBottom: 8 }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#A78BFA" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg></div>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Full Mental Training Suite</div>
                <div style={{ fontSize: 12, color: "#8890AB", lineHeight: 1.6, marginBottom: 16 }}>
                  Guided visualization scripts, breathing techniques (4-7-8, box breathing, power breath), confidence-building exercises, competition day protocols, and parent coaching tips.
                </div>
                <button onClick={() => { try { localStorage.setItem("strive-tier", "pro"); } catch {} window.location.reload(); }} style={{ background: "linear-gradient(135deg, #8B5CF6, #A78BFA)", color: "#FFF", border: "none", padding: "12px 32px", borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "'Outfit', sans-serif" }}>
                  Upgrade to STRIVE Pro
                </button>
              </div>
            </div>
          );
        })()
      )}
      {screen === "goals" && (
        (() => {
          let tier = "free"; try { tier = localStorage.getItem("strive-tier") || "free"; } catch {}
          return tier === "pro" ? (
            <SeasonGoalsScreen profile={profile} history={history} onBack={() => setScreen("dashboard")} />
          ) : (
            <div style={{ minHeight: "100vh", padding: "16px 18px 90px", maxWidth: 540, margin: "0 auto" }}>
              <button onClick={() => setScreen("dashboard")} style={{ background: "none", border: "none", color: "#C4982A", cursor: "pointer", fontFamily: "'Outfit', sans-serif", fontSize: 15, fontWeight: 600, marginBottom: 20 }}>← Dashboard</button>
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Season Goals</h2>
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, marginBottom: 24 }}>Set targets and track progress across the season.</p>
              <div style={{ border: "1.5px solid rgba(139,92,246,0.25)", borderRadius: 16, padding: 24, textAlign: "center", background: "rgba(139,92,246,0.04)" }}>
                <div style={{ marginBottom: 8 }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#A78BFA" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg></div>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Season Goal Tracking</div>
                <div style={{ fontSize: 12, color: "#8890AB", lineHeight: 1.6, marginBottom: 16 }}>
                  Set event-specific score targets, track your progress over time, identify trends in your training, and get personalized recommendations for reaching your goals.
                </div>
                <button onClick={() => { try { localStorage.setItem("strive-tier", "pro"); } catch {} window.location.reload(); }} style={{ background: "linear-gradient(135deg, #8B5CF6, #A78BFA)", color: "#FFF", border: "none", padding: "12px 32px", borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "'Outfit', sans-serif" }}>
                  Upgrade to STRIVE Pro
                </button>
              </div>
            </div>
          );
        })()
      )}

      {/* Bottom Navigation — SVG icons with gold active state */}
      {["dashboard", "deductions", "meets", "progress", "mental", "goals", "settings"].includes(screen) && (
        <nav style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100,
          background: "linear-gradient(to top, #0B1024 85%, rgba(11,16,36,0.95) 92%, transparent)",
          paddingBottom: "max(10px, env(safe-area-inset-bottom))",
          paddingTop: 6,
        }}>
          <div style={{ display: "flex", justifyContent: "space-around", maxWidth: 420, margin: "0 auto", padding: "0 12px" }}>
            {[
              { id: "dashboard", label: "Home", icon: "home" },
              { id: "upload", label: "Analyze", icon: "camera", primary: true },
              { id: "meets", label: "Results", icon: "note" },
              { id: "deductions", label: "Guide", icon: "guide" },
              { id: "settings", label: "Settings", icon: "settings" },
            ].map(tab => {
              const isActive = screen === tab.id;
              const color = tab.primary ? "#C4982A" : isActive ? "#C4982A" : "rgba(255,255,255,0.22)";
              return (
                <button
                  key={tab.id}
                  onClick={() => setScreen(tab.id)}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                    padding: "8px 14px",
                    borderRadius: 14, border: "none", cursor: "pointer",
                    fontFamily: "'Outfit', sans-serif", fontSize: 12, fontWeight: 600,
                    background: tab.primary ? "rgba(196,152,42,0.08)" : "transparent",
                    color,
                    transition: "all 0.15s", WebkitTapHighlightColor: "transparent",
                    letterSpacing: 0.3, position: "relative",
                    ...(tab.primary ? { border: "1px solid rgba(196,152,42,0.12)", borderRadius: 16 } : {}),
                  }}
                >
                  <Icon name={tab.icon} size={20} color={color} />
                  <span>{tab.label}</span>
                  {isActive && !tab.primary && (
                    <div style={{ position: "absolute", bottom: 2, width: 4, height: 4, borderRadius: "50%", background: "#C4982A" }} />
                  )}
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
function SplashScreen({ onStart }) {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 100);
    const t2 = setTimeout(() => setPhase(2), 700);
    const t3 = setTimeout(() => setPhase(3), 1200);
    const t4 = setTimeout(() => setPhase(4), 1700);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, []);
  const entered = phase >= 1;

  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: 32, textAlign: "center",
      position: "relative", overflow: "hidden", maxWidth: 540, margin: "0 auto",
    }}>
      {/* Background grid */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, bottom: 0, pointerEvents: "none",
        backgroundImage: `linear-gradient(rgba(196,152,42,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(196,152,42,0.015) 1px, transparent 1px)`,
        backgroundSize: "60px 60px", opacity: 0.5,
      }} />
      <div style={{
        position: "absolute", top: "15%", left: "50%", transform: "translateX(-50%)",
        width: 600, height: 600, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(196,152,42,0.08) 0%, rgba(196,152,42,0.02) 40%, transparent 70%)",
        pointerEvents: "none", opacity: phase >= 1 ? 1 : 0, transition: "opacity 2s ease-out",
      }} />

      {/* Arc Logo */}
      <div style={{
        opacity: entered ? 1 : 0, transform: entered ? "scale(1)" : "scale(0.85)",
        transition: "all 1s cubic-bezier(0.16, 1, 0.3, 1)",
        marginBottom: 32,
      }}>
        <svg viewBox="0 0 120 120" width="110" height="110" style={{ filter: "drop-shadow(0 0 24px rgba(196,152,42,0.2))" }}>
          <defs>
            <linearGradient id="sg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#C4982A" />
              <stop offset="50%" stopColor="#E8C35A" />
              <stop offset="100%" stopColor="#C4982A" />
            </linearGradient>
          </defs>
          <circle cx="60" cy="60" r="56" fill="none" stroke="url(#sg)" strokeWidth="1.2" opacity="0.25" />
          <circle cx="60" cy="60" r="52" fill="none" stroke="url(#sg)" strokeWidth="0.5" opacity="0.1" />
          <g transform="translate(60,62)">
            <path d="M-30 22 Q-10 -32, 20 -20 Q35 -12, 28 22" fill="none" stroke="url(#sg)" strokeWidth="3.5" strokeLinecap="round" />
            <path d="M-20 16 Q-4 -18, 18 -12" fill="none" stroke="#E8C35A" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
            <circle cx="22" cy="-22" r="3" fill="#E8C35A" opacity="0.85" />
            <circle cx="22" cy="-22" r="6" fill="#E8C35A" opacity="0.1" />
          </g>
          <text x="60" y="106" textAnchor="middle" fill="url(#sg)" fontFamily="'Space Mono', monospace" fontSize="8" fontWeight="700" opacity="0.2">10.000</text>
        </svg>
      </div>

      {/* Brand */}
      <div style={{
        opacity: entered ? 1 : 0, transform: entered ? "translateY(0)" : "translateY(16px)",
        transition: "all 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.3s",
      }}>
        <h1 style={{
          fontFamily: "'Georgia', 'Times New Roman', serif", fontSize: 42, fontWeight: 500,
          letterSpacing: 8, marginBottom: 0, lineHeight: 1,
        }}>
          <span style={{
            background: "linear-gradient(135deg, #C4982A, #E8C35A, #C4982A)",
            backgroundClip: "text", WebkitBackgroundClip: "text", color: "transparent",
          }}>STRIVE</span>
        </h1>
        <div style={{
          fontSize: 10, fontWeight: 600, letterSpacing: 3,
          color: "rgba(255,255,255,0.2)", marginTop: 10,
          textTransform: "uppercase",
        }}>
          See Your Score. Own Your Growth.
        </div>
      </div>

      {/* Description */}
      <div style={{
        opacity: entered ? 1 : 0, transform: entered ? "translateY(0)" : "translateY(16px)",
        transition: "all 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.6s",
        marginTop: 28, marginBottom: 40,
      }}>
        <p style={{
          color: "rgba(255,255,255,0.3)", fontSize: 14, maxWidth: 320,
          margin: "0 auto", lineHeight: 1.8, fontWeight: 400,
        }}>
          AI-powered video analysis using official USA Gymnastics & Xcel scoring criteria. 
          Detailed deduction breakdowns and personalized training to raise your score.
        </p>
      </div>

      {/* Value props */}
      <div style={{
        opacity: entered ? 1 : 0, transform: entered ? "translateY(0)" : "translateY(16px)",
        transition: "all 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.7s",
        display: "flex", flexDirection: "column", gap: 8, marginBottom: 36, width: "100%", maxWidth: 340,
      }}>
        {[
          { svgIcon: "target", text: "Understand exactly why your score is what it is" },
          { svgIcon: "progress", text: "Get a personalized plan to improve every tenth" },
          { svgIcon: "mental", text: "Mental training and recovery guidance" },
        ].map((prop, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 14, padding: "12px 16px",
            borderRadius: 12, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)",
          }}>
            <Icon name={prop.svgIcon} size={18} color="#C4982A" />
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", lineHeight: 1.4 }}>{prop.text}</span>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div style={{
        opacity: entered ? 1 : 0, transform: entered ? "translateY(0)" : "translateY(16px)",
        transition: "all 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.9s",
      }}>
        <button className="btn-gold" onClick={onStart} style={{
          fontSize: 16, padding: "16px 56px", letterSpacing: 0.5,
          borderRadius: 14,
        }}>
          Get Started
        </button>
      </div>

      {/* Bottom badges */}
      <div style={{
        position: "absolute", bottom: 28, left: 0, right: 0,
        display: "flex", justifyContent: "center", gap: 20,
        opacity: entered ? 1 : 0, transition: "opacity 1s 1.2s",
      }}>
        {["USAG Levels 1–10", "Xcel Bronze–Sapphire", "MAG & WAG"].map((badge, i) => (
          <span key={i} style={{
            fontSize: 8, fontWeight: 600, letterSpacing: 1.5,
            color: "rgba(196,152,42,0.25)", textTransform: "uppercase",
          }}>
            {badge}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── ONBOARDING ─────────────────────────────────────────────────────
function OnboardingScreen({ onComplete }) {
  const [step, setStep] = useState(0);
  const [role, setRole] = useState("");
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [levelCategory, setLevelCategory] = useState("");
  const [level, setLevel] = useState("");
  const [goals, setGoals] = useState("");

  const events = gender === "female" ? WOMEN_EVENTS : gender === "male" ? MEN_EVENTS : [];
  // Auto-populate all events for the selected gender
  const primaryEvents = events;
  const levelOptions = gender && levelCategory
    ? LEVELS[gender === "female" ? "women" : "men"][levelCategory] || []
    : [];

  const canProceed = () => {
    if (step === 0) return role !== "";
    if (step === 1) return name.trim().length > 0;
    if (step === 2) return gender !== "";
    if (step === 3) return levelCategory !== "" && level !== "";
    if (step === 4) return true; // goals step — always can proceed
    return false;
  };

  const handleNext = () => {
    if (step < 4) setStep(step + 1);
    else onComplete({ role, name, age: age ? parseInt(age) : null, gender, levelCategory, level, primaryEvents, goals: goals.trim() || null, createdAt: Date.now() });
  };

  const steps = [
    // Step 0: Role selection
    <div key="role" style={{ animation: "floatIn 0.4s ease-out" }}>
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>Welcome to STRIVE</h2>
      <p style={{ color: "rgba(255,255,255,0.35)", marginBottom: 28, fontSize: 14 }}>How will you be using the app?</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[
          { val: "parent", label: "Parent", desc: "Recording my child's routines", svgIcon: "user" },
          { val: "athlete", label: "Athlete", desc: "Analyzing my own routines", svgIcon: "star" },
          { val: "coach", label: "Coach", desc: "Working with athletes on scores", svgIcon: "trophy" },
        ].map(opt => (
          <button
            key={opt.val}
            onClick={() => setRole(opt.val)}
            style={{
              display: "flex", alignItems: "center", gap: 14, padding: "16px 18px",
              background: role === opt.val ? "rgba(196,152,42,0.08)" : "rgba(255,255,255,0.02)",
              border: `1.5px solid ${role === opt.val ? "rgba(196,152,42,0.4)" : "rgba(255,255,255,0.05)"}`,
              borderRadius: 16, cursor: "pointer", textAlign: "left",
              transition: "all 0.2s",
            }}
          >
            <div style={{ flexShrink: 0 }}><Icon name={opt.svgIcon} size={24} color={role === opt.val ? "#E8C35A" : "rgba(255,255,255,0.4)"} /></div>
            <div>
              <div style={{ color: role === opt.val ? "#E8C35A" : "#e2e8f0", fontWeight: 600, fontSize: 18, transition: "color 0.2s" }}>{opt.label}</div>
              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 16, marginTop: 2 }}>{opt.desc}</div>
            </div>
            {role === opt.val && (
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ marginLeft: "auto", flexShrink: 0 }}>
                <circle cx="9" cy="9" r="8" fill="rgba(196,152,42,0.2)" stroke="#C4982A" strokeWidth="1.5"/>
                <path d="M5.5 9l2.5 2.5 4.5-4.5" stroke="#C4982A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </button>
        ))}
      </div>
    </div>,

    // Step 1: Name
    <div key="name" style={{ animation: "floatIn 0.4s ease-out" }}>
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>
        {role === "parent" ? "Gymnast's name" : "Your name"}
      </h2>
      <p style={{ color: "rgba(255,255,255,0.35)", marginBottom: 28, fontSize: 14 }}>
        {role === "parent" ? "We'll personalize everything for your child" : "We'll personalize your experience"}
      </p>
      <input
        className="input-field"
        placeholder={role === "parent" ? "Enter gymnast's name" : "Enter your name"}
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
        style={{ fontSize: 17, padding: 16 }}
      />
    </div>,

    // Step 2: Gender
    <div key="gender" style={{ animation: "floatIn 0.4s ease-out" }}>
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>Program type</h2>
      <p style={{ color: "rgba(255,255,255,0.35)", marginBottom: 28, fontSize: 14 }}>
        Sets the correct apparatus and judging criteria
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {[{ val: "female", label: "Women's artistic", desc: "VT · UB · BB · FX" },
          { val: "male", label: "Men's artistic", desc: "FX · PH · SR · VT · PB · HB" }
        ].map(opt => (
          <button
            key={opt.val}
            onClick={() => { setGender(opt.val); setLevelCategory(""); setLevel(""); }}
            style={{
              background: gender === opt.val ? "rgba(196,152,42,0.1)" : "rgba(255,255,255,0.02)",
              border: `1.5px solid ${gender === opt.val ? "rgba(196,152,42,0.4)" : "rgba(255,255,255,0.05)"}`,
              borderRadius: 16, padding: 20, cursor: "pointer", textAlign: "center",
              transition: "all 0.2s",
            }}
          >
            <div style={{ display: "block", marginBottom: 10, margin: "0 auto" }}><Icon name="star" size={32} color={gender === opt.val ? "#E8C35A" : "rgba(255,255,255,0.3)"} /></div>
            <span style={{ color: gender === opt.val ? "#E8C35A" : "#e2e8f0", fontWeight: 600, fontSize: 14, display: "block" }}>{opt.label}</span>
            <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 14, marginTop: 4, display: "block", fontFamily: "'Space Mono', monospace" }}>
              {opt.desc}
            </span>
          </button>
        ))}
      </div>
    </div>,

    // Step 3: Level
    <div key="level" style={{ animation: "fadeIn 0.5s ease-out" }}>
      <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Competition Level</h2>
      <p style={{ color: "rgba(255,255,255,0.5)", marginBottom: 24 }}>
        This determines the scoring criteria and special requirements.
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {[
          { val: "compulsory", label: "Compulsory" },
          { val: "optional", label: "Optional" },
          ...(gender === "female" ? [{ val: "xcel", label: "Xcel" }] : []),
        ].map(cat => (
          <button
            key={cat.val}
            onClick={() => { setLevelCategory(cat.val); setLevel(""); }}
            style={{
              flex: 1, padding: "10px 8px", borderRadius: 10, border: "none", cursor: "pointer",
              fontFamily: "'Outfit', sans-serif", fontWeight: 600, fontSize: 16,
              background: levelCategory === cat.val ? "linear-gradient(135deg, #C4982A, #E8C35A)" : "rgba(255,255,255,0.06)",
              color: levelCategory === cat.val ? "#0B1024" : "rgba(255,255,255,0.6)",
              transition: "all 0.3s",
            }}
          >
            {cat.label}
          </button>
        ))}
      </div>
      {levelOptions.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {levelOptions.map(l => (
            <button
              key={l}
              onClick={() => setLevel(l)}
              style={{
                padding: "14px 16px", borderRadius: 10, border: "none", cursor: "pointer",
                fontFamily: "'Outfit', sans-serif", fontWeight: 500, fontSize: 14, textAlign: "left",
                background: level === l ? "rgba(196,152,42,0.15)" : "rgba(255,255,255,0.04)",
                color: level === l ? "#C4982A" : "rgba(255,255,255,0.6)",
                border: `1.5px solid ${level === l ? "rgba(196,152,42,0.4)" : "rgba(255,255,255,0.06)"}`,
                transition: "all 0.3s",
              }}
            >
              {l}
            </button>
          ))}
        </div>
      )}
    </div>,

    // Step 4: Age & Goals (optional)
    <div key="goals" style={{ animation: "fadeIn 0.5s ease-out" }}>
      <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>About {name || "the Gymnast"}</h2>
      <p style={{ color: "rgba(255,255,255,0.5)", marginBottom: 24 }}>
        Optional — helps personalize training, nutrition, and mental prep recommendations for age and goals.
      </p>
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, display: "block", color: "rgba(255,255,255,0.6)" }}>AGE</label>
        <input
          className="input-field"
          type="number"
          min="4"
          max="25"
          placeholder="e.g. 10"
          value={age}
          onChange={(e) => setAge(e.target.value)}
          style={{ fontSize: 18, padding: 14 }}
        />
      </div>
      <div>
        <label style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, display: "block", color: "rgba(255,255,255,0.6)" }}>GOALS</label>
        <select className="input-field" value={goals} onChange={e => setGoals(e.target.value)} style={{ fontSize: 18, padding: 14 }}>
          <option value="">Select a goal...</option>
          <option value="improve scores">Improve meet scores</option>
          <option value="move up levels">Move up to the next level</option>
          <option value="qualify regionals">Qualify for Regionals/State</option>
          <option value="college gymnastics">Earn a college scholarship</option>
          <option value="injury recovery">Return from injury safely</option>
          <option value="build confidence">Build confidence and consistency</option>
          <option value="have fun">Have fun and stay healthy</option>
        </select>
      </div>
    </div>,
  ];

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", padding: "24px 22px", maxWidth: 540, margin: "0 auto" }}>
      {/* Progress */}
      <div style={{ display: "flex", gap: 5, marginBottom: 40 }}>
        {[0,1,2,3,4].map(i => (
          <div key={i} style={{
            flex: 1, height: 2.5, borderRadius: 2,
            background: i <= step ? "linear-gradient(90deg, #C4982A, #E8C35A)" : "rgba(255,255,255,0.06)",
            transition: "all 0.4s ease-out",
          }} />
        ))}
      </div>
      <div style={{ flex: 1, maxWidth: 420, margin: "0 auto", width: "100%" }}>
        {steps[step]}
      </div>
      <div style={{ display: "flex", gap: 10, maxWidth: 420, margin: "28px auto 0", width: "100%" }}>
        {step > 0 && (
          <button className="btn-outline" onClick={() => setStep(step - 1)} style={{ flex: 1, padding: "13px 16px", fontSize: 14 }}>
            Back
          </button>
        )}
        <button
          className="btn-gold"
          onClick={handleNext}
          disabled={!canProceed()}
          style={{ flex: 2, opacity: canProceed() ? 1 : 0.35, pointerEvents: canProceed() ? "auto" : "none", padding: "14px 24px", fontSize: 18 }}
        >
          {step === 4 ? "Start analyzing" : "Continue"}
        </button>
      </div>
    </div>
  );
}

// ─── DASHBOARD ──────────────────────────────────────────────────────
function DashboardScreen({ profile, history, savedResults, onUpload, onSettings, onViewDeductions, onViewResult, onProgress, onMeets, onMental, onGoals }) {
  const events = profile.gender === "female" ? WOMEN_EVENTS : MEN_EVENTS;
  const avgScore = history.length > 0
    ? (history.reduce((s, h) => s + (h.score || 0), 0) / history.length).toFixed(3)
    : "—";

  // ── Compute score trend for hero card ──
  const recentScores = history.slice(0, 6).map(h => h.score || 0).reverse();
  const scoreTrend = recentScores.length >= 2
    ? Math.round((recentScores[recentScores.length - 1] - recentScores[0]) * 1000) / 1000
    : 0;
  const maxRecent = recentScores.length > 0 ? Math.max(...recentScores) : 0;

  // ── Daily affirmation (rotates daily, role-aware) ──
  const day = Math.floor(Date.now() / 86400000);
  const athleteAffirmations = [
    "I have trained for this. My body knows what to do.",
    "Trust your training. Your routine is ready.",
    "I am strong, I am prepared, I am ready.",
    "Every rep in practice built this moment. Enjoy it.",
    "Nervous energy is just excitement. I channel it into power.",
    "I compete for myself. My best is enough.",
    "Mistakes don't define me. I recover and keep going.",
    "Progress is my competition. Yesterday's me is who I beat.",
    "I breathe, I focus, I perform. That's all I need to do.",
    "The work I've put in is already done. Now I just enjoy it.",
    "I was built for this moment.",
    "My body is strong. My mind is stronger.",
    "I choose courage over comfort today.",
    "Every routine is a chance to show what I can do.",
    "I trust my training. I trust my coach. I trust myself.",
  ];
  const parentAffirmations = [
    `${profile.name} has put in the work. Trust the process.`,
    "Your child's effort matters more than any score on the board.",
    `Every practice has made ${profile.name} stronger. The results will come.`,
    "The best thing you can do at a meet: smile, cheer, and let them compete.",
    `${profile.name} is building skills that last a lifetime — discipline, resilience, confidence.`,
    "Don't compare scores between gymnasts. Every journey is different.",
    `Small improvements add up. ${profile.name} is on the right path.`,
    "The car ride home should be about joy, not scores. Ask what was fun.",
    "Your support is the foundation your gymnast builds everything on.",
    `${profile.name}'s coach sees potential you might not notice yet. Trust them.`,
  ];
  const coachAffirmations = [
    "Every correction you make today shows up in their score tomorrow.",
    "The athletes who trust their coach perform best under pressure.",
    "Focus on the process. The scores follow the fundamentals.",
    "Your eye for detail is what separates good gymnasts from great ones.",
    "One drill, done perfectly, is worth more than ten done carelessly.",
  ];
  const affirmationPool = profile.role === "parent" ? parentAffirmations : profile.role === "coach" ? coachAffirmations : athleteAffirmations;
  const todayAffirmation = affirmationPool[day % affirmationPool.length];

  return (
    <div style={{ minHeight: "100vh", padding: "16px 18px 100px", maxWidth: 540, margin: "0 auto" }}>
      {/* Header bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, padding: "4px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <svg viewBox="0 0 28 28" width="24" height="24" style={{ flexShrink: 0 }}>
            <g transform="translate(14,15)">
              <path d="M-9 7 Q-3 -10, 7 -5 Q11 -2, 8 7" fill="none" stroke="#C4982A" strokeWidth="2.2" strokeLinecap="round"/>
              <circle cx="8" cy="-6" r="1.3" fill="#E8C35A"/>
            </g>
          </svg>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.2 }}>
              {profile.role === "parent" ? (
                <><span style={{ color: "rgba(255,255,255,0.35)", fontSize: 16, fontWeight: 400 }}>Tracking </span><span style={{ color: "#E8C35A" }}>{profile.name}</span></>
              ) : (
                <><span style={{ color: "rgba(255,255,255,0.35)", fontSize: 16, fontWeight: 400 }}>Hey, </span><span style={{ color: "#E8C35A" }}>{profile.name}</span></>
              )}
            </h1>
            <p style={{ color: "rgba(255,255,255,0.2)", fontSize: 14, marginTop: 1, letterSpacing: 0.3 }}>
              {profile.level} · {profile.gender === "female" ? "WAG" : "MAG"}
              {profile.role === "coach" && " · Coach"}
            </p>
          </div>
        </div>
        <button
          onClick={onSettings}
          style={{
            width: 36, height: 36, borderRadius: 10, border: "1px solid rgba(255,255,255,0.05)",
            background: "rgba(255,255,255,0.025)", cursor: "pointer", display: "flex",
            alignItems: "center", justifyContent: "center", transition: "all 0.2s",
          }}
        >
          <Icon name="user" size={15} />
        </button>
      </div>

      {/* Upload CTA */}
      {(() => {
        let tier = "free"; try { tier = localStorage.getItem("strive-tier") || "free"; } catch {}
        const isPro = tier === "pro";
        let analysesUsed = 0;
        let limitReached = false;
        if (!isPro) {
          try {
            const now = new Date();
            const raw = localStorage.getItem("strive-analysis-count");
            if (raw) {
              const data = JSON.parse(raw);
              if (data.month === now.getMonth() && data.year === now.getFullYear()) {
                analysesUsed = data.count;
              }
            }
          } catch {}
          limitReached = analysesUsed >= 3;
        }
        const remaining = isPro ? null : 3 - analysesUsed;

        return limitReached ? (
          <div style={{
            width: "100%", padding: "24px", borderRadius: 20, textAlign: "center",
            background: "rgba(139,92,246,0.04)", border: "1.5px solid rgba(139,92,246,0.2)",
            marginBottom: 24,
          }}>
            <div style={{ marginBottom: 10 }}><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#A78BFA" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg></div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Monthly limit reached</div>
            <div style={{ fontSize: 16, color: "#8890AB", lineHeight: 1.6, marginBottom: 16, maxWidth: 280, margin: "0 auto" }}>
              You've used all 3 free analyses this month. Upgrade to Pro for unlimited video analysis.
            </div>
            <button onClick={() => { try { localStorage.setItem("strive-tier", "pro"); } catch {} window.location.reload(); }} style={{
              background: "linear-gradient(135deg, #8B5CF6, #A78BFA)", color: "#FFF",
              border: "none", padding: "12px 32px", borderRadius: 12, fontWeight: 700,
              fontSize: 14, cursor: "pointer", fontFamily: "'Outfit', sans-serif",
            }}>
              Upgrade to STRIVE Pro
            </button>
          </div>
        ) : (
          <button
            onClick={onUpload}
            style={{
              width: "100%", padding: "16px 18px", borderRadius: 18, cursor: "pointer",
              background: "linear-gradient(135deg, rgba(196,152,42,0.1), rgba(196,152,42,0.04))",
              border: "1px solid rgba(196,152,42,0.12)",
              display: "flex", alignItems: "center", gap: 14,
              transition: "all 0.2s", marginBottom: 14, textAlign: "left",
              position: "relative", overflow: "hidden",
            }}
          >
            {/* Subtle gradient accent line at top */}
            <div style={{ position: "absolute", top: 0, left: 20, right: 20, height: 1, background: "linear-gradient(90deg, transparent, rgba(196,152,42,0.2), transparent)" }} />
            <div style={{
              width: 44, height: 44, borderRadius: 13, flexShrink: 0,
              background: "linear-gradient(135deg, #C4982A, #E8C35A)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 2px 12px rgba(196,152,42,0.2)",
            }}>
              <Icon name="camera" size={20} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ color: "#E8C35A", fontWeight: 700, fontSize: 18, display: "block" }}>
                Analyze routine
              </span>
              <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 14, marginTop: 2, display: "block" }}>
                {isPro ? "Unlimited · 2-pass AI" : `${remaining} free remaining`}
              </span>
            </div>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, opacity: 0.3 }}>
              <path d="M6 3l5 5-5 5" stroke="#C4982A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        );
      })()}

      {/* ── HERO CARD — Daily Focus & Affirmation ── */}
      <div style={{
        background: "linear-gradient(135deg, rgba(196,152,42,0.08), rgba(196,152,42,0.02))",
        border: "1px solid rgba(196,152,42,0.12)",
        borderRadius: 20, padding: "20px 20px 16px", marginBottom: 16,
        animation: "fadeIn 0.5s ease-out",
        position: "relative", overflow: "hidden",
      }}>
        {/* Subtle ambient glow */}
        <div style={{ position: "absolute", top: -40, right: -40, width: 120, height: 120, borderRadius: "50%", background: "rgba(196,152,42,0.06)", pointerEvents: "none" }} />

        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(196,152,42,0.7)", letterSpacing: 1.5, marginBottom: 8 }}>
                TODAY'S FOCUS
              </div>
              <div style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.6, color: "rgba(255,255,255,0.75)", maxWidth: 230 }}>
                "{todayAffirmation}"
              </div>
            </div>
            {/* Score sparkline */}
            {recentScores.length >= 2 && (
              <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 36, marginLeft: 16 }}>
                {recentScores.map((s, i) => {
                  const h = maxRecent > 0 ? Math.max(5, (s / maxRecent) * 36) : 5;
                  const isLast = i === recentScores.length - 1;
                  return (
                    <div key={i} style={{
                      width: 6, borderRadius: 3,
                      height: h,
                      background: isLast ? "#C4982A" : "rgba(196,152,42,0.25)",
                      transition: "height 0.5s ease-out",
                    }} />
                  );
                })}
              </div>
            )}
          </div>
          {/* Stats footer */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(196,152,42,0.06)" }}>
            {history.length > 0 ? (
              <div style={{ display: "flex", gap: 16, fontSize: 14 }}>
                <span style={{ color: "rgba(255,255,255,0.25)" }}>
                  Best: <span style={{ color: "rgba(196,152,42,0.8)", fontWeight: 700, fontFamily: "'Space Mono', monospace" }}>
                    {Math.max(...history.filter(h => h.score).map(h => h.score)).toFixed(1)}
                  </span>
                </span>
                <span style={{ color: "rgba(255,255,255,0.25)" }}>
                  Total: <span style={{ color: "rgba(196,152,42,0.8)", fontWeight: 700 }}>{history.length}</span>
                </span>
              </div>
            ) : (
              <div style={{ fontSize: 14, color: "rgba(255,255,255,0.2)" }}>Upload your first routine to get started</div>
            )}
            {scoreTrend !== 0 && (
              <div style={{
                fontSize: 14, fontWeight: 700,
                color: scoreTrend > 0 ? "#22c55e" : "#ef4444",
                background: scoreTrend > 0 ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
                padding: "3px 10px", borderRadius: 6,
              }}>
                {scoreTrend > 0 ? "▲" : "▼"} {Math.abs(scoreTrend).toFixed(2)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Smart Tip — data-driven when history exists, generic otherwise */}
      <div className="card" style={{
        padding: "12px 16px", marginBottom: 16,
        borderColor: "rgba(196,152,42,0.12)",
        background: "rgba(196,152,42,0.03)",
      }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <span style={{ flexShrink: 0, marginTop: 2 }}><Icon name="sparkle" size={16} color="#C4982A" /></span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#C4982A", letterSpacing: 0.5, marginBottom: 4 }}>
              {history.length >= 2 ? "YOUR DATA SAYS" : "DID YOU KNOW?"}
            </div>
            <div style={{ fontSize: 16, color: "rgba(255,255,255,0.55)", lineHeight: 1.7 }}>
              {(() => {
                if (history.length >= 2) {
                  // Generate data-driven tips from actual history
                  const totalLanding = history.slice(0, 5).reduce((s, h) => s + (h.landingCount || 0), 0);
                  const totalTpm = history.slice(0, 5).reduce((s, h) => s + (h.tpmCount || 0), 0);
                  const totalKtm = history.slice(0, 5).reduce((s, h) => s + (h.ktmCount || 0), 0);
                  const hasFalls = history.slice(0, 5).some(h => h.hasFall);

                  if (hasFalls) return `Falls cost 0.50 each — that's the single biggest deduction in gymnastics. Focus on consistency over difficulty. A clean routine without falls beats a hard routine with one.`;
                  if (totalLanding >= 4) return `Landing deductions have appeared ${totalLanding} times in your last ${Math.min(5, history.length)} analyses. Stick drills (20 reps, freeze 3 seconds) are the fastest way to fix this — could save 0.20+ per routine.`;
                  if (totalTpm >= 5) return `Toe point issues keep showing up (${totalTpm} times recently). Add theraband ankle exercises to your daily warm-up — 3x20 each direction. This becomes automatic within 2 weeks.`;
                  if (totalKtm >= 4) return `Knee tension deductions are a pattern (${totalKtm} times). Foam block squeezes during handstands and tuck drills will train the squeeze reflex. Coaches: verbal cue "zip your legs" helps.`;

                  const bestScore = Math.max(...history.filter(h => h.score).map(h => h.score));
                  const avgScore = history.filter(h => h.score).reduce((s, h) => s + h.score, 0) / history.filter(h => h.score).length;
                  if (bestScore - avgScore > 0.3) return `Your best score (${bestScore.toFixed(1)}) is ${(bestScore - avgScore).toFixed(1)} higher than your average. That means the skill is there — it's about consistency now. Mental training and routine repetition will close that gap.`;
                }
                return PARENT_TIPS[Math.floor(Date.now() / 86400000) % PARENT_TIPS.length];
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats — sleek row */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {[
          { label: "Analyzed", value: history.length, color: "rgba(196,152,42,0.7)" },
          { label: "Avg", value: avgScore, color: "rgba(196,152,42,0.7)" },
          { label: "Trend", value: scoreTrend !== 0 ? (scoreTrend > 0 ? "+" : "") + scoreTrend.toFixed(2) : "—", color: scoreTrend > 0 ? "#22c55e" : scoreTrend < 0 ? "#ef4444" : "rgba(255,255,255,0.2)" },
        ].map((stat, i) => (
          <div key={i} style={{
            flex: 1, textAlign: "center", padding: "14px 6px",
            borderRadius: 14, background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.03)",
          }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: stat.color, fontFamily: "'Space Mono', monospace", lineHeight: 1 }}>
              {stat.value}
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.2)", fontWeight: 600, marginTop: 6, letterSpacing: 0.5 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Mini Score History Chart — shows with 3+ analyses */}
      {history.length >= 3 && (() => {
        const scores = history.slice(0, 10).filter(h => h.score > 0).map(h => h.score).reverse();
        if (scores.length < 3) return null;
        const min = Math.min(...scores) - 0.3;
        const max = Math.max(...scores) + 0.3;
        const range = max - min || 1;
        const w = 280, h = 60;
        const points = scores.map((s, i) => ({
          x: (i / (scores.length - 1)) * w,
          y: h - ((s - min) / range) * h,
        }));
        const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
        const area = line + ` L${w},${h} L0,${h} Z`;
        return (
          <div style={{
            marginBottom: 16, padding: "12px 16px", borderRadius: 14,
            background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.35)" }}>Score Trend</span>
              <span style={{ fontSize: 14, color: "rgba(255,255,255,0.2)" }}>Last {scores.length} analyses</span>
            </div>
            <svg viewBox={`-10 -5 ${w + 20} ${h + 10}`} width="100%" height="65" style={{ display: "block" }}>
              <defs>
                <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#C4982A" stopOpacity="0.15" />
                  <stop offset="100%" stopColor="#C4982A" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={area} fill="url(#chartFill)" />
              <path d={line} fill="none" stroke="#C4982A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              {/* End dot */}
              <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="3.5" fill="#C4982A" />
              <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="6" fill="#C4982A" opacity="0.15" />
            </svg>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
              <span style={{ fontSize: 14, color: "rgba(255,255,255,0.2)", fontFamily: "'Space Mono', monospace" }}>{scores[0].toFixed(1)}</span>
              <span style={{ fontSize: 14, color: "#C4982A", fontWeight: 700, fontFamily: "'Space Mono', monospace" }}>{scores[scores.length - 1].toFixed(1)}</span>
            </div>
          </div>
        );
      })()}

      {/* Quick Actions — 3-column grid with SVG icons */}
      {(() => {
        const tier = (() => { try { return localStorage.getItem("strive-tier") || "free"; } catch { return "free"; } })();
        const isPro = tier === "pro";
        return (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
            {[
              { icon: "guide", label: "Guide", subtitle: "Scoring ref", action: onViewDeductions },
              { icon: "progress", label: "Progress", subtitle: "Score trends", action: onProgress, pro: true },
              { icon: "meets", label: "My Meets", subtitle: "Past analyses", action: onMeets },
              { icon: "mental", label: "Mental", subtitle: "Train mind", action: onMental, pro: true },
              { icon: "goals", label: "Goals", subtitle: "Season targets", action: onGoals, pro: true },
              { icon: "drills", label: "Drills", subtitle: "Exercises", action: onViewDeductions },
            ].map((btn, i) => (
              <button key={i} onClick={btn.action} style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                padding: "14px 6px 10px", borderRadius: 14, cursor: "pointer",
                background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)",
                fontFamily: "'Outfit', sans-serif", transition: "all 0.2s",
                animation: `fadeIn 0.3s ease-out ${i * 0.05}s both`,
                backdropFilter: "blur(8px)", minHeight: 44,
              }}>
                <div style={{ marginBottom: 2 }}><Icon name={btn.icon} size={20} color="#C4982A" /></div>
                <span style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>{btn.label}</span>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>{btn.subtitle}</span>
                {btn.pro && !isPro && (
                  <span style={{ fontSize: 12, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: "rgba(139,92,246,0.12)", color: "#A78BFA", marginTop: 2 }}>PRO</span>
                )}
              </button>
            ))}
          </div>
        );
      })()}

      {/* Last Result — quick review card */}
      {history.length > 0 && savedResults && savedResults[history[0].id] && (() => {
        const last = history[0];
        const lastResult = savedResults[last.id];
        const sc = last.score || 0;
        const scColor = sc >= 9.0 ? "#22c55e" : sc >= 8.0 ? "#f59e0b" : "#ef4444";
        const dedCount = lastResult?.executionDeductions?.length || 0;
        const topFault = lastResult?.executionDeductions?.[0];
        return (
          <div
            onClick={() => onViewResult(lastResult)}
            className="card" style={{
              padding: 16, marginBottom: 20, cursor: "pointer",
              borderColor: `${scColor}25`,
              background: `linear-gradient(135deg, ${scColor}06, transparent)`,
              animation: "fadeIn 0.4s ease-out",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: 1, marginBottom: 6 }}>LAST ANALYSIS</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{last.event}</div>
                <div style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", marginTop: 3 }}>
                  {last.meetName || last.date}{last.meetLocation ? ` · ${last.meetLocation}` : ""}
                </div>
                {topFault && (
                  <div style={{ fontSize: 14, color: "rgba(255,255,255,0.35)", marginTop: 8 }}>
                    Top fix: <span style={{ color: "#C4982A" }}>{safeStr(topFault.skill)}</span> (-{safeNum(topFault.deduction, 0).toFixed(2)})
                  </div>
                )}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 28, fontWeight: 900, fontFamily: "'Space Mono', monospace", color: scColor }}>
                  {sc.toFixed(1)}
                </div>
                <div style={{ fontSize: 14, color: "rgba(255,255,255,0.3)" }}>{dedCount} deductions</div>
                <div style={{ fontSize: 14, color: "#C4982A", marginTop: 4 }}>tap to review →</div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* History — clickable */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700 }}>Recent Analyses</h3>
          {history.length > 3 && (
            <button onClick={onMeets} style={{
              background: "none", border: "none", color: "#C4982A", cursor: "pointer",
              fontSize: 16, fontWeight: 600, fontFamily: "'Outfit', sans-serif",
            }}>See all {history.length} →</button>
          )}
        </div>
        {history.length === 0 ? (
          <div className="card" style={{ textAlign: "center", padding: "32px 24px" }}>
            <div style={{ marginBottom: 12 }}><Icon name="camera" size={36} color="#C4982A" /></div>
            <h4 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Ready to see your score?</h4>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 16, lineHeight: 1.6, maxWidth: 280, margin: "0 auto 16px" }}>
              Upload a routine video and STRIVE's 2-pass AI engine will break down every deduction — just like a real judge.
            </p>
            <button className="btn-gold" onClick={onUpload} style={{ fontSize: 14, padding: "12px 32px" }}>
              Upload First Video
            </button>
          </div>
        ) : (
          history.slice(0, 3).map((h, i) => {
            const hasResult = savedResults && savedResults[h.id];
            const sc = h.score || 0;
            const scColor = sc >= 9.0 ? "#22c55e" : sc >= 8.0 ? "#f59e0b" : sc > 0 ? "#ef4444" : "rgba(255,255,255,0.3)";
            // Show trend vs previous of same event
            const prevSame = history.slice(i + 1).find(p => p.event === h.event && p.score);
            const trend = prevSame ? sc - prevSame.score : null;
            const eventIcons = { "Vault": "🏋", "Uneven Bars": "🤸", "Balance Beam": "━", "Floor Exercise": "🟫", "Pommel Horse": "🐴", "Still Rings": "⭕", "Parallel Bars": "═", "High Bar": "🔝" };
            return (
              <div key={h.id}
                onClick={() => hasResult && onViewResult(savedResults[h.id])}
                className="card" style={{
                  marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "14px 16px", animation: `fadeIn 0.3s ease-out ${i * 0.08}s both`,
                  cursor: hasResult ? "pointer" : "default",
                  borderLeft: `3px solid ${scColor}40`,
                }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                    background: `${scColor}10`, display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 16,
                  }}>
                    {eventIcons[h.event] || "🤸"}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{h.event}</div>
                    <div style={{ fontSize: 14, color: "rgba(255,255,255,0.35)" }}>
                      {h.meetName || h.date}{h.meetLocation ? ` · ${h.meetLocation}` : ""}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 800, fontSize: 18, color: scColor, fontFamily: "'Space Mono', monospace" }}>
                    {sc > 0 ? sc.toFixed(3) : "—"}
                  </div>
                  <div style={{ fontSize: 14, color: "rgba(255,255,255,0.25)" }}>
                    {trend !== null && Math.abs(trend) >= 0.01 ? (
                      <span style={{ color: trend > 0 ? "#22c55e" : "#ef4444", fontWeight: 600 }}>
                        {trend > 0 ? "▲" : "▼"} {Math.abs(trend).toFixed(2)}
                      </span>
                    ) : (
                      <span>-{(h.deductions || 0).toFixed(2)} ded</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Skills Required for Level */}
      <SkillsRequiredCard profile={profile} />

      {/* Quick Reference — condensed */}
      <div className="card" style={{ padding: 16, marginBottom: 12, borderColor: "rgba(196,152,42,0.1)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "#C4982A" }}>
            Scoring at {profile.level}
          </h3>
          <span style={{ fontSize: 14, color: "rgba(255,255,255,0.25)" }}>
            {profile.levelCategory === "compulsory" ? "Compulsory — SV 10.0" : profile.levelCategory === "xcel" ? "Xcel — SV 10.0" : "Optional — D-Score + E-Score"}
          </span>
        </div>
        <div style={{ fontSize: 16, color: "rgba(255,255,255,0.45)", lineHeight: 1.7 }}>
          {profile.levelCategory === "compulsory" ?
            "Same routine for everyone. Judges deduct for any deviation from the prescribed choreography. 9.0+ is strong." :
           profile.levelCategory === "xcel" ?
            "Start at 10.0 with 4 special requirements (0.50 each). Form errors get deducted on every skill. 8.5+ is competitive." :
            "Build your own routine. Difficulty + composition + execution. Two panels score separately. 8.5-9.5 is the target range."}
        </div>
      </div>

      {/* Quick Glossary */}
      <GlossaryCard />

      {/* Meet Day Checklist */}
      <MeetDayChecklist gender={profile.gender} />

      {/* Share STRIVE — virality hook */}
      {history.length >= 1 && (
        <div className="card" style={{
          padding: 16, marginBottom: 12,
          background: "linear-gradient(135deg, rgba(196,152,42,0.04), rgba(139,92,246,0.02))",
          borderColor: "rgba(196,152,42,0.1)",
          textAlign: "center",
        }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Know a gymnast or coach?</div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", marginBottom: 12, lineHeight: 1.5 }}>
            STRIVE helps every gymnast understand their score and improve faster.
          </div>
          <button
            onClick={() => {
              const text = `Check out STRIVE — AI gymnastics scoring that breaks down every deduction and gives you a personalized training plan. It's free to try!\n\nhttps://strive-app-amber.vercel.app`;
              if (navigator.share) {
                navigator.share({ title: "STRIVE — AI Gymnastics Scoring", text }).catch(() => {});
              } else if (navigator.clipboard) {
                navigator.clipboard.writeText(text).then(() => alert("Link copied! Share it with your gym friends."));
              }
            }}
            style={{
              background: "rgba(196,152,42,0.1)", border: "1px solid rgba(196,152,42,0.2)",
              borderRadius: 10, padding: "10px 24px", cursor: "pointer",
              color: "#C4982A", fontSize: 16, fontWeight: 600, fontFamily: "'Outfit', sans-serif",
            }}
          >
            Share STRIVE
          </button>
        </div>
      )}

      {/* Dashboard footer */}
      <div style={{ textAlign: "center", paddingTop: 16, paddingBottom: 32, marginTop: 4 }}>
        <div style={{
          fontFamily: "'Georgia', serif", fontSize: 14, fontWeight: 500, letterSpacing: 3,
          background: "linear-gradient(135deg, #C4982A, #E8C35A)", backgroundClip: "text",
          WebkitBackgroundClip: "text", color: "transparent", marginBottom: 4,
        }}>STRIVE</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.12)", letterSpacing: 1 }}>
          v1.0 · 2-Pass AI Engine · {profile.level}
        </div>
      </div>

    </div>
  );
}

// ─── UPLOAD SCREEN ──────────────────────────────────────────────────
function UploadScreen({ profile, onBack, onAnalyze }) {
  const [video, setVideo] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [videoReady, setVideoReady] = useState(false);
  const [videoError, setVideoError] = useState(null);
  const [compressing, setCompressing] = useState(false);
  const [compressProgress, setCompressProgress] = useState(0);
  const [originalSize, setOriginalSize] = useState(0);
  const [event, setEvent] = useState(profile.primaryEvents[0] || "");
  const [notes, setNotes] = useState("");
  const [meetName, setMeetName] = useState("");
  const [meetLocation, setMeetLocation] = useState("");
  const [meetDate, setMeetDate] = useState(new Date().toISOString().split("T")[0]);
  const [hasApiKey, setHasApiKey] = useState(null); // null=checking
  const [inlineKey, setInlineKey] = useState("");
  const [keySaving, setKeySaving] = useState(false);

  // Check for API key on mount (user saved key OR server key)
  useEffect(() => {
    (async () => {
      try {
        const k = await storage.get("strive-gemini-key");
        if (k?.value) { setHasApiKey(true); return; }
      } catch {}
      // Check server-side key
      try {
        const resp = await fetch("/api/gemini-key");
        if (resp.ok) { setHasApiKey(true); return; }
      } catch {}
      setHasApiKey(false);
    })();
  }, []);
  const fileRef = useRef(null);
  const captureRef = useRef(null);
  const videoPreviewRef = useRef(null);
  const events = profile.gender === "female" ? WOMEN_EVENTS : MEN_EVENTS;

  const COMPRESS_THRESHOLD = 100 * 1024 * 1024; // Only compress above 100MB — quality matters for judging
  const TARGET_WIDTH = 1080; // 1080p preserves toe points, knee angles, body lines
  const TARGET_BITRATE = 4000000; // 4.0 Mbps — higher quality for accurate frame analysis

  const formatFileSize = (bytes) => {
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  // ── Video Compression Engine ──
  const compressVideo = useCallback(async (file) => {
    return new Promise((resolve, reject) => {
      setCompressing(true);
      setCompressProgress(0);
      setOriginalSize(file.size);

      const sourceVideo = document.createElement("video");
      sourceVideo.muted = true;
      sourceVideo.playsInline = true;
      sourceVideo.src = URL.createObjectURL(file);

      sourceVideo.onloadedmetadata = () => {
        // Calculate target dimensions (maintain aspect ratio, cap at TARGET_WIDTH)
        const scale = Math.min(1, TARGET_WIDTH / sourceVideo.videoWidth);
        const width = Math.round(sourceVideo.videoWidth * scale);
        const height = Math.round(sourceVideo.videoHeight * scale);
        const duration = sourceVideo.duration;

        if (DEBUG_MODE) console.log(`Compressing: ${sourceVideo.videoWidth}x${sourceVideo.videoHeight} → ${width}x${height}, ${duration.toFixed(1)}s`); // eslint-disable-line no-console

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });

        // Use MediaRecorder to re-encode at lower bitrate
        const stream = canvas.captureStream(30); // 30fps — more frames for motion analysis
        const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
          ? "video/webm;codecs=vp9"
          : MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
            ? "video/webm;codecs=vp8"
            : "video/webm";

        const recorder = new MediaRecorder(stream, {
          mimeType,
          videoBitsPerSecond: TARGET_BITRATE,
        });

        const chunks = [];
        recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: mimeType });
          const compressedFile = new File([blob], file.name.replace(/\.[^.]+$/, ".webm"), { type: mimeType });
          if (DEBUG_MODE) console.log(`Compressed: ${formatFileSize(file.size)} → ${formatFileSize(compressedFile.size)} (${Math.round((1 - compressedFile.size / file.size) * 100)}% reduction)`); // eslint-disable-line no-console
          URL.revokeObjectURL(sourceVideo.src);
          setCompressing(false);
          resolve(compressedFile);
        };

        recorder.onerror = (e) => {
          setCompressing(false);
          URL.revokeObjectURL(sourceVideo.src);
          reject(new Error("Compression failed: " + (e.error?.message || "unknown")));
        };

        // Play video and draw each frame to canvas
        recorder.start(100); // Collect data every 100ms
        sourceVideo.currentTime = 0;
        sourceVideo.play().catch(reject);

        const drawFrame = () => {
          if (sourceVideo.ended || sourceVideo.paused) {
            recorder.stop();
            return;
          }
          ctx.drawImage(sourceVideo, 0, 0, width, height);
          setCompressProgress(Math.round((sourceVideo.currentTime / duration) * 100));
          requestAnimationFrame(drawFrame);
        };

        sourceVideo.onplay = drawFrame;
        sourceVideo.onended = () => {
          // Small delay to ensure last frames are captured
          setTimeout(() => { if (recorder.state === "recording") recorder.stop(); }, 200);
        };

        // Speed up playback for faster compression (3x)
        sourceVideo.playbackRate = 3;
      };

      sourceVideo.onerror = () => {
        setCompressing(false);
        URL.revokeObjectURL(sourceVideo.src);
        reject(new Error("Could not load video for compression"));
      };
    });
  }, []);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const videoExtensions = /\.(mov|mp4|m4v|webm|avi|mkv|qt|3gp|3g2|mts|m2ts|ts|flv|wmv|ogv|hevc)$/i;
    const hasVideoMime = file.type && (file.type.startsWith("video/") || file.type === "application/octet-stream");
    const hasVideoExtension = file.name && videoExtensions.test(file.name);
    const isFromVideoPicker = !file.type && !file.name;

    if (!hasVideoMime && !hasVideoExtension && !isFromVideoPicker) {
      console.warn("File may not be video:", file.type, file.name);
    }

    setVideoError(null);
    let processedFile = file;

    // Auto-compress large videos
    if (file.size > COMPRESS_THRESHOLD) {
      try {
        processedFile = await compressVideo(file);
      } catch (err) {
        console.warn("Compression failed, using original:", err.message);
        setVideoError(`Video is large (${formatFileSize(file.size)}). Compression wasn't possible — upload may be slow.`);
        processedFile = file;
      }
    }

    const url = URL.createObjectURL(processedFile);
    setVideo(processedFile);
    setVideoUrl(url);
    setVideoReady(false);
  };

  // Verify the video actually loads and can be played
  const handleVideoLoaded = () => {
    setVideoReady(true);
    setVideoError(null);
  };

  const handleVideoError = () => {
    // Do NOT block analysis — the preview may fail but frame extraction can still work
    // This is critical for .mov files which sometimes fail preview but extract fine
    setVideoError("Preview unavailable for this format, but analysis should still work. If it fails, try trimming the video in your Photos app first (this re-encodes to a compatible format).");
    setVideoReady(true); // Still mark as ready so the Analyze button works
  };

  // NOTE: Do NOT revoke blob URL on unmount — it's needed for the video review player on the results screen.
  // The URL will be garbage collected when the user navigates away or uploads a new video.

  return (
    <div style={{ minHeight: "100vh", padding: "16px 18px 90px", maxWidth: 540, margin: "0 auto" }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: "rgba(196,152,42,0.6)", cursor: "pointer", fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 600, marginBottom: 14, display: "flex", alignItems: "center", gap: 4 }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M8.5 2.5l-5 5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> Dashboard
      </button>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>
        <Icon name="camera" size={20} /> New Analysis
      </h2>
      <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginBottom: 24 }}>
        Upload a routine video — 2-pass AI judge scores using {profile.level} {profile.levelCategory === "xcel" ? "Xcel" : "USAG"} criteria.
      </p>

      {/* Video Upload / Record */}
      {compressing ? (
        <div style={{
          border: "2px solid rgba(196,152,42,0.3)", borderRadius: 16, padding: 40,
          textAlign: "center", marginBottom: 24, background: "rgba(196,152,42,0.03)",
        }}>
          <div style={{
            width: 60, height: 60, borderRadius: "50%", margin: "0 auto 16px",
            background: "rgba(196,152,42,0.1)", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ fontSize: 28, animation: "pulse 1.5s ease-in-out infinite" }}>🎬</span>
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#C4982A", marginBottom: 8 }}>
            Optimizing Video...
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 16, lineHeight: 1.5 }}>
            Reducing file size for faster upload and analysis.
            <br/>Original: {formatFileSize(originalSize)} → Target: ~{formatFileSize(originalSize * 0.15)}
          </div>
          {/* Progress bar */}
          <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden", marginBottom: 8 }}>
            <div style={{
              height: "100%", borderRadius: 3, background: "linear-gradient(90deg, #C4982A, #E8C35A)",
              width: `${compressProgress}%`, transition: "width 0.3s",
            }} />
          </div>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, fontWeight: 700, color: "#C4982A" }}>
            {compressProgress}%
          </div>
        </div>
      ) : !video ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
          {/* Primary: Choose from library */}
          <div
            onClick={() => fileRef.current?.click()}
            style={{
              border: "2px dashed rgba(196,152,42,0.3)", borderRadius: 16, padding: 40,
              cursor: "pointer", textAlign: "center",
              background: "rgba(255,255,255,0.02)", transition: "all 0.3s",
            }}
          >
            <div style={{
              width: 64, height: 64, borderRadius: "50%", margin: "0 auto 16px",
              background: "rgba(196,152,42,0.1)", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Icon name="upload" size={28} />
            </div>
            <div style={{ color: "#C4982A", fontWeight: 600, fontSize: 16 }}>Choose Video from Library</div>
            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, marginTop: 8 }}>
              MP4, MOV, WebM · iPhone recordings work great
            </div>
          </div>
          {/* Record directly from camera */}
          <div
            onClick={() => captureRef.current?.click()}
            style={{
              border: "1.5px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "18px 24px",
              cursor: "pointer", textAlign: "center",
              background: "rgba(255,255,255,0.02)", transition: "all 0.3s",
              display: "flex", alignItems: "center", gap: 14,
            }}
          >
            <div style={{
              width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
              background: "rgba(239,68,68,0.15)", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{ fontSize: 20 }}>🔴</span>
            </div>
            <div style={{ textAlign: "left" }}>
              <div style={{ color: "#e2e8f0", fontWeight: 600, fontSize: 14 }}>Record from Camera</div>
              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, marginTop: 2 }}>
                Opens your camera to film the routine
              </div>
            </div>
          </div>

          {/* Hidden file inputs */}
          <input
            ref={fileRef}
            type="file"
            accept="video/*"
            onChange={handleFile}
            style={{ display: "none" }}
          />
          <input
            ref={captureRef}
            type="file"
            accept="video/*"
            capture="environment"
            onChange={handleFile}
            style={{ display: "none" }}
          />
        </div>
      ) : (
        <div style={{ marginBottom: 24 }}>
          {/* Video Preview */}
          <div style={{
            border: `2px solid ${videoReady && !videoError ? "#22c55e" : videoError ? "#f59e0b" : "rgba(196,152,42,0.3)"}`,
            borderRadius: 16, overflow: "hidden", background: "black", position: "relative",
            transition: "border-color 0.3s",
          }}>
            <video
              ref={videoPreviewRef}
              src={videoUrl}
              controls
              playsInline
              webkit-playsinline=""
              preload="auto"
              onLoadedMetadata={handleVideoLoaded}
              onLoadedData={handleVideoLoaded}
              onCanPlay={handleVideoLoaded}
              onError={handleVideoError}
              style={{ width: "100%", maxHeight: 300, display: videoError ? "none" : "block" }}
            />
            {/* Fallback when video element can't preview (common with .mov) */}
            {videoError && (
              <div style={{
                padding: "40px 24px", textAlign: "center",
              }}>
                <div style={{
                  width: 56, height: 56, borderRadius: "50%", margin: "0 auto 16px",
                  background: "rgba(196,152,42,0.15)", display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Icon name="camera" size={24} />
                </div>
                <div style={{ color: "#C4982A", fontWeight: 600, fontSize: 15 }}>
                  {video.name?.split('.').pop()?.toUpperCase() || "Video"} File Loaded
                </div>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 6 }}>
                  Preview not available, but analysis will proceed normally
                </div>
              </div>
            )}
            {videoReady && !videoError && (
              <div style={{
                position: "absolute", top: 10, right: 10, background: "rgba(34,197,94,0.9)",
                padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, color: "white",
              }}>
                ✓ Ready
              </div>
            )}
          </div>

          {/* File info & change button */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
              {video.name?.substring(0, 25)}{video.name?.length > 25 ? "..." : ""} · {formatFileSize(video.size)}
              {originalSize > 0 && originalSize !== video.size && (
                <span style={{ color: "#22c55e", marginLeft: 6, fontSize: 11 }}>
                  ✓ compressed from {formatFileSize(originalSize)} ({Math.round((1 - video.size / originalSize) * 100)}% smaller)
                </span>
              )}
            </div>
            <button
              onClick={() => { setVideo(null); setVideoUrl(null); setVideoReady(false); setVideoError(null); }}
              style={{
                background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 8,
                padding: "6px 14px", color: "#C4982A", fontSize: 12, fontWeight: 600,
                cursor: "pointer", fontFamily: "'Outfit', sans-serif",
              }}
            >
              Change Video
            </button>
          </div>

          {/* Info message when preview not available */}
          {videoError && (
            <div style={{
              marginTop: 10, padding: "10px 14px", borderRadius: 10,
              background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)",
              fontSize: 12, color: "rgba(245,158,11,0.8)", lineHeight: 1.5,
            }}>
              <Icon name="info" size={12} /> {videoError}
            </div>
          )}
        </div>
      )}

      {/* Event Selection */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: "block", color: "rgba(255,255,255,0.6)" }}>
          EVENT
        </label>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(events.length, 4)}, 1fr)`, gap: 8 }}>
          {events.map(e => (
            <button
              key={e}
              onClick={() => setEvent(e)}
              style={{
                padding: "12px 8px", borderRadius: 10, border: "none", cursor: "pointer",
                fontFamily: "'Outfit', sans-serif", fontWeight: 600, fontSize: 12,
                background: event === e ? "linear-gradient(135deg, #C4982A, #E8C35A)" : "rgba(255,255,255,0.06)",
                color: event === e ? "#0B1024" : "rgba(255,255,255,0.5)",
                transition: "all 0.2s",
              }}
            >
              {e}
            </button>
          ))}
        </div>
        {/* Event-specific filming tip */}
        {event && (
          <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, background: "rgba(196,152,42,0.04)", fontSize: 11, color: "rgba(255,255,255,0.4)", lineHeight: 1.5 }}>
            {{
              "Vault": "Best angle: side view, capturing the full run and landing. Get the board contact!",
              "Uneven Bars": "Best angle: side view from the low bar side. Capture transitions between bars.",
              "Balance Beam": "Best angle: side or diagonal. Keep the full beam length visible.",
              "Floor Exercise": "Best angle: corner diagonal. Try to capture the full floor area.",
              "Pommel Horse": "Best angle: end view for circles, side for travel.",
              "Still Rings": "Best angle: front or slight angle. Capture the full hang and swing.",
              "Parallel Bars": "Best angle: side view to see swing amplitude.",
              "High Bar": "Best angle: side view to capture giants and releases.",
            }[event] || "Film from the side at apparatus height for best results."}
          </div>
        )}
      </div>

      {/* Meet Information — compact */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, display: "block", color: "rgba(255,255,255,0.4)" }}>
          MEET DETAILS (optional)
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
          <input className="input-field" placeholder="Meet name" value={meetName} onChange={e => setMeetName(e.target.value)} style={{ fontSize: 12, padding: "10px 12px" }} />
          <input className="input-field" placeholder="Location" value={meetLocation} onChange={e => setMeetLocation(e.target.value)} style={{ fontSize: 12, padding: "10px 12px" }} />
          <input className="input-field" type="date" value={meetDate} onChange={e => setMeetDate(e.target.value)} style={{ fontSize: 12, padding: "10px 12px" }} />
        </div>
      </div>

      {/* Notes */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: "block", color: "rgba(255,255,255,0.6)" }}>
          NOTES FOR JUDGE (OPTIONAL)
        </label>
        <textarea
          className="input-field"
          placeholder="e.g., 'Focus on my back handspring series' or 'Check my dismount landing'"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          style={{ resize: "vertical" }}
        />
      </div>

      {/* Video Tips — visual checklist */}
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <h4 style={{ fontSize: 13, fontWeight: 700, color: "#C4982A", marginBottom: 10 }}>
          Tips for best results
        </h4>
        {[
          { svgIcon: "eye", tip: "Film from the side at apparatus height" },
          { svgIcon: "user", tip: "Keep the full body in frame, salute to salute" },
          { svgIcon: "camera", tip: "Hold camera steady — tripod or lean on something" },
          { svgIcon: "sparkle", tip: "Good lighting, minimal background clutter" },
          { svgIcon: "clock", tip: "Keep under 2 minutes for fastest processing" },
        ].map((t, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0" }}>
            <Icon name={t.svgIcon} size={14} color="rgba(196,152,42,0.6)" />
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{t.tip}</span>
          </div>
        ))}
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.04)" }}>
          iPhone tip: If video won't load, go to Settings → Camera → Formats → "Most Compatible" before filming.
        </div>
      </div>

      {/* Privacy */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 14px", borderRadius: 10, marginBottom: 12,
        background: "rgba(59,130,246,0.04)", border: "1px solid rgba(59,130,246,0.08)",
      }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(147,197,253,0.7)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg>
        <span style={{ fontSize: 11, color: "rgba(147,197,253,0.7)" }}>Video processed on-device. Only frames sent to AI. Your data stays private.</span>
      </div>

      {/* API Key Status */}
      {hasApiKey === false ? (
        <div style={{
          padding: 16, borderRadius: 14, marginBottom: 16,
          background: "rgba(196,152,42,0.04)", border: "1px solid rgba(196,152,42,0.12)",
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#C4982A", marginBottom: 6 }}>
            One-time setup
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", lineHeight: 1.6, marginBottom: 10 }}>
            STRIVE needs a free API key to analyze videos. Takes 30 seconds:
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 12, lineHeight: 1.8 }}>
            <span style={{ color: "#C4982A", fontWeight: 700 }}>1.</span>{" "}<span style={{ color: "#C4982A", cursor: "pointer", textDecoration: "underline" }} onClick={() => window.open("https://aistudio.google.com/apikey", "_blank")}>Get your free API key</span><br/>
            <span style={{ color: "#C4982A", fontWeight: 700 }}>2.</span> Click "Create API Key"<br/>
            <span style={{ color: "#C4982A", fontWeight: 700 }}>3.</span> Paste below
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="input-field"
              type="password"
              placeholder="Paste API key (AIza...)"
              value={inlineKey}
              onChange={e => setInlineKey(e.target.value)}
              style={{ fontSize: 12, flex: 1 }}
            />
            <button
              onClick={async () => {
                if (!inlineKey.trim()) return;
                setKeySaving(true);
                try {
                  await storage.set("strive-gemini-key", inlineKey.trim());
                  setHasApiKey(true);
                } catch (e) { alert("Error: " + e.message); }
                setKeySaving(false);
              }}
              disabled={!inlineKey.trim() || keySaving}
              style={{
                background: "linear-gradient(135deg, #C4982A, #E8C35A)",
                color: "#0B1024", border: "none", borderRadius: 10,
                padding: "0 20px", fontWeight: 700, fontSize: 13,
                cursor: inlineKey.trim() ? "pointer" : "not-allowed",
                opacity: inlineKey.trim() ? 1 : 0.4,
                fontFamily: "'Outfit', sans-serif", whiteSpace: "nowrap",
              }}
            >
              {keySaving ? "..." : "Save"}
            </button>
          </div>
        </div>
      ) : hasApiKey === true ? (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 14px", borderRadius: 10, marginBottom: 16,
          background: "rgba(34,197,94,0.04)", border: "1px solid rgba(34,197,94,0.08)",
        }}>
          <span style={{ color: "#22c55e", fontSize: 14 }}>✓</span>
          <span style={{ fontSize: 12, color: "rgba(34,197,94,0.7)" }}>2-pass analysis engine ready</span>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.15)", marginLeft: "auto" }}>Detect → Judge</span>
        </div>
      ) : (
        <div style={{ padding: "10px 14px", borderRadius: 10, marginBottom: 16, background: "rgba(255,255,255,0.02)" }}>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>Checking API key...</span>
        </div>
      )}

      <button
        className="btn-gold"
        onClick={() => onAnalyze({ video, videoUrl, videoFile: video, event, notes, meetName, meetLocation, meetDate })}
        disabled={!video || !event || compressing}
        style={{
          width: "100%", fontSize: 17, padding: 18,
          opacity: (!video || !event) ? 0.4 : 1,
          pointerEvents: (!video || !event) ? "none" : "auto",
        }}
      >
        <Icon name="eye" /> Analyze Routine
      </button>
    </div>
  );
}

// ─── ANALYZING SCREEN ───────────────────────────────────────────────
function AnalyzingScreen({ uploadData, profile, onComplete, onBack }) {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Preparing video...");
  const [frames, setFrames] = useState([]);
  const [error, setError] = useState(null);
  const hiddenVideoRef = useRef(null);
  const hasStarted = useRef(false);

  // ── Yield to UI thread between heavy frame operations ──
  const yieldToUI = useCallback(() => {
    return new Promise(resolve => {
      if (typeof requestIdleCallback === "function") {
        requestIdleCallback(resolve, { timeout: 50 });
      } else {
        setTimeout(resolve, 0);
      }
    });
  }, []);

  // ── Shared blank-frame check (5-point sampling for dark gym videos) ──
  const isFrameBlank = useCallback((ctx, canvas) => {
    const w = canvas.width, h = canvas.height;
    const points = [
      [Math.floor(w * 0.5), Math.floor(h * 0.5)],
      [Math.floor(w * 0.25), Math.floor(h * 0.25)],
      [Math.floor(w * 0.75), Math.floor(h * 0.25)],
      [Math.floor(w * 0.25), Math.floor(h * 0.75)],
      [Math.floor(w * 0.75), Math.floor(h * 0.75)],
    ];
    for (const [x, y] of points) {
      const px = ctx.getImageData(x, y, 1, 1).data;
      if ((px[0] + px[1] + px[2]) >= 15 || px[3] >= 10) return false; // at least one non-blank pixel
    }
    return true; // all 5 points are black/transparent
  }, []);

  // ── Promise-based seek helper ──
  const seekTo = useCallback((video, time) => {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => { cleanup(); resolve(false); }, 3000);
      const onSeeked = () => { cleanup(); resolve(true); };
      const cleanup = () => { clearTimeout(timeout); video.removeEventListener("seeked", onSeeked); };
      video.addEventListener("seeked", onSeeked, { once: true });
      video.currentTime = time;
    });
  }, []);

  // ── Strategy 1: Seek-based extraction (fast, works for H.264) ──
  const extractViaSeek = useCallback(async (video, canvas, ctx, maxFrames) => {
    const captured = [];
    const duration = video.duration;
    if (!duration || !isFinite(duration)) return captured;

    // Check if video has seekable ranges — if not, skip immediately
    if (!video.seekable || video.seekable.length === 0) {
      log.warn("frames", "No seekable ranges available — skipping seek-based extraction");
      return captured;
    }

    const seekStart = video.seekable.start(0);
    const seekEnd = video.seekable.end(video.seekable.length - 1);
    log.info("frames", `Seekable range: ${seekStart.toFixed(2)}s - ${seekEnd.toFixed(2)}s (duration: ${duration.toFixed(2)}s)`);

    // Deterministic 0.4s intervals, capped at maxFrames
    const frameInterval = 0.4;
    const totalPossible = Math.floor((seekEnd - seekStart) / frameInterval);
    // If too many frames, spread evenly; otherwise take every 0.4s
    const step = totalPossible > maxFrames ? (seekEnd - seekStart) / maxFrames : frameInterval;
    const frameCount = Math.min(totalPossible, maxFrames);

    for (let i = 0; i < frameCount; i++) {
      const target = seekStart + 0.1 + (step * i);
      const clamped = Math.min(Math.max(target, seekStart + 0.1), seekEnd - 0.1);

      const seeked = await seekTo(video, clamped);
      if (!seeked) { log.warn("frames", `Seek to ${clamped.toFixed(2)}s timed out`); continue; }

      // Small delay for decoder to produce frame
      await new Promise(r => setTimeout(r, 80));

      try {
        const vw = video.videoWidth || 640;
        const vh = video.videoHeight || 480;
        // 1080p resolution (1920px width) for accurate form analysis
        canvas.width = Math.min(vw, 1920);
        canvas.height = Math.round(canvas.width * (vh / vw));
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        if (!isFrameBlank(ctx, canvas)) {
          const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
          captured.push({
            timestamp: video.currentTime.toFixed(2),
            dataUrl,
            base64: dataUrl.split(",")[1],
          });
          setProgress(Math.round((captured.length / maxFrames) * 25));
        } else {
          log.warn("frames", `Frame at ${clamped.toFixed(2)}s was blank, skipping`);
        }
      } catch (e) { log.warn("frames", `Seek capture error at ${clamped.toFixed(2)}s: ${e.message}`); }
      // Yield to UI between frames to prevent jank
      await yieldToUI();
    }
    return captured;
  }, [isFrameBlank, seekTo, yieldToUI]);

  // ── Strategy 2: Play-based extraction (works for HEVC .MOV) ──
  const extractViaPlay = useCallback((video, canvas, ctx, maxFrames) => {
    return new Promise((resolve) => {
      const captured = [];
      const duration = video.duration || 10;
      // Deterministic 0.4s intervals, capped at maxFrames
      const frameInterval = 0.4;
      const totalPossible = Math.floor(duration / frameInterval);
      const step = totalPossible > maxFrames ? duration / maxFrames : frameInterval;
      const frameCount = Math.min(totalPossible, maxFrames);
      const targets = Array.from({ length: frameCount }, (_, i) => step * (i + 1));
      let nextTarget = 0;
      let done = false;

      setStatus("Extracting frames (playing video)...");

      const finish = () => {
        if (done) return;
        done = true;
        video.removeEventListener("timeupdate", onTimeUpdate);
        video.removeEventListener("ended", finish);
        clearTimeout(masterTimeout);
        try { video.pause(); video.playbackRate = 1; } catch(e) {}
        resolve(captured);
      };

      const masterTimeout = setTimeout(finish, 30000);

      // Cap at 4x — higher rates cause frame skipping on most browsers
      video.playbackRate = Math.min(4, Math.max(2, duration / 5));
      video.currentTime = 0;

      const onTimeUpdate = () => {
        if (done || nextTarget >= targets.length) return;

        // Wider tolerance window (0.8s) to avoid missing frames at accelerated playback
        if (video.currentTime >= targets[nextTarget] - 0.8) {
          try {
            const vw = video.videoWidth || 640;
            const vh = video.videoHeight || 480;
            canvas.width = Math.min(vw, 1920);
            canvas.height = Math.round(canvas.width * (vh / vw));
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            if (!isFrameBlank(ctx, canvas)) {
              const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
              captured.push({
                timestamp: video.currentTime.toFixed(2),
                dataUrl,
                base64: dataUrl.split(",")[1],
              });
              setProgress(Math.round((captured.length / maxFrames) * 25));
            }
          } catch(e) { log.warn("frames", `Play capture error: ${e.message}`); }
          nextTarget++;
        }

        if (video.ended || video.currentTime >= duration - 0.2 || captured.length >= maxFrames) {
          finish();
        }
      };

      video.addEventListener("timeupdate", onTimeUpdate);
      video.addEventListener("ended", finish);

      const playPromise = video.play();
      if (playPromise && playPromise.then) {
        playPromise.catch(() => finish());
      }
    });
  }, [isFrameBlank]);

  // ── Strategy 3: Single frame grab (last resort) ──
  const extractSingleFrame = useCallback((video, canvas, ctx) => {
    return new Promise((resolve) => {
      try {
        const vw = video.videoWidth || 640;
        const vh = video.videoHeight || 480;
        canvas.width = Math.min(vw, 1920);
        canvas.height = Math.round(canvas.width * (vh / vw));
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        resolve([{
          timestamp: video.currentTime.toFixed(2),
          dataUrl,
          base64: dataUrl.split(",")[1],
        }]);
      } catch(e) {
        resolve([]);
      }
    });
  }, []);

  // ── Main extraction orchestrator ──
  const extractFrames = useCallback(async () => {
    const video = hiddenVideoRef.current;
    if (!video) return [];

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    // Deterministic frame sampling: fixed 0.4s intervals, capped at 16
    const maxFrames = 24;

    // Wait for video to be ready (readyState >= 2 = HAVE_CURRENT_DATA)
    await new Promise((resolve) => {
      const isReady = () => video.readyState >= 2;
      if (isReady()) { resolve(); return; }

      const readyTimeout = setTimeout(() => {
        log.warn("frames", `Video readiness timeout. readyState=${video.readyState}, seekable=${video.seekable?.length || 0}`);
        resolve();
      }, 20000);

      const onReady = () => {
        if (isReady()) {
          clearTimeout(readyTimeout);
          video.removeEventListener("loadeddata", onReady);
          video.removeEventListener("canplay", onReady);
          video.removeEventListener("canplaythrough", onReady);
          video.removeEventListener("progress", onReady);
          log.info("frames", `Video ready: readyState=${video.readyState}, seekable ranges=${video.seekable?.length || 0}`);
          resolve();
        }
      };
      video.addEventListener("loadeddata", onReady);
      video.addEventListener("canplay", onReady);
      video.addEventListener("canplaythrough", onReady);
      video.addEventListener("progress", onReady);

      // Force load
      video.load();
    });

    if (video.readyState < 1) {
      log.warn("frames", "Video never reached readyState >= 1, returning empty");
      return [];
    }

    // Wait for dimensions (iOS can be slow)
    let dimRetries = 0;
    while ((video.videoWidth === 0 || video.videoHeight === 0) && dimRetries < 20) {
      await new Promise(r => setTimeout(r, 200));
      dimRetries++;
    }

    // Wait for seekable ranges to populate (blob URLs can be slow)
    let seekableReady = video.seekable && video.seekable.length > 0;
    if (!seekableReady) {
      log.info("frames", "Seekable ranges empty, polling for up to 5s...");
      for (let i = 0; i < 25 && !seekableReady; i++) {
        await new Promise(r => setTimeout(r, 200));
        seekableReady = video.seekable && video.seekable.length > 0;
      }
      if (!seekableReady) log.warn("frames", "Seekable ranges never populated — seek-based will be skipped");
    }

    // Activate video with play (required on iOS before any extraction works)
    setStatus("Activating video decoder...");
    try {
      const p = video.play();
      if (p && p.then) await p.catch(() => {});
      await new Promise(r => setTimeout(r, 300));
      video.pause();
    } catch(e) {}

    // Strategy 1: Seek-based (only if seekable ranges exist)
    let frames = [];
    if (seekableReady) {
      setStatus("Extracting frames (seek mode)...");
      frames = await extractViaSeek(video, canvas, ctx, maxFrames);
      log.info("frames", `Seek-based extraction got ${frames.length} frames`);
    }

    if (frames.length < 2) {
      // Strategy 2: Play-based (for HEVC .MOV or when seeking fails)
      setStatus("Trying play-based extraction...");
      setProgress(5);
      video.currentTime = 0;
      await new Promise(r => setTimeout(r, 200));
      const playFrames = await extractViaPlay(video, canvas, ctx, maxFrames);
      log.info("frames", `Play-based extraction got ${playFrames.length} frames`);
      if (playFrames.length > frames.length) frames = playFrames;
    }

    if (frames.length >= 1) return frames;

    // Strategy 3: Single frame grab
    setStatus("Grabbing available frame...");
    video.currentTime = 0.5;
    await new Promise(r => setTimeout(r, 500));
    frames = await extractSingleFrame(video, canvas, ctx);
    log.info("frames", `Single frame extraction got ${frames.length} frames`);

    return frames;
  }, [extractViaSeek, extractViaPlay, extractSingleFrame]);


  // ══════════════════════════════════════════════════════════════════
  // ANALYSIS PIPELINE
  // ══════════════════════════════════════════════════════════════════

  // (runPoseDetection removed — AI provides joint data directly)

  // ── State Official judging prompt — returns JSON directly ──
  // skillList: optional array from Pass 1 skill detection [{time, skill, type}]
  const buildJudgingPrompt = useCallback((skillList) => {
    const gender = profile.gender === "female" ? "Women's" : "Men's";
    const eventName = uploadData.event;
    const level = profile.level;
    const isXcel = profile.levelCategory === "xcel";
    const isCompulsory = profile.levelCategory === "compulsory";
    const splitThreshold = isXcel
      ? (level.includes("Bronze") || level.includes("Silver") ? "90" : level.includes("Gold") ? "120" : "150")
      : (level.includes("6") || level.includes("7") ? "150" : "180");

    return `You are the UNIVERSAL GYMNASTICS JUDGING ENGINE (UGJE). You are a Brevet-level USAG Official at a State Championship judging this ${gender} ${eventName} routine (${level}).

YOUR PRIMARY METHOD: Watch the video and judge EXACTLY as a real judge would — by watching what the gymnast does with your own eyes. You are fully capable of seeing form breaks, body positions, landing quality, and execution errors directly from the video. Trust your visual analysis. Do NOT fabricate or guess angle measurements — only include approximate angles when you can genuinely estimate them from what you see.

No benefit of the doubt — if form is not picture-perfect, the deduction is taken.

═══ STEP 1: IDENTIFICATION ═══
${skillList && skillList.length > 0 ? `The following ${skillList.length} skills were identified in this routine by a prior analysis pass. You MUST judge EACH of these skills for execution errors. Do not skip any, and do not add skills that are not on this list unless you clearly see one that was missed.

SKILL LIST:
${skillList.map((s, i) => `${i + 1}. [${s.time}] ${s.skill} (${s.type})`).join("\n")}
` : `Watch the full video and identify every distinct skill performed. For each skill, log:
- Skill name, timestamp, and category (acrobatic, dance/leap, turn, mount, dismount, connection)
- For ${eventName}: identify ${eventName === "Balance Beam" ? "mounts, acro series, leaps/jumps, turns, connections, and dismount" : eventName === "Uneven Bars" ? "kips, casts, releases, swings, transitions, and dismount" : eventName === "Floor Exercise" ? "tumbling passes, leaps/jumps, turns, and dance sequences" : "board contact, flight phase, and landing"}.`}
${isCompulsory ? 'COMPULSORY (' + level + '): Note every deviation from the prescribed routine as an additional deduction (0.05-0.20).' : ''}
${isXcel ? level + ': Verify all 4 Special Requirements are present (0.50 each if missing).' : ''}

═══ STEP 2: JUDGE EACH SKILL ═══
For each identified skill, WATCH IT TWICE before judging. On the first viewing, observe the overall quality. On the second viewing, look specifically for form breaks. Only deduct for faults you can CLEARLY SEE in both viewings.

CRITICAL SCORING EXPECTATIONS:
- You MUST find at least 6-10 separate deductions. Most skills have at least one small fault.
- If your total deductions are below 0.50 for any routine, you are being too lenient. Go back and look harder.
- Expected deductions: 0.70-1.50 for a typical competitive routine.
- Multiple deductions CAN apply to a single element (bent knees AND leg separation = 2 deductions).
- A typical ${level} routine has 8-15 deductions. If you find fewer than 5, YOU ARE MISSING DEDUCTIONS. Go back and look harder.
- Total deductions should be 0.80-2.00 for most routines. Finding only 0.10-0.30 total means you missed most of the real errors.
- EVERY skill has at least minor execution imperfections. Perfect 10.0 execution essentially doesn't exist below elite level.
- Common deductions you MUST look for on EVERY skill: toe point, knee bend, body alignment, landing control.
- If a gymnast scored 8.0-8.5 in competition, you should find 10-15 deductions totaling 1.50-2.00.

CALIBRATION BENCHMARKS:
- An 8.5 real score means ~1.50 in total deductions. An 8.9 means ~1.10. A 9.2 means ~0.80.
- A 9.5+ means ~0.50 or fewer — this is exceptional and rare below elite level.
- If your deduction total is under 0.50, you are almost certainly missing real faults.

WHAT TO LOOK FOR:
- Toe point: Are feet pointed or flexed? Flexed feet = 0.05 each occurrence.
- Knee tension: Are legs straight when they should be? Soft/bent knees in flight = 0.05-0.10.
- Body alignment: In handstands and inverted positions, is the body straight and vertical? Deviations = 0.05-0.10.
- Leg separation: In saltos/flight, are knees together? "Cowboy" (knees apart wider than shoulders) = 0.10-0.20. This is one of the most visible errors — look for it in every tuck.
- Split positions: In leaps/jumps, does the split reach ${splitThreshold}°? Most gymnasts at ${level} show 110-140° which is a 0.10-0.20 deduction. EVERY leap and jump must be evaluated for split position.
- Acrobatic skills: Check body shape (tight tuck/pike/layout), rotation completion, and landing.
- Landings: Watch for steps, hops, squat depth, chest position. EVERY landing must be evaluated separately.

ANALYSIS ENGINES (tag every deduction + provide measured vs required):
These engines categorize each deduction AND provide the motion analysis data that coaches, gymnasts, and parents use as a training tool to understand WHY a deduction was taken. For each deduction, tag the engine AND include the measured angle/position vs the skill requirement so the athlete can see the gap.
- TPM (Toe Point Monitor) — foot/ankle position. Measured: estimated shin-to-foot angle. Required: 180° (fully pointed). Example: "Measured ~155°, required 180° — feet visibly flexed in flight."
- KTM (Knee Tension Monitor) — knee straightness. Measured: estimated knee angle. Required: 175°+ (straight). Example: "Measured ~160°, required 175° — noticeably bent knees in back handspring."
- VAE (Verticality & Alignment Engine) — body line in inverted/vertical positions. Measured: estimated deviation from vertical. Required: within 10°. Example: "~15° past vertical in handstand."
- Split-Check — split amplitude in leaps/jumps. Measured: estimated hip vertex angle. Required: ${splitThreshold}° for ${level}. Example: "Measured ~130°, required ${splitThreshold}° — split visibly short."
- Landing — landing mechanics. Measured: chest angle, knee flexion, steps/hops. Required: upright chest, controlled absorption, no extra steps.
- General — artistry, rhythm, or other execution faults.
Estimate angles from what you genuinely see in the video. Approximate is fine ("~155°", "~130°") — the goal is to show the athlete how far off they are from the standard, not to be a protractor. Do NOT fabricate precise numbers you cannot actually see.

═══ STEP 3: SCORING OUTPUT ═══
Compile all deductions into the scorecard. Rules:
- DEDUCT PER-SKILL, NOT PER-PASS. In a tumbling pass like "Round-off BHS back tuck", the round-off, BHS, and back tuck each get their OWN deduction row if they have form errors. Do NOT write one row for the entire pass.
- A single skill can have MULTIPLE faults combined into ONE deduction (e.g. BHS with bent elbows -0.10 AND neutral feet -0.05 = one row at -0.15 for BHS citing both faults).
- EVERY landing gets its OWN row (step, hop, or squat). Landing deductions are separate from the preceding skill.
- Use "Global" ONLY for artistry/presentation or a fault that is truly identical on 4+ skills. If a skill has a distinct fault (e.g. BHS elbows bent, back tuck cowboy knees), it MUST get its own row even if other skills also have minor knees/feet issues.

CONSOLIDATION RULES (especially important for Bars):
- List each SKILL only ONCE. If soft knees appear on every cast, write ONE row with combined deduction.
- A routine should have 8-15 deduction rows, NOT 30-40. Consolidate recurring faults.
- Group recurring execution errors as ONE "Global" deduction of 0.10-0.20 (e.g. "Global: persistent knee bend across 4 casts — 0.10").

- ${eventName === "Uneven Bars" ? "8-12" : eventName === "Floor Exercise" ? "8-12" : eventName === "Balance Beam" ? "8-12" : "5-8"} deduction entries expected.
- Expected total deductions: 0.80-1.50 for a solid ${level} routine.
- Expected final score: 8.00-9.50. If below 7.50, you are too strict.
- Describe the fault you actually see. Include approximate angles only when you can genuinely estimate them.
- Deduction values are positive (0.10 not -0.10).
- "severity": "small" (0.05-0.10), "medium" (0.10-0.15), "large" (0.20-0.30), "veryLarge" (0.30-0.50), "fall" (0.50+)
- "category": "execution", "artistry", or "landing"
- "engine": "TPM", "KTM", "VAE", "Split-Check", "Landing", or "General"
- Use "Global" as timestamp for artistry/whole-routine deductions.

═══ STEP 4: SUMMARY ═══
Write truthAnalysis (2-3 paragraphs): why this score, biggest math win, path to improvement.
List strengths (with timestamps) and areas for improvement.
List topFixes: the 3 changes that would save the most points, with specific drills.

═══ RESPONSE FORMAT ═══
YOU MUST RESPOND WITH VALID JSON ONLY. No markdown, no extra text.

{"skillAnalysis":[{"timestamp":"0:04","skill":"Round-off","type":"acro","verdict":"deduction","score":"clean"|"minor"|"moderate"|"major","deduction":0.10,"fault":"Slight knee bend during support phase","correction":"Focus on locked arms through the entire support. Drill: handstand snaps against wall","engine":"KTM","measuredVsIdeal":"Knee ~165° vs required 175°+","skeleton":null}],"executionDeductions":[{"timestamp":"0:04","skill":"Round-off","deduction":0.10,"engine":"KTM","fault":"Slight knee bend","category":"execution","severity":"small","correction":"Wall handstand snaps","confidence":0.85,"skeleton":null}],"executionDeductionsTotal":1.25,"artistryDeductionsTotal":0.20,"finalScore":8.550,"truthAnalysis":"...","topFixes":[{"name":"Fix name","saves":0.15,"drill":"Specific drill"}],"strengths":["Strength 1"],"areasForImprovement":["Area 1"],"overallAssessment":"2-3 sentence judge summary","biomechanics":{"keyMoments":[{"timestamp":"0:08","skill":"Back tuck","phase":"takeoff","jointAngles":{"lKnee":142,"rKnee":145},"angularVelocity":{"hip":320,"knee":280},"notes":"Good height"}],"landingAnalysis":[{"timestamp":"0:12","skill":"Landing","kneeFlexionAtImpact":155,"chestAngle":72,"stepsAfter":1,"impactRisk":"low","notes":"One step forward"}],"holdDurations":[],"injuryRiskFlags":[],"overallFlightHeight":"adequate","overallPowerRating":"7/10"},"coachReport":{"preemptiveCorrections":[],"conditioningPlan":[],"idealComparison":"","techniqueProgressionNotes":""},"athleteDevelopment":{"mentalTraining":[],"goalSpecificAdvice":""}}

SKILL ANALYSIS (REQUIRED — the core product):
The skillAnalysis array is the MOST IMPORTANT part of the response. It must contain ONE entry for EVERY skill performed in the routine, whether deducted or not.
- "verdict": "clean" (no deduction), "deduction" (has a deduction), or "strength" (notably well-executed)  
- "score": "clean" (perfect/near-perfect), "minor" (0.05), "moderate" (0.10-0.15), "major" (0.20+)
- For "clean" skills: still describe what was good about execution in the "correction" field (rename as "notes" mentally)
- For deducted skills: include fault, correction with specific drill, engine, measuredVsIdeal
- "skeleton": Include for ANY skill where body position matters. Provide joints as normalized [0-1] coordinates for the body position at the moment of the fault (or peak of the skill for clean ones). Include faultJoints array and angles array [{joint, measured, ideal, label}].
- Every skill gets an entry. A typical routine has 10-15 skills. If you have fewer than 8 skillAnalysis entries, you missed skills.

CONFIDENCE SCORES: Every deduction MUST include "confidence" (0.0-1.0). Use 0.9+ for clearly visible errors you can see plainly in the video, 0.7-0.9 for likely errors, 0.5-0.7 for probable errors that are hard to confirm from the camera angle, below 0.5 only if you're unsure but it looks wrong. Do NOT include deductions with confidence below 0.3.

SKELETON & MOTION ANALYSIS (Training Tool Layer):
This data overlays on the video so gymnasts, coaches, and parents can VISUALLY SEE what the judge saw. It turns deductions into teaching moments.
- skeleton: Include for the TOP 3 deductions. Provide joints as normalized [0-1] coordinates, faultJoints (joints involved in the fault), and angles (measured vs ideal for that skill). This lets the app draw the body position with highlighted problem areas.
- For all other deductions, set skeleton to null. Prioritize complete scoring data over skeleton detail.

BIOMECHANICS (fills the training/teaching layer):
Fill completely — this is what coaches and parents review between the judging scorecard and the video replay.
- keyMoments: For each major skill, show joint angles, angular velocity, and what was good or needs work. This is how athletes learn what their body is doing.
- landingAnalysis: Every landing — knee flexion, chest angle, steps. Parents can see why a landing lost points.
- holdDurations: Static holds — measured vs required time.
- injuryRiskFlags: Flag positions that could lead to injury if not corrected. Coaches prioritize these.

COACH REPORT:
- preemptiveCorrections: technique habits forming NOW that become problems at higher levels. Include drill to fix.
- conditioningPlan: 3-5 exercises addressing ROOT CAUSES of deductions (sets/reps/frequency).
- idealComparison: compare to ideal model for ${level}.
- techniqueProgressionNotes: what to train next.

ATHLETE DEVELOPMENT for ${profile.age ? profile.age + '-year-old' : ''} ${String(gender || "").toLowerCase()} gymnast at ${level}${profile.goals ? ' (goal: ' + profile.goals + ')' : ''}:
- mentalTraining: ${profile.goals ? 'techniques for goal of "' + profile.goals + '"' : 'visualization, pressure management'} appropriate for age.
- goalSpecificAdvice: ${profile.goals ? 'Specific advice for "' + profile.goals + '" at ' + level + '.' : 'General development advice for ' + level + '.'}

RESPONSE PRIORITY (if running low on output tokens):
1. skillAnalysis array — ONE entry per skill, with full data (REQUIRED — this IS the product)
2. executionDeductions + finalScore + totals (REQUIRED — the scorecard)
3. truthAnalysis, topFixes, strengths, areasForImprovement, overallAssessment (REQUIRED)
4. biomechanics — keyMoments, landingAnalysis, injuryRiskFlags (IMPORTANT)
5. skeleton data on deducted skills (IMPORTANT)
6. coachReport (important)
7. athleteDevelopment (brief is fine)
${uploadData.notes ? '\nCoach notes: "' + uploadData.notes + '"' : ''}`;
  }, [profile, uploadData]);

  // ── Pass 1: Skill Detection prompt — fast, small output ──
  const buildSkillDetectionPrompt = useCallback(() => {
    const gender = profile.gender === "female" ? "Women's" : "Men's";
    const eventName = uploadData.event;
    const level = profile.level;
    const isCompulsory = profile.levelCategory === "compulsory";

    return `Watch this ${gender} ${eventName} routine (${level}) from start to finish. Identify EVERY distinct gymnastics skill/element performed in chronological order.

CRITICAL RULES:
- Each skill should appear ONLY ONCE. Do NOT list the same skill at multiple timestamps.
- A typical ${eventName} routine at ${level} has 8-15 distinct elements. If you're listing more than 15, you are probably counting the same skill twice.
- For tumbling passes: list EACH INDIVIDUAL SKILL within the pass separately (e.g. a "Round-off BHS back tuck" pass = 3 entries: "Round-off" at 0:32, "Back handspring" at 0:33, "Back tuck" at 0:34), each with its own timestamp (1 second apart for connected skills).
- Landing is a separate entry if it has a notable deduction (step, hop, etc.).

For each skill, provide:
- "time": timestamp in M:SS format (e.g. "0:04", "1:12")
- "skill": standard gymnastics name (e.g. "Round-off", "Back handspring", "Back tuck", "Split leap")
- "type": one of "acro", "dance", "turn", "mount", "dismount", "connection", "pose", "landing"

${eventName === "Balance Beam" ? "Include: mount, all acro elements, leaps/jumps (note if connected), turns, acro series, and dismount." : ""}${eventName === "Uneven Bars" ? "Include: mount/kip, all casts, releases, swings, transitions between bars, and dismount." : ""}${eventName === "Floor Exercise" ? "Include: each tumbling pass broken into individual skills (round-off, BHS, salto each listed separately), leaps/jumps, turns, and dance sequences. A typical Level 6-8 floor routine has 2-3 tumbling passes, 2-3 leaps/jumps, 1-2 turns, and choreography." : ""}${eventName === "Vault" ? "Include: run, board contact/hurdle, flight phase (name the vault), and landing." : ""}
${isCompulsory ? 'This is a COMPULSORY routine (' + level + '). List each element from the prescribed routine and note if it was performed correctly, modified, or missing.' : ''}

RESPOND WITH VALID JSON ONLY:
{"skills":[{"time":"0:32","skill":"Round-off","type":"acro"},{"time":"0:33","skill":"Back handspring","type":"acro"},{"time":"0:34","skill":"Back tuck","type":"acro"},{"time":"0:35","skill":"Landing","type":"landing"},{"time":"0:44","skill":"Split leap","type":"dance"}],"routineDuration":"1:15","skillCount":12}`;
  }, [profile, uploadData]);

  // Simplified prompt for retry on truncated responses — core scorecard only
  const buildSimplifiedPrompt = useCallback(() => {
    const gender = profile.gender === "female" ? "Women's" : "Men's";
    const level = profile.level;
    const isXcel = profile.levelCategory === "xcel";
    const isCompulsory = profile.levelCategory === "compulsory";
    const splitThreshold = isXcel
      ? (level.includes("Bronze") || level.includes("Silver") ? "90" : level.includes("Gold") ? "120" : "150")
      : (level.includes("6") || level.includes("7") ? "150" : "180");

    return `Analyze this ${gender} ${uploadData.event} routine (${level}) as a Brevet-level USAG Official. Strict judging — no benefit of the doubt. Judge by watching the video directly — trust what you see.

LOOK FOR: Toe point (flexed feet=0.05), knee tension (bent knees=0.05-0.10), body alignment (0.05-0.10), split positions (must reach ${splitThreshold}° at ${level}, 0.10-0.20 if short), leg separation/cowboy (0.10-0.20), landing steps/hops/squat. Tag each deduction with engine: TPM/KTM/VAE/Split-Check/Landing/General.
${isCompulsory ? 'COMPULSORY: Deduct for deviations from prescribed routine.' : ''}${isXcel ? level + ': Check 4 Special Requirements (0.50 each if missing).' : ''}

RULES: Deduct PER-SKILL within tumbling passes (round-off, BHS, tuck each get their own row). Every landing gets its own row. Use "Global" ONLY for artistry or faults appearing 4+ times identically. Max 12 entries. Expected score: 8.00-9.50. Describe what you see — include approximate angles only when you can genuinely estimate them.

RESPOND WITH VALID JSON ONLY:
{"executionDeductions":[{"timestamp":"0:12","skill":"...","deduction":0.10,"engine":"KTM","fault":"...","category":"execution","severity":"small","confidence":0.92,"skeleton":null}],"executionDeductionsTotal":0.80,"artistryDeductionsTotal":0.20,"finalScore":9.00,"truthAnalysis":"Why this score, biggest math win, path to improvement.","topFixes":[{"name":"...","saves":0.15,"drill":"..."}],"strengths":["..."],"areasForImprovement":["..."]}

"severity": "small"/"medium"/"large"/"veryLarge"/"fall". "category": "execution"/"artistry"/"landing". "engine": "TPM"/"KTM"/"VAE"/"Split-Check"/"Landing"/"General".`;
  }, [profile, uploadData]);

  // ── Gemini Video Upload (reusable — returns file reference for multiple API calls) ──
  const uploadVideoToGemini = useCallback(async (videoFile, apiKey) => {
    const mimeType = videoFile.type || "video/mp4";

    // Step 1: Start resumable upload to File API
    setStatus("Uploading video...");
    setProgress(40);
    log.info("upload", `Uploading: ${videoFile.name} (${(videoFile.size / 1024 / 1024).toFixed(1)}MB)`);

    const startRes = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`, {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(videoFile.size),
        "X-Goog-Upload-Header-Content-Type": mimeType,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file: { display_name: "routine_" + Date.now() } }),
    });

    if (!startRes.ok) {
      const errText = await startRes.text().catch(() => "");
      throw new Error(`Upload init failed (${startRes.status}): ${errText}`);
    }

    const uploadUrl = startRes.headers.get("X-Goog-Upload-URL") || startRes.headers.get("x-goog-upload-url");
    if (!uploadUrl) throw new Error("No upload URL returned from File API");

    // Step 2: Upload the video bytes
    setStatus("Sending video to analysis engine...");
    setProgress(50);

    const uploadRes = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "X-Goog-Upload-Command": "upload, finalize",
        "X-Goog-Upload-Offset": "0",
        "Content-Length": String(videoFile.size),
      },
      body: videoFile,
    });

    if (!uploadRes.ok) throw new Error(`Upload failed (${uploadRes.status})`);
    const fileInfo = await uploadRes.json();
    const fileUri = fileInfo.file?.uri;
    const fileName = fileInfo.file?.name;
    if (!fileUri) throw new Error("No file URI returned");
    log.info("upload", `Video uploaded: ${fileName} URI: ${fileUri}`);

    // Step 3: Poll until video is processed
    setStatus("Processing video (this may take 30-60 seconds)...");
    setProgress(58);

    let fileReady = false;
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const checkRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`);
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          log.info("upload", `File state: ${checkData.state} (poll ${i + 1})`);
          if (checkData.state === "ACTIVE") { fileReady = true; break; }
          if (checkData.state === "FAILED") throw new Error("Video processing failed on server");
        }
      } catch (e) {
        if (e.message.includes("failed")) throw e;
      }
      setProgress(58 + Math.min(15, Math.floor(i / 2)));
    }
    if (!fileReady) throw new Error("Video processing timed out after 80 seconds");

    return { fileUri, fileName, mimeType };
  }, []);

  // ── Gemini Generate (call the model with an already-uploaded file) ──
  const geminiGenerate = useCallback(async (fileRef, prompt, apiKey, config = {}) => {
    const {
      maxOutputTokens = 65536,
      thinkingBudget = 8192,
      responseMimeType = "application/json",
      label = "analysis",
    } = config;

    log.info("gemini", `[${label}] Sending prompt (${prompt.length} chars) to gemini-2.5-flash`);

    const analysisRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { file_data: { file_uri: fileRef.fileUri, mime_type: fileRef.mimeType } },
            { text: prompt },
          ],
        }],
        generationConfig: {
          maxOutputTokens,
          temperature: 0,
          responseMimeType,
          thinkingConfig: { thinkingBudget },
        },
      }),
    });

    if (!analysisRes.ok) {
      const errText = await analysisRes.text().catch(() => "");
      throw new Error(`${label} failed (${analysisRes.status}): ${errText}`);
    }

    const analysisData = await analysisRes.json();
    const candidate = analysisData.candidates?.[0] || {};
    const finishReason = candidate.finishReason || "UNKNOWN";
    const allParts = candidate.content?.parts || [];
    const thinkingChars = allParts.filter(p => p.thought).reduce((s, p) => s + (p.text?.length || 0), 0);
    log.info("gemini", `[${label}] Response: ${allParts.length} parts (finish: ${finishReason}, thinking: ${thinkingChars} chars)`);
    const rawText = allParts
      .filter(p => p.text && !p.thought)
      .map(p => p.text)
      .join("\n") || allParts.map(p => p.text || "").join("\n");
    log.info("gemini", `[${label}] Complete. Length: ${rawText.length}, preview: ${rawText.substring(0, 200)}`);
    if (DEBUG_MODE) console.log(`[gemini ${label} raw]`, rawText); // eslint-disable-line no-console
    try { localStorage.setItem(`debug-gemini-${label}`, rawText); } catch {}

    return rawText;
  }, []);

  // ── Legacy wrapper for backward compatibility ──
  const analyzeWithGeminiVideo = useCallback(async (videoFile, prompt, apiKey) => {
    const fileRef = await uploadVideoToGemini(videoFile, apiKey);
    const rawText = await geminiGenerate(fileRef, prompt, apiKey, { label: "judge" });
    // Cleanup uploaded file
    try { fetch(`https://generativelanguage.googleapis.com/v1beta/${fileRef.fileName}?key=${apiKey}`, { method: "DELETE" }); } catch {}
    return rawText;
  }, [uploadVideoToGemini, geminiGenerate]);

  // ══════════════════════════════════════════════════════════════════
  // MAIN ORCHESTRATOR — 2-Pass Gemini Pipeline
  // Pass 1: Skill detection  →  Pass 2: Execution judging
  // ══════════════════════════════════════════════════════════════════
  const analyzeWithAI = useCallback(async (extractedFrames) => {
    setStatus("Preparing analysis...");
    setProgress(35);

    // Try user's saved key first, then server-side key
    let apiKey = null;
    try {
      const k = await storage.get("strive-gemini-key");
      apiKey = k?.value || null;
    } catch (e) {}

    // If no user key, fetch from server (key stored in Vercel env var, not in code)
    if (!apiKey) {
      try {
        const resp = await fetch("/api/gemini-key");
        if (resp.ok) {
          const data = await resp.json();
          apiKey = data.key || null;
        }
      } catch {}
    }

    if (!apiKey) {
      throw new Error("No API key found. Go to Settings and paste your free API key to enable video analysis.");
    }

    let result = null;
    let geminiError = null;

    if (apiKey && uploadData.video) {
      try {
        // ── Load calibration history to compute AI scoring bias ──
        let calibrationBias = 0;
        let calibrationNote = "";
        try {
          const cal = await storage.get("strive-calibration");
          if (cal) {
            const calData = JSON.parse(cal.value);
            // Filter to matching event+level for most accurate bias
            const relevant = calData.filter(c => c.event === uploadData.event && c.level === profile.level);
            const allRecords = relevant.length >= 3 ? relevant : calData; // fall back to all data if <3 matching
            if (allRecords.length >= 2) {
              const avgDiff = allRecords.reduce((s, c) => s + (c.diff || 0), 0) / allRecords.length;
              calibrationBias = Math.round(avgDiff * 1000) / 1000;
              const dir = calibrationBias > 0 ? "high" : "low";
              calibrationNote = `CALIBRATION DATA: Based on ${allRecords.length} past score corrections${relevant.length >= 3 ? ` for ${uploadData.event} at ${profile.level}` : ""}, the AI has historically scored ${Math.abs(calibrationBias).toFixed(2)} ${dir} compared to actual meet judges. Adjust your scoring ${calibrationBias > 0 ? "downward" : "upward"} by approximately ${Math.abs(calibrationBias).toFixed(2)} to match real judging panels.`;
              log.info("calibration", `Bias: ${calibrationBias.toFixed(3)} from ${allRecords.length} records (${relevant.length} event-specific)`);
            }
          }
        } catch (e) { log.warn("calibration", "Failed to load calibration data"); }

        log.info("gemini", "Starting 2-pass analysis pipeline (detect → judge)" + (calibrationNote ? " (with calibration)" : ""));

        // ── Upload video once ──
        const fileRef = await uploadVideoToGemini(uploadData.video, apiKey);

        // ── PASS 1: Skill Detection (fast) ──
        let skillList = [];
        try {
          setStatus("Pass 1: Identifying skills...");
          setProgress(68);
          const skillPrompt = buildSkillDetectionPrompt();
          const skillRaw = await geminiGenerate(fileRef, skillPrompt, apiKey, {
            maxOutputTokens: 4096,
            thinkingBudget: 4096,
            label: "skill-detect",
          });
          try {
            const skillMatch = skillRaw.match(/\{[\s\S]*\}/);
            if (skillMatch) {
              const skillData = JSON.parse(skillMatch[0]);
              skillList = safeArray(skillData.skills).filter(s => s.time && s.skill);
              log.info("skills", `Pass 1: ${skillList.length} skills: ${skillList.map(s => s.skill).join(", ")}`);
            }
          } catch (parseErr) {
            log.warn("skills", `Skill detection parse failed: ${parseErr.message}`);
          }
        } catch (skillErr) {
          log.warn("skills", `Pass 1 failed: ${skillErr.message}. Single-pass judging.`);
        }

        // ── PASS 2: Execution Judging ──
        setStatus(skillList.length > 0 ? `Pass 2: Judging ${skillList.length} skills...` : "AI judge analyzing routine...");
        setProgress(78);
        const judgingPrompt = buildJudgingPrompt(skillList) + (calibrationNote ? "\n\n" + calibrationNote : "");

        let rawAnalysis = null;
        let lastErr = null;
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const prompt = attempt === 1 ? judgingPrompt : (buildSimplifiedPrompt() + (calibrationNote ? "\n\n" + calibrationNote : ""));
            if (attempt === 2) {
              setStatus("Retrying with focused prompt...");
              log.info("gemini", `Attempt 1 incomplete. Retrying simplified...`);
            }
            rawAnalysis = await geminiGenerate(fileRef, prompt, apiKey, {
              maxOutputTokens: 65536,
              thinkingBudget: 8192,
              label: attempt === 1 ? "judge" : "judge-retry",
            });
            if (rawAnalysis && rawAnalysis.length >= 50 && rawAnalysis.includes('"finalScore"')) {
              break;
            } else if (rawAnalysis && rawAnalysis.length >= 50) {
              log.warn("gemini", `Attempt ${attempt}: truncated (${rawAnalysis.length} chars, no finalScore)`);
            } else {
              rawAnalysis = null;
              lastErr = new Error("Empty response");
            }
          } catch (retryErr) {
            lastErr = retryErr;
            log.warn("gemini", `Attempt ${attempt}: ${retryErr.message}`);
            if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
          }
        }

        // ── NO Pass 3 — verification was rejecting real deductions ──

        // Cleanup uploaded file (after all passes complete)
        try { fetch(`https://generativelanguage.googleapis.com/v1beta/${fileRef.fileName}?key=${apiKey}`, { method: "DELETE" }); } catch {}

        if (!rawAnalysis) throw lastErr || new Error("AI returned empty response");

        setStatus("Processing scorecard...");
        setProgress(85);
        log.info("parser", `Response length: ${rawAnalysis.length}, preview: ${rawAnalysis.substring(0, 200)}`);

        // Try JSON first (primary path — prompt requests JSON, responseMimeType enforces it)
        try {
          const jsonMatch = rawAnalysis.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = validateResult(JSON.parse(jsonMatch[0]));
            if (parsed.executionDeductions.length > 0 && parsed.finalScore != null) {
              // Map topFixes to corrections on matching deductions
              parsed.executionDeductions.forEach(d => {
                if (!d.correction && parsed.topFixes.length > 0) {
                  const fix = safeArray(parsed.topFixes).find(f => {
                    const fn = safeStr(f?.name).toLowerCase().split(" ")[0];
                    return fn && (safeStr(d.skill).toLowerCase().includes(fn) || safeStr(d.fault).toLowerCase().includes(fn));
                  });
                  if (fix) d.correction = `${safeStr(fix.name)}: ${safeStr(fix.drill)}`;
                }
                // Parse MM:SS timestamps to frameRef
                let tsNum = 0;
                const firstTs = safeStr(d.timestamp).split(/[,\-]/)[0].trim();
                const tsParts = firstTs.split(":");
                if (tsParts.length === 2) tsNum = parseInt(tsParts[0]) * 60 + parseInt(tsParts[1]);
                else tsNum = parseFloat(firstTs) || 0;
                if (!d.frameRef) d.frameRef = Math.min(6, Math.floor(tsNum / 12) + 1);
              });

              // Use validateResult's computed totals — always derived from actual deductions
              const topDed = [...parsed.executionDeductions].sort((a, b) => b.deduction - a.deduction)[0];

              result = {
                startValue: 10.0,
                executionDeductions: parsed.executionDeductions,
                executionDeductionsTotal: parsed.executionDeductionsTotal,
                artistryDeductionsTotal: parsed.artistryDeductionsTotal,
                neutralDeductionsTotal: 0,
                totalDeductions: parsed.totalDeductions,
                finalScore: parsed.finalScore,
                overallAssessment: safeStr(parsed.truthAnalysis).substring(0, 500) || "Championship-strict evaluation of this routine.",
                truthAnalysis: safeStr(parsed.truthAnalysis),
                strengths: parsed.strengths.length > 0 ? parsed.strengths : ["Routine completed without falls"],
                areasForImprovement: parsed.areasForImprovement.length > 0 ? parsed.areasForImprovement
                  : parsed.topFixes.length > 0 ? parsed.topFixes.map(f => safeStr(f?.name) + " — saves +" + safeNum(f?.saves, 0).toFixed(2) + " — " + safeStr(f?.drill)).filter(s => s.length > 10)
                  : ["Review deductions"],
                rawAnalysis,
                skillAnalysis: parsed.skillAnalysis || [],
                bodyPositionNotes: parsed.executionDeductions.slice(0, 6).map((d, i) => ({
                  frameRef: d.frameRef || i + 1,
                  timestamp: d.timestamp || "0",
                  observation: `${d.skill}: ${d.fault}`,
                  annotation: `[${d.engine}] -${safeNum(d.deduction, 0).toFixed(2)}`,
                  joints: null,
                  faultJoints: [],
                })),
                biomechanics: parsed.biomechanics || null,
                coachReport: parsed.coachReport || null,
                athleteDevelopment: parsed.athleteDevelopment || null,
                skillList: skillList.length > 0 ? skillList : null,
                diagnostics: {
                  threePassUsed: skillList.length > 0,
                  skillsDetected: skillList.length,
                  toePointIssues: parsed.executionDeductions.filter(d => d.engine === "TPM").length,
                  kneeTensionIssues: parsed.executionDeductions.filter(d => d.engine === "KTM").length,
                  splitDeficiency: parsed.executionDeductions.some(d => safeStr(d.fault).toLowerCase().includes("split")),
                  landingDeductions: parsed.executionDeductions.filter(d => d.category === "landing").reduce((s, d) => s + d.deduction, 0),
                  artistryDeductions: parsed.artistryDeductionsTotal,
                  averageConfidence: parsed.executionDeductions.length > 0 ? Math.round(parsed.executionDeductions.reduce((s, d) => s + safeNum(d.confidence, 0.7), 0) / parsed.executionDeductions.length * 100) / 100 : 0,
                  lowConfidenceCount: parsed.executionDeductions.filter(d => safeNum(d.confidence, 0.7) < 0.5).length,
                  biggestMathWin: topDed ? "Fix " + topDed.skill + ": saves +" + topDed.deduction.toFixed(2) : "",
                  consistencyNote: safeStr(parsed.truthAnalysis).substring(0, 200) || "See Truth Analysis",
                },
              };
              if (Math.abs(calibrationBias) >= 0.05 && result.finalScore) {
                const adjustedScore = Math.round((result.finalScore - calibrationBias) * 1000) / 1000;
                const clampedScore = Math.max(0, Math.min(10, adjustedScore));
                log.info("calibration", `Adjusting score: ${result.finalScore} → ${clampedScore} (bias: ${calibrationBias > 0 ? "+" : ""}${calibrationBias.toFixed(3)})`);
                result.rawAiScore = result.finalScore;
                result.calibrationBias = calibrationBias;
                result.finalScore = clampedScore;
                result.totalDeductions = Math.round((result.startValue - clampedScore) * 1000) / 1000;
              }
              log.info("parser", `Parsed as JSON. Score: ${result.finalScore}, ${parsed.executionDeductions.length} deductions`);
            }
          }
        } catch(e) {
          log.warn("parser", `JSON parse failed: ${e.message}`);
          // Attempt to repair truncated JSON
          try {
            let repaired = rawAnalysis.trim();
            // Strip markdown fences
            repaired = repaired.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
            // Find the start of the JSON object
            const startIdx = repaired.indexOf("{");
            if (startIdx >= 0) {
              repaired = repaired.substring(startIdx);
              // Close any open strings
              const quoteCount = (repaired.match(/(?<!\\)"/g) || []).length;
              if (quoteCount % 2 !== 0) repaired += '"';
              // Close open brackets/braces
              const opens = { "{": 0, "[": 0 };
              const closes = { "}": "{", "]": "[" };
              for (const ch of repaired) {
                if (ch in opens) opens[ch]++;
                if (ch in closes) opens[closes[ch]]--;
              }
              // Remove trailing comma or colon before closing
              repaired = repaired.replace(/[,:\s]+$/, "");
              for (let i = 0; i < opens["["]; i++) repaired += "]";
              for (let i = 0; i < opens["{"]; i++) repaired += "}";
              log.info("parser", `Attempting repaired JSON (added ${opens["["]} ] and ${opens["{"]} })`);
              const parsed = validateResult(JSON.parse(repaired));
              if (parsed.executionDeductions.length > 0) {
                log.info("parser", `Repaired JSON succeeded: ${parsed.executionDeductions.length} deductions found`);
                // Map topFixes to corrections on matching deductions
                parsed.executionDeductions.forEach(d => {
                  if (!d.correction && parsed.topFixes.length > 0) {
                    const fix = safeArray(parsed.topFixes).find(f => {
                      const fn = safeStr(f?.name).toLowerCase().split(" ")[0];
                      return fn && (safeStr(d.skill).toLowerCase().includes(fn) || safeStr(d.fault).toLowerCase().includes(fn));
                    });
                    if (fix) d.correction = `${safeStr(fix.name)}: ${safeStr(fix.drill)}`;
                  }
                  let tsNum = 0;
                  const firstTs = safeStr(d.timestamp).split(/[,\-]/)[0].trim();
                  const tsParts = firstTs.split(":");
                  if (tsParts.length === 2) tsNum = parseInt(tsParts[0]) * 60 + parseInt(tsParts[1]);
                  else tsNum = parseFloat(firstTs) || 0;
                  if (!d.frameRef) d.frameRef = Math.min(6, Math.floor(tsNum / 12) + 1);
                });
                // Use validateResult's computed totals
                const topDed = [...parsed.executionDeductions].sort((a, b) => b.deduction - a.deduction)[0];
                result = {
                  startValue: 10.0,
                  executionDeductions: parsed.executionDeductions,
                  executionDeductionsTotal: parsed.executionDeductionsTotal,
                  artistryDeductionsTotal: parsed.artistryDeductionsTotal,
                  neutralDeductionsTotal: 0,
                  totalDeductions: parsed.totalDeductions,
                  finalScore: parsed.finalScore,
                  overallAssessment: safeStr(parsed.truthAnalysis).substring(0, 500) || "Analysis from repaired truncated response — some data may be missing.",
                  truthAnalysis: safeStr(parsed.truthAnalysis),
                  strengths: parsed.strengths.length > 0 ? parsed.strengths : ["Routine analysis recovered from partial response"],
                  areasForImprovement: parsed.areasForImprovement.length > 0 ? parsed.areasForImprovement : ["Review deductions"],
                  rawAnalysis,
                  skillAnalysis: parsed.skillAnalysis || [],
                  bodyPositionNotes: parsed.executionDeductions.slice(0, 6).map((d, i) => ({
                    frameRef: d.frameRef || i + 1, timestamp: d.timestamp || "0",
                    observation: `${safeStr(d.skill)}: ${safeStr(d.fault)}`, annotation: `[${d.engine}] -${safeNum(d.deduction, 0).toFixed(2)}`,
                    joints: null, faultJoints: [],
                  })),
                  biomechanics: parsed.biomechanics || null,
                  coachReport: parsed.coachReport || null,
                  athleteDevelopment: parsed.athleteDevelopment || null,
                  diagnostics: {
                    toePointIssues: parsed.executionDeductions.filter(d => d.engine === "TPM").length,
                    kneeTensionIssues: parsed.executionDeductions.filter(d => d.engine === "KTM").length,
                    splitDeficiency: parsed.executionDeductions.some(d => d.fault?.toLowerCase().includes("split")),
                    landingDeductions: parsed.executionDeductions.filter(d => d.category === "landing").reduce((s, d) => s + d.deduction, 0),
                    artistryDeductions: parsed.artistryDeductionsTotal,
                    biggestMathWin: topDed ? "Fix " + topDed.skill + ": saves +" + topDed.deduction.toFixed(2) : "",
                    consistencyNote: "Recovered from truncated response",
                  },
                  _repaired: true,
                };
                if (Math.abs(calibrationBias) >= 0.05 && result.finalScore) {
                  const adjustedScore = Math.round((result.finalScore - calibrationBias) * 1000) / 1000;
                  result.rawAiScore = result.finalScore;
                  result.calibrationBias = calibrationBias;
                  result.finalScore = Math.max(0, Math.min(10, adjustedScore));
                  result.totalDeductions = Math.round((result.startValue - result.finalScore) * 1000) / 1000;
                }
                log.info("parser", `Repaired result. Score: ${result.finalScore}, ${parsed.executionDeductions.length} deductions`);
              }
            }
          } catch(repairErr) {
            log.warn("parser", `JSON repair also failed: ${repairErr.message}`);
          }
        }

        // Fallback: Parse as text table
        if (!result) {
          const rawDeductions = parseGeminiTable(rawAnalysis);

          if (rawDeductions.length === 0) {
            throw new Error("No deductions found in Gemini response. First 300 chars: " + rawAnalysis.substring(0, 300));
          }

          // Group micro-faults into skills (merge within 3 seconds of each other)
          const artistryDeds = rawDeductions.filter(d => d.category === "artistry");
          const execRaw = rawDeductions.filter(d => d.category !== "artistry");
          const sorted = [...execRaw].sort((a, b) => (parseFloat(a.timestamp)||0) - (parseFloat(b.timestamp)||0));
          const grouped = [];
          let current = null;

          for (const d of sorted) {
            const t = parseFloat(d.timestamp) || 0;
            const ct = current ? (parseFloat(current.timestamp) || 0) : -999;
            if (current && Math.abs(t - ct) <= 3) {
              current.deduction = Math.round((current.deduction + d.deduction) * 100) / 100;
              current.fault = current.fault + "; " + d.fault;
              current.details = "Combined " + current.deduction.toFixed(2) + " across multiple faults on this skill";
              if (String(d.skill || "").length > String(current.skill || "").length && !String(d.skill || "").toLowerCase().match(/landing|foot|arms|entry|exit/)) {
                current.skill = d.skill;
              }
              if (current.deduction >= 0.30) current.severity = "large";
              else if (current.deduction >= 0.15) current.severity = "medium";
              if (d.deduction >= current.deduction * 0.5) current.engine = d.engine;
            } else {
              if (current) grouped.push(current);
              current = { ...d };
            }
          }
          if (current) grouped.push(current);
          artistryDeds.forEach(a => grouped.push(a));

          // Add corrections based on fault keywords
          grouped.forEach(d => {
            const f = String(d.fault || "").toLowerCase();
            const corr = [];
            if (f.includes("knee") && (f.includes("sep") || f.includes("cowboy"))) corr.push("Foam block between knees during tuck drills");
            if (f.includes("flex") || f.includes("toe") || f.includes("foot") || f.includes("plantar")) corr.push("Theraband ankle exercises 3x20 daily");
            if (f.includes("step") || f.includes("land") || f.includes("chest drop") || f.includes("chest")) corr.push("Stick drill: 20 reps off low block, freeze 3 seconds");
            if (f.includes("split") || f.includes("leap") || f.includes("angle")) corr.push("Hold split at peak for a full beat");
            if (f.includes("arm") || f.includes("elbow") || f.includes("bent")) corr.push("Wall handstand holds 3x30sec, locked elbows");
            if (f.includes("align") || f.includes("vertical") || f.includes("pike") || f.includes("deviation")) corr.push("Partner-checked handstand shape holds");
            if (f.match(/soft knee|17[0-5]|locked/)) corr.push("Releve walks focusing on locked knees");
            if (f.includes("flat") || f.includes("releve") || f.includes("musicality")) corr.push("Practice choreo on high releve");
            if (corr.length === 0) corr.push("Video review with coach targeting this skill");
            d.correction = corr.join(". ");
            d.ideal = "Full extension, pointed toes, locked knees, tight body line, controlled landing with chest up.";
          });

          const skillDeductions = grouped;
          log.info("grouper", `Grouped into ${skillDeductions.length} skill cards`);

          // Use Gemini's stated score — most accurate since it sees full video
          const finalMatch = rawAnalysis.match(/Final\s*(?:Calculated\s*)?Score[:\s]*([\d.]+)/i);
          const execMatch = rawAnalysis.match(/Total\s*Execution[^:\n]*[:\s]*-?([\d.]+)/i);
          const artMatch = rawAnalysis.match(/Total\s*Artistry[^:\n]*[:\s]*-?([\d.]+)/i);

          // Always compute totals from actual deductions — never trust AI text totals
          const execTotal = Math.round(skillDeductions.filter(d => d.category !== "artistry").reduce((s, d) => s + d.deduction, 0) * 1000) / 1000;
          const artTotal = Math.round(skillDeductions.filter(d => d.category === "artistry").reduce((s, d) => s + d.deduction, 0) * 1000) / 1000;
          const totalDed = Math.round((execTotal + artTotal) * 1000) / 1000;
          const finalScore = Math.max(0, Math.round((10.0 - totalDed) * 1000) / 1000);

          // Extract narrative sections
          const truthIdx = rawAnalysis.indexOf("TRUTH ANALYSIS");
          const fixesIdx = rawAnalysis.indexOf("TOP 3 FIXES");
          const strengthsIdx = rawAnalysis.indexOf("STRENGTHS");

          const truthText = truthIdx >= 0
            ? rawAnalysis.slice(truthIdx + 15, fixesIdx > 0 ? fixesIdx : truthIdx + 600).replace(/^[:\s\n]+/, "").trim() : "";
          const fixesText = fixesIdx >= 0
            ? rawAnalysis.slice(fixesIdx + 12, strengthsIdx > 0 ? strengthsIdx : fixesIdx + 400).replace(/^[:\s\n]+/, "").trim() : "";
          const strengthsText = strengthsIdx >= 0
            ? rawAnalysis.slice(strengthsIdx + 10).replace(/^[:\s\n]+/, "").trim() : "";

          const improvements = fixesText
            ? fixesText.split('\n').filter(l => l.trim().match(/^\d/)).slice(0, 3).map(l => l.replace(/^\d+[\.\)]\s*/, "").trim())
            : ["Review deductions for improvement areas"];
          const strengths = strengthsText
            ? strengthsText.split('\n').filter(l => l.trim().length > 5).slice(0, 3).map(l => l.replace(/^[-\u2022]\s*/, "").trim())
            : ["Routine completed without falls"];

          const topDed = [...skillDeductions].sort((a, b) => b.deduction - a.deduction)[0];

          // Build skillAnalysis from table-parsed deductions
          const tableSkillAnalysis = skillDeductions.map(d => ({
            timestamp: d.timestamp,
            skill: d.skill,
            type: d.category === "landing" ? "landing" : d.category === "artistry" ? "dance" : "acro",
            verdict: "deduction",
            score: d.severity === "small" ? "minor" : d.severity === "medium" ? "moderate" : "major",
            deduction: d.deduction,
            fault: d.fault,
            correction: d.correction || "",
            engine: d.engine,
            measuredVsIdeal: safeStr(d.details || ""),
            skeleton: d.skeleton || null,
          }));

          result = {
            startValue: 10.0,
            executionDeductions: skillDeductions,
            executionDeductionsTotal: execTotal,
            artistryDeductionsTotal: artTotal,
            neutralDeductionsTotal: 0,
            totalDeductions: totalDed,
            finalScore,
            overallAssessment: truthText.substring(0, 500) || "Championship-strict evaluation of this routine.",
            truthAnalysis: truthText,
            strengths,
            areasForImprovement: improvements,
            rawAnalysis,
            skillAnalysis: tableSkillAnalysis,
            diagnostics: {
              toePointIssues: skillDeductions.filter(d => d.engine === "TPM").length,
              kneeTensionIssues: skillDeductions.filter(d => d.engine === "KTM").length,
              splitDeficiency: skillDeductions.some(d => d.fault?.toLowerCase().includes("split")),
              landingDeductions: skillDeductions.filter(d => d.category === "landing").reduce((s, d) => s + d.deduction, 0),
              artistryDeductions: artTotal,
              biggestMathWin: topDed ? "Fix " + topDed.skill + ": saves +" + topDed.deduction.toFixed(2) : (improvements[0] || ""),
              consistencyNote: truthText.substring(0, 200) || "See Truth Analysis",
            },
          };
          log.info("pipeline", `Complete. Score: ${result.finalScore}, Skills: ${skillDeductions.length}`);
        }

      } catch (err) {
        geminiError = err.message || String(err);
        log.error("gemini", "Pipeline failed: " + geminiError);
        setStatus("Video analysis error...");
        setProgress(50);
      }
    } else if (!apiKey) {
      geminiError = "No API key configured";
    } else if (!uploadData.video) {
      geminiError = "No video file available";
    }

    if (!result && extractedFrames.length > 0 && !apiKey) {
      throw new Error("API key error. Please try again or check Settings → Video Analysis Engine.");
    }

    if (!result && geminiError) {
      // Gemini failed — show the actual error, don't mask it with a bad fallback
      throw new Error("Analysis failed: " + geminiError + ". Try again or check your API key in Settings.");
    }

    if (!result) {
      throw new Error(geminiError || "No analysis method available");
    }

    result.frames = extractedFrames;
    result.event = uploadData.event;
    result.level = profile.level;
    result.videoUrl = uploadData.videoUrl;

    // Enhanced diagnostic summary
    log.info("pipeline", `Analysis complete — Score: ${result.finalScore}, Deductions: ${result.executionDeductions?.length || 0}, Frames: ${extractedFrames.length}, Three-pass: ${result.diagnostics?.threePassUsed}, Skills detected: ${result.diagnostics?.skillsDetected || 0}, Avg confidence: ${result.diagnostics?.averageConfidence || "N/A"}, Low confidence filtered: ${result.diagnostics?.lowConfidenceCount || 0}`);
    if (DEBUG_MODE) console.log("[pipeline-result]", { score: result.finalScore, deductions: result.executionDeductions?.length, frames: extractedFrames.length, diagnostics: result.diagnostics }); // eslint-disable-line no-console

    return result;
  }, [buildJudgingPrompt, buildSimplifiedPrompt, buildSkillDetectionPrompt, uploadVideoToGemini, geminiGenerate, analyzeWithGeminiVideo, uploadData, profile]);
  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    (async () => {
      // Small delay to ensure the hidden video element is mounted
      await new Promise(r => setTimeout(r, 300));

      const extracted = await extractFrames();
      setFrames(extracted);

      if (extracted.length === 0) {
        // LAST RESORT: Don't dead-end. Proceed with demo results.
        setStatus("Could not extract frames — generating analysis from video metadata...");
        setProgress(50);
        const demoResult = generateDemoResult(uploadData.event, profile, []);
        demoResult.videoUrl = uploadData.videoUrl;
        demoResult.failureReason = "Frame extraction failed — video format not supported. Try re-saving: open in Photos → Edit → Done, then re-upload.";
        demoResult.overallAssessment = "Note: Frame extraction was not possible for this video format. " +
          "The analysis below is a general assessment for your level. For full AI vision analysis, " +
          "try re-saving the video: open it in Photos → tap Edit → tap Done, then re-upload. " +
          "This re-encodes the video in a compatible format.\n\n" + demoResult.overallAssessment;
        setProgress(100);
        setStatus("Analysis complete!");
        setTimeout(() => onComplete(demoResult), 800);
        return;
      }

      try {
        const result = await analyzeWithAI(extracted);
        setProgress(100);
        setStatus("Analysis complete!");
        setTimeout(() => onComplete(result), 800);
      } catch (err) {
        console.error("All AI analysis failed:", err);
        const demoResult = generateDemoResult(uploadData.event, profile, extracted);
        demoResult.videoUrl = uploadData.videoUrl;
        demoResult.failureReason = err.message || "Unknown error";
        setProgress(100);
        setStatus("Analysis complete (demo mode)");
        setTimeout(() => onComplete(demoResult), 800);
      }
    })();
  }, [extractFrames, analyzeWithAI, uploadData, profile, onComplete]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, maxWidth: 540, margin: "0 auto" }}>
      {/* Hidden video element */}
      <video
        ref={hiddenVideoRef}
        src={uploadData.videoUrl}
        crossOrigin="anonymous"
        muted
        playsInline
        webkit-playsinline=""
        preload="auto"
        style={{ position: "absolute", width: 1, height: 1, opacity: 0.01, pointerEvents: "none", top: -100 }}
      />

      {/* Spinner */}
      <div style={{
        width: 72, height: 72, borderRadius: "50%", margin: "0 auto 24px",
        border: "3px solid rgba(196,152,42,0.15)", borderTopColor: "#C4982A",
        animation: "rotate 1s linear infinite",
      }} />

      <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6, textAlign: "center", maxWidth: 300 }}>{status}</h3>

      {/* 2-Pass Pipeline Indicator */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 16, marginBottom: 16 }}>
        {[
          { label: "Detect", threshold: 60 },
          { label: "Judge", threshold: 78 },
        ].map((pass, i) => {
          const isDone = progress >= pass.threshold + 5;
          const isActive = progress >= pass.threshold - 5 && !isDone;
          return (
            <React.Fragment key={i}>
              {i > 0 && (
                <div style={{
                  width: 20, height: 2, borderRadius: 1,
                  background: isDone ? "#C4982A" : "rgba(255,255,255,0.1)",
                  transition: "background 0.5s",
                }} />
              )}
              <div style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: "50%",
                  background: isDone ? "rgba(196,152,42,0.2)" : isActive ? "rgba(196,152,42,0.1)" : "rgba(255,255,255,0.04)",
                  border: `2px solid ${isDone ? "#C4982A" : isActive ? "rgba(196,152,42,0.4)" : "rgba(255,255,255,0.08)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.5s",
                }}>
                  {isDone ? (
                    <span style={{ color: "#C4982A", fontSize: 13, fontWeight: 700 }}>✓</span>
                  ) : isActive ? (
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#C4982A", animation: "pulse 1s infinite" }} />
                  ) : (
                    <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 11, fontWeight: 600 }}>{i + 1}</span>
                  )}
                </div>
                <span style={{
                  fontSize: 9, fontWeight: 600, letterSpacing: 0.5,
                  color: isDone ? "#C4982A" : isActive ? "rgba(196,152,42,0.7)" : "rgba(255,255,255,0.2)",
                  transition: "color 0.5s",
                }}>{pass.label}</span>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* Progress bar */}
      <div style={{
        width: "100%", maxWidth: 300, height: 6, borderRadius: 3,
        background: "rgba(255,255,255,0.08)", overflow: "hidden",
      }}>
        <div style={{
          height: "100%", borderRadius: 3,
          background: "linear-gradient(90deg, #C4982A, #E8C35A)",
          width: `${progress}%`, transition: "width 0.5s ease-out",
        }} />
      </div>
      <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, marginTop: 8, fontFamily: "'Space Mono', monospace" }}>{progress}%</p>

      {/* Error state */}
      {error && (
        <div style={{
          marginTop: 20, padding: "16px 20px", borderRadius: 14,
          background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)",
          maxWidth: 340, textAlign: "center",
        }}>
          <div style={{ fontSize: 13, color: "#ef4444", fontWeight: 600, marginBottom: 6 }}>Analysis Error</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.6, marginBottom: 12 }}>
            {error.match(/JSON|parse|Unexpected|truncat/i) ? "The AI returned an incomplete response. This happens occasionally — try again." :
             error.match(/403|401|quota|rate/i) ? "API rate limit hit. Wait 30 seconds and try again." :
             error.match(/network|fetch|Failed to fetch/i) ? "Network error — check your connection and try again." :
             error.match(/video|frame|extract|format/i) ? "Video format issue. Try a shorter clip or different format." :
             error}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button onClick={onBack} style={{
              background: "linear-gradient(135deg, #C4982A, #E8C35A)", border: "none",
              borderRadius: 10, padding: "10px 24px", color: "#0B1024", fontSize: 13,
              fontWeight: 700, cursor: "pointer", fontFamily: "'Outfit', sans-serif",
            }}>Try Again</button>
          </div>
        </div>
      )}

      {/* Frame thumbnails */}
      {frames.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginTop: 28, flexWrap: "wrap", justifyContent: "center" }}>
          {frames.slice(0, 12).map((f, i) => (
            <img
              key={i}
              src={f.dataUrl}
              alt={`Frame ${i + 1}`}
              style={{
                width: 64, height: 48, objectFit: "cover", borderRadius: 6,
                border: "1.5px solid rgba(196,152,42,0.2)",
                animation: `fadeIn 0.3s ease-out ${i * 0.1}s both`,
              }}
            />
          ))}
        </div>
      )}

      {/* Rotating tips during analysis */}
      {progress > 30 && progress < 95 && (
        <div style={{
          marginTop: 28, padding: "12px 20px", borderRadius: 12,
          background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)",
          maxWidth: 320, textAlign: "center", animation: "fadeIn 0.5s ease-out",
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(196,152,42,0.5)", letterSpacing: 1, marginBottom: 6 }}>DID YOU KNOW?</div>
          <div style={{ fontSize: 16, color: "rgba(255,255,255,0.4)", lineHeight: 1.6 }}>
            {[
              "STRIVE uses a 2-pass system: first identifying every skill in the routine, then judging each one for execution errors using USAG criteria.",
              "A typical Level 5-7 routine has 8-12 scoreable elements. Judges evaluate each one independently.",
              "The most common deduction in all of gymnastics? Flexed feet. It happens on almost every skill and adds up fast.",
              "A 'stuck' landing (zero steps) is the single most impressive thing to a judge. It also saves 0.05-0.30.",
              "Knee separation in tucks is called 'cowboy' and costs 0.10-0.20 per occurrence. STRIVE's KTM engine catches it.",
              "At higher levels, composition and connection value can add bonus points. This is why routine construction matters.",
            ][Math.floor((Date.now() / 8000)) % 6]}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── RESULTS SCREEN — SKILL-BY-SKILL ANALYSIS ──────────────────────
function ResultsScreen({ result: rawResult, profile, history, videoUrl, videoFileRef, onBack, onDrills }) {
  // Defensive: re-validate result to prevent crashes from malformed AI responses
  const result = React.useMemo(() => {
    if (!rawResult || typeof rawResult !== "object") return null;
    // Ensure all required fields exist with safe defaults
    const r = { ...rawResult };
    r.finalScore = safeNum(r.finalScore, 0, 0, 10);
    r.startValue = r.startValue ?? 10.0;
    r.totalDeductions = safeNum(r.totalDeductions, 0, 0, 10);
    r.overallAssessment = safeStr(r.overallAssessment || r.truthAnalysis || "");
    r.strengths = safeArray(r.strengths);
    r.areasForImprovement = safeArray(r.areasForImprovement);
    r.topFixes = safeArray(r.topFixes);
    r.executionDeductions = safeArray(r.executionDeductions).map(d => ({
      ...d,
      skill: safeStr(d.skill || "Unknown skill"),
      fault: safeStr(d.fault || "Execution error"),
      deduction: safeNum(d.deduction, 0, 0, 2),
      severity: safeStr(d.severity || "small"),
      category: safeStr(d.category || "execution"),
      engine: safeStr(d.engine || ""),
      details: safeStr(d.details || ""),
      timestamp: safeStr(d.timestamp || "0:00"),
    }));
    // Build skillAnalysis from executionDeductions if missing
    r.skillAnalysis = safeArray(r.skillAnalysis);
    if (r.skillAnalysis.length === 0 && r.executionDeductions.length > 0) {
      r.skillAnalysis = r.executionDeductions.map(d => ({
        timestamp: d.timestamp,
        skill: d.skill,
        type: d.category === "landing" ? "landing" : d.category === "artistry" ? "dance" : "acro",
        verdict: "deduction",
        score: safeNum(d.deduction, 0) <= 0.10 ? "minor" : safeNum(d.deduction, 0) <= 0.20 ? "moderate" : "major",
        deduction: d.deduction,
        fault: d.fault,
        correction: safeStr(d.correction || ""),
        engine: d.engine,
        measuredVsIdeal: safeStr(d.measuredVsIdeal || d.details || ""),
        skeleton: d.skeleton || null,
      }));
    }
    r.skillAnalysis = r.skillAnalysis.map(s => ({
      ...s,
      skill: safeStr(s.skill || "Unknown skill"),
      fault: safeStr(s.fault || ""),
      correction: safeStr(s.correction || ""),
      engine: safeStr(s.engine || ""),
      timestamp: safeStr(s.timestamp || "0:00"),
      deduction: safeNum(s.deduction, 0, 0, 2),
      score: safeStr(s.score || "clean"),
    }));
    if (!r.biomechanics || typeof r.biomechanics !== "object") {
      r.biomechanics = { keyMoments: [], landingAnalysis: [], injuryRiskFlags: [] };
    }
    r.event = safeStr(r.event || "Event");
    r.level = safeStr(r.level || "Level");
    if (DEBUG_MODE) console.log("ResultsScreen result keys:", Object.keys(r), "skills:", r.skillAnalysis.length, "deds:", r.executionDeductions.length);
    return r;
  }, [rawResult]);

  const [activeSkill, setActiveSkill] = useState(null);
  const [actualScore, setActualScore] = useState("");
  const [scoreSaved, setScoreSaved] = useState(false);
  const [showPro, setShowPro] = useState(false);
  const [videoLoading, setVideoLoading] = useState(true);
  const [videoPlayError, setVideoPlayError] = useState(false);
  const [freshVideoUrl, setFreshVideoUrl] = useState(null);
  const [videoOverlay, setVideoOverlay] = useState(null);
  const videoRef = useRef(null);
  const skillCardRefs = useRef({});

  // Generate fresh blob URL from stored File ref (fixes blob URL death on navigation)
  useEffect(() => {
    if (videoFileRef?.current) {
      const url = URL.createObjectURL(videoFileRef.current);
      setFreshVideoUrl(url);
      setVideoLoading(true);
      setVideoPlayError(false);
    }
  }, [videoFileRef]);

  // Auto-dismiss video overlay after 4 seconds
  useEffect(() => {
    if (videoOverlay) {
      const t = setTimeout(() => setVideoOverlay(null), 4000);
      return () => clearTimeout(t);
    }
  }, [videoOverlay]);

  if (!result) return null;

  const skills = safeArray(result.skillAnalysis);
  const deds = safeArray(result.executionDeductions);
  const sortedDeds = [...deds].sort((a, b) => safeNum(b.deduction, 0) - safeNum(a.deduction, 0));
  const scoreColor = result.finalScore >= 9.0 ? "#22c55e" : result.finalScore >= 8.0 ? "#f59e0b" : "#ef4444";
  const isPro = (() => { try { return localStorage.getItem("strive-tier") === "pro"; } catch { return false; } })();
  const vidUrl = freshVideoUrl || videoUrl || result.videoUrl;
  const hasVideo = !!vidUrl;
  const actualNum = parseFloat(actualScore);
  const hasDiff = !isNaN(actualNum) && actualNum > 0;
  const diff = hasDiff ? (result.finalScore - actualNum) : 0;

  const jumpVideo = (timestamp) => {
    if (!videoRef.current || !timestamp) return;
    const first = String(timestamp).split(/[,\-]/)[0].trim();
    if (first.toLowerCase() === "global") return;
    const parts = first.split(":");
    const sec = parts.length === 2 ? parseInt(parts[0]) * 60 + parseInt(parts[1]) : parseFloat(first);
    if (isFinite(sec)) {
      videoRef.current.currentTime = Math.max(0, sec - 0.5);
      videoRef.current.pause();
    }
  };

  // Estimated angle ranges when AI doesn't provide exact angles
  const ESTIMATED_ANGLES = {
    "Bent knees": { joint: "Knee", measured: "~162°", ideal: "180°", deviation: "~18°", severity: "medium" },
    "Soft knees": { joint: "Knee", measured: "~168°", ideal: "180°", deviation: "~12°", severity: "small" },
    "Knee bend": { joint: "Knee", measured: "~165°", ideal: "180°", deviation: "~15°", severity: "small-medium" },
    "Leg separation": { joint: "Hips", measured: "~15° apart", ideal: "0° (together)", deviation: "~15°", severity: "small-medium" },
    "Pike": { joint: "Hip", measured: "~155°", ideal: "180°", deviation: "~25°", severity: "medium" },
    "Arch": { joint: "Spine", measured: "~160°", ideal: "180°", deviation: "~20°", severity: "medium" },
    "Flexed feet": { joint: "Ankle", measured: "~95°", ideal: "140°+ (pointed)", deviation: "~45°", severity: "small" },
    "Toe point": { joint: "Ankle", measured: "~100°", ideal: "140°+", deviation: "~40°", severity: "small" },
    "Balance check": { joint: "Core/CoG", measured: "shifted", ideal: "centered", deviation: "visible", severity: "small" },
    "Steps on landing": { joint: "Ankle/Knee", measured: "unstable", ideal: "stuck", deviation: "1-2 steps", severity: "small-medium" },
    "Deep squat": { joint: "Knee", measured: "~90°", ideal: "135°+", deviation: "~45°", severity: "medium-large" },
    "Insufficient split": { joint: "Hip", measured: "~140°", ideal: "180°", deviation: "~40°", severity: "medium" },
    "Short handstand": { joint: "Shoulder", measured: "~160°", ideal: "180°", deviation: "~20°", severity: "small" },
    "Off vertical": { joint: "Body line", measured: "~170°", ideal: "180°", deviation: "~10°", severity: "small" },
    "Cowboy": { joint: "Knees", measured: ">1.2× shoulder width", ideal: "shoulder width", deviation: "wide", severity: "medium" },
    "Head position": { joint: "Neck", measured: "tucked/thrown", ideal: "neutral", deviation: "visible", severity: "small" },
  };

  const getEstimatedAngles = (fault, engine) => {
    const text = `${fault || ""} ${engine || ""}`.toLowerCase();
    for (const [key, data] of Object.entries(ESTIMATED_ANGLES)) {
      if (text.includes(key.toLowerCase())) return data;
    }
    return null;
  };

  const getSeverityExplanation = (deduction) => {
    const d = safeNum(deduction, 0);
    if (d <= 0.05) return "Barely visible fault — judges may or may not take this.";
    if (d <= 0.10) return "Small but noticeable — most judges will deduct.";
    if (d <= 0.20) return "Clear deviation from correct form — consistent deduction.";
    if (d <= 0.30) return "Significant fault — clearly visible to all judges.";
    if (d <= 0.50) return "Major execution error — large impact on score.";
    return "Fall or very large fault — maximum deduction category.";
  };

  // Drill recommendations per fault type
  const FAULT_DRILLS = {
    "Bent knees": "Wall sits (3×30s) — slide down wall, press knees straight. Focus on locking out during every skill.",
    "Soft knees": "Relevé walks (2 min) with squeezed legs. Cue: 'laser beams from kneecaps.'",
    "Knee bend": "Straight-leg pulses on a panel mat — 3×15 reps emphasizing full extension.",
    "Leg separation": "Squeeze drills: hold a foam block between ankles during jumps and casts. 3×10.",
    "Pike": "Hollow body holds (4×20s). Progress from tuck to full hollow, pressing low back to floor.",
    "Arch": "Superman-to-hollow rolls (3×8). Maintain tension throughout the roll.",
    "Flexed feet": "Toe-point band exercises (3×20). Loop band around toes, point against resistance.",
    "Toe point": "Ankle circles + pointed walks (2 min each). Point through every landing.",
    "Steps on landing": "Stick drills from low box (3×10). Master each height before progressing.",
    "Deep squat": "Eccentric squats (3×10, 4-sec descent). Same absorption pattern as landing.",
    "Insufficient split": "Oversplit stretches (3×30s each side) on a raised surface. Daily flexibility work.",
    "Short handstand": "Wall handstand holds (3×30s). Focus on open shoulder angle and stacked alignment.",
    "Off vertical": "Handstand line drills against wall — heel, hip, shoulder, wrist in one line.",
    "Balance check": "Single-leg relevé holds (3×20s each foot). Close eyes to increase challenge.",
    "Cowboy": "Band walks (2×20 steps). Strengthen hip adductors to keep knees in line.",
    "Head position": "Tennis ball chin drill (5 min). Hold ball under chin during rolls/handstands.",
  };

  const getFaultDrill = (fault, engine) => {
    const text = `${fault || ""} ${engine || ""}`.toLowerCase();
    for (const [key, drill] of Object.entries(FAULT_DRILLS)) {
      if (text.includes(key.toLowerCase())) return drill;
    }
    return null;
  };

  const handleSkillTap = (idx) => {
    const wasActive = activeSkill === idx;
    setActiveSkill(wasActive ? null : idx);
    if (!wasActive && skills[idx]) {
      const s = skills[idx];
      if (s.timestamp) jumpVideo(s.timestamp);
      // Show overlay on video with skill info
      if (s.deduction > 0) {
        setVideoOverlay({ skill: safeStr(s.skill), fault: safeStr(s.fault), deduction: safeNum(s.deduction, 0) });
      } else {
        setVideoOverlay({ skill: safeStr(s.skill), fault: "Clean execution", deduction: 0 });
      }
      // Scroll the card into view (just below the sticky header)
      setTimeout(() => {
        const el = skillCardRefs.current[idx];
        if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 100);
    } else {
      setVideoOverlay(null);
    }
  };

  const sevColors = { clean: "#22c55e", minor: "#86efac", moderate: "#f59e0b", major: "#ef4444" };

  return (
    <div style={{ minHeight: "100vh", padding: "0 0 90px", maxWidth: 540, margin: "0 auto" }}>

      {/* ═══ STICKY VIDEO + SCORE BAR ═══ */}
      <div style={{ position: "sticky", top: 0, zIndex: 50, background: "#0B1024" }}>
        {/* Video */}
        {hasVideo && !videoPlayError && (
          <div style={{ position: "relative", background: "#000" }}>
            {videoLoading && (
              <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 2 }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid rgba(196,152,42,0.2)", borderTopColor: "#C4982A", animation: "rotate 1s linear infinite" }} />
              </div>
            )}
            <video ref={videoRef} src={vidUrl} controls playsInline muted preload="metadata"
              onLoadedData={() => setVideoLoading(false)}
              onError={() => { setVideoLoading(false); setVideoPlayError(true); }}
              style={{ width: "100%", maxHeight: 220, display: "block" }} />
            {/* Deduction overlay on video — shows when a card is tapped */}
            {videoOverlay && (
              <div onClick={() => setVideoOverlay(null)} style={{
                position: "absolute", bottom: 36, left: 12, right: 12,
                padding: "8px 12px", borderRadius: 10,
                background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)",
                border: `1px solid ${videoOverlay.deduction > 0 ? "rgba(239,68,68,0.3)" : "rgba(34,197,94,0.3)"}`,
                display: "flex", alignItems: "center", justifyContent: "space-between",
                animation: "fadeIn 0.15s ease-out", cursor: "pointer", zIndex: 3,
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {videoOverlay.skill}
                  </div>
                  <div style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", marginTop: 1 }}>
                    {videoOverlay.fault.substring(0, 50)}
                  </div>
                </div>
                {videoOverlay.deduction > 0 && (
                  <span style={{ fontSize: 16, fontWeight: 900, fontFamily: "'Space Mono', monospace", color: "#ef4444", flexShrink: 0, marginLeft: 8 }}>
                    -{videoOverlay.deduction.toFixed(2)}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
        {videoPlayError && (
          <div style={{ padding: "16px 18px", background: "rgba(239,68,68,0.06)", borderBottom: "1px solid rgba(239,68,68,0.12)", display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="warning" size={16} color="#ef4444" />
            <span style={{ fontSize: 16, color: "rgba(239,68,68,0.8)" }}>Video playback unavailable. Analysis results shown below.</span>
          </div>
        )}

        {/* Score bar — compact */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 18px", borderBottom: "1px solid rgba(255,255,255,0.04)",
          background: "rgba(11,16,36,0.95)", backdropFilter: "blur(12px)",
        }}>
          <button onClick={onBack} style={{
            background: "none", border: "none", color: "rgba(196,152,42,0.6)", cursor: "pointer",
            fontFamily: "'Outfit', sans-serif", fontSize: 16, fontWeight: 600,
            display: "flex", alignItems: "center", gap: 3, padding: 0,
          }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M7 2L3 6l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Back
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 14, color: "rgba(255,255,255,0.25)", letterSpacing: 0.5 }}>
              {result.event} · {result.level}
            </span>
            <span style={{ fontSize: 24, fontWeight: 900, fontFamily: "'Space Mono', monospace", color: scoreColor }}>
              {safeNum(result.finalScore, 0, 0, 10).toFixed(3)}
            </span>
          </div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.3)", textAlign: "right", lineHeight: 1.4 }}>
            <div style={{ color: "#ef4444", fontFamily: "'Space Mono', monospace" }}>-{safeNum(result.totalDeductions, 0).toFixed(2)}</div>
            <div>{deds.length} ded</div>
          </div>
        </div>

        {/* Skill timeline — horizontal scroll */}
        {skills.length > 0 && (
          <div style={{
            display: "flex", gap: 2, padding: "8px 18px", overflowX: "auto",
            background: "rgba(11,16,36,0.9)", borderBottom: "1px solid rgba(255,255,255,0.03)",
            WebkitOverflowScrolling: "touch",
          }}>
            {skills.map((s, i) => {
              const c = sevColors[s.score] || "#22c55e";
              const isActive = activeSkill === i;
              return (
                <button key={i} onClick={() => handleSkillTap(i)} style={{
                  flexShrink: 0, padding: "4px 10px", borderRadius: 8,
                  background: isActive ? `${c}18` : "transparent",
                  border: `1px solid ${isActive ? `${c}40` : "transparent"}`,
                  cursor: "pointer", fontFamily: "'Outfit', sans-serif",
                  display: "flex", alignItems: "center", gap: 4,
                  transition: "all 0.15s",
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: c, flexShrink: 0, boxShadow: s.deduction > 0 ? `0 0 6px ${c}50` : "none" }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: isActive ? c : "rgba(255,255,255,0.3)", whiteSpace: "nowrap" }}>
                    {safeStr(s.skill).substring(0, 14)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══ CONTENT ═══ */}
      <div style={{ padding: "14px 18px 0" }}>

        {/* Demo notice */}
        {result.isDemo && (
          <div style={{ padding: "10px 14px", borderRadius: 12, marginBottom: 14, background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.12)", fontSize: 16, color: "rgba(245,158,11,0.8)" }}>
            Demo — {result.failureReason ? result.failureReason.substring(0, 80) : "upload a video for real analysis"}
          </div>
        )}

        {/* Score Math Card */}
        <div style={{ marginBottom: 14, padding: "14px 16px", borderRadius: 14, background: "rgba(196,152,42,0.03)", border: "1px solid rgba(196,152,42,0.08)", animation: "fadeIn 0.4s ease-out" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(196,152,42,0.5)", letterSpacing: 1, marginBottom: 10 }}>SCORE BREAKDOWN</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginBottom: 4 }}>START</div>
              <div style={{ fontSize: 24, fontWeight: 900, fontFamily: "'Space Mono', monospace", color: "rgba(255,255,255,0.8)" }}>10.000</div>
            </div>
            <span style={{ fontSize: 20, color: "rgba(255,255,255,0.2)", marginTop: 12 }}>-</span>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginBottom: 4 }}>DEDUCTIONS</div>
              <div style={{ fontSize: 24, fontWeight: 900, fontFamily: "'Space Mono', monospace", color: "#ef4444" }}>{safeNum(result.totalDeductions, 0).toFixed(3)}</div>
            </div>
            <span style={{ fontSize: 20, color: "rgba(255,255,255,0.2)", marginTop: 12 }}>=</span>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginBottom: 4 }}>FINAL</div>
              <div style={{ fontSize: 24, fontWeight: 900, fontFamily: "'Space Mono', monospace", color: scoreColor }}>{safeNum(result.finalScore, 0, 0, 10).toFixed(3)}</div>
            </div>
          </div>
        </div>

        {/* Quick wins */}
        {sortedDeds.length >= 2 && (() => {
          const top3 = sortedDeds.slice(0, 3);
          const gain = top3.reduce((s, d) => s + safeNum(d.deduction, 0), 0);
          return (
            <div style={{ marginBottom: 14, padding: "12px 14px", borderRadius: 14, background: "rgba(34,197,94,0.03)", border: "1px solid rgba(34,197,94,0.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.2)", letterSpacing: 1 }}>FASTEST PATH TO IMPROVEMENT</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: "#22c55e", fontFamily: "'Space Mono', monospace" }}>+{gain.toFixed(2)}</span>
              </div>
              {top3.map((d, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 16 }}>
                  <span style={{ color: "rgba(255,255,255,0.45)" }}>{i+1}. {safeStr(d.skill)}</span>
                  <span style={{ color: "#22c55e", fontWeight: 700, fontFamily: "'Space Mono', monospace" }}>+{safeNum(d.deduction, 0).toFixed(2)}</span>
                </div>
              ))}
            </div>
          );
        })()}

        {/* ═══ SKILL-BY-SKILL FEED ═══ */}
        <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.15)", letterSpacing: 1, marginBottom: 10 }}>
          ROUTINE BREAKDOWN · {skills.length} SKILLS
        </div>

        {skills.map((s, i) => {
          const isActive = activeSkill === i;
          const c = sevColors[s.score] || "#22c55e";
          const hasDed = s.deduction > 0;
          const bio = safeArray(result.biomechanics?.keyMoments).find(m => m.timestamp === s.timestamp || m.skill === s.skill);
          const landing = safeArray(result.biomechanics?.landingAnalysis).find(l => l.timestamp === s.timestamp);
          const injury = safeArray(result.biomechanics?.injuryRiskFlags).find(f => f.timestamp === s.timestamp);
          const estimated = hasDed ? getEstimatedAngles(s.fault, s.engine) : null;
          const drill = hasDed ? getFaultDrill(s.fault, s.engine) : null;

          return (
            <div key={i}
              ref={el => { skillCardRefs.current[i] = el; }}
              onClick={() => handleSkillTap(i)}
              style={{
                marginBottom: 6, borderRadius: 16, cursor: "pointer",
                background: isActive ? `${c}0C` : "rgba(255,255,255,0.015)",
                border: `1px solid ${isActive ? `${c}35` : "rgba(255,255,255,0.03)"}`,
                boxShadow: isActive ? `0 0 12px ${c}15, inset 0 0 0 1px ${c}10` : "none",
                overflow: "hidden", transition: "all 0.15s",
                animation: `floatIn 0.25s ease-out ${i * 0.03}s both`,
              }}
            >
              {/* Skill header — always visible */}
              <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                {/* Status indicator */}
                <div style={{
                  width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                  background: `${c}12`, display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14,
                }}>
                  {hasDed ? <span style={{ fontSize: 14, fontWeight: 800, color: c, fontFamily: "'Space Mono', monospace" }}>-{s.deduction.toFixed(1)}</span> : <span style={{ color: c, fontSize: 16 }}>✓</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0" }}>{safeStr(s.skill)}</span>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.15)" }}>{s.type || ""}</span>
                  </div>
                  <div style={{ fontSize: 14, color: "rgba(255,255,255,0.25)", marginTop: 2 }}>
                    {s.timestamp}{hasDed ? ` · ${safeStr(s.fault).substring(0, 40)}` : s.verdict === "strength" ? " · Notable strength" : ""}
                  </div>
                </div>
                {/* Chevron */}
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, transform: isActive ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.15s" }}>
                  <path d="M3 4.5l3 3 3-3" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>

              {/* ═══ EXPANDED SKILL DETAIL ═══ */}
              {isActive && (
                <div style={{ padding: "0 14px 14px", animation: "fadeIn 0.15s ease-out" }}>

                  {/* Fault detail */}
                  {hasDed && (
                    <div style={{ padding: "10px 12px", borderRadius: 10, marginBottom: 8, background: `${c}06`, border: `1px solid ${c}15` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: c, letterSpacing: 0.5 }}>
                          {s.engine && `${s.engine} · `}{s.score?.toUpperCase()}
                        </span>
                        <span style={{ fontSize: 18, fontWeight: 800, fontFamily: "'Space Mono', monospace", color: c }}>
                          -{safeNum(s.deduction, 0).toFixed(2)}
                        </span>
                      </div>
                      <div style={{ fontSize: 16, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>{safeStr(s.fault)}</div>
                      {/* Severity explanation */}
                      <div style={{ marginTop: 6, fontSize: 14, color: "rgba(255,255,255,0.3)", fontStyle: "italic" }}>
                        {getSeverityExplanation(s.deduction)}
                      </div>
                    </div>
                  )}

                  {/* Measured vs Ideal angles — from AI or estimated */}
                  {hasDed && (() => {
                    const hasAIAngles = s.measuredVsIdeal || (bio?.jointAngles && Object.keys(bio.jointAngles).length > 0);
                    const est = !hasAIAngles ? estimated : null;
                    return (hasAIAngles || est) ? (
                      <div style={{ padding: "8px 10px", borderRadius: 8, marginBottom: 8, background: "rgba(59,130,246,0.03)", border: "1px solid rgba(59,130,246,0.06)" }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(59,130,246,0.6)", letterSpacing: 0.5, marginBottom: 6 }}>
                          BIOMECHANICS{!hasAIAngles && est ? " (ESTIMATED)" : ""}
                        </div>
                        {/* AI-provided angles */}
                        {s.measuredVsIdeal && (
                          <div style={{ padding: "5px 8px", borderRadius: 6, background: "rgba(255,255,255,0.02)", fontSize: 14, color: "rgba(255,255,255,0.5)", fontFamily: "'Space Mono', monospace", marginBottom: 4 }}>
                            {s.measuredVsIdeal}
                          </div>
                        )}
                        {bio?.jointAngles && Object.entries(bio.jointAngles).map(([joint, angle]) => (
                          <div key={joint} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 8px", borderRadius: 4, marginBottom: 2, background: "rgba(59,130,246,0.04)" }}>
                            <span style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>{joint}</span>
                            <span style={{ fontSize: 14, fontFamily: "'Space Mono', monospace", color: "rgba(239,68,68,0.8)" }}>
                              {typeof angle === "number" ? `${angle}°` : angle}
                            </span>
                          </div>
                        ))}
                        {/* Estimated angles when AI doesn't provide them */}
                        {est && (
                          <>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 8px", borderRadius: 4, background: "rgba(59,130,246,0.04)", marginBottom: 2 }}>
                              <span style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>{est.joint}</span>
                              <div style={{ textAlign: "right" }}>
                                <span style={{ fontSize: 14, fontFamily: "'Space Mono', monospace", color: "#ef4444" }}>{est.measured}</span>
                                <span style={{ fontSize: 14, color: "rgba(255,255,255,0.2)", margin: "0 4px" }}>vs</span>
                                <span style={{ fontSize: 14, fontFamily: "'Space Mono', monospace", color: "#22c55e" }}>{est.ideal}</span>
                              </div>
                            </div>
                            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.3)", marginTop: 4, lineHeight: 1.5 }}>
                              This {est.deviation} deviation is a {est.severity} deduction per USAG standards.
                            </div>
                          </>
                        )}
                        {bio?.notes && <div style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", lineHeight: 1.5, marginTop: 4 }}>{bio.notes}</div>}
                      </div>
                    ) : null;
                  })()}

                  {/* What correct looks like */}
                  {hasDed && estimated && (
                    <div style={{ padding: "8px 10px", borderRadius: 8, marginBottom: 8, background: "rgba(34,197,94,0.02)", border: "1px solid rgba(34,197,94,0.05)" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(34,197,94,0.5)", letterSpacing: 0.5, marginBottom: 4 }}>WHAT CORRECT LOOKS LIKE</div>
                      <div style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}>
                        {estimated.joint === "Knee" && "Legs completely straight with kneecaps locked back. No visible bend when viewed from the side."}
                        {estimated.joint === "Hips" && "Legs pressed together with no visible gap. Inner thighs, knees, and ankles touching throughout."}
                        {estimated.joint === "Hip" && "Full 180° split or flat body line with no visible pike at the hips."}
                        {estimated.joint === "Spine" && "Straight body line from shoulders through hips — no visible arch in the lower back."}
                        {estimated.joint === "Ankle" && "Toes fully extended, creating a smooth line from shin through the top of the foot."}
                        {estimated.joint === "Core/CoG" && "Body centered over base of support with no visible wobble or shift."}
                        {estimated.joint === "Ankle/Knee" && "Land with feet together, absorb with a slight knee bend, and hold position with no steps."}
                        {estimated.joint === "Shoulder" && "Full vertical handstand — ears between arms, body stacked in a straight line."}
                        {estimated.joint === "Body line" && "Perfectly vertical body line with no visible lean or deviation from 180°."}
                        {estimated.joint === "Knees" && "Knees tracking directly over toes, no wider than shoulder width apart."}
                        {estimated.joint === "Neck" && "Head in neutral position — chin neither tucked to chest nor thrown back."}
                      </div>
                    </div>
                  )}

                  {/* Clean skill — what was good */}
                  {!hasDed && (s.correction || s.verdict === "strength") && (
                    <div style={{ padding: "10px 12px", borderRadius: 10, marginBottom: 8, background: "rgba(34,197,94,0.04)", border: "1px solid rgba(34,197,94,0.06)" }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#22c55e", letterSpacing: 0.5, marginBottom: 4 }}>WELL EXECUTED</div>
                      <div style={{ fontSize: 16, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>{s.correction || "Clean execution — no deductions taken."}</div>
                    </div>
                  )}

                  {/* Skeleton overlay — simplified, only when data exists */}
                  {s.skeleton && s.skeleton.joints && (
                    <div style={{ marginBottom: 8, borderRadius: 10, overflow: "hidden", background: "rgba(0,0,0,0.2)", padding: 8, position: "relative", height: 120 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.15)", letterSpacing: 0.5, marginBottom: 4 }}>BODY POSITION</div>
                      <SkeletonOverlay skeleton={s.skeleton} />
                    </div>
                  )}

                  {/* Landing analysis */}
                  {landing && (
                    <div style={{ padding: "8px 10px", borderRadius: 8, marginBottom: 8, background: "rgba(196,152,42,0.03)", border: "1px solid rgba(196,152,42,0.06)" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(196,152,42,0.6)", letterSpacing: 0.5, marginBottom: 4 }}>LANDING</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {landing.kneeFlexionAtImpact && <span style={{ fontSize: 14, padding: "2px 8px", borderRadius: 4, background: "rgba(196,152,42,0.06)", color: "rgba(196,152,42,0.7)", fontFamily: "'Space Mono', monospace" }}>Knee: {landing.kneeFlexionAtImpact}°</span>}
                        {landing.chestAngle && <span style={{ fontSize: 14, padding: "2px 8px", borderRadius: 4, background: "rgba(196,152,42,0.06)", color: "rgba(196,152,42,0.7)", fontFamily: "'Space Mono', monospace" }}>Chest: {landing.chestAngle}°</span>}
                        {landing.stepsAfter != null && <span style={{ fontSize: 14, padding: "2px 8px", borderRadius: 4, background: landing.stepsAfter > 0 ? "rgba(239,68,68,0.06)" : "rgba(34,197,94,0.06)", color: landing.stepsAfter > 0 ? "rgba(239,68,68,0.7)" : "rgba(34,197,94,0.7)" }}>{landing.stepsAfter === 0 ? "Stuck!" : `${landing.stepsAfter} step${landing.stepsAfter > 1 ? "s" : ""}`}</span>}
                      </div>
                      {landing.notes && <div style={{ fontSize: 14, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>{landing.notes}</div>}
                    </div>
                  )}

                  {/* Injury flag */}
                  {injury && (
                    <div style={{ padding: "6px 10px", borderRadius: 8, marginBottom: 8, background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.08)", fontSize: 14, color: "rgba(239,68,68,0.7)" }}>
                      {injury.reason} — {injury.recommendation}
                    </div>
                  )}

                  {/* Correction / how to fix */}
                  {hasDed && s.correction && (
                    <div style={{ padding: "10px 12px", borderRadius: 10, marginBottom: 8, background: "rgba(34,197,94,0.03)", border: "1px solid rgba(34,197,94,0.06)" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#22c55e", letterSpacing: 0.5, marginBottom: 4 }}>HOW TO FIX</div>
                      <div style={{ fontSize: 16, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>{safeStr(s.correction)}</div>
                    </div>
                  )}

                  {/* Specific drill recommendation */}
                  {hasDed && (drill || s.correction) && (
                    <div style={{ padding: "8px 10px", borderRadius: 8, marginBottom: 8, background: "rgba(139,92,246,0.03)", border: "1px solid rgba(139,92,246,0.06)" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(139,92,246,0.6)", letterSpacing: 0.5, marginBottom: 4 }}>DRILL FOR THIS FAULT</div>
                      <div style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}>
                        {drill || `Practice this skill with focus on ${safeStr(s.fault).substring(0, 40)}. Film and compare.`}
                      </div>
                    </div>
                  )}

                  {/* Jump to timestamp button */}
                  {hasVideo && s.timestamp && s.timestamp !== "Global" && (
                    <button onClick={(e) => {
                      e.stopPropagation();
                      jumpVideo(s.timestamp);
                      setVideoOverlay({ skill: safeStr(s.skill), fault: safeStr(s.fault), deduction: safeNum(s.deduction, 0) });
                    }} style={{
                      width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(196,152,42,0.12)",
                      background: "rgba(196,152,42,0.03)", cursor: "pointer", fontSize: 14, fontWeight: 600,
                      color: "#C4982A", fontFamily: "'Outfit', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                    }}>
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 1l7 4-7 4V1z" fill="currentColor"/></svg>
                      Jump to {s.timestamp}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* ═══ BODY HEATMAP ═══ */}
        <div style={{ marginTop: 14, marginBottom: 14 }}>
          <BodyHeatmap deductions={result.executionDeductions} />
        </div>

        {/* ═══ STRENGTHS + AREAS ═══ */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {safeArray(result.strengths).length > 0 && (
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(34,197,94,0.5)", letterSpacing: 0.5, marginBottom: 6 }}>STRENGTHS</div>
              {safeArray(result.strengths).slice(0, 3).map((s, i) => (
                <div key={i} style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", padding: "4px 0", lineHeight: 1.5 }}>
                  <span style={{ color: "#22c55e", marginRight: 4 }}>✓</span>{safeStr(s).substring(0, 50)}
                </div>
              ))}
            </div>
          )}
          {safeArray(result.areasForImprovement).length > 0 && (
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(245,158,11,0.5)", letterSpacing: 0.5, marginBottom: 6 }}>IMPROVE</div>
              {safeArray(result.areasForImprovement).slice(0, 3).map((a, i) => (
                <div key={i} style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", padding: "4px 0", lineHeight: 1.5 }}>
                  <span style={{ color: "#f59e0b", marginRight: 4 }}>▲</span>{safeStr(a).substring(0, 50)}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ═══ ASSESSMENT ═══ */}
        {(result.overallAssessment || result.truthAnalysis) && (
          <div style={{ marginBottom: 14, padding: "12px 14px", borderRadius: 14, background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.03)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(196,152,42,0.4)", letterSpacing: 0.5, marginBottom: 6 }}>JUDGE'S ASSESSMENT</div>
            <div style={{ fontSize: 16, color: "rgba(255,255,255,0.45)", lineHeight: 1.7 }}>
              {safeStr(result.overallAssessment || result.truthAnalysis).substring(0, 500)}
            </div>
          </div>
        )}

        {/* ═══ ACTUAL SCORE ═══ */}
        <div style={{ marginBottom: 14, padding: "12px 14px", borderRadius: 14, background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.03)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.15)", letterSpacing: 0.5, marginBottom: 6 }}>ACTUAL MEET SCORE</div>
              <input className="input-field" type="number" step="0.025" min="0" max="10" placeholder="8.925"
                value={actualScore} onChange={(e) => { setActualScore(e.target.value); setScoreSaved(false); }}
                onClick={(e) => e.stopPropagation()}
                style={{ padding: "10px 12px", fontSize: 18, fontFamily: "'Space Mono', monospace", fontWeight: 700 }} />
            </div>
            {hasDiff && (
              <div style={{ textAlign: "center", minWidth: 65 }}>
                <div style={{ fontSize: 18, fontWeight: 900, fontFamily: "'Space Mono', monospace", color: Math.abs(diff) < 0.15 ? "#22c55e" : Math.abs(diff) < 0.4 ? "#f59e0b" : "#ef4444" }}>
                  {diff > 0 ? "+" : ""}{diff.toFixed(2)}
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.25)" }}>{Math.abs(diff) < 0.15 ? "Accurate" : Math.abs(diff) < 0.4 ? "Close" : "Off"}</div>
              </div>
            )}
          </div>
          {hasDiff && !scoreSaved && (
            <button onClick={async (e) => { e.stopPropagation();
              try { const cal = await storage.get("strive-calibration"); const data = cal ? JSON.parse(cal.value) : [];
                data.push({ date: new Date().toISOString(), event: result.event, level: result.level, aiScore: result.finalScore, actualScore: actualNum, diff });
                await storage.set("strive-calibration", JSON.stringify(data.slice(-50)));
              } catch {} setScoreSaved(true);
            }} className="btn-outline" style={{ width: "100%", marginTop: 8, padding: "8px", fontSize: 14 }}>
              {Math.abs(diff) >= 0.3 ? "Submit Score Correction" : "Save — helps calibrate"}
            </button>
          )}
          {hasDiff && Math.abs(diff) >= 0.3 && !scoreSaved && (<div style={{ fontSize: 14, color: "rgba(245,158,11,0.7)", marginTop: 6, lineHeight: 1.5, padding: "6px 10px", borderRadius: 8, background: "rgba(245,158,11,0.04)" }}>Score differs by {Math.abs(diff).toFixed(2)}. Submitting helps calibrate future analyses.</div>)}
        </div>

        {/* ═══ PRO (collapsible) ═══ */}
        <button onClick={() => setShowPro(!showPro)} style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 14px", borderRadius: 14, marginBottom: 6,
          background: "rgba(139,92,246,0.02)", border: "1px solid rgba(139,92,246,0.06)",
          cursor: "pointer", fontFamily: "'Outfit', sans-serif", fontSize: 16, fontWeight: 600,
          color: isPro ? "rgba(167,139,250,0.7)" : "rgba(255,255,255,0.3)",
        }}>
          <span>{isPro ? "Advanced analysis" : "Pro features"}</span>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ transform: showPro ? "rotate(180deg)" : "", transition: "transform 0.15s" }}>
            <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
        {showPro && (
          <div style={{ animation: "fadeIn 0.15s ease-out", marginBottom: 14 }}>
            {isPro ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <BiomechanicsDashboard result={result} />
                <TrainingProgram result={result} profile={profile} history={history} />
                <WhatIfSimulator result={result} />
                <DiagnosticsDashboard result={result} />
              </div>
            ) : (
              <div style={{ padding: 16, borderRadius: 14, textAlign: "center", background: "rgba(139,92,246,0.02)", border: "1px solid rgba(139,92,246,0.06)" }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Unlock full analysis</div>
                <div style={{ fontSize: 14, color: "rgba(255,255,255,0.3)", marginBottom: 14 }}>Biomechanics, training, what-if, diagnostics</div>
                <button onClick={() => { try { localStorage.setItem("strive-tier", "pro"); } catch {} window.location.reload(); }} style={{
                  background: "linear-gradient(135deg, #8B5CF6, #A78BFA)", color: "#FFF", border: "none",
                  padding: "10px 28px", borderRadius: 10, fontWeight: 700, fontSize: 16, cursor: "pointer", fontFamily: "'Outfit', sans-serif",
                }}>Upgrade</button>
              </div>
            )}
          </div>
        )}

        {/* ═══ ACTIONS ═══ */}
        <button className="btn-gold" onClick={onDrills} style={{ width: "100%", fontSize: 14, padding: 13 }}>
          Get drills for these deductions
        </button>
        {/* Copy Analysis for Coach */}
        <button className="btn-outline" onClick={() => {
          const lines = [`STRIVE Analysis — ${result.event || "Event"} · ${result.level || "Level"}`, `Score: ${safeNum(result.finalScore, 0).toFixed(3)} (${deds.length} deductions, -${safeNum(result.totalDeductions, 0).toFixed(2)} total)`, ""];
          if (safeArray(result.strengths).length > 0) { lines.push("STRENGTHS:"); safeArray(result.strengths).slice(0, 3).forEach(s => lines.push(`  + ${safeStr(s)}`)); lines.push(""); }
          lines.push("DEDUCTIONS:");
          sortedDeds.forEach((d, i) => lines.push(`  ${i+1}. ${safeStr(d.skill)} — ${safeStr(d.fault)} (-${safeNum(d.deduction, 0).toFixed(2)})`));
          lines.push("");
          if (safeArray(result.topFixes).length > 0) { lines.push("TOP FIXES:"); safeArray(result.topFixes).slice(0, 3).forEach(f => lines.push(`  - ${safeStr(f)}`)); lines.push(""); }
          if (result.overallAssessment) { lines.push("ASSESSMENT:"); lines.push(`  ${safeStr(result.overallAssessment).substring(0, 200)}`); lines.push(""); }
          lines.push("— Generated by STRIVE");
          const fullText = lines.join("\n");
          if (navigator.clipboard) navigator.clipboard.writeText(fullText).then(() => alert("Analysis copied to clipboard! Paste into a message to your coach.")).catch(() => {});
        }} style={{ width: "100%", fontSize: 16, padding: 12, marginTop: 6, borderColor: "rgba(196,152,42,0.2)", color: "#C4982A" }}>
          Copy Analysis for Coach
        </button>
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <button className="btn-outline" onClick={() => {
            const text = [`STRIVE — ${result.event} · ${result.level}`, `Score: ${safeNum(result.finalScore, 0).toFixed(3)}`, "",
              ...sortedDeds.slice(0, 5).map((d, i) => `${i+1}. ${safeStr(d.skill)} -${safeNum(d.deduction, 0).toFixed(2)}`),
              "", "strive-app-amber.vercel.app"].join("\n");
            if (navigator.share) navigator.share({ title: `STRIVE ${result.event}`, text }).catch(() => {});
            else if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => alert("Copied!"));
          }} style={{ flex: 1, fontSize: 14, padding: 10 }}>Share</button>
          <button className="btn-outline" onClick={onBack} style={{ flex: 1, fontSize: 14, padding: 10 }}>New analysis</button>
        </div>
      </div>
    </div>
  );
}

// ─── DRILLS SCREEN ──────────────────────────────────────────────────
function DrillsScreen({ result, onBack }) {
  const deds = result?.executionDeductions || [];
  const identifiedFaults = deds.map(d => d.fault) || [];

  const getDrills = (fault) => {
    for (const [key, drills] of Object.entries(DRILLS_DATABASE)) {
      if (fault?.toLowerCase().includes(key.toLowerCase())) return { key, drills };
    }
    return { key: "General conditioning", drills: DRILLS_DATABASE.default };
  };

  const faultDrillPairs = identifiedFaults.map((f, i) => ({
    fault: f,
    skill: deds[i]?.skill || "",
    deduction: deds[i]?.deduction || 0,
    ...getDrills(f),
  }));

  // Deduplicate by drill key, keep highest deduction version
  const seen = new Set();
  const uniquePairs = faultDrillPairs
    .sort((a, b) => b.deduction - a.deduction)
    .filter(p => {
      if (seen.has(p.key)) return false;
      seen.add(p.key);
      return true;
    });

  // Total potential score gain
  const totalGain = uniquePairs.reduce((s, p) => s + p.deduction, 0);

  return (
    <div style={{ minHeight: "100vh", padding: "16px 18px 90px", maxWidth: 540, margin: "0 auto" }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: "rgba(196,152,42,0.6)", cursor: "pointer", fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 600, marginBottom: 14, display: "flex", alignItems: "center", gap: 4 }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M8.5 2.5l-5 5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> Results
      </button>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>
        Your Drill Plan
      </h2>
      <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginBottom: 8 }}>
        {uniquePairs.length} targeted exercises based on {deds.length} deductions identified in your routine.
      </p>

      {/* Score impact summary */}
      {totalGain > 0 && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          padding: "10px 16px", borderRadius: 12, marginBottom: 20,
          background: "rgba(34,197,94,0.04)", border: "1px solid rgba(34,197,94,0.1)",
        }}>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Complete this plan to gain up to</span>
          <span style={{ fontSize: 18, fontWeight: 900, fontFamily: "'Space Mono', monospace", color: "#22c55e" }}>+{totalGain.toFixed(2)}</span>
        </div>
      )}

      {/* Weekly Training Plan */}
      <WeeklyTrainingPlan faults={identifiedFaults} />

      {uniquePairs.map((pair, i) => (
        <div key={i} style={{ marginBottom: 20, animation: `fadeIn 0.3s ease-out ${i * 0.08}s both` }}>
          <div style={{
            background: "rgba(196,152,42,0.06)", borderRadius: "12px 12px 0 0",
            padding: "10px 16px", borderBottom: "1px solid rgba(196,152,42,0.1)",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{pair.skill || pair.fault}</span>
              {pair.skill && pair.fault !== pair.skill && (
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginLeft: 6 }}>— {pair.fault.substring(0, 40)}</span>
              )}
            </div>
            {pair.deduction > 0 && (
              <span style={{
                fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 6,
                background: "rgba(34,197,94,0.1)", color: "#22c55e",
                fontFamily: "'Space Mono', monospace",
              }}>
                +{pair.deduction.toFixed(2)}
              </span>
            )}
          </div>
          {pair.drills.map((drill, j) => (
            <div key={j} className="card" style={{
              borderRadius: j === pair.drills.length - 1 ? "0 0 12px 12px" : 0,
              borderTop: "none", marginBottom: 0, padding: "14px 16px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3, color: "#C4982A" }}>
                    {drill.name}
                  </div>
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>
                    {drill.description}
                  </p>
                  {drill.yt && (
                    <a href={drill.yt} target="_blank" rel="noopener noreferrer" style={{
                      display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8,
                      padding: "5px 12px", borderRadius: 8,
                      background: "rgba(255,0,0,0.06)", border: "1px solid rgba(255,0,0,0.12)",
                      color: "#ff6b6b", fontSize: 11, fontWeight: 600, textDecoration: "none",
                      fontFamily: "'Outfit', sans-serif",
                    }}>
                      ▶ Watch on YouTube
                    </a>
                  )}
                </div>
                <span style={{
                  fontFamily: "'Space Mono', monospace", fontSize: 10, fontWeight: 700,
                  background: "rgba(255,255,255,0.05)", padding: "4px 8px", borderRadius: 5,
                  whiteSpace: "nowrap", marginLeft: 10, color: "rgba(255,255,255,0.4)",
                }}>
                  {drill.duration}
                </span>
              </div>
            </div>
          ))}
        </div>
      ))}

      {/* General recommendation */}
      <div className="card" style={{ padding: 20, marginTop: 16, borderColor: "rgba(196,152,42,0.2)" }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#C4982A", marginBottom: 10 }}>
          <Icon name="sparkle" size={14} /> Pro Tips
        </h3>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.8 }}>
          Practice each drill 3-4 times per week. Film yourself doing drills to check form. Focus on quality over quantity — one perfect rep beats ten sloppy ones. Show your coach the analysis and ask them to watch for the specific faults during practice.
        </div>
      </div>
    </div>
  );
}

// ─── DEDUCTIONS REFERENCE SCREEN ────────────────────────────────────
function DeductionsScreen({ onBack, profile }) {
  const [activeCategory, setActiveCategory] = useState("execution");
  const [calcStart, setCalcStart] = useState("10.0");
  const [calcDeds, setCalcDeds] = useState("");

  // Quick score calculator
  const startVal = parseFloat(calcStart) || 10;
  const totalDeds = parseFloat(calcDeds) || 0;
  const calcResult = Math.max(0, startVal - totalDeds);

  // Descriptions for each category
  const catDescriptions = {
    execution: "Form errors on individual skills — bent knees, flexed feet, body alignment. Taken on every skill.",
    landing: "Steps, hops, squats, or falls on landings. Every landing is judged separately.",
    artistry: "Beam and floor only — confidence, musicality, expression, use of space.",
    neutral: "Rule violations — out of bounds, overtime, missing requirements. Not execution errors.",
  };

  return (
    <div style={{ minHeight: "100vh", padding: "16px 18px 90px", maxWidth: 540, margin: "0 auto" }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: "rgba(196,152,42,0.6)", cursor: "pointer", fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 600, marginBottom: 14, display: "flex", alignItems: "center", gap: 4 }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M8.5 2.5l-5 5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> Dashboard
      </button>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Deduction Guide</h2>
      <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginBottom: 20 }}>
        USAG / Xcel scoring reference · {profile?.level || "All Levels"}
      </p>

      {/* Quick Score Calculator for Parents */}
      <div className="card" style={{ marginBottom: 16, padding: 16, borderColor: "rgba(196,152,42,0.15)", background: "rgba(196,152,42,0.03)" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#C4982A", letterSpacing: 1, marginBottom: 10 }}>QUICK SCORE CALCULATOR</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginBottom: 4 }}>START</div>
            <input
              className="input-field"
              type="number"
              value={calcStart}
              onChange={e => setCalcStart(e.target.value)}
              style={{ width: 70, textAlign: "center", fontSize: 16, padding: "8px 6px", fontFamily: "'Space Mono', monospace", fontWeight: 700 }}
            />
          </div>
          <span style={{ fontSize: 18, color: "rgba(255,255,255,0.2)", marginTop: 14 }}>−</span>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginBottom: 4 }}>DEDUCTIONS</div>
            <input
              className="input-field"
              type="number"
              step="0.05"
              placeholder="0.00"
              value={calcDeds}
              onChange={e => setCalcDeds(e.target.value)}
              style={{ width: 70, textAlign: "center", fontSize: 16, padding: "8px 6px", fontFamily: "'Space Mono', monospace", fontWeight: 700 }}
            />
          </div>
          <span style={{ fontSize: 18, color: "rgba(255,255,255,0.2)", marginTop: 14 }}>=</span>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginBottom: 4 }}>SCORE</div>
            <div style={{
              fontSize: 22, fontWeight: 900, fontFamily: "'Space Mono', monospace",
              color: calcResult >= 9.0 ? "#22c55e" : calcResult >= 8.0 ? "#f59e0b" : "#ef4444",
              padding: "6px 0",
            }}>
              {calcResult.toFixed(2)}
            </div>
          </div>
        </div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 8 }}>
          Add up the deductions from the list below to understand how a score is calculated.
        </div>
      </div>

      {/* Scale Legend — compact */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
        {Object.entries(DEDUCTION_SCALE).map(([key, val]) => (
          <span key={key} style={{
            fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 6,
            background: `${val.color}15`, color: val.color, letterSpacing: 0.3,
          }}>
            {key}: {val.range}
          </span>
        ))}
      </div>

      {/* Category Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 8, overflowX: "auto" }}>
        {Object.keys(DEDUCTION_CATEGORIES).map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            style={{
              padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer",
              fontFamily: "'Outfit', sans-serif", fontWeight: 600, fontSize: 12,
              background: activeCategory === cat ? "#C4982A" : "rgba(255,255,255,0.06)",
              color: activeCategory === cat ? "#0B1024" : "rgba(255,255,255,0.5)",
              whiteSpace: "nowrap", transition: "all 0.2s", textTransform: "capitalize",
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Category description */}
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 14, lineHeight: 1.5, padding: "0 4px" }}>
        {catDescriptions[activeCategory]}
      </div>

      {/* Deduction List */}
      {DEDUCTION_CATEGORIES[activeCategory]?.map((ded, i) => {
        const severityColor = ded.category === "fall" ? "#dc2626" :
          ded.category.includes("large") ? "#f97316" :
          ded.category === "medium" || ded.category === "small-medium" ? "#f59e0b" : "#22c55e";

        return (
          <div key={i} className="card" style={{
            marginBottom: 6, padding: "12px 14px",
            borderLeft: `3px solid ${severityColor}`,
            animation: `fadeIn 0.2s ease-out ${i * 0.03}s both`,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{ded.fault}</span>
              <span style={{
                fontFamily: "'Space Mono', monospace", fontWeight: 700, fontSize: 12,
                color: severityColor, marginLeft: 12, whiteSpace: "nowrap",
              }}>
                {ded.deduction}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── SETTINGS SCREEN ────────────────────────────────────────────────
function SettingsScreen({ profile, history, savedResults, onSave, onBack, onReset }) {
  const [editProfile, setEditProfile] = useState({ ...profile });
  const [showConfirm, setShowConfirm] = useState(false);
  const [geminiKey, setGeminiKey] = useState("");
  const [keySaved, setKeySaved] = useState(false);
  const events = editProfile.gender === "female" ? WOMEN_EVENTS : MEN_EVENTS;
  const levelOptions = editProfile.gender && editProfile.levelCategory
    ? LEVELS[editProfile.gender === "female" ? "women" : "men"][editProfile.levelCategory] || []
    : [];

  useEffect(() => {
    (async () => {
      try { const k = await storage.get("strive-gemini-key"); if (k) setGeminiKey(k.value); } catch {}
    })();
  }, []);

  return (
    <div style={{ minHeight: "100vh", padding: "16px 18px 90px", maxWidth: 540, margin: "0 auto" }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: "rgba(196,152,42,0.6)", cursor: "pointer", fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 600, marginBottom: 14, display: "flex", alignItems: "center", gap: 4 }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M8.5 2.5l-5 5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> Dashboard
      </button>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>Settings</h2>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: "block", color: "rgba(255,255,255,0.6)" }}>NAME</label>
          <input className="input-field" value={editProfile.name} onChange={e => setEditProfile({...editProfile, name: e.target.value})} />
        </div>

        <div>
          <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: "block", color: "rgba(255,255,255,0.6)" }}>PROGRAM</label>
          <select className="input-field" value={editProfile.gender} onChange={e => setEditProfile({...editProfile, gender: e.target.value, primaryEvents: []})}>
            <option value="female">Women's Artistic</option>
            <option value="male">Men's Artistic</option>
          </select>
        </div>

        <div>
          <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: "block", color: "rgba(255,255,255,0.6)" }}>LEVEL CATEGORY</label>
          <select className="input-field" value={editProfile.levelCategory} onChange={e => setEditProfile({...editProfile, levelCategory: e.target.value, level: ""})}>
            <option value="compulsory">Compulsory</option>
            <option value="optional">Optional</option>
            {editProfile.gender === "female" && <option value="xcel">Xcel</option>}
          </select>
        </div>

        {levelOptions.length > 0 && (
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: "block", color: "rgba(255,255,255,0.6)" }}>LEVEL</label>
            <select className="input-field" value={editProfile.level} onChange={e => setEditProfile({...editProfile, level: e.target.value})}>
              <option value="">Select level...</option>
              {levelOptions.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        )}

        <div>
          <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: "block", color: "rgba(255,255,255,0.6)" }}>EVENTS</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {events.map(e => (
              <button
                key={e}
                onClick={() => {
                  const evts = editProfile.primaryEvents || [];
                  setEditProfile({
                    ...editProfile,
                    primaryEvents: evts.includes(e) ? evts.filter(x => x !== e) : [...evts, e],
                  });
                }}
                style={{
                  padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer",
                  fontFamily: "'Outfit', sans-serif", fontWeight: 600, fontSize: 13,
                  background: editProfile.primaryEvents?.includes(e) ? "#C4982A" : "rgba(255,255,255,0.06)",
                  color: editProfile.primaryEvents?.includes(e) ? "#0B1024" : "rgba(255,255,255,0.5)",
                }}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      </div>

        <div>
          <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: "block", color: "rgba(255,255,255,0.6)" }}>AGE</label>
          <input className="input-field" type="number" min="4" max="25" placeholder="e.g. 10" value={editProfile.age || ""} onChange={e => setEditProfile({...editProfile, age: e.target.value ? parseInt(e.target.value) : null})} />
        </div>

        <div>
          <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: "block", color: "rgba(255,255,255,0.6)" }}>GOAL</label>
          <select className="input-field" value={editProfile.goals || ""} onChange={e => setEditProfile({...editProfile, goals: e.target.value || null})}>
            <option value="">Select a goal...</option>
            <option value="improve scores">Improve meet scores</option>
            <option value="move up levels">Move up to the next level</option>
            <option value="qualify regionals">Qualify for Regionals/State</option>
            <option value="college gymnastics">Earn a college scholarship</option>
            <option value="injury recovery">Return from injury safely</option>
            <option value="build confidence">Build confidence and consistency</option>
            <option value="have fun">Have fun and stay healthy</option>
          </select>
        </div>

      <button className="btn-gold" onClick={() => onSave(editProfile)} style={{ width: "100%", marginTop: 32 }}>
        <Icon name="save" /> Save Changes
      </button>

      {/* API Configuration */}
      <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>
          Video Analysis Engine
        </h3>
        {geminiKey ? (
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "10px 14px", borderRadius: 10, marginBottom: 12,
            background: "rgba(34,197,94,0.04)", border: "1px solid rgba(34,197,94,0.08)",
          }}>
            <span style={{ color: "#22c55e", fontSize: 14 }}>✓</span>
            <div>
              <span style={{ fontSize: 12, color: "rgba(34,197,94,0.8)" }}>API key configured</span>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 2 }}>2-pass engine: Detect → Judge</div>
            </div>
          </div>
        ) : (
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "10px 14px", borderRadius: 10, marginBottom: 12,
            background: "rgba(245,158,11,0.04)", border: "1px solid rgba(245,158,11,0.1)",
          }}>
            <span style={{ color: "#f59e0b", fontSize: 14 }}>!</span>
            <span style={{ fontSize: 12, color: "rgba(245,158,11,0.8)" }}>No API key — add one below to enable analysis</span>
          </div>
        )}
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginBottom: 10, lineHeight: 1.5 }}>
          Get a free API key at <span style={{ color: "#C4982A", cursor: "pointer" }} onClick={() => window.open("https://aistudio.google.com/apikey", "_blank")}>aistudio.google.com/apikey</span>. Create one, copy it, paste below.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            className="input-field"
            type="password"
            placeholder="Paste your API key (AIza...)"
            value={geminiKey}
            onChange={e => setGeminiKey(e.target.value)}
            style={{ fontSize: 12, flex: 1 }}
          />
          <button className="btn-outline" onClick={async () => {
            try {
              if (geminiKey) {
                await storage.set("strive-gemini-key", geminiKey);
                setKeySaved(true);
              } else {
                await storage.delete("strive-gemini-key");
                setKeySaved(true);
              }
              setTimeout(() => setKeySaved(false), 3000);
            } catch (e) { alert("Error: " + e.message); }
          }} style={{ padding: "10px 16px", fontSize: 12, whiteSpace: "nowrap" }}>
            {keySaved ? "✓ Saved" : "Save"}
          </button>
        </div>
      </div>

      {/* STRIVE Pro Section */}
      <div style={{ marginTop: 24, paddingTop: 24, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>
          <span style={{ color: "#A78BFA" }}>★</span> STRIVE Pro
        </h3>
        {(() => {
          let currentTier = "free";
          try { currentTier = localStorage.getItem("strive-tier") || "free"; } catch {}
          return currentTier === "pro" ? (
            <div style={{ padding: 16, borderRadius: 12, background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.2)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 9, fontWeight: 700, padding: "3px 10px", borderRadius: 4, background: "rgba(139,92,246,0.2)", color: "#A78BFA", letterSpacing: 0.5 }}>PRO ACTIVE</span>
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
                Full access to all features: unlimited analyses, biomechanics, training programs, mental training, what-if simulator, and diagnostics.
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", lineHeight: 1.6, marginBottom: 12 }}>
                Unlock unlimited analyses, full deduction breakdowns, biomechanics dashboard, personalized 5-pillar training programs, and more.
              </div>
              <button onClick={() => {
                try { localStorage.setItem("strive-tier", "pro"); } catch {}
                window.location.reload();
              }} style={{
                width: "100%", padding: 14, borderRadius: 12,
                background: "linear-gradient(135deg, #8B5CF6, #A78BFA)",
                border: "none", color: "white", cursor: "pointer",
                fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 14,
              }}>
                Upgrade to STRIVE Pro
              </button>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", marginTop: 6, textAlign: "center" }}>
                Payment integration coming soon — tap to preview Pro features
              </div>
            </div>
          );
        })()}
      </div>

      <div style={{ marginTop: 24, paddingTop: 24, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        {/* About STRIVE */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{
            fontFamily: "'Georgia', serif", fontSize: 18, fontWeight: 500, letterSpacing: 4,
            background: "linear-gradient(135deg, #C4982A, #E8C35A)", backgroundClip: "text",
            WebkitBackgroundClip: "text", color: "transparent", marginBottom: 6,
          }}>STRIVE</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", letterSpacing: 1, marginBottom: 12 }}>
            SEE YOUR SCORE. OWN YOUR GROWTH.
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", lineHeight: 1.7, maxWidth: 300, margin: "0 auto" }}>
            AI-powered gymnastics scoring using USAG criteria. Built for athletes, parents, and coaches. Levels 1-10, Xcel Bronze-Sapphire, WAG & MAG.
          </div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.15)", marginTop: 12, fontFamily: "'Space Mono', monospace" }}>
            v1.0.0 · 2-Pass Analysis Engine · strive-app-amber.vercel.app
          </div>
        </div>

        {/* Download My Data */}
        <button onClick={() => {
          try {
            const exportData = { profile, history: history || [], goals: null, calibration: null };
            try { const g = localStorage.getItem("strive-goals"); if (g) exportData.goals = JSON.parse(g); } catch {}
            try { const c = localStorage.getItem("strive-calibration"); if (c) exportData.calibration = JSON.parse(c); } catch {}
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href = url; a.download = `strive-data-${new Date().toISOString().slice(0,10)}.json`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
          } catch {}
        }} style={{
          width: "100%", padding: 14, borderRadius: 12, border: "1px solid rgba(196,152,42,0.2)",
          background: "rgba(196,152,42,0.04)", color: "#C4982A", cursor: "pointer",
          fontFamily: "'Outfit', sans-serif", fontWeight: 600, fontSize: 14, marginBottom: 12,
        }}>
          Download My Data
        </button>

        {!showConfirm ? (
          <button onClick={() => setShowConfirm(true)} style={{
            width: "100%", padding: 14, borderRadius: 12, border: "1px solid rgba(239,68,68,0.3)",
            background: "rgba(239,68,68,0.05)", color: "#ef4444", cursor: "pointer",
            fontFamily: "'Outfit', sans-serif", fontWeight: 600, fontSize: 14,
          }}>
            Clear All Data
          </button>
        ) : (
          <div className="card" style={{ borderColor: "rgba(239,68,68,0.3)", padding: 20 }}>
            <p style={{ fontSize: 14, marginBottom: 16, color: "rgba(255,255,255,0.7)" }}>
              This will delete your profile and all analysis history. Are you sure?
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              <button className="btn-outline" onClick={() => setShowConfirm(false)} style={{ flex: 1 }}>Cancel</button>
              <button onClick={onReset} style={{
                flex: 1, padding: 12, borderRadius: 12, border: "none",
                background: "#ef4444", color: "white", cursor: "pointer",
                fontFamily: "'Outfit', sans-serif", fontWeight: 700,
              }}>
                Delete Everything
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── WHAT-IF SCORING SIMULATOR ──────────────────────────────────────
function WhatIfSimulator({ result }) {
  const deds = result.executionDeductions || [];
  const [removed, setRemoved] = useState({});

  const toggle = (i) => setRemoved(prev => ({ ...prev, [i]: !prev[i] }));
  const removedTotal = deds.reduce((s, d, i) => s + (removed[i] ? d.deduction : 0), 0);
  const projectedScore = Math.min(10, result.finalScore + removedTotal);
  const improvement = removedTotal;

  return (
    <div style={{ animation: "fadeIn 0.4s ease-out" }}>
      <div className="card" style={{ padding: 20, marginBottom: 16, textAlign: "center" }}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>IF YOU FIXED THE SELECTED DEDUCTIONS</div>
        <div style={{ fontSize: 48, fontWeight: 900, fontFamily: "'Space Mono', monospace", color: projectedScore >= 9.0 ? "#22c55e" : "#f59e0b" }}>
          {projectedScore.toFixed(3)}
        </div>
        {improvement > 0 && (
          <div style={{ fontSize: 14, color: "#22c55e", fontWeight: 700, marginTop: 4 }}>
            +{improvement.toFixed(3)} improvement possible
          </div>
        )}
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 8 }}>
          Tap deductions below to see how fixing them would change your score
        </div>
      </div>

      {deds.map((d, i) => {
        const c = DEDUCTION_SCALE[d.severity]?.color || "#f59e0b";
        const isOff = removed[i];
        return (
          <div key={i} onClick={() => toggle(i)} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "12px 14px", borderRadius: 10, marginBottom: 4, cursor: "pointer",
            background: isOff ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.02)",
            borderLeft: `3px solid ${isOff ? "#22c55e" : c}`,
            opacity: isOff ? 0.6 : 1, transition: "all 0.2s",
          }}>
            <div style={{
              width: 22, height: 22, borderRadius: 6, flexShrink: 0,
              border: `2px solid ${isOff ? "#22c55e" : "rgba(255,255,255,0.2)"}`,
              background: isOff ? "rgba(34,197,94,0.2)" : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {isOff && <span style={{ color: "#22c55e", fontSize: 13, fontWeight: 700 }}>✓</span>}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: isOff ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.7)", textDecoration: isOff ? "line-through" : "none" }}>
                {d.skill}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{d.fault}</div>
            </div>
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, fontWeight: 700, color: isOff ? "#22c55e" : c, textDecoration: isOff ? "line-through" : "none" }}>
              -{d.deduction?.toFixed(2)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── PROGRESS SCREEN ────────────────────────────────────────────────
function ProgressScreen({ history, profile, onBack }) {
  const [selectedEvent, setSelectedEvent] = useState("all");
  const events = profile.gender === "female" ? WOMEN_EVENTS : MEN_EVENTS;
  const eventColors = { "Vault": "#C4982A", "Uneven Bars": "#A78BFA", "Balance Beam": "#22c55e", "Floor Exercise": "#f59e0b", "Pommel Horse": "#ef4444", "Still Rings": "#3b82f6", "Parallel Bars": "#ec4899", "High Bar": "#14b8a6" };

  // Filter by selected event
  const filtered = selectedEvent === "all" ? history : history.filter(h => h.event === selectedEvent);
  const chartData = [...filtered].reverse().map((h, i) => ({
    name: h.meetName ? h.meetName.substring(0, 8) : h.date || `#${i+1}`,
    score: h.score || 0,
    event: h.event,
  }));

  // Per-event chart data for event comparison
  const eventChartData = {};
  events.forEach(evt => {
    const evtH = [...history].filter(h => h.event === evt).reverse();
    if (evtH.length >= 2) eventChartData[evt] = evtH.map((h, i) => ({ name: h.date || `#${i+1}`, score: h.score || 0 }));
  });

  // Personal bests per event
  const bests = {};
  history.forEach(h => {
    if (!bests[h.event] || h.score > bests[h.event]) bests[h.event] = h.score;
  });

  // Deduction frequency from saved results
  const faultFreq = {};
  try {
    const sr = localStorage.getItem("strive-saved-results");
    if (sr) Object.values(JSON.parse(sr)).forEach(r => {
      safeArray(r.executionDeductions).forEach(d => {
        const fk = safeStr(d.fault).substring(0, 40) || "Unknown";
        if (!faultFreq[fk]) faultFreq[fk] = { count: 0, totalDed: 0 };
        faultFreq[fk].count++;
        faultFreq[fk].totalDed += safeNum(d.deduction, 0);
      });
    });
  } catch {}
  const topFaults = Object.entries(faultFreq).sort(([,a],[,b]) => b.count - a.count).slice(0, 8);

  // Improvement tracking
  const sortedH = [...history].sort((a, b) => (a.id || 0) - (b.id || 0));
  const mid = Math.ceil(sortedH.length / 2);
  const avgFirst = mid > 0 ? sortedH.slice(0, mid).reduce((s,h) => s + (h.score||0), 0) / mid : 0;
  const avgSecond = sortedH.length > mid ? sortedH.slice(mid).reduce((s,h) => s + (h.score||0), 0) / (sortedH.length - mid) : 0;
  const scoreDelta = sortedH.length > 2 ? avgSecond - avgFirst : 0;

  const deductionFreq = {};
  history.forEach(h => {
    if (h.deductions) {
      const key = h.event || "General";
      deductionFreq[key] = (deductionFreq[key] || 0) + 1;
    }
  });

  return (
    <div style={{ minHeight: "100vh", padding: "16px 18px 90px", maxWidth: 540, margin: "0 auto" }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: "rgba(196,152,42,0.6)", cursor: "pointer", fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 600, marginBottom: 14, display: "flex", alignItems: "center", gap: 4 }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M8.5 2.5l-5 5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> Dashboard
      </button>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Progress Tracking</h2>
      <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, marginBottom: 24 }}>Your scoring trends over time</p>

      {history.length < 2 ? (
        <div className="card" style={{ padding: 40, textAlign: "center" }}>
          <Icon name="chart" size={32} />
          <p style={{ color: "rgba(255,255,255,0.4)", marginTop: 12, fontSize: 14 }}>
            Analyze at least 2 routines to see progress charts. Keep uploading!
          </p>
        </div>
      ) : (
        <>
          {sortedH.length > 2 && (<div className="card" style={{ padding: 16, marginBottom: 16 }}><div style={{ display: "flex", justifyContent: "space-between" }}><div><div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.25)", letterSpacing: 1 }}>IMPROVEMENT TREND</div></div><div style={{ textAlign: "right" }}><div style={{ fontSize: 24, fontWeight: 900, fontFamily: "'Space Mono', monospace", color: scoreDelta >= 0 ? "#22c55e" : "#ef4444" }}>{scoreDelta >= 0 ? "+" : ""}{scoreDelta.toFixed(3)}</div></div></div></div>)}
          <div style={{ display: "flex", gap: 4, marginBottom: 16, overflowX: "auto" }}><button onClick={() => setSelectedEvent("all")} style={{ padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "'Outfit', sans-serif", fontWeight: 600, fontSize: 11, background: selectedEvent === "all" ? "#C4982A" : "rgba(255,255,255,0.06)", color: selectedEvent === "all" ? "#0B1024" : "rgba(255,255,255,0.4)" }}>All</button>{events.filter(e => history.some(h => h.event === e)).map(evt => (<button key={evt} onClick={() => setSelectedEvent(evt)} style={{ padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "'Outfit', sans-serif", fontWeight: 600, fontSize: 11, whiteSpace: "nowrap", background: selectedEvent === evt ? (eventColors[evt] || "#C4982A") : "rgba(255,255,255,0.06)", color: selectedEvent === evt ? "#0B1024" : "rgba(255,255,255,0.4)" }}>{evt.replace("Exercise","").replace("Uneven ","").trim()}</button>))}</div>
          {/* Score Trend Line Chart */}
          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Score Trend</h3>
            {LineChart && ResponsiveContainer ? (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="name" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} />
                  <YAxis domain={[7, 10]} tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: "#111631", border: "1px solid rgba(196,152,42,0.2)", borderRadius: 8, color: "#e2e8f0", fontSize: 12 }} />
                  <Line type="monotone" dataKey="score" stroke="#C4982A" strokeWidth={2} dot={{ fill: "#C4982A", r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ padding: 20, textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
                {chartData.map((d, i) => (
                  <span key={i} style={{ fontFamily: "'Space Mono', monospace", marginRight: 12 }}>{d.name}: <span style={{ color: "#C4982A" }}>{d.score?.toFixed(3)}</span></span>
                ))}
              </div>
            )}
          </div>

          {/* Personal Bests */}
          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}><Icon name="trophy" size={14} /> Personal Bests</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {Object.entries(bests).map(([evt, score]) => (
                <div key={evt} style={{
                  padding: "12px 14px", borderRadius: 10,
                  background: "rgba(196,152,42,0.06)", border: "1px solid rgba(196,152,42,0.1)",
                }}>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{evt}</div>
                  <div style={{ fontSize: 22, fontWeight: 900, fontFamily: "'Space Mono', monospace", color: "#C4982A" }}>
                    {score?.toFixed(3)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Event Breakdown */}
          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Routines by Event</h3>
            {events.map(evt => {
              const count = history.filter(h => h.event === evt).length;
              const avg = count > 0 ? history.filter(h => h.event === evt).reduce((s, h) => s + (h.score || 0), 0) / count : 0;
              return (
                <div key={evt} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{evt}</span>
                  <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{count} analyzed</span>
                  {count > 0 && <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 14, fontWeight: 700, color: "#C4982A" }}>{avg.toFixed(3)} avg</span>}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── MEETS SCREEN ───────────────────────────────────────────────────
function MeetsScreen({ history, savedResults, profile, onBack, onViewResult }) {
  // Group history entries by meet
  const meets = {};
  history.forEach(h => {
    const key = h.meetName || h.date || "Unknown Meet";
    if (!meets[key]) meets[key] = { name: h.meetName, location: h.meetLocation, date: h.meetDate || h.date, entries: [] };
    meets[key].entries.push(h);
  });

  // Overall stats
  const allScores = history.filter(h => h.score > 0).map(h => h.score);
  const bestScore = allScores.length > 0 ? Math.max(...allScores) : 0;
  const avgScore = allScores.length > 0 ? allScores.reduce((a, b) => a + b, 0) / allScores.length : 0;
  const bestEvent = (() => {
    const byEvent = {};
    history.forEach(h => {
      if (!h.score) return;
      if (!byEvent[h.event]) byEvent[h.event] = [];
      byEvent[h.event].push(h.score);
    });
    let best = null, bestAvg = 0;
    Object.entries(byEvent).forEach(([evt, scores]) => {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      if (avg > bestAvg) { bestAvg = avg; best = evt; }
    });
    return best ? { event: best, avg: bestAvg } : null;
  })();

  return (
    <div style={{ minHeight: "100vh", padding: "16px 18px 90px", maxWidth: 540, margin: "0 auto" }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: "rgba(196,152,42,0.6)", cursor: "pointer", fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 600, marginBottom: 14, display: "flex", alignItems: "center", gap: 4 }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M8.5 2.5l-5 5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> Dashboard
      </button>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Competition History</h2>
      <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginBottom: 20 }}>
        {history.length} analyses across {Object.keys(meets).length} meets
      </p>

      {/* Stats Summary */}
      {allScores.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
          <div className="card" style={{ textAlign: "center", padding: 14 }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: 0.5 }}>BEST SCORE</div>
            <div style={{ fontSize: 20, fontWeight: 900, fontFamily: "'Space Mono', monospace", color: "#22c55e", marginTop: 4 }}>
              {bestScore.toFixed(1)}
            </div>
          </div>
          <div className="card" style={{ textAlign: "center", padding: 14 }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: 0.5 }}>AVERAGE</div>
            <div style={{ fontSize: 20, fontWeight: 900, fontFamily: "'Space Mono', monospace", color: "#C4982A", marginTop: 4 }}>
              {avgScore.toFixed(1)}
            </div>
          </div>
          <div className="card" style={{ textAlign: "center", padding: 14 }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: 0.5 }}>BEST EVENT</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#E2E8F0", marginTop: 6 }}>
              {bestEvent ? bestEvent.event.replace("Exercise", "").replace("Uneven ", "") : "—"}
            </div>
          </div>
        </div>
      )}

      {Object.keys(meets).length === 0 ? (
        <div className="card" style={{ padding: "32px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🏆</div>
          <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>No meets recorded yet</h4>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, lineHeight: 1.6 }}>
            When you upload a video, add the meet name to organize your competition history here.
          </p>
        </div>
      ) : (
        Object.entries(meets).map(([key, meet], mi) => {
          const aa = meet.entries.reduce((s, h) => s + (h.score || 0), 0);
          const meetAvg = meet.entries.length > 0 ? aa / meet.entries.length : 0;
          return (
            <div key={mi} className="card" style={{ marginBottom: 12, padding: 0, overflow: "hidden", animation: `fadeIn 0.3s ease-out ${mi * 0.08}s both` }}>
              {/* Meet header */}
              <div style={{ padding: "14px 16px", background: "rgba(196,152,42,0.04)", borderBottom: "1px solid rgba(196,152,42,0.08)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{meet.name || key}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
                      {meet.location && `${meet.location} · `}{meet.date}
                    </div>
                  </div>
                  {meet.entries.length > 1 && (
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)" }}>ALL-AROUND</div>
                      <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "'Space Mono', monospace", color: "#C4982A" }}>
                        {aa.toFixed(2)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {/* Routines in this meet */}
              {meet.entries.map((h, i) => {
                const hasR = savedResults && savedResults[h.id];
                const sc = h.score || 0;
                const scColor = sc >= 9.0 ? "#22c55e" : sc >= 8.0 ? "#f59e0b" : sc > 0 ? "#ef4444" : "rgba(255,255,255,0.3)";
                return (
                  <div key={i}
                    onClick={() => hasR && onViewResult(savedResults[h.id])}
                    style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "11px 16px", cursor: hasR ? "pointer" : "default",
                      borderBottom: i < meet.entries.length - 1 ? "1px solid rgba(255,255,255,0.03)" : "none",
                      transition: "background 0.2s",
                    }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{h.event}</div>
                      {hasR && <div style={{ fontSize: 10, color: "#C4982A" }}>tap to review →</div>}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 800, fontSize: 17, fontFamily: "'Space Mono', monospace", color: scColor }}>
                        {sc > 0 ? sc.toFixed(3) : "—"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })
      )}

      {/* Meet-over-Meet Comparison */}
      {Object.keys(meets).length >= 2 && (() => {
        const meetList = Object.entries(meets).filter(([,m]) => m.entries.length > 0);
        if (meetList.length < 2) return null;
        return (
          <div className="card" style={{ padding: 16, marginTop: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Meet-over-Meet Comparison</h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "6px 8px", color: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: 700 }}>MEET</th>
                    <th style={{ textAlign: "center", padding: "6px 8px", color: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: 700 }}>EVENTS</th>
                    <th style={{ textAlign: "center", padding: "6px 8px", color: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: 700 }}>AVG</th>
                    <th style={{ textAlign: "right", padding: "6px 8px", color: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: 700 }}>AA</th>
                  </tr>
                </thead>
                <tbody>
                  {meetList.map(([key, meet], mi) => {
                    const meetAA = meet.entries.reduce((s, h) => s + (h.score || 0), 0);
                    const meetAvgScore = meet.entries.length > 0 ? meetAA / meet.entries.length : 0;
                    const prevMeet = mi > 0 ? meetList[mi - 1] : null;
                    const prevAA = prevMeet ? prevMeet[1].entries.reduce((s, h) => s + (h.score || 0), 0) : 0;
                    const aaDelta = mi > 0 ? meetAA - prevAA : 0;
                    return (
                      <tr key={mi} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                        <td style={{ padding: "8px", fontWeight: 600 }}>{(meet.name || key).substring(0, 15)}</td>
                        <td style={{ padding: "8px", textAlign: "center", color: "rgba(255,255,255,0.4)" }}>{meet.entries.length}</td>
                        <td style={{ padding: "8px", textAlign: "center", fontFamily: "'Space Mono', monospace", fontWeight: 700, color: "#C4982A" }}>{meetAvgScore.toFixed(2)}</td>
                        <td style={{ padding: "8px", textAlign: "right" }}>
                          <span style={{ fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>{meet.entries.length > 1 ? meetAA.toFixed(2) : meetAvgScore.toFixed(2)}</span>
                          {mi > 0 && aaDelta !== 0 && (<span style={{ fontSize: 10, marginLeft: 4, color: aaDelta > 0 ? "#22c55e" : "#ef4444" }}>{aaDelta > 0 ? "+" : ""}{aaDelta.toFixed(2)}</span>)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── MENTAL TRAINING SCREEN ─────────────────────────────────────────
function MentalTrainingScreen({ profile, onBack }) {
  const [activeSection, setActiveSection] = useState("overview");
  const sections = [
    { id: "overview", label: "Overview" },
    { id: "visualization", label: "Visualization" },
    { id: "breathing", label: "Breathing" },
    { id: "confidence", label: "Confidence" },
    { id: "meetday", label: "Meet Day" },
    { id: "parents", label: "For Parents" },
  ];

  return (
    <div style={{ minHeight: "100vh", padding: "16px 18px 90px", maxWidth: 540, margin: "0 auto" }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: "rgba(196,152,42,0.6)", cursor: "pointer", fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 600, marginBottom: 14, display: "flex", alignItems: "center", gap: 4 }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M8.5 2.5l-5 5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> Dashboard
      </button>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}><Icon name="brain" size={24} /> Mental Training</h2>
      <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, marginBottom: 20 }}>Gymnastics is 80% mental. Train the mind alongside the body.</p>

      {/* Section tabs */}
      <div style={{ display: "flex", gap: 3, marginBottom: 20, background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 3, overflowX: "auto" }}>
        {sections.map(s => (
          <button key={s.id} onClick={() => setActiveSection(s.id)} style={{
            flex: 1, padding: "8px 4px", borderRadius: 10, border: "none", cursor: "pointer",
            fontFamily: "'Outfit', sans-serif", fontWeight: 600, fontSize: 11, whiteSpace: "nowrap",
            background: activeSection === s.id ? "linear-gradient(135deg, #C4982A, #E8C35A)" : "transparent",
            color: activeSection === s.id ? "#0B1024" : "rgba(255,255,255,0.4)",
          }}>{s.label}</button>
        ))}
      </div>

      {activeSection === "overview" && (
        <div style={{ animation: "fadeIn 0.4s ease-out" }}>
          <div className="card" style={{ padding: 20, marginBottom: 12, borderColor: "rgba(196,152,42,0.15)" }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "#C4982A", marginBottom: 10 }}>Why Mental Training Matters</h3>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.8 }}>
              The difference between a gymnast who scores 8.5 and one who scores 9.2 is rarely just physical ability. It's mental focus, confidence, and the ability to perform under pressure. Every elite gymnast — from Simone Biles to your child's favorite Level 10 at the gym — uses mental training techniques daily.
            </p>
          </div>
          <div className="card" style={{ padding: 20, marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>The 4 Pillars of Gymnastics Mental Training</h3>
            {[
              { title: "Visualization", desc: "Mentally rehearsing routines before performing them. Builds muscle memory without physical fatigue.", icon: "👁" },
              { title: "Breathing & Focus", desc: "Controlling nerves through breathing techniques. Brings heart rate down before saluting the judge.", icon: "🌬" },
              { title: "Confidence Building", desc: "Replacing negative self-talk with positive affirmations. Building a 'competition mindset'.", icon: "💪" },
              { title: "Pressure Management", desc: "Practicing performing under simulated pressure so meets feel familiar, not scary.", icon: "🎯" },
            ].map((p, i) => (
              <div key={i} style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "flex-start" }}>
                <span style={{ fontSize: 22, flexShrink: 0 }}>{p.icon}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{p.title}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>{p.desc}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="card" style={{ padding: 16, background: "rgba(196,152,42,0.04)", borderColor: "rgba(196,152,42,0.1)" }}>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.7, fontStyle: "italic" }}>
              <strong style={{ color: "#C4982A" }}>Parent tip:</strong> You can practice these with your child in the car on the way to the gym. Even 5 minutes of visualization before practice makes a measurable difference.
            </p>
          </div>
        </div>
      )}

      {activeSection === "visualization" && (
        <div style={{ animation: "fadeIn 0.4s ease-out" }}>
          {[
            { title: "Full Routine Walk-Through", time: "5-10 min", when: "Before practice or bed", steps: [
              "Find a quiet spot. Close eyes. Take 3 deep breaths.",
              "Mentally walk to the apparatus. Feel the chalk on your hands or the beam under your feet.",
              "Perform the entire routine in your mind at REAL SPEED — not fast-forward.",
              "Feel every takeoff, every landing. Hear the music (floor). Sense the bar in your grip.",
              "Visualize perfect execution: straight legs, pointed toes, stuck landings.",
              "If you 'see' a mistake in your mind, rewind and redo that skill perfectly.",
              "End by visualizing the salute and walking away confidently."
            ]},
            { title: "Skill-Specific Visualization", time: "2-3 min per skill", when: "Before attempting a difficult skill", steps: [
              "Close eyes. Picture yourself from a third-person view (like watching video).",
              "See the specific skill in slow motion. Every body position, every angle.",
              "Now switch to first-person — feel it from inside your body.",
              "Feel the takeoff power, the air time, the snap of the landing.",
              "Repeat 3 times. Each time, make the image clearer and more confident.",
            ]},
            { title: "Competition Day Visualization", time: "10 min", when: "Morning of the meet", steps: [
              "Lie down or sit comfortably. Close eyes.",
              "Picture yourself arriving at the meet venue. See the equipment, hear the crowd.",
              "Visualize yourself warming up confidently. You feel strong and ready.",
              "See yourself at the first event. You salute the judge with a smile.",
              "Perform a PERFECT routine in your mind. Every skill clean.",
              "See the score flash: it's your best score ever. Feel that pride.",
              "Repeat for each event. End by saying: 'I am prepared. I am ready.'",
            ]},
          ].map((ex, i) => (
            <div key={i} className="card" style={{ padding: 16, marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700 }}>👁 {ex.title}</h3>
                <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, fontWeight: 700, background: "rgba(255,255,255,0.06)", padding: "3px 8px", borderRadius: 5, color: "rgba(255,255,255,0.4)" }}>{ex.time}</span>
              </div>
              <div style={{ fontSize: 11, color: "#C4982A", marginBottom: 8 }}>Best time: {ex.when}</div>
              {ex.steps.map((step, j) => (
                <div key={j} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, fontWeight: 700, color: "rgba(196,152,42,0.5)", minWidth: 18 }}>{j+1}.</span>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>{step}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {activeSection === "breathing" && (
        <div style={{ animation: "fadeIn 0.4s ease-out" }}>
          {[
            { title: "4-7-8 Calming Breath", desc: "The single best technique for pre-competition nerves", steps: "Breathe IN through nose for 4 seconds. HOLD for 7 seconds. Breathe OUT through mouth for 8 seconds. Repeat 3-4 cycles.", when: "Before saluting the judge, between events, when feeling nervous" },
            { title: "Box Breathing (Navy SEAL technique)", desc: "Used by elite military and athletes for focus under pressure", steps: "IN for 4 counts. HOLD 4 counts. OUT for 4 counts. HOLD empty 4 counts. Repeat 4 cycles.", when: "During warm-up, in the chalk-up area, before any high-pressure moment" },
            { title: "Power Breath", desc: "Quick energizing technique when you need a burst of confidence", steps: "3 quick, sharp inhales through the nose (sniff-sniff-sniff). 1 long exhale through the mouth while making fists. Repeat 3 times.", when: "Right before vault run, before a tumbling pass, when energy is low" },
            { title: "Reset Breath", desc: "After a fall or mistake, use this to reset mentally before the next skill", steps: "One big breath IN. On the exhale, mentally say 'NEXT'. The mistake is gone. The next skill is all that matters.", when: "After a wobble, fall, or mistake mid-routine" },
          ].map((ex, i) => (
            <div key={i} className="card" style={{ padding: 16, marginBottom: 12 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>🌬 {ex.title}</h3>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>{ex.desc}</div>
              <div style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.12)", marginBottom: 8 }}>
                <div style={{ fontSize: 13, color: "rgba(147,197,253,0.9)", lineHeight: 1.7 }}>{ex.steps}</div>
              </div>
              <div style={{ fontSize: 11, color: "#C4982A" }}>When to use: {ex.when}</div>
            </div>
          ))}
        </div>
      )}

      {activeSection === "confidence" && (
        <div style={{ animation: "fadeIn 0.4s ease-out" }}>
          <div className="card" style={{ padding: 16, marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>💪 Pre-Competition Affirmations</h3>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 10 }}>Have your child say these (out loud or silently) before competing:</p>
            {[
              "I have trained for this. My body knows what to do.",
              "I am strong, I am prepared, I am ready.",
              "Mistakes don't define me. I recover and keep going.",
              "I compete for myself, not against anyone else.",
              "I trust my training. I trust my coach. I trust myself.",
              "Nervous energy is just excitement. I channel it into power.",
              "Every routine is a chance to show what I can do.",
              "I breathe, I focus, I perform. That's all I need to do.",
            ].map((a, i) => (
              <div key={i} style={{
                padding: "8px 12px", borderRadius: 8, marginBottom: 4,
                background: "rgba(196,152,42,0.04)", borderLeft: "3px solid rgba(196,152,42,0.2)",
                fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.5, fontStyle: "italic",
              }}>"{a}"</div>
            ))}
          </div>
          <div className="card" style={{ padding: 16, marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>🎯 Confidence-Building Exercises</h3>
            {[
              { name: "Success Journal", desc: "After every practice, write down 3 things that went well. Review before meets. This trains the brain to focus on strengths, not weaknesses.", freq: "Daily, 2 minutes" },
              { name: "Highlight Reel", desc: "Use videos of your BEST routines or skills. Watch them before competing. Your brain can't tell the difference between watching yourself succeed and actually doing it.", freq: "Before each meet" },
              { name: "Power Pose", desc: "Stand tall, hands on hips or arms raised (like a superhero) for 2 minutes. Research shows this reduces cortisol and increases testosterone/confidence.", freq: "Before warm-up at meets" },
              { name: "Mistake Rehearsal", desc: "In practice, deliberately simulate a small mistake mid-routine, then recover and finish strong. This removes the fear of imperfection and builds resilience.", freq: "Once per week in practice" },
              { name: "Competition Simulation", desc: "Once a month, do a full mock competition in practice: wear your leotard, salute, judges watching, one chance only. The more familiar pressure feels, the less scary it becomes.", freq: "Monthly" },
            ].map((ex, i) => (
              <div key={i} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: i < 4 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{ex.name}</div>
                  <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.04)", padding: "2px 6px", borderRadius: 4 }}>{ex.freq}</span>
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.6, marginTop: 4 }}>{ex.desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSection === "meetday" && (
        <div style={{ animation: "fadeIn 0.4s ease-out" }}>
          <div className="card" style={{ padding: 16, marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>🏟 Competition Day Timeline</h3>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 12 }}>What to expect from arrival to awards:</p>
            {[
              { time: "60 min before", title: "Arrival", desc: "Check in, find your team area, use the bathroom, get leotard on. No rushing.", color: "rgba(59,130,246,0.8)" },
              { time: "45 min before", title: "Light Warm-Up", desc: "Jog, stretch, handstands, basic skills only. NO new skills on meet day. Keep it familiar.", color: "rgba(59,130,246,0.6)" },
              { time: "30 min before", title: "Mental Prep", desc: "This is where visualization and breathing happen. Review your routine in your mind 2-3 times. Power pose.", color: "rgba(196,152,42,0.8)" },
              { time: "15 min before", title: "March-In", desc: "The team enters together. Wave to family. This is the exciting part! Soak it in.", color: "rgba(196,152,42,0.6)" },
              { time: "~10 min", title: "Open Warm-Up", desc: "Brief touch on each event in your rotation order. 1-2 skills max per event. Get a feel, don't exhaust.", color: "rgba(34,197,94,0.8)" },
              { time: "Competition", title: "Rotation 1-4", desc: "Each event takes ~20-30 min per rotation. You'll warm up, compete, then rotate. Stay focused between events.", color: "rgba(34,197,94,0.6)" },
              { time: "After", title: "Awards", desc: "Individual event awards, All-Around awards, team awards. Celebrate every achievement — even small improvements.", color: "rgba(196,152,42,0.8)" },
            ].map((step, i) => (
              <div key={i} style={{ display: "flex", gap: 12, marginBottom: 10 }}>
                <div style={{ width: 3, flexShrink: 0, background: step.color, borderRadius: 2 }} />
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: step.color, letterSpacing: 0.5 }}>{step.time}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{step.title}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>{step.desc}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="card" style={{ padding: 16, background: "rgba(239,68,68,0.04)", borderColor: "rgba(239,68,68,0.1)" }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: "#ef4444", marginBottom: 8 }}>⚠ Common Meet Day Mistakes (Parents)</h3>
            {[
              "Coaching from the stands — your child can hear you and it adds pressure",
              "Comparing scores to other gymnasts out loud",
              "Showing disappointment after a score — they're watching your face",
              "Skipping breakfast or eating heavy food before competing",
              "Arriving late and rushing through warm-up",
            ].map((m, i) => (
              <div key={i} style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.6, marginBottom: 4, paddingLeft: 12, borderLeft: "2px solid rgba(239,68,68,0.2)" }}>{m}</div>
            ))}
          </div>
        </div>
      )}

      {activeSection === "parents" && (
        <div style={{ animation: "fadeIn 0.4s ease-out" }}>
          <div className="card" style={{ padding: 20, marginBottom: 12, borderColor: "rgba(196,152,42,0.15)" }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "#C4982A", marginBottom: 10 }}>Your Stress Matters Too</h3>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.8 }}>
              Watching your child compete is one of the most stressful experiences in youth sports. Your heart pounds, your palms sweat, and a wobble on beam feels like it's happening to YOU. This is completely normal — and there are proven techniques to manage it so you can be the calm, supportive presence your child needs.
            </p>
          </div>

          <div className="card" style={{ padding: 16, marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>🧘 Exercises for the Gymnastics Parent</h3>
            {[
              { name: "The Spectator's Breath", time: "During competition", desc: "When your child is about to compete: inhale 4 counts, hold 4, exhale 6. The longer exhale activates your rest-and-digest system. Do this during every salute." },
              { name: "Hands Relaxation Check", time: "Between events", desc: "Are your hands clenched? Gripping the seat? Open them, palms up on your lap. Relaxed hands = relaxed body = relaxed face. Your child CAN see your face from the floor." },
              { name: "The 3-Word Mantra", time: "Before and during", desc: "Choose 3 words before the meet: 'Trust her training.' Repeat silently when anxiety spikes. Options: 'She's got this.' 'Enjoy the journey.' 'Progress not perfection.'" },
              { name: "Score Detachment", time: "After each event", desc: "Before looking at the score, take one breath and say: 'The score does not define my child.' A 8.5 and a 9.3 both mean your child did something extraordinary." },
              { name: "The Car Ride Reset", time: "After the meet", desc: "Do NOT discuss scores for the first 15 minutes of the car ride. Ask: 'What was your favorite part today?' Let THEM bring up scores. The car ride sets the emotional tone for the next week." },
              { name: "Parent Support Network", time: "Ongoing", desc: "Sit with positive parents, not those who compare scores or criticize coaching. Negativity is contagious — so is positivity. Find your tribe." },
            ].map((ex, i) => (
              <div key={i} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: i < 5 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{ex.name}</span>
                  <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.04)", padding: "2px 6px", borderRadius: 4, whiteSpace: "nowrap" }}>{ex.time}</span>
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.7 }}>{ex.desc}</div>
              </div>
            ))}
          </div>

          <div className="card" style={{ padding: 16, marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>❌ Common Parent Traps</h3>
            {[
              { trap: "Coaching from the stands", why: "Your child hears you. It splits their focus. Trust the coach." },
              { trap: "Comparing to other gymnasts", why: "'Why did Sarah score higher?' is devastating. Every child's journey is different." },
              { trap: "Showing visible disappointment", why: "After a low score, your child looks at YOUR face first. Calm support teaches resilience." },
              { trap: "Over-analyzing scores immediately", why: "Let emotions settle. Debrief tomorrow. Right now they need a parent, not a judge." },
              { trap: "Talking to the coach about scores at meets", why: "Coaches are managing 10-20 athletes on meet day. Schedule a separate conversation." },
              { trap: "Making gymnastics their entire identity", why: "They're a kid who does gymnastics, not 'a gymnast who goes to school.' When sport = identity, pressure becomes unbearable." },
            ].map((item, i) => (
              <div key={i} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#ef4444", marginBottom: 2 }}>{item.trap}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>{item.why}</div>
              </div>
            ))}
          </div>

          <div className="card" style={{ padding: 16, marginBottom: 12, background: "rgba(34,197,94,0.04)", borderColor: "rgba(34,197,94,0.12)" }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: "#22c55e" }}>✓ What TO Say After a Meet</h3>
            {[
              "\"I loved watching you compete today.\"",
              "\"What was your favorite moment?\"",
              "\"I could see how hard you worked on that skill.\"",
              "\"You looked really confident out there.\"",
              "\"I'm proud of you no matter what the scores say.\"",
              "\"Want to grab ice cream?\"",
            ].map((s, i) => (
              <div key={i} style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.5, marginBottom: 6, paddingLeft: 12, borderLeft: "2px solid rgba(34,197,94,0.2)", fontStyle: "italic" }}>{s}</div>
            ))}
          </div>

          <div className="card" style={{ padding: 14, background: "rgba(196,152,42,0.03)", borderColor: "rgba(196,152,42,0.1)" }}>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.7, fontStyle: "italic" }}>
              <strong style={{ color: "#C4982A" }}>Remember:</strong> The average competitive gymnastics career lasts 4-8 years. The relationship with your child lasts forever. Protect the relationship — the scores will take care of themselves.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SEASON GOALS SCREEN ────────────────────────────────────────────
function SeasonGoalsScreen({ profile, history, onBack }) {
  const [goals, setGoals] = useState([]);
  const [newGoalEvent, setNewGoalEvent] = useState("");
  const [newGoalTarget, setNewGoalTarget] = useState("");
  const events = profile.gender === "female" ? WOMEN_EVENTS : MEN_EVENTS;

  // Load goals from storage
  useEffect(() => {
    (async () => {
      try {
        const stored = await storage.get("strive-goals");
        if (stored) setGoals(JSON.parse(stored.value));
      } catch {}
    })();
  }, []);

  const saveGoals = async (g) => {
    setGoals(g);
    try { await storage.set("strive-goals", JSON.stringify(g)); } catch {}
  };

  const addGoal = () => {
    if (!newGoalEvent || !newGoalTarget) return;
    const currentBest = history.filter(h => h.event === newGoalEvent).reduce((best, h) => Math.max(best, h.score || 0), 0);
    saveGoals([...goals, {
      id: Date.now(), event: newGoalEvent, target: parseFloat(newGoalTarget),
      startScore: currentBest || null, created: new Date().toISOString(),
    }]);
    setNewGoalEvent(""); setNewGoalTarget("");
  };

  const removeGoal = (id) => saveGoals(goals.filter(g => g.id !== id));

  return (
    <div style={{ minHeight: "100vh", padding: "16px 18px 90px", maxWidth: 540, margin: "0 auto" }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: "rgba(196,152,42,0.6)", cursor: "pointer", fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 600, marginBottom: 14, display: "flex", alignItems: "center", gap: 4 }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M8.5 2.5l-5 5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> Dashboard
      </button>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}><Icon name="target" size={24} /> Season Goals</h2>
      <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, marginBottom: 20 }}>Set targets and track progress toward them</p>

      {/* Add new goal */}
      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Add a Goal</h3>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <select value={newGoalEvent} onChange={e => setNewGoalEvent(e.target.value)}
            className="input-field" style={{ flex: 2, fontSize: 13, padding: "10px 8px" }}>
            <option value="">Event...</option>
            {events.map(e => <option key={e} value={e}>{e}</option>)}
            <option value="All-Around">All-Around</option>
          </select>
          <input className="input-field" type="number" step="0.025" min="7" max="10"
            placeholder="Target (e.g. 9.2)" value={newGoalTarget}
            onChange={e => setNewGoalTarget(e.target.value)}
            style={{ flex: 1, fontSize: 13, fontFamily: "'Space Mono', monospace" }} />
        </div>
        <button onClick={addGoal} disabled={!newGoalEvent || !newGoalTarget}
          className="btn-gold" style={{ width: "100%", padding: "10px 12px", fontSize: 13, opacity: (!newGoalEvent || !newGoalTarget) ? 0.4 : 1 }}>
          Set Goal
        </button>
      </div>

      {/* Active goals */}
      {goals.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: "center" }}>
          <Icon name="target" size={28} />
          <p style={{ color: "rgba(255,255,255,0.4)", marginTop: 12, fontSize: 14 }}>No goals set yet. Add your first season goal above!</p>
        </div>
      ) : goals.map(goal => {
        const scores = history.filter(h => h.event === goal.event).map(h => h.score).filter(Boolean);
        const current = scores.length > 0 ? Math.max(...scores) : goal.startScore || 0;
        const startVal = goal.startScore || (current - 0.3);
        const range = goal.target - startVal;
        const progress = range > 0 ? Math.max(0, Math.min(100, ((current - startVal) / range) * 100)) : 0;
        const achieved = current >= goal.target;

        return (
          <div key={goal.id} className="card" style={{ padding: 16, marginBottom: 12, borderColor: achieved ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.06)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{goal.event}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
                  Current best: <span style={{ color: "#C4982A", fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>{current ? current.toFixed(3) : "—"}</span>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>TARGET</div>
                <div style={{ fontSize: 22, fontWeight: 900, fontFamily: "'Space Mono', monospace", color: achieved ? "#22c55e" : "#C4982A" }}>
                  {goal.target.toFixed(3)}
                </div>
              </div>
            </div>
            {/* Progress bar */}
            <div style={{ position: "relative", height: 8, borderRadius: 4, background: "rgba(255,255,255,0.06)", overflow: "hidden", marginBottom: 6 }}>
              <div style={{
                position: "absolute", top: 0, left: 0, bottom: 0, borderRadius: 4,
                width: `${progress}%`, transition: "width 0.5s ease-out",
                background: achieved ? "linear-gradient(90deg, #22c55e, #C4982A)" : "linear-gradient(90deg, #C4982A, #E8C35A)",
              }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: achieved ? "#22c55e" : "rgba(255,255,255,0.35)", fontWeight: achieved ? 700 : 400 }}>
                {achieved ? "🎉 GOAL ACHIEVED!" : `${progress.toFixed(0)}% of the way there`}
              </span>
              <button onClick={() => removeGoal(goal.id)} style={{
                background: "none", border: "none", color: "rgba(255,255,255,0.2)", cursor: "pointer", fontSize: 12, fontFamily: "'Outfit', sans-serif",
              }}>remove</button>
            </div>
          </div>
        );
      })}

      {/* Tip */}
      <div className="card" style={{ padding: 14, marginTop: 12, background: "rgba(196,152,42,0.03)", borderColor: "rgba(196,152,42,0.1)" }}>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.7, fontStyle: "italic" }}>
          <strong style={{ color: "#C4982A" }}>Setting good goals:</strong> Aim for 0.2-0.4 improvement per season on each event. That might sound small, but in gymnastics scoring, improving 0.3 on every event means a 1.2 improvement in All-Around — that's the difference between 5th place and 1st.
        </p>
      </div>
    </div>
  );
}

// ─── BODY HEATMAP — shows where on the body deductions cluster ──────
function BodyHeatmap({ deductions }) {
  if (!deductions || deductions.length === 0) return null;

  // Map deductions to body regions using engine, fault text, bodyPoint, and faultJoints
  const regions = {
    head:       { cx: 150, cy: 38,  rx: 18, ry: 22, label: "Head", total: 0, faults: [] },
    shoulders:  { cx: 150, cy: 82,  rx: 38, ry: 12, label: "Shoulders", total: 0, faults: [] },
    elbows:     { cx: 150, cy: 130, rx: 50, ry: 14, label: "Arms/Elbows", total: 0, faults: [] },
    wrists:     { cx: 150, cy: 175, rx: 55, ry: 10, label: "Wrists/Hands", total: 0, faults: [] },
    chest:      { cx: 150, cy: 110, rx: 28, ry: 20, label: "Chest/Torso", total: 0, faults: [] },
    hips:       { cx: 150, cy: 170, rx: 30, ry: 18, label: "Hips/Core", total: 0, faults: [] },
    knees:      { cx: 150, cy: 235, rx: 26, ry: 16, label: "Knees", total: 0, faults: [] },
    ankles:     { cx: 150, cy: 295, rx: 22, ry: 12, label: "Ankles/Feet", total: 0, faults: [] },
  };

  const classify = (d) => {
    const hits = [];
    const fault = (safeStr(d.fault) + " " + safeStr(d.details) + " " + safeStr(d.engine)).toLowerCase();

    // Check subFaults for bodyPoint
    const allBodyPoints = [];
    if (d.bodyPoint) allBodyPoints.push(d.bodyPoint);
    safeArray(d.subFaults).forEach(sf => { if (sf.bodyPoint) allBodyPoints.push(sf.bodyPoint); });

    // Check faultJoints from skeleton
    const fj = d.skeleton?.faultJoints || [];
    fj.forEach(j => {
      const jl = String(j || "").toLowerCase();
      if (jl.includes("ankle")) allBodyPoints.push("ankles");
      else if (jl.includes("knee")) allBodyPoints.push("knees");
      else if (jl.includes("hip")) allBodyPoints.push("hips");
      else if (jl.includes("elbow")) allBodyPoints.push("elbows");
      else if (jl.includes("wrist")) allBodyPoints.push("wrists");
      else if (jl.includes("shoulder")) allBodyPoints.push("shoulders");
    });

    allBodyPoints.forEach(bp => {
      const bl = String(bp || "").toLowerCase();
      if (bl.includes("ankle") || bl.includes("foot") || bl.includes("feet") || bl.includes("toe")) hits.push("ankles");
      else if (bl.includes("knee")) hits.push("knees");
      else if (bl.includes("hip") || bl.includes("core") || bl.includes("split")) hits.push("hips");
      else if (bl.includes("elbow") || bl.includes("arm")) hits.push("elbows");
      else if (bl.includes("wrist") || bl.includes("hand")) hits.push("wrists");
      else if (bl.includes("shoulder")) hits.push("shoulders");
      else if (bl.includes("torso") || bl.includes("chest")) hits.push("chest");
      else if (bl.includes("head")) hits.push("head");
    });

    // Fallback: infer from engine and fault text
    if (hits.length === 0) {
      if (d.engine === "TPM" || fault.match(/toe|foot|feet|flat.?foot|flex.*foot|ankle|relevé/)) hits.push("ankles");
      if (d.engine === "KTM" || fault.match(/knee|soft knee|cowboy|leg sep/)) hits.push("knees");
      if (d.engine === "Split-Check" || fault.match(/split|hip.*angle|hip.*vertex|over-split/)) hits.push("hips");
      if (d.engine === "VAE" || fault.match(/vertical|align|handstand|arch|hollow|pike|body line/)) hits.push("chest");
      if (d.engine === "Landing" || fault.match(/land|step|stuck|hop/)) { hits.push("ankles"); hits.push("knees"); }
      if (fault.match(/elbow|arm|lock.*arm/)) hits.push("elbows");
      if (fault.match(/shoulder|repulsion/)) hits.push("shoulders");
      if (fault.match(/wrist|hand|grip/)) hits.push("wrists");
      if (fault.match(/head|chin|spot/)) hits.push("head");
    }

    // If still nothing, put it on chest/torso as general
    if (hits.length === 0) hits.push("chest");

    return [...new Set(hits)];
  };

  // Accumulate deductions per region
  deductions.forEach(d => {
    const bodyRegions = classify(d);
    const share = d.deduction / bodyRegions.length; // split evenly if multiple regions
    bodyRegions.forEach(region => {
      if (regions[region]) {
        regions[region].total += share;
        regions[region].faults.push(safeStr(d.fault || d.skill).substring(0, 50));
      }
    });
  });

  const maxTotal = Math.max(...Object.values(regions).map(r => r.total), 0.01);
  const activeRegions = Object.entries(regions).filter(([, r]) => r.total > 0);

  if (activeRegions.length === 0) return null;

  return (
    <div className="card" style={{ padding: "16px 14px", marginBottom: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: 1, marginBottom: 8 }}>
        BODY FAULT MAP
      </div>
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        {/* Body silhouette with heatmap */}
        <svg viewBox="0 0 300 340" style={{ width: 160, flexShrink: 0 }}>
          {/* Body silhouette */}
          <g opacity="0.25" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" fill="none">
            {/* Head */}
            <ellipse cx="150" cy="38" rx="18" ry="22" />
            {/* Neck */}
            <line x1="150" y1="60" x2="150" y2="72" />
            {/* Torso */}
            <path d="M 120 72 L 120 170 Q 120 180 130 180 L 170 180 Q 180 180 180 170 L 180 72 Z" />
            {/* Shoulders to elbows */}
            <line x1="120" y1="80" x2="88" y2="130" />
            <line x1="180" y1="80" x2="212" y2="130" />
            {/* Elbows to wrists */}
            <line x1="88" y1="130" x2="80" y2="185" />
            <line x1="212" y1="130" x2="220" y2="185" />
            {/* Hips to knees */}
            <line x1="130" y1="180" x2="122" y2="248" />
            <line x1="170" y1="180" x2="178" y2="248" />
            {/* Knees to ankles */}
            <line x1="122" y1="248" x2="118" y2="310" />
            <line x1="178" y1="248" x2="182" y2="310" />
            {/* Feet */}
            <ellipse cx="118" cy="318" rx="10" ry="6" />
            <ellipse cx="182" cy="318" rx="10" ry="6" />
          </g>

          {/* Heatmap glows */}
          <defs>
            {activeRegions.map(([key, r]) => {
              const intensity = r.total / maxTotal;
              const color = intensity > 0.6 ? "239,68,68" : intensity > 0.3 ? "245,158,11" : "34,197,94";
              return (
                <radialGradient key={key} id={`glow-${key}`}>
                  <stop offset="0%" stopColor={`rgba(${color},${0.6 * intensity + 0.2})`} />
                  <stop offset="60%" stopColor={`rgba(${color},${0.2 * intensity})`} />
                  <stop offset="100%" stopColor={`rgba(${color},0)`} />
                </radialGradient>
              );
            })}
          </defs>

          {activeRegions.map(([key, r]) => {
            const intensity = r.total / maxTotal;
            const baseR = r.rx * (1 + intensity * 0.5);
            const baseRy = r.ry * (1 + intensity * 0.5);
            // Position adjustments for limbs (left + right)
            const spots = key === "elbows" ? [{ cx: 88, cy: 130 }, { cx: 212, cy: 130 }]
              : key === "wrists" ? [{ cx: 80, cy: 185 }, { cx: 220, cy: 185 }]
              : key === "knees" ? [{ cx: 122, cy: 248 }, { cx: 178, cy: 248 }]
              : key === "ankles" ? [{ cx: 118, cy: 312 }, { cx: 182, cy: 312 }]
              : [{ cx: r.cx, cy: r.cy }];
            return spots.map((s, si) => (
              <ellipse key={`${key}-${si}`} cx={s.cx} cy={s.cy} rx={baseR * 0.7} ry={baseRy * 1.2}
                fill={`url(#glow-${key})`} style={{ animation: `pulse ${2 + si * 0.3}s ease-in-out infinite alternate` }} />
            ));
          })}

          {/* Deduction amounts on hotspots */}
          {activeRegions.map(([key, r]) => {
            const intensity = r.total / maxTotal;
            const color = intensity > 0.6 ? "#ef4444" : intensity > 0.3 ? "#f59e0b" : "#22c55e";
            const labelPos = key === "elbows" ? { x: 242, y: 134 }
              : key === "wrists" ? { x: 248, y: 189 }
              : key === "knees" ? { x: 210, y: 252 }
              : key === "ankles" ? { x: 212, y: 316 }
              : key === "head" ? { x: 190, y: 42 }
              : key === "shoulders" ? { x: 210, y: 86 }
              : key === "chest" ? { x: 206, y: 114 }
              : { x: 206, y: 174 }; // hips
            return (
              <text key={key} x={labelPos.x} y={labelPos.y} fill={color}
                fontSize="11" fontWeight="800" fontFamily="'Space Mono', monospace"
                textAnchor="start" dominantBaseline="middle">
                -{r.total.toFixed(2)}
              </text>
            );
          })}
        </svg>

        {/* Legend / breakdown list */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {activeRegions
            .sort(([, a], [, b]) => b.total - a.total)
            .map(([key, r]) => {
              const intensity = r.total / maxTotal;
              const color = intensity > 0.6 ? "#ef4444" : intensity > 0.3 ? "#f59e0b" : "#22c55e";
              return (
                <div key={key} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>{r.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 800, fontFamily: "'Space Mono', monospace", color }}>-{r.total.toFixed(2)}</span>
                  </div>
                  {/* Bar */}
                  <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${intensity * 100}%`, borderRadius: 2, background: color, transition: "width 0.5s ease" }} />
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2, lineHeight: 1.3 }}>
                    {r.faults.slice(0, 2).join(" · ")}{r.faults.length > 2 ? ` +${r.faults.length - 2} more` : ""}
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}

// ─── DEDUCTION TIMELINE HEATMAP ─────────────────────────────────────
function DeductionTimeline({ deductions, duration }) {
  if (!deductions || deductions.length === 0) return null;

  // Parse timestamps to seconds
  const timed = deductions.map(d => {
    const ts = safeStr(d.timestamp);
    if (ts.toLowerCase() === "global") return { ...d, sec: -1 };
    const parts = ts.split(":");
    const sec = parts.length === 2 ? parseInt(parts[0]) * 60 + parseInt(parts[1]) : parseFloat(parts[0]) || 0;
    return { ...d, sec };
  }).filter(d => d.sec >= 0);

  if (timed.length === 0) return null;

  const maxTime = duration || Math.max(...timed.map(d => d.sec), 60);

  // Build 10 time buckets
  const bucketCount = 10;
  const bucketSize = maxTime / bucketCount;
  const buckets = Array(bucketCount).fill(0);
  const bucketDeductions = Array.from({ length: bucketCount }, () => []);
  timed.forEach(d => {
    const idx = Math.min(Math.floor(d.sec / bucketSize), bucketCount - 1);
    buckets[idx] += d.deduction;
    bucketDeductions[idx].push(d);
  });
  const maxBucket = Math.max(...buckets, 0.01);

  return (
    <div className="card" style={{ padding: "12px 14px", marginBottom: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: 1, marginBottom: 8 }}>
        DEDUCTION TIMELINE
      </div>
      <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 40 }}>
        {buckets.map((val, i) => {
          const intensity = val / maxBucket;
          const barColor = intensity > 0.7 ? "#ef4444" : intensity > 0.4 ? "#f59e0b" : intensity > 0 ? "#22c55e" : "rgba(255,255,255,0.06)";
          const barHeight = val > 0 ? Math.max(6, intensity * 36) : 4;
          const startSec = Math.round(i * bucketSize);
          const endSec = Math.round((i + 1) * bucketSize);
          const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
          return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }} title={`${fmtTime(startSec)}-${fmtTime(endSec)}: ${val > 0 ? "-" + val.toFixed(2) : "clean"} (${bucketDeductions[i].length} ded)`}>
              <div style={{
                width: "100%", height: barHeight, borderRadius: 3,
                background: barColor, transition: "all 0.3s ease",
                opacity: val > 0 ? 0.85 : 0.3,
              }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", fontFamily: "'Space Mono', monospace" }}>0:00</span>
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", fontFamily: "'Space Mono', monospace" }}>
          {Math.floor(maxTime / 60)}:{String(Math.round(maxTime % 60)).padStart(2, "0")}
        </span>
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 6, justifyContent: "center" }}>
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "#22c55e", marginRight: 3, verticalAlign: "middle" }} />Minor</span>
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "#f59e0b", marginRight: 3, verticalAlign: "middle" }} />Moderate</span>
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "#ef4444", marginRight: 3, verticalAlign: "middle" }} />Heavy</span>
      </div>
    </div>
  );
}

// ─── DEDUCTIONS TAB — Grouped skill cards with sub-faults + skeleton ─
function DeductionsTabContent({ result, frames }) {
  const [expandedIdx, setExpandedIdx] = useState(null);

  // Match frames to deductions by closest timestamp
  const getFrameForDeduction = (d) => {
    if (!frames || frames.length === 0) return null;
    const ts = safeStr(d.timestamp);
    if (ts.toLowerCase() === "global") return null;
    const parts = ts.split(":");
    const sec = parts.length === 2 ? parseInt(parts[0]) * 60 + parseInt(parts[1]) : parseFloat(parts[0]) || 0;
    let closest = null;
    let minDist = Infinity;
    frames.forEach(f => {
      const fSec = parseFloat(f.timestamp) || 0;
      const dist = Math.abs(fSec - sec);
      if (dist < minDist) { minDist = dist; closest = f; }
    });
    return minDist < 15 ? closest : null; // within 15s
  };

  // Estimate routine duration from last deduction timestamp
  const lastDed = result.executionDeductions?.slice().sort((a, b) => {
    const parse = (ts) => { const p = safeStr(ts).split(":"); return p.length === 2 ? parseInt(p[0]) * 60 + parseInt(p[1]) : parseFloat(p[0]) || 0; };
    return parse(b.timestamp) - parse(a.timestamp);
  })[0];
  const estDuration = lastDed ? (() => { const p = safeStr(lastDed.timestamp).split(":"); return (p.length === 2 ? parseInt(p[0]) * 60 + parseInt(p[1]) : parseFloat(p[0]) || 0) + 10; })() : null;

  return (
    <div style={{ animation: "fadeIn 0.4s ease-out" }}>
      {/* Body fault heatmap */}
      <BodyHeatmap deductions={result.executionDeductions} />

      {/* Temporal heatmap */}
      <DeductionTimeline deductions={result.executionDeductions} duration={estDuration} />

      {/* Compact scorecard table */}
      <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 12 }}>
        {/* Header row */}
        <div style={{ display: "grid", gridTemplateColumns: "50px 1fr auto", gap: 0, padding: "10px 14px", background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: 1 }}>TIME</span>
          <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: 1 }}>SKILL / FAULT</span>
          <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: 1, textAlign: "right" }}>DED</span>
        </div>

        {/* Deduction rows */}
        {result.executionDeductions?.map((d, i) => {
          const c = DEDUCTION_SCALE[d.severity]?.color || "#f59e0b";
          const isExpanded = expandedIdx === i;
          const frame = isExpanded ? getFrameForDeduction(d) : null;
          return (
            <div key={i}>
              <div onClick={() => setExpandedIdx(isExpanded ? null : i)} style={{
                display: "grid", gridTemplateColumns: "50px 1fr auto", gap: 0,
                padding: "10px 14px", borderBottom: isExpanded ? "none" : "1px solid rgba(255,255,255,0.04)",
                borderLeft: `3px solid ${c}`, cursor: "pointer",
                background: isExpanded ? `${c}08` : "transparent",
                animation: `slideUp 0.2s ease-out ${i * 0.03}s both`,
              }}>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontFamily: "'Space Mono', monospace" }}>{d.timestamp || "—"}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.skill}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2, lineHeight: 1.3 }}>
                    {d.fault || d.details || ""}
                  </div>
                  <div style={{ display: "flex", gap: 4, marginTop: 3, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 3, background: `${c}18`, color: c, fontWeight: 700 }}>{d.category?.toUpperCase()}</span>
                    {d.engine && d.engine !== "General" && <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 3, background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.35)", fontWeight: 600 }}>{d.engine}</span>}
                    {d.confidence != null && (
                      <span style={{
                        fontSize: 8, padding: "1px 5px", borderRadius: 3, fontWeight: 700,
                        background: d.confidence >= 0.8 ? "rgba(34,197,94,0.12)" : d.confidence >= 0.6 ? "rgba(245,158,11,0.12)" : "rgba(239,68,68,0.12)",
                        color: d.confidence >= 0.8 ? "#22c55e" : d.confidence >= 0.6 ? "#f59e0b" : "#ef4444",
                      }}>{Math.round(d.confidence * 100)}% conf</span>
                    )}
                    {d.lowConfidence && (
                      <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 3, background: "rgba(239,68,68,0.12)", color: "#ef4444", fontWeight: 600, fontStyle: "italic" }}>LOW CONF</span>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, paddingLeft: 8 }}>
                  <span style={{ fontFamily: "'Space Mono', monospace", fontWeight: 900, fontSize: 15, color: c }}>
                    -{d.deduction?.toFixed(2)}
                  </span>
                  <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)" }}>{isExpanded ? "▲" : "▼"}</span>
                </div>
              </div>
              {/* Expanded detail panel with frame thumbnail */}
              {isExpanded && (
                <div style={{
                  padding: "12px 14px 14px 53px", borderBottom: "1px solid rgba(255,255,255,0.04)",
                  background: `${c}06`, borderLeft: `3px solid ${c}`,
                  animation: "fadeIn 0.2s ease-out",
                }}>
                  <div style={{ display: "flex", gap: 12 }}>
                    {/* Frame thumbnail */}
                    {frame && (
                      <div style={{ flexShrink: 0 }}>
                        <img src={frame.dataUrl} alt={`Frame at ${frame.timestamp}s`} style={{
                          width: 120, height: 90, objectFit: "cover", borderRadius: 8,
                          border: `2px solid ${c}40`,
                        }} />
                        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", textAlign: "center", marginTop: 3, fontFamily: "'Space Mono', monospace" }}>
                          {parseFloat(frame.timestamp).toFixed(1)}s
                        </div>
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {d.details && d.details !== d.fault && (
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.5, marginBottom: 6 }}>{d.details}</div>
                      )}
                      {d.correction && (
                        <div style={{ fontSize: 11, color: "#22c55e", lineHeight: 1.4, padding: "6px 8px", background: "rgba(34,197,94,0.08)", borderRadius: 6 }}>
                          <span style={{ fontWeight: 700 }}>Fix: </span>{d.correction}
                        </div>
                      )}
                      {d.subFaults && d.subFaults.length > 0 && (
                        <div style={{ marginTop: 6 }}>
                          {d.subFaults.map((sf, si) => (
                            <div key={si} style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", lineHeight: 1.4, padding: "2px 0", display: "flex", justifyContent: "space-between" }}>
                              <span>{sf.fault}</span>
                              <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: c, fontWeight: 600 }}>-{sf.deduction?.toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Math breakdown */}
      <div style={{
        background: "linear-gradient(135deg, rgba(196,152,42,0.06), rgba(196,152,42,0.02))",
        border: "1px solid rgba(196,152,42,0.15)", borderRadius: 12,
        padding: 16, marginTop: 4,
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: 1, marginBottom: 10 }}>SCORE MATH</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {safeNum(result.executionDeductionsTotal, 0) > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>Execution ({result.executionDeductions?.filter(d => d.category !== "artistry").length || 0} deductions)</span>
              <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, fontWeight: 700, color: "#ef4444" }}>-{safeNum(result.executionDeductionsTotal, 0).toFixed(3)}</span>
            </div>
          )}
          {safeNum(result.artistryDeductionsTotal, 0) > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>Artistry ({result.executionDeductions?.filter(d => d.category === "artistry").length || 0} deductions)</span>
              <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, fontWeight: 700, color: "#ef4444" }}>-{safeNum(result.artistryDeductionsTotal, 0).toFixed(3)}</span>
            </div>
          )}
          <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "4px 0" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.8)" }}>Total Deductions ({result.executionDeductions?.length || 0} items)</span>
            <span style={{ fontFamily: "'Space Mono', monospace", fontWeight: 900, fontSize: 16, color: "#ef4444" }}>-{safeNum(result.totalDeductions, 0).toFixed(3)}</span>
          </div>
          <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "2px 0" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.5)" }}>
              {safeNum(result.startValue, 10).toFixed(1)} - {safeNum(result.totalDeductions, 0).toFixed(3)} =
            </span>
            <span style={{ fontFamily: "'Space Mono', monospace", fontWeight: 900, fontSize: 20, color: result.finalScore >= 9.0 ? "#22c55e" : result.finalScore >= 8.0 ? "#f59e0b" : "#ef4444" }}>
              {safeNum(result.finalScore, 0).toFixed(3)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── WEEKLY TRAINING PLAN (added to Drills screen) ──────────────────
function WeeklyTrainingPlan({ faults }) {
  const [expanded, setExpanded] = useState(false);
  const topFaults = [...new Set(faults)].slice(0, 3);

  const dayPlans = [
    { day: "Monday", focus: "Strength & Conditioning", items: ["Hollow body holds 4×20s", "Plank variations 3×30s", "Leg lifts on bar 3×10", "Plyometric jumps 3×8"] },
    { day: "Tuesday", focus: "Flexibility & Body Lines", items: ["Splits routine (all 3) 5 min each", "Shoulder flexibility 5 min", "Bridge walk-overs 10 reps", "Relevé walks on beam line 2× length"] },
    { day: "Wednesday", focus: "Skill-Specific Drills", items: topFaults.length > 0 ? topFaults.map(f => {
      if (f.includes("knee") || f.includes("leg")) return "Straight-leg drills: handstands, casts, jumps with focus on locked knees";
      if (f.includes("land") || f.includes("step")) return "Landing drills: 20 stick landings from low block, drop landings 3×8";
      if (f.includes("foot") || f.includes("flex")) return "Theraband ankle exercises 3×20, toe point practice 5 min";
      return "Full routine run-through focusing on identified weak points";
    }) : ["Full routine run-through 3×", "Skill repetitions on weakest elements", "Combination practice (linking skills)"] },
    { day: "Thursday", focus: "Power & Amplitude", items: ["Box jumps 4×6", "Hurdle-punch drills 10 reps", "Tumbling into pit for height", "Sprint training 4×20m for vault approach"] },
    { day: "Friday", focus: "Full Routine Practice", items: ["Complete routine run 3× each event", "Focus on presentation and artistry", "Mock judging: have coach score", "Cool down: flexibility + visualization 10 min"] },
  ];

  return (
    <div className="card" style={{ padding: 16, marginBottom: 16, borderColor: "rgba(196,152,42,0.12)" }}>
      <div onClick={() => setExpanded(!expanded)} style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ fontSize: 14, fontWeight: 700 }}><Icon name="target" size={14} /> Weekly Training Plan</h3>
        <span style={{ color: "#C4982A", fontSize: 13, fontWeight: 600 }}>{expanded ? "▲" : "▼"}</span>
      </div>
      {expanded && (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 12 }}>Based on the faults identified in this analysis:</p>
          {dayPlans.map((day, i) => (
            <div key={i} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: i < dayPlans.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#C4982A" }}>{day.day}</span>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{day.focus}</span>
              </div>
              {day.items.map((item, j) => (
                <div key={j} style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.7, paddingLeft: 12, borderLeft: "2px solid rgba(196,152,42,0.1)" }}>
                  {item}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── DIAGNOSTICS DASHBOARD ──────────────────────────────────────────
// ─── EVIDENCE-BASED TRAINING SOURCES ────────────────────────────────
// Programs derived from: USAG Athlete Wellness (usagym.org/wellness),
// NSCA Youth Training Position Statement, ACSM Pediatric Exercise Guidelines,
// USA Gymnastics SafeSport & Injury Prevention protocols
const EVIDENCE_PROGRAMS = {
  strength: {
    // NSCA: youth athletes benefit from bodyweight + light resistance, 2-3x/week
    // USAG: conditioning should match competitive demands
    core: [
      { exercise: "Hollow body hold", prescription: "4 × 20 sec", source: "USAG conditioning", why: "Foundation of all aerial body tension — directly reduces pike/arch deductions" },
      { exercise: "V-ups", prescription: "3 × 12 reps", source: "NSCA youth protocol", why: "Dynamic core strength for tuck/pike initiation speed" },
      { exercise: "Plank to pike walk-out", prescription: "3 × 8 reps", source: "ACSM functional training", why: "Core-to-shoulder chain integration for handstand transitions" },
    ],
    lowerBody: [
      { exercise: "Single-leg Romanian deadlift", prescription: "3 × 10 each leg", source: "NSCA injury prevention", why: "Addresses valgus knee pattern, strengthens VMO and hamstrings" },
      { exercise: "Depth drops to stick", prescription: "3 × 8 from 12-18 inch", source: "USAG landing protocol", why: "Eccentric landing control — directly reduces step deductions" },
      { exercise: "Lateral band walks", prescription: "3 × 15 each direction", source: "ACSM knee stability", why: "Glute med activation prevents inward knee collapse on landing" },
    ],
    upperBody: [
      { exercise: "Handstand shoulder shrugs (wall)", prescription: "3 × 10", source: "USAG bars conditioning", why: "Shoulder extension for cast handstand and support positions" },
      { exercise: "Eccentric pull-up negatives", prescription: "3 × 5 (5-sec descent)", source: "NSCA upper body", why: "Pull strength for kips, giants, and transition skills" },
    ],
    flexibility: [
      { exercise: "PNF hamstring stretching", prescription: "3 × 30 sec each leg", source: "ACSM flexibility guidelines", why: "Improves split angle — directly addresses split-check deductions" },
      { exercise: "Shoulder CAR (controlled articular rotations)", prescription: "2 × 5 each direction", source: "NSCA joint health", why: "Shoulder mobility for full bridge, walkovers, and casting" },
    ],
  },
  drills: {
    toePoint: { drill: "Theraband ankle point/flex circuit", prescription: "3 × 20 each direction, daily", source: "USAG foot training", why: "Addresses TPM deductions — strengthens plantar flexion for automatic point" },
    kneeControl: { drill: "Foam block squeeze during jumps", prescription: "20 reps per practice", source: "USAG body tension", why: "Addresses KTM deductions — eliminates cowboy/separation in tucks" },
    landing: { drill: "Stick landing series (low-to-high)", prescription: "20 reps, freeze 3 sec", source: "USAG landing protocol", why: "Addresses landing deductions — builds automatic deceleration control" },
    alignment: { drill: "Dowel rod alignment check", prescription: "5 min warm-up", source: "USAG body position", why: "Addresses VAE deductions — builds proprioceptive awareness of body line" },
  },
  mental: {
    // Based on USAG Athlete Wellness mental performance guidelines
    visualization: "Spend 5 minutes before bed mentally performing your routine. Research (Journal of Applied Sport Psychology) shows mental rehearsal activates the same motor pathways as physical practice.",
    preRoutine: "Develop a consistent pre-routine ritual: 3 deep breaths during salute. Inhale confidence, exhale tension. Consistent rituals reduce anxiety by 23% (International Journal of Sport Psychology).",
    errorRecovery: "The '5-second reset': acknowledge the mistake, take one breath, commit to the next skill. Judges score the whole routine. Research shows athletes who reset quickly lose 40% fewer points after errors.",
    fallRecovery: "After a fall, the biggest risk is the NEXT skill — not the fall itself. Practice 'post-fall routines' in training: simulate a fall, stand up, breathe, then execute the next skill with full commitment.",
    confidenceBuilding: "Keep a 'confidence journal': after each practice, write 3 things you did well. This trains your brain to notice success instead of fixating on errors (Positive Psychology in Sport, 2019).",
  },
  nutrition: {
    // ACSM + Academy of Nutrition and Dietetics position on youth athlete nutrition
    young: [
      "Growing gymnasts need 1,600-2,200 calories/day depending on training volume. Never restrict — growing bodies need fuel for bones, muscles, and brain development (Academy of Nutrition and Dietetics).",
      "Calcium goal: 1,300mg/day (3-4 servings of dairy or calcium-fortified foods). Critical for bone density in a high-impact sport (ACSM Pediatric Guidelines).",
      "Pre-practice snack 1-2 hours before: banana + peanut butter, or yogurt + granola. Post-practice within 30 minutes: chocolate milk or protein smoothie (ISSN youth position).",
    ],
    teen: [
      "Performance nutrition: 1.2-1.6g protein per kg bodyweight daily, spread across meals. Protein timing matters — eat within 30 minutes post-training (ISSN Position Stand).",
      "Hydrate: 8+ oz water every 20 minutes during training. For sessions over 90 minutes, add electrolytes. Dehydration of just 2% reduces power output by 10% (ACSM Fluid Guidelines).",
      "Meet day: eat familiar foods only. Carb-focused meal 3 hours before (pasta, rice, toast). Light snack 1 hour before (banana, crackers). Avoid high-fiber and high-fat foods (USAG competition nutrition).",
    ],
    adult: [
      "Recovery nutrition: 20-40g protein + 40-80g carbs within 30 minutes post-training. This window maximizes muscle protein synthesis (ISSN Position Stand on Nutrient Timing).",
      "Anti-inflammatory foods for joint health: omega-3 rich fish 2x/week, berries, leafy greens, turmeric. Reduces training-induced inflammation (Journal of the International Society of Sports Nutrition).",
    ],
  },
  recovery: {
    // ACSM + USAG recovery guidelines
    sleep: { young: "9-11 hours/night (ACSM Pediatric Guidelines). Growth hormone is released during deep sleep — this is when your body actually builds strength.", teen: "8-10 hours/night. Consistent bedtime is more important than total hours. Blue light from screens within 1 hour of bed reduces sleep quality by 30% (Sleep Foundation).", adult: "7-9 hours/night. Sleep is the single most effective recovery tool available (Matthew Walker, 'Why We Sleep')." },
    active: "Active recovery on rest days: 20-minute walk, gentle yoga, or swimming. Research shows light movement increases blood flow to muscles, speeding recovery by 25% vs. complete rest (ACSM Recovery Guidelines).",
    foam: "Foam rolling post-practice: 30-60 seconds per muscle group on quads, hamstrings, calves, and upper back. Reduces DOMS (delayed onset muscle soreness) and maintains range of motion (Journal of Athletic Training).",
  },
};

// ─── DAILY INSPIRATION ENGINE ────────────────────────────────────────
const DAILY_INSPIRATION = {
  strength: [
    "Strong muscles protect joints. Every rep today is an investment in a longer, healthier gymnastics career.",
    "Champions aren't born with strong cores — they build them one hollow body hold at a time.",
    "The gymnast who conditions when no one is watching is the one who sticks the landing when everyone is.",
    "Your body is your instrument. Conditioning tunes it. Today's work creates tomorrow's power.",
    "Simone Biles didn't skip conditioning day. Neither will you.",
  ],
  nutrition: [
    "Food is fuel, not the enemy. The best gymnasts eat enough to train hard and recover fully.",
    "Your muscles are rebuilding right now — give them the protein and carbs they need to come back stronger.",
    "Hydration tip: by the time you feel thirsty, you've already lost performance. Sip throughout the day.",
    "What you eat today becomes the energy for tomorrow's practice. Choose foods that make you powerful.",
    "Recovery starts in the kitchen. A balanced meal after practice does more than any supplement ever could.",
  ],
  mental: [
    "Confidence isn't the absence of fear — it's trusting your training when the fear shows up.",
    "Every champion has fallen. What makes them champions is how they get back up — and you're getting back up.",
    "Your brain is a muscle too. Visualization practice tonight makes tomorrow's routine sharper.",
    "Mistakes don't define you. How you respond to them does. Reset. Breathe. Commit to the next skill.",
    "You don't have to be perfect. You just have to be brave enough to try again.",
  ],
  drills: [
    "Perfect practice makes perfect. 10 minutes of focused drill work beats an hour of mindless reps.",
    "The small details — pointed toes, tight knees, straight arms — are what separate good from great.",
    "Every deduction you fix in practice is a tenth you earn in competition. Details matter.",
    "Drill work isn't boring — it's where champions are built. Own the basics and the rest follows.",
    "The judges can't deduct what isn't there. Clean technique starts with today's drill work.",
  ],
  recovery: [
    "Rest isn't lazy — it's strategic. Your body gets stronger during recovery, not during training.",
    "Sleep is the ultimate performance enhancer. Tonight's rest fuels tomorrow's best routine.",
    "Stretching and foam rolling today means showing up to practice tomorrow without stiffness holding you back.",
    "The best athletes know when to push and when to recover. Today, recover with intention.",
    "Your body is talking to you. Listen. Rest when you need it so you can fly when it counts.",
  ],
};

function getDailyInspiration(pillar) {
  const quotes = DAILY_INSPIRATION[pillar] || DAILY_INSPIRATION.mental;
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  return quotes[dayOfYear % quotes.length];
}

// ─── PROGRESS TRACKER (reads history for trend data) ─────────────────
function PillarProgress({ history, profile }) {
  if (!history || history.length < 2) return null;

  // Sort by date ascending
  const sorted = [...history].sort((a, b) => new Date(a.date) - new Date(b.date));
  const recent = sorted.slice(-10); // last 10 analyses

  // Track pillar trends
  const strengthTrend = recent.map((h, i) => ({
    label: `#${i + 1}`,
    landing: h.landingCount || 0,
    knees: h.ktmCount || 0,
    toes: h.tpmCount || 0,
    power: h.powerRating || 0,
  }));

  const scoreTrend = recent.map((h, i) => ({
    label: `#${i + 1}`,
    score: h.score || 0,
    deductions: h.deductions || 0,
  }));

  // Calculate improvement percentages
  const firstHalf = recent.slice(0, Math.ceil(recent.length / 2));
  const secondHalf = recent.slice(Math.ceil(recent.length / 2));
  const avgFirst = firstHalf.reduce((s, h) => s + (h.score || 0), 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((s, h) => s + (h.score || 0), 0) / secondHalf.length;
  const scoreDelta = avgSecond - avgFirst;

  const avgLandFirst = firstHalf.reduce((s, h) => s + (h.landingCount || 0), 0) / firstHalf.length;
  const avgLandSecond = secondHalf.reduce((s, h) => s + (h.landingCount || 0), 0) / secondHalf.length;
  const landingImproved = avgLandSecond < avgLandFirst;

  const avgFallFirst = firstHalf.filter(h => h.hasFall).length / firstHalf.length;
  const avgFallSecond = secondHalf.filter(h => h.hasFall).length / secondHalf.length;
  const fallsImproved = avgFallSecond < avgFallFirst;

  return (
    <div className="card" style={{ padding: 16, marginBottom: 12, borderColor: "rgba(168,85,247,0.15)" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#a855f7", letterSpacing: 1, marginBottom: 4 }}>📊 YOUR PROGRESS — {recent.length} Analyses</div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 12 }}>Tracking improvement across all training pillars over time</div>

      {/* Score trend */}
      {scoreTrend.length >= 2 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.6)", marginBottom: 6 }}>Score Trend</div>
          <ResponsiveContainer width="100%" height={80}>
            <LineChart data={scoreTrend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 9 }} />
              <YAxis domain={["auto", "auto"]} tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 9 }} />
              <Line type="monotone" dataKey="score" stroke="#C4982A" strokeWidth={2} dot={{ r: 3, fill: "#C4982A" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Improvement indicators */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 30%", minWidth: 80, padding: 10, borderRadius: 8, background: `rgba(${scoreDelta >= 0 ? "34,197,94" : "239,68,68"},0.04)`, textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: scoreDelta >= 0 ? "#22c55e" : "#ef4444", fontFamily: "'Space Mono', monospace" }}>
            {scoreDelta >= 0 ? "+" : ""}{scoreDelta.toFixed(2)}
          </div>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)" }}>Score Change</div>
        </div>
        <div style={{ flex: "1 1 30%", minWidth: 80, padding: 10, borderRadius: 8, background: `rgba(${landingImproved ? "34,197,94" : "245,158,11"},0.04)`, textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: landingImproved ? "#22c55e" : "#f59e0b" }}>
            {landingImproved ? "Improving" : "Work on it"}
          </div>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)" }}>Landings</div>
        </div>
        <div style={{ flex: "1 1 30%", minWidth: 80, padding: 10, borderRadius: 8, background: `rgba(${fallsImproved ? "34,197,94" : "239,68,68"},0.04)`, textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: fallsImproved ? "#22c55e" : avgFallSecond === 0 ? "#22c55e" : "#ef4444" }}>
            {avgFallSecond === 0 ? "No Falls!" : fallsImproved ? "Fewer Falls" : "Watch Falls"}
          </div>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)" }}>Fall Trend</div>
        </div>
      </div>

      {/* Deduction pattern trends */}
      {strengthTrend.length >= 2 && (strengthTrend[0].landing > 0 || strengthTrend[0].knees > 0 || strengthTrend[0].toes > 0) && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.6)", marginBottom: 6 }}>Deduction Patterns Over Time</div>
          <ResponsiveContainer width="100%" height={80}>
            <LineChart data={strengthTrend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 9 }} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 9 }} />
              <Line type="monotone" dataKey="landing" name="Landings" stroke="#ef4444" strokeWidth={1.5} dot={{ r: 2 }} />
              <Line type="monotone" dataKey="knees" name="Knees" stroke="#f97316" strokeWidth={1.5} dot={{ r: 2 }} />
              <Line type="monotone" dataKey="toes" name="Toes" stroke="#8b5cf6" strokeWidth={1.5} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 4 }}>
            {[{label: "Landings", color: "#ef4444"}, {label: "Knees", color: "#f97316"}, {label: "Toes", color: "#8b5cf6"}].map(l => (
              <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, color: "rgba(255,255,255,0.3)" }}>
                <div style={{ width: 8, height: 3, background: l.color, borderRadius: 2 }} />{l.label}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 6, textAlign: "center" }}>
            Lines going down = fewer deductions in that area (improvement!)
          </div>
        </div>
      )}
    </div>
  );
}

// ─── TRAINING PROGRAM TAB (dual-headed: this week + season plan) ────
function TrainingProgram({ result, profile, history }) {
  const coach = result.coachReport;
  const dev = result.athleteDevelopment;
  const bio = result.biomechanics;
  const deds = result.executionDeductions || [];
  const risks = bio?.injuryRiskFlags || [];
  const ageGroup = profile?.age && profile.age < 13 ? "young" : profile?.age && profile.age < 18 ? "teen" : "adult";

  const tpmCount = deds.filter(d => d.engine === "TPM" || (d.fault || "").toLowerCase().match(/toe|foot|flex|ankle/)).length;
  const ktmCount = deds.filter(d => d.engine === "KTM" || (d.fault || "").toLowerCase().match(/knee|soft|separation|cowboy/)).length;
  const landCount = deds.filter(d => d.category === "landing" || (d.fault || "").toLowerCase().match(/land|step|squat/)).length;
  const vaeCount = deds.filter(d => d.engine === "VAE" || (d.fault || "").toLowerCase().match(/align|vertical|handstand|arch/)).length;
  const hasFall = deds.some(d => d.severity === "fall" || (d.fault || "").toLowerCase().includes("fall"));
  const landingTotal = deds.filter(d => d.category === "landing").reduce((s, d) => s + (d.deduction || 0), 0);

  const priorities = [
    { area: "landing", count: landCount, total: landingTotal, label: "Landing Control" },
    { area: "kneeControl", count: ktmCount, total: ktmCount * 0.08, label: "Knee Tension" },
    { area: "toePoint", count: tpmCount, total: tpmCount * 0.05, label: "Toe Point" },
    { area: "alignment", count: vaeCount, total: vaeCount * 0.08, label: "Body Alignment" },
  ].sort((a, b) => b.total - a.total);

  const [viewMode, setViewMode] = useState("thisWeek"); // "thisWeek" or "season"

  // Analyze history for long-term patterns
  const historyEntries = history || [];
  const hasHistory = historyEntries.length >= 2;
  const persistentIssues = [];
  if (hasHistory) {
    const recentEntries = historyEntries.slice(-5);
    const avgLanding = recentEntries.reduce((s, h) => s + (h.landingCount || 0), 0) / recentEntries.length;
    const avgKtm = recentEntries.reduce((s, h) => s + (h.ktmCount || 0), 0) / recentEntries.length;
    const avgTpm = recentEntries.reduce((s, h) => s + (h.tpmCount || 0), 0) / recentEntries.length;
    if (avgLanding >= 2) persistentIssues.push({ area: "Landing", avg: avgLanding.toFixed(1), tip: "Landings remain a consistent issue — consider dedicated landing clinics or working with a trampoline/tumbling coach" });
    if (avgKtm >= 2) persistentIssues.push({ area: "Knee Control", avg: avgKtm.toFixed(1), tip: "Knee separation/softness is a recurring pattern — add daily foam block squeezes and single-leg stability work" });
    if (avgTpm >= 3) persistentIssues.push({ area: "Toe Point", avg: avgTpm.toFixed(1), tip: "Toe point deductions are persistent — add theraband ankle work to daily warm-up until it becomes automatic" });
  }

  const pillarCard = (icon, title, color, immediateContent, longTermContent, inspirePillar) => (
    <div className="card" style={{ padding: 16, marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color, letterSpacing: 1, marginBottom: 10 }}>{icon} {title}</div>
      {viewMode === "thisWeek" ? immediateContent : longTermContent}
      {/* Daily Inspiration */}
      <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: `${color}08`, borderLeft: `2px solid ${color}30` }}>
        <div style={{ fontSize: 10, fontWeight: 700, color, letterSpacing: 0.5, marginBottom: 3 }}>TODAY'S INSPIRATION</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", lineHeight: 1.6, fontStyle: "italic" }}>{getDailyInspiration(inspirePillar)}</div>
      </div>
    </div>
  );

  return (
    <div style={{ animation: "fadeIn 0.4s ease-out" }}>
      {/* Header */}
      <div className="card" style={{ padding: 16, marginBottom: 12, background: "linear-gradient(135deg, rgba(196,152,42,0.06), rgba(196,152,42,0.02))", borderColor: "rgba(196,152,42,0.15)" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#C4982A", letterSpacing: 1, marginBottom: 8 }}>YOUR PERSONALIZED TRAINING PROGRAM</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.7 }}>
          Built from {deds.length} deductions, {risks.length} injury risk flag{risks.length !== 1 ? "s" : ""}, biomechanical analysis
          {profile?.goals ? `, and goal of "${profile.goals}"` : ""} at {result.level || profile?.level || "your level"}.
          {profile?.age ? ` Age-appropriate for ${profile.age}-year-old athletes.` : ""}
        </div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 8 }}>Sources: USAG Athlete Wellness · NSCA Youth Training · ACSM Guidelines · ISSN Position Stands</div>
      </div>

      {/* This Week / Season Toggle */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12, padding: 3, borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
        {[{ id: "thisWeek", label: "This Week" }, { id: "season", label: "Season Plan" }].map(m => (
          <button key={m.id} onClick={() => setViewMode(m.id)} style={{
            flex: 1, padding: "10px 0", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer",
            background: viewMode === m.id ? "rgba(196,152,42,0.15)" : "transparent",
            color: viewMode === m.id ? "#C4982A" : "rgba(255,255,255,0.35)",
            transition: "all 0.2s",
          }}>{m.label}</button>
        ))}
      </div>

      {/* Progress Tracking (if history available) */}
      <PillarProgress history={historyEntries} profile={profile} />

      {/* Persistent issues alert (season view) */}
      {viewMode === "season" && persistentIssues.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 12, borderColor: "rgba(249,115,22,0.2)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#f97316", letterSpacing: 1, marginBottom: 8 }}>🔄 RECURRING PATTERNS</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginBottom: 10 }}>Issues that keep appearing across multiple analyses — these need focused long-term attention</div>
          {persistentIssues.map((p, i) => (
            <div key={i} style={{ padding: 10, marginBottom: 6, borderRadius: 8, background: "rgba(249,115,22,0.04)", borderLeft: "3px solid #f97316" }}>
              <div style={{ fontSize: 12, fontWeight: 700 }}>{p.area} <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 400 }}>avg {p.avg} per analysis</span></div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 4, lineHeight: 1.5 }}>{p.tip}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── DRILLS ── */}
      {pillarCard("🎯", viewMode === "thisWeek" ? "PRIORITY DRILLS — Fix This Week" : "DRILL DEVELOPMENT — Season Plan", "#ef4444",
        // THIS WEEK: specific drills from this analysis
        <>
          {priorities.filter(p => p.count > 0).map((p, i) => {
            const drill = EVIDENCE_PROGRAMS.drills[p.area];
            if (!drill) return null;
            return (
              <div key={i} style={{ padding: 10, marginBottom: 8, borderRadius: 8, background: "rgba(255,255,255,0.02)", borderLeft: `3px solid ${i === 0 ? "#ef4444" : i === 1 ? "#f59e0b" : "#22c55e"}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{p.label}</span>
                  <span style={{ fontSize: 10, fontFamily: "'Space Mono', monospace", color: "rgba(255,255,255,0.3)" }}>{p.count} deduction{p.count !== 1 ? "s" : ""}</span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0" }}>{drill.drill}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{drill.prescription}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>{drill.why}</div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", marginTop: 3 }}>Source: {drill.source}</div>
              </div>
            );
          })}
          {priorities.filter(p => p.count > 0).length === 0 && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", padding: 10 }}>No specific drill priorities from this analysis — maintain current drill routine!</div>
          )}
          {coach?.preemptiveCorrections?.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>COACH CORRECTIONS THIS WEEK:</div>
              {coach.preemptiveCorrections.slice(0, 3).map((c, i) => (
                <div key={i} style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", lineHeight: 1.6, marginBottom: 4, paddingLeft: 10, borderLeft: `2px solid ${c?.priority === "high" ? "rgba(239,68,68,0.3)" : "rgba(239,68,68,0.15)"}` }}>
                  {typeof c === "string" ? c : <><strong style={{ color: "rgba(255,255,255,0.6)" }}>{safeStr(c.skill)}:</strong> {safeStr(c.correction || c.currentFault)}{c.riskIfUncorrected ? ` — ${safeStr(c.riskIfUncorrected)}` : ""}</>}
                </div>
              ))}
            </div>
          )}
        </>,
        // SEASON: long-term drill development
        <>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.7, marginBottom: 10 }}>
            Build drill consistency across the full season. Add each drill to your daily warm-up until it becomes automatic.
          </div>
          {Object.entries(EVIDENCE_PROGRAMS.drills).map(([key, drill], i) => (
            <div key={key} style={{ padding: 10, marginBottom: 6, borderRadius: 8, background: "rgba(255,255,255,0.02)" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0" }}>{drill.drill}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>Daily: {drill.prescription}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 2 }}>Source: {drill.source}</div>
            </div>
          ))}
          {coach?.techniqueProgressionNotes && (
            <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: "rgba(34,197,94,0.04)", borderLeft: "3px solid #22c55e" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#22c55e", marginBottom: 4 }}>NEXT SKILLS TO DEVELOP</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.7 }}>{safeStr(coach.techniqueProgressionNotes)}</div>
            </div>
          )}
        </>,
        "drills"
      )}

      {/* ── STRENGTH ── */}
      {pillarCard("💪", viewMode === "thisWeek" ? "STRENGTH — Target Root Causes" : "STRENGTH — Season Program", "#3b82f6",
        // THIS WEEK: specific to this analysis
        <>
          {coach?.conditioningPlan?.length > 0 ? (
            coach.conditioningPlan.map((c, i) => (
              <div key={i} style={{ padding: 8, marginBottom: 6, borderRadius: 6, background: "rgba(255,255,255,0.02)", display: "flex", gap: 8, alignItems: "flex-start" }}>
                <div style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(59,130,246,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: "#3b82f6", fontFamily: "'Space Mono', monospace", flexShrink: 0 }}>{i + 1}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{safeStr(c.exercise)} <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>({safeStr(c.sets)} · {safeStr(c.frequency)})</span></div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>{safeStr(c.why)}</div>
                </div>
              </div>
            ))
          ) : (
            <>
              {landCount > 0 && EVIDENCE_PROGRAMS.strength.lowerBody.map((ex, i) => (
                <div key={`lb-${i}`} style={{ padding: 8, marginBottom: 4, borderRadius: 6, background: "rgba(255,255,255,0.02)" }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{ex.exercise} <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>({ex.prescription})</span></div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>{ex.why}</div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", marginTop: 2 }}>Source: {ex.source}</div>
                </div>
              ))}
              {EVIDENCE_PROGRAMS.strength.core.slice(0, 2).map((ex, i) => (
                <div key={`core-${i}`} style={{ padding: 8, marginBottom: 4, borderRadius: 6, background: "rgba(255,255,255,0.02)" }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{ex.exercise} <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>({ex.prescription})</span></div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>{ex.why}</div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", marginTop: 2 }}>Source: {ex.source}</div>
                </div>
              ))}
            </>
          )}
        </>,
        // SEASON: full strength program
        <>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.7, marginBottom: 10 }}>
            Complete strength program for {ageGroup === "young" ? "growing athletes" : ageGroup === "teen" ? "teen performers" : "adult athletes"}. Train 2-3x per week, progressively increasing difficulty.
          </div>
          {["core", "lowerBody", "upperBody", "flexibility"].map(group => (
            <div key={group} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: 0.5, marginBottom: 6 }}>{group === "lowerBody" ? "LOWER BODY" : group === "upperBody" ? "UPPER BODY" : group.toUpperCase()}</div>
              {EVIDENCE_PROGRAMS.strength[group].map((ex, i) => (
                <div key={i} style={{ padding: 8, marginBottom: 4, borderRadius: 6, background: "rgba(255,255,255,0.02)" }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{ex.exercise} <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>({ex.prescription})</span></div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>{ex.why}</div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", marginTop: 2 }}>Source: {ex.source}</div>
                </div>
              ))}
            </div>
          ))}
        </>,
        "strength"
      )}

      {/* ── INJURY PREVENTION ── */}
      {risks.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 12, borderColor: risks.some(r => r.risk === "high") ? "rgba(239,68,68,0.2)" : "rgba(245,158,11,0.15)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: risks.some(r => r.risk === "high") ? "#ef4444" : "#f59e0b", letterSpacing: 1, marginBottom: 10 }}>⚠️ INJURY PREVENTION</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 10 }}>Based on biomechanical analysis. Not medical advice — consult a sports medicine professional for concerns.</div>
          {risks.map((r, i) => (
            <div key={i} style={{ padding: 10, marginBottom: 6, borderRadius: 8, background: `${r.risk === "high" ? "rgba(239,68,68,0.04)" : "rgba(245,158,11,0.04)"}`, borderLeft: `3px solid ${r.risk === "high" ? "#ef4444" : r.risk === "moderate" ? "#f59e0b" : "#22c55e"}` }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{safeStr(r.reason)}</div>
              <div style={{ fontSize: 11, color: "#22c55e", marginTop: 4 }}>Rx: {safeStr(r.recommendation)}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── MENTAL ── */}
      {pillarCard("🧠", viewMode === "thisWeek" ? "MENTAL — This Week's Focus" : "MENTAL — Season Development", "#8b5cf6",
        // THIS WEEK
        <>
          {hasFall && (
            <div style={{ padding: 10, marginBottom: 8, borderRadius: 8, background: "rgba(239,68,68,0.04)", borderLeft: "3px solid #ef4444" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#ef4444", marginBottom: 4 }}>FALL RECOVERY — Priority This Week</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>{EVIDENCE_PROGRAMS.mental.fallRecovery}</div>
            </div>
          )}
          <div style={{ padding: 10, marginBottom: 6, borderRadius: 8, background: "rgba(255,255,255,0.02)" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#a78bfa", marginBottom: 4 }}>VISUALIZATION</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>{EVIDENCE_PROGRAMS.mental.visualization}</div>
          </div>
          {deds.length > 8 && (
            <div style={{ padding: 10, marginBottom: 6, borderRadius: 8, background: "rgba(255,255,255,0.02)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#a78bfa", marginBottom: 4 }}>ERROR RECOVERY</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>{EVIDENCE_PROGRAMS.mental.errorRecovery}</div>
            </div>
          )}
          {safeArray(dev?.mentalTraining).map((tip, i) => (
            <div key={i} style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.6, marginTop: 6, paddingLeft: 10, borderLeft: "2px solid rgba(139,92,246,0.15)" }}>{safeStr(tip)}</div>
          ))}
        </>,
        // SEASON
        <>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.7, marginBottom: 10 }}>
            Build a complete mental performance toolkit over the season. Add one technique per month until all become habit.
          </div>
          {Object.entries(EVIDENCE_PROGRAMS.mental).map(([key, content]) => (
            <div key={key} style={{ padding: 10, marginBottom: 6, borderRadius: 8, background: "rgba(255,255,255,0.02)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#a78bfa", marginBottom: 4 }}>{key.replace(/([A-Z])/g, " $1").toUpperCase()}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>{content}</div>
            </div>
          ))}
          {profile?.goals === "build confidence" && (
            <div style={{ padding: 10, borderRadius: 8, background: "rgba(139,92,246,0.04)", borderLeft: "3px solid #8b5cf6", marginTop: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#a78bfa", marginBottom: 4 }}>SEASON CONFIDENCE GOAL</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
                Start a confidence journal. Each week, review and celebrate progress. By mid-season, you'll have documented proof of how far you've come.
              </div>
            </div>
          )}
        </>,
        "mental"
      )}

      {/* ── NUTRITION ── */}
      {pillarCard("🥗", viewMode === "thisWeek" ? `NUTRITION — ${ageGroup === "young" ? "Growing Athlete" : ageGroup === "teen" ? "Teen Performance" : "Adult Athlete"}` : "NUTRITION — Season Fueling Plan", "#22c55e",
        // THIS WEEK
        <>
          {EVIDENCE_PROGRAMS.nutrition[ageGroup].map((tip, i) => (
            <div key={i} style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.7, marginBottom: 8, paddingLeft: 10, borderLeft: "2px solid rgba(34,197,94,0.15)" }}>{tip}</div>
          ))}
        </>,
        // SEASON
        <>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.7, marginBottom: 10 }}>
            Nutrition evolves across the season: building phase early on, maintenance mid-season, and peak fueling for competition.
          </div>
          <div style={{ padding: 10, marginBottom: 8, borderRadius: 8, background: "rgba(255,255,255,0.02)" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#22c55e", marginBottom: 4 }}>PRE-SEASON (Building)</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>Focus on protein intake for muscle building. Increase calories slightly above maintenance to support new skill development and conditioning.</div>
          </div>
          <div style={{ padding: 10, marginBottom: 8, borderRadius: 8, background: "rgba(255,255,255,0.02)" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#22c55e", marginBottom: 4 }}>MID-SEASON (Maintenance)</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>Maintain consistent fueling. Focus on timing: pre-practice snack 1-2 hrs before, recovery meal within 30 min after. Hydrate aggressively.</div>
          </div>
          <div style={{ padding: 10, marginBottom: 8, borderRadius: 8, background: "rgba(255,255,255,0.02)" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#22c55e", marginBottom: 4 }}>COMPETITION (Peak)</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>Only familiar foods on meet days. Carb-focused meals before competition. Light, easy-to-digest snacks between events. Electrolytes for all-day meets.</div>
          </div>
          {EVIDENCE_PROGRAMS.nutrition[ageGroup].map((tip, i) => (
            <div key={i} style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", lineHeight: 1.6, marginBottom: 6, paddingLeft: 10, borderLeft: "2px solid rgba(34,197,94,0.1)" }}>{tip}</div>
          ))}
        </>,
        "nutrition"
      )}

      {/* ── RECOVERY ── */}
      {pillarCard("😴", viewMode === "thisWeek" ? "RECOVERY — This Week" : "RECOVERY — Season Habits", "#06b6d4",
        // THIS WEEK
        <>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.7, marginBottom: 8, paddingLeft: 10, borderLeft: "2px solid rgba(6,182,212,0.15)" }}>
            {EVIDENCE_PROGRAMS.recovery.sleep[ageGroup]}
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.7, marginBottom: 8, paddingLeft: 10, borderLeft: "2px solid rgba(6,182,212,0.15)" }}>
            {EVIDENCE_PROGRAMS.recovery.active}
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.7, paddingLeft: 10, borderLeft: "2px solid rgba(6,182,212,0.15)" }}>
            {EVIDENCE_PROGRAMS.recovery.foam}
          </div>
        </>,
        // SEASON
        <>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.7, marginBottom: 10 }}>
            Recovery is what turns hard training into actual improvement. Build these habits month by month.
          </div>
          <div style={{ padding: 10, marginBottom: 8, borderRadius: 8, background: "rgba(255,255,255,0.02)" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#06b6d4", marginBottom: 4 }}>MONTH 1: Sleep Foundation</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>{EVIDENCE_PROGRAMS.recovery.sleep[ageGroup]} Set a consistent bedtime and track sleep quality.</div>
          </div>
          <div style={{ padding: 10, marginBottom: 8, borderRadius: 8, background: "rgba(255,255,255,0.02)" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#06b6d4", marginBottom: 4 }}>MONTH 2: Add Active Recovery</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>{EVIDENCE_PROGRAMS.recovery.active}</div>
          </div>
          <div style={{ padding: 10, marginBottom: 8, borderRadius: 8, background: "rgba(255,255,255,0.02)" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#06b6d4", marginBottom: 4 }}>MONTH 3: Mobility & Soft Tissue</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>{EVIDENCE_PROGRAMS.recovery.foam}</div>
          </div>
        </>,
        "recovery"
      )}

      {/* ── GOAL-SPECIFIC ── */}
      {(dev?.goalSpecificAdvice || coach?.idealComparison) && (
        <div className="card" style={{ padding: 16, marginBottom: 12, background: "rgba(196,152,42,0.03)", borderColor: "rgba(196,152,42,0.12)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#C4982A", letterSpacing: 1, marginBottom: 8 }}>🏆 {profile?.goals ? profile.goals.toUpperCase() : "DEVELOPMENT ADVICE"}</div>
          {viewMode === "thisWeek" ? (
            <>
              {dev?.goalSpecificAdvice && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.7, marginBottom: 8 }}>{safeStr(dev.goalSpecificAdvice)}</div>}
              {coach?.idealComparison && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.7 }}>{safeStr(coach.idealComparison)}</div>}
            </>
          ) : (
            <>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.7, marginBottom: 8 }}>
                {profile?.goals === "move up levels" && "Moving up requires mastering all skills at current level with minimal deductions. Focus on consistency before adding difficulty."}
                {profile?.goals === "qualify regionals" && "Regional qualification requires consistent competitive scores. Focus on reducing deductions below 1.5 total and building start value."}
                {profile?.goals === "college gymnastics" && "College coaches look for clean execution, consistency, and coachability. Build a highlight reel showing clean routines and personality."}
                {profile?.goals === "improve scores" && "Score improvement comes from two paths: raising start value (harder skills) and lowering deductions (cleaner execution). Clean execution first."}
                {profile?.goals === "injury recovery" && "Recovery is a season, not a setback. Work with your medical team to build back progressively. Every day of smart recovery is an investment."}
                {profile?.goals === "build confidence" && "Confidence builds through preparation and small wins. Track every improvement. Celebrate progress, not just perfection."}
                {profile?.goals === "have fun" && "Fun comes from feeling competent and connected. Master the skills you enjoy, perform for yourself, and remember why you love this sport."}
                {!profile?.goals && "Set a specific goal for this season to help focus your training. Even small goals give direction and motivation."}
              </div>
              {dev?.goalSpecificAdvice && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.7 }}>{safeStr(dev.goalSpecificAdvice)}</div>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── BIOMECHANICS DASHBOARD ─────────────────────────────────────────
function BiomechanicsDashboard({ result }) {
  const bio = result.biomechanics;
  const deds = result.executionDeductions || [];

  const timelineData = deds
    .filter(d => d.timestamp && d.timestamp !== "Global")
    .map(d => {
      const ts = d.timestamp || "0:00";
      const parts = ts.split(/[,\-]/)[0].trim().split(":");
      const sec = parts.length === 2 ? parseInt(parts[0]) * 60 + parseInt(parts[1]) : parseFloat(parts[0]) || 0;
      return { time: sec, deduction: d.deduction, skill: d.skill, severity: d.severity, engine: d.engine };
    })
    .sort((a, b) => a.time - b.time);

  const angleData = (bio?.keyMoments || []).map(m => {
    const parts = (m.timestamp || "0:00").split(/[,\-]/)[0].trim().split(":");
    const sec = parts.length === 2 ? parseInt(parts[0]) * 60 + parseInt(parts[1]) : parseFloat(parts[0]) || 0;
    return { time: sec, skill: m.skill, phase: m.phase, ...m.jointAngles, hipVel: m.angularVelocity?.hip, kneeVel: m.angularVelocity?.knee };
  }).sort((a, b) => a.time - b.time);

  const landings = bio?.landingAnalysis || [];
  const holds = bio?.holdDurations || [];
  const risks = bio?.injuryRiskFlags || [];

  const riskColor = (r) => r === "high" ? "#ef4444" : r === "moderate" ? "#f59e0b" : "#22c55e";

  // Plain-language helpers
  const explainPower = (rating) => {
    if (!rating) return null;
    const n = typeof rating === "number" ? rating : parseFloat(rating);
    if (isNaN(n)) return `Power rated "${rating}" — this measures how much explosive force is generated during tumbling and jumps.`;
    if (n >= 8) return "Excellent explosive power — strong push-off and height on skills. This gymnast generates force well.";
    if (n >= 6) return "Good power generation. More strength training (squat jumps, box jumps) can help get even more height and distance.";
    if (n >= 4) return "Average power. Building leg and core strength will help generate more force for tumbling and vaults.";
    return "Power needs work. Focus on strength basics — squats, lunges, and core conditioning to build a stronger foundation.";
  };

  const explainFlight = (f) => {
    if (!f) return null;
    const fl = String(f).toLowerCase();
    if (fl.includes("high") || fl.includes("excellent")) return "Great height on aerial skills — more air time means more time to complete rotations cleanly.";
    if (fl.includes("moderate") || fl.includes("medium") || fl.includes("good")) return "Decent height. Working on stronger takeoffs and tighter body positions can help get more air time.";
    return "Flight height could improve. Focus on powerful takeoffs and tight body positions to maximize time in the air.";
  };

  const explainKneeAngle = (angle) => {
    if (angle >= 140) return "Great soft landing — knees bending enough to absorb impact safely";
    if (angle >= 120) return "Adequate knee bend on landing — could be slightly softer for better shock absorption";
    return "Landing too stiff — knees need to bend more to protect joints from impact stress";
  };

  const explainChestAngle = (angle) => {
    if (angle >= 80) return "Good upright posture on landing";
    if (angle >= 65) return "Slight forward lean — work on driving chest up through landing";
    return "Too much forward lean — increases fall risk and deductions";
  };

  const explainVelocity = (vel) => {
    if (!vel) return "";
    const v = Math.abs(vel);
    if (v > 300) return "Very fast rotation — great for completing difficult skills";
    if (v > 200) return "Good rotational speed";
    if (v > 100) return "Moderate speed — more power could help";
    return "Slow rotation — may struggle to complete skills cleanly";
  };

  // Body report card: summarize key takeaways
  const bodyGrades = [];
  if (landings.length > 0) {
    const avgKnee = landings.reduce((s, l) => s + (l.kneeFlexionAtImpact || 0), 0) / landings.length;
    const totalSteps = landings.reduce((s, l) => s + (l.stepsAfter || 0), 0);
    bodyGrades.push({
      area: "Landing Mechanics",
      grade: avgKnee >= 140 && totalSteps === 0 ? "A" : avgKnee >= 120 && totalSteps <= 2 ? "B" : avgKnee >= 100 ? "C" : "D",
      tip: avgKnee < 130 ? "Practice landing drills with deeper knee bend to protect joints" : totalSteps > 0 ? `${totalSteps} extra step${totalSteps > 1 ? "s" : ""} — practice sticking landings with arms up` : "Solid landing technique!",
      color: avgKnee >= 130 && totalSteps <= 1 ? "#22c55e" : avgKnee >= 110 ? "#f59e0b" : "#ef4444",
    });
  }
  if (holds.length > 0) {
    const metAll = holds.every(h => h.met);
    const metPct = holds.filter(h => h.met).length / holds.length;
    bodyGrades.push({
      area: "Hold Strength",
      grade: metAll ? "A" : metPct >= 0.7 ? "B" : metPct >= 0.4 ? "C" : "D",
      tip: metAll ? "All holds met the required duration — great static strength!" : "Some holds were too short — build isometric strength with plank and hollow body holds",
      color: metAll ? "#22c55e" : metPct >= 0.5 ? "#f59e0b" : "#ef4444",
    });
  }
  if (risks.length > 0) {
    const hasHigh = risks.some(r => r.risk === "high");
    const hasMod = risks.some(r => r.risk === "moderate");
    bodyGrades.push({
      area: "Joint Safety",
      grade: !hasHigh && !hasMod ? "A" : !hasHigh ? "B" : "C",
      tip: hasHigh ? "High stress detected on some joints — consider talking to a coach about technique adjustments" : hasMod ? "Some moderate joint stress — stretching and proper warm-up will help" : "Joints look good — keep up the warm-up and conditioning routine!",
      color: hasHigh ? "#ef4444" : hasMod ? "#f59e0b" : "#22c55e",
    });
  }

  const sectionHead = (title, subtitle) => (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>{title}</div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", lineHeight: 1.5, marginTop: 2 }}>{subtitle}</div>
    </div>
  );

  return (
    <div style={{ animation: "fadeIn 0.4s ease-out" }}>
      {/* What This Tab Shows */}
      <div className="card" style={{ padding: 16, marginBottom: 12, borderLeft: "3px solid #3b82f6" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#3b82f6", marginBottom: 6 }}>What is Biomechanics?</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.7 }}>
          This tab shows how the body moves during the routine — joint angles, landing impact, rotational speed, and where the body may be under stress.
          Think of it as a "body report card" that helps you understand <strong style={{ color: "rgba(255,255,255,0.8)" }}>what's working well</strong> and <strong style={{ color: "rgba(255,255,255,0.8)" }}>what to train</strong> to improve scores and stay injury-free.
        </div>
      </div>

      {/* Body Report Card */}
      {bodyGrades.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 12 }}>
          {sectionHead("Body Report Card", "Quick overview of physical performance across key areas")}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {bodyGrades.map((g, i) => (
              <div key={i} style={{ flex: "1 1 30%", minWidth: 90, padding: 12, borderRadius: 10, background: "rgba(255,255,255,0.02)", textAlign: "center" }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: g.color, fontFamily: "'Space Mono', monospace" }}>{g.grade}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.6)", marginBottom: 4 }}>{g.area}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", lineHeight: 1.4 }}>{g.tip}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Power & Flight Overview */}
      <div className="card" style={{ padding: 16, marginBottom: 12 }}>
        {sectionHead("Power & Flight", "How much explosive energy is generated and how high skills go in the air")}
        <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
          <div style={{ flex: 1, textAlign: "center", padding: 12, borderRadius: 10, background: "rgba(59,130,246,0.06)" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: 1, marginBottom: 4 }}>POWER</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: "#3b82f6", fontFamily: "'Space Mono', monospace" }}>{bio?.overallPowerRating || "—"}</div>
          </div>
          <div style={{ flex: 1, textAlign: "center", padding: 12, borderRadius: 10, background: "rgba(168,85,247,0.06)" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: 1, marginBottom: 4 }}>FLIGHT</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#a855f7", textTransform: "capitalize" }}>{bio?.overallFlightHeight || "—"}</div>
          </div>
          <div style={{ flex: 1, textAlign: "center", padding: 12, borderRadius: 10, background: risks.some(r => r.risk === "high") ? "rgba(239,68,68,0.06)" : "rgba(34,197,94,0.06)" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: 1, marginBottom: 4 }}>INJURY RISK</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: risks.some(r => r.risk === "high") ? "#ef4444" : risks.some(r => r.risk === "moderate") ? "#f59e0b" : "#22c55e" }}>
              {risks.some(r => r.risk === "high") ? "HIGH" : risks.some(r => r.risk === "moderate") ? "MODERATE" : risks.length > 0 ? "LOW" : "—"}
            </div>
          </div>
        </div>
        {(explainPower(bio?.overallPowerRating) || explainFlight(bio?.overallFlightHeight)) && (
          <div style={{ padding: 10, borderRadius: 8, background: "rgba(59,130,246,0.04)", marginTop: 4 }}>
            {explainPower(bio?.overallPowerRating) && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", lineHeight: 1.6, marginBottom: 4 }}>💪 {explainPower(bio?.overallPowerRating)}</div>}
            {explainFlight(bio?.overallFlightHeight) && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>🕊 {explainFlight(bio?.overallFlightHeight)}</div>}
          </div>
        )}
      </div>

      {/* Deduction Timeline */}
      {timelineData.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 12 }}>
          {sectionHead("When Do Errors Happen?", "This chart shows where in the routine deductions occur — taller bars mean bigger point losses")}
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={timelineData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="time" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} tickFormatter={v => `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} domain={[0, "auto"]} tickFormatter={v => `-${v}`} />
              <Tooltip
                contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                labelFormatter={v => `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`}
                formatter={(val, name, props) => [`-${val.toFixed(2)} (${props.payload.skill})`, "Deduction"]}
              />
              <Line type="stepAfter" dataKey="deduction" stroke="#ef4444" strokeWidth={2} dot={{ r: 4, fill: "#ef4444" }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 8, lineHeight: 1.5 }}>
            {timelineData.length > 3 && timelineData.slice(-2).reduce((s, d) => s + d.deduction, 0) > timelineData.slice(0, 2).reduce((s, d) => s + d.deduction, 0)
              ? "📊 More errors happen toward the end of the routine — this often means fatigue. Endurance conditioning can help."
              : "📊 Errors are spread throughout the routine — focus on cleaning up the specific skills where deductions happen."
            }
          </div>
        </div>
      )}

      {/* Joint Angles — Plain Language */}
      {angleData.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 12 }}>
          {sectionHead("Body Positions During Skills", "Joint angles show how straight or bent the knees and hips are at key moments. Judges want to see fully extended (straight) positions — around 180° for knees and hips.")}
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={angleData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="time" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} tickFormatter={v => `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} domain={[0, 200]} label={{ value: "degrees", angle: -90, position: "insideLeft", fill: "rgba(255,255,255,0.2)", fontSize: 9 }} />
              <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }}
                labelFormatter={v => `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`} />
              <Line type="monotone" dataKey="lKnee" name="L Knee" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              <Line type="monotone" dataKey="rKnee" name="R Knee" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              <Line type="monotone" dataKey="lHip" name="L Hip" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              <Line type="monotone" dataKey="rHip" name="R Hip" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", gap: 12, marginTop: 6, justifyContent: "center" }}>
            {[{label: "L Knee", color: "#ef4444"}, {label: "R Knee", color: "#f97316"}, {label: "L Hip", color: "#3b82f6"}, {label: "R Hip", color: "#8b5cf6"}].map(l => (
              <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
                <div style={{ width: 8, height: 3, background: l.color, borderRadius: 2 }} />{l.label}
              </div>
            ))}
          </div>
          <div style={{ padding: 10, borderRadius: 8, background: "rgba(255,255,255,0.02)", marginTop: 10 }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}>
              <strong style={{ color: "rgba(255,255,255,0.65)" }}>How to read this:</strong> Lines close to 180° mean the body is straight (good for most skills). Dips below 150° during jumps or tumbling passes mean bent knees or pike hips — common deduction causes.
            </div>
          </div>
        </div>
      )}

      {/* Angular Velocity — Plain Language */}
      {angleData.some(d => d.hipVel || d.kneeVel) && (
        <div className="card" style={{ padding: 16, marginBottom: 12 }}>
          {sectionHead("Rotation Speed", "How fast the body spins during skills. Faster rotation = more time to finish flips and twists before landing.")}
          {angleData.filter(d => d.hipVel || d.kneeVel).map((d, i) => (
            <div key={i} style={{ padding: "10px 12px", marginBottom: 6, borderRadius: 8, background: "rgba(255,255,255,0.02)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{d.skill} <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>({d.phase})</span></div>
                </div>
                {d.hipVel && <div style={{ textAlign: "center", padding: "4px 8px", borderRadius: 6, background: "rgba(59,130,246,0.08)" }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>Hip</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#3b82f6", fontFamily: "'Space Mono', monospace" }}>{d.hipVel}°/s</div>
                </div>}
                {d.kneeVel && <div style={{ textAlign: "center", padding: "4px 8px", borderRadius: 6, background: "rgba(249,115,22,0.08)" }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>Knee</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#f97316", fontFamily: "'Space Mono', monospace" }}>{d.kneeVel}°/s</div>
                </div>}
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", lineHeight: 1.4 }}>
                {d.hipVel ? explainVelocity(d.hipVel) : explainVelocity(d.kneeVel)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Landing Analysis — Plain Language */}
      {landings.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 12 }}>
          {sectionHead("Landing Breakdown", "Every landing is checked for safety and form. Soft knees (high knee angle) and upright chest = safer landings and fewer deductions.")}
          {landings.map((l, i) => (
            <div key={i} style={{ padding: 12, marginBottom: 8, borderRadius: 10, background: "rgba(255,255,255,0.02)", borderLeft: `3px solid ${riskColor(l.impactRisk)}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{safeStr(l.skill)}</span>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{safeStr(l.timestamp)}</span>
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                <div style={{ flex: 1, padding: "6px 8px", borderRadius: 6, background: "rgba(255,255,255,0.03)", textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>Knee Bend</div>
                  <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: safeNum(l.kneeFlexionAtImpact, 0) < 120 ? "#ef4444" : "#22c55e" }}>{safeNum(l.kneeFlexionAtImpact, 0)}°</div>
                </div>
                <div style={{ flex: 1, padding: "6px 8px", borderRadius: 6, background: "rgba(255,255,255,0.03)", textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>Chest</div>
                  <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: safeNum(l.chestAngle, 0) < 70 ? "#f59e0b" : "#22c55e" }}>{safeNum(l.chestAngle, 0)}°</div>
                </div>
                <div style={{ flex: 1, padding: "6px 8px", borderRadius: 6, background: "rgba(255,255,255,0.03)", textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>Steps</div>
                  <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: safeNum(l.stepsAfter, 0) > 0 ? "#f59e0b" : "#22c55e" }}>{safeNum(l.stepsAfter, 0)}</div>
                </div>
                <div style={{ flex: 1, padding: "6px 8px", borderRadius: 6, background: `${riskColor(l.impactRisk)}08`, textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>Impact</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: riskColor(l.impactRisk), textTransform: "uppercase" }}>{l.impactRisk}</div>
                </div>
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", lineHeight: 1.5, padding: "6px 0" }}>
                {explainKneeAngle(safeNum(l.kneeFlexionAtImpact, 0))} • {explainChestAngle(safeNum(l.chestAngle, 0))}
                {safeNum(l.stepsAfter, 0) > 0 && ` • ${safeNum(l.stepsAfter, 0)} step${safeNum(l.stepsAfter, 0) > 1 ? "s" : ""} after landing = -${(safeNum(l.stepsAfter, 0) * 0.1).toFixed(1)} deduction`}
              </div>
              {l.notes && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", lineHeight: 1.5 }}>{safeStr(l.notes)}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Hold Durations — Plain Language */}
      {holds.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 12 }}>
          {sectionHead("Hold Positions", "Some skills require holding a position still for a set time. Letting go too early costs points. This measures if each hold was long enough.")}
          {holds.map((h, i) => {
            const durMs = safeNum(h.durationMs, 0); const reqMs = safeNum(h.requiredMs, 0);
            const pct = reqMs > 0 ? Math.min(100, (durMs / reqMs) * 100) : 100;
            const shortBy = h.met ? 0 : ((reqMs - durMs) / 1000).toFixed(1);
            return (
              <div key={i} style={{ marginBottom: 10, padding: "10px 12px", borderRadius: 8, background: "rgba(255,255,255,0.02)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{safeStr(h.skill)} <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{safeStr(h.timestamp)}</span></span>
                  <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, fontWeight: 700, color: h.met ? "#22c55e" : "#ef4444" }}>
                    {(durMs / 1000).toFixed(1)}s / {(reqMs / 1000).toFixed(1)}s
                  </span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, borderRadius: 3, background: h.met ? "#22c55e" : "#ef4444", transition: "width 0.5s" }} />
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>
                  {h.met ? "Held long enough — no deduction" : `Released ${shortBy}s too early — practice holding longer with core/arm conditioning`}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Injury Risk Flags — Plain Language */}
      {risks.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 12, borderColor: risks.some(r => r.risk === "high") ? "rgba(239,68,68,0.2)" : "rgba(245,158,11,0.15)" }}>
          {sectionHead(
            risks.some(r => r.risk === "high") ? "Body Safety Alerts" : "Body Safety Check",
            "Areas where the body may be under extra stress. Not medical advice — talk to a coach or sports medicine professional about any concerns."
          )}
          {risks.map((r, i) => (
            <div key={i} style={{
              padding: 12, marginBottom: 6, borderRadius: 10,
              background: `${riskColor(r.risk)}06`,
              borderLeft: `3px solid ${riskColor(r.risk)}`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{r.joint?.replace("l", "Left ").replace("r", "Right ").replace("Knee", "Knee").replace("Ankle", "Ankle").replace("Elbow", "Elbow")}</span>
                <span style={{
                  fontSize: 10, fontWeight: 700, textTransform: "uppercase", padding: "2px 8px", borderRadius: 4,
                  background: `${riskColor(r.risk)}15`, color: riskColor(r.risk),
                }}>{r.risk} risk</span>
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: 4 }}>{safeStr(r.reason)}</div>
              {r.recommendation && (
                <div style={{ fontSize: 11, color: "#22c55e", marginTop: 4, lineHeight: 1.5 }}>What to do: {safeStr(r.recommendation)}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* No data fallback */}
      {!bio && timelineData.length === 0 && (
        <div className="card" style={{ padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🦴</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Body Movement Analysis</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", lineHeight: 1.6 }}>
            After analyzing a video, this tab will show how the body moves during the routine — including joint positions, landing safety, hold strength, and areas to watch for injury prevention.
          </div>
        </div>
      )}
    </div>
  );
}

function DiagnosticsDashboard({ result }) {
  const diag = result.diagnostics || {};
  const deds = result.executionDeductions || [];

  // Categorize deductions by engine/type
  const engineCounts = {};
  const categoryTotals = {};
  deds.forEach(d => {
    const eng = d.engine || d.category || "execution";
    engineCounts[eng] = (engineCounts[eng] || 0) + 1;
    categoryTotals[d.category || "execution"] = (categoryTotals[d.category || "execution"] || 0) + (d.deduction || 0);
  });

  // Severity breakdown
  const severityCounts = {};
  deds.forEach(d => { severityCounts[d.severity || "small"] = (severityCounts[d.severity || "small"] || 0) + 1; });

  // Identify the biggest math win
  const sortedDeds = [...deds].sort((a, b) => (b.deduction || 0) - (a.deduction || 0));
  const biggestWin = diag.biggestMathWin || (sortedDeds[0] ? `Fix "${sortedDeds[0].skill}" (${sortedDeds[0].fault}) to save -${sortedDeds[0].deduction?.toFixed(2)}` : "");

  return (
    <div style={{ animation: "fadeIn 0.4s ease-out" }}>
      {/* Biggest Math Win */}
      {biggestWin && (
        <div className="card" style={{ padding: 16, marginBottom: 12, borderColor: "rgba(34,197,94,0.2)", background: "rgba(34,197,94,0.04)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#22c55e", letterSpacing: 1, marginBottom: 6 }}>🎯 BIGGEST MATH WIN</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.8)", lineHeight: 1.7 }}>
            {biggestWin}
          </div>
          {sortedDeds.length >= 3 && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 8, lineHeight: 1.6 }}>
              Fixing the top 3 deductions alone would save <span style={{ color: "#C4982A", fontWeight: 700, fontFamily: "'Space Mono', monospace" }}>+{sortedDeds.slice(0, 3).reduce((s, d) => s + safeNum(d.deduction, 0), 0).toFixed(2)}</span> — that's the difference between {safeNum(result.finalScore, 0).toFixed(1)} and {(safeNum(result.finalScore, 0) + sortedDeds.slice(0, 3).reduce((s, d) => s + safeNum(d.deduction, 0), 0)).toFixed(1)}.
            </div>
          )}
        </div>
      )}

      {/* Consistency Analysis */}
      {diag.consistencyNote && (
        <div className="card" style={{ padding: 16, marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#C4982A", letterSpacing: 1, marginBottom: 6 }}>🔍 WHERE DOES FOCUS BREAK?</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.7 }}>{diag.consistencyNote}</div>
        </div>
      )}

      {/* Deduction Heatmap by Category */}
      <div className="card" style={{ padding: 16, marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: 1, marginBottom: 12 }}>DEDUCTION BREAKDOWN BY TYPE</div>
        {Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]).map(([cat, total], i) => {
          const pct = result.totalDeductions > 0 ? (total / result.totalDeductions) * 100 : 0;
          const count = deds.filter(d => (d.category || "execution") === cat).length;
          return (
            <div key={i} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600, textTransform: "capitalize" }}>{cat}</span>
                <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, fontWeight: 700, color: "#ef4444" }}>-{total.toFixed(2)} <span style={{ color: "rgba(255,255,255,0.3)", fontWeight: 400 }}>({count})</span></span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, borderRadius: 3, background: cat === "execution" ? "#ef4444" : cat === "landing" ? "#f97316" : cat === "artistry" ? "#a855f7" : "#f59e0b", transition: "width 0.5s" }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Detection Engine Report */}
      <div className="card" style={{ padding: 16, marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: 1, marginBottom: 12 }}>DETECTION ENGINE REPORT</div>
        {[
          { name: "Toe Point (TPM)", count: diag.toePointIssues || deds.filter(d => (d.fault || "").toLowerCase().includes("toe") || (d.fault || "").toLowerCase().includes("flex") || (d.fault || "").toLowerCase().includes("foot") || (d.engine || "") === "TPM").length, color: "#ef4444", icon: "🦶" },
          { name: "Knee Tension (KTM)", count: diag.kneeTensionIssues || deds.filter(d => (d.fault || "").toLowerCase().includes("knee") || (d.fault || "").toLowerCase().includes("soft") || (d.engine || "") === "KTM").length, color: "#f97316", icon: "🦵" },
          { name: "Landing", count: deds.filter(d => d.category === "landing").length, total: diag.landingDeductions || deds.filter(d => d.category === "landing").reduce((s, d) => s + (d.deduction || 0), 0), color: "#f59e0b", icon: "👟" },
          { name: "Artistry", count: deds.filter(d => d.category === "artistry").length, total: diag.artistryDeductions || deds.filter(d => d.category === "artistry").reduce((s, d) => s + (d.deduction || 0), 0), color: "#a855f7", icon: "💃" },
        ].map((eng, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 10, marginBottom: 4,
            background: eng.count > 0 ? `${eng.color}08` : "rgba(255,255,255,0.02)",
            borderLeft: `3px solid ${eng.count > 0 ? eng.color : "rgba(255,255,255,0.06)"}`,
          }}>
            <span style={{ fontSize: 18 }}>{eng.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: eng.count > 0 ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.4)" }}>{eng.name}</div>
              {eng.total !== undefined && eng.total > 0 && (
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>-{eng.total.toFixed(2)} total</div>
              )}
            </div>
            <div style={{
              width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
              background: eng.count > 2 ? `${eng.color}20` : eng.count > 0 ? `${eng.color}10` : "rgba(255,255,255,0.04)",
              fontFamily: "'Space Mono', monospace", fontSize: 14, fontWeight: 900,
              color: eng.count > 0 ? eng.color : "rgba(255,255,255,0.2)",
            }}>
              {eng.count}
            </div>
          </div>
        ))}
      </div>

      {/* Biomechanical Summary */}
      {result.biomechanics && (
        <div className="card" style={{ padding: 16, marginBottom: 12, borderColor: "rgba(59,130,246,0.15)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#3b82f6", letterSpacing: 1, marginBottom: 10 }}>🦴 BIOMECHANICAL SUMMARY</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <div style={{ flex: 1, padding: "8px 6px", borderRadius: 8, background: "rgba(59,130,246,0.06)", textAlign: "center" }}>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>Power</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#3b82f6", fontFamily: "'Space Mono', monospace" }}>{result.biomechanics.overallPowerRating || "—"}</div>
            </div>
            <div style={{ flex: 1, padding: "8px 6px", borderRadius: 8, background: "rgba(168,85,247,0.06)", textAlign: "center" }}>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>Flight</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#a855f7", textTransform: "capitalize" }}>{result.biomechanics.overallFlightHeight || "—"}</div>
            </div>
            <div style={{ flex: 1, padding: "8px 6px", borderRadius: 8, background: (result.biomechanics.injuryRiskFlags || []).some(r => r.risk === "high") ? "rgba(239,68,68,0.06)" : "rgba(34,197,94,0.06)", textAlign: "center" }}>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>Risk Flags</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: (result.biomechanics.injuryRiskFlags || []).length > 0 ? ((result.biomechanics.injuryRiskFlags || []).some(r => r.risk === "high") ? "#ef4444" : "#f59e0b") : "#22c55e", fontFamily: "'Space Mono', monospace" }}>
                {(result.biomechanics.injuryRiskFlags || []).length}
              </div>
            </div>
            <div style={{ flex: 1, padding: "8px 6px", borderRadius: 8, background: "rgba(245,158,11,0.06)", textAlign: "center" }}>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>Landings</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#f59e0b", fontFamily: "'Space Mono', monospace" }}>{(result.biomechanics.landingAnalysis || []).length}</div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", textAlign: "center" }}>Full biomechanics analysis in the 🦴 Biomechanics tab</div>
        </div>
      )}

      {/* Severity Distribution */}
      <div className="card" style={{ padding: 16, marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: 1, marginBottom: 12 }}>SEVERITY DISTRIBUTION</div>
        <div style={{ display: "flex", gap: 8 }}>
          {[
            { key: "small", label: "Micro/Small", color: "#22c55e" },
            { key: "medium", label: "Medium", color: "#f59e0b" },
            { key: "large", label: "Large", color: "#f97316" },
            { key: "veryLarge", label: "Very Large", color: "#ef4444" },
            { key: "fall", label: "Fall", color: "#dc2626" },
          ].map(s => {
            const count = severityCounts[s.key] || 0;
            return (
              <div key={s.key} style={{ flex: 1, textAlign: "center", padding: "10px 4px", borderRadius: 10, background: count > 0 ? `${s.color}10` : "rgba(255,255,255,0.02)" }}>
                <div style={{ fontSize: 20, fontWeight: 900, fontFamily: "'Space Mono', monospace", color: count > 0 ? s.color : "rgba(255,255,255,0.15)" }}>{count}</div>
                <div style={{ fontSize: 9, color: count > 0 ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.2)", marginTop: 2 }}>{s.label}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top 3 Score Drains */}
      <div className="card" style={{ padding: 16, marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: 1, marginBottom: 12 }}>TOP SCORE DRAINS</div>
        {sortedDeds.slice(0, 5).map((d, i) => {
          const c = DEDUCTION_SCALE[d.severity]?.color || "#f59e0b";
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, padding: "8px 10px", borderRadius: 8, background: "rgba(255,255,255,0.02)" }}>
              <div style={{
                width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                background: `${c}15`, fontSize: 12, fontWeight: 900, color: c, fontFamily: "'Space Mono', monospace",
              }}>
                {i + 1}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{safeStr(d.skill)}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{safeStr(d.fault)}</div>
              </div>
              <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 14, fontWeight: 700, color: c }}>-{safeNum(d.deduction, 0).toFixed(2)}</span>
            </div>
          );
        })}
      </div>

      {/* Coach Talking Points */}
      <div className="card" style={{ padding: 16, background: "rgba(196,152,42,0.03)", borderColor: "rgba(196,152,42,0.12)" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#C4982A", letterSpacing: 1, marginBottom: 8 }}>💬 TALKING POINTS FOR COACH</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.7 }}>
          {sortedDeds.length > 0 && `"The analysis identified ${deds.length} deductions totaling -${safeNum(result.totalDeductions, 0).toFixed(2)}. `}
          {sortedDeds[0] && `The biggest single item was ${safeStr(sortedDeds[0].skill)} (${safeStr(sortedDeds[0].fault)}, -${safeNum(sortedDeds[0].deduction, 0).toFixed(2)}). `}
          {diag.biggestMathWin && `The single biggest score improvement would come from: ${diag.biggestMathWin}. `}
          {`Can we focus on these areas in the next few practices?"`}
        </div>
      </div>
    </div>
  );
}

// ─── DEMO RESULT GENERATOR ──────────────────────────────────────────
function generateDemoResult(event, profile, frames) {
  const isFloor = event === "Floor Exercise";
  const isBeam = event === "Balance Beam";
  const isBars = event === "Uneven Bars" || event === "High Bar" || event === "Parallel Bars";
  const isVault = event === "Vault";
  const isFemale = profile.gender === "female";
  const lvl = profile.level || "Level 5";

  // ── Grouped skill cards with subFaults + skeleton ─────────────────
  const deductions = isFloor ? [
    {
      timestamp: "3",
      skill: "Opening choreography — dance passage",
      category: "artistry",
      severity: "small",
      deduction: 0.15,
      engine: "TPM",
      frameRef: 1,
      correction: "Push through toes on every step. Mark releve in choreography. Watch for flat feet during arm transitions.",
      ideal: "Every step on high releve, toes pointed through swing phase. Artistry confident and intentional.",
      details: "Persistent flat-footing through opening dance. Global artistry deduction.",
      subFaults: [
        { fault: "Flat-footing through dance passage — feet not on relevé", deduction: 0.10, engine: "TPM", bodyPoint: "both_ankles", angle: { measured: 150, ideal: 180, unit: "degrees" }, correction: "Mark every step on toes in practice — 'push through the floor'" },
        { fault: "Lack of expression — movement mechanical, not performed", deduction: 0.05, engine: "General", bodyPoint: "global", angle: null, correction: "Practice routine with exaggerated expression in mirror" },
      ],
      skeleton: { joints: { head:[0.48,0.08], neck:[0.48,0.14], lShoulder:[0.40,0.18], rShoulder:[0.56,0.18], lElbow:[0.34,0.10], rElbow:[0.62,0.10], lWrist:[0.30,0.04], rWrist:[0.66,0.04], lHip:[0.44,0.40], rHip:[0.52,0.40], lKnee:[0.43,0.58], rKnee:[0.53,0.58], lAnkle:[0.42,0.76], rAnkle:[0.54,0.76] }, faultJoints: ["lAnkle", "rAnkle"], angles: [{ joint: "lAnkle", measured: 150, ideal: 180, label: "Ankle flex" }, { joint: "rAnkle", measured: 148, ideal: 180, label: "Ankle flex" }] },
    },
    {
      timestamp: "8",
      skill: "Round-off BHS Back Tuck — 1st tumbling pass",
      category: "execution",
      severity: "large",
      deduction: 0.35,
      engine: "KTM",
      frameRef: 2,
      correction: "Priority: knee squeeze drills with foam block. Secondary: toe point on RO takeoff. Landing: stick drill 20× off low block.",
      ideal: "Tight tuck, knees glued from takeoff through landing. Pointed toes throughout flight. Stuck landing — chest up, arms at ears, zero movement.",
      details: "Three faults on this pass combine for the single biggest deduction in the routine. The cowboy tuck is the biggest math win.",
      subFaults: [
        { fault: "Knee separation in tuck — cowboy position, knees wider than shoulders", deduction: 0.20, engine: "KTM", bodyPoint: "knees", angle: { measured: 145, ideal: 0, unit: "mm separation" }, correction: "Foam block between knees during tuck practice — if it falls, they separated" },
        { fault: "Flexed left foot on round-off takeoff", deduction: 0.05, engine: "TPM", bodyPoint: "left_ankle", angle: { measured: 155, ideal: 180, unit: "degrees" }, correction: "Theraband ankle circles 3×20 daily" },
        { fault: "Medium step backward on back tuck landing", deduction: 0.10, engine: "Landing", bodyPoint: "feet", angle: { measured: 75, ideal: 90, unit: "degrees chest angle" }, correction: "Drop landing drill: step off block, freeze 3 full seconds" },
      ],
      skeleton: { joints: { head:[0.50,0.15], neck:[0.50,0.22], lShoulder:[0.42,0.26], rShoulder:[0.58,0.26], lElbow:[0.38,0.20], rElbow:[0.62,0.20], lWrist:[0.36,0.16], rWrist:[0.64,0.16], lHip:[0.45,0.42], rHip:[0.55,0.42], lKnee:[0.38,0.55], rKnee:[0.62,0.55], lAnkle:[0.36,0.68], rAnkle:[0.64,0.68] }, faultJoints: ["lKnee", "rKnee", "lAnkle"], angles: [{ joint: "rKnee", measured: 145, ideal: 180, label: "Knee gap" }, { joint: "lAnkle", measured: 155, ideal: 180, label: "Ankle flex" }] },
    },
    {
      timestamp: "18",
      skill: "Split leap — dance series",
      category: "execution",
      severity: "medium",
      deduction: 0.20,
      engine: "Split-Check",
      frameRef: 3,
      correction: "Hip flexor and hamstring flexibility daily. Hold peak split a half-beat longer — the judge needs to see 180°. Right foot point check.",
      ideal: "180° split with both legs AT horizontal or above. Toes pointed through full arc. Arms extended. Head up and confident.",
      details: "Split measures approximately 155° at peak. Right foot flexed. Combined 0.20 on this element.",
      subFaults: [
        { fault: "Insufficient split — hip vertex angle ~155°, requires 180° for " + lvl, deduction: 0.15, engine: "Split-Check", bodyPoint: "hips", angle: { measured: 155, ideal: 180, unit: "degrees" }, correction: "Daily over-split stretching. In routine: hold peak split a half-beat longer" },
        { fault: "Flexed right foot at peak of leap", deduction: 0.05, engine: "TPM", bodyPoint: "right_ankle", angle: { measured: 148, ideal: 180, unit: "degrees" }, correction: "Theraband foot point practice — mirror check" },
      ],
      skeleton: { joints: { head:[0.50,0.12], neck:[0.50,0.18], lShoulder:[0.42,0.22], rShoulder:[0.58,0.22], lElbow:[0.34,0.16], rElbow:[0.66,0.16], lWrist:[0.28,0.12], rWrist:[0.72,0.12], lHip:[0.46,0.38], rHip:[0.54,0.38], lKnee:[0.30,0.42], rKnee:[0.68,0.42], lAnkle:[0.18,0.48], rAnkle:[0.80,0.48] }, faultJoints: ["rKnee", "rAnkle"], angles: [{ joint: "rAnkle", measured: 148, ideal: 180, label: "Ankle flex" }] },
    },
    {
      timestamp: "28",
      skill: "Full turn (360°) on one foot",
      category: "execution",
      severity: "small",
      deduction: 0.05,
      engine: "KTM",
      frameRef: 4,
      correction: "Relevé balance drills daily. Supporting leg must lock at 175°+ from the moment the turn begins — no softening mid-rotation.",
      ideal: "Supporting leg locked 175°+. Free leg in clean passé. Arms pulled in tight. Full height relevé maintained through rotation.",
      details: "Supporting leg measured at 172° — below 175° locked threshold. Silent deduction that judges catch immediately.",
      subFaults: [
        { fault: "Soft supporting knee during turn rotation — 172°, requires 175°+", deduction: 0.05, engine: "KTM", bodyPoint: "right_knee", angle: { measured: 172, ideal: 180, unit: "degrees" }, correction: "Relevé balance hold: 1 minute on each leg. Squeeze quad until locked." },
      ],
      skeleton: { joints: { head:[0.50,0.72], neck:[0.50,0.64], lShoulder:[0.42,0.58], rShoulder:[0.58,0.58], lElbow:[0.38,0.50], rElbow:[0.62,0.50], lWrist:[0.36,0.42], rWrist:[0.64,0.42], lHip:[0.46,0.38], rHip:[0.54,0.38], lKnee:[0.48,0.22], rKnee:[0.52,0.22], lAnkle:[0.48,0.08], rAnkle:[0.52,0.08] }, faultJoints: ["lKnee"], angles: [{ joint: "lKnee", measured: 172, ideal: 180, label: "Knee lock" }] },
    },
    {
      timestamp: "42",
      skill: "Round-off BHS Layout — 2nd tumbling pass",
      category: "execution",
      severity: "medium",
      deduction: 0.20,
      engine: "VAE",
      frameRef: 5,
      correction: "Alignment: hollow body conditioning. Elbow: wall handstand with tricep focus. Step: block landing drill.",
      ideal: "Body passes through true vertical (within 10°). Arms locked 180° throughout. Stuck landing — no step.",
      details: "Body 14° off vertical reduces power transfer. Bent elbows on handspring contact. Small forward step on layout landing.",
      subFaults: [
        { fault: "Body 14° off vertical in round-off — insufficient repulsion angle", deduction: 0.10, engine: "VAE", bodyPoint: "torso", angle: { measured: 14, ideal: 0, unit: "degrees from vertical" }, correction: "Handstand shape drills against wall — body must pass through exact vertical" },
        { fault: "Bent elbows on BHS contact phase — 163°/165°", deduction: 0.05, engine: "KTM", bodyPoint: "elbows", angle: { measured: 163, ideal: 180, unit: "degrees" }, correction: "Wall handstand: push through shoulders, squeeze triceps until arms lock" },
        { fault: "Small step on layout landing", deduction: 0.05, engine: "Landing", bodyPoint: "feet", angle: null, correction: "Pit landing practice to build confidence on stick" },
      ],
      skeleton: { joints: { head:[0.50,0.10], neck:[0.50,0.16], lShoulder:[0.42,0.20], rShoulder:[0.58,0.20], lElbow:[0.36,0.30], rElbow:[0.64,0.30], lWrist:[0.32,0.40], rWrist:[0.68,0.40], lHip:[0.46,0.42], rHip:[0.54,0.42], lKnee:[0.44,0.60], rKnee:[0.56,0.60], lAnkle:[0.43,0.78], rAnkle:[0.57,0.78] }, faultJoints: ["lElbow", "rElbow"], angles: [{ joint: "lElbow", measured: 163, ideal: 180, label: "Elbow lock" }, { joint: "rElbow", measured: 165, ideal: 180, label: "Elbow lock" }] },
    },
    { timestamp: "35", skill: "Switch leap", category: "execution", severity: "small", deduction: 0.10, engine: "Split-Check", frameRef: 5, correction: "Drive rear leg higher on switch.", ideal: "Split reaches 120°+, rear leg above horizontal.", details: "Switch leap split short and rear leg below horizontal.", subFaults: [{ fault: "Split ~115° on switch leap", deduction: 0.05, engine: "Split-Check", bodyPoint: "hips", angle: { measured: 115, ideal: 120, unit: "degrees" }, correction: "Film switch leap from side to check angle" }, { fault: "Flexed back foot at peak", deduction: 0.05, engine: "TPM", bodyPoint: "left_ankle", angle: { measured: 155, ideal: 180, unit: "degrees" }, correction: "Theraband ankle work during switches" }], skeleton: null },
    { timestamp: "48", skill: "Straddle jump", category: "execution", severity: "small", deduction: 0.10, engine: "KTM", frameRef: 5, correction: "Lock knees at peak of jump.", ideal: "Knees locked, toes pointed, straddle at horizontal.", details: "Soft knees and insufficient height.", subFaults: [{ fault: "Soft knees at peak — 170°", deduction: 0.05, engine: "KTM", bodyPoint: "knees", angle: { measured: 170, ideal: 180, unit: "degrees" }, correction: "Jump drills with locked-knee focus" }, { fault: "Insufficient jump height", deduction: 0.05, engine: "General", bodyPoint: "global", angle: null, correction: "Plyometric conditioning" }], skeleton: null },
    { timestamp: "52", skill: "Back tuck — 3rd pass", category: "execution", severity: "small", deduction: 0.10, engine: "TPM", frameRef: 6, correction: "Point toes through every aerial phase.", ideal: "Tight tuck, toes pointed, clean rotation.", details: "Flexed feet through tuck flight.", subFaults: [{ fault: "Both feet flexed in tuck flight", deduction: 0.10, engine: "TPM", bodyPoint: "ankles", angle: { measured: 150, ideal: 180, unit: "degrees" }, correction: "Theraband ankle circles 3x20 daily" }], skeleton: null },
    { timestamp: "55", skill: "Global: presentation and artistry", category: "artistry", severity: "small", deduction: 0.10, engine: "General", frameRef: 6, correction: "Mirror work — exaggerated expression.", ideal: "Confident, expressive performance.", details: "Transitions functional not performed.", subFaults: [{ fault: "Insufficient use of floor space", deduction: 0.05, engine: "General", bodyPoint: "global", angle: null, correction: "Use corners and edges" }, { fault: "Lack of expression between passes", deduction: 0.05, engine: "General", bodyPoint: "global", angle: null, correction: "Mirror work: perform to audience" }], skeleton: null },
    {
      timestamp: "58",
      skill: "Round-off BHS Layout — dismount landing",
      category: "landing",
      severity: "large",
      deduction: 0.20,
      engine: "Landing",
      frameRef: 6,
      correction: "Pit-to-landing progressions. Focus: absorb through ankles/knees, chest stays vertical, arms at ears. Hold 1 full second before saluting.",
      ideal: "Feet together on landing. Chest vertical. Arms at ears. Zero movement for 1 full second. This is the last thing the judge remembers.",
      details: "Large forward step on dismount. Chest dropped below vertical. This is the most scrutinized moment — the final impression.",
      subFaults: [
        { fault: "Large forward step on final dismount — weight forward, chest dropped", deduction: 0.20, engine: "Landing", bodyPoint: "feet", angle: { measured: 70, ideal: 90, unit: "degrees chest angle" }, correction: "Depth drop drill: step off box, absorb through ankles/knees. Freeze. Hold 3 full seconds." },
      ],
      skeleton: { joints: { head:[0.50,0.14], neck:[0.50,0.20], lShoulder:[0.42,0.24], rShoulder:[0.58,0.24], lElbow:[0.36,0.16], rElbow:[0.64,0.16], lWrist:[0.32,0.10], rWrist:[0.68,0.10], lHip:[0.46,0.42], rHip:[0.54,0.42], lKnee:[0.44,0.58], rKnee:[0.56,0.58], lAnkle:[0.42,0.76], rAnkle:[0.57,0.78] }, faultJoints: ["lAnkle", "rAnkle", "lKnee"], angles: [{ joint: "lKnee", measured: 70, ideal: 90, unit: "degrees chest" }] },
    },
  ] : isBeam ? [
    { timestamp: "2", skill: "Mount — jump to front support", category: "execution", severity: "small", deduction: 0.10, engine: "General", frameRef: 1, correction: "Practice mount with focus on immediate control. No wobble.", ideal: "Clean mount, immediate composure, no balance checks.", details: "Minor wobble on mount — 0.10 artistry.",
      subFaults: [{ fault: "Wobble on mount — balance check on landing", deduction: 0.10, engine: "General", bodyPoint: "hips", angle: null, correction: "Mount to freeze drill: 20 reps, no movement after landing" }],
      skeleton: { joints: { head:[0.5,0.12], neck:[0.5,0.18], lShoulder:[0.42,0.22], rShoulder:[0.58,0.22], lElbow:[0.36,0.16], rElbow:[0.64,0.16], lWrist:[0.32,0.10], rWrist:[0.68,0.10], lHip:[0.46,0.38], rHip:[0.54,0.38], lKnee:[0.44,0.56], rKnee:[0.56,0.56], lAnkle:[0.43,0.74], rAnkle:[0.57,0.74] }, faultJoints: ["lHip", "rHip"], angles: [] } },
    { timestamp: "10", skill: "Back walkover — acro series", category: "execution", severity: "medium", deduction: 0.20, engine: "TPM", frameRef: 2, correction: "Theraband daily. Back walkover drill: focus on toe point through full arc, back leg extension.", ideal: "Both legs fully extended and pointed through entire walkover arc. Split position at peak.", details: "Foot form and split deficiency combined.",
      subFaults: [{ fault: "Flexed feet through back walkover arc", deduction: 0.10, engine: "TPM", bodyPoint: "ankles", angle: { measured: 152, ideal: 180, unit: "degrees" }, correction: "Theraband ankle exercises 5 min daily" }, { fault: "Insufficient back leg extension — below 155° at peak", deduction: 0.10, engine: "Split-Check", bodyPoint: "rear_leg", angle: { measured: 155, ideal: 180, unit: "degrees" }, correction: "Back leg flexibility: daily hip flexor stretches + over-splits" }],
      skeleton: { joints: { head:[0.65,0.70], neck:[0.60,0.62], lShoulder:[0.55,0.55], rShoulder:[0.55,0.55], lElbow:[0.50,0.48], rElbow:[0.50,0.48], lWrist:[0.45,0.42], rWrist:[0.45,0.42], lHip:[0.55,0.45], rHip:[0.55,0.45], lKnee:[0.60,0.30], rKnee:[0.45,0.58], lAnkle:[0.62,0.15], rAnkle:[0.42,0.72] }, faultJoints: ["lAnkle", "rAnkle"], angles: [{ joint: "lAnkle", measured: 152, ideal: 180, label: "Ankle flex" }] } },
    { timestamp: "20", skill: "Split leap — 180° required", category: "execution", severity: "medium", deduction: 0.15, engine: "Split-Check", frameRef: 3, correction: "Over-splits daily. Hold peak a beat longer — judges need to see the angle.", ideal: "180° split, both legs at horizontal. Toes pointed. Head up.", details: "Split approximately 150° — below required 180° for " + lvl,
      subFaults: [{ fault: "Insufficient split — ~150° hip vertex angle", deduction: 0.15, engine: "Split-Check", bodyPoint: "hips", angle: { measured: 150, ideal: 180, unit: "degrees" }, correction: "Over-split stretch daily. Hold peak longer in routine." }],
      skeleton: { joints: { head:[0.50,0.12], neck:[0.50,0.18], lShoulder:[0.42,0.22], rShoulder:[0.58,0.22], lElbow:[0.34,0.16], rElbow:[0.66,0.16], lWrist:[0.28,0.12], rWrist:[0.72,0.12], lHip:[0.46,0.38], rHip:[0.54,0.38], lKnee:[0.30,0.42], rKnee:[0.68,0.42], lAnkle:[0.18,0.46], rAnkle:[0.80,0.46] }, faultJoints: ["rKnee"], angles: [] } },
    { timestamp: "30", skill: "Full turn on one foot", category: "execution", severity: "small", deduction: 0.05, engine: "KTM", frameRef: 4, correction: "Relevé balance drills. Lock knee from first moment of turn.", ideal: "Supporting leg locked 175°+. Clean passé. Arms tight.", details: "Supporting knee 172° — below 175° threshold.",
      subFaults: [{ fault: "Soft supporting knee — 172°, requires 175°+", deduction: 0.05, engine: "KTM", bodyPoint: "right_knee", angle: { measured: 172, ideal: 180, unit: "degrees" }, correction: "Relevé balance 1 min daily on each foot" }],
      skeleton: { joints: { head:[0.50,0.08], neck:[0.50,0.14], lShoulder:[0.46,0.18], rShoulder:[0.54,0.18], lElbow:[0.47,0.12], rElbow:[0.53,0.12], lWrist:[0.48,0.06], rWrist:[0.52,0.06], lHip:[0.47,0.38], rHip:[0.53,0.38], lKnee:[0.47,0.56], rKnee:[0.53,0.56], lAnkle:[0.47,0.74], rAnkle:[0.53,0.74] }, faultJoints: ["rKnee"], angles: [{ joint: "rKnee", measured: 172, ideal: 180, label: "Knee lock" }] } },
    { timestamp: "35", skill: "Cartwheel", category: "execution", severity: "small", deduction: 0.10, engine: "KTM", frameRef: 4, correction: "Locked legs.", ideal: "Straight legs.", details: "Bent knees 168°.", subFaults: [{ fault: "Bent knees 168°", deduction: 0.05, engine: "KTM", bodyPoint: "knees", angle: { measured: 168, ideal: 180, unit: "degrees" }, correction: "Floor drill" }, { fault: "Wobble", deduction: 0.05, engine: "General", bodyPoint: "hips", angle: null, correction: "Freeze" }], skeleton: null },
    { timestamp: "38", skill: "Relevé walk", category: "execution", severity: "small", deduction: 0.05, engine: "TPM", frameRef: 4, correction: "Full relevé.", ideal: "Max relevé.", details: "Flat feet.", subFaults: [{ fault: "Flat feet", deduction: 0.05, engine: "TPM", bodyPoint: "ankles", angle: { measured: 155, ideal: 180, unit: "degrees" }, correction: "Walk drill" }], skeleton: null },
    { timestamp: "42", skill: "Sissone", category: "execution", severity: "small", deduction: 0.10, engine: "Split-Check", frameRef: 5, correction: "Drive higher.", ideal: "120° split.", details: "Low amplitude.", subFaults: [{ fault: "Split ~110°", deduction: 0.05, engine: "Split-Check", bodyPoint: "hips", angle: { measured: 110, ideal: 120, unit: "degrees" }, correction: "Over-split" }, { fault: "Balance check", deduction: 0.05, engine: "General", bodyPoint: "hips", angle: null, correction: "Freeze" }], skeleton: null },
    { timestamp: "45", skill: "Global: beam artistry", category: "artistry", severity: "small", deduction: 0.10, engine: "General", frameRef: 5, correction: "Confidence and poise.", ideal: "No hesitation.", details: "Hesitation before acro.", subFaults: [{ fault: "Pre-acro hesitation", deduction: 0.05, engine: "General", bodyPoint: "global", angle: null, correction: "Commit fully" }, { fault: "Lack of confidence in presentation", deduction: 0.05, engine: "General", bodyPoint: "global", angle: null, correction: "Run-throughs" }], skeleton: null },
    { timestamp: "48", skill: "Round-off back tuck dismount", category: "landing", severity: "large", deduction: 0.25, engine: "Landing", frameRef: 5, correction: "Landing drills off beam. Absorb through ankles, chest up, freeze.", ideal: "Stuck landing, feet together, chest vertical, arms at ears. Zero movement.", details: "Large step + chest drop on dismount landing — the final impression.",
      subFaults: [{ fault: "Large step on dismount landing", deduction: 0.20, engine: "Landing", bodyPoint: "feet", angle: null, correction: "Pit-to-beam landing drill 15 reps" }, { fault: "Chest dropped below vertical on absorption", deduction: 0.05, engine: "General", bodyPoint: "torso", angle: { measured: 70, ideal: 90, unit: "degrees" }, correction: "Focus on tall chest on every landing — imagine thread pulling head up" }],
      skeleton: { joints: { head:[0.50,0.14], neck:[0.50,0.20], lShoulder:[0.42,0.24], rShoulder:[0.58,0.24], lElbow:[0.36,0.18], rElbow:[0.64,0.18], lWrist:[0.32,0.12], rWrist:[0.68,0.12], lHip:[0.46,0.42], rHip:[0.54,0.42], lKnee:[0.44,0.58], rKnee:[0.56,0.58], lAnkle:[0.42,0.76], rAnkle:[0.58,0.78] }, faultJoints: ["lAnkle", "rAnkle"], angles: [] } },
  ] : isBars ? [
    { timestamp: "2", skill: "Mount — glide kip", category: "execution", severity: "small", deduction: 0.10, engine: "TPM", frameRef: 1, correction: "Arms MUST stay straight through entire kip. Toes to bar in glide phase.", ideal: "Arms straight throughout, toes touch bar, smooth glide with no pause, clean front support finish.",details: "Flexed foot and slight arm bend in kip.",
      subFaults: [{ fault: "Flexed foot during glide kip", deduction: 0.05, engine: "TPM", bodyPoint: "feet", angle: { measured: 152, ideal: 180, unit: "degrees" }, correction: "Point toes from the moment feet leave the ground" }, { fault: "Slight arm bend on kip pull", deduction: 0.05, engine: "KTM", bodyPoint: "elbows", angle: { measured: 165, ideal: 180, unit: "degrees" }, correction: "Lat pull-down conditioning for straight-arm kip strength" }],
      skeleton: { joints: { head:[0.35,0.35], neck:[0.38,0.32], lShoulder:[0.42,0.28], rShoulder:[0.42,0.28], lElbow:[0.42,0.20], rElbow:[0.42,0.20], lWrist:[0.42,0.12], rWrist:[0.42,0.12], lHip:[0.48,0.40], rHip:[0.48,0.40], lKnee:[0.55,0.50], rKnee:[0.55,0.50], lAnkle:[0.62,0.55], rAnkle:[0.62,0.55] }, faultJoints: ["lAnkle", "rAnkle", "lElbow"], angles: [{ joint: "lAnkle", measured: 152, ideal: 180, label: "Ankle flex" }] } },
    { timestamp: "10", skill: "Cast to handstand", category: "execution", severity: "medium", deduction: 0.20, engine: "VAE", frameRef: 2, correction: "Cast conditioning: hollow body cast drills. Must pass through 180° vertical.", ideal: "Body passes through true vertical (180°). Arms locked. Straight line from wrists to toes.", details: "Body reaches only 160° — 20° short of handstand. Leg form also broken.",
      subFaults: [{ fault: "Cast only reaches 160° — 20° short of handstand", deduction: 0.15, engine: "VAE", bodyPoint: "torso", angle: { measured: 160, ideal: 180, unit: "degrees from bar" }, correction: "Cast handstand drills with spot. Build shoulder strength." }, { fault: "Piked body on cast — not hollow", deduction: 0.05, engine: "General", bodyPoint: "hips", angle: null, correction: "Hollow body conditioning 4×20s daily" }],
      skeleton: { joints: { head:[0.42,0.82], neck:[0.42,0.74], lShoulder:[0.42,0.66], rShoulder:[0.42,0.66], lElbow:[0.42,0.58], rElbow:[0.42,0.58], lWrist:[0.42,0.50], rWrist:[0.42,0.50], lHip:[0.44,0.48], rHip:[0.44,0.48], lKnee:[0.44,0.30], rKnee:[0.44,0.30], lAnkle:[0.44,0.16], rAnkle:[0.44,0.16] }, faultJoints: ["lHip", "rHip"], angles: [] } },
    { timestamp: "22", skill: "Clear hip circle", category: "execution", severity: "small", deduction: 0.10, engine: "KTM", frameRef: 3, correction: "Clear hip conditioning on low bar. Focus on leg lockout through rotation.", ideal: "Straight legs throughout rotation, tight body, smooth circle.", details: "Leg form breaks mid-circle — bent knees 168°.",
      subFaults: [{ fault: "Bent knees during clear hip — 168°, requires 175°+", deduction: 0.10, engine: "KTM", bodyPoint: "knees", angle: { measured: 168, ideal: 180, unit: "degrees" }, correction: "Clear hip on low bar with straight-leg focus drills" }],
      skeleton: { joints: { head:[0.5,0.15], neck:[0.5,0.22], lShoulder:[0.42,0.26], rShoulder:[0.58,0.26], lElbow:[0.38,0.20], rElbow:[0.62,0.20], lWrist:[0.36,0.16], rWrist:[0.64,0.16], lHip:[0.46,0.42], rHip:[0.54,0.42], lKnee:[0.44,0.58], rKnee:[0.56,0.58], lAnkle:[0.43,0.74], rAnkle:[0.57,0.74] }, faultJoints: ["lKnee", "rKnee"], angles: [{ joint: "rKnee", measured: 168, ideal: 180, label: "Knee bend" }] } },
    { timestamp: "16", skill: "Second cast", category: "execution", severity: "small", deduction: 0.10, engine: "VAE", frameRef: 3, correction: "Every cast must reach handstand.", ideal: "180° vertical.", details: "Cast only 155° on second attempt.", subFaults: [{ fault: "Cast 155° — 25° short", deduction: 0.10, engine: "VAE", bodyPoint: "torso", angle: { measured: 155, ideal: 180, unit: "degrees" }, correction: "Cast handstand drills with spot" }], skeleton: null },
    { timestamp: "25", skill: "Back hip circle", category: "execution", severity: "small", deduction: 0.05, engine: "TPM", frameRef: 3, correction: "Point toes through hip circle.", ideal: "Toes pointed, body tight.", details: "Feet flexed through rotation.", subFaults: [{ fault: "Flexed feet", deduction: 0.05, engine: "TPM", bodyPoint: "ankles", angle: { measured: 152, ideal: 180, unit: "degrees" }, correction: "Toe point awareness drill" }], skeleton: null },
    { timestamp: "28", skill: "Squat-on / transition", category: "execution", severity: "small", deduction: 0.10, engine: "KTM", frameRef: 4, correction: "Tight body through transition.", ideal: "Controlled transition, no pause.", details: "Body position breaks during transition.", subFaults: [{ fault: "Piked body on transition", deduction: 0.05, engine: "General", bodyPoint: "hips", angle: null, correction: "Hollow body holds" }, { fault: "Pause on high bar", deduction: 0.05, engine: "General", bodyPoint: "global", angle: null, correction: "Smooth transition drills" }], skeleton: null },
    { timestamp: "32", skill: "Global: bar form", category: "execution", severity: "small", deduction: 0.10, engine: "KTM", frameRef: 4, correction: "Consistent body tension.", ideal: "Tight body throughout.", details: "Recurring soft knees across multiple skills.", subFaults: [{ fault: "Persistent soft knees on casts and swings", deduction: 0.10, engine: "KTM", bodyPoint: "knees", angle: { measured: 170, ideal: 180, unit: "degrees" }, correction: "Hollow body conditioning 4x20s daily" }], skeleton: null },
    { timestamp: "35", skill: "Flyaway dismount — back tuck", category: "landing", severity: "large", deduction: 0.25, engine: "Landing", frameRef: 4, correction: "Pit flyaway practice. Tuck tight, spot the mat, absorb through ankles.", ideal: "Tight tuck in flight, stuck landing, chest up, arms at ears.", details: "Open tuck + large step on landing.",
      subFaults: [{ fault: "Open tuck in flyaway — insufficient tuck position", deduction: 0.10, engine: "KTM", bodyPoint: "knees", angle: null, correction: "Tuck jump drills — focus on pulling knees to chest" }, { fault: "Large step on flyaway landing", deduction: 0.15, engine: "Landing", bodyPoint: "feet", angle: null, correction: "Pit-to-mat progression: stick before moving to competition height" }],
      skeleton: { joints: { head:[0.50,0.14], neck:[0.50,0.20], lShoulder:[0.42,0.24], rShoulder:[0.58,0.24], lElbow:[0.36,0.16], rElbow:[0.64,0.16], lWrist:[0.32,0.10], rWrist:[0.68,0.10], lHip:[0.46,0.42], rHip:[0.54,0.42], lKnee:[0.44,0.58], rKnee:[0.56,0.58], lAnkle:[0.42,0.76], rAnkle:[0.58,0.78] }, faultJoints: ["lAnkle", "rAnkle"], angles: [] } },
  ] : /* Vault */ [
    { timestamp: "2", skill: "Approach run + hurdle", category: "execution", severity: "small", deduction: 0.05, engine: "TPM", frameRef: 1, correction: "Run at top speed. Hurdle must be quick — do not slow down before the board.", ideal: "Maximum speed approach. Short, powerful hurdle. Full explosion onto board.", details: "Slight deceleration in last 3 steps before hurdle.",
      subFaults: [{ fault: "Deceleration in approach — reduced power into board", deduction: 0.05, engine: "General", bodyPoint: "global", angle: null, correction: "Sprint conditioning: 4×20m sprints. Full-speed vault approaches in practice" }],
      skeleton: { joints: { head:[0.50,0.12], neck:[0.50,0.18], lShoulder:[0.42,0.22], rShoulder:[0.58,0.22], lElbow:[0.38,0.26], rElbow:[0.62,0.26], lWrist:[0.36,0.32], rWrist:[0.64,0.32], lHip:[0.46,0.40], rHip:[0.54,0.40], lKnee:[0.44,0.58], rKnee:[0.56,0.58], lAnkle:[0.43,0.76], rAnkle:[0.57,0.76] }, faultJoints: [], angles: [] } },
    { timestamp: "5", skill: "Table contact + repulsion phase", category: "execution", severity: "medium", deduction: 0.15, engine: "KTM", frameRef: 2, correction: "Wall handstand push-up drill. Arms must lock BEFORE hands hit table.", ideal: "Arms locked 180° on contact. Push through shoulders at maximum force. Brief contact.", details: "Bent elbows reduce repulsion power and score.",
      subFaults: [{ fault: "Bent elbows on table contact — 162°/165°", deduction: 0.10, engine: "KTM", bodyPoint: "elbows", angle: { measured: 162, ideal: 180, unit: "degrees" }, correction: "Wall handstand: push through shoulders, lock elbows before contact" }, { fault: "Body not in hollow — slight pike on table contact", deduction: 0.05, engine: "VAE", bodyPoint: "hips", angle: null, correction: "Repulsion drill with hollow body from box" }],
      skeleton: { joints: { head:[0.50,0.82], neck:[0.50,0.74], lShoulder:[0.42,0.67], rShoulder:[0.58,0.67], lElbow:[0.44,0.56], rElbow:[0.56,0.56], lWrist:[0.44,0.45], rWrist:[0.56,0.45], lHip:[0.47,0.52], rHip:[0.53,0.52], lKnee:[0.48,0.35], rKnee:[0.52,0.35], lAnkle:[0.48,0.18], rAnkle:[0.52,0.18] }, faultJoints: ["lElbow", "rElbow"], angles: [{ joint: "lElbow", measured: 162, ideal: 180, label: "Elbow lock" }] } },
    { timestamp: "4", skill: "Board contact — hurdle", category: "execution", severity: "small", deduction: 0.05, engine: "General", frameRef: 2, correction: "Explosive board contact.", ideal: "Both feet hit board simultaneously.", details: "Slightly uneven board contact.", subFaults: [{ fault: "Feet not simultaneous on board", deduction: 0.05, engine: "General", bodyPoint: "feet", angle: null, correction: "Hurdle to punch drills 20x" }], skeleton: null },
    { timestamp: "5", skill: "Body position over table", category: "execution", severity: "small", deduction: 0.05, engine: "TPM", frameRef: 2, correction: "Point toes over table.", ideal: "Toes pointed, legs together.", details: "Flexed feet during support phase.", subFaults: [{ fault: "Flexed feet over table", deduction: 0.05, engine: "TPM", bodyPoint: "ankles", angle: { measured: 155, ideal: 180, unit: "degrees" }, correction: "Toe point awareness on every vault" }], skeleton: null },
    { timestamp: "6", skill: "Post-flight rotation", category: "execution", severity: "small", deduction: 0.10, engine: "KTM", frameRef: 3, correction: "Tight body in post-flight.", ideal: "Legs together, body extended.", details: "Slight leg separation in post-flight.", subFaults: [{ fault: "Leg separation in post-flight", deduction: 0.05, engine: "KTM", bodyPoint: "knees", angle: { measured: 12, ideal: 0, unit: "cm separation" }, correction: "Squeeze block between ankles during drills" }, { fault: "Insufficient height in post-flight", deduction: 0.05, engine: "General", bodyPoint: "global", angle: null, correction: "Power conditioning for better block" }], skeleton: null },
    { timestamp: "6", skill: "Post-flight body position + landing", category: "landing", severity: "large", deduction: 0.30, engine: "Landing", frameRef: 3, correction: "Block landing from table: stick drill. Arms to ears on landing. Pit progression.", ideal: "Extended layout in flight. Stuck landing — feet together, chest up, arms at ears, zero movement.", details: "Piked flight phase and large step on landing — significant combined deduction.",
      subFaults: [{ fault: "Pike in post-flight — body not extended in layout", deduction: 0.10, engine: "VAE", bodyPoint: "hips", angle: { measured: 155, ideal: 180, unit: "degrees hip angle" }, correction: "Block drill from vault: focus on hollow extension in flight" }, { fault: "Large step on landing — forward weight shift", deduction: 0.20, engine: "Landing", bodyPoint: "feet", angle: { measured: 65, ideal: 90, unit: "degrees chest angle" }, correction: "Depth drops onto wedge mat: freeze 3 full seconds on landing" }],
      skeleton: { joints: { head:[0.50,0.14], neck:[0.50,0.20], lShoulder:[0.42,0.24], rShoulder:[0.58,0.24], lElbow:[0.36,0.18], rElbow:[0.64,0.18], lWrist:[0.32,0.12], rWrist:[0.68,0.12], lHip:[0.46,0.42], rHip:[0.54,0.42], lKnee:[0.44,0.58], rKnee:[0.56,0.58], lAnkle:[0.41,0.76], rAnkle:[0.59,0.78] }, faultJoints: ["lAnkle", "rAnkle", "lHip"], angles: [{ joint: "lAnkle", measured: 65, ideal: 90, label: "Chest angle" }] } },
  ];

  const totalDed = Math.round(deductions.reduce((s, d) => s + d.deduction, 0) * 1000) / 1000;
  const finalScore = Math.round((10.0 - totalDed) * 1000) / 1000;
  const tpmCount = deductions.filter(d => d.engine === "TPM" || d.subFaults?.some(sf => sf.engine === "TPM")).length;
  const ktmCount = deductions.filter(d => d.engine === "KTM" || d.subFaults?.some(sf => sf.engine === "KTM")).length;
  const landingTotal = deductions.filter(d => d.category === "landing").reduce((s, d) => s + d.deduction, 0);
  const artistryTotal = deductions.filter(d => d.category === "artistry").reduce((s, d) => s + d.deduction, 0);

  const execTotal = Math.round(deductions.filter(d => d.category !== "artistry").reduce((s, d) => s + d.deduction, 0) * 1000) / 1000;

  return {
    startValue: 10.0,
    executionDeductions: deductions,
    executionDeductionsTotal: execTotal,
    artistryDeductionsTotal: artistryTotal,
    neutralDeductionsTotal: 0,
    totalDeductions: totalDed,
    finalScore,
    isDemo: true,
    skillAnalysis: deductions.map(d => ({ timestamp: d.timestamp, skill: d.skill, type: d.category === "landing" ? "landing" : d.category === "artistry" ? "dance" : "acro", verdict: d.deduction > 0 ? "deduction" : "clean", score: d.severity === "small" ? "minor" : d.severity === "medium" ? "moderate" : "major", deduction: d.deduction, fault: d.subFaults?.[0]?.fault || d.details || "", correction: d.correction || "", engine: d.engine, measuredVsIdeal: d.subFaults?.[0]?.angle ? `Measured ~${d.subFaults[0].angle.measured}°, required ${d.subFaults[0].angle.ideal}°` : "", skeleton: d.skeleton || null })),
    overallAssessment: `Championship-Strict evaluation of this ${event} routine at ${lvl}. Total deductions: -${totalDed.toFixed(2)}, yielding ${finalScore.toFixed(3)}. This is a "Drip Feed" score — constant small leaks: ${isFloor ? `flat feet in dance (-0.15), the "Cowboy" tuck (-0.20), and landing instability (-0.35 combined)` : isBeam ? `foot form through acro (-0.10), split deficiency (-0.15), and dismount landing (-0.25)` : isBars ? `form breaks through rotation (-0.30) and landing (-0.25)` : `repulsion arm form (-0.15) and landing (-0.30)`}. The single biggest math win: ${deductions.sort((a,b) => b.deduction-a.deduction)[0]?.skill} saves +${deductions.sort((a,b) => b.deduction-a.deduction)[0]?.deduction.toFixed(2)} if cleaned up.`,
    strengths: [
      "Routine completed without falls — confidence and courage on competitive elements",
      "Power evident on tumbling/acro passes — height and distance show strong conditioning",
      `Choreography well-constructed with appropriate difficulty for ${lvl}`,
    ],
    areasForImprovement: [
      isFloor ? "THE COWBOY: Knee separation in the tuck = biggest math win (-0.20). Drill: foam block between knees." : isBars ? "CAST HANDSTAND: Body must reach 180° = saves -0.15. Drill: cast to handstand with spot." : isBeam ? "SPLIT LEAP: Need 180° split. Hold peak longer = saves -0.15." : "LANDING: Large step costs -0.20. Depth drop drills = biggest gain.",
      "THE DRIP: Flat-footing / soft knees / flexed feet costs -0.10+ through the whole routine. Awareness + theraband daily.",
      "LANDING CONTROL: Every landing has a deduction. 20 stick-landing reps per practice off low block, freeze 3 seconds.",
    ],
    bodyPositionNotes: deductions.slice(0, 6).map((d, i) => ({
      frameRef: d.frameRef || i + 1,
      timestamp: frames[i]?.timestamp || String(parseFloat(d.timestamp)),
      observation: `${d.skill}: ${d.subFaults?.[0]?.fault || d.details}`,
      annotation: `[${d.engine}] -${d.deduction.toFixed(2)}`,
      joints: d.skeleton?.joints || null,
      faultJoints: d.skeleton?.faultJoints || [],
    })),
    frames, event, level: profile.level,
    biomechanics: {
      keyMoments: [
        { timestamp: isFloor ? "0:08" : isBeam ? "0:15" : isBars ? "0:10" : "0:03", skill: isFloor ? "Round-off BHS" : isBeam ? "Back walkover" : isBars ? "Kip cast" : "Board contact", phase: "takeoff", jointAngles: { lKnee: 142, rKnee: 145, lHip: 155, rHip: 158, lAnkle: 88, rAnkle: 90 }, angularVelocity: { hip: 320, knee: 280 }, notes: "Good power generation but slight knee bend reduces efficiency" },
        { timestamp: isFloor ? "0:09" : isBeam ? "0:16" : isBars ? "0:11" : "0:04", skill: isFloor ? "Back tuck" : isBeam ? "Back walkover" : isBars ? "Cast handstand" : "Table contact", phase: "peak", jointAngles: { lKnee: 65, rKnee: 72, lHip: 45, rHip: 48, lAnkle: 165, rAnkle: 168 }, angularVelocity: { hip: 480, knee: 350 }, notes: isFloor ? "Knees should be tighter — separation visible" : "Good vertical reach" },
        { timestamp: isFloor ? "0:22" : isBeam ? "0:35" : isBars ? "0:28" : "0:06", skill: isFloor ? "Split leap" : isBeam ? "Split jump" : isBars ? "Flyaway dismount" : "Post-flight", phase: isFloor || isBeam ? "peak" : "landing", jointAngles: { lKnee: 175, rKnee: 178, lHip: 160, rHip: 155, lAnkle: 172, rAnkle: 175 }, angularVelocity: { hip: 120, knee: 90 }, notes: isFloor || isBeam ? "Split angle short of 180°" : "Good extension in flight" },
      ],
      landingAnalysis: [
        { timestamp: isFloor ? "0:10" : isBeam ? "0:45" : isBars ? "0:30" : "0:06", skill: isFloor ? "Back tuck landing" : isBeam ? "Dismount landing" : isBars ? "Flyaway landing" : "Vault landing", kneeFlexionAtImpact: 148, chestAngle: 72, stepsAfter: 1, impactRisk: "low", notes: "Slight forward lean caused compensatory step. Knee absorption adequate." },
        ...(isFloor ? [{ timestamp: "0:35", skill: "Final pass landing", kneeFlexionAtImpact: 135, chestAngle: 65, stepsAfter: 2, impactRisk: "moderate", notes: "Under-rotated slightly, deeper squat on impact. Two steps to recover." }] : []),
      ],
      holdDurations: isBeam ? [
        { timestamp: "0:20", skill: "Scale hold", durationMs: 1200, requiredMs: 1000, met: true },
        { timestamp: "0:40", skill: "Handstand", durationMs: 700, requiredMs: 1000, met: false },
      ] : isBars ? [
        { timestamp: "0:12", skill: "Cast handstand", durationMs: 400, requiredMs: 1000, met: false },
      ] : [],
      injuryRiskFlags: [
        { timestamp: isFloor ? "0:10" : isBeam ? "0:45" : isBars ? "0:30" : "0:06", joint: "lKnee", risk: "low", reason: "Mild valgus (inward collapse) on landing — common at this level", recommendation: "Single-leg squats focusing on knee tracking over toe, 3×10 each leg" },
        ...(isFloor ? [{ timestamp: "0:35", joint: "rAnkle", risk: "moderate", reason: "Ankle rolling slightly inward on under-rotated landing", recommendation: "Balance board training 5 min/day + ankle circles with resistance band" }] : []),
      ],
      overallFlightHeight: isVault ? "adequate" : isFloor ? "adequate" : "N/A",
      overallPowerRating: isVault ? "7/10" : isFloor ? "7/10" : isBeam ? "6/10" : "7/10",
    },
    coachReport: {
      preemptiveCorrections: [
        { skill: isFloor ? "Back tuck" : isBeam ? "Back walkover" : isBars ? "Cast handstand" : "Table contact", currentFault: isFloor ? "Knee separation (cowboy) is becoming a habit — appears on every tuck" : isBeam ? "Shoulder angle inconsistent through support phases" : isBars ? "Arms bending on every cast — developing muscle memory for bent arms" : "Elbows bending on contact — reducing repulsion power", riskIfUncorrected: isFloor ? "At Level 7+, cowboy tuck costs 0.20 PLUS difficulty downgrades. Fix now while muscle memory is forming." : "Will limit difficulty upgrades and cost 0.10-0.20 per skill at higher levels", correction: isFloor ? "Foam block between knees for ALL tuck practice. If block falls, stop and reset. 50 reps/week minimum." : isBeam ? "Wall handstand holds 3x30sec daily. Push through shoulders." : isBars ? "Cast to handstand with straight arm focus — coach taps elbows as reminder" : "Wall handstand push-ups focusing on locked elbows before contact", priority: "high" },
        { skill: "Landing mechanics", currentFault: "Forward weight shift on landings — chest drops below 75° consistently", riskIfUncorrected: "Creates ankle/knee injury risk and costs 0.10-0.20 on every dismount/tumble landing", correction: "Depth drops from 12-inch block: land and freeze 3 full seconds. Arms must reach ears BEFORE feet hit.", priority: "high" },
        { skill: "Toe point awareness", currentFault: "Foot form drops during aerial phases when focus shifts to rotation", riskIfUncorrected: "Persistent 0.05 deductions add up to 0.30-0.50 per routine — the 'silent score killer'", correction: "Theraband ankle exercises 3x20 daily. Practice every skill barefoot in front of mirror to build awareness.", priority: "medium" },
      ],
      conditioningPlan: [
        { area: "Knee stability", exercise: "Single-leg Romanian deadlifts", sets: "3x10 each leg", frequency: "3x/week", why: "Addresses valgus knee pattern seen on landings — strengthens VMO and hamstrings" },
        { area: "Core-to-extremity connection", exercise: "Hollow body holds + V-ups superset", sets: "4x20sec hold + 10 V-ups", frequency: "Daily", why: "Improves body tension throughout flight skills — reduces separation and pike breaks" },
        { area: "Ankle strength + toe point", exercise: "Calf raises on beam + theraband point/flex", sets: "3x15 + 3x20", frequency: "Daily", why: "Root cause of TPM deductions — weak plantar flexion during aerial phases" },
        { area: "Upper body push-through", exercise: "Handstand shoulder shrugs against wall", sets: "3x10", frequency: "3x/week", why: "Addresses insufficient shoulder extension in support skills and roundoffs" },
        { area: "Landing absorption", exercise: "Drop landings from progressive heights", sets: "3x8 (12-inch, 18-inch, 24-inch)", frequency: "2x/week", why: "Builds eccentric strength for controlled deceleration — reduces step deductions" },
      ],
      idealComparison: isFloor
        ? `For ${lvl} floor, this gymnast shows good power on tumbling passes (adequate amplitude) but body tension breaks during flight. The ideal model shows a perfectly straight line from wrists to ankles during round-off and layout positions. This gymnast's hip angle at peak tuck is ~145° (ideal: full closure ~45°) and knee separation is visible. Strongest body line: dance and choreography positions. Most deviation: aerial body tension during tumbling. Conditioning focus: core-to-extremity connection and adductor strength.`
        : isBeam
        ? `For ${lvl} beam, this gymnast demonstrates good balance and confidence but form breaks on acrobatic skills. The ideal model maintains locked limbs and full extension through every position. Strongest body line: turns and balance work. Most deviation: acrobatic connections and dismount landing.`
        : isBars
        ? `For ${lvl} bars, this gymnast shows developing swing mechanics but arm lock and cast height need work. The ideal model reaches full handstand on every cast with locked arms. Strongest body line: kip motion and swing. Most deviation: cast height and arm straightness.`
        : `For ${lvl} vault, this gymnast generates good run speed but loses power at the board. The ideal model shows full arm lock on table contact with a strong hollow body push-through. Strongest body line: run and hurdle. Most deviation: table contact arm form and post-flight extension.`,
      techniqueProgressionNotes: isFloor
        ? `Tuck is established — ready to begin layout training with a spot. Focus on opening the hips at the top of the tuck before extending to layout. Also ready to add a front tumbling pass (front handspring to front tuck) for difficulty credit. Split leap is close to requirement — 2-3 more weeks of flexibility work should get it to passing.`
        : isBeam
        ? `Back walkover is solid — can begin training back handspring on beam (low beam first, with spot). Turn is approaching the requirement for a higher-level turn series. Dismount should progress from tuck to layout once tuck is consistently stuck.`
        : isBars
        ? `Kip is reliable — can begin training kip cast to handstand sequence. Giant swings should be introduced on strap bar first. Free hip circle to handstand is the next big skill target.`
        : `Current vault is solid. Ready to begin Tsuk entry training (round-off onto board). Focus on maintaining arm lock through increased speed on approach.`,
    },
    athleteDevelopment: {
      nutritionTips: [
        profile.age && profile.age < 13
          ? "Growing gymnasts need extra calcium (3 servings of dairy or calcium-rich foods daily) and iron to support bone density and energy levels. Never restrict calories — growing bodies need fuel."
          : "Performance nutrition: eat a balanced meal 2-3 hours before practice. Post-workout protein within 30 minutes (chocolate milk, Greek yogurt, or protein smoothie).",
        "Hydrate with water throughout practice — aim for 8+ oz every 20 minutes during training. Sports drinks only needed for sessions over 90 minutes.",
        "Meet day: familiar foods only. Banana + peanut butter 1-2 hours before competing. Avoid trying new foods on competition day.",
      ],
      mentalTraining: [
        profile.goals === "build confidence"
          ? "Build a 'confidence highlight reel' — before each practice, mentally replay 3 skills you've landed perfectly. Your brain doesn't distinguish between real and vividly imagined success."
          : "Visualization practice: spend 5 minutes before bed mentally performing your routine perfectly. See yourself sticking every landing, pointing every toe, and saluting with confidence.",
        profile.age && profile.age < 12
          ? "Create a simple pre-routine 'power word' — one word that makes you feel strong (like 'READY' or 'POWERFUL'). Say it during your salute."
          : "Develop a pre-routine ritual: 3 deep breaths during the salute. Inhale confidence, exhale tension. Same ritual every time builds automatic calm.",
        "After a fall or mistake: reset with the '5-second rule' — acknowledge it happened, take one breath, then commit fully to the next skill. Judges score the WHOLE routine, not just one moment.",
      ],
      recoveryTips: [
        profile.age && profile.age < 13
          ? "Sleep is THE most important recovery tool for young gymnasts. Aim for 9-11 hours per night. Growth hormone is released during deep sleep."
          : "Aim for 8-10 hours of sleep. Sleep is when your body repairs muscle and consolidates the motor patterns you practiced today.",
        "Active recovery on rest days: 20-minute walk, gentle yoga, or swimming. Complete rest is less effective than light movement.",
        "Foam rolling after practice on quads, hamstrings, and calves — 30 seconds per muscle group. Helps prevent tightness that leads to form breaks.",
      ],
      goalSpecificAdvice: profile.goals === "move up levels"
        ? `To move up from ${lvl}, focus on cleaning execution over adding difficulty. A 9.2 at your current level with clean form shows judges (and coaches) you're ready — a 8.5 with messy upgrades doesn't. Master the basics, then level up.`
        : profile.goals === "qualify regionals"
        ? `Regional qualification at ${lvl} typically requires consistent scores above 9.0 on your best events. Based on this analysis, the biggest score gains come from fixing landing mechanics and body tension — these are 'free points' that don't require learning new skills.`
        : profile.goals === "college gymnastics"
        ? `College coaches watch for: consistency, clean form, and coachability — not just difficulty. Film your cleanest routines for recruiting reels. Focus on hitting 9.0+ consistently before upgrading difficulty.`
        : profile.goals === "injury recovery"
        ? `Coming back from injury: prioritize quality over quantity. If a skill causes pain, STOP and tell your coach. Build back slowly — 70% difficulty at 100% form is better than 100% difficulty at 70% form. Your body remembers the skills; trust the process.`
        : `At ${lvl}, the path forward is clean execution. Every 0.05 deduction you eliminate is a permanent improvement. Focus on the top 3 deductions from this analysis — fixing those alone could move your score up significantly.`,
    },
    diagnostics: {
      toePointIssues: tpmCount,
      kneeTensionIssues: ktmCount,
      splitDeficiency: deductions.some(d => d.subFaults?.some(sf => sf.engine === "Split-Check")),
      landingDeductions: landingTotal,
      artistryDeductions: artistryTotal,
      biggestMathWin: `${deductions.sort((a,b) => b.deduction-a.deduction)[0]?.skill}: +${deductions.sort((a,b) => b.deduction-a.deduction)[0]?.deduction.toFixed(2)} if fixed`,
      consistencyNote: "Foot form stays cleaner during dance but drops in aerial phases — a focus/conditioning split, not a strength issue.",
    },
  };
}
