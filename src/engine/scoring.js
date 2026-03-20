/**
 * scoring.js — Score computation layer.
 *
 * ALL score math happens here. Not in Gemini. Not in the UI.
 * Gemini observes faults. This module computes the numbers.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAG Scoring Model:
 *
 * Levels 1-5 (Compulsory):
 *   Start Value = 10.0 (fixed)
 *   Final Score = 10.0 - Execution Deductions - Neutral Deductions
 *
 * Levels 6-10 (Optional):
 *   Start Value = 10.0 (if all Special Requirements met, else -0.50 each)
 *   Final Score = Start Value - Execution Deductions - Neutral Deductions
 *
 * Elite / FIG:
 *   D-Score = Sum of difficulty values + connection bonuses
 *   E-Score = 10.0 - Execution Deductions
 *   Final Score = D-Score + E-Score - Neutral Deductions
 *
 * For Strive's primary audience (Levels 1-10), we present:
 *   d_score = Start Value (10.0 or adjusted)
 *   e_score = 10.0 - sum of execution deductions
 *   final_score = d_score + e_score - 10.0 - neutral_deductions
 *              = start_value - total_deductions - neutral_deductions
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { snapToUSAG } from "./schema";

// ─── Difficulty values by code ──────────────────────────────────────────────

const DIFFICULTY_VALUES = {
  A: 0.10,
  B: 0.20,
  C: 0.30,
  D: 0.40,
  E: 0.50,
  F: 0.60,
  G: 0.70,
  SR: 0.00,  // Special requirement — no difficulty value, but must be present
};

// ─── Connection bonus rules (simplified USAG) ───────────────────────────────
// Two acro skills in direct connection: bonus if both are B+ value
// This is a simplified model — full FIG bonus tables are more complex

function computeConnectionBonuses(skills) {
  // Connection bonuses only apply at Level 9+ and Elite
  // For Levels 1-8, return 0
  return 0;
}

// ─── Main scoring function ──────────────────────────────────────────────────

/**
 * Compute D-score, E-score, and Final Score from validated pipeline skills.
 * This is the ONLY place score math runs. Never Gemini.
 *
 * @param {import('./schema').Skill[]} skills - Validated skill array from pipeline
 * @param {number} neutralDeductions - Neutral deductions (time violations, etc.)
 * @param {string} level - Gymnast level (e.g. "Level 6", "Elite")
 * @param {string} [levelCategory="optional"] - "compulsory" | "optional" | "xcel"
 * @returns {{ d_score: number, e_score: number, final_score: number, breakdown: Object }}
 */
export function computeScore(skills, neutralDeductions = 0, level = "Level 6", levelCategory = "optional") {
  const isElite = level === "Elite";
  const isCompulsory = levelCategory === "compulsory";

  // ── D-Score (Difficulty / Start Value) ────────────────────────────────────
  let d_score;

  if (isElite) {
    // FIG model: sum difficulty values of counting skills + connection bonuses
    const successfulSkills = skills.filter(s => s.executed_successfully);
    const difficultySum = successfulSkills.reduce((sum, s) => {
      const val = typeof s.difficulty_value === "number" ? s.difficulty_value
        : DIFFICULTY_VALUES[s.skill_code] || 0.10;
      return sum + val;
    }, 0);
    const connectionBonus = computeConnectionBonuses(successfulSkills);
    d_score = roundTo3(difficultySum + connectionBonus);
  } else {
    // USAG Levels 1-10 + Xcel: Start value is 10.0
    // Deduct 0.50 for each missing Special Requirement
    // (Special requirements are already captured as deductions in the skill list
    //  with type "missing_special_requirement" — but we don't double-count)
    d_score = 10.0;
  }

  // ── E-Score (Execution) ───────────────────────────────────────────────────
  // Sum ALL deductions across all skills (execution + artistry + composition)
  const allDeductions = [];
  for (const skill of skills) {
    for (const ded of (skill.deductions || [])) {
      const snapped = snapToUSAG(ded.point_value);
      allDeductions.push({
        skill_id: skill.id,
        skill_name: skill.skill_name,
        type: ded.type,
        description: ded.description,
        point_value: snapped,
        body_part: ded.body_part,
        severity: ded.severity,
        category: categorizeDeduction(ded.type, skill.skill_name),
      });
    }
  }

  const executionDeds = allDeductions.filter(d => d.category === "execution");
  const artistryDeds = allDeductions.filter(d => d.category === "artistry");
  const compositionDeds = allDeductions.filter(d => d.category === "composition");

  const executionTotal = roundToUSAG025(sum(executionDeds.map(d => d.point_value)));
  const artistryTotal = roundToUSAG025(sum(artistryDeds.map(d => d.point_value)));
  const compositionTotal = roundToUSAG025(sum(compositionDeds.map(d => d.point_value)));

  const totalDeductions = roundTo3(executionTotal + artistryTotal + compositionTotal);

  // E-score = 10.0 - total deductions (clamped to 0 minimum)
  const e_score = Math.max(0, roundTo3(10.0 - totalDeductions));

  // ── Neutral Deductions ────────────────────────────────────────────────────
  const neutral = roundTo3(Math.max(0, neutralDeductions));

  // ── Final Score ───────────────────────────────────────────────────────────
  let final_score;
  if (isElite) {
    // FIG: D + E - Neutral
    final_score = Math.max(0, roundTo3(d_score + e_score - neutral));
  } else {
    // USAG Levels: Start Value - Total Deductions - Neutral
    final_score = Math.max(0, roundTo3(d_score - totalDeductions - neutral));
  }

  return {
    d_score,
    e_score,
    final_score,
    breakdown: {
      execution_deductions: executionTotal,
      artistry_deductions: artistryTotal,
      composition_deductions: compositionTotal,
      total_deductions: totalDeductions,
      neutral_deductions: neutral,
      deduction_count: allDeductions.length,
      skill_count: skills.length,
      clean_skill_count: skills.filter(s => (s.deductions || []).length === 0 || sum((s.deductions || []).map(d => d.point_value)) === 0).length,
      all_deductions: allDeductions,
    },
  };
}

// ─── Deduction categorization ───────────────────────────────────────────────

const ARTISTRY_TYPES = new Set([
  "flat_feet_in_dance", "lack_of_presentation", "poor_musicality",
  "hollow_hands", "lack_of_expression", "no_eye_contact",
  "arms_tossed", "limp_wrists", "energy_drops",
  "flat_footwork", "rushed_choreography", "flexed_feet_in_dance",
  "lack_of_confidence", "hesitation", "no_releve",
]);

const COMPOSITION_TYPES = new Set([
  "limited_floor_space", "insufficient_variety", "poor_transitions",
  "rushed_transitions", "no_level_changes", "monotonous_rhythm",
]);

function categorizeDeduction(type, skillName) {
  if (ARTISTRY_TYPES.has(type)) return "artistry";
  if (COMPOSITION_TYPES.has(type)) return "composition";
  // Skills with "artistry" or "composition" in the name
  const nameLower = (skillName || "").toLowerCase();
  if (nameLower.includes("artistry") || nameLower.includes("presentation")) return "artistry";
  if (nameLower.includes("composition") || nameLower.includes("choreography")) return "composition";
  return "execution";
}

// ─── Grade assignment ───────────────────────────────────────────────────────

/**
 * Assign a letter grade to a skill based on its total deduction.
 * @param {number} totalDeduction - Sum of all deductions on this skill
 * @returns {{ grade: string, color: string }}
 */
export function gradeSkill(totalDeduction) {
  if (totalDeduction === 0) return { grade: "A", color: "#22c55e" };
  if (totalDeduction <= 0.05) return { grade: "A-", color: "#4ade80" };
  if (totalDeduction <= 0.10) return { grade: "B+", color: "#a3e635" };
  if (totalDeduction <= 0.15) return { grade: "B", color: "#ffc15a" };
  if (totalDeduction <= 0.20) return { grade: "B-", color: "#f59e0b" };
  if (totalDeduction <= 0.30) return { grade: "C", color: "#e06820" };
  if (totalDeduction <= 0.40) return { grade: "D", color: "#ef4444" };
  return { grade: "F", color: "#dc2626" };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function sum(arr) {
  return arr.reduce((s, v) => s + (v || 0), 0);
}

function roundTo3(val) {
  return Math.round(val * 1000) / 1000;
}

/** USAG E-scores use 0.025 increments */
function roundToUSAG025(val) {
  return Math.round(val / 0.025) * 0.025;
}

// ─── Test validation cases ──────────────────────────────────────────────────

/**
 * Run built-in scoring validation against known test cases.
 * Returns array of { name, expected, actual, delta, pass }.
 */
export function runScoringTests() {
  const results = [];

  // Test Case 1: Clean Level 5 floor routine — minimal deductions
  results.push(runTestCase({
    name: "Level 5 Floor — Good routine",
    level: "Level 5",
    levelCategory: "optional",
    neutral: 0,
    skills: [
      makeTestSkill("skill_1", "Round-off", "B", [{ pv: 0.05, type: "slight_leg_separation" }]),
      makeTestSkill("skill_2", "Back Handspring", "A", []),
      makeTestSkill("skill_3", "Back Tuck", "B", [{ pv: 0.10, type: "bent_knees" }]),
      makeTestSkill("skill_4", "Split Leap", "A", [{ pv: 0.05, type: "flexed_feet" }]),
      makeTestSkill("skill_5", "Full Turn", "A", []),
      makeTestSkill("skill_6", "Front Walkover", "A", [{ pv: 0.05, type: "bent_knees" }]),
      makeTestSkill("skill_7", "Round-off BHS Layout", "C", [{ pv: 0.10, type: "step_on_landing" }, { pv: 0.05, type: "slight_pike" }]),
      makeTestSkill("skill_8", "Straddle Jump", "A", []),
      makeTestSkill("skill_9", "Artistry", "SR", [{ pv: 0.10, type: "flat_feet_in_dance" }, { pv: 0.05, type: "lack_of_presentation" }]),
      makeTestSkill("skill_10", "Composition", "SR", [{ pv: 0.05, type: "limited_floor_space" }]),
    ],
    expectedFinal: 9.40,
    tolerance: 0.10,
  }));

  // Test Case 2: Average Level 6 beam — moderate deductions
  results.push(runTestCase({
    name: "Level 6 Beam — Average routine",
    level: "Level 6",
    levelCategory: "optional",
    neutral: 0,
    skills: [
      makeTestSkill("skill_1", "Mount", "A", [{ pv: 0.10, type: "wobble" }]),
      makeTestSkill("skill_2", "Cartwheel", "A", [{ pv: 0.05, type: "bent_knees" }]),
      makeTestSkill("skill_3", "Back Walkover", "B", [{ pv: 0.10, type: "bent_arms" }, { pv: 0.05, type: "flexed_feet" }]),
      makeTestSkill("skill_4", "Split Leap", "A", [{ pv: 0.15, type: "insufficient_split" }]),
      makeTestSkill("skill_5", "Full Turn", "A", [{ pv: 0.10, type: "wobble" }]),
      makeTestSkill("skill_6", "Back Handspring", "B", [{ pv: 0.10, type: "bent_arms" }]),
      makeTestSkill("skill_7", "Dismount RO BHS", "B", [{ pv: 0.10, type: "step_on_landing" }]),
      makeTestSkill("skill_8", "Artistry", "SR", [{ pv: 0.10, type: "lack_of_confidence" }, { pv: 0.05, type: "no_eye_contact" }]),
      makeTestSkill("skill_9", "Composition", "SR", [{ pv: 0.05, type: "poor_transitions" }]),
    ],
    expectedFinal: 9.00,
    tolerance: 0.10,
  }));

  // Test Case 3: Rough Level 7 floor — high deductions + fall
  results.push(runTestCase({
    name: "Level 7 Floor — Rough routine with fall",
    level: "Level 7",
    levelCategory: "optional",
    neutral: 0,
    skills: [
      makeTestSkill("skill_1", "Round-off", "A", [{ pv: 0.10, type: "leg_separation" }]),
      makeTestSkill("skill_2", "Back Handspring", "A", [{ pv: 0.10, type: "bent_arms" }]),
      makeTestSkill("skill_3", "Back Layout", "C", [{ pv: 0.50, type: "fall" }]),
      makeTestSkill("skill_4", "Switch Leap", "B", [{ pv: 0.20, type: "insufficient_split" }]),
      makeTestSkill("skill_5", "Full Turn", "A", [{ pv: 0.05, type: "wobble" }]),
      makeTestSkill("skill_6", "Front Tuck", "B", [{ pv: 0.10, type: "bent_knees" }, { pv: 0.05, type: "flexed_feet" }]),
      makeTestSkill("skill_7", "Round-off BHS Full", "D", [{ pv: 0.10, type: "step_on_landing" }, { pv: 0.05, type: "chest_drop" }]),
      makeTestSkill("skill_8", "Artistry", "SR", [{ pv: 0.15, type: "flat_feet_in_dance" }, { pv: 0.10, type: "rushed_choreography" }]),
      makeTestSkill("skill_9", "Composition", "SR", [{ pv: 0.10, type: "limited_floor_space" }]),
    ],
    expectedFinal: 8.35,
    tolerance: 0.10,
  }));

  return results;
}

function makeTestSkill(id, name, code, deductions) {
  return {
    id,
    skill_name: name,
    skill_code: code,
    timestamp_start: 0,
    timestamp_end: 0,
    executed_successfully: !deductions.some(d => d.type === "fall"),
    difficulty_value: DIFFICULTY_VALUES[code] || 0.10,
    deductions: deductions.map(d => ({
      type: d.type,
      description: d.type.replace(/_/g, " "),
      point_value: d.pv,
      body_part: "unknown",
      severity: d.pv >= 0.50 ? "fall" : d.pv >= 0.30 ? "veryLarge" : d.pv >= 0.20 ? "large" : d.pv >= 0.10 ? "medium" : "small",
    })),
    biomechanics: null,
    injury_risk: null,
    strength_note: "",
    drill_recommendation: null,
  };
}

function runTestCase({ name, level, levelCategory, neutral, skills, expectedFinal, tolerance }) {
  const { final_score, breakdown } = computeScore(skills, neutral, level, levelCategory);
  const delta = Math.abs(final_score - expectedFinal);
  return {
    name,
    expected: expectedFinal,
    actual: final_score,
    delta: roundTo3(delta),
    pass: delta <= tolerance,
    breakdown,
  };
}
