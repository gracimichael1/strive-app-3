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
      expect(user).toContain("Women's");
    });

    test("includes event-specific rules", () => {
      const { system } = buildPass1Prompt(profile, event);
      expect(system.toLowerCase()).toContain("floor");
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
        { skill: "Back Tuck", timestamp: "0:15", deduction_value: 0.10 },
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
  });

  describe("configs", () => {
    test("PASS1_CONFIG has required fields", () => {
      expect(PASS1_CONFIG.temperature).toBeDefined();
      expect(PASS1_CONFIG.maxOutputTokens).toBeGreaterThan(1000);
      expect(PASS1_CONFIG.responseMimeType).toBe("application/json");
    });

    test("PASS2_CONFIG has required fields", () => {
      expect(PASS2_CONFIG.temperature).toBeDefined();
      expect(PASS2_CONFIG.maxOutputTokens).toBeGreaterThan(1000);
    });
  });
});
