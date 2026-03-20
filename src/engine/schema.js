/**
 * schema.js — Canonical output schema for the Strive scoring engine.
 *
 * This is the SINGLE SOURCE OF TRUTH for all data flowing from the AI pipeline
 * to the UI. Every field is documented. Every component reads from this shape.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * TypeScript-equivalent interface documented in JSDoc below.
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

export const InjuryLevel = {
  NONE: "none",
  LOW: "low",
  MODERATE: "moderate",
  HIGH: "high",
};

export const Efficiency = {
  EXCELLENT: "excellent",
  GOOD: "good",
  NEEDS_WORK: "needs_work",
};

export const ShoulderAlignment = {
  ALIGNED: "aligned",
  DEVIATED_LEFT: "deviated_left",
  DEVIATED_RIGHT: "deviated_right",
};

// ─── Valid deduction values (USAG 0.05 increments + fall) ───────────────────

export const VALID_DEDUCTIONS = [0.00, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.50];

// ─── Schema shape (for runtime validation) ──────────────────────────────────

/**
 * @typedef {Object} Deduction
 * @property {string} type - Machine-readable fault type (e.g. "bent_knees", "flexed_feet", "fall")
 * @property {string} description - Parent-friendly description of the fault
 * @property {number} point_value - Deduction amount (0.05 increments: 0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.50)
 * @property {string} body_part - Affected body part (e.g. "left_knee", "both_feet", "torso")
 * @property {string} severity - "small" | "medium" | "large" | "veryLarge" | "fall"
 */

/**
 * @typedef {Object} Biomechanics
 * @property {number|null} hip_angle_at_peak - Hip angle in degrees at peak of skill (null if not measurable)
 * @property {number|null} knee_angle_at_peak - Knee angle in degrees at peak (null if not measurable)
 * @property {string} shoulder_alignment - "aligned" | "deviated_left" | "deviated_right"
 * @property {number} body_line_score - 0-10 rating of body line quality
 * @property {string} efficiency_rating - "excellent" | "good" | "needs_work"
 * @property {string} elite_comparison - One sentence comparing to elite standard, parent-friendly
 */

/**
 * @typedef {Object} InjuryRisk
 * @property {string} level - "none" | "low" | "moderate" | "high"
 * @property {string|null} body_part - Affected body part, or null if no risk
 * @property {string|null} description - What the risk is, or null
 * @property {string|null} prevention_note - How to prevent, or null
 */

/**
 * @typedef {Object} Skill
 * @property {string} id - Unique identifier (e.g. "skill_1", "skill_2")
 * @property {string} skill_name - Human-readable skill name (e.g. "Round-off Back Handspring Back Tuck")
 * @property {string} skill_code - USAG difficulty code: "A", "B", "C", "D", "E", or "SR" for special requirement
 * @property {number} timestamp_start - Start time in seconds from video start
 * @property {number} timestamp_end - End time in seconds from video start
 * @property {boolean} executed_successfully - Whether the skill was completed (false = fall/incomplete)
 * @property {number} difficulty_value - Difficulty value (A=0.10, B=0.20, C=0.30, D=0.40, E=0.50)
 * @property {Deduction[]} deductions - Array of observed deductions
 * @property {Biomechanics} biomechanics - Biomechanical analysis
 * @property {InjuryRisk} injury_risk - Injury risk assessment
 * @property {string} strength_note - What the gymnast did well on this skill
 * @property {string|null} drill_recommendation - Primary corrective drill, or null if clean
 */

/**
 * @typedef {Object} TrainingPlanItem
 * @property {string} deduction_targeted - The fault type this drill addresses
 * @property {string} skill_id - Which skill this drill is for
 * @property {string} drill_name - Name of the drill
 * @property {string} drill_description - Step-by-step instructions in plain language
 * @property {string} frequency - Prescription (e.g. "3 sets of 10 reps, 3x per week")
 * @property {string} expected_improvement - What improvement to expect
 */

/**
 * @typedef {Object} MentalPerformance
 * @property {number} consistency_score - 0-10 rating of execution consistency across skills
 * @property {string} focus_indicators - Observations about focus/concentration
 * @property {string} patterns_observed - Recurring patterns (positive or negative)
 * @property {string} recommendations - Actionable mental performance advice
 */

/**
 * @typedef {Object} NutritionRecovery
 * @property {string} training_load_assessment - Assessment of physical demands observed
 * @property {string} nutrition_note - General nutrition guidance (age-appropriate, no medical advice)
 * @property {string} recovery_priority - Recovery focus area
 */

/**
 * @typedef {Object} RoutineSummary
 * @property {string} apparatus - Detected apparatus
 * @property {number} duration_seconds - Routine duration
 * @property {number} d_score - Difficulty score (code-computed, not AI)
 * @property {number} e_score - Execution score (10.0 - deductions, code-computed)
 * @property {number} final_score - Final score (code-computed)
 * @property {number} neutral_deductions - Neutral deductions (time violations, etc.)
 * @property {string} level - Gymnast level
 * @property {string} athlete_name - Gymnast name
 * @property {string} why_this_score - One-paragraph explanation of the score
 * @property {string[]} celebrations - Top 3 things the gymnast did well
 */

/**
 * @typedef {Object} PipelineResult
 * @property {RoutineSummary} routine_summary
 * @property {Skill[]} skills
 * @property {TrainingPlanItem[]} training_plan
 * @property {MentalPerformance} mental_performance
 * @property {NutritionRecovery} nutrition_recovery
 * @property {Object} _meta - Pipeline metadata (timing, model, prompt version)
 */

// ─── Empty/default constructors ─────────────────────────────────────────────

export function emptyBiomechanics() {
  return {
    hip_angle_at_peak: null,
    knee_angle_at_peak: null,
    shoulder_alignment: "aligned",
    body_line_score: 0,
    efficiency_rating: "needs_work",
    elite_comparison: "",
  };
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
    nutrition_note: "Stay hydrated and eat a balanced meal with protein within 30 minutes of practice. Consult your coach or doctor for specific nutrition guidance.",
    recovery_priority: "",
  };
}

// ─── Runtime validation ─────────────────────────────────────────────────────

/**
 * Validate and sanitize a pipeline result. Fills missing fields with defaults.
 * Never throws — always returns a valid shape.
 *
 * @param {any} raw - Raw parsed result from pipeline
 * @returns {{ result: PipelineResult, warnings: string[] }}
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
    d_score: 0,  // Always code-computed, never from AI
    e_score: 0,  // Always code-computed, never from AI
    final_score: 0,  // Always code-computed, never from AI
    neutral_deductions: clampNum(summary.neutral_deductions, 0, 2.0),
    level: typeof summary.level === "string" ? summary.level : "",
    athlete_name: typeof summary.athlete_name === "string" ? summary.athlete_name : "",
    why_this_score: typeof summary.why_this_score === "string" ? summary.why_this_score : "",
    celebrations: Array.isArray(summary.celebrations) ? summary.celebrations.filter(c => typeof c === "string").slice(0, 5) : [],
  };

  // Validate skills array
  const rawSkills = Array.isArray(raw.skills) ? raw.skills : [];
  if (rawSkills.length === 0) warnings.push("No skills found in pipeline output");

  const skills = rawSkills.map((s, i) => {
    if (!s || typeof s !== "object") {
      warnings.push(`Skill ${i} is not an object`);
      return null;
    }

    const deductions = Array.isArray(s.deductions) ? s.deductions.map(d => ({
      type: typeof d.type === "string" ? d.type : "unknown",
      description: typeof d.description === "string" ? d.description : "",
      point_value: snapToUSAG(typeof d.point_value === "number" ? d.point_value : 0),
      body_part: typeof d.body_part === "string" ? d.body_part : "unknown",
      severity: Object.values(Severity).includes(d.severity) ? d.severity : severityFromDeduction(d.point_value),
    })) : [];

    const bio = s.biomechanics || {};
    const injury = s.injury_risk || {};

    return {
      id: typeof s.id === "string" ? s.id : `skill_${i + 1}`,
      skill_name: typeof s.skill_name === "string" ? s.skill_name : "Unknown Skill",
      skill_code: typeof s.skill_code === "string" ? s.skill_code : "A",
      timestamp_start: typeof s.timestamp_start === "number" ? s.timestamp_start : 0,
      timestamp_end: typeof s.timestamp_end === "number" ? s.timestamp_end : 0,
      executed_successfully: typeof s.executed_successfully === "boolean" ? s.executed_successfully : true,
      difficulty_value: typeof s.difficulty_value === "number" ? s.difficulty_value : 0.10,
      deductions,
      biomechanics: {
        hip_angle_at_peak: typeof bio.hip_angle_at_peak === "number" ? bio.hip_angle_at_peak : null,
        knee_angle_at_peak: typeof bio.knee_angle_at_peak === "number" ? bio.knee_angle_at_peak : null,
        shoulder_alignment: Object.values(ShoulderAlignment).includes(bio.shoulder_alignment) ? bio.shoulder_alignment : "aligned",
        body_line_score: clampNum(bio.body_line_score, 0, 10),
        efficiency_rating: Object.values(Efficiency).includes(bio.efficiency_rating) ? bio.efficiency_rating : "needs_work",
        elite_comparison: typeof bio.elite_comparison === "string" ? bio.elite_comparison : "",
      },
      injury_risk: {
        level: Object.values(InjuryLevel).includes(injury.level) ? injury.level : "none",
        body_part: typeof injury.body_part === "string" ? injury.body_part : null,
        description: typeof injury.description === "string" ? injury.description : null,
        prevention_note: typeof injury.prevention_note === "string" ? injury.prevention_note : null,
      },
      strength_note: typeof s.strength_note === "string" ? s.strength_note : "",
      drill_recommendation: typeof s.drill_recommendation === "string" ? s.drill_recommendation : null,
    };
  }).filter(Boolean);

  // Validate training_plan
  const training_plan = Array.isArray(raw.training_plan) ? raw.training_plan.map(t => ({
    deduction_targeted: typeof t.deduction_targeted === "string" ? t.deduction_targeted : "",
    skill_id: typeof t.skill_id === "string" ? t.skill_id : "",
    drill_name: typeof t.drill_name === "string" ? t.drill_name : "",
    drill_description: typeof t.drill_description === "string" ? t.drill_description : "",
    frequency: typeof t.frequency === "string" ? t.frequency : "",
    expected_improvement: typeof t.expected_improvement === "string" ? t.expected_improvement : "",
  })) : [];

  // Validate mental_performance
  const mp = raw.mental_performance || {};
  const mental_performance = {
    consistency_score: clampNum(mp.consistency_score, 0, 10),
    focus_indicators: typeof mp.focus_indicators === "string" ? mp.focus_indicators : "",
    patterns_observed: typeof mp.patterns_observed === "string" ? mp.patterns_observed : "",
    recommendations: typeof mp.recommendations === "string" ? mp.recommendations : "",
  };

  // Validate nutrition_recovery
  const nr = raw.nutrition_recovery || {};
  const nutrition_recovery = {
    training_load_assessment: typeof nr.training_load_assessment === "string" ? nr.training_load_assessment : "",
    nutrition_note: typeof nr.nutrition_note === "string" ? nr.nutrition_note
      : "Stay hydrated and eat a balanced meal with protein within 30 minutes of practice. Consult your coach or doctor for specific nutrition guidance.",
    recovery_priority: typeof nr.recovery_priority === "string" ? nr.recovery_priority : "",
  };

  return {
    result: {
      routine_summary,
      skills,
      training_plan,
      mental_performance,
      nutrition_recovery,
      _meta: raw._meta || { prompt_version: "v8_2pass", timestamp: Date.now() },
    },
    warnings,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function clampNum(val, min, max) {
  const n = typeof val === "number" ? val : parseFloat(val);
  if (isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

/** Snap a deduction value to the nearest valid USAG increment */
export function snapToUSAG(val) {
  const n = typeof val === "number" ? val : parseFloat(val);
  if (isNaN(n) || n <= 0) return 0;
  if (n >= 0.50) return 0.50;
  return Math.round(n * 20) / 20;
}

function severityFromDeduction(val) {
  if (val >= 0.50) return Severity.FALL;
  if (val >= 0.30) return Severity.VERY_LARGE;
  if (val >= 0.20) return Severity.LARGE;
  if (val >= 0.10) return Severity.MEDIUM;
  return Severity.SMALL;
}
