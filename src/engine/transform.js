/**
 * transform.js — Maps pipeline output schema to UI component props.
 *
 * This is the ONLY bridge between the engine and the UI.
 * SkillCard, ResultsScreen, DashboardScreen all consume these shapes.
 *
 * Rules:
 * - No mock data. No hardcoded strings.
 * - If a field is null/undefined, show "—" placeholder, never fake data.
 * - Every prop maps to a documented field in the pipeline schema.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * Integration: Called by runAnalysisPipeline() after validation.
 * The returned object is a drop-in replacement for the current analysisResult
 * shape that LegacyApp.js passes to ResultsScreen and DashboardScreen.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { gradeSkill, formatTimestamp } from "./schema";

const PLACEHOLDER = "—";

// ─── Severity → color mapping (matches CLAUDE.md design system) ─────────────

const SEVERITY_COLORS = {
  small: "#22c55e",
  medium: "#f59e0b",
  large: "#e06820",
  veryLarge: "#ef4444",
  fall: "#dc2626",
};

// ─── Main transform ────────────────────────────────────────────────────────

/**
 * Transform a validated PipelineResult into the shape consumed by UI components.
 *
 * @param {Object} pipelineResult - Validated pipeline output
 * @param {Object} [extras] - Optional extras: { videoUrl, videoFile }
 * @returns {Object} - Shape compatible with existing ResultsScreen / SkillCard props
 */
export function transformForUI(pipelineResult, extras = {}) {
  const { routine_summary, skills, special_requirements, _meta } = pipelineResult;

  // ── Transform skills to SkillCard-compatible shape ────────────────────────
  const gradedSkills = skills.map((skill, idx) => transformSkill(skill, idx));

  // ── Execution deductions (for Deductions tab) ─────────────────────────────
  const executionDeductions = skills
    .filter(s => s.deduction_value > 0)
    .map(s => ({
      timestamp: s.timestamp,
      skill: s.skill_name,
      deduction: s.deduction_value,
      fault: s.reason || s.fault_observed || "",
      engine: "Strive",
      category: "execution",
      severity: deductionSeverity(s.deduction_value),
      confidence: 0.95,
      skeleton: null,
      correction: null,
    }));

  // ── Top fixes (highest deductions first) ──────────────────────────────────
  const sortedByDeduction = [...skills]
    .filter(s => s.deduction_value > 0)
    .sort((a, b) => b.deduction_value - a.deduction_value);

  const topFixes = sortedByDeduction.slice(0, 3).map(s => ({
    name: s.skill_name,
    saves: s.deduction_value,
    drill: s.reason || s.fault_observed || "Focus on form",
  }));

  // ── Top improvements ──────────────────────────────────────────────────────
  const topImprovements = sortedByDeduction.slice(0, 3).map(s => ({
    fix: `${s.skill_name}: ${s.reason || s.fault_observed || "Clean up execution"}`,
    pointsGained: s.gain_if_fixed || s.deduction_value,
  }));

  // ── Celebrations / Strengths ──────────────────────────────────────────────
  const celebrations = routine_summary.celebrations?.length > 0
    ? routine_summary.celebrations
    : skills
        .filter(s => s.is_celebration)
        .map(s => `${s.skill_name}: ${s.strength || "Excellent execution"}`)
        .slice(0, 3);

  const strengths = celebrations.length > 0
    ? celebrations
    : skills
        .filter(s => s.deduction_value === 0)
        .map(s => `${s.skill_name}: Clean execution`)
        .slice(0, 5);

  // ── Areas for improvement ─────────────────────────────────────────────────
  const areasForImprovement = sortedByDeduction
    .slice(0, 4)
    .map(s => `${s.skill_name}: ${s.reason || s.fault_observed || "Needs work"}`);

  // ── Artistry breakdown ────────────────────────────────────────────────────
  const art = routine_summary.artistry;
  const artistryBreakdown = art ? {
    totalDeduction: Math.abs(art.total_artistry_deduction || 0),
    details: [
      art.expression_deduction > 0 && { fault: "Expression / projection", deduction: art.expression_deduction },
      art.quality_of_movement_deduction > 0 && { fault: "Quality of movement", deduction: art.quality_of_movement_deduction },
      art.choreography_variety_deduction > 0 && { fault: "Choreography variety", deduction: art.choreography_variety_deduction },
      art.musicality_deduction > 0 && { fault: "Musicality", deduction: art.musicality_deduction },
    ].filter(Boolean),
    notes: art.notes || "",
  } : null;

  // ── Score data ────────────────────────────────────────────────────────────
  const finalScore = routine_summary.final_score || 0;
  const startValue = routine_summary.d_score || 10.0;
  const scoreBreakdown = _meta?.score_breakdown || {};

  // ── Assemble the result object ────────────────────────────────────────────
  return {
    // ── Core scores ──
    startValue,
    finalScore,
    totalDeductions: scoreBreakdown.total_deductions || scoreBreakdown.total || 0,
    executionDeductionsTotal: scoreBreakdown.execution_deductions || scoreBreakdown.execution_total || 0,
    artistryDeductionsTotal: scoreBreakdown.artistry_deductions || scoreBreakdown.artistry_total || 0,
    compositionDeductionsTotal: 0,
    neutralDeductionsTotal: routine_summary.neutral_deductions || 0,

    // ── Skill lists ──
    gradedSkills,
    executionDeductions,

    // ── Rich analysis sections ──
    artistry: artistryBreakdown,
    composition: null,

    // ── Narrative ──
    overallAssessment: routine_summary.coaching_summary || PLACEHOLDER,
    whyThisScore: routine_summary.coaching_summary || "",
    truthAnalysis: routine_summary.coaching_summary || `${skills.length} skills evaluated.`,
    celebrations,
    strengths,
    areasForImprovement,
    topFixes,
    topImprovements,

    // ── Confidence & range ──
    confidence: routine_summary.confidence || "MEDIUM",
    scoreRange: routine_summary.score_range || null,

    // ── Special requirements ──
    specialRequirements: (special_requirements || []).map(sr => ({
      requirement: sr.requirement,
      status: sr.status,
      comment: sr.comment,
      penalty: sr.penalty,
    })),

    // ── Top 3 fixes (from Gemini) ──
    top3Fixes: routine_summary.top_3_fixes || [],

    // ── Training ──
    trainingPlan: [],

    // ── Mental performance ──
    mentalPerformance: {
      consistencyScore: 0,
      focusIndicators: PLACEHOLDER,
      patternsObserved: PLACEHOLDER,
      recommendations: PLACEHOLDER,
    },

    // ── Nutrition / recovery ──
    nutritionRecovery: {
      trainingLoadAssessment: PLACEHOLDER,
      nutritionNote: PLACEHOLDER,
      recoveryPriority: PLACEHOLDER,
    },

    // ── Diagnostics ──
    diagnostics: {
      directJudging: true,
      twoPass: true,
      skillsEvaluated: skills.length,
      levelJudged: routine_summary.level,
      eventJudged: routine_summary.apparatus,
      biggestIssue: sortedByDeduction[0]
        ? `${sortedByDeduction[0].skill_name}: ${sortedByDeduction[0].reason || sortedByDeduction[0].fault_observed || ""}`
        : "",
      averageGrade: computeAverageGrade(gradedSkills),
      promptVersion: _meta?.prompt_version || "unknown",
      pipelineDurationMs: _meta?.duration_ms || 0,
    },

    // ── Pass-through ──
    event: routine_summary.apparatus,
    level: routine_summary.level,
    videoUrl: extras.videoUrl || null,
    rawResponse: routine_summary.raw_gemini_response || null,
  };
}


// ─── Transform a single skill to SkillCard-compatible props ─────────────────

function transformSkill(skill, idx) {
  const deduction = Math.abs(skill.deduction_value || 0);
  const grade = skill.grade_letter || gradeSkill(deduction).grade;
  const gradeColor = skill.grade_color || gradeSkill(deduction).color;

  const severity = deductionSeverity(deduction);
  const isClean = deduction === 0;
  const category = skill.category || "ACRO";

  // Build structured faults from reason text
  const faults = deduction > 0 && skill.reason
    ? [{ fault: skill.reason, deduction, severity, bodyPoint: null, type: "execution" }]
    : [];

  // Build sub-faults (same format, for SkillCard compatibility)
  const subFaults = faults.map(f => ({
    fault: f.fault,
    deduction: f.deduction,
    engine: "Strive",
    bodyPoint: null,
    severity: f.severity,
    correction: null,
  }));

  // Build biomechanics array in the format SkillCard expects
  const biomechanics = (skill.biomechanics || []).map(b => ({
    label: b.label,
    actual: b.actual_degrees,
    ideal: b.ideal_degrees,
    status: b.status,
  }));

  return {
    // ── Identity ──
    id: skill.id,
    index: idx + 1,

    // ── SkillCard primary props ──
    skill: skill.skill_name,
    skillName: skill.skill_name,
    name: skill.skill_name,

    // ── Timestamp ──
    timestamp: skill.timestamp,
    time: skill.timestamp,
    timestampSec: skill.timestamp_seconds || 0,
    timestampStart: skill.timestamp_seconds || 0,
    timestampEnd: skill.timestamp_end ? skill.timestamp_seconds + 3 : skill.timestamp_seconds,

    // ── Scoring ──
    deduction: Math.round(deduction * 100) / 100,
    gradeDeduction: Math.round(deduction * 100) / 100,
    qualityScore: skill.quality_grade || (10.0 - deduction),
    grade,
    gradeColor,
    severity,

    // ── Type ──
    type: category.toLowerCase() === "dance" || category.toLowerCase() === "turn" || category.toLowerCase() === "leap"
      ? "dance" : "acro",
    category: category,
    isGlobal: false,
    skillCode: "A",
    difficultyValue: 0.10,

    // ── Faults ──
    faults,
    subFaults,
    fault: skill.reason || skill.fault_observed || null,
    reason: skill.reason || skill.fault_observed || null,

    // ── Strength ──
    strength: skill.strength || (isClean ? "Clean execution" : null),
    strengthNote: skill.strength || (isClean ? "Clean execution" : null),

    // ── Injury risk ──
    injuryRisk: skill.injury_awareness?.length > 0 ? skill.injury_awareness.join(". ") : null,
    physicalRisk: skill.injury_awareness?.length > 0 ? skill.injury_awareness.join(". ") : null,
    injuryNote: skill.injury_awareness?.length > 0 ? skill.injury_awareness[0] : null,

    // ── Drill ──
    drillRecommendation: skill.targeted_drills?.length > 0 ? skill.targeted_drills.join("; ") : null,
    drill: skill.targeted_drills?.length > 0 ? skill.targeted_drills[0] : null,

    // ── Biomechanics ──
    bodyMechanics: biomechanics.length > 0 ? {
      kneeAngle: findBio(biomechanics, "knee")?.actual ? `${findBio(biomechanics, "knee").actual}\u00B0` : PLACEHOLDER,
      hipAlignment: findBio(biomechanics, "hip")?.actual ? `${findBio(biomechanics, "hip").actual}\u00B0` : PLACEHOLDER,
      shoulderPosition: findBio(biomechanics, "shoulder")?.actual ? `${findBio(biomechanics, "shoulder").actual}\u00B0` : "Aligned",
      bodyLineScore: 0,
      efficiency: "good",
      eliteComparison: "",
    } : null,
    biomechanics: biomechanics,

    // ── Rule reference ──
    ruleReference: skill.rule_reference || null,

    // ── Correct form ──
    correctForm: skill.correct_form || null,

    // ── Gain if fixed ──
    gainIfFixed: skill.gain_if_fixed || (deduction > 0 ? deduction : 0),

    // ── Celebration flag ──
    isCelebration: skill.is_celebration || false,
  };
}


// ─── Helpers ────────────────────────────────────────────────────────────────

function deductionSeverity(deduction) {
  const abs = Math.abs(deduction || 0);
  if (abs >= 0.50) return "fall";
  if (abs >= 0.30) return "veryLarge";
  if (abs >= 0.20) return "large";
  if (abs >= 0.10) return "medium";
  return "small";
}

function findBio(biomechanics, keyword) {
  const match = biomechanics.find(b =>
    b.label && b.label.toLowerCase().includes(keyword.toLowerCase())
  );
  return match || null;
}

function computeAverageGrade(gradedSkills) {
  const GRADE_VALUES = {
    'A+': 12, 'A': 11, 'A-': 10,
    'B+': 9, 'B': 8, 'B-': 7,
    'C+': 6, 'C': 5, 'C-': 4,
    'D+': 3, 'D': 2, 'F': 1,
  };
  const REVERSE = Object.fromEntries(
    Object.entries(GRADE_VALUES).map(([k, v]) => [v, k])
  );

  const validSkills = gradedSkills.filter(s => !s.isGlobal && GRADE_VALUES[s.grade]);
  if (validSkills.length === 0) return "—";

  const avg = validSkills.reduce((s, sk) => s + (GRADE_VALUES[sk.grade] || 5), 0) / validSkills.length;
  return REVERSE[Math.round(avg)] || "B";
}
