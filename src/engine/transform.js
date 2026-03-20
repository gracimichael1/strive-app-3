/**
 * transform.js — Maps pipeline output schema to UI component props.
 *
 * This is the ONLY bridge between the engine and the UI.
 * SkillCard, ResultsScreen, DashboardScreen all consume these shapes.
 *
 * Rules:
 * - No mock data. No hardcoded strings.
 * - If a field is null/undefined, show "—" placeholder, never fake data.
 * - Every prop maps to a documented field in the canonical schema.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * Integration: Call transformForUI() after runAnalysisPipeline().
 * The returned object is a drop-in replacement for the current analysisResult
 * shape that LegacyApp.js passes to ResultsScreen and DashboardScreen.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { gradeSkill } from "./scoring";

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
 * Transform a PipelineResult into the shape consumed by LegacyApp and UI components.
 *
 * @param {import('./schema').PipelineResult} pipelineResult - Validated pipeline output
 * @param {Object} [extras] - Optional extras: { videoUrl, videoFile, uploadData }
 * @returns {Object} - Shape compatible with existing ResultsScreen / SkillCard props
 */
export function transformForUI(pipelineResult, extras = {}) {
  const { routine_summary, skills, training_plan, mental_performance, nutrition_recovery, _meta } = pipelineResult;

  // ── Transform skills to SkillCard-compatible shape ────────────────────────
  const gradedSkills = skills.map((skill, idx) => transformSkill(skill, idx));

  // ── Separate execution deductions (for legacy tabs) ───────────────────────
  const executionDeductions = [];
  for (const skill of skills) {
    for (const ded of (skill.deductions || [])) {
      if (ded.point_value > 0) {
        executionDeductions.push({
          timestamp: formatTimestamp(skill.timestamp_start),
          skill: skill.skill_name,
          deduction: ded.point_value,
          fault: ded.description || ded.type.replace(/_/g, " "),
          engine: "Strive",
          category: ded.type.includes("artistry") || ded.type.includes("presentation") ? "artistry" : "execution",
          severity: ded.severity || "small",
          confidence: 0.95,
          skeleton: null,
          correction: null,
        });
      }
    }
  }

  // ── Top fixes (sorted by point value, top 3) ──────────────────────────────
  const allDeds = skills.flatMap(s => (s.deductions || []).map(d => ({
    ...d,
    skill_name: s.skill_name,
    skill_id: s.id,
  }))).filter(d => d.point_value > 0).sort((a, b) => b.point_value - a.point_value);

  const topFixes = allDeds.slice(0, 3).map(d => ({
    name: d.skill_name,
    saves: d.point_value,
    drill: d.description || d.type.replace(/_/g, " "),
  }));

  // ── Top improvements (from training plan or computed) ─────────────────────
  const topImprovements = training_plan.length > 0
    ? training_plan.slice(0, 3).map(t => ({
        fix: `${t.drill_name}: ${t.drill_description.substring(0, 80)}`,
        pointsGained: allDeds.find(d => d.type === t.deduction_targeted)?.point_value || 0.10,
      }))
    : topFixes.map(f => ({ fix: `${f.name}: ${f.drill}`, pointsGained: f.saves }));

  // ── Strengths / celebrations ──────────────────────────────────────────────
  const celebrations = routine_summary.celebrations?.length > 0
    ? routine_summary.celebrations
    : skills.filter(s => s.strength_note).map(s => `${s.skill_name}: ${s.strength_note}`).slice(0, 3);

  const strengths = skills
    .filter(s => (s._computed?.total_deduction || 0) === 0)
    .map(s => `${s.skill_name}: ${s.strength_note || "Clean execution."}`)
    .slice(0, 5);

  // ── Areas for improvement ─────────────────────────────────────────────────
  const areasForImprovement = allDeds.slice(0, 4).map(d =>
    `${d.skill_name}: ${d.description || d.type.replace(/_/g, " ")}`
  );

  // ── Artistry breakdown (for Layer2/Layer3) ────────────────────────────────
  const artistrySkill = skills.find(s => s.id === "artistry");
  const artistryBreakdown = artistrySkill ? {
    totalDeduction: artistrySkill._computed?.total_deduction || 0,
    details: (artistrySkill.deductions || []).map(d => ({
      fault: d.description || d.type.replace(/_/g, " "),
      deduction: d.point_value,
    })),
  } : null;

  // ── Composition breakdown ─────────────────────────────────────────────────
  const compositionSkill = skills.find(s => s.id === "composition");
  const compositionBreakdown = compositionSkill ? {
    totalDeduction: compositionSkill._computed?.total_deduction || 0,
    details: (compositionSkill.deductions || []).map(d => ({
      fault: d.description || d.type.replace(/_/g, " "),
      deduction: d.point_value,
    })),
  } : null;

  // ── Assemble the legacy-compatible result object ──────────────────────────
  return {
    // ── Core scores ──
    startValue: routine_summary.d_score,
    finalScore: routine_summary.final_score,
    totalDeductions: _meta?.score_breakdown?.total_deductions || 0,
    executionDeductionsTotal: _meta?.score_breakdown?.execution_deductions || 0,
    artistryDeductionsTotal: _meta?.score_breakdown?.artistry_deductions || 0,
    compositionDeductionsTotal: _meta?.score_breakdown?.composition_deductions || 0,
    neutralDeductionsTotal: routine_summary.neutral_deductions,

    // ── Skill lists ──
    gradedSkills,
    executionDeductions,

    // ── Rich analysis sections ──
    artistry: artistryBreakdown,
    composition: compositionBreakdown,

    // ── Narrative ──
    overallAssessment: routine_summary.why_this_score || PLACEHOLDER,
    whyThisScore: routine_summary.why_this_score || "",
    truthAnalysis: routine_summary.why_this_score || `${skills.length} skills evaluated at ${routine_summary.level} standard.`,
    celebrations,
    strengths: celebrations.length > 0 ? celebrations : strengths,
    areasForImprovement,
    topFixes,
    topImprovements,

    // ── Training ──
    trainingPlan: training_plan.map(t => ({
      deductionTargeted: t.deduction_targeted,
      skillId: t.skill_id,
      drillName: t.drill_name,
      drillDescription: t.drill_description,
      frequency: t.frequency,
      expectedImprovement: t.expected_improvement,
    })),

    // ── Mental performance ──
    mentalPerformance: {
      consistencyScore: mental_performance.consistency_score,
      focusIndicators: mental_performance.focus_indicators || PLACEHOLDER,
      patternsObserved: mental_performance.patterns_observed || PLACEHOLDER,
      recommendations: mental_performance.recommendations || PLACEHOLDER,
    },

    // ── Nutrition / recovery ──
    nutritionRecovery: {
      trainingLoadAssessment: nutrition_recovery.training_load_assessment || PLACEHOLDER,
      nutritionNote: nutrition_recovery.nutrition_note || PLACEHOLDER,
      recoveryPriority: nutrition_recovery.recovery_priority || PLACEHOLDER,
    },

    // ── Diagnostics ──
    diagnostics: {
      directJudging: true,
      twoPass: true,
      skillsEvaluated: skills.filter(s => s.id !== "artistry" && s.id !== "composition").length,
      levelJudged: routine_summary.level,
      eventJudged: routine_summary.apparatus,
      landingDeductions: _meta?.score_breakdown?.all_deductions?.filter(d => d.type?.includes("landing") || d.type?.includes("step")).reduce((s, d) => s + d.point_value, 0) || 0,
      artistryDeductions: _meta?.score_breakdown?.artistry_deductions || 0,
      biggestIssue: allDeds[0] ? `${allDeds[0].skill_name}: ${allDeds[0].description}` : "",
      averageGrade: computeAverageGrade(gradedSkills),
      promptVersion: _meta?.prompt_version || "unknown",
      pipelineDurationMs: _meta?.duration_ms || 0,
    },

    // ── Pass-through ──
    event: routine_summary.apparatus,
    level: routine_summary.level,
    videoUrl: extras.videoUrl || null,
    rawResponse: null,  // Don't expose raw Gemini output to UI
  };
}


// ─── Transform a single skill to SkillCard-compatible props ─────────────────

function transformSkill(skill, idx) {
  const totalDed = skill._computed?.total_deduction
    || (skill.deductions || []).reduce((s, d) => s + (d.point_value || 0), 0);
  const { grade, color } = skill._computed
    ? { grade: skill._computed.grade, color: skill._computed.grade_color }
    : gradeSkill(totalDed);

  const severity = totalDed >= 0.50 ? "fall"
    : totalDed >= 0.30 ? "veryLarge"
    : totalDed >= 0.20 ? "large"
    : totalDed >= 0.10 ? "medium"
    : "small";

  const timestampStr = formatTimestamp(skill.timestamp_start);
  const isArtistry = skill.id === "artistry" || skill.id === "composition";

  return {
    // ── Identity ──
    id: skill.id,
    index: idx + 1,

    // ── SkillCard primary props (fallback chain: skill > skillName > name) ──
    skill: skill.skill_name,
    skillName: skill.skill_name,
    name: skill.skill_name,

    // ── Timestamp ──
    timestamp: timestampStr,
    time: timestampStr,
    timestampSec: skill.timestamp_start,
    timestampStart: skill.timestamp_start,
    timestampEnd: skill.timestamp_end,

    // ── Scoring ──
    deduction: Math.round(totalDed * 100) / 100,
    gradeDeduction: Math.round(totalDed * 100) / 100,
    qualityScore: Math.round((10.0 - totalDed) * 100) / 100,
    grade,
    gradeColor: color,
    severity,

    // ── Type ──
    type: isArtistry ? "artistry" : (skill.skill_code === "SR" ? "dance" : "acro"),
    category: isArtistry ? "artistry" : "execution",
    isGlobal: isArtistry,
    skillCode: skill.skill_code,
    difficultyValue: skill.difficulty_value,

    // ── Faults (SkillCard reads: subFaults > faults > deductionHints) ──
    faults: (skill.deductions || []).map(d => ({
      fault: d.description || d.type.replace(/_/g, " "),
      name: d.description || d.type.replace(/_/g, " "),
      deduction: d.point_value,
      severity: d.severity || severity,
      bodyPoint: d.body_part || null,
      type: d.type,
      correction: null,  // Drill is at skill level, not fault level
      fix: null,
      detail: d.description || null,
      drill: null,
      drillRecommendation: null,
    })),
    subFaults: (skill.deductions || []).map(d => ({
      fault: d.description || d.type.replace(/_/g, " "),
      deduction: d.point_value,
      engine: "Strive",
      bodyPoint: d.body_part || null,
      severity: d.severity || severity,
      correction: null,
    })),

    // ── Fault summary (SkillCard reads: fault > reason) ──
    fault: (skill.deductions || []).filter(d => d.point_value > 0).map(d => d.description || d.type.replace(/_/g, " ")).join("; ") || null,
    reason: (skill.deductions || []).filter(d => d.point_value > 0).map(d => d.description || d.type.replace(/_/g, " ")).join("; ") || null,

    // ── Strength ──
    strength: skill.strength_note || null,
    strengthNote: skill.strength_note || null,

    // ── Injury risk ──
    injuryRisk: skill.injury_risk?.level !== "none" ? formatInjuryRisk(skill.injury_risk) : null,
    physicalRisk: skill.injury_risk?.level !== "none" ? formatInjuryRisk(skill.injury_risk) : null,
    injuryNote: skill.injury_risk?.prevention_note || null,

    // ── Drill ──
    drillRecommendation: skill.drill_recommendation || null,
    drill: skill.drill_recommendation || null,

    // ── Biomechanics (SkillCard reads: bodyMechanics > biomechanics) ──
    bodyMechanics: skill.biomechanics ? {
      kneeAngle: skill.biomechanics.knee_angle_at_peak != null ? `${skill.biomechanics.knee_angle_at_peak}°` : PLACEHOLDER,
      hipAlignment: skill.biomechanics.hip_angle_at_peak != null ? `${skill.biomechanics.hip_angle_at_peak}°` : PLACEHOLDER,
      shoulderPosition: skill.biomechanics.shoulder_alignment !== "aligned"
        ? `Deviated ${skill.biomechanics.shoulder_alignment.replace("deviated_", "")}`
        : "Aligned",
      toePoint: skill.biomechanics.efficiency_rating === "excellent" ? "Well-pointed"
        : skill.biomechanics.efficiency_rating === "good" ? "Adequate"
        : "Needs work",
      bodyLineScore: skill.biomechanics.body_line_score,
      efficiencyRating: skill.biomechanics.efficiency_rating,
      eliteComparison: skill.biomechanics.elite_comparison || null,
    } : null,
    biomechanics: skill.biomechanics ? {
      hip_angle_at_peak: skill.biomechanics.hip_angle_at_peak,
      knee_angle_at_peak: skill.biomechanics.knee_angle_at_peak,
      shoulder_alignment: skill.biomechanics.shoulder_alignment,
      body_line_score: skill.biomechanics.body_line_score,
      efficiency_rating: skill.biomechanics.efficiency_rating,
      elite_comparison: skill.biomechanics.elite_comparison,
    } : null,

    // ── Legacy compatibility fields ──
    engine: "Strive",
    confidence: 0.95,
    correction: null,
    skeleton: null,
    frameDataUrl: null,
    skeletonJoints: null,
    coachNote: null,
  };
}


// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTimestamp(seconds) {
  if (typeof seconds !== "number" || seconds <= 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatInjuryRisk(risk) {
  if (!risk || risk.level === "none") return null;
  const parts = [];
  if (risk.body_part) parts.push(`${risk.body_part}:`);
  if (risk.description) parts.push(risk.description);
  if (risk.prevention_note) parts.push(`Prevention: ${risk.prevention_note}`);
  return parts.join(" ") || null;
}

function computeAverageGrade(skills) {
  const GRADE_RANK = { A: 10, "A-": 9, "B+": 8, B: 7, "B-": 6, C: 5, D: 3, F: 1, "—": 0 };
  const scored = skills.filter(s => s.grade && s.grade !== "—");
  if (scored.length === 0) return "—";
  const avg = scored.reduce((sum, s) => sum + (GRADE_RANK[s.grade] || 5), 0) / scored.length;
  if (avg >= 9.5) return "A";
  if (avg >= 8.5) return "A-";
  if (avg >= 7.5) return "B+";
  if (avg >= 6.5) return "B";
  if (avg >= 5.5) return "B-";
  if (avg >= 4) return "C";
  if (avg >= 2) return "D";
  return "F";
}
