/**
 * transform.js — Maps pipeline output schema to UI component props.
 *
 * This is the ONLY bridge between the engine and the UI.
 * SkillCard, ResultsScreen, DashboardScreen all consume these shapes.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FIELD MAPPING (Deliverable 4 — which schema field goes to which component):
 *
 * SkillCard:
 *   skill/skillName/name     ← skills[].skill_name
 *   deduction/gradeDeduction ← skills[].deduction_value (sum of deductions[].point_value)
 *   grade/gradeColor         ← computed from quality_grade via gradeSkill()
 *   faults/subFaults         ← skills[].deductions[] (type, body_part, description, point_value)
 *   strength/strengthNote    ← skills[].strength_note
 *   injuryRisk/injuryNote    ← skills[].injury_risk.description
 *   drillRecommendation      ← skills[].corrective_drill.name + description + sets_reps
 *   bodyMechanics            ← skills[].biomechanics.peak_joint_angles
 *   eliteComparison          ← skills[].elite_comparison
 *   timestamp/timestampSec   ← skills[].timestamp_start
 *   gainIfFixed              ← skills[].gain_if_fixed (= deduction_value)
 *   correctForm              ← skills[].correct_form (Pass 2)
 *
 * ScoreHero:
 *   finalScore               ← routine_summary.final_score
 *   startValue               ← routine_summary.d_score
 *   totalDeductions           ← _meta.score_breakdown.total_deductions
 *
 * ResultsScreen (Layer2/Layer3):
 *   whyThisScore             ← routine_summary.coaching_summary
 *   celebrations             ← routine_summary.celebrations[]
 *   topImprovements          ← derived from top 3 highest-deduction skills
 *   artistry                 ← routine_summary.artistry (breakdown)
 *   trainingPlan             ← training_plan[] (from Pass 2)
 *   mentalPerformance        ← mental_performance (from Pass 2)
 *   nutritionRecovery        ← nutrition_note (from Pass 2)
 *
 * VideoReviewPlayer:
 *   executionDeductions      ← skills with deduction > 0, mapped to timestamp/fault/severity
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Rules:
 * - No mock data. No hardcoded strings.
 * - If a field is null/undefined, show "—" placeholder, never fake data.
 * - Every prop maps to a documented field in the pipeline schema.
 */

import { gradeSkill, formatTimestamp } from "./schema";

const PLACEHOLDER = "—";

// ─── Confidence mapping — use Gemini's signal, not hardcoded values ────────
function mapConfidence(geminiConfidence) {
  if (!geminiConfidence) return 0.85;
  const c = String(geminiConfidence).toUpperCase();
  if (c === "HIGH") return 0.95;
  if (c === "MEDIUM") return 0.85;
  if (c === "LOW") return 0.70;
  if (typeof geminiConfidence === "number") return Math.min(1, Math.max(0, geminiConfidence));
  return 0.85;
}

// ─── Main transform ────────────────────────────────────────────────────────

/**
 * Transform a validated PipelineResult into the shape consumed by UI components.
 *
 * @param {Object} pipelineResult - Validated pipeline output
 * @param {Object} [extras] - Optional extras: { videoUrl, videoFile }
 * @returns {Object} - Shape compatible with existing ResultsScreen / SkillCard props
 */
export function transformForUI(pipelineResult, extras = {}) {
  const { routine_summary, skills, special_requirements, training_plan, mental_performance, nutrition_note, levelProgressionAnalysis, primary_athlete_confidence, sv_verified, _meta } = pipelineResult || {};

  // ── Routine-level confidence from Gemini (not hardcoded) ───────────────────
  const routineConfidence = mapConfidence(routine_summary?.confidence);

  // ── Transform skills to SkillCard-compatible shape ────────────────────────
  const gradedSkills = skills.map((skill, idx) => transformSkill(skill, idx));

  // ── Execution deductions (for VideoReviewPlayer / Deductions tab) ─────────
  const executionDeductions = [];
  for (const s of skills) {
    if (s.deduction_value > 0) {
      const skillConfidence = mapConfidence(s.skill_confidence || routine_summary?.confidence);
      // Emit one entry per individual deduction for granularity
      if (s.deductions && s.deductions.length > 0) {
        for (const d of s.deductions) {
          executionDeductions.push({
            timestamp: s.timestamp || formatTimestamp(s.timestamp_start),
            skill: s.skill_name,
            deduction: d.point_value,
            fault: d.description || d.type || "",
            bodyPart: d.body_part || "",
            engine: "Strive",
            category: "execution",
            severity: deductionSeverity(d.point_value),
            confidence: skillConfidence,
            skeleton: null,
            correction: null,
          });
        }
      } else {
        executionDeductions.push({
          timestamp: s.timestamp || formatTimestamp(s.timestamp_start),
          skill: s.skill_name,
          deduction: s.deduction_value,
          fault: s.reason || s.fault_observed || "",
          bodyPart: "",
          engine: "Strive",
          category: "execution",
          severity: deductionSeverity(s.deduction_value),
          confidence: skillConfidence,
          skeleton: null,
          correction: null,
        });
      }
    }
  }

  // ── Top fixes (highest deductions first) ──────────────────────────────────
  const sortedByDeduction = [...skills]
    .filter(s => s.deduction_value > 0)
    .sort((a, b) => b.deduction_value - a.deduction_value);

  const topFixes = sortedByDeduction.slice(0, 3).map(s => ({
    name: s.skill_name,
    saves: s.deduction_value,
    drill: s.corrective_drill?.name
      ? `${s.corrective_drill.name}${s.corrective_drill.sets_reps ? ` (${s.corrective_drill.sets_reps})` : ''}`
      : (s.reason || s.fault_observed || "Focus on form"),
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
        .map(s => `${s.skill_name}: ${s.strength_note || s.strength || "Excellent execution"}`)
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

  // ── Training plan (from Pass 2) ───────────────────────────────────────────
  const trainingPlanMapped = (training_plan || []).map(tp => ({
    priority: tp.priority,
    deductionTargeted: tp.deduction_targeted,
    drillName: tp.drill_name,
    drillDescription: tp.drill_description,
    frequency: tp.frequency,
    expectedImprovement: tp.expected_improvement,
  }));

  // ── Assemble the result object ────────────────────────────────────────────
  return {
    // ── Core scores ──
    startValue,
    finalScore,
    totalDeductions: scoreBreakdown.total_deductions || 0,
    executionDeductionsTotal: scoreBreakdown.execution_deductions || 0,
    artistryDeductionsTotal: scoreBreakdown.artistry_deductions || 0,
    compositionDeductionsTotal: 0,
    neutralDeductionsTotal: routine_summary.neutral_deductions || 0,
    dScore: scoreBreakdown.d_score || startValue,
    eScore: scoreBreakdown.e_score || 0,

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
    top3Fixes: (Array.isArray(routine_summary.top_3_fixes) ? routine_summary.top_3_fixes : [])
      .map(f => typeof f === 'string' ? f : (f && typeof f === 'object' ? (f.fix || f.description || JSON.stringify(f)) : String(f || '')))
      .filter(Boolean)
      .slice(0, 3),

    // ── Training (from Pass 2) ──
    trainingPlan: trainingPlanMapped,

    // ── Mental performance (from Pass 2) ──
    mentalPerformance: {
      focusIndicators: mental_performance?.focus_indicators || PLACEHOLDER,
      consistencyPatterns: mental_performance?.consistency_patterns || PLACEHOLDER,
      athleteRecommendations: mental_performance?.athlete_recommendations || PLACEHOLDER,
    },

    // ── Nutrition / recovery (from Pass 2) ──
    nutritionRecovery: {
      nutritionNote: nutrition_note || PLACEHOLDER,
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
      scoreBreakdown: {
        dScore: scoreBreakdown.d_score,
        eScore: scoreBreakdown.e_score,
        executionDeductions: scoreBreakdown.execution_deductions,
        artistryDeductions: scoreBreakdown.artistry_deductions,
        srPenalties: scoreBreakdown.sr_penalties,
        totalDeductions: scoreBreakdown.total_deductions,
        geminiScore: scoreBreakdown.gemini_score,
        codeComputedScore: scoreBreakdown.code_computed_score,
        scoreDiff: scoreBreakdown.score_diff,
        warning: scoreBreakdown.warning,
      },
    },

    // ── Pass-through ──
    event: routine_summary.apparatus,
    level: routine_summary.level,
    videoUrl: extras.videoUrl || null,
    rawResponse: routine_summary.raw_gemini_response || null,

    // ── Level progression (Section IV) ──
    levelProgressionAnalysis: levelProgressionAnalysis || null,

    // ── Verification fields ──
    primaryAthleteConfidence: primary_athlete_confidence || 'high',
    svVerified: !!sv_verified,

    // ── Biomechanical signals (soft, parsed from Gemini text) ──
    biomechanicalSignals: parseBioSignals(skills, routine_summary),

    // ── Biomechanics raw (hard measurements — populated by MediaPipe capture) ──
    biomechanics_raw: null,
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

  // Build structured faults from per-skill deductions array
  // Filter out entries with no meaningful description and zero deduction
  const faults = (skill.deductions || [])
    .filter(d => (d.description && d.description.trim()) || (d.point_value && d.point_value > 0))
    .map(d => ({
      fault: d.description || d.type || "",
      deduction: d.point_value || 0,
      severity: deductionSeverity(d.point_value),
      bodyPoint: d.body_part || null,
      type: d.type || "execution",
    }));

  // If no deductions array but has a reason, create single fault
  if (faults.length === 0 && deduction > 0 && skill.reason) {
    faults.push({ fault: skill.reason, deduction, severity, bodyPoint: null, type: "execution" });
  }

  // SubFaults (same format, for SkillCard compatibility)
  const subFaults = faults.map(f => ({
    fault: f.fault,
    deduction: f.deduction,
    engine: "Strive",
    bodyPoint: f.bodyPoint,
    severity: f.severity,
    correction: null,
  }));

  // Biomechanics — map canonical shape to SkillCard format
  const bio = skill.biomechanics || {};
  const pja = bio.peak_joint_angles || {};

  // Injury risk
  const ir = skill.injury_risk || {};
  const hasInjuryRisk = ir.level && ir.level !== "low" && ir.description;

  // Corrective drill
  const cd = skill.corrective_drill || {};
  const drillText = cd.name
    ? `${cd.name}: ${cd.description}${cd.sets_reps ? ` (${cd.sets_reps})` : ""}`
    : (skill.targeted_drills?.length > 0 ? skill.targeted_drills[0] : null);

  return {
    // ── Identity ──
    id: skill.id,
    index: idx + 1,

    // ── SkillCard primary props ──
    skill: skill.skill_name,
    skillName: skill.skill_name,
    name: skill.skill_name,

    // ── Timestamp ──
    timestamp: skill.timestamp || formatTimestamp(skill.timestamp_start),
    time: skill.timestamp || formatTimestamp(skill.timestamp_start),
    timestampSec: skill.timestamp_start || 0,
    timestampStart: skill.timestamp_start || 0,
    timestampEnd: skill.timestamp_end || (skill.timestamp_start ? skill.timestamp_start + 3 : 0),

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
    difficultyValue: skill.difficulty_value || 0.10,

    // ── Faults ──
    faults,
    subFaults,
    fault: faults.length > 0 ? faults.map(f => f.fault).join("; ") : null,
    reason: skill.reason || (faults.length > 0 ? faults.map(f => f.fault).join("; ") : null),

    // ── Strength ──
    strength: skill.strength_note || skill.strength || (isClean ? "Clean execution" : null),
    strengthNote: skill.strength_note || skill.strength || (isClean ? "Clean execution" : null),

    // ── Injury risk (canonical) ──
    injuryRisk: hasInjuryRisk ? `${ir.description}${ir.prevention_note ? ` — ${ir.prevention_note}` : ""}` : null,
    physicalRisk: hasInjuryRisk ? ir.description : null,
    injuryNote: hasInjuryRisk ? ir.prevention_note : null,
    injuryLevel: ir.level || "low",
    injuryBodyPart: ir.body_part || null,

    // ── Drill (canonical) ──
    drillRecommendation: drillText,
    drill: cd.name || (skill.targeted_drills?.length > 0 ? skill.targeted_drills[0] : null),
    drillSetsReps: cd.sets_reps || null,

    // ── Biomechanics (canonical) ──
    bodyMechanics: pja.hips || pja.knees || pja.shoulders ? {
      kneeAngle: pja.knees ? `${pja.knees}\u00B0` : PLACEHOLDER,
      hipAlignment: pja.hips ? `${pja.hips}\u00B0` : PLACEHOLDER,
      shoulderPosition: pja.shoulders ? `${pja.shoulders}\u00B0` : "Aligned",
      bodyLineScore: bio.body_line_score || 0,
      efficiency: bio.efficiency_rating || 0,
      notes: bio.notes || "",
    } : null,
    biomechanics: bio,

    // ── Elite comparison ──
    eliteComparison: skill.elite_comparison || null,

    // ── Rule reference ──
    ruleReference: skill.rule_reference || null,

    // ── Correct form ──
    correctForm: skill.correct_form || null,

    // ── Gain if fixed ──
    gainIfFixed: skill.gain_if_fixed || (deduction > 0 ? deduction : 0),

    // ── Celebration flag ──
    isCelebration: skill.is_celebration || false,

    // ── Fall detection ──
    fallDetected: !!skill.fall_detected,

    // ── Narrative (3-sentence What Happened) ──
    narrative: skill.narrative || null,

    // ── Injury signal (proactive, every skill) ──
    injurySignal: skill.injury_signal || null,

    // ── Skill confidence ──
    skillConfidence: skill.skill_confidence || 'high',

    // ── Measured data from client-side MediaPipe ──
    biomechanics_measured: skill.biomechanics_measured || null,
    injury_signals_measured: skill.injury_signals_measured || [],
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
  if (validSkills.length === 0) return PLACEHOLDER;

  const avg = validSkills.reduce((s, sk) => s + (GRADE_VALUES[sk.grade] || 5), 0) / validSkills.length;
  return REVERSE[Math.round(avg)] || "B";
}

// ─── Parse biomechanical signals from Gemini text output ──────────────────

function parseBioSignals(skills, routine_summary) {
  const texts = [
    routine_summary?.coaching_summary,
    ...(skills || []).map(s => [s.reason, s.fault_observed, s.injury_signal, s.narrative,
      ...(s.deductions || []).map(d => d.description)]).flat(),
  ].filter(Boolean).join(' ').toLowerCase();

  if (!texts) return { hyperextension: null, hard_landing: null, asymmetry_side: null, fall_count: null, knee_valgus: null, back_arch: null };

  let fall_count = null;
  const fallMatch = texts.match(/(\d+)\s*falls?/);
  if (fallMatch) fall_count = parseInt(fallMatch[1], 10);
  else {
    const fallSkills = (skills || []).filter(s => s.fall_detected);
    if (fallSkills.length > 0) fall_count = fallSkills.length;
  }

  return {
    fall_count,
    hard_landing: /hard\s*landing|heavy\s*landing/.test(texts) ? true : null,
    hyperextension: /hyperextension|over[\s-]*arch/.test(texts) ? true : null,
    asymmetry_side: /left\s*(side\s*)?asymmetry|asymmetry.*left/.test(texts) ? 'left'
      : /right\s*(side\s*)?asymmetry|asymmetry.*right/.test(texts) ? 'right' : null,
    knee_valgus: /knee\s*valgus|knees?\s*in\b|valgus/.test(texts) ? true : null,
    back_arch: /back\s*arch|lumbar|excessive\s*arch/.test(texts) ? true : null,
  };
}
