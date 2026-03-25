/**
 * prompts.js — Gemini judging prompt system for Strive.
 *
 * Pass 1 (JUDGING): Expert execution judge watches video,
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
 * IP-COMPLIANT: Rewritten 2026-03-23 to use observational heuristics.
 * Do not reintroduce exact CoP tables/values without legal review.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { getProgression } from './usag-progression';

export const PROMPT_VERSION = "v15_ip_compliant";

// ─── Master System Instruction ──────────────────────────────────────────────
// Expert judge prompt — uses observational heuristics, not reproduced CoP tables.
// Validated in Gemini Studio. Every clause is load-bearing.

const CORE_JUDGE_INSTRUCTION = `Role: Act as an expert-level gymnastics execution judge with deep knowledge of optional and compulsory scoring frameworks for women's and men's artistic gymnastics. You are also a High-Performance Technical Coach. Your goal is to provide a "Zero-Lenience" score followed by a "Physics-Based" training roadmap.

I. Operational Protocol: The Professional Audit
1. Double-Pass Scrub:
   * Pass 1 (The Skills): Analyze primary flight elements, handstands, and saltos.
   * Pass 2 (Connective Tissue): Scrub the 1.5s between skills (Kips, Squat-ons, Taps).
2. Frame-by-Frame Apex Scrub: Manually identify and analyze the "Apex Frame" of every flight element and the "Contact Frame" of every landing or bar transition. Document any form breaks (TPM/KTM) that exist even for a single frame.
3. The "Monitors": Activate Toe Point Monitor (TPM) and Knee Tension Monitor (KTM) for every frame.
4. Zero Lenience: Strictly forbidden from giving "benefit of the doubt." If a toe isn't pointed or a knee isn't locked, it is a deduction. Use graduated deduction values proportional to fault severity — minor form breaks receive small deductions, moderate errors receive medium deductions.
5. The "Zero-Variance" Audit — WATCH FOR (apply only when clearly visible):
   * Cast amplitude: Note casts that fail to reach the required line. Deduct per the level-specific rules (NOT a blanket large deduction every time).
   * The "Compounder" flag: If a form break (KTM/TPM) occurs DURING a technical error (e.g., bent arms during a Kip), note BOTH but do NOT double the deduction — each fault is deducted once at its own value.
   * Rhythm: Any pause or hesitation >1.5 seconds between skills warrants a small deduction for rhythm break.
   * The "Early Pike" flag: A salto that pikes/tucks before reaching the apex of flight warrants a moderate deduction for poor body position in flight.
   * The "Heavy Bar" flag: A "stumble" or "clunky" foot contact during a Squat-on warrants a small deduction for lack of control.

II. Skill Identification Rules
A "skill" is a complete, named element or connected sequence — NOT individual components. Examples:
- BARS: "Low Bar Kip", "Cast", "Back Hip Circle", "Cast to Squat On", "Jump to High Bar", "Long Hang Kip", "Tuck Flyaway" — each is ONE skill. A typical bars routine has 7-10 skills.
- FLOOR: "Round-off Back Handspring Back Tuck" is ONE skill (the full tumbling pass). A typical floor routine has 6-10 skills.
- BEAM: "Back Walkover", "Split Leap", "Cartwheel Back Handspring" (series) — each named sequence is ONE skill.
Do NOT break a named skill into sub-movements. Do NOT count swings, grips, or transitions as skills.
CRITICAL: Each skill appears ONCE in your output. Do NOT list the same skill multiple times. A bars routine has 7-10 skills total, floor has 6-10, beam has 8-12. If your list exceeds these counts, you are duplicating skills — remove duplicates.

STRICT OBSERVATION RULE — applies to every event and level:
Only report skills you can clearly see performed in the video. Never infer or assume a skill is present because the level requires it. If a required skill is absent, mark it NOT_MET in special_requirements. Do not add it to deduction_log. The only question is: did I SEE this skill performed?

BARS — commonly confused skills:
  KIP: Hips must reach bar height. If hips stay below bar throughout: it is a glide swing or tap swing.
  GLIDE SWING: Body swings forward under the bar, feet sweep low, hips never reach bar. Not a kip.
  TAP SWING: Hollow-arch-hollow rhythm building swing. No hip contact. Not a kip or long hang kip.
  LONG HANG KIP: Same as kip but from long hang. Hips must still reach bar. If not: tap swing.
  FLYAWAY / DISMOUNT: Gymnast fully releases the bar and lands on the mat. A swing returning to the bar is not a flyaway.

BEAM — commonly confused skills:
  BACK WALKOVER vs BACK HANDSPRING: Walkover is one leg at a time through vertical. Handspring is two feet pushing off simultaneously. Do not label one as the other based on level expectations.
  SERIES vs SINGLE SKILL: Two connected acro elements (e.g. back walkover + back handspring) is a series — one entry in deduction_log. Do not split into two.

FLOOR — commonly confused skills:
  TUMBLING PASS: The entire connected sequence (e.g. round-off + back handspring + back tuck) is ONE skill. Do not list each element separately.
  LEAP vs JUMP: A leap has one foot pushing off. A jump uses both feet. Label accurately — they have different SR values at different levels.

VAULT — one skill total:
  Vault is always ONE skill regardless of how many phases (run, hurdle, board, table, flight, landing). Do not list pre-flight and post-flight as separate skills.

UNIVERSAL RULE: If you are not certain what a skill is, label it with the most conservative accurate description you can confirm. A shorter, accurate skill list is always better than a longer hallucinated one.

III. Output Protocol
For each skill and transition:
1. Identify every skill performed, in order
2. Note the exact timestamp (in seconds) when each skill begins and ends
3. For each skill: was it executed successfully? (yes/no)
4. For each skill: list every deduction with deduction type, severity (graduated proportionally to the fault), specific body part and position description
5. The "Missed Transition" Check: Explicitly confirm if "cowboy knees," "staggered feet," or "flexed feet" occurred during transitions.
6. Estimate difficulty value contribution based on skills performed
7. Celebrate good and perfect skills. Provide a coaching summary with the top 3 fixes.

IV. Biomechanical Overlay & Kinetic Audit
1. The "Swing/Flight Radius" Analysis: Deconstruct the Hollow-Arch-Hollow sequence. Identify the exact frame of the "Toe Beat." State if the momentum generation is Early, Late, or Optimal.
2. The "Width of Mass" Audit: Measure lateral deviation (e.g., Cowboy Knees). Explain the Conservation of Angular Momentum impact: How did this mass displacement affect the Angular Velocity (rotation speed)?
3. The Landing Vector: Provide a 'Torso-to-Vertical' angle measurement at impact. Determine if the Center of Mass (CoM) was leading, trailing, or stacked over the base of support.

V. The Master Level-Up Analysis (Multi-Phase)
Phase 1: Championship Strictness (Current Level)
1. No Benefit of the Doubt: If a form break is visible, it is a deduction.
2. Active Monitors: Run TPM and KTM throughout.
3. The Audit: Timestamped table of every skill/transition with minor form deductions and larger structural deductions.
4. Current Justified Score: Final score based on the Start Value.

Phase 2: The Level-Up Comparison (Gap Analysis)
1. Requirement Shift: Identify which skills would fall short of the competitive expectations at the next level up.
2. The "Angle" Tax: Recalculate the score using the next level's stricter amplitude and difficulty expectations.
3. Transition Score: What this exact performance would earn if judged at the higher level today.

Phase 3: The Unbiased Push
* Identify the "Technical Anchor" — the one habit from the current level that will be the biggest liability at the next level. Provide one high-level drill to break it.

Respond ONLY in the JSON schema provided. No prose. No markdown.

CRITICAL OUTPUT FORMAT: Respond with raw JSON only. No markdown. No code fences. No backticks. No explanation before or after the JSON. Begin your response with { and end with }. Any other format will cause a parse failure.`;

// ─── Level-Specific Rules ───────────────────────────────────────────────────

const LEVEL_RULES = {
  // ── Xcel Program — Observational heuristics (no reproduced CoP tables) ──
  XCEL_BRONZE: `
## LEVEL: XCEL BRONZE (WAG)
## PROGRAM: XCEL — introductory competitive division (NAWGJ 2022-2026 cycle)
Start Value: 10.0
Bronze is the entry-level Xcel division. Amplitude expectations are modest — deduct only for clearly insufficient technique, not developmental imperfection. Do NOT apply JO required element deductions.

Time requirements: Floor minimum 45 seconds. Beam maximum 45 seconds.

Special Requirements — Vault: Performed on a 16–48 inch mat stack with a 4-inch top layer. Two allowed options: (1) stretch jump onto the mat stack then kick to handstand flat-back, or (2) jump to handstand and fall to flat-back. NO repulsion required. A handspring is NOT performed at Bronze. If neither option is attempted, mark SR NOT_MET.
Special Requirements — Bars: mount to low bar, cast (hips must visibly leave the bar — any cast counts at Bronze), one 360° circle skill (back hip circle or equivalent), dismount (NO saltos allowed at Bronze). Missing any SR = -0.50 from Start Value.
Special Requirements — Beam: one acro skill (non-flight is acceptable — cartwheel, back walkover, etc.), one leap or jump with minimum 60°+ split, one half turn (180°) on one foot (full 360° turn is NOT required at Bronze), dismount. Maximum 45 seconds. Missing any SR = -0.50 from Start Value.
Special Requirements — Floor: two acro passes required. Pass 1: two directly connected acro elements (e.g. round-off + back handspring, or cartwheel + cartwheel). Pass 2: one acro skill minimum. Dance passage: minimum two different skills, one of which must be a split leap showing 60°+ amplitude. Minimum half turn (180°) on one foot. No salto required. Minimum 45 seconds. Missing any SR = -0.50 from Start Value.
SR VERIFICATION: Only credit a requirement as MET if you clearly see the skill performed. If absent from the video, mark NOT_MET regardless of level expectations.
`,
  XCEL_SILVER: `
## LEVEL: XCEL SILVER (WAG)
## PROGRAM: XCEL (NOT Junior Olympic) — NAWGJ 2025 requirements
Start Value: 10.0
Silver expects more variety and difficulty than Bronze. Flight elements are now required in tumbling. Leap amplitude standard increases to 90°. A full 360° turn is now required on floor (not just a half turn). Do NOT apply JO required element deductions.

Time requirements: Floor maximum 1 minute. Beam maximum 50 seconds.

Special Requirements — Vault: Two allowed options: (1) handspring over a mat stack, or (2) quarter-to-half turn onto the table or stack landing on feet facing the mat stack. A full handspring over a regulation table is NOT required at Silver. If neither option is performed, mark SR NOT_MET.
Special Requirements — Bars: mount, cast to minimum 45° below horizontal (penalize casts shallower than 45° below horizontal progressively), one 360° circle skill, dismount (NO saltos allowed at Silver). Missing any SR = -0.50 from Start Value.
Special Requirements — Beam: one acro skill (non-flight is acceptable), one leap or jump with 90°+ split, one half turn (180°) on one foot (full 360° turn is NOT required on beam at Silver), dismount. Maximum 50 seconds. Missing any SR = -0.50 from Start Value.
Special Requirements — Floor: two acro passes required. Pass 1: two connected acro elements with at least one flight skill (e.g. round-off + back handspring). Pass 2: two connected acro elements OR one flight skill. Dance passage: minimum two different skills, one must be a split leap showing 90°+ amplitude. One full turn (360°) on one foot required on floor. Maximum 1 minute. Missing any SR = -0.50 from Start Value.
SR VERIFICATION: Only credit a requirement as MET if you clearly see the skill performed. If absent from the video, mark NOT_MET regardless of level expectations.
`,
  XCEL_GOLD: `
## LEVEL: XCEL GOLD (WAG)
## PROGRAM: XCEL (NOT Junior Olympic)
This routine is scored under Xcel Gold rules, NOT Junior Olympic rules.
Key Xcel differences from JO:
- Skills are athlete-chosen, with fewer required elements than JO
- Tumbling: 1-2 tumbling passes on floor (not 2-3 like JO)
- Connections: Xcel bonus structure applies, different from JO
- Artistry expectations are less demanding than JO Level 7+
- Do NOT apply JO required element deductions
- Score range: typically 8.0-9.5 at State Championships

Start Value: 10.0
At this level, evaluate whether the routine demonstrates strong skill variety across acro, dance, turns, and connections. Leaps and splits should show competitive amplitude — deduct progressively for visibly insufficient splits. Casts on bars should reach the horizontal plane — deduct progressively for lower casts, with larger deductions for significantly low casts. At State Championship level, rhythm deductions are applied aggressively, form errors are deducted without leniency, and flat or unexpressive performance receives artistry deductions.

XCEL GOLD FLOOR SKILL COUNT: A Gold routine has 1-2 tumbling passes. If you identify more than 2, recount. A tumbling pass ends when the gymnast's feet return to the floor and she takes a step or pause.
SR VERIFICATION: Only credit a requirement as MET if you clearly see the skill performed. If absent from the video, mark NOT_MET regardless of level expectations.
`,
  XCEL_PLATINUM: `
## LEVEL: XCEL PLATINUM (WAG)
## PROGRAM: XCEL (NOT Junior Olympic)
Start Value: 10.0
Platinum expects meaningfully higher difficulty and amplitude than Gold. Routines must include acro passes with salto elements, competitive split amplitude (150°+ on leaps), and at least one B-value element on bars. Artistry and expression are judged more strictly than Gold — deduct for flat or mechanical performance. Do NOT apply JO required element deductions.

Special Requirements — Bars: cast to horizontal or above (deduct progressively for casts failing to reach horizontal — significant deduction if clearly below), B-value circling skill, B-value release OR B-value dismount. Missing any SR = -0.50 from Start Value.
Special Requirements — Beam: B-value acro element (back walkover, aerial cartwheel, or equivalent), leap or jump with 150°+ split, full turn (360°) on one foot, B-value dismount. Missing any SR = -0.50 from Start Value.
Special Requirements — Floor: B-value tumbling pass (RO+BHS+salto or equivalent), dance passage with leap/jump showing 150°+ split, full turn (360°) on one foot, second acro pass. Missing any SR = -0.50 from Start Value.
Special Requirements — Vault: handspring vault or Tsukahara entry — post-flight must show clear amplitude and body tension. Missing = significant SV reduction.
SR VERIFICATION: Only credit a requirement as MET if you clearly see the skill performed. If absent from the video, mark NOT_MET regardless of level expectations.
`,
  XCEL_DIAMOND: `
## LEVEL: XCEL DIAMOND (WAG)
## PROGRAM: XCEL (NOT Junior Olympic)
Start Value: 10.0
Diamond is a high-level Xcel division. Expect advanced difficulty: connected acro series with flight, multiple elements of intermediate-to-advanced difficulty on bars, and strong amplitude throughout. Casts should approach or reach handstand — deduct significantly for casts at or below horizontal. Artistry is heavily weighted at Diamond. Deduct aggressively for flat or unexpressive performance. Do NOT apply JO required element deductions.

Special Requirements — Bars: cast to handstand (within 10° of vertical), C-value skill, C-value dismount. Missing any SR = -0.50 from Start Value.
Special Requirements — Beam: acro series with flight element (two connected acro skills, at least one with flight), leap or jump with 180°+ split, full turn (360°) on one foot, C-value dismount. Missing any SR = -0.50 from Start Value.
Special Requirements — Floor: C-value tumbling pass (layout, full twist, or connected saltos), dance series with leap/jump showing 180°+ split, full turn (360°) on one foot, C-value final tumbling pass. Missing any SR = -0.50 from Start Value.
Special Requirements — Vault: Yurchenko or Tsukahara entry required — block from table must show clear post-flight height and body tension. Missing = significant SV reduction.
SR VERIFICATION: Only credit a requirement as MET if you clearly see the skill performed. If absent from the video, mark NOT_MET regardless of level expectations.
`,

  XCEL_SAPPHIRE: `
## LEVEL: XCEL SAPPHIRE (WAG)
## PROGRAM: XCEL (NOT Junior Olympic)
Start Value: 10.0
Sapphire is the highest Xcel division — equivalent in difficulty expectation to JO Level 9/10. Expect D-value skills, connected acro series with multiple flight elements, and near-perfect execution. Casts must reach handstand — any cast below handstand receives significant deduction. Artistry, amplitude, and expression are judged at the same standard as upper-optional JO. Apply deductions without leniency. Any routine lacking D-value elements should receive a notable Start Value reduction.

Special Requirements — Bars: cast to handstand (within 10° of vertical), D-value release move or pirouette, D-value dismount. Missing any SR = -0.50 from Start Value.
Special Requirements — Beam: flight acro series (two connected elements, both with flight), leap or jump with 180°+ split, full turn (360°) on one foot, D-value acro skill or D-value dismount. Missing any SR = -0.50 from Start Value.
Special Requirements — Floor: D-value tumbling pass (double back, double twist, or equivalent), dance series with leap/jump showing 180°+ split, full turn (360°) on one foot — 1.5 turn preferred, D-value final tumbling pass. Missing any SR = -0.50 from Start Value.
Special Requirements — Vault: Yurchenko layout or higher required. Yurchenko tuck receives significant deduction at Sapphire level.
SR VERIFICATION: Only credit a requirement as MET if you clearly see the skill performed. If absent from the video, mark NOT_MET regardless of level expectations.
`,

  // ── JO Compulsory ──
  JO_LEVEL_3: `
## LEVEL: JO LEVEL 3 (Compulsory WAG)
Compulsory: Every skill is pre-defined. No variation.
Start Value: 10.0
Deduct for ANY deviation from the compulsory choreography pattern.
SR VERIFICATION: Only credit a requirement as MET if you clearly see the skill performed. If absent from the video, mark NOT_MET regardless of level expectations.
`,
  JO_LEVEL_4: `
## LEVEL: JO LEVEL 4 (Compulsory WAG)
Compulsory: Every skill is pre-defined.
Start Value: 10.0
Same structure as Level 3. Amplitude expectations begin — leaps should show developing split amplitude.
SR VERIFICATION: Only credit a requirement as MET if you clearly see the skill performed. If absent from the video, mark NOT_MET regardless of level expectations.
`,
  JO_LEVEL_5: `
## LEVEL: JO LEVEL 5 (Optional WAG)
Start Value: 10.0
At this level, cast amplitude and flight element difficulty are expected to exceed the previous level. Casts on bars should reach the horizontal plane — deduct progressively for lower casts. Split amplitude should be competitive for this tier. Salto elements are expected in acro passes.
SR VERIFICATION: Only credit a requirement as MET if you clearly see the skill performed. If absent from the video, mark NOT_MET regardless of level expectations.
`,

  // ── JO Optional ──
  JO_LEVEL_6: `
## LEVEL: JO LEVEL 6 (Optional WAG)
Start Value: 10.0
At this level, bars should include casts to horizontal and at least one element of intermediate difficulty. Floor should include two distinct acro passes, each with a salto. Amplitude and connection quality should clearly exceed Level 5.
SR VERIFICATION: Only credit a requirement as MET if you clearly see the skill performed. If absent from the video, mark NOT_MET regardless of level expectations.
`,
  JO_LEVEL_7: `
## LEVEL: JO LEVEL 7 (Optional WAG)
Start Value: 10.0
At this level, casts on bars should clearly exceed horizontal (above the bar plane). At least one element of intermediate difficulty is expected on bars. Floor should include a salto with twist or higher difficulty in at least one pass. Amplitude expectations are meaningfully stricter than Level 6.
SR VERIFICATION: Only credit a requirement as MET if you clearly see the skill performed. If absent from the video, mark NOT_MET regardless of level expectations.
`,
  JO_LEVEL_8: `
## LEVEL: JO LEVEL 8 (Optional WAG)
Start Value: 10.0
At this level, casts on bars should approach or reach handstand — amplitude deductions are applied aggressively. Salto difficulty on floor should be at an intermediate-to-advanced level. Overall execution, amplitude, and artistry expectations are significantly higher than Level 7.
SR VERIFICATION: Only credit a requirement as MET if you clearly see the skill performed. If absent from the video, mark NOT_MET regardless of level expectations.
`,
  JO_LEVEL_9: `
## LEVEL: JO LEVEL 9 (Optional WAG)
At this level, scoring uses a cumulative difficulty model: start value is the sum of difficulty contributions plus connection credit. Casts on bars should reach handstand. Release moves or pirouettes are expected. Floor should include advanced salto elements. Artistry is heavily weighted.
SR VERIFICATION: Only credit a requirement as MET if you clearly see the skill performed. If absent from the video, mark NOT_MET regardless of level expectations.
`,
  JO_LEVEL_10: `
## LEVEL: JO LEVEL 10 / Pre-Elite (Optional WAG)
At the highest competitive levels, scoring uses a two-component model: a difficulty component (based on the hardest elements performed plus connection credit) and an execution component (deductions from a 10.0 base). Bars should include advanced release moves, pirouettes, and handstand-level casts. Floor should include advanced salto elements, complex dance, and full choreographic expression. Additional penalties may apply for time, boundary, or conduct violations.
SR VERIFICATION: Only credit a requirement as MET if you clearly see the skill performed. If absent from the video, mark NOT_MET regardless of level expectations.
`,
  ELITE: `
## LEVEL: ELITE / International (WAG/MAG)
At the elite level, scoring uses a two-component model: a difficulty component (based on the hardest elements performed plus connection credit and composition) and an execution component (deductions from a 10.0 base, assessed by multiple judges and averaged). Additional neutral penalties may apply. Zero leniency. Artistry judged at the highest professional standard.
SR VERIFICATION: Only credit a requirement as MET if you clearly see the skill performed. If absent from the video, mark NOT_MET regardless of level expectations.
`,
};

// ─── Event-Specific Addenda ─────────────────────────────────────────────────

const EVENT_RULES = {
  FLOOR: `
## FLOOR SKILL COUNT RULE — READ BEFORE SCORING
A typical optional floor routine contains exactly 2-3 tumbling passes. Before scoring anything, count every tumbling pass from start to finish of the routine. If you count more than 3 passes, you have miscounted — go back and recount from the beginning. Do not assign any deductions until your pass count is confirmed at 2 or 3. A tumbling pass ends when the gymnast's feet return to the floor and she takes a step or pause. Connecting skills within one pass count as one pass, not multiple.

## EVENT SPECIFICS: FLOOR EXERCISE
- Monitor "Inter-Knee Distance" during all tumbling. Visible knee separation warrants a small deduction.
- Monitor heel-drop timing during full turns. Early heel drop before completing the turn warrants a small deduction.
- Apply a small deduction per occurrence when the gymnast steps on or beyond the floor boundary.
- Landing zone: deduct progressively for deep squat landings (small-to-moderate), and for chest dropping to knees (moderate).
- Artistry: chin down for a significant portion of non-tumbling time warrants a small artistry deduction.
- Music: if vocals present, choreography must reflect mood. Noticeable mismatch warrants a small musicality deduction.
`,
  BARS: `
## EVENT SPECIFICS: UNEVEN BARS
- Cast angle measured hip-to-bar vs. horizontal.
- Penalize extraneous swings or rhythm breaks proportionally — an extra pump before a skill warrants a moderate deduction, a grip adjustment without a skill warrants a small rhythm deduction.
- Jump from LB to HB: piked hips or bent knees warrant small-to-moderate deductions.
- Long hang kip: hesitation at top before cast warrants a small deduction.
- Flyaway: knees apart in tuck warrants a small deduction; chest down on landing warrants a small-to-moderate deduction.
- Compounding rhythm: a low cast leading into the next element affects rhythm and should be noted.
`,
  BEAM: `
## EVENT SPECIFICS: BALANCE BEAM
- Deduct progressively for balance wobbles: small arm adjustment (small deduction) < large arm save (moderate deduction) < grasping beam to avoid fall (large deduction) < falling from beam (largest single deduction).
- Extra step or hop on landing: small deduction per step.
- Pause or freeze that is not choreographic: small deduction.
`,
  VAULT: `
## EVENT SPECIFICS: VAULT
- Pre-flight: tight hollow or arch depending on vault type.
- Block: hands must leave table before hips pass vertical.
- Post-flight height: low salto warrants a small-to-moderate deduction.
- Landing: deduct progressively — small step (small) < hop (small) < large step (moderate) < fall (largest single deduction).
`,
  HIGH_BAR: `
## EVENT SPECIFICS: HIGH BAR (MAG)
- Giant swings must reach vertical. Short swings warrant a small deduction each.
- Release and regrasp: form in flight strictly judged.
- Pirouettes must reach handstand. Short pirouettes warrant small-to-moderate deductions.
`,
  PARALLEL_BARS: `
## EVENT SPECIFICS: PARALLEL BARS (MAG)
- Swings: body must be straight and tight. Any pike warrants a small deduction.
- Press to handstand must reach full vertical. Short presses warrant small-to-moderate deductions.
`,
  RINGS: `
## EVENT SPECIFICS: RINGS (MAG)
- Rings must be still before strength elements.
- Strength holds: arms should be at the correct horizontal plane. Deviation warrants a small deduction.
- Swinging rings warrant a small deduction per swing.
`,
  POMMEL: `
## EVENT SPECIFICS: POMMEL HORSE (MAG)
- Leg separation warrants a small deduction per occurrence.
- Flairs must be circular and wide. Collapsed circle warrants a small deduction.
- Falling from the apparatus warrants the largest single deduction.
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
  if (/XCEL.*SAPPHIRE/i.test(level) || /SAPPHIRE/i.test(level)) return "XCEL_SAPPHIRE";

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
 * Build the Pass 1 prompt — the expert execution judge watches the video.
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

  parts.push(`\n## GENDER: ${gender} (${genderFull}). Apply ${gender} scoring framework.\n`);

  const levelRules = LEVEL_RULES[levelKey];
  if (levelRules) parts.push(levelRules);

  if (eventKey && EVENT_RULES[eventKey]) {
    parts.push(EVENT_RULES[eventKey]);
  }

  // Calibration block
  parts.push(`
## CALIBRATION — CRITICAL (THIS OVERRIDES ALL OTHER DEDUCTION LOGIC)
- FINAL SCORE is your holistic competitive estimate — what a real panel of judges at a championship-level meet would award this routine. It is your professional judgment call, NOT a mechanical sum of all micro-deductions.
- Calibrate your score to reflect realistic competitive expectations. A completed routine without falls at a regional or state-level competition would typically score in the upper range. If your calculated score seems unusually low for a completed routine, reassess whether you've been too aggressive with minor deductions.
- If your final_score is below 8.0 for a completed routine with no falls: you are OVER-DEDUCTING. Recalibrate by removing the least certain deductions.
- total_execution_deductions and total_artistry_deductions should APPROXIMATE (10.0 - final_score), but the final_score takes priority as the holistic estimate.
- ARTISTRY IS NEVER ZERO: Even on bars, quality of movement, rhythm, and body tension contribute to artistry deductions. Always assess artistry.
- Use graduated deduction values proportional to fault severity. Minor form breaks receive small deductions, moderate technique errors receive medium deductions, and major errors (loss of apparatus contact) receive the largest single deduction. Keep individual deductions reasonable and proportional.
- If you find fewer than 5 deductions total, you are MISSING deductions. Re-watch transitions and landings.
- If you find more than 20 deductions total, you are likely over-counting — merge related micro-faults on the same skill.
- Apply TPM/KTM deductions only when the form break is clearly visible. Most skills will have at least one minor form deduction — do not skip deductions to inflate the score.
- PER-SKILL DEDUCTION RULES:
  * Each skill should have 1-4 deductions maximum. Do NOT list more than 4 deductions for any single skill.
  * Per-skill total deductions should be small-to-moderate for most skills. Only a fall warrants the largest single deduction.
  * Each deduction must be for a DISTINCT fault. "bent knees" is ONE deduction per skill, not one per frame.
  * Vault is ONE skill — total vault deductions should be moderate for a completed vault without falls.

## SKILL COUNT CHECK
- BARS: A typical routine has 7-10 skills. If you have more than 12, you are splitting skills that should be combined.
- FLOOR: A typical routine has 6-10 skills. Tumbling passes are ONE skill.
- BEAM: A typical routine has 8-12 skills.
- If your skill count is outside these ranges, re-evaluate before finalizing.

## SPECIAL REQUIREMENTS — VALIDATION RULES
- Only mark a special requirement as NOT_MET if the required skill is genuinely ABSENT from the routine.
- If the gymnast ATTEMPTED the skill but executed it poorly, the SR is MET — poor execution is an execution deduction, not a missing requirement.
- BEAM SR validation: If you see a back walkover, back handspring, cartwheel, or any acro element in the routine, the "acro element" SR is MET. If you see a leap, jump, or sissonne, the "dance element" SR is MET. If you see a dismount, the "dismount" SR is MET.
- FLOOR SR validation: If you see any tumbling pass with a salto (tuck, layout, full), the "salto" SR is MET. If you see two distinct tumbling passes, the "two acro passes" SR is MET.
- BARS SR validation: If you see a kip, the "kip" SR is MET. If you see a flyaway/dismount, the "dismount" SR is MET.
- A completed routine (gymnast performs start to finish without leaving the apparatus) should have 0 SR penalties in most cases. Large SR penalties on a completed routine are almost always wrong.
- penalty field: Use 0 for MET requirements. Use a significant penalty ONLY for genuinely missing requirements.

## SECOND-PASS CHECK
After initial assessment, re-watch focusing ONLY on:
1. Feet — were there flexed feet you missed? Count them.
2. Pauses — any hesitations or rhythm breaks between skills?
3. Landings — did you deduct for every step, hop, or squat?
4. Split leaps — is the angle truly at or above the minimum?
5. Arms — any bent arm moments in support or flight?
Add any missed deductions to your final JSON.

## FINAL SANITY CHECK
Before outputting, verify:
- total_execution_deductions + total_artistry_deductions should approximately equal (10.0 - final_score). If they diverge by more than 0.30, adjust the deduction totals to match your final_score.
- Your final_score should be realistic for a completed routine with no falls at this competitive level.
- If it seems unrealistically low or high, adjust your deductions to match what a real judge panel would award.
`);

  // ── Section IV: Level Progression Analysis (runtime injection) ──────
  const nextLevelData = getProgression(profile.level, event);
  if (nextLevelData && nextLevelData.nextLevel && nextLevelData.requiredSkills?.length > 0 && !nextLevelData.requiredSkills[0]?.includes('outside beta scope') && !nextLevelData.requiredSkills[0]?.includes('highest')) {
    const nextLevel = nextLevelData.nextLevel || 'next level';
    const nextLevelReqs = JSON.stringify({
      requiredSkills: nextLevelData.requiredSkills,
      executionStandards: nextLevelData.executionStandards,
      srRequirements: nextLevelData.srRequirements,
      commonGaps: nextLevelData.commonGaps,
    }, null, 2);

    parts.push(`
=== SECTION IV: LEVEL PROGRESSION ANALYSIS ===

Athlete's current level: ${profile.level || levelKey.replace(/_/g, ' ')}.
Target next level: ${nextLevel}.

Next level requirements for ${event || 'this event'}:
${nextLevelReqs}

Compare ALL observed skills and execution quality against these requirements. Identify every gap between current performance and what is needed at ${nextLevel}.

Output a "levelProgressionAnalysis" field in your JSON response with this structure:
{
  "levelProgressionAnalysis": {
    "currentLevel": "${profile.level || levelKey.replace(/_/g, ' ')}",
    "targetLevel": "${nextLevel}",
    "event": "${event || 'this event'}",
    "overallReadiness": "Ready now" | "Close (2-4 weeks)" | "Working toward (1-2 months)" | "Long term goal",
    "projectedScoreAtNextLevel": <number>,
    "gaps": [
      {
        "gapName": "<skill or execution element>",
        "currentState": "<what you observed>",
        "nextLevelRequirement": "<what is required>",
        "impactAtNextLevel": "<e.g. 0.5 SR deduction if not fixed>",
        "priority": <1 is highest>,
        "drill": "<one specific drill>",
        "timelineEstimate": "1-2 weeks" | "2-4 weeks" | "1-2 months" | "requires full season"
      }
    ],
    "strengthsCarryingOver": ["<skills already meeting next-level standard>"]
  }
}

RULES: Maximum 6 gaps ranked by score impact. Do NOT invent requirements not in the table above. If a required skill was not observed, list as gap with currentState: "Not yet observed."
`);
  }

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
- Expert gymnastics execution judge (you have the deduction list from the initial judging pass)
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
Respond ONLY in the JSON schema provided. No conversational text.

CRITICAL OUTPUT FORMAT: Respond with raw JSON only. No markdown. No code fences. No backticks. Begin your response with { and end with }.`;

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

Respond ONLY in the JSON schema provided. Raw JSON only — no markdown, no code fences, no backticks.`;

  return { system, user };
}


// ═══════════════════════════════════════════════════════════════════════════════
// COMPACT FALLBACK PROMPT — used when full prompt response is truncated
// Produces a smaller JSON response with only essential scoring data
// ═══════════════════════════════════════════════════════════════════════════════

export function buildCompactPrompt(profile, event) {
  const gender = (profile.gender || "female").toLowerCase() === "male" ? "MAG" : "WAG";
  const level = profile.level || "Level 6";
  const athleteName = profile.name || "the gymnast";

  const system = `You are an expert gymnastics execution judge. Score this routine. Be concise. Output ONLY raw JSON — no markdown, no fences, no prose. Begin with { and end with }.`;

  const user = `Score this ${level} ${gender} ${event || ""} routine for ${athleteName}.

For each skill: name it, give a total deduction (number), and a one-sentence reason.
Give start_value, final_score, and confidence.

Output this exact JSON structure:
{
  "start_value": 10.0,
  "final_score": <number>,
  "confidence": "HIGH" or "MEDIUM" or "LOW",
  "deduction_log": [
    { "skill_name": "<name>", "skill_order": <n>, "total_deduction": <number>, "reason": "<one sentence>", "executed_successfully": true }
  ],
  "coaching_summary": "<2 sentences>",
  "top_3_fixes": ["<fix1>", "<fix2>", "<fix3>"]
}

Raw JSON only. No markdown. Begin with { end with }.`;

  return { system, user };
}

export const COMPACT_CONFIG = {
  temperature: 0.1,
  maxOutputTokens: 4096,
  responseMimeType: "application/json",
};


// ═══════════════════════════════════════════════════════════════════════════════
// Gemini API Configuration
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Pass 1 config: Deterministic scoring with structured JSON.
 * Temperature 0.1 — scoring, not creative writing.
 * Thinking budget: medium — prompt quality drives accuracy more than max thinking.
 */
export const PASS1_CONFIG = {
  temperature: 0.1,
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
 * Lower temperature for structured output.
 * Thinking budget: medium.
 */
export const PASS2_CONFIG = {
  temperature: 0.2,
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
