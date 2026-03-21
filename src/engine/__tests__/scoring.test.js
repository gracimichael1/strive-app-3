import { computeScore, computeScoreFromScorecard, gradeSkill, runScoringTests } from "../scoring";
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
      const result = computeScoreFromScorecard(scorecard, 10.0);
      expect(result.execution_total).toBe(0.20);
      expect(result.artistry_total).toBe(0.20);
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
      const result = computeScoreFromScorecard(scorecard, 10.0);
      expect(result.execution_total).toBe(0.25);
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
        final_score: 9.80, // AI says 9.80, code says 9.20 — big diff
      };
      const result = computeScoreFromScorecard(scorecard, 10.0);
      expect(result.warning).toBeTruthy();
      expect(result.final_score).toBe(9.20);
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
