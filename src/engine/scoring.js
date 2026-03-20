/**
 * scoring.js — Score computation layer.
 *
 * ALL score math happens here. Not in Gemini. Not in the UI.
 * Gemini observes faults. This module computes the numbers.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAG Scoring Model:
 *
 * Levels 1-10 + Xcel (Standard):
 *   Start Value = 10.0 (if all Special Requirements met, else -0.50 each)
 *   Final Score = Start Value - Execution Deductions - Artistry - Neutral
 *
 * Elite / FIG:
 *   D-Score = Sum of difficulty values + connection bonuses
 *   E-Score = 10.0 - Execution Deductions
 *   Final Score = D-Score + E-Score - Neutral Deductions
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { snapToUSAG } from "./schema";

// Re-export gradeSkill from schema for backward compatibility
export { gradeSkill } from "./schema";

// ─── Main scoring function ──────────────────────────────────────────────────

/**
 * Compute and validate the final score from a scorecard.
 * Called by the pipeline to cross-check Gemini's reported score.
 *
 * @param {Object} scorecard - Pass 1 Gemini output (deduction_log, artistry, special_requirements)
 * @param {number} [startValue=10.0] - Start value
 * @returns {{ final_score: number, execution_total: number, artistry_total: number, sr_total: number, total: number }}
 */
export function computeScoreFromScorecard(scorecard, startValue = 10.0) {
  const executionTotal = (scorecard.deduction_log || []).reduce(
    (sum, e) => sum + snapToUSAG(Math.abs(e.deduction_value || 0)), 0
  );

  const srTotal = (scorecard.special_requirements || []).reduce(
    (sum, sr) => sum + Math.abs(sr.penalty || 0), 0
  );

  const artistryTotal = Math.abs(scorecard.artistry?.total_artistry_deduction || 0);

  const totalDeductions = executionTotal + srTotal + artistryTotal;
  const final_score = Math.max(0, roundTo3(startValue - totalDeductions));

  return {
    final_score,
    execution_total: roundTo3(executionTotal),
    artistry_total: roundTo3(artistryTotal),
    sr_total: roundTo3(srTotal),
    total: roundTo3(totalDeductions),
  };
}

/**
 * Legacy-compatible computeScore function.
 * Accepts the old skill-array format with nested deductions.
 * Used by transform.js and potentially other callers.
 */
export function computeScore(skills, neutralDeductions = 0, level = "Level 6", levelCategory = "optional") {
  const isElite = level === "Elite";

  let d_score = 10.0;
  if (isElite) {
    // For Elite, d_score would be sum of difficulty values
    // For now, keep at 10.0 — Elite D-score computation is a future enhancement
    d_score = 10.0;
  }

  // Sum all deductions — handle both new shape (deduction_value) and old shape (deductions array)
  let totalDeductions = 0;
  for (const skill of skills) {
    if (typeof skill.deduction_value === "number") {
      totalDeductions += Math.abs(skill.deduction_value);
    } else if (Array.isArray(skill.deductions)) {
      for (const ded of skill.deductions) {
        totalDeductions += snapToUSAG(Math.abs(ded.point_value || 0));
      }
    }
  }

  const neutral = Math.max(0, neutralDeductions);
  const e_score = Math.max(0, roundTo3(10.0 - totalDeductions));
  const final_score = Math.max(0, roundTo3(d_score - totalDeductions - neutral));

  return {
    d_score,
    e_score,
    final_score,
    breakdown: {
      execution_deductions: roundTo3(totalDeductions),
      artistry_deductions: 0,
      composition_deductions: 0,
      total_deductions: roundTo3(totalDeductions),
      neutral_deductions: neutral,
      deduction_count: skills.length,
      skill_count: skills.length,
      clean_skill_count: skills.filter(s => Math.abs(s.deduction_value || 0) === 0).length,
    },
  };
}


// ─── Built-in validation tests ──────────────────────────────────────────────

/**
 * Run built-in scoring test cases to validate the math.
 * Returns array of { name, pass, delta, expected, actual }.
 */
export function runScoringTests() {
  const results = [];

  function runCase(name, skills, neutral, expected, tolerance = 0.10) {
    const { final_score } = computeScore(skills, neutral, "Level 6", "optional");
    const delta = Math.abs(final_score - expected);
    results.push({ name, pass: delta <= tolerance, delta, expected, actual: final_score });
  }

  function makeSkill(deductions) {
    return {
      id: "s", skill_name: "Skill", executed_successfully: true, skill_code: "A", difficulty_value: 0.10,
      deductions: deductions.map(pv => ({ type: "execution", description: "", point_value: pv, body_part: "", severity: "medium" })),
    };
  }

  // Test 1: Good routine (9.40 expected)
  runCase("Level 5 Floor — Good routine", [
    makeSkill([0.05]), makeSkill([]), makeSkill([0.10]), makeSkill([0.05]),
    makeSkill([]), makeSkill([0.05]), makeSkill([0.10, 0.05]), makeSkill([]),
    makeSkill([0.10, 0.05]), makeSkill([0.05]),
  ], 0, 9.40);

  // Test 2: Average routine (9.00 expected)
  runCase("Level 6 Beam — Average routine", [
    makeSkill([0.10]), makeSkill([0.05]), makeSkill([0.10, 0.05]),
    makeSkill([0.15]), makeSkill([0.10]), makeSkill([0.10]),
    makeSkill([0.10]), makeSkill([0.10, 0.05]), makeSkill([0.05]),
  ], 0, 9.00);

  // Test 3: Rough routine (8.50 expected)
  runCase("Level 7 Floor — Rough routine", [
    makeSkill([0.10, 0.05]), makeSkill([0.10]),
    makeSkill([0.20, 0.10]), makeSkill([0.10]),
    makeSkill([0.10, 0.05]), makeSkill([0.50]),
  ], 0.10, 8.50);

  return results;
}


// ─── Helpers ────────────────────────────────────────────────────────────────

function roundTo3(n) {
  return Math.round(n * 1000) / 1000;
}
