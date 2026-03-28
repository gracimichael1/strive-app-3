/**
 * schema.js — Canonical output schema for the Strive scoring engine.
 *
 * This is the SINGLE SOURCE OF TRUTH for all data flowing from the AI pipeline
 * to the UI. Two data shapes:
 *
 * 1. Pass 1 Output — Skills, deductions (per-skill sub-array), score, coaching
 * 2. Pass 2 Output — Per-skill biomechanics, injury risk, elite comparison,
 *    corrective drills, plus training plan, mental performance, nutrition note
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * CANONICAL PIPELINE OUTPUT:
 * {
 *   routine_summary: { apparatus, d_score, e_score, final_score, total_deductions, ... }
 *   skills: [{ skill_name, deductions: [{ type, body_part, description, point_value }],
 *              biomechanics, injury_risk, elite_comparison, corrective_drill, ... }]
 *   training_plan: [{ priority, deduction_targeted, drill_name, ... }]
 *   mental_performance: { focus_indicators, consistency_patterns, athlete_recommendations }
 *   nutrition_note: string
 * }
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Runtime validation via validatePipelineResult().
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
 */
export function gradeSkill(totalDeduction) {
  const qg = 10.0 - Math.abs(totalDeduction || 0);
  const entry = gradeFromQuality(qg);
  return { grade: entry.grade, color: entry.color, label: entry.label };
}


// ─── Empty/default constructors ─────────────────────────────────────────────

export function emptyBiomechanics() {
  return {
    peak_joint_angles: { hips: 0, knees: 0, shoulders: 0 },
    body_line_score: 0,
    efficiency_rating: 0,
    notes: "",
  };
}

export function emptyInjuryRisk() {
  return {
    level: "low",
    body_part: "",
    description: "",
    prevention_note: "",
  };
}

export function emptyCorrectiveDrill() {
  return {
    name: "",
    description: "",
    sets_reps: "",
  };
}

export function emptyMentalPerformance() {
  return {
    focus_indicators: "",
    consistency_patterns: "",
    athlete_recommendations: "",
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
    total_deductions: typeof summary.total_deductions === "number" ? summary.total_deductions : 0,
    neutral_deductions: clampNum(summary.neutral_deductions, 0, 2.0),
    level: typeof summary.level === "string" ? summary.level : "",
    level_estimated: typeof summary.level_estimated === "string" ? summary.level_estimated : "",
    athlete_name: typeof summary.athlete_name === "string" ? summary.athlete_name : "",
    coaching_summary: typeof summary.coaching_summary === "string" ? summary.coaching_summary : "",
    celebrations: Array.isArray(summary.celebrations) ? summary.celebrations.filter(c => typeof c === "string").slice(0, 5) : [],
    top_3_fixes: Array.isArray(summary.top_3_fixes) ? summary.top_3_fixes.filter(f => typeof f === "string").slice(0, 3) : [],
    artistry: summary.artistry || null,
    confidence: summary.confidence || "MEDIUM",
    score_range: summary.score_range || null,
    raw_gemini_response: typeof summary.raw_gemini_response === "string" ? summary.raw_gemini_response : "",
  };

  // Validate skills array
  const rawSkills = Array.isArray(raw.skills) ? raw.skills : [];
  if (rawSkills.length === 0) warnings.push("No skills found in pipeline output");

  const skills = rawSkills.filter(s => s && typeof s === "object").map((s, i) => {
    if (!s.skill_name) warnings.push(`Skill ${i} has no name`);

    // Validate per-skill deductions sub-array
    const deductions = Array.isArray(s.deductions)
      ? s.deductions.map(d => ({
          type: typeof d.type === "string" ? d.type : "execution",
          body_part: typeof d.body_part === "string" ? d.body_part : "",
          description: typeof d.description === "string" ? d.description : "",
          point_value: typeof d.point_value === "number" ? snapToUSAG(d.point_value) : 0,
        }))
      : [];

    // Validate biomechanics (new canonical shape)
    const bio = s.biomechanics || {};
    const biomechanics = bio.peak_joint_angles ? {
      peak_joint_angles: {
        hips: typeof bio.peak_joint_angles?.hips === "number" ? bio.peak_joint_angles.hips : 0,
        knees: typeof bio.peak_joint_angles?.knees === "number" ? bio.peak_joint_angles.knees : 0,
        shoulders: typeof bio.peak_joint_angles?.shoulders === "number" ? bio.peak_joint_angles.shoulders : 0,
      },
      body_line_score: typeof bio.body_line_score === "number" ? bio.body_line_score : 0,
      efficiency_rating: typeof bio.efficiency_rating === "number" ? bio.efficiency_rating : 0,
      notes: typeof bio.notes === "string" ? bio.notes : "",
    } : (Array.isArray(s.biomechanics) ? convertLegacyBio(s.biomechanics) : emptyBiomechanics());

    // Validate injury_risk (new canonical shape)
    const ir = s.injury_risk || {};
    const injury_risk = typeof ir === "object" && ir.level ? {
      level: ["low", "medium", "high"].includes(ir.level) ? ir.level : "low",
      body_part: typeof ir.body_part === "string" ? ir.body_part : "",
      description: typeof ir.description === "string" ? ir.description : "",
      prevention_note: typeof ir.prevention_note === "string" ? ir.prevention_note : "",
    } : emptyInjuryRisk();

    // Validate corrective_drill
    const cd = s.corrective_drill || {};
    const corrective_drill = typeof cd === "object" && cd.name ? {
      name: typeof cd.name === "string" ? cd.name : "",
      description: typeof cd.description === "string" ? cd.description : "",
      sets_reps: typeof cd.sets_reps === "string" ? cd.sets_reps : "",
    } : emptyCorrectiveDrill();

    const deductionValue = typeof s.deduction_value === "number"
      ? snapToUSAG(s.deduction_value)
      : deductions.reduce((sum, d) => sum + d.point_value, 0);

    return {
      id: s.id || `skill_${i + 1}`,
      skill_name: s.skill_name || "Unknown Skill",
      skill_order: typeof s.skill_order === "number" ? s.skill_order : i + 1,
      timestamp: s.timestamp || formatTimestamp(s.timestamp_start),
      timestamp_start: typeof s.timestamp_start === "number" ? s.timestamp_start : parseTimestamp(s.timestamp),
      timestamp_end: typeof s.timestamp_end === "number" ? s.timestamp_end : 0,
      executed_successfully: typeof s.executed_successfully === "boolean" ? s.executed_successfully : true,
      difficulty_value: typeof s.difficulty_value === "number" ? s.difficulty_value : 0.10,
      deduction_value: deductionValue,
      deductions,
      quality_grade: typeof s.quality_grade === "number" ? s.quality_grade : (10.0 - deductionValue),
      narrative: typeof s.narrative === "string" ? s.narrative : "",
      reason: typeof s.reason === "string" ? s.reason : "",
      rule_reference: typeof s.rule_reference === "string" ? s.rule_reference : "",
      is_celebration: !!s.is_celebration,
      strength_note: typeof s.strength_note === "string" ? s.strength_note : (s.strength || ""),
      category: s.category || "ACRO",
      // Pass 2 enrichment
      biomechanics,
      injury_risk,
      elite_comparison: typeof s.elite_comparison === "string" ? s.elite_comparison : "",
      corrective_drill,
      // Legacy compat
      fault_observed: s.fault_observed || null,
      strength: s.strength || s.strength_note || null,
      correct_form: s.correct_form || null,
      injury_awareness: Array.isArray(s.injury_awareness) ? s.injury_awareness : [],
      targeted_drills: Array.isArray(s.targeted_drills) ? s.targeted_drills : [],
      gain_if_fixed: typeof s.gain_if_fixed === "number" ? s.gain_if_fixed : 0,
    };
  });

  // Validate special_requirements
  const specialReqs = Array.isArray(raw.special_requirements) ? raw.special_requirements : [];

  // Validate training_plan
  const trainingPlan = Array.isArray(raw.training_plan) ? raw.training_plan.map((tp, i) => ({
    priority: typeof tp.priority === "number" ? tp.priority : i + 1,
    deduction_targeted: typeof tp.deduction_targeted === "string" ? tp.deduction_targeted : "",
    drill_name: typeof tp.drill_name === "string" ? tp.drill_name : "",
    drill_description: typeof tp.drill_description === "string" ? tp.drill_description : "",
    frequency: typeof tp.frequency === "string" ? tp.frequency : "",
    expected_improvement: typeof tp.expected_improvement === "string" ? tp.expected_improvement : "",
  })) : [];

  // Validate mental_performance
  const mp = raw.mental_performance || {};
  const mental_performance = {
    focus_indicators: typeof mp.focus_indicators === "string" ? mp.focus_indicators : "",
    consistency_patterns: typeof mp.consistency_patterns === "string" ? mp.consistency_patterns : "",
    athlete_recommendations: typeof mp.athlete_recommendations === "string" ? mp.athlete_recommendations : "",
  };

  // Validate nutrition_note
  const nutrition_note = typeof raw.nutrition_note === "string" ? raw.nutrition_note : "";

  return {
    result: {
      routine_summary,
      skills,
      special_requirements: specialReqs,
      training_plan: trainingPlan,
      mental_performance,
      nutrition_note,
      _meta: raw._meta || {},
    },
    warnings,
  };
}


// ─── Legacy biomechanics conversion ─────────────────────────────────────────

function convertLegacyBio(bioArray) {
  if (!Array.isArray(bioArray) || bioArray.length === 0) return emptyBiomechanics();

  const find = (keyword) => {
    const match = bioArray.find(b => b.label && b.label.toLowerCase().includes(keyword));
    return match?.actual_degrees || match?.actual || 0;
  };

  return {
    peak_joint_angles: {
      hips: find("hip"),
      knees: find("knee"),
      shoulders: find("shoulder"),
    },
    body_line_score: 0,
    efficiency_rating: 0,
    notes: bioArray.map(b => `${b.label}: ${b.actual_degrees || b.actual}° (ideal ${b.ideal_degrees || b.ideal}°)`).join("; "),
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
  if (typeof ts === "number") return ts;
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
