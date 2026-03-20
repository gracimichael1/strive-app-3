/**
 * prompts.js — 2-Pass Gemini prompt system for Strive scoring engine.
 *
 * Pass 1 (VISION): Watches video, identifies skills + deductions.
 * Pass 2 (ANALYSIS): Takes Pass 1 output, adds biomechanics + coaching.
 *
 * These prompts replace the single-pass buildJudgingPrompt() in LegacyApp.js.
 * The old prompt tried to do everything in one call, producing shallow results.
 * Splitting vision from analysis lets each pass focus and go deeper.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * LOCKED: Do not modify without owner approval per STRATEGY.md rule #10.
 * PROMPT VERSION: v8_2pass
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { EVENT_JUDGING_RULES, SCORE_BENCHMARKS, LEVEL_SKILLS } from "../data/constants";
import { getEventDeductions, getEventStrictnessGuidance } from "../data/eventDeductions";
import { buildDeductionPromptBlock } from "../data/codeOfPoints";

export const PROMPT_VERSION = "v8_2pass";

// ─── Pass 1: Vision Pass ────────────────────────────────────────────────────

/**
 * Build the Pass 1 prompt — skill detection and deduction identification.
 * This pass receives the video. Gemini WATCHES and REPORTS. No score math.
 *
 * @param {Object} profile - { name, gender, level, levelCategory }
 * @param {string} event - Event name (e.g. "Floor Exercise") or "Auto-detect"
 * @returns {{ system: string, user: string }}
 */
export function buildPass1Prompt(profile, event) {
  const level = profile.level || "Level 6";
  const gender = profile.gender === "female" ? "Women's" : "Men's";
  const isAutoDetect = event === "Auto-detect";
  const athleteName = profile.name || "the gymnast";
  const cat = profile.levelCategory || "optional";
  const isXcel = cat === "xcel";
  const isComp = cat === "compulsory";
  const isElite = level === "Elite";

  // ── Split angle minimum by level ──
  const splitMin = getSplitMinimum(level, isXcel);

  // ── Level benchmarks ──
  const bench = SCORE_BENCHMARKS[level];
  const benchLine = bench
    ? `Score context for ${level} ${event}: avg ${bench.avg}, top 10% scores ${bench.top10}, typical range ${bench.low}–${bench.high}.`
    : "";

  // ── Required skills ──
  const eventKey = normalizeEventKey(event);
  const levelSkills = LEVEL_SKILLS[level];
  const requiredSkillsLine = levelSkills?.[eventKey]
    ? `Required/expected skills at ${level} ${event}: ${levelSkills[eventKey]}.`
    : "";

  // ── Program context ──
  const programContext = buildProgramContext(level, cat, isComp, isXcel, isElite, splitMin);

  // ── Event-specific rules ──
  const eventRulesBlock = !isAutoDetect ? buildEventRulesBlock(event, level) : "";

  // ── Deduction reference tables ──
  const detailedDeductions = !isAutoDetect ? getEventDeductions(event) : "";
  const strictnessGuidance = !isAutoDetect ? getEventStrictnessGuidance(event) : "";
  const copBlock = !isAutoDetect
    ? buildDeductionPromptBlock(profile.gender || "female", level, event)
    : "";

  // ── Auto-detect instruction ──
  const autoDetectLine = isAutoDetect
    ? `\nEVENT AUTO-DETECTION: Identify the apparatus from the video. Look for: balance beam (narrow beam), uneven bars (two bars at different heights), vault (running approach + springboard + table), floor exercise (spring floor, no apparatus). Report the detected apparatus in your response.\n`
    : "";

  const system = `You are a Brevet-certified USA Gymnastics judge with 20+ years of competition experience at the State and Regional championship level. You have judged thousands of ${level} routines. Watch this entire gymnastics routine from start to finish before outputting anything. You give no benefit of the doubt — when in doubt, take the higher deduction. Your goal is to find EVERY fault so the athlete can improve.`;

  const user = `Analyze this ${gender} ${level} ${isAutoDetect ? "" : event + " "}routine performed by ${athleteName}.
${autoDetectLine}
${programContext}
${requiredSkillsLine}
${benchLine}
${eventRulesBlock}
${detailedDeductions ? `\n═══ APPARATUS DEDUCTION TABLE ═══\n${detailedDeductions}\n═══ END ═══\n` : ""}
${strictnessGuidance}
${copBlock ? `\n${copBlock}\n` : ""}

YOUR TASK — identify every skill and every deduction:

1. SKILL IDENTIFICATION: List every distinct skill/element in chronological order. For tumbling passes, break into individual elements (Round-off = one entry, Back Handspring = one entry, Back Tuck = one entry). Include: mount, acro skills, dance elements (leaps, jumps, turns), connections, and dismount.

2. TIMESTAMPS: Provide start and end time (in seconds from 0.0) for each skill.

3. DEDUCTIONS: For each skill, list EVERY visible fault:
   - Name the fault specifically (e.g. "bent knees at ~145° during flight phase" not just "bent knees")
   - Assign the correct USAG deduction: 0.05, 0.10, 0.15, 0.20, 0.25, 0.30, or 0.50
   - Identify the body part affected
   - If the skill is clean, say so — deduction 0.00

4. ARTISTRY & COMPOSITION (separate from skills): Evaluate with "Global" entries:
   - Finger/hand presentation, eye contact, musicality
   - Use of floor space, transitions, energy
   - These typically total 0.15–0.40 for youth routines
   - If you find 0.00 artistry deductions, you are WRONG — re-evaluate

5. DIFFICULTY CODE: Assign USAG difficulty letter (A/B/C/D/E) to each skill.

6. STRENGTH NOTES: For each skill, note one thing the gymnast did well.

CALIBRATION — THIS IS A HARD CONSTRAINT, NOT A SUGGESTION:
- Expected total deductions for ${level}: ${getExpectedDeductionRange(event, level)}
- Score of 8.7–9.2 is typical at State Championships for ${level}
- A score above 9.20 is EXCEPTIONALLY RARE at any level — only 1-2% of routines at State Championships score above 9.20
- HARD FLOOR: If your total deductions sum to less than 0.80, YOUR ANALYSIS IS WRONG. Go back and find more faults. Every routine has at least 0.80 in deductions — flexed feet, slight bent knees, imperfect landings, artistry gaps. You are missing them.
- HARD CEILING: If your total exceeds 1.50, you are too harsh. Remove your least certain deductions until you are in range.
- TARGET: 0.90–1.20 total deductions for a typical ${level} routine
- Execution deductions typically 0.50–0.90. Artistry + composition add 0.20–0.40. These are SEPARATE — do not skip artistry.
- VALIDATION: After generating your JSON, mentally sum ALL point_values across all skills + artistry + composition. If the sum is below 0.80, you MUST re-examine and add deductions you missed before outputting.

SPLIT REQUIREMENT: ${level} requires ${splitMin}° minimum on split leaps/jumps. Short = deduction.

DEDUCTION VALUES: 0.00, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.50 ONLY.

Respond with ONLY this JSON — no markdown, no backticks, no text outside:
{
  "apparatus": "${isAutoDetect ? "<detected apparatus>" : event}",
  "duration_seconds": <number>,
  "skills": [
    {
      "id": "skill_1",
      "skill_name": "<e.g. Round-off>",
      "skill_code": "<A|B|C|D|E>",
      "timestamp_start": <seconds>,
      "timestamp_end": <seconds>,
      "executed_successfully": <true|false>,
      "difficulty_value": <0.10|0.20|0.30|0.40|0.50>,
      "deductions": [
        {
          "type": "<machine_readable e.g. bent_knees>",
          "description": "<parent-friendly: 'Knees were noticeably bent during the flight phase of the back tuck'>",
          "point_value": <0.05|0.10|0.15|0.20|0.25|0.30|0.50>,
          "body_part": "<e.g. both_knees>",
          "severity": "<small|medium|large|veryLarge|fall>"
        }
      ],
      "strength_note": "<what went well>"
    }
  ],
  "artistry": {
    "deductions": [
      {
        "type": "<e.g. flat_feet_in_dance>",
        "description": "<parent-friendly>",
        "point_value": <number>,
        "body_part": "<e.g. both_feet>"
      }
    ]
  },
  "composition": {
    "deductions": [
      {
        "type": "<e.g. limited_floor_space>",
        "description": "<parent-friendly>",
        "point_value": <number>,
        "body_part": "global"
      }
    ]
  },
  "neutral_deductions": <0 unless time violation or coaching intervention>,
  "why_this_score": "<1-2 sentences explaining the overall deduction picture>",
  "celebrations": ["<top 3 things done well>"]
}

MANDATORY SELF-CHECK — you MUST do this before outputting:
1. SUM every point_value in your JSON (skills + artistry + composition). Write the total mentally.
2. If total < 0.80: You are TOO LENIENT. Re-watch and find what you missed:
   a. Feet — count every instance of flexed/relaxed feet. Each = 0.05.
   b. Landings — did you deduct for EVERY step, hop, or squat? Even small steps = 0.05.
   c. Pauses — hesitations or rhythm breaks between skills? Each = 0.05–0.10.
   d. Split leaps — is the angle truly at or above ${splitMin}°? Measure critically.
   e. Arms — any bent arm moments in support or flight? Each = 0.05–0.10.
   f. Artistry — did you include at least 0.15 in artistry deductions? No youth routine has perfect presentation.
3. If total > 1.50: Remove your least certain deductions until in range.
4. ONLY output your JSON after the total is between 0.80 and 1.50.`;

  return { system, user };
}


// ─── Pass 2: Analysis Pass ──────────────────────────────────────────────────

/**
 * Build the Pass 2 prompt — biomechanics, injury risk, drills, mental, nutrition.
 * This pass receives Pass 1 output as context + the video for visual reference.
 *
 * @param {Object} pass1Result - Parsed JSON from Pass 1
 * @param {Object} profile - { name, gender, level }
 * @param {string} event - Event name
 * @returns {{ system: string, user: string }}
 */
export function buildPass2Prompt(pass1Result, profile, event) {
  const level = profile.level || "Level 6";
  const athleteName = profile.name || "the gymnast";
  const skillCount = pass1Result.skills?.length || 0;
  const totalDeds = (pass1Result.skills || []).reduce((sum, s) =>
    sum + (s.deductions || []).reduce((ds, d) => ds + (d.point_value || 0), 0), 0
  );

  const system = `You are a sports scientist and certified athletic trainer specializing in gymnastics biomechanics and injury prevention. You have a deep understanding of USAG competitive gymnastics at all levels, sport-specific kinesiology, and youth athlete development. You communicate in clear, parent-friendly language — no jargon without explanation.`;

  const user = `A certified judge has identified ${skillCount} skills and ${totalDeds.toFixed(2)} total deductions in this ${level} ${event} routine by ${athleteName}.

Here is the judge's full skill-by-skill analysis:
${JSON.stringify(pass1Result, null, 2)}

Watch the video and provide deeper analysis for each skill. For every skill in the list above, analyze:

1. BIOMECHANICS — What you can observe about body mechanics:
   - Estimate hip angle at peak of skill (degrees, or null if not visible)
   - Estimate knee angle at peak (degrees, or null if not visible)
   - Shoulder alignment: "aligned", "deviated_left", or "deviated_right"
   - Body line score: 0-10 (10 = perfect straight line or position)
   - Efficiency rating: "excellent" (minimal wasted energy), "good" (minor inefficiencies), or "needs_work" (significant energy leaks)
   - Elite comparison: one sentence comparing this skill to what an elite gymnast would demonstrate, written for a parent to understand

2. INJURY RISK — For each skill, assess:
   - Risk level: "none", "low", "moderate", "high"
   - Body part at risk (or null)
   - Description of the risk pattern (or null)
   - Prevention note (or null)
   - Be conservative — flag anything that could lead to chronic issues if repeated over a season

3. TRAINING PLAN — For each deduction found by the judge, prescribe ONE specific drill:
   - Name the drill
   - Describe it step-by-step so a parent can understand and a gymnast can practice
   - Prescribe frequency (e.g. "3 sets of 10 reps, 3x per week")
   - State the expected improvement (e.g. "Should eliminate bent knee deductions within 4-6 weeks")

4. MENTAL PERFORMANCE — Across the entire routine:
   - Consistency score (0-10): How consistent was execution quality across all skills?
   - Focus indicators: What do you observe about the gymnast's concentration?
   - Patterns: Any recurring tendencies (rushing, hesitating, strong finishes, etc.)?
   - Recommendations: One actionable mental performance tip

5. NUTRITION & RECOVERY — Based on the training load visible:
   - Training load assessment: What does this routine demand physically?
   - Nutrition note: General guidance appropriate for a youth athlete (no medical advice, no supplements, consult coach/doctor disclaimer)
   - Recovery priority: What should this gymnast focus on for recovery?

Respond with ONLY this JSON — no markdown, no backticks:
{
  "skills_analysis": [
    {
      "skill_id": "<matching id from judge's list>",
      "biomechanics": {
        "hip_angle_at_peak": <degrees or null>,
        "knee_angle_at_peak": <degrees or null>,
        "shoulder_alignment": "<aligned|deviated_left|deviated_right>",
        "body_line_score": <0-10>,
        "efficiency_rating": "<excellent|good|needs_work>",
        "elite_comparison": "<one sentence>"
      },
      "injury_risk": {
        "level": "<none|low|moderate|high>",
        "body_part": "<string or null>",
        "description": "<string or null>",
        "prevention_note": "<string or null>"
      },
      "drill_recommendation": "<primary drill for this skill's biggest fault>"
    }
  ],
  "training_plan": [
    {
      "deduction_targeted": "<fault type from judge's deductions>",
      "skill_id": "<skill id>",
      "drill_name": "<name>",
      "drill_description": "<step-by-step>",
      "frequency": "<prescription>",
      "expected_improvement": "<what to expect>"
    }
  ],
  "mental_performance": {
    "consistency_score": <0-10>,
    "focus_indicators": "<observations>",
    "patterns_observed": "<patterns>",
    "recommendations": "<actionable tip>"
  },
  "nutrition_recovery": {
    "training_load_assessment": "<assessment>",
    "nutrition_note": "<guidance with disclaimer>",
    "recovery_priority": "<focus area>"
  }
}`;

  return { system, user };
}


// ─── Gemini API config for each pass ────────────────────────────────────────

/**
 * Generation config for Pass 1 (vision — needs deterministic, accurate output)
 */
export const PASS1_CONFIG = {
  temperature: 0.1,
  topP: 1,
  topK: 1,
  maxOutputTokens: 16384,
  seed: 42,
  responseMimeType: "application/json",
  // Thinking budget: medium — accuracy gains plateau past this, latency hurts UX
  // thinkingConfig: { thinkingBudget: 8192 },  // Enable when Gemini supports it
};

/**
 * Generation config for Pass 2 (analysis — slightly more creative for coaching)
 */
export const PASS2_CONFIG = {
  temperature: 0.2,
  topP: 0.95,
  topK: 10,
  maxOutputTokens: 12288,
  seed: 42,
  responseMimeType: "application/json",
};


// ─── Helper functions ───────────────────────────────────────────────────────

function getSplitMinimum(level, isXcel) {
  if (isXcel) {
    if (level.includes("Bronze") || level.includes("Silver")) return 90;
    if (level.includes("Gold")) return 120;
    if (level.includes("Platinum")) return 150;
    return 180;
  }
  if (["Level 1", "Level 2", "Level 3", "Level 4"].includes(level)) return 90;
  if (level === "Level 5") return 120;
  if (level === "Level 6" || level === "Level 7") return 150;
  return 180;
}

function normalizeEventKey(event) {
  return String(event || "").toLowerCase()
    .replace("floor exercise", "floor")
    .replace("balance beam", "beam")
    .replace("uneven bars", "bars")
    .replace("still rings", "bars")
    .replace("parallel bars", "bars")
    .replace("high bar", "bars")
    .replace("pommel horse", "vault");
}

function buildProgramContext(level, cat, isComp, isXcel, isElite, splitMin) {
  if (isComp) {
    return `COMPULSORY ROUTINE (${level}): Every gymnast performs the identical prescribed choreography. Deduct for ANY deviation from required choreography, timing, or element order — in addition to execution faults.`;
  }
  if (isXcel) {
    return `XCEL ${level} ROUTINE: Athlete selects skills within Xcel program parameters. Verify all 4 Special Requirements are present (−0.50 each if missing). Split leap/jump minimum is ${splitMin}°.`;
  }
  if (isElite) {
    return `ELITE ROUTINE (FIG Code of Points): Judge execution from 10.0 E-score base. D-score computed separately from difficulty values. Apply FIG deduction standards strictly.`;
  }
  return `${level} OPTIONAL ROUTINE: Athlete selects their own skills. Split leap/jump minimum is ${splitMin}°. ${level === "Level 5" ? "Round-off BHS back tuck is required on floor." : ""}`;
}

function buildEventRulesBlock(event, level) {
  const eventRules = EVENT_JUDGING_RULES[event];
  if (!eventRules) return "";

  const parts = [];

  if (eventRules.strictnessBias > 1.0) {
    parts.push(`STRICTNESS DIRECTIVE (${event}): This apparatus requires STRICTER judging than floor. AI models under-deduct on ${event} by ~${((eventRules.strictnessBias - 1) * 100).toFixed(0)}%. When in doubt, ALWAYS take the deduction.`);
  }

  if (eventRules.perspectiveBias) {
    parts.push(`CAMERA PERSPECTIVE: ${eventRules.perspectiveBias}`);
  }

  if (event === "Uneven Bars" || event === "High Bar") {
    parts.push(`
PERSPECTIVE CALIBRATION FOR BARS:
Standard uneven bars dimensions: low bar 62" (157cm) high, high bar 98" (249cm) high.
Bar width: 6.5 feet (198cm) between uprights.
To calibrate for camera angle:
- If you can see BOTH bars clearly end-to-end, you have a usable side-on view.
- If the bars appear to converge or one bar is partially hidden, the camera is angled — all cast heights will be OVERESTIMATED by 10-20%. Reduce cast height readings accordingly.
- A cast to handstand (180°) from a 30° off-axis camera appears as ~155-160°. Do NOT give full credit.
- A cast to horizontal (90°) from off-axis appears as ~75-80°. Apply the appropriate deduction for the actual estimated angle.
- If the gymnast's feet are above the high bar at any point in a cast, that is verifiably a good cast regardless of angle.
- RULE: When camera angle is uncertain, always score the LOWER of two plausible cast heights.`);
  }

  if (eventRules.compoundRules?.length) {
    parts.push(`COMPOUND RULES:\n${eventRules.compoundRules.join("\n")}`);
  }

  if (eventRules.hiddenDeductions?.length) {
    parts.push(`COMMONLY MISSED DEDUCTIONS — check every skill:\n${eventRules.hiddenDeductions.join("\n")}`);
  }

  if (eventRules.rhythmJudging) {
    parts.push(`RHYTHM/FLOW: ${eventRules.rhythmJudging}`);
  }

  const eventSRs = eventRules.specialRequirements?.[level] || [];
  if (eventSRs.length) {
    parts.push(`SPECIAL REQUIREMENTS for ${level} ${event}:\n${eventSRs.map((sr, i) => `  ${i + 1}. ${sr}`).join("\n")}\nMissing any = -0.50 from Start Value.`);
  }

  // Skill counting guidance
  if (event === "Uneven Bars" || event === "High Bar") {
    parts.push(`SKILL COUNTING (${event}): Typical routine has 5-8 DISTINCT SKILLS. Casts are connecting elements, not separate skills — evaluate cast height as part of the following skill.`);
  } else if (event === "Floor Exercise") {
    parts.push(`SKILL COUNTING (Floor): Break tumbling passes into individual elements. RO + BHS + Back Tuck = THREE entries. Also identify leaps, jumps, turns, dance passages. Typical: 10-15 entries.`);
  } else if (event === "Balance Beam") {
    parts.push(`SKILL COUNTING (Beam): Each acro skill, dance element, turn, mount, and dismount is its own entry. Typical: 8-12 entries.`);
  } else if (event === "Vault") {
    parts.push(`SKILL COUNTING (Vault): ONE skill with multiple phases. Create 1 entry covering run, hurdle, board, pre-flight, table, post-flight, landing.`);
  }

  if (eventRules.typicalDeductionRange) {
    const dr = eventRules.typicalDeductionRange;
    parts.push(`DEDUCTION RANGE (${event}): Expected ${dr.min}–${dr.max} for ${level}. ${dr.note}`);
  }

  if (parts.length === 0) return "";
  return "\n═══ EVENT-SPECIFIC JUDGING RULES ═══\n" + parts.join("\n\n") + "\n═══ END ═══\n";
}

function getExpectedDeductionRange(event, level) {
  const eventRules = EVENT_JUDGING_RULES[event];
  const min = eventRules?.typicalDeductionRange?.min || 0.80;
  const max = eventRules?.typicalDeductionRange?.max || 1.50;
  return `${min}–${max}`;
}
