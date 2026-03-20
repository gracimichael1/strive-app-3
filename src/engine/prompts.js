/**
 * prompts.js — Gemini judging prompt system for Strive.
 *
 * Pass 1 (JUDGING): Brevet-level USAG official watches video,
 *   identifies every skill, grades each one, logs all deductions,
 *   celebrates clean execution, provides coaching summary.
 *
 * Pass 2 (BIOMECHANICS): Takes Pass 1 skill list, enriches each
 *   with joint angles, injury awareness, targeted drills, correct form.
 *
 * DESIGN PRINCIPLE: Keep prompts natural and focused.
 * The Gemini web UI produces excellent results with a clear, human-readable
 * prompt. This module replicates that quality — NOT over-engineer it.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * LOCKED: Do not modify without owner approval per STRATEGY.md rule #10.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

export const PROMPT_VERSION = "v11_natural";

// ─── Core Judge Instruction ─────────────────────────────────────────────────
// This is the "brain" — a strict, pessimistic Brevet judge persona.
// Derived from the exact prompt that scored within 0.075 of real judges.

const CORE_JUDGE_INSTRUCTION = `You are a Brevet-level USAG Official judging at a State Championship.

A "skill" is a complete, named element or connected sequence — NOT individual components. Examples:
- BARS: "Low Bar Kip", "Cast", "Back Hip Circle", "Cast to Squat On", "Jump to High Bar", "Long Hang Kip", "Tuck Flyaway" — each is ONE skill. A typical bars routine has 7-10 skills.
- FLOOR: "Round-off Back Handspring Back Tuck" is ONE skill (the full tumbling pass). A typical floor routine has 6-10 skills.
- BEAM: "Back Walkover", "Split Leap", "Cartwheel Back Handspring" (series) — each named sequence is ONE skill.
Do NOT break a named skill into sub-movements. Do NOT count swings, grips, or transitions as skills.

Respond ONLY in the JSON schema provided.`;

// ─── Level-Specific Rules ───────────────────────────────────────────────────
// Each level has specific special requirements, amplitude standards,
// and judging expectations. These are injected into the system instruction.

const LEVEL_RULES = {
  // ── XCEL Program ──
  XCEL_BRONZE: `
## LEVEL: XCEL BRONZE (WAG)
Start Value: 10.0
Special Requirements:
  FLOOR: One acro element, one dance element (split 60°+), full turn.
  BARS:  One kip, one circling element, dismount from a bar.
  BEAM:  One acro element, one dance element (split 60°+), dismount.
  VAULT: FIG A-level vault.
Amplitude:
  FLOOR: Split leap minimum 60°. Below 60°: -0.20.
  BARS:  Cast to below horizontal acceptable at Bronze, but knee/feet form still judged.
`,
  XCEL_SILVER: `
## LEVEL: XCEL SILVER (WAG)
Start Value: 10.0
Special Requirements:
  FLOOR: Two acro elements (one with flight), dance passage (split 90°+), full turn.
  BARS:  Kip + cast + circling + bar change + dismount.
  BEAM:  Two acro elements, dance passage, full turn, dismount.
Amplitude:
  FLOOR: Split leap minimum 90°. Below 90°: -0.10.
  BARS:  Cast should approach horizontal. Below 45°: -0.10.
`,
  XCEL_GOLD: `
## LEVEL: XCEL GOLD (WAG)
Start Value: 10.0
Special Requirements:
  FLOOR: Two acro passes (one with two flight elements), dance passage (split 120°+), full turn.
  BARS:  Two kips, two 360° circling elements, bar change, dismount from high bar.
  BEAM:  Two acro elements (one series), dance passage (split 120°+), full turn, dismount.
  VAULT: A-level vault.
Amplitude:
  FLOOR: Split leap minimum 120°. At 100°-119°: -0.10. Below 100°: -0.20.
  BARS:  Cast must reach HORIZONTAL (180°).
         178°-179°: -0.10. 170°-177°: -0.20. Below 170°: -0.30 + SR not awarded.
  BEAM:  Leaps/jumps must reach 120°. Same floor deductions apply.
State Championship additional scrutiny:
  - Rhythm deductions applied aggressively (any hesitation >0.5s).
  - All knee/toe form errors deducted without leniency.
  - Artistry deductions up to -0.30 total for flat performance.
`,
  XCEL_PLATINUM: `
## LEVEL: XCEL PLATINUM (WAG)
Start Value: 10.0
Special Requirements:
  FLOOR: Two acro passes (one with salto), dance passage (split 120°+), full turn.
  BARS:  Two kips, one B-value element, two 360° circles, bar change, dismount from HB.
  BEAM:  Two acro elements (one series with flight), dance passage, full turn, dismount.
Amplitude:
  FLOOR: Split leap minimum 120°.
  BARS:  Cast must be ABOVE HORIZONTAL (>180°/above the bar).
         At horizontal: -0.10. Below horizontal: -0.30 + SR not awarded.
B-Value Requirement (BARS): Must identify at least 1 B-skill. If absent: -0.50 SV reduction.
`,
  XCEL_DIAMOND: `
## LEVEL: XCEL DIAMOND (WAG)
Start Value: 10.0
Special Requirements:
  FLOOR: Two acro passes (one with double or D+), dance passage (split 120°+), full turn.
  BARS:  Two kips, two B-value elements, two 360° circles, bar change, dismount.
  BEAM:  Acro series (two flight elements connected), dance passage, full turn, dismount.
Amplitude:
  BARS: Cast must be clearly ABOVE horizontal. Full handstand preferred.
        At horizontal: -0.30. Below: SR denied.
Artistry is heavily weighted at Diamond. Deduct maximum for any flat performance.
`,

  // ── JO Compulsory ──
  JO_LEVEL_3: `
## LEVEL: JO LEVEL 3 (Compulsory WAG)
Compulsory: Every skill is pre-defined. No variation.
Start Value: 10.0
Deduct for ANY deviation from the compulsory choreography pattern.
`,
  JO_LEVEL_4: `
## LEVEL: JO LEVEL 4 (Compulsory WAG)
Compulsory: Every skill is pre-defined.
Start Value: 10.0
Same structure as Level 3. Amplitude requirements begin (60°+ leaps).
`,
  JO_LEVEL_5: `
## LEVEL: JO LEVEL 5 (Optional WAG)
Start Value: 10.0
BARS: Cast to horizontal required. Below: -0.10 to -0.50.
FLOOR: Split 120°+ required. Salto required in acro passes.
`,

  // ── JO Optional ──
  JO_LEVEL_6: `
## LEVEL: JO LEVEL 6 (Optional WAG)
Start Value: 10.0
BARS: Cast to horizontal. B-value element required.
FLOOR: Two different acro passes, salto required in both.
`,
  JO_LEVEL_7: `
## LEVEL: JO LEVEL 7 (Optional WAG)
Start Value: 10.0
BARS: Cast ABOVE horizontal. B-value element minimum.
FLOOR: One pass must include a salto with a full twist or higher.
`,
  JO_LEVEL_8: `
## LEVEL: JO LEVEL 8 (Optional WAG)
Start Value: 10.0
BARS: Casts to handstand expected. Amplitude deductions aggressive.
FLOOR: Salto difficulty (C-level minimum) expected.
`,
  JO_LEVEL_9: `
## LEVEL: JO LEVEL 9 (Optional WAG)
D-score + E-score system. Start Value is SUM of difficulty + connection bonuses.
BARS: Casts to handstand required. Release moves or pirouettes expected.
FLOOR: C/D-level saltos expected. Artistry heavily weighted.
`,
  JO_LEVEL_10: `
## LEVEL: JO LEVEL 10 / Pre-Elite (Optional WAG)
Full FIG Code of Points logic.
D-score: Sum of 8 highest difficulty elements + connection bonuses.
E-score: 10.0 - execution deductions.
BARS: Full pirouettes, release moves (C+) expected.
FLOOR: D-level saltos, complex dance, full choreographic expression required.
`,
  ELITE: `
## LEVEL: ELITE / FIG International (WAG/MAG)
Full FIG Code of Points. D-score + E-score + Neutral Deductions.
D-score: 8 highest difficulty values + connection bonus + composition requirements.
E-score: 10.0 - execution deductions (applied by two judge panels, averaged).
Zero leniency. Artistry judged at highest professional standard.
`,
};

// ─── Event-Specific Addenda ─────────────────────────────────────────────────

const EVENT_RULES = {
  FLOOR: `
## EVENT SPECIFICS: FLOOR EXERCISE
- Monitor "Inter-Knee Distance" during all tumbling. Gap > 3 inches: -0.10.
- Monitor heel-drop timing during full turns. Early drop before 360°: -0.10 completion.
- Out-of-bounds: -0.10 per foot touching line/out.
- Landing zone: deep squat = -0.10 to -0.20; chest-to-knees = -0.20.
- Artistry: chin down >40% of non-tumbling time = -0.10.
- Music: if vocals present, choreography must reflect mood. Mismatch: -0.05 musicality.
`,
  BARS: `
## EVENT SPECIFICS: UNEVEN BARS
- Cast angle measured hip-to-bar vs. horizontal.
- Extra swing / "pump" before skill: -0.30.
- Grip adjustment / re-grip without skill: -0.10 rhythm.
- Jump from LB to HB: Piked hips or bent knees = -0.10 to -0.20.
- Long hang kip: hesitation at top before cast = -0.10.
- Flyaway: knees apart in tuck = -0.10; chest down on landing = -0.10 to -0.20.
- Compounding rule: low cast → automatic -0.10 rhythm on subsequent circle.
`,
  BEAM: `
## EVENT SPECIFICS: BALANCE BEAM
- Balance check (arms move from body): -0.10.
- Balance check (large arm swing): -0.20.
- Grasp beam to avoid fall: -0.50.
- Fall from beam: -0.50.
- Extra step / hop on landing: -0.10 per step.
- Pause/freeze (not choreographic): -0.10.
`,
  VAULT: `
## EVENT SPECIFICS: VAULT
- Pre-flight: tight hollow or arch depending on vault type.
- Block: hands must leave table before hips pass vertical.
- Post-flight height: low salto = -0.10 to -0.20.
- Landing: step = -0.10; hop = -0.10; fall = -0.50.
`,
  HIGH_BAR: `
## EVENT SPECIFICS: HIGH BAR (MAG)
- Giant swings must reach vertical. Short: -0.10 per swing.
- Release and regrasp: form in flight strictly judged.
- Pirouettes must reach handstand. Short: -0.10 to -0.20.
`,
  PARALLEL_BARS: `
## EVENT SPECIFICS: PARALLEL BARS (MAG)
- Swings: body must be straight and tight. Any pike: -0.10.
- Press to handstand must reach full vertical. Short: -0.10 to -0.30.
`,
  RINGS: `
## EVENT SPECIFICS: RINGS (MAG)
- Rings must be still before strength elements.
- Iron cross: arms at 90° horizontal. Deviation: -0.10.
- Swinging rings: -0.10 per swing.
`,
  POMMEL: `
## EVENT SPECIFICS: POMMEL HORSE (MAG)
- Leg separation (scissors): -0.10 per occurrence.
- Flairs must be circular and wide. Collapsed circle: -0.10.
- Fall: -0.50.
`,
};

// ─── Level Key Mapping ──────────────────────────────────────────────────────
// Maps the profile.level string to LEVEL_RULES keys

function getLevelKey(level, levelCategory) {
  if (!level) return "XCEL_GOLD";

  const normalized = level.toUpperCase().replace(/\s+/g, "_");

  // Direct match
  if (LEVEL_RULES[normalized]) return normalized;

  // Xcel variants
  if (/XCEL.*BRONZE/i.test(level) || /BRONZE/i.test(level)) return "XCEL_BRONZE";
  if (/XCEL.*SILVER/i.test(level) || /SILVER/i.test(level)) return "XCEL_SILVER";
  if (/XCEL.*GOLD/i.test(level) || (levelCategory === "xcel" && /GOLD/i.test(level))) return "XCEL_GOLD";
  if (/XCEL.*PLAT/i.test(level) || /PLATINUM/i.test(level)) return "XCEL_PLATINUM";
  if (/XCEL.*DIAMOND/i.test(level) || /DIAMOND/i.test(level)) return "XCEL_DIAMOND";

  // JO Levels
  const levelNum = parseInt(level.replace(/\D/g, ""), 10);
  if (levelNum >= 3 && levelNum <= 10) return `JO_LEVEL_${levelNum}`;

  // Elite
  if (/ELITE/i.test(level)) return "ELITE";

  return "XCEL_GOLD"; // safe default
}

// ─── Event Key Mapping ──────────────────────────────────────────────────────

function getEventKey(event) {
  if (!event || event === "Auto-detect") return null;
  const e = event.toUpperCase();
  if (/FLOOR/i.test(e)) return "FLOOR";
  if (/BAR/i.test(e) && !/PARALLEL/i.test(e) && !/HIGH/i.test(e)) return "BARS";
  if (/BEAM/i.test(e)) return "BEAM";
  if (/VAULT/i.test(e)) return "VAULT";
  if (/HIGH.*BAR/i.test(e)) return "HIGH_BAR";
  if (/PARALLEL/i.test(e) || /P.?BAR/i.test(e)) return "PARALLEL_BARS";
  if (/RING/i.test(e)) return "RINGS";
  if (/POMMEL/i.test(e) || /HORSE/i.test(e)) return "POMMEL";
  return null;
}


// ═══════════════════════════════════════════════════════════════════════════════
// PASS 1: JUDGING — Skill identification, deductions, grades, celebrations
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build the Pass 1 prompt — the Brevet judge watches the video.
 * This is the critical prompt. It must match the quality of
 * typing directly into Gemini's web UI.
 *
 * @param {Object} profile - { name, gender, level, levelCategory }
 * @param {string} event - Event name or "Auto-detect"
 * @returns {{ system: string, user: string }}
 */
export function buildPass1Prompt(profile, event) {
  const levelKey = getLevelKey(profile.level, profile.levelCategory);
  const eventKey = getEventKey(event);
  const gender = (profile.gender || "female").toLowerCase() === "male" ? "MAG" : "WAG";
  const genderFull = gender === "MAG"
    ? "Men's Artistic Gymnastics"
    : "Women's Artistic Gymnastics";

  // Build system instruction
  const parts = [CORE_JUDGE_INSTRUCTION];

  parts.push(`\n## GENDER: ${gender} (${genderFull}). Apply ${gender} Code of Points.\n`);

  const levelRules = LEVEL_RULES[levelKey];
  if (levelRules) parts.push(levelRules);

  if (eventKey && EVENT_RULES[eventKey]) {
    parts.push(EVENT_RULES[eventKey]);
  }

  const system = parts.join("\n");

  // Build user prompt — natural language, like what works in the web UI
  const athleteName = profile.name || "the gymnast";
  const eventName = event === "Auto-detect" ? "the event shown" : event;
  const levelDisplay = profile.level || levelKey.replace(/_/g, " ");

  const user = `Analyze this ${levelDisplay}${eventName !== "the event shown" ? " " + eventName : ""} routine. Athlete: ${athleteName}, ${gender}. You are strictly forbidden from giving "benefit of the doubt." Focus on micro-deductions: toe point, knee tension, chest placement on landings, and artistry. If the form is not "picture perfect," the deduction must be taken. For every skill, name it, timestamp it, and grade it. We need to celebrate the good and perfect skills as well. Provide a coaching summary with the top 3 fixes.
${event === "Auto-detect" ? "Auto-detect which apparatus/event this is from the video." : ""}`;

  return { system, user };
}


// ═══════════════════════════════════════════════════════════════════════════════
// PASS 2: BIOMECHANICS — Per-skill enrichment with angles, drills, injury data
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build the Pass 2 prompt — biomechanics expert enriches each skill.
 * Takes the Pass 1 skill list so it knows what to analyze.
 *
 * @param {Object} pass1Result - Parsed Pass 1 output
 * @param {Object} profile - { name, gender, level, levelCategory }
 * @param {string} event - Event name
 * @returns {{ system: string, user: string }}
 */
export function buildPass2Prompt(pass1Result, profile, event) {
  const gender = (profile.gender || "female").toLowerCase() === "male" ? "MAG" : "WAG";
  const levelDisplay = profile.level || "Level 6";

  const system = `You are an Elite FIG/USAG Brevet-level judge AND biomechanics expert analyzing a ${gender} gymnast competing at ${levelDisplay} ${event || "gymnastics"}.

Your task is to provide BIOMECHANICS ENRICHMENT for each skill already identified.
Be precise, pessimistic, and specific about body angles and positions.

For each skill, provide:
1. BIOMECHANICS: For each relevant joint (KNEE, HIP, ELBOW, SHOULDER, SPLIT, ANKLE), estimate actual degrees, ideal degrees, and gap status.
   "good" = within 5° of ideal. "needs_work" = 6-15° off. "significant_gap" = >15° off.
2. FAULT OBSERVED: Plain language primary fault (or null if clean).
3. STRENGTH: What was done well on this specific skill.
4. CORRECT FORM: What perfect execution looks like for this specific skill at this level.
5. INJURY AWARENESS: 1-3 injury risk notes if the form shown creates physical risk.
6. TARGETED DRILLS: 2-3 specific drills to fix the faults observed.
7. GAIN IF FIXED: How many score points would be recovered if this skill is cleaned up.

Respond ONLY in the JSON schema provided. No conversational text.`;

  // Build skill list for context
  const skillList = (pass1Result.deduction_log || []).map(s =>
    `- "${s.skill}" at ${s.timestamp} (deduction: ${s.deduction_value})`
  ).join("\n");

  const user = `Re-watch the attached video. The following skills were identified in the initial judging pass:

${skillList}

For EACH skill listed above, provide the biomechanics enrichment data.
Match skills by name and timestamp.
Respond ONLY in the JSON schema provided.`;

  return { system, user };
}


// ═══════════════════════════════════════════════════════════════════════════════
// Gemini API Configuration
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Pass 1 config: Force structured JSON, low temperature for consistency.
 */
export const PASS1_CONFIG = {
  temperature: 0.1,
  topP: 0.8,
  maxOutputTokens: 8192,
  responseMimeType: "application/json",
  responseSchema: {
    type: "object",
    properties: {
      athlete_name: { type: "string" },
      level: { type: "string" },
      event: { type: "string" },
      gender: { type: "string" },
      start_value: { type: "number" },
      special_requirements: {
        type: "array",
        items: {
          type: "object",
          properties: {
            requirement: { type: "string" },
            status: { type: "string", enum: ["MET", "NOT_MET"] },
            comment: { type: "string" },
            penalty: { type: "number" },
          },
          required: ["requirement", "status", "comment", "penalty"],
        },
      },
      deduction_log: {
        type: "array",
        items: {
          type: "object",
          properties: {
            timestamp: { type: "string" },
            skill: { type: "string" },
            quality_grade: { type: "number" },
            deduction_value: { type: "number" },
            reason: { type: "string" },
            rule_reference: { type: "string" },
            is_celebration: { type: "boolean" },
          },
          required: ["timestamp", "skill", "quality_grade", "deduction_value", "reason", "rule_reference", "is_celebration"],
        },
      },
      artistry: {
        type: "object",
        properties: {
          expression_deduction: { type: "number" },
          quality_of_movement_deduction: { type: "number" },
          choreography_variety_deduction: { type: "number" },
          musicality_deduction: { type: "number" },
          total_artistry_deduction: { type: "number" },
          notes: { type: "string" },
        },
        required: ["expression_deduction", "quality_of_movement_deduction", "choreography_variety_deduction", "musicality_deduction", "total_artistry_deduction", "notes"],
      },
      total_execution_deductions: { type: "number" },
      total_artistry_deductions: { type: "number" },
      final_score: { type: "number" },
      score_range: {
        type: "object",
        properties: { low: { type: "number" }, high: { type: "number" } },
        required: ["low", "high"],
      },
      confidence: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
      coaching_summary: { type: "string" },
      top_3_fixes: { type: "array", items: { type: "string" } },
      celebrations: { type: "array", items: { type: "string" } },
    },
    required: [
      "start_value", "final_score", "deduction_log", "special_requirements",
      "artistry", "total_execution_deductions", "total_artistry_deductions",
      "score_range", "confidence", "coaching_summary", "top_3_fixes", "celebrations",
    ],
  },
};

/**
 * Pass 2 config: Biomechanics enrichment.
 */
export const PASS2_CONFIG = {
  temperature: 0.1,
  maxOutputTokens: 8192,
  responseMimeType: "application/json",
  responseSchema: {
    type: "object",
    properties: {
      skill_details: {
        type: "array",
        items: {
          type: "object",
          properties: {
            skill_name: { type: "string" },
            timestamp: { type: "string" },
            category: { type: "string", enum: ["ACRO", "DANCE", "TURN", "LEAP", "DISMOUNT", "MOUNT", "SERIES", "TRANSITION"] },
            biomechanics: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  label: { type: "string" },
                  actual_degrees: { type: "number" },
                  ideal_degrees: { type: "number" },
                  status: { type: "string", enum: ["good", "needs_work", "significant_gap"] },
                },
                required: ["label", "actual_degrees", "ideal_degrees", "status"],
              },
            },
            fault_observed: { type: "string" },
            strength: { type: "string" },
            correct_form: { type: "string" },
            injury_awareness: { type: "array", items: { type: "string" } },
            targeted_drills: { type: "array", items: { type: "string" } },
            gain_if_fixed: { type: "number" },
          },
          required: ["skill_name", "timestamp", "category", "biomechanics", "correct_form", "gain_if_fixed"],
        },
      },
    },
    required: ["skill_details"],
  },
};
