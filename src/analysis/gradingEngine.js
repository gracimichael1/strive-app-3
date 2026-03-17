/**
 * gradingEngine.js
 *
 * STRIVE Grading System — converts letter grades to deductions
 * and computes final score from code, never from AI output.
 *
 * WHY THIS EXISTS:
 *   Gemini is accurate at observing and grading gymnastics.
 *   It is not reliable at computing math. Score computation
 *   is done here in deterministic code from the grade output.
 *
 * GRADE SCALE (aligned to USA Gymnastics execution scoring):
 *   A+ / A / A-   = Excellent — minimal visible faults
 *   B+ / B / B-   = Good — minor form breaks
 *   C+ / C / C-   = Needs work — noticeable errors
 *   D+ / D        = Significant errors or incomplete skill
 *   F             = Fall or major break (0.50 minimum)
 */

// ─── Grade → deduction mapping ─────────────────────────────────────────────

export const GRADE_DEDUCTIONS = {
  "A+": 0.00,
  "A":  0.03,
  "A-": 0.05,
  "B+": 0.08,
  "B":  0.10,
  "B-": 0.15,
  "C+": 0.18,
  "C":  0.20,
  "C-": 0.25,
  "D+": 0.30,
  "D":  0.40,
  "F":  0.50,
};

// Grade → display color
export const GRADE_COLORS = {
  "A+": "#22C55E", "A": "#22C55E", "A-": "#4ADE80",
  "B+": "#86EFAC", "B": "#F59E0B", "B-": "#F59E0B",
  "C+": "#FB923C", "C": "#F97316", "C-": "#EF4444",
  "D+": "#DC2626", "D": "#DC2626",
  "F":  "#7C3AED",
};

// Grade → background (pill badges)
export const GRADE_BG = {
  "A+": "rgba(34,197,94,0.15)",  "A": "rgba(34,197,94,0.12)",  "A-": "rgba(34,197,94,0.10)",
  "B+": "rgba(134,239,172,0.12)","B": "rgba(245,158,11,0.15)", "B-": "rgba(245,158,11,0.12)",
  "C+": "rgba(251,146,60,0.15)", "C": "rgba(249,115,22,0.15)", "C-": "rgba(239,68,68,0.12)",
  "D+": "rgba(220,38,38,0.15)",  "D": "rgba(220,38,38,0.15)",
  "F":  "rgba(124,58,237,0.15)",
};

// Grade → descriptive label
export const GRADE_LABEL = {
  "A+": "Perfect",       "A": "Excellent",  "A-": "Very Good",
  "B+": "Good+",         "B": "Good",       "B-": "Good−",
  "C+": "Average+",      "C": "Average",    "C-": "Below Average",
  "D+": "Needs Work",    "D": "Poor",
  "F":  "Fall / Major Break",
};

// Normalize Gemini-returned grade strings (handles "B+", "B plus", "b+", "8.5/10", etc.)
export function normalizeGrade(raw) {
  if (!raw) return "B";
  const s = String(raw).trim().toUpperCase();

  // Already a valid grade
  if (GRADE_DEDUCTIONS[s] !== undefined) return s;

  // Handle "B PLUS", "B MINUS", "A PLUS" etc.
  const wordFixed = s.replace(/\s+PLUS/, "+").replace(/\s+MINUS/, "-");
  if (GRADE_DEDUCTIONS[wordFixed] !== undefined) return wordFixed;

  // Handle numeric conversion (e.g. "9.2/10", "8.5")
  const numMatch = s.match(/(\d+\.?\d*)/);
  if (numMatch) {
    const n = parseFloat(numMatch[1]);
    const score = n > 10 ? n / 10 : n;
    if (score >= 9.7)  return "A+";
    if (score >= 9.3)  return "A";
    if (score >= 9.0)  return "A-";
    if (score >= 8.7)  return "B+";
    if (score >= 8.3)  return "B";
    if (score >= 8.0)  return "B-";
    if (score >= 7.7)  return "C+";
    if (score >= 7.3)  return "C";
    if (score >= 7.0)  return "C-";
    if (score >= 6.0)  return "D+";
    if (score >= 5.0)  return "D";
    return "F";
  }

  // Handle letter without +/-
  if (s.startsWith("A")) return "A";
  if (s.startsWith("B")) return "B";
  if (s.startsWith("C")) return "C";
  if (s.startsWith("D")) return "D";
  if (s.startsWith("F")) return "F";

  return "B"; // Safe fallback
}

/**
 * Get deduction amount for a grade.
 * Caps at element-level max if provided from the dictionary.
 */
export function gradeToDeduction(grade, maxFromDictionary = null) {
  const normalized = normalizeGrade(grade);
  let ded = GRADE_DEDUCTIONS[normalized] ?? 0.10;
  if (maxFromDictionary !== null) ded = Math.min(ded, maxFromDictionary);
  return Math.round(ded * 100) / 100;
}

/**
 * Compute the final score from a list of graded skills.
 *
 * @param {Array}  gradedSkills  — output from gradeToSkillAnalysis()
 * @param {number} startValue    — 10.0 for JO/Xcel, varies for Elite
 * @returns {{ finalScore, totalDeductions, executionTotal, artistry, breakdown }}
 */
export function computeScore(gradedSkills, startValue = 10.0) {
  let executionTotal = 0;
  let artistryTotal  = 0;

  const breakdown = gradedSkills.map(skill => {
    const ded = gradeToDeduction(skill.grade);
    if (skill.category === "artistry") {
      artistryTotal = Math.round((artistryTotal + ded) * 100) / 100;
    } else {
      executionTotal = Math.round((executionTotal + ded) * 100) / 100;
    }
    return {
      ...skill,
      computedDeduction: ded,
    };
  });

  const totalDeductions = Math.round((executionTotal + artistryTotal) * 100) / 100;
  const finalScore = Math.max(0, Math.round((startValue - totalDeductions) * 1000) / 1000);

  return { finalScore, totalDeductions, executionTotal, artistryTotal, breakdown };
}

/**
 * Determine start value based on level and program.
 * Levels 1–10, all Xcel = 10.0
 * Elite = 10.0 (E-score component only — D-score separate)
 */
export function getStartValue(level = "") {
  return 10.0; // All current levels use 10.0 execution base
}

/**
 * Convert Gemini's raw graded skill list into the structured format
 * used throughout the app, merging with element dictionary data if available.
 *
 * @param {Array}  rawSkills  — Gemini's output array
 * @param {string} level      — athlete's level
 * @param {string} event      — event (floor, beam, etc.)
 * @returns {Array<GradedSkill>}
 */
export function processGradedSkills(rawSkills, level = "", event = "") {
  if (!Array.isArray(rawSkills)) return [];

  return rawSkills.map((s, idx) => {
    const grade      = normalizeGrade(s.grade);
    const deduction  = gradeToDeduction(grade);
    const color      = GRADE_COLORS[grade] || "#C4982A";
    const bg         = GRADE_BG[grade]     || "rgba(196,152,42,0.1)";
    const label      = GRADE_LABEL[grade]  || "";

    // Parse timestamp to seconds
    const sec = parseTimestamp(s.timestamp || s.time || "0:00");

    return {
      id:            `skill_${idx}`,
      index:         idx + 1,
      skill:         String(s.skill || s.name || "Skill"),
      timestamp:     s.timestamp || s.time || "0:00",
      timestampSec:  sec,
      type:          s.type || "acro",
      category:      s.category || (["leap","jump","turn","dance","artistry","choreography"].some(t => (s.type || "").includes(t)) ? "artistry" : "execution"),
      grade,
      gradeDeduction: deduction,
      gradeColor:    color,
      gradeBg:       bg,
      gradeLabel:    label,

      // Fault and strength observations from Gemini
      faults:    Array.isArray(s.faults)    ? s.faults    : s.faults    ? [s.faults]    : [],
      strengths: Array.isArray(s.strengths) ? s.strengths : s.strengths ? [s.strengths] : [],
      coachNote: s.coachNote || s.note || "",

      // Frame data — populated after client-side capture
      frameDataUrl:   null,
      skeletonJoints: null,
    };
  });
}

function parseTimestamp(ts) {
  if (!ts || typeof ts !== "string") return 0;
  const first = ts.split(/[,\-]/)[0].trim();
  if (!first || first.toLowerCase() === "global") return 0;
  const parts = first.split(":");
  if (parts.length === 2) return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  const n = parseFloat(first);
  return isNaN(n) ? 0 : n;
}

/**
 * Build a summary grade for the whole routine.
 * Weighted: acro skills count more than dance/turns.
 */
export function computeOverallGrade(gradedSkills) {
  if (!gradedSkills.length) return "B";

  const weights = { acro: 2, dance: 1, turn: 1, mount: 1, dismount: 2, landing: 1.5, connection: 0.5, default: 1 };
  let totalWeight = 0;
  let weightedDeductions = 0;

  gradedSkills.forEach(s => {
    const w = weights[s.type] || weights.default;
    totalWeight += w;
    weightedDeductions += gradeToDeduction(s.grade) * w;
  });

  const avgDed = totalWeight > 0 ? weightedDeductions / totalWeight : 0.10;

  // Convert average deduction back to a grade
  if (avgDed <= 0.01) return "A+";
  if (avgDed <= 0.04) return "A";
  if (avgDed <= 0.06) return "A-";
  if (avgDed <= 0.09) return "B+";
  if (avgDed <= 0.12) return "B";
  if (avgDed <= 0.16) return "B-";
  if (avgDed <= 0.19) return "C+";
  if (avgDed <= 0.22) return "C";
  if (avgDed <= 0.27) return "C-";
  if (avgDed <= 0.35) return "D+";
  if (avgDed <= 0.45) return "D";
  return "F";
}
