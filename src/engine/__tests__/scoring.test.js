import { computeScore, gradeSkill, runScoringTests } from "../scoring";
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

    test("floors to 0 for invalid", () => {
      expect(snapToUSAG(-0.1)).toBe(0);
      expect(snapToUSAG(NaN)).toBe(0);
      expect(snapToUSAG("bad")).toBe(0);
    });
  });

  describe("gradeSkill", () => {
    test("clean skill = A", () => {
      expect(gradeSkill(0).grade).toBe("A");
    });
    test("0.10 = B+", () => {
      expect(gradeSkill(0.10).grade).toBe("B+");
    });
    test("0.30 = C", () => {
      expect(gradeSkill(0.30).grade).toBe("C");
    });
    test("0.50+ = F", () => {
      expect(gradeSkill(0.50).grade).toBe("F");
    });
  });

  describe("computeScore", () => {
    test("clean routine = 10.0", () => {
      const skills = [
        { id: "s1", skill_name: "Skill", deductions: [], executed_successfully: true, skill_code: "A", difficulty_value: 0.10 },
      ];
      const { final_score } = computeScore(skills, 0, "Level 6", "optional");
      expect(final_score).toBe(10.0);
    });

    test("single 0.10 deduction = 9.90", () => {
      const skills = [{
        id: "s1", skill_name: "Skill", executed_successfully: true, skill_code: "A", difficulty_value: 0.10,
        deductions: [{ type: "bent_knees", description: "bent knees", point_value: 0.10, body_part: "knees", severity: "medium" }],
      }];
      const { final_score } = computeScore(skills, 0, "Level 6", "optional");
      expect(final_score).toBe(9.9);
    });

    test("neutral deductions subtract correctly", () => {
      const skills = [{ id: "s1", skill_name: "Skill", deductions: [], executed_successfully: true, skill_code: "A", difficulty_value: 0.10 }];
      const { final_score } = computeScore(skills, 0.30, "Level 6", "optional");
      expect(final_score).toBe(9.7);
    });
  });

  describe("runScoringTests (built-in validation)", () => {
    const results = runScoringTests();

    results.forEach((r) => {
      test(`${r.name}: delta ≤ ${0.10}`, () => {
        expect(r.pass).toBe(true);
        expect(r.delta).toBeLessThanOrEqual(0.10);
      });
    });
  });
});
