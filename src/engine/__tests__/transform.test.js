import { transformForUI } from "../transform";

// Canonical pipeline result shape — matches validatePipelineResult output
const makePipelineResult = () => ({
  routine_summary: {
    apparatus: "floor_exercise",
    duration_seconds: 70,
    d_score: 10.0,
    e_score: 9.4,
    final_score: 9.40,
    total_deductions: 0.60,
    neutral_deductions: 0,
    level: "Level 6",
    level_estimated: "Level 6",
    athlete_name: "Emma",
    coaching_summary: "Solid routine with minor execution errors.",
    celebrations: ["Great tumbling power", "Clean full turn"],
    top_3_fixes: ["Straighten knees on landing"],
    artistry: null,
    confidence: "HIGH",
    score_range: { low: 9.30, high: 9.50 },
    raw_gemini_response: "",
  },
  skills: [
    {
      id: "skill_1",
      skill_name: "Round-off Back Handspring Back Tuck",
      skill_order: 1,
      timestamp: "0:05",
      timestamp_start: 5,
      timestamp_end: 8,
      executed_successfully: true,
      difficulty_value: 0.30,
      deduction_value: 0.10,
      deductions: [
        { type: "bent_knees", body_part: "knees", description: "Slight bent knees on landing", point_value: 0.10 },
      ],
      quality_grade: 9.90,
      reason: "Slight bent knees on landing",
      rule_reference: "Execution: bent knees -0.10",
      is_celebration: false,
      strength_note: "Powerful tumbling with good height",
      category: "ACRO",
      biomechanics: {
        peak_joint_angles: { hips: 175, knees: 165, shoulders: 180 },
        body_line_score: 8,
        efficiency_rating: 9,
        notes: "Good body line through flight",
      },
      injury_risk: {
        level: "medium",
        body_part: "knees",
        description: "Impact on bent knees increases joint stress",
        prevention_note: "Practice soft landings with progressive impact",
      },
      elite_comparison: "Elite gymnasts land with full knee extension and chest up.",
      corrective_drill: {
        name: "Rebound Drill",
        description: "Rebound drills focusing on knee extension at landing",
        sets_reps: "3x10",
      },
      fault_observed: "Slight bent knees on landing",
      strength: "Powerful tumbling with good height",
      correct_form: "Lock knees through landing",
      injury_awareness: ["Minor landing impact on knees"],
      targeted_drills: ["Rebound drills focusing on knee extension at landing"],
      gain_if_fixed: 0.10,
    },
    {
      id: "skill_2",
      skill_name: "Split Leap",
      skill_order: 2,
      timestamp: "0:15",
      timestamp_start: 15,
      timestamp_end: 17,
      executed_successfully: true,
      difficulty_value: 0.20,
      deduction_value: 0,
      deductions: [],
      quality_grade: 10.0,
      reason: "",
      rule_reference: "",
      is_celebration: true,
      strength_note: "Full 180\u00B0 split with pointed toes",
      category: "LEAP",
      biomechanics: {
        peak_joint_angles: { hips: 180, knees: 180, shoulders: 160 },
        body_line_score: 10,
        efficiency_rating: 10,
        notes: "Perfect split position",
      },
      injury_risk: { level: "low", body_part: "", description: "", prevention_note: "" },
      elite_comparison: "Matches elite form for this element.",
      corrective_drill: { name: "", description: "", sets_reps: "" },
      fault_observed: null,
      strength: "Full 180\u00B0 split with pointed toes",
      correct_form: null,
      injury_awareness: [],
      targeted_drills: [],
      gain_if_fixed: 0,
    },
  ],
  special_requirements: [],
  training_plan: [
    {
      priority: 1,
      deduction_targeted: "Bent knees on landing",
      drill_name: "Soft Landing Drill",
      drill_description: "Progressive landing with focus on knee extension",
      frequency: "3x/week",
      expected_improvement: "Reduce knee bend by 15 degrees within 4 weeks",
    },
  ],
  mental_performance: {
    focus_indicators: "Strong focus throughout routine",
    consistency_patterns: "Consistent energy, slight hesitation before tumbling",
    athlete_recommendations: "Practice pre-routine visualization",
  },
  nutrition_note: "Ensure adequate protein intake post-practice for recovery",
  _meta: {
    prompt_version: "v12_2pass_engine",
    duration_ms: 4500,
    score_breakdown: {
      d_score: 10.0,
      e_score: 9.40,
      execution_deductions: 0.10,
      artistry_deductions: 0,
      total_deductions: 0.10,
    },
  },
});

describe("transform.js", () => {
  let result;

  beforeAll(() => {
    result = transformForUI(makePipelineResult());
  });

  test("core scores are present", () => {
    expect(result.startValue).toBe(10.0);
    expect(result.finalScore).toBe(9.40);
    expect(typeof result.totalDeductions).toBe("number");
    expect(typeof result.dScore).toBe("number");
    expect(typeof result.eScore).toBe("number");
  });

  test("gradedSkills has correct length", () => {
    expect(result.gradedSkills).toHaveLength(2);
  });

  test("skill card props have all required fields", () => {
    const skill = result.gradedSkills[0];
    // Identity
    expect(skill.id).toBe("skill_1");
    expect(skill.index).toBe(1);
    // Triple fallback name
    expect(skill.skill).toBe("Round-off Back Handspring Back Tuck");
    expect(skill.skillName).toBe("Round-off Back Handspring Back Tuck");
    expect(skill.name).toBe("Round-off Back Handspring Back Tuck");
    // Timestamp
    expect(skill.timestamp).toBeDefined();
    expect(skill.timestampSec).toBe(5);
    // Scoring
    expect(skill.deduction).toBe(0.10);
    expect(skill.difficultyValue).toBe(0.30);
    // Faults (from deductions sub-array)
    expect(skill.faults).toHaveLength(1);
    expect(skill.faults[0].fault).toContain("bent knees");
    expect(skill.faults[0].bodyPoint).toBe("knees");
    expect(skill.faults[0].deduction).toBe(0.10);
    expect(skill.subFaults).toHaveLength(1);
    // Biomechanics (canonical shape)
    expect(skill.bodyMechanics).toBeDefined();
    expect(skill.bodyMechanics.kneeAngle).toContain("165");
    expect(skill.bodyMechanics.hipAlignment).toContain("175");
    expect(skill.bodyMechanics.bodyLineScore).toBe(8);
    expect(skill.bodyMechanics.efficiency).toBe(9);
    // Injury risk
    expect(skill.injuryRisk).toContain("Impact on bent knees");
    expect(skill.injuryLevel).toBe("medium");
    expect(skill.injuryBodyPart).toBe("knees");
    // Drill (canonical)
    expect(skill.drillRecommendation).toContain("Rebound Drill");
    expect(skill.drillSetsReps).toBe("3x10");
    // Elite comparison
    expect(skill.eliteComparison).toContain("Elite gymnasts");
  });

  test("clean skill has no faults", () => {
    const skill = result.gradedSkills[1];
    expect(skill.deduction).toBe(0);
    expect(skill.faults).toHaveLength(0);
    expect(skill.isCelebration).toBe(true);
    expect(skill.injuryRisk).toBeNull();
  });

  test("execution deductions are granular per-fault", () => {
    expect(result.executionDeductions.length).toBeGreaterThanOrEqual(1);
    expect(result.executionDeductions[0].bodyPart).toBe("knees");
  });

  test("narrative fields are populated", () => {
    expect(result.overallAssessment).toContain("Solid routine");
    expect(result.celebrations).toHaveLength(2);
  });

  test("training plan from Pass 2 is mapped", () => {
    expect(result.trainingPlan).toHaveLength(1);
    expect(result.trainingPlan[0].drillName).toBe("Soft Landing Drill");
    expect(result.trainingPlan[0].frequency).toBe("3x/week");
  });

  test("mental performance from Pass 2 is mapped", () => {
    expect(result.mentalPerformance.focusIndicators).toContain("Strong focus");
    expect(result.mentalPerformance.consistencyPatterns).toContain("Consistent energy");
  });

  test("nutrition note from Pass 2 is mapped", () => {
    expect(result.nutritionRecovery.nutritionNote).toContain("protein");
  });

  test("diagnostics are present", () => {
    expect(result.diagnostics.directJudging).toBe(true);
    expect(result.diagnostics.twoPass).toBe(true);
    expect(result.diagnostics.skillsEvaluated).toBe(2);
    expect(result.diagnostics.levelJudged).toBe("Level 6");
    expect(result.diagnostics.scoreBreakdown).toBeDefined();
  });

  test("no AI branding leaks", () => {
    const json = JSON.stringify(result).toLowerCase();
    expect(json).not.toContain("gemini");
    expect(json).not.toContain("claude");
    expect(json).not.toContain("anthropic");
  });
});
