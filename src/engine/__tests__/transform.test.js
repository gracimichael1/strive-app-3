import { transformForUI } from "../transform";

const makePipelineResult = () => ({
  routine_summary: {
    apparatus: "floor_exercise",
    duration_seconds: 70,
    d_score: 10.0,
    e_score: 9.4,
    final_score: 9.40,
    neutral_deductions: 0,
    level: "Level 6",
    athlete_name: "Emma",
    why_this_score: "Solid routine with minor execution errors.",
    celebrations: ["Great tumbling power", "Clean full turn"],
  },
  skills: [
    {
      id: "skill_1",
      skill_name: "Round-off Back Handspring Back Tuck",
      skill_code: "C",
      timestamp_start: 5,
      timestamp_end: 9,
      executed_successfully: true,
      difficulty_value: 0.30,
      deductions: [
        { type: "bent_knees", description: "Slight bent knees on landing", point_value: 0.10, body_part: "knees", severity: "medium" },
      ],
      biomechanics: {
        hip_angle_at_peak: 172,
        knee_angle_at_peak: 165,
        shoulder_alignment: "aligned",
        body_line_score: 8.5,
        efficiency_rating: "good",
        elite_comparison: "Close to elite hip extension.",
      },
      injury_risk: { level: "low", body_part: "knees", description: "Minor landing impact", prevention_note: "Strengthen quads" },
      strength_note: "Powerful tumbling with good height.",
      drill_recommendation: "Rebound drills focusing on knee extension at landing.",
      _computed: { total_deduction: 0.10, grade: "B+", grade_color: "#a3e635" },
    },
    {
      id: "skill_2",
      skill_name: "Split Leap",
      skill_code: "A",
      timestamp_start: 15,
      timestamp_end: 17,
      executed_successfully: true,
      difficulty_value: 0.10,
      deductions: [],
      biomechanics: null,
      injury_risk: { level: "none", body_part: null, description: null, prevention_note: null },
      strength_note: "Full 180° split with pointed toes.",
      drill_recommendation: null,
      _computed: { total_deduction: 0, grade: "A", grade_color: "#22c55e" },
    },
  ],
  training_plan: [
    {
      deduction_targeted: "bent_knees",
      skill_id: "skill_1",
      drill_name: "Wall Sits",
      drill_description: "Hold wall sit position for 30 seconds, focusing on knee extension.",
      frequency: "3 sets daily",
      expected_improvement: "Cleaner landings within 2 weeks",
    },
  ],
  mental_performance: {
    consistency_score: 8.5,
    focus_indicators: "Strong focus throughout",
    patterns_observed: "Consistent energy",
    recommendations: "Continue pre-routine visualization",
  },
  nutrition_recovery: {
    training_load_assessment: "Moderate load",
    nutrition_note: "Good hydration",
    recovery_priority: "Stretch hamstrings",
  },
  _meta: {
    prompt_version: "v8_2pass",
    duration_ms: 4500,
    score_breakdown: {
      execution_deductions: 0.10,
      artistry_deductions: 0,
      composition_deductions: 0,
      total_deductions: 0.10,
      all_deductions: [],
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
    expect(skill.timestamp).toBe("0:05");
    expect(skill.time).toBe("0:05");
    // Scoring
    expect(skill.deduction).toBe(0.10);
    expect(skill.grade).toBe("B+");
    expect(skill.gradeColor).toBe("#a3e635");
    // Faults
    expect(skill.faults).toHaveLength(1);
    expect(skill.subFaults).toHaveLength(1);
    expect(skill.fault).toContain("bent knees");
    // Biomechanics
    expect(skill.bodyMechanics).not.toBeNull();
    expect(skill.bodyMechanics.kneeAngle).toBe("165°");
    expect(skill.biomechanics.knee_angle_at_peak).toBe(165);
    // Injury risk
    expect(skill.injuryRisk).toBeTruthy();
    expect(skill.injuryNote).toBe("Strengthen quads");
    // Drill
    expect(skill.drillRecommendation).toContain("Rebound");
    // Legacy
    expect(skill.engine).toBe("Strive");
  });

  test("clean skill has grade A and no faults", () => {
    const skill = result.gradedSkills[1];
    expect(skill.grade).toBe("A");
    expect(skill.faults).toHaveLength(0);
    expect(skill.fault).toBeNull();
    expect(skill.injuryRisk).toBeNull();
  });

  test("narrative fields are populated", () => {
    expect(result.overallAssessment).toContain("Solid routine");
    expect(result.celebrations).toHaveLength(2);
    expect(result.topFixes.length).toBeGreaterThan(0);
  });

  test("training plan is mapped", () => {
    expect(result.trainingPlan).toHaveLength(1);
    expect(result.trainingPlan[0].drillName).toBe("Wall Sits");
  });

  test("mental performance is mapped", () => {
    expect(result.mentalPerformance.consistencyScore).toBe(8.5);
  });

  test("nutrition recovery is mapped", () => {
    expect(result.nutritionRecovery.trainingLoadAssessment).toBe("Moderate load");
  });

  test("diagnostics are present", () => {
    expect(result.diagnostics.directJudging).toBe(true);
    expect(result.diagnostics.skillsEvaluated).toBe(2);
    expect(result.diagnostics.levelJudged).toBe("Level 6");
  });

  test("no AI branding leaks", () => {
    const json = JSON.stringify(result).toLowerCase();
    expect(json).not.toContain("gemini");
    expect(json).not.toContain("claude");
    expect(json).not.toContain("anthropic");
  });
});
