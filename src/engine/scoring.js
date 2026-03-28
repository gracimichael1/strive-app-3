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
export const SCORING_VERSION = '3.1';
// Increment on: calibration factor change, cap change, blend logic change
// v3.0: Code score always wins (blend removed), two-sided bounds, sanity checks, artistry cap
// v3.1: Calibration factors updated from per-routine segmented scoring (44 pairs, 14 videos)

// Applied AFTER summing raw deductions to bring code-computed score
// in line with real judge panels. Tuned per-event because Gemini's
// deduction density varies by apparatus.
//
// Factor < 1.0 = AI over-deducts on this event (scale deductions down)
// Factor > 1.0 = AI under-deducts (scale deductions up)
//
// v3 calibration (2026-03-28): Per-routine segmented scoring (N=44 pairs, 14 videos)
// segment-and-calibrate.mjs processes individual routine clips, not multi-routine videos.
// This gives dramatically more accurate ratios than batch v1 which scored mixed content.
//
// Previous v2: vault 0.75, bars 0.85, beam 0.91, floor 0.92
// Previous v1: vault 1.35, bars 0.85, beam 0.70, floor 0.70
const EVENT_CALIBRATION = {
  VAULT:  1.34,   // v2→v3: 0.75→1.34. AI UNDER-deducts vault (ratio 0.746). N=18, MEDIUM confidence.
  BARS:   0.50,   // v2→v3: 0.85→0.50. AI over-deducts bars 1.99x. N=5, LOW confidence — need more data.
  BEAM:   0.68,   // v2→v3: 0.91→0.68. AI over-deducts beam 1.47x. N=9, LOW confidence.
  FLOOR:  0.82,   // v2→v3: 0.92→0.82. AI over-deducts floor 1.22x. N=12, MEDIUM confidence.
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
  // Artistry is a SEPARATE routine-level assessment (presentation, expression, musicality).
  // It is NOT embedded in per-skill execution deductions — those are in deduction_log.
  // Cap at 0.50: Gemini frequently over-estimates artistry deductions.
  const rawArtistry = Math.abs(scorecard.artistry?.total_artistry_deduction || 0);
  const artistryTotal = Math.min(rawArtistry, 0.50);

  // ── Apply event-specific calibration scaling ────────────────────────────
  const rawExecutionTotal = executionTotal;
  const rawArtistryTotal = artistryTotal;
  let calibratedExecution = roundTo3(executionTotal * calibrationFactor);
  let calibratedArtistry = roundTo3(artistryTotal * calibrationFactor);

  // ── Two-sided calibration bounds (0.80–1.50) ─────────────────────────
  // Prevents calibration from making scores unrealistically high or low.
  // Floor (0.80): if calibration makes deductions too small, clamp up
  // Ceiling (1.50): if calibration makes deductions too large, clamp down
  const BOUNDS = { FLOOR: 0.80, CEILING: 1.50 };
  let boundsWarning = null;

  const execFloor = roundTo3(rawExecutionTotal * BOUNDS.FLOOR);
  const execCeiling = roundTo3(rawExecutionTotal * BOUNDS.CEILING);

  if (rawExecutionTotal > 0 && calibratedExecution < execFloor) {
    boundsWarning = `Calibration floor: exec ${calibratedExecution} clamped up to ${execFloor}`;
    calibratedExecution = execFloor;
  } else if (rawExecutionTotal > 0 && calibratedExecution > execCeiling) {
    boundsWarning = `Calibration ceiling: exec ${calibratedExecution} clamped down to ${execCeiling}`;
    calibratedExecution = execCeiling;
  }

  const artFloor = roundTo3(rawArtistryTotal * BOUNDS.FLOOR);
  const artCeiling = roundTo3(rawArtistryTotal * BOUNDS.CEILING);
  let artBoundsWarning = null;
  if (rawArtistryTotal > 0 && calibratedArtistry < artFloor) {
    artBoundsWarning = `Artistry floor: ${calibratedArtistry} clamped up to ${artFloor}`;
    calibratedArtistry = artFloor;
  } else if (rawArtistryTotal > 0 && calibratedArtistry > artCeiling) {
    artBoundsWarning = `Artistry ceiling: ${calibratedArtistry} clamped down to ${artCeiling}`;
    calibratedArtistry = artCeiling;
  }

  executionTotal = calibratedExecution;
  if (boundsWarning) console.log("DIAGNOSTIC: BOUNDS:", boundsWarning);
  if (artBoundsWarning) console.log("DIAGNOSTIC: BOUNDS:", artBoundsWarning);

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

  // ── CODE SCORE ALWAYS WINS ─────────────────────────────────────────────
  // v3.0: Code-computed score is authoritative. AI score is diagnostic only.
  // AI identifies faults. Code computes the math. Period.
  const aiScore = scorecard.final_score;
  const codeScore = final_score;
  let warning = boundsWarning;
  const scoreSource = "code_computed";
  let scoreDiff = 0;

  if (typeof aiScore === "number" && aiScore > 0) {
    scoreDiff = Math.abs(codeScore - aiScore);
    if (scoreDiff > 0.20) {
      const msg = `AI estimated ${aiScore} but code computed ${codeScore} (diff: ${scoreDiff.toFixed(2)}). Code score used. Review calibration if persistent.`;
      warning = warning ? `${warning} | ${msg}` : msg;
      console.log("DIAGNOSTIC: DIVERGENCE:", msg);
    }
  }

  // ── Sanity validation ────────────────────────────────────────────────
  const sanity_warnings = [];
  const skillsWithDeductions = deductionLog.filter(e =>
    (Array.isArray(e.deductions) ? e.deductions.length > 0 : (e.total_deduction || e.deduction_value || 0) > 0)
  ).length;
  const hasFallInLog = deductionLog.some(e =>
    (e.deductions || []).some(d => /fall/i.test(d.type || '') || /fall/i.test(d.description || ''))
    || (Math.abs(e.total_deduction || e.deduction_value || 0) >= 0.50)
  );

  if (final_score > 9.80 && skillsWithDeductions >= 3) {
    sanity_warnings.push(`Score ${final_score} unusually high with ${skillsWithDeductions} deducted skills. Possible under-deduction.`);
  }
  if (final_score < 7.00 && !hasFallInLog) {
    sanity_warnings.push(`Score ${final_score} unusually low with no falls detected. Possible over-deduction.`);
  }
  if (deductionLog.length > 0 && skillsWithDeductions === 0) {
    sanity_warnings.push(`No deductions on any of ${deductionLog.length} skills. AI may be too lenient.`);
  }
  if (rawArtistry > 0.50) {
    sanity_warnings.push(`Artistry deduction ${rawArtistry} capped to 0.50 (Gemini over-estimated).`);
  }

  if (sanity_warnings.length > 0) {
    console.log("DIAGNOSTIC: SANITY WARNINGS:", sanity_warnings);
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
    sanity_warnings,
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
      bounds_applied: !!boundsWarning,
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
  // v3.0: code score always wins. No event → factor 0.80
  // Raw exec: 0.20, calibrated: 0.16. Raw art: 0.20, calibrated: 0.16. Total: 0.32
  // Code score: 10.0 - 0.32 = 9.68
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
  const scorecardDelta = Math.abs(scorecardResult.final_score - 9.68);
  results.push({
    name: "Scorecard computation (0.20 exec + 0.20 art → calibrated 0.32 total, code=9.68)",
    pass: scorecardDelta <= 0.02,
    delta: scorecardDelta,
    expected: 9.68,
    actual: scorecardResult.final_score,
  });

  return results;
}


// ─── Biomechanics cross-validation ─────────────────────────────────────────

/**
 * Compare Gemini's deductions against measured MediaPipe angles.
 * Does NOT change scores — produces diagnostic flags for validation.
 *
 * @param {Array} deductionLog - Skills from Pass 1
 * @param {Array} measuredAngles - Per-skill biomechanics from client-side MediaPipe
 * @returns {Array} flags - Array of { skill, type, detail }
 */
export function crossValidateBiomechanics(deductionLog, measuredAngles) {
  const flags = [];
  if (!measuredAngles || !deductionLog) return flags;

  for (let i = 0; i < deductionLog.length; i++) {
    const skill = deductionLog[i];
    const bio = measuredAngles[i];
    if (!bio) continue;

    const geminiSaysBentKnees = (skill.deductions || []).some(d =>
      /knee|bent.*leg|leg.*bent/i.test(d.description || '') || /knee/i.test(d.body_part || '')
    );
    const geminiSaysClean = !skill.deductions || skill.deductions.length === 0
      || (Math.abs(skill.total_deduction || 0) === 0);

    // Flag: Gemini says bent knees but angles show straight
    if (geminiSaysBentKnees && bio.worstKneeAngle && bio.worstKneeAngle >= 160) {
      flags.push({
        skill: skill.skill_name,
        type: "potential_false_positive",
        detail: `Gemini deducted for bent knees but measured knee angle is ${Math.round(bio.worstKneeAngle)}° (≥160° is straight)`,
      });
    }

    // Flag: Gemini says clean but angles show bent knees
    if (geminiSaysClean && bio.worstKneeAngle && bio.worstKneeAngle < 150) {
      flags.push({
        skill: skill.skill_name,
        type: "potential_missed_deduction",
        detail: `Gemini found no deductions but measured knee angle is ${Math.round(bio.worstKneeAngle)}° (<150° is bent)`,
      });
    }

    // Flag: Gemini says clean but hip angle shows pike
    if (geminiSaysClean && bio.avgHipAngle && bio.avgHipAngle < 150) {
      flags.push({
        skill: skill.skill_name,
        type: "potential_missed_deduction",
        detail: `Gemini found no deductions but measured hip angle is ${Math.round(bio.avgHipAngle)}° (<150° indicates pike)`,
      });
    }
  }

  return flags;
}


// ─── Helpers ────────────────────────────────────────────────────────────────

function roundTo3(n) {
  return Math.round(n * 1000) / 1000;
}
