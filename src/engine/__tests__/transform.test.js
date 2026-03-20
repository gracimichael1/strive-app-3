import { transformForUI } from "../transform";

// New pipeline result shape — matches what validatePipelineResult outputs
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
      timestamp: "0:05",
      timestamp_end: null,
      timestamp_seconds: 5,
      quality_grade: 9.90,
      deduction_value: 0.10,
      reason: "Slight bent knees on landing",
      rule_reference: "Execution: bent knees -0.10",
      is_celebration: false,
      category: "ACRO",
      biomechanics: [
        { label: "KNEE", actual_degrees: 165, ideal_degrees: 180, status: "needs_work" },
      ],
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
      timestamp: "0:15",
      timestamp_end: null,
      timestamp_seconds: 15,
      quality_grade: 10.0,
      deduction_value: 0,
      reason: "",
      rule_reference: "",
      is_celebration: true,
      category: "LEAP",
      biomechanics: [],
      fault_observed: null,
      strength: "Full 180\u00B0 split with pointed toes",
      correct_form: null,
      injury_awareness: [],
      targeted_drills: [],
      gain_if_fixed: 0,
    },
  ],
  special_requirements: [],
  training_plan: [],
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
    prompt_version: "v10_simple",
    duration_ms: 4500,
    score_breakdown: {
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
    // Faults
    expect(skill.fault).toContain("bent knees");
    // Biomechanics
    expect(skill.biomechanics).toHaveLength(1);
    expect(skill.biomechanics[0].label).toBe("KNEE");
    // Injury risk
    expect(skill.injuryRisk).toBeTruthy();
    // Drill
    expect(skill.drillRecommendation).toContain("Rebound");
  });

  test("clean skill has no faults", () => {
    const skill = result.gradedSkills[1];
    expect(skill.deduction).toBe(0);
    expect(skill.fault).toBeNull();
    expect(skill.isCelebration).toBe(true);
  });

  test("narrative fields are populated", () => {
    expect(result.overallAssessment).toContain("Solid routine");
    expect(result.celebrations).toHaveLength(2);
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
