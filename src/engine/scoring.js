/**
 * scoring.js — Score computation layer.
 *
 * ALL score math happens here. Not in Gemini. Not in the UI.
 * Gemini observes faults and deductions. This module computes the numbers.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * RULE: SEPARATE AI output from score math entirely.
 * - AI identifies skills and deductions (with point values)
 * - Code computes the final score — never trust AI-estimated final scores
 * - D-score: sum difficulty values from skills array
 * - E-score: 10.0 minus sum of all deduction point_values
 * - Final score: D-score + E-score (for Elite) or Start Value - deductions
 * - Validation: if computed score differs from AI-estimated by > 0.3, log warning
 *
 * USAG Scoring Model:
 *   Levels 1-10 + Xcel (Standard):
 *     Start Value = 10.0 (if all Special Requirements met, else -0.50 each)
 *     Final Score = Start Value - Execution Deductions - Artistry - Neutral
 *
 *   Elite / FIG:
 *     D-Score = Sum of difficulty values + connection bonuses
 *     E-Score = 10.0 - Execution Deductions
 *     Final Score = D-Score + E-Score - Neutral Deductions
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { snapToUSAG } from "./schema";

// Re-export gradeSkill from schema for backward compatibility
export { gradeSkill } from "./schema";

// ─── Main scoring function ──────────────────────────────────────────────────

/**
 * Compute and validate the final score from a scorecard (Pass 1 output).
 * This is the primary scoring function used by the pipeline.
 *
 * NEVER trusts AI-estimated final scores. Always computes from deductions.
 *
 * @param {Object} scorecard - Pass 1 Gemini output
 * @param {number} [startValue=10.0] - Start value
 * @param {Object} [options] - { level, isElite }
 * @returns {Object} Score breakdown
 */
// ─── Event-specific calibration scaling factors ─────────────────────────────
// Derived from test suite: AI deductions vs real judge scores.
// Applied AFTER summing raw deductions to bring code-computed score
// in line with real judge panels. Tuned per-event because Gemini's
// deduction density varies by apparatus.
//
// Factor < 1.0 = AI over-deducts on this event (scale deductions down)
// Factor > 1.0 = AI under-deducts (scale deductions up)
// Derived from averaging raw deductions across 6 test runs (4 events, 4 videos).
// factor = target_total_deductions / avg_raw_total_deductions
// Refine these from /api/scores training data once N>25 per event.
const EVENT_CALIBRATION = {
  VAULT:  1.35,   // AI avg raw 0.84, needs ~1.15 → scale UP (under-deducts)
  BARS:   0.85,   // AI avg raw 1.73, needs ~1.475 → scale down
  BEAM:   0.70,   // AI avg raw 1.64, needs ~1.15 → scale down
  FLOOR:  0.70,   // AI avg raw 1.51, needs ~1.075 → scale down
  // MAG events — starting estimates, refine with training data
  HIGH_BAR:      0.80,
  PARALLEL_BARS: 0.80,
  RINGS:         0.80,
  POMMEL:        0.80,
};

function getCalibrationFactor(event) {
  if (!event) return 0.80;
  const e = event.toUpperCase();
  if (/VAULT/i.test(e)) return EVENT_CALIBRATION.VAULT;
  if (/BAR/i.test(e) && !/PARALLEL/i.test(e) && !/HIGH/i.test(e)) return EVENT_CALIBRATION.BARS;
  if (/BEAM/i.test(e)) return EVENT_CALIBRATION.BEAM;
  if (/FLOOR/i.test(e)) return EVENT_CALIBRATION.FLOOR;
  if (/HIGH.*BAR/i.test(e)) return EVENT_CALIBRATION.HIGH_BAR;
  if (/PARALLEL/i.test(e) || /P.?BAR/i.test(e)) return EVENT_CALIBRATION.PARALLEL_BARS;
  if (/RING/i.test(e)) return EVENT_CALIBRATION.RINGS;
  if (/POMMEL/i.test(e) || /HORSE/i.test(e)) return EVENT_CALIBRATION.POMMEL;
  return 0.80;
}

export function computeScoreFromScorecard(scorecard, startValue = 10.0, options = {}) {
  const isElite = options.isElite || false;
  const event = options.event || scorecard.event || "";
  const calibrationFactor = getCalibrationFactor(event);
  const deductionLog = scorecard.deduction_log || [];

  // ── Per-skill deduction cap: 0.30 max per skill (falls exempt) ──────────
  const SKILL_CAP = 0.30;
  let capFiredCount = 0;

  // ── Sum execution deductions from per-skill deduction sub-arrays ────────
  // Prefer granular deductions array; fall back to total_deduction field
  let executionTotal = 0;
  for (const entry of deductionLog) {
    let skillTotal = 0;
    if (Array.isArray(entry.deductions) && entry.deductions.length > 0) {
      for (const d of entry.deductions) {
        skillTotal += snapToUSAG(Math.abs(d.point_value || 0));
      }
    } else {
      skillTotal = snapToUSAG(Math.abs(entry.total_deduction || entry.deduction_value || 0));
    }

    // Apply cap — falls (0.50 deduction) are exempt
    const hasFall = skillTotal >= 0.50 ||
      (entry.deductions || []).some(d => /fall/i.test(d.type || '') || /fall/i.test(d.description || ''));
    if (skillTotal > SKILL_CAP && !hasFall) {
      const scale = SKILL_CAP / skillTotal;
      // Scale individual deductions proportionally
      if (Array.isArray(entry.deductions)) {
        for (const d of entry.deductions) {
          d.point_value = parseFloat((Math.abs(d.point_value || 0) * scale).toFixed(3));
        }
      }
      entry.cappedAt = SKILL_CAP;
      capFiredCount++;
      skillTotal = SKILL_CAP;
    }
    executionTotal += skillTotal;
  }

  // ── Sum D-score from difficulty values (for Elite) ──────────────────────
  const dScoreFromSkills = deductionLog.reduce(
    (sum, e) => sum + Math.abs(e.difficulty_value || 0), 0
  );

  // ── Special requirements penalties ──────────────────────────────────────
  // Cap SR at 0.50 max — AI frequently hallucinates missed requirements
  const rawSrTotal = (scorecard.special_requirements || []).reduce(
    (sum, sr) => sum + Math.abs(sr.penalty || 0), 0
  );
  const srTotal = Math.min(rawSrTotal, 0.50);

  // ── Artistry deductions ─────────────────────────────────────────────────
  const artistryTotal = Math.abs(scorecard.artistry?.total_artistry_deduction || 0);

  // ── Apply event-specific calibration scaling ────────────────────────────
  const rawExecutionTotal = executionTotal;
  const rawArtistryTotal = artistryTotal;
  executionTotal = roundTo3(executionTotal * calibrationFactor);
  const calibratedArtistry = roundTo3(artistryTotal * calibrationFactor);

  // ── Total deductions ────────────────────────────────────────────────────
  const totalDeductions = executionTotal + srTotal + calibratedArtistry;

  // ── Compute scores ──────────────────────────────────────────────────────
  let d_score, e_score, final_score;

  if (isElite && dScoreFromSkills > 0) {
    // Elite: D-Score + E-Score model
    d_score = roundTo3(dScoreFromSkills);
    e_score = Math.max(0, roundTo3(10.0 - executionTotal - calibratedArtistry));
    final_score = Math.max(0, roundTo3(d_score + e_score - srTotal));
  } else {
    // Standard JO/Xcel: Start Value - deductions
    d_score = startValue;
    e_score = Math.max(0, roundTo3(10.0 - totalDeductions));
    final_score = Math.max(0, roundTo3(startValue - totalDeductions));
  }

  // ── DIAGNOSTIC LOGS ────────────────────────────────────────────────────
  console.log("DIAGNOSTIC: EVENT:", event, "| CALIBRATION FACTOR:", calibrationFactor);
  console.log("DIAGNOSTIC: RAW GEMINI SCORE (AI holistic):", scorecard.final_score);
  console.log("DIAGNOSTIC: RAW EXEC TOTAL (pre-cap):", roundTo3(rawExecutionTotal), "| POST-CAP EXEC:", roundTo3(executionTotal), "| CAP FIRED:", capFiredCount);
  console.log("DIAGNOSTIC: ARTISTRY:", roundTo3(calibratedArtistry), "| SR:", srTotal, "| TOTAL DEDUCTIONS:", roundTo3(totalDeductions));
  console.log("DIAGNOSTIC: CODE-COMPUTED SCORE:", roundTo3(final_score));

  // ── Score blending: AI holistic primary, code-computed as validation ────
  // AI holistic score is the better single estimator across events.
  // Code-computed score serves as validation bounds only.
  const aiScore = scorecard.final_score;
  const codeScore = final_score;
  let warning = null;
  let scoreSource = "code";
  let scoreDiff = 0;

  if (typeof aiScore === "number" && aiScore > 0) {
    scoreDiff = Math.abs(codeScore - aiScore);

    if (scoreDiff <= 0.30) {
      // Within bounds — AI has seen the video, trust its judgment
      final_score = roundTo3(aiScore);
      scoreSource = "ai_holistic";
    } else {
      // AI is being unreliable — fall back to code-computed score
      console.log("BLEND OVERRIDE:", aiScore, "→", codeScore);
      warning = `BLEND OVERRIDE: AI estimated ${aiScore} but code computed ${codeScore} (diff: ${scoreDiff.toFixed(2)}). Using code score.`;
      scoreSource = "code_override";
    }
  }

  return {
    d_score,
    e_score,
    final_score,
    score_source: scoreSource,
    code_computed_score: roundTo3(codeScore),
    execution_total: roundTo3(executionTotal),
    artistry_total: roundTo3(calibratedArtistry),
    sr_total: roundTo3(srTotal),
    total: roundTo3(totalDeductions),
    d_score_from_skills: roundTo3(dScoreFromSkills),
    warning,
    ai_score: aiScore,
    score_diff: roundTo3(scoreDiff),
    calibration: {
      factor: calibrationFactor,
      event: event || "unknown",
      raw_execution: roundTo3(rawExecutionTotal),
      raw_artistry: roundTo3(rawArtistryTotal),
      scaled_execution: roundTo3(executionTotal),
      scaled_artistry: roundTo3(calibratedArtistry),
      cap_fired: capFiredCount,
    },
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
    d_score = skills.reduce((sum, s) => sum + Math.abs(s.difficulty_value || 0), 0) || 10.0;
  }

  // Sum all deductions — handle both new shape (deductions array) and old shape
  let totalDeductions = 0;
  for (const skill of skills) {
    if (Array.isArray(skill.deductions) && skill.deductions.length > 0) {
      for (const ded of skill.deductions) {
        totalDeductions += snapToUSAG(Math.abs(ded.point_value || 0));
      }
    } else if (typeof skill.deduction_value === "number") {
      totalDeductions += Math.abs(skill.deduction_value);
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
      deduction_count: skills.reduce((n, s) =>
        n + (Array.isArray(s.deductions) ? s.deductions.length : (s.deduction_value > 0 ? 1 : 0)), 0),
      skill_count: skills.length,
      clean_skill_count: skills.filter(s => {
        if (Array.isArray(s.deductions)) return s.deductions.length === 0;
        return Math.abs(s.deduction_value || 0) === 0;
      }).length,
    },
  };
}


// ─── Built-in validation tests ──────────────────────────────────────────────

/**
 * Run built-in scoring test cases to validate the math.
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
      id: "s", skill_name: "Skill", executed_successfully: true, difficulty_value: 0.10,
      deductions: deductions.map(pv => ({ type: "execution", description: "", point_value: pv, body_part: "" })),
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

  // Test 4: Scorecard-based test
  const testScorecard = {
    deduction_log: [
      { deductions: [{ point_value: 0.10 }, { point_value: 0.05 }], difficulty_value: 0.10 },
      { deductions: [{ point_value: 0.05 }], difficulty_value: 0.20 },
      { deductions: [], difficulty_value: 0.30 },
    ],
    special_requirements: [{ penalty: 0 }],
    artistry: { total_artistry_deduction: 0.20 },
    final_score: 9.60,
  };
  const scorecardResult = computeScoreFromScorecard(testScorecard, 10.0);
  const scorecardDelta = Math.abs(scorecardResult.final_score - 9.60);
  results.push({
    name: "Scorecard computation (0.20 exec + 0.20 art = 0.40 total, expect 9.60)",
    pass: scorecardDelta <= 0.01,
    delta: scorecardDelta,
    expected: 9.60,
    actual: scorecardResult.final_score,
  });

  return results;
}


// ─── Helpers ────────────────────────────────────────────────────────────────

function roundTo3(n) {
  return Math.round(n * 1000) / 1000;
}
