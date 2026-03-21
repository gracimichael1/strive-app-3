/**
 * prompts.js — Gemini judging prompt system for Strive.
 *
 * Pass 1 (JUDGING): Certified USAG judge watches video,
 *   identifies every skill, timestamps, deductions with body-part detail,
 *   difficulty values, celebrations, coaching summary.
 *
 * Pass 2 (DEEP ANALYSIS): Team of specialists enriches each skill
 *   with biomechanics, injury risk, elite comparison, corrective drills,
 *   plus routine-level training plan, mental performance, nutrition note.
 *
 * DESIGN PRINCIPLE: Keep prompts natural and focused.
 * The Gemini web UI produces excellent results with a clear, human-readable
 * prompt. This module replicates that quality — NOT over-engineer it.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * LOCKED: Do not modify without owner approval per STRATEGY.md rule #10.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

export const PROMPT_VERSION = "v13_bhpa_engine";

// ─── BHPA Master System Instruction ─────────────────────────────────────────
// Gold standard prompt — validated in Gemini Studio to produce 0.075 delta.
// Do NOT simplify or rewrite. Every clause is load-bearing.

const CORE_JUDGE_INSTRUCTION = `Role: Act as a Brevet-level USAG Lead Judge and High-Performance Technical Coach. Your goal is to provide a "Zero-Lenience" score followed by a "Physics-Based" training roadmap.

I. Operational Protocol: The Professional Audit
1. Double-Pass Scrub:
   * Pass 1 (The Skills): Analyze primary flight elements, handstands, and saltos.
   * Pass 2 (Connective Tissue): Scrub the 1.5s between skills (Kips, Squat-ons, Taps).
2. Frame-by-Frame Apex Scrub: Manually identify and analyze the "Apex Frame" of every flight element and the "Contact Frame" of every landing or bar transition. Document any form breaks (TPM/KTM) that exist even for a single frame.
3. The "Monitors": Activate Toe Point Monitor (TPM) and Knee Tension Monitor (KTM) for every frame.
4. Zero Lenience: Strictly forbidden from giving "benefit of the doubt." If a toe isn't pointed or a knee isn't locked, it is a deduction (0.05 - 0.10).
5. The "Zero-Variance" Audit Upgrade:
   * The 30-Degree Penalty: Any cast failing to reach the required horizontal/vertical line (based on the specified level) is an automatic 0.30 deduction. No "marginal" passes.
   * The "Compounder" Rule: If a form break (KTM/TPM) occurs during a technical error (e.g., bent arms during a Kip), the deduction is doubled. (0.10 for form + 0.10 for technique).
   * The 1.5-Second Rhythm Clock: Any pause, hesitation, or "adjustment" of hands on the bar lasting longer than 1.5 seconds is an automatic 0.10 rhythm break.
   * The "Early Pike" Logic: Any salto (dismount) that begins to pike/tuck before reaching the apex of flight loses 0.20 for "Poor Body Position in Flight."
   * The "Heavy Bar" Audit: Any "stumble" or "clunky" foot contact during a Squat-on or transition is a 0.10 deduction for lack of control.

II. Skill Identification Rules
A "skill" is a complete, named element or connected sequence — NOT individual components. Examples:
- BARS: "Low Bar Kip", "Cast", "Back Hip Circle", "Cast to Squat On", "Jump to High Bar", "Long Hang Kip", "Tuck Flyaway" — each is ONE skill. A typical bars routine has 7-10 skills.
- FLOOR: "Round-off Back Handspring Back Tuck" is ONE skill (the full tumbling pass). A typical floor routine has 6-10 skills.
- BEAM: "Back Walkover", "Split Leap", "Cartwheel Back Handspring" (series) — each named sequence is ONE skill.
Do NOT break a named skill into sub-movements. Do NOT count swings, grips, or transitions as skills.

III. Output Protocol
For each skill and transition:
1. Identify every skill performed, in order
2. Note the exact timestamp (in seconds) when each skill begins and ends
3. For each skill: was it executed successfully? (yes/no)
4. For each skill: list every deduction with deduction type, severity (per USAG, 0.05 increments), specific body part and position description
5. The "Missed Transition" Check: Explicitly confirm if "cowboy knees," "staggered feet," or "flexed feet" occurred during transitions.
6. Estimate difficulty value (D-score contribution) based on skills performed
7. Celebrate good and perfect skills. Provide a coaching summary with the top 3 fixes.

IV. Biomechanical Overlay & Kinetic Audit
1. The "Swing/Flight Radius" Analysis: Deconstruct the Hollow-Arch-Hollow sequence. Identify the exact frame of the "Toe Beat." State if the momentum generation is Early, Late, or Optimal.
2. The "Width of Mass" Audit: Measure lateral deviation (e.g., Cowboy Knees). Explain the Conservation of Angular Momentum impact: How did this mass displacement affect the Angular Velocity (rotation speed)?
3. The Landing Vector: Provide a 'Torso-to-Vertical' angle measurement at impact. Determine if the Center of Mass (CoM) was leading, trailing, or stacked over the base of support.

V. The Master Level-Up Analysis (Multi-Phase)
Phase 1: Championship Strictness (Current Level)
1. No Benefit of the Doubt: If a form break is visible, it is a deduction.
2. Active Monitors: Run TPM and KTM throughout.
3. The Audit: Timestamped table of every skill/transition with micro-deductions (0.05 - 0.10) and structural deductions (0.20+).
4. Current Justified Score: Final score based on the Start Value.

Phase 2: The Level-Up Comparison (Gap Analysis)
1. Requirement Shift: Identify which skills would fail to meet the "Special Requirements" or "Value Parts" of the next level up.
2. The "Angle" Tax: Recalculate the score using the next level's angle requirements (e.g., 120° vs. 150° leaps, horizontal vs. above-horizontal casts).
3. Transition Score: What this exact performance would earn if judged at the higher level today.

Phase 3: The Unbiased Push
* Identify the "Technical Anchor" — the one habit from the current level that will be the biggest liability at the next level. Provide one high-level drill to break it.

Respond ONLY in the JSON schema provided. No prose. No markdown.`;

// ─── Level-Specific Rules ───────────────────────────────────────────────────

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
- Compounding rule: low cast -> automatic -0.10 rhythm on subsequent circle.
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

function getLevelKey(level, levelCategory) {
  if (!level) return "XCEL_GOLD";

  const normalized = level.toUpperCase().replace(/\s+/g, "_");
  if (LEVEL_RULES[normalized]) return normalized;

  if (/XCEL.*BRONZE/i.test(level) || /BRONZE/i.test(level)) return "XCEL_BRONZE";
  if (/XCEL.*SILVER/i.test(level) || /SILVER/i.test(level)) return "XCEL_SILVER";
  if (/XCEL.*GOLD/i.test(level) || (levelCategory === "xcel" && /GOLD/i.test(level))) return "XCEL_GOLD";
  if (/XCEL.*PLAT/i.test(level) || /PLATINUM/i.test(level)) return "XCEL_PLATINUM";
  if (/XCEL.*DIAMOND/i.test(level) || /DIAMOND/i.test(level)) return "XCEL_DIAMOND";

  const levelNum = parseInt(level.replace(/\D/g, ""), 10);
  if (levelNum >= 3 && levelNum <= 10) return `JO_LEVEL_${levelNum}`;

  if (/ELITE/i.test(level)) return "ELITE";

  return "XCEL_GOLD";
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
 * Build the Pass 1 prompt — the certified USAG judge watches the video.
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

  // Calibration block
  parts.push(`
## CALIBRATION — CRITICAL
- Target range for total deductions: 0.80-1.30 for most routines.
- A score of 8.7-9.2 is typical at State Championships.
- If total deductions < 0.80: you are too LENIENT — find more faults.
- If total deductions > 1.50: you are too HARSH — remove uncertain deductions.
- Execution deductions typically 0.50-0.90; artistry + composition add 0.20-0.40.
- Deduction values: 0.00, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.50 ONLY.
- If you find fewer than 5 deductions total, you are MISSING deductions.

## SECOND-PASS CHECK
After initial assessment, re-watch focusing ONLY on:
1. Feet — were there flexed feet you missed? Count them.
2. Pauses — any hesitations or rhythm breaks between skills?
3. Landings — did you deduct for every step, hop, or squat?
4. Split leaps — is the angle truly at or above the minimum?
5. Arms — any bent arm moments in support or flight?
Add any missed deductions to your final JSON.
`);

  const system = parts.join("\n");

  // Build user prompt
  const athleteName = profile.name || "the gymnast";
  const eventName = event === "Auto-detect" ? "the event shown" : event;
  const levelDisplay = profile.level || levelKey.replace(/_/g, " ");

  const user = `Analyze this ${levelDisplay}${eventName !== "the event shown" ? " " + eventName : ""} routine. Athlete: ${athleteName}, ${gender}.

You are strictly forbidden from giving "benefit of the doubt." Focus on micro-deductions: toe point, knee tension, chest placement on landings, and artistry. If the form is not "picture perfect," the deduction must be taken.

For every skill: name it, note the exact timestamp when it begins and ends (in seconds from video start), list every deduction with the specific body part and position, and estimate its difficulty value.

Celebrate the good and perfect skills as well. Provide a coaching summary with the top 3 fixes.
${event === "Auto-detect" ? "\nAuto-detect which apparatus/event this is from the video." : ""}`;

  return { system, user };
}


// ═══════════════════════════════════════════════════════════════════════════════
// PASS 2: DEEP ANALYSIS — Team of specialists
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build the Pass 2 prompt — team of specialists enriches each skill.
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
  const athleteName = profile.name || "the gymnast";

  const system = `You are now acting as a team of specialists analyzing a gymnastics routine for a young athlete and their parent:
- USAG judge (you have the deduction list from the initial judging pass)
- Sports biomechanics expert (joint angles, body alignment, efficiency)
- Physical therapist (injury risk identification)
- Strength and conditioning coach (corrective drills)
- Sports psychologist (mental performance indicators)
- Performance nutritionist (recovery and training load guidance)

Athlete: ${athleteName}, ${gender}, ${levelDisplay}, ${event || "gymnastics"}.

For each skill identified in the initial judging pass, analyze:
1. BIOMECHANICS: key joint angles at peak execution (estimate degrees for hips, knees, shoulders), body line score (1-10), efficiency rating (1-10)
2. INJURY RISK: risk level (low/medium/high), body part at risk, specific concern, prevention note
3. ELITE COMPARISON: one sentence describing how this skill looks vs elite execution
4. CORRECTIVE DRILL: the single most impactful drill for the primary deduction on this skill, with sets/reps

Also provide routine-level analysis:
5. MENTAL PERFORMANCE: focus consistency patterns, notes for athlete psychology, specific recommendations
6. TRAINING PLAN: top 3 priority drills for this session based on deductions found, with frequency and expected improvement
7. NUTRITION NOTE: one performance nutrition note relevant to this athlete's training load

Be precise, specific, and constructive. This data goes directly to the athlete's parent.
Respond ONLY in the JSON schema provided. No conversational text.`;

  // Build skill list for context
  const skillList = (pass1Result.deduction_log || []).map(s => {
    const dedList = (s.deductions || []).map(d => `${d.type} (${d.body_part}): -${d.point_value}`).join(", ");
    return `- "${s.skill_name}" at ${s.timestamp_start}s-${s.timestamp_end}s (total deduction: ${s.total_deduction}, faults: ${dedList || s.reason || "none"})`;
  }).join("\n");

  const user = `Re-watch the attached video. The following skills were identified in the initial judging pass:

${skillList}

For EACH skill listed above, provide the full specialist analysis.
Match skills by name and timestamp.

Then provide the routine-level training plan (top 3 drills), mental performance assessment, and nutrition note.

Respond ONLY in the JSON schema provided.`;

  return { system, user };
}


// ═══════════════════════════════════════════════════════════════════════════════
// Gemini API Configuration
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Pass 1 config: Deterministic scoring with structured JSON.
 * Temperature 0.1 — scoring, not creative writing.
 * Thinking budget: medium — prompt quality drives accuracy more than max thinking.
 */
export const PASS1_CONFIG = {
  temperature: 0.4,
  topP: 0.95,
  maxOutputTokens: 16384,
  responseMimeType: "application/json",
  thinkingConfig: {
    thinkingBudget: 8192,
  },
  responseSchema: {
    type: "object",
    properties: {
      athlete_name: { type: "string" },
      level: { type: "string" },
      event: { type: "string" },
      gender: { type: "string" },
      start_value: { type: "number" },
      duration_seconds: { type: "number" },
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
            skill_name: { type: "string" },
            skill_order: { type: "number" },
            timestamp_start: { type: "number" },
            timestamp_end: { type: "number" },
            executed_successfully: { type: "boolean" },
            difficulty_value: { type: "number" },
            total_deduction: { type: "number" },
            deductions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: { type: "string" },
                  body_part: { type: "string" },
                  description: { type: "string" },
                  point_value: { type: "number" },
                },
                required: ["type", "body_part", "description", "point_value"],
              },
            },
            quality_grade: { type: "number" },
            reason: { type: "string" },
            rule_reference: { type: "string" },
            is_celebration: { type: "boolean" },
            strength_note: { type: "string" },
          },
          required: [
            "skill_name", "skill_order", "timestamp_start", "timestamp_end",
            "executed_successfully", "difficulty_value", "total_deduction",
            "deductions", "quality_grade", "reason", "is_celebration",
          ],
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
        required: [
          "expression_deduction", "quality_of_movement_deduction",
          "choreography_variety_deduction", "musicality_deduction",
          "total_artistry_deduction", "notes",
        ],
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
 * Pass 2 config: Deep analysis with team of specialists.
 * Same temperature for consistency.
 * Thinking budget: medium.
 */
export const PASS2_CONFIG = {
  temperature: 0.4,
  maxOutputTokens: 16384,
  responseMimeType: "application/json",
  thinkingConfig: {
    thinkingBudget: 8192,
  },
  responseSchema: {
    type: "object",
    properties: {
      skill_details: {
        type: "array",
        items: {
          type: "object",
          properties: {
            skill_name: { type: "string" },
            timestamp_start: { type: "number" },
            category: { type: "string", enum: ["ACRO", "DANCE", "TURN", "LEAP", "DISMOUNT", "MOUNT", "SERIES", "TRANSITION"] },
            biomechanics: {
              type: "object",
              properties: {
                peak_joint_angles: {
                  type: "object",
                  properties: {
                    hips: { type: "number" },
                    knees: { type: "number" },
                    shoulders: { type: "number" },
                  },
                  required: ["hips", "knees", "shoulders"],
                },
                body_line_score: { type: "number" },
                efficiency_rating: { type: "number" },
                notes: { type: "string" },
              },
              required: ["peak_joint_angles", "body_line_score", "efficiency_rating", "notes"],
            },
            injury_risk: {
              type: "object",
              properties: {
                level: { type: "string", enum: ["low", "medium", "high"] },
                body_part: { type: "string" },
                description: { type: "string" },
                prevention_note: { type: "string" },
              },
              required: ["level", "body_part", "description", "prevention_note"],
            },
            elite_comparison: { type: "string" },
            corrective_drill: {
              type: "object",
              properties: {
                name: { type: "string" },
                description: { type: "string" },
                sets_reps: { type: "string" },
              },
              required: ["name", "description", "sets_reps"],
            },
          },
          required: [
            "skill_name", "timestamp_start", "category", "biomechanics",
            "injury_risk", "elite_comparison", "corrective_drill",
          ],
        },
      },
      training_plan: {
        type: "array",
        items: {
          type: "object",
          properties: {
            priority: { type: "number" },
            deduction_targeted: { type: "string" },
            drill_name: { type: "string" },
            drill_description: { type: "string" },
            frequency: { type: "string" },
            expected_improvement: { type: "string" },
          },
          required: [
            "priority", "deduction_targeted", "drill_name",
            "drill_description", "frequency", "expected_improvement",
          ],
        },
      },
      mental_performance: {
        type: "object",
        properties: {
          focus_indicators: { type: "string" },
          consistency_patterns: { type: "string" },
          athlete_recommendations: { type: "string" },
        },
        required: ["focus_indicators", "consistency_patterns", "athlete_recommendations"],
      },
      nutrition_note: { type: "string" },
    },
    required: ["skill_details", "training_plan", "mental_performance", "nutrition_note"],
  },
};
