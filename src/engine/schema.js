/**
 * schema.js — Canonical output schema for the Strive scoring engine.
 *
 * This is the SINGLE SOURCE OF TRUTH for all data flowing from the AI pipeline
 * to the UI. The schema matches what Gemini returns via structured JSON output.
 *
 * Two data shapes:
 * 1. Scorecard — Pass 1 output (skills, deductions, score, coaching)
 * 2. SkillDetail — Pass 2 output (biomechanics, drills, injury, per-skill)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * Runtime validation via validatePipelineResult().
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ─── Enums ──────────────────────────────────────────────────────────────────

export const Apparatus = {
  FLOOR: "floor_exercise",
  BEAM: "balance_beam",
  BARS: "uneven_bars",
  VAULT: "vault",
  POMMEL: "pommel_horse",
  RINGS: "still_rings",
  PARALLEL_BARS: "parallel_bars",
  HIGH_BAR: "high_bar",
};

export const Severity = {
  SMALL: "small",
  MEDIUM: "medium",
  LARGE: "large",
  VERY_LARGE: "veryLarge",
  FALL: "fall",
};

// ─── Valid deduction values (USAG 0.05 increments + fall) ───────────────────

export const VALID_DEDUCTIONS = [0.00, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.50];

/**
 * Snap a deduction value to the nearest USAG-valid increment.
 */
export function snapToUSAG(val) {
  if (typeof val !== "number" || isNaN(val)) return 0;
  const abs = Math.abs(val);
  if (abs >= 0.40) return 0.50; // Fall
  // Round to nearest 0.05
  return Math.round(abs * 20) / 20;
}

/**
 * Derive severity from deduction value.
 */
export function severityFromDeduction(val) {
  const abs = Math.abs(val || 0);
  if (abs >= 0.50) return Severity.FALL;
  if (abs >= 0.30) return Severity.VERY_LARGE;
  if (abs >= 0.20) return Severity.LARGE;
  if (abs >= 0.10) return Severity.MEDIUM;
  return Severity.SMALL;
}


// ─── Grade System ───────────────────────────────────────────────────────────
// Maps quality_grade (10.0 - deductions) to letter grade + color + label

const GRADE_MAP = [
  { min: 9.95, grade: "A",  label: "Excellent",  color: "#22c55e" },
  { min: 9.80, grade: "A-", label: "Very Good",   color: "#22c55e" },
  { min: 9.60, grade: "B+", label: "Good",        color: "#84cc16" },
  { min: 9.40, grade: "B",  label: "Solid",       color: "#84cc16" },
  { min: 9.20, grade: "B-", label: "Fair",        color: "#eab308" },
  { min: 9.00, grade: "C+", label: "Needs Work",  color: "#f97316" },
  { min: 8.80, grade: "C",  label: "Average",     color: "#f97316" },
  { min: 8.50, grade: "C-", label: "Below Avg",   color: "#f97316" },
  { min: 8.00, grade: "D+", label: "Needs Work",  color: "#ef4444" },
  { min: 7.00, grade: "D",  label: "Poor",        color: "#ef4444" },
  { min: 0,    grade: "F",  label: "Fall",         color: "#a855f7" },
];

/**
 * Get letter grade, label, and color from a quality_grade value.
 * quality_grade = 10.0 - total_deductions_for_this_skill
 */
export function gradeFromQuality(qualityGrade) {
  const qg = typeof qualityGrade === "number" ? qualityGrade : 10.0;
  for (const entry of GRADE_MAP) {
    if (qg >= entry.min) return entry;
  }
  return GRADE_MAP[GRADE_MAP.length - 1];
}

/**
 * Get letter grade from total deduction amount.
 * (Legacy compat — same as gradeFromQuality but takes deduction instead)
 */
export function gradeSkill(totalDeduction) {
  const qg = 10.0 - Math.abs(totalDeduction || 0);
  const entry = gradeFromQuality(qg);
  return { grade: entry.grade, color: entry.color, label: entry.label };
}


// ─── Empty/default constructors ─────────────────────────────────────────────

export function emptyBiomechanics() {
  return [];
}

export function emptyInjuryRisk() {
  return {
    level: "none",
    body_part: null,
    description: null,
    prevention_note: null,
  };
}

export function emptyMentalPerformance() {
  return {
    consistency_score: 0,
    focus_indicators: "",
    patterns_observed: "",
    recommendations: "",
  };
}

export function emptyNutritionRecovery() {
  return {
    training_load_assessment: "",
    nutrition_note: "Stay hydrated and eat a balanced meal with protein within 30 minutes of practice.",
    recovery_priority: "",
  };
}


// ─── Runtime Validation ─────────────────────────────────────────────────────

/**
 * Validate and sanitize a pipeline result. Fills missing fields with defaults.
 * Never throws — always returns a valid shape.
 *
 * @param {any} raw - Raw pipeline result
 * @returns {{ result: Object, warnings: string[] }}
 */
export function validatePipelineResult(raw) {
  const warnings = [];

  if (!raw || typeof raw !== "object") {
    warnings.push("Pipeline returned non-object result");
    raw = {};
  }

  // Validate routine_summary
  const summary = raw.routine_summary || {};
  const routine_summary = {
    apparatus: typeof summary.apparatus === "string" ? summary.apparatus : "unknown",
    duration_seconds: typeof summary.duration_seconds === "number" ? summary.duration_seconds : 0,
    d_score: typeof summary.d_score === "number" ? summary.d_score : 10.0,
    e_score: typeof summary.e_score === "number" ? summary.e_score : 0,
    final_score: typeof summary.final_score === "number" ? summary.final_score : 0,
    neutral_deductions: clampNum(summary.neutral_deductions, 0, 2.0),
    level: typeof summary.level === "string" ? summary.level : "",
    athlete_name: typeof summary.athlete_name === "string" ? summary.athlete_name : "",
    coaching_summary: typeof summary.coaching_summary === "string" ? summary.coaching_summary : "",
    celebrations: Array.isArray(summary.celebrations) ? summary.celebrations.filter(c => typeof c === "string").slice(0, 5) : [],
    top_3_fixes: Array.isArray(summary.top_3_fixes) ? summary.top_3_fixes.filter(f => typeof f === "string").slice(0, 3) : [],
    artistry: summary.artistry || null,
    confidence: summary.confidence || "MEDIUM",
    score_range: summary.score_range || null,
    raw_gemini_response: typeof summary.raw_gemini_response === "string" ? summary.raw_gemini_response : "",
  };

  // Validate skills array (from deduction_log)
  const rawSkills = Array.isArray(raw.skills) ? raw.skills : [];
  if (rawSkills.length === 0) warnings.push("No skills found in pipeline output");

  const skills = rawSkills.filter(s => s && typeof s === "object").map((s, i) => {
    if (!s.skill_name && !s.skill) {
      warnings.push(`Skill ${i} has no name`);
    }

    return {
      id: s.id || `skill_${i + 1}`,
      skill_name: s.skill_name || s.skill || "Unknown Skill",
      timestamp: s.timestamp || "0:00",
      timestamp_end: s.timestamp_end || null,
      timestamp_seconds: s.timestamp_seconds || parseTimestamp(s.timestamp),
      quality_grade: typeof s.quality_grade === "number" ? s.quality_grade : 10.0,
      deduction_value: typeof s.deduction_value === "number" ? snapToUSAG(s.deduction_value) : 0,
      reason: typeof s.reason === "string" ? s.reason : "",
      rule_reference: typeof s.rule_reference === "string" ? s.rule_reference : "",
      is_celebration: !!s.is_celebration,
      category: s.category || "ACRO",
      // Pass 2 enrichment (filled after merge)
      biomechanics: Array.isArray(s.biomechanics) ? s.biomechanics : [],
      fault_observed: s.fault_observed || null,
      strength: s.strength || null,
      correct_form: s.correct_form || null,
      injury_awareness: Array.isArray(s.injury_awareness) ? s.injury_awareness : [],
      targeted_drills: Array.isArray(s.targeted_drills) ? s.targeted_drills : [],
      gain_if_fixed: typeof s.gain_if_fixed === "number" ? s.gain_if_fixed : 0,
    };
  });

  // Validate special_requirements
  const specialReqs = Array.isArray(raw.special_requirements) ? raw.special_requirements : [];

  return {
    result: {
      routine_summary,
      skills,
      special_requirements: specialReqs,
      training_plan: Array.isArray(raw.training_plan) ? raw.training_plan : [],
      mental_performance: raw.mental_performance || emptyMentalPerformance(),
      nutrition_recovery: raw.nutrition_recovery || emptyNutritionRecovery(),
      _meta: raw._meta || {},
    },
    warnings,
  };
}


// ─── Helpers ────────────────────────────────────────────────────────────────

function clampNum(val, min, max) {
  if (typeof val !== "number" || isNaN(val)) return min;
  return Math.max(min, Math.min(max, val));
}

/**
 * Parse "M:SS" timestamp to seconds.
 */
export function parseTimestamp(ts) {
  if (typeof ts !== "string") return 0;
  const parts = ts.split(":").map(Number);
  if (parts.length === 2) return (parts[0] || 0) * 60 + (parts[1] || 0);
  if (parts.length === 3) return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
  return 0;
}

/**
 * Format seconds to "M:SS" string.
 */
export function formatTimestamp(seconds) {
  if (typeof seconds !== "number" || isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
