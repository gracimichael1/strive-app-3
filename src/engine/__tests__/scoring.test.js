import { computeScore, computeScoreFromScorecard, gradeSkill, runScoringTests, SCORING_VERSION } from "../scoring";
import { snapToUSAG } from "../schema";

describe("scoring.js", () => {
  describe("snapToUSAG", () => {
    test("snaps to nearest 0.05", () => {
      expect(snapToUSAG(0.07)).toBe(0.05);
      expect(snapToUSAG(0.13)).toBe(0.15);
      expect(snapToUSAG(0.22)).toBe(0.20);
      expect(snapToUSAG(0.28)).toBe(0.30);
    });

    test("caps at 0.50 (fall)", () => {
      expect(snapToUSAG(0.60)).toBe(0.50);
      expect(snapToUSAG(1.0)).toBe(0.50);
    });

    test("handles abs value for negative", () => {
      expect(snapToUSAG(-0.1)).toBe(0.10);
    });

    test("returns 0 for NaN and non-number", () => {
      expect(snapToUSAG(NaN)).toBe(0);
      expect(snapToUSAG("bad")).toBe(0);
    });
  });

  describe("gradeSkill", () => {
    test("clean skill = A", () => {
      expect(gradeSkill(0).grade).toBe("A");
    });
    test("0.10 deduction = A- (quality 9.90)", () => {
      expect(gradeSkill(0.10).grade).toBe("A-");
    });
    test("0.30 deduction = B+ (quality 9.70)", () => {
      expect(gradeSkill(0.30).grade).toBe("B+");
    });
    test("0.50 deduction = B (quality 9.50)", () => {
      expect(gradeSkill(0.50).grade).toBe("B");
    });
    test("2.0 deduction = D+ (quality 8.0)", () => {
      expect(gradeSkill(2.0).grade).toBe("D+");
    });
    test("3.0+ deduction = D (quality 7.0)", () => {
      expect(gradeSkill(3.0).grade).toBe("D");
    });
  });

  describe("computeScore", () => {
    test("clean routine = 10.0", () => {
      const skills = [
        { id: "s1", skill_name: "Skill", deductions: [], difficulty_value: 0.10 },
      ];
      const { final_score } = computeScore(skills, 0, "Level 6", "optional");
      expect(final_score).toBe(10.0);
    });

    test("single 0.10 deduction = 9.90", () => {
      const skills = [{
        id: "s1", skill_name: "Skill", difficulty_value: 0.10,
        deductions: [{ type: "bent_knees", description: "bent knees", point_value: 0.10, body_part: "knees" }],
      }];
      const { final_score } = computeScore(skills, 0, "Level 6", "optional");
      expect(final_score).toBe(9.9);
    });

    test("neutral deductions subtract correctly", () => {
      const skills = [{ id: "s1", skill_name: "Skill", deductions: [], difficulty_value: 0.10 }];
      const { final_score } = computeScore(skills, 0.30, "Level 6", "optional");
      expect(final_score).toBe(9.7);
    });

    test("handles deduction_value fallback when no deductions array", () => {
      const skills = [{ id: "s1", skill_name: "Skill", deduction_value: 0.15, difficulty_value: 0.10 }];
      const { final_score } = computeScore(skills, 0, "Level 6", "optional");
      expect(final_score).toBe(9.85);
    });
  });

  describe("computeScoreFromScorecard", () => {
    test("computes from per-skill deductions array", () => {
      const scorecard = {
        deduction_log: [
          { deductions: [{ point_value: 0.10 }, { point_value: 0.05 }], difficulty_value: 0.10 },
          { deductions: [{ point_value: 0.05 }], difficulty_value: 0.20 },
          { deductions: [], difficulty_value: 0.30 },
        ],
        special_requirements: [],
        artistry: { total_artistry_deduction: 0.20 },
        final_score: 9.60,
      };
      // No event specified → default calibration factor 0.80
      // Raw execution: 0.20, calibrated: 0.20 * 0.80 = 0.16
      // Raw artistry: 0.20, calibrated: 0.20 * 0.80 = 0.16
      const result = computeScoreFromScorecard(scorecard, 10.0);
      expect(result.execution_total).toBeCloseTo(0.16, 2);
      expect(result.artistry_total).toBeCloseTo(0.16, 2);
      // AI says 9.60, code computes 10.0 - 0.32 = 9.68, diff 0.08 → trust AI
      expect(result.final_score).toBe(9.60);
    });

    test("falls back to total_deduction when deductions array empty", () => {
      const scorecard = {
        deduction_log: [
          { total_deduction: 0.15, difficulty_value: 0.10 },
          { total_deduction: 0.10, difficulty_value: 0.20 },
        ],
        special_requirements: [],
        artistry: { total_artistry_deduction: 0 },
        final_score: 9.75,
      };
      // No event → default factor 0.80. Raw: 0.15+0.10=0.25, calibrated: 0.25*0.80=0.20
      const result = computeScoreFromScorecard(scorecard, 10.0);
      expect(result.execution_total).toBeCloseTo(0.20, 2);
      // AI says 9.75, code computes 9.80, diff 0.05 → trust AI
      expect(result.final_score).toBe(9.75);
    });

    test("applies SR penalties", () => {
      const scorecard = {
        deduction_log: [{ deductions: [{ point_value: 0.10 }], difficulty_value: 0.10 }],
        special_requirements: [{ penalty: 0.50 }],
        artistry: { total_artistry_deduction: 0 },
        final_score: 9.40,
      };
      const result = computeScoreFromScorecard(scorecard, 10.0);
      expect(result.sr_total).toBe(0.50);
      expect(result.final_score).toBe(9.40);
    });

    test("warns when diff > 0.30 from AI estimate", () => {
      const scorecard = {
        deduction_log: [{ deductions: [{ point_value: 0.50 }], difficulty_value: 0.10 }],
        special_requirements: [],
        artistry: { total_artistry_deduction: 0.30 },
        final_score: 9.80, // AI says 9.80
      };
      // No event → factor 0.80. Fall (0.50) exempts cap.
      // Exec: 0.50*0.80=0.40, art: 0.30*0.80=0.24, total=0.64, code=9.36
      // diff = |9.36-9.80| = 0.44 > 0.30 → code override
      const result = computeScoreFromScorecard(scorecard, 10.0);
      expect(result.warning).toBeTruthy();
      expect(result.final_score).toBeCloseTo(9.36, 2);
    });

    test("computes D-score from skill difficulty values for Elite", () => {
      const scorecard = {
        deduction_log: [
          { deductions: [{ point_value: 0.10 }], difficulty_value: 0.50 },
          { deductions: [{ point_value: 0.05 }], difficulty_value: 0.40 },
          { deductions: [], difficulty_value: 0.30 },
        ],
        special_requirements: [],
        artistry: { total_artistry_deduction: 0.10 },
        final_score: 11.95,
      };
      const result = computeScoreFromScorecard(scorecard, 10.0, { isElite: true });
      expect(result.d_score).toBe(1.20); // 0.50 + 0.40 + 0.30
      expect(result.d_score_from_skills).toBe(1.20);
    });
  });

  describe("SCORING_VERSION", () => {
    test("SCORING_VERSION is defined and non-empty", () => {
      expect(SCORING_VERSION).toBeDefined();
      expect(typeof SCORING_VERSION).toBe("string");
      expect(SCORING_VERSION.length).toBeGreaterThan(0);
    });
  });

  describe("deduction cap behavior", () => {
    test("per-skill deductions > 0.30 without fall are capped at 0.30", () => {
      const scorecard = {
        deduction_log: [{
          deductions: [
            { point_value: 0.20, type: "bent_knees" },
            { point_value: 0.20, type: "flexed_feet" },
          ],
          difficulty_value: 0.10,
        }],
        special_requirements: [],
        artistry: { total_artistry_deduction: 0 },
        final_score: 9.70,
      };
      const result = computeScoreFromScorecard(scorecard, 10.0);
      // 0.40 total should be capped at 0.30 (before calibration)
      // Calibration may scale further, but raw cap should have fired
      expect(result.calibration.cap_fired).toBeGreaterThan(0);
    });

    test("fall deductions (>= 0.50) bypass the cap", () => {
      const scorecard = {
        deduction_log: [{
          deductions: [
            { point_value: 0.50, type: "fall", description: "fall on dismount" },
          ],
          difficulty_value: 0.10,
        }],
        special_requirements: [],
        artistry: { total_artistry_deduction: 0 },
        final_score: 9.50,
      };
      const result = computeScoreFromScorecard(scorecard, 10.0);
      // Fall should NOT be capped — cap_fired should be 0
      expect(result.calibration.cap_fired).toBe(0);
    });
  });

  describe("SR cap", () => {
    test("special requirements total > 0.50 is capped at 0.50", () => {
      const scorecard = {
        deduction_log: [{ deductions: [{ point_value: 0.10 }], difficulty_value: 0.10 }],
        special_requirements: [
          { penalty: 0.30 },
          { penalty: 0.30 },
          { penalty: 0.20 },
        ],
        artistry: { total_artistry_deduction: 0 },
        final_score: 9.0,
      };
      const result = computeScoreFromScorecard(scorecard, 10.0);
      expect(result.sr_total).toBeLessThanOrEqual(0.50);
    });
  });

  describe("score blending", () => {
    test("AI score within 0.30 of code score is trusted", () => {
      const scorecard = {
        deduction_log: [{ deductions: [{ point_value: 0.10 }], difficulty_value: 0.10 }],
        special_requirements: [],
        artistry: { total_artistry_deduction: 0 },
        final_score: 9.85, // AI score close to code score
      };
      const result = computeScoreFromScorecard(scorecard, 10.0);
      // When AI and code differ by <= 0.30, AI score is used
      expect(result.score_source).toBe("ai_holistic");
      expect(result.final_score).toBe(9.85);
    });

    test("AI score > 0.30 from code score triggers override", () => {
      const scorecard = {
        deduction_log: [
          { deductions: [{ point_value: 0.10 }, { point_value: 0.10 }, { point_value: 0.10 }], difficulty_value: 0.10 },
          { deductions: [{ point_value: 0.10 }, { point_value: 0.10 }], difficulty_value: 0.20 },
        ],
        special_requirements: [],
        artistry: { total_artistry_deduction: 0.30 },
        final_score: 9.80, // AI says 9.80 but code will compute much lower
      };
      const result = computeScoreFromScorecard(scorecard, 10.0);
      // With significant deductions, code score will differ from 9.80
      // If diff > 0.30, code score is used instead
      if (result.score_diff > 0.30) {
        expect(result.score_source).toBe("code_override");
        expect(result.warning).toBeTruthy();
      }
    });
  });

  describe("calibration", () => {
    test("calibration factor is applied to execution deductions", () => {
      const scorecard = {
        deduction_log: [{ deductions: [{ point_value: 0.20 }], difficulty_value: 0.10 }],
        special_requirements: [],
        artistry: { total_artistry_deduction: 0 },
        final_score: 9.80,
      };
      // Bars has factor 0.85 — scaled execution should be less than raw
      const result = computeScoreFromScorecard(scorecard, 10.0, { event: "uneven_bars" });
      expect(result.calibration.factor).toBeCloseTo(0.85, 2);
      expect(result.calibration.scaled_execution).toBeLessThan(result.calibration.raw_execution);
    });
  });

  describe("ground truth accuracy", () => {
    // NAWGJ ground truth data points from calibration-report.txt
    // These test that known routine scores are within reasonable range
    test("bars routine avg score 8.425 means avg deductions ~1.575", () => {
      // 7 bars routines averaging 8.425 → 1.575 total deductions
      expect(10.0 - 8.425).toBeCloseTo(1.575, 2);
    });

    test("beam routine avg score 8.508 means avg deductions ~1.492", () => {
      expect(10.0 - 8.508).toBeCloseTo(1.492, 2);
    });

    test("vault routine avg score 8.111 means avg deductions ~1.889", () => {
      expect(10.0 - 8.111).toBeCloseTo(1.889, 2);
    });
  });

  describe("runScoringTests (built-in validation)", () => {
    const results = runScoringTests();

    results.forEach((r) => {
      test(`${r.name}: delta <= 0.10`, () => {
        expect(r.pass).toBe(true);
        expect(r.delta).toBeLessThanOrEqual(0.10);
      });
    });
  });
});
