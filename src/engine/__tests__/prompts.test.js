import { buildPass1Prompt, buildPass2Prompt, PASS1_CONFIG, PASS2_CONFIG } from "../prompts";

describe("prompts.js", () => {
  const profile = { name: "Emma", gender: "female", level: "Level 6", age: 12 };
  const event = "floor_exercise";

  describe("buildPass1Prompt", () => {
    test("returns system and user strings", () => {
      const { system, user } = buildPass1Prompt(profile, event);
      expect(typeof system).toBe("string");
      expect(typeof user).toBe("string");
      expect(system.length).toBeGreaterThan(100);
      expect(user.length).toBeGreaterThan(100);
    });

    test("injects athlete details", () => {
      const { user } = buildPass1Prompt(profile, event);
      expect(user).toContain("Emma");
      expect(user).toContain("Level 6");
    });

    test("includes event-specific rules", () => {
      const { system } = buildPass1Prompt(profile, event);
      expect(system.toLowerCase()).toContain("floor");
    });

    test("includes calibration block", () => {
      const { system } = buildPass1Prompt(profile, event);
      expect(system).toContain("CALIBRATION");
      expect(system).toContain("0.80");
    });

    test("never mentions Gemini or Claude", () => {
      const { system, user } = buildPass1Prompt(profile, event);
      const combined = (system + user).toLowerCase();
      expect(combined).not.toContain("gemini");
      expect(combined).not.toContain("claude");
      expect(combined).not.toContain("anthropic");
    });
  });

  describe("buildPass2Prompt", () => {
    const fakePass1 = {
      deduction_log: [
        {
          skill_name: "Back Tuck",
          timestamp_start: 15,
          timestamp_end: 17,
          total_deduction: 0.10,
          deductions: [
            { type: "bent_knees", body_part: "knees", description: "Slight bent knees", point_value: 0.10 },
          ],
          reason: "Slight bent knees on landing",
        },
      ],
    };

    test("returns system and user strings", () => {
      const { system, user } = buildPass2Prompt(fakePass1, profile, event);
      expect(typeof system).toBe("string");
      expect(typeof user).toBe("string");
    });

    test("includes pass1 skill data in user prompt", () => {
      const { user } = buildPass2Prompt(fakePass1, profile, event);
      expect(user).toContain("Back Tuck");
    });

    test("system prompt includes team of specialists", () => {
      const { system } = buildPass2Prompt(fakePass1, profile, event);
      expect(system).toContain("team of specialists");
      expect(system).toContain("Sports biomechanics expert");
      expect(system).toContain("Physical therapist");
      expect(system).toContain("Sports psychologist");
      expect(system).toContain("Performance nutritionist");
    });
  });

  describe("configs", () => {
    test("PASS1_CONFIG has required fields", () => {
      expect(PASS1_CONFIG.temperature).toBe(0.1);
      expect(PASS1_CONFIG.maxOutputTokens).toBeGreaterThanOrEqual(16384);
      expect(PASS1_CONFIG.responseMimeType).toBe("application/json");
    });

    test("PASS1_CONFIG has thinking budget", () => {
      expect(PASS1_CONFIG.thinkingConfig).toBeDefined();
      expect(PASS1_CONFIG.thinkingConfig.thinkingBudget).toBeGreaterThan(0);
    });

    test("PASS2_CONFIG has required fields and thinking budget", () => {
      expect(PASS2_CONFIG.temperature).toBe(0.1);
      expect(PASS2_CONFIG.maxOutputTokens).toBeGreaterThanOrEqual(16384);
      expect(PASS2_CONFIG.thinkingConfig).toBeDefined();
    });

    test("PASS1_CONFIG schema includes per-skill deductions array", () => {
      const skillSchema = PASS1_CONFIG.responseSchema.properties.deduction_log.items.properties;
      expect(skillSchema.deductions).toBeDefined();
      expect(skillSchema.deductions.type).toBe("array");
      expect(skillSchema.difficulty_value).toBeDefined();
      expect(skillSchema.timestamp_start).toBeDefined();
      expect(skillSchema.timestamp_end).toBeDefined();
    });

    test("PASS2_CONFIG schema includes training_plan and mental_performance", () => {
      const props = PASS2_CONFIG.responseSchema.properties;
      expect(props.training_plan).toBeDefined();
      expect(props.mental_performance).toBeDefined();
      expect(props.nutrition_note).toBeDefined();
    });
  });
});
