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

export const PROMPT_VERSION = "v9_natural";

// ─── Pass 1: Vision Pass ────────────────────────────────────────────────────

/**
 * Build the Pass 1 prompt — skill detection and deduction identification.
 * This pass receives the video. Gemini WATCHES and REPORTS. No score math.
 *
 * @param {Object} profile - { name, gender, level, levelCategory }
 * @param {string} event - Event name (e.g. "Floor Exercise") or "Auto-detect"
 * @returns {{ system: string, user: string }}
 */
export function buildPass1Prompt(profile, event, uploadData = null) {
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

  // ── Condensed event rules (top missed deductions only) ──
  const eventRules = !isAutoDetect ? EVENT_JUDGING_RULES[event] : null;
  const missedDeds = eventRules?.hiddenDeductions?.slice(0, 5).join("\n   - ") || "";
  const eventTips = missedDeds ? `\nCOMMONLY MISSED DEDUCTIONS on ${event}:\n   - ${missedDeds}` : "";

  // ── Strictness directive for under-deducted events ──
  const strictnessBias = eventRules?.strictnessBias || 1.0;
  const strictnessLine = strictnessBias > 1.0
    ? `\nSTRICTNESS OVERRIDE (${event}): AI models under-deduct on ${event} by ~${((strictnessBias - 1) * 100).toFixed(0)}%. When in doubt, ALWAYS take the deduction. Be PESSIMISTIC — look for reasons to deduct, not reasons to celebrate.`
    : "";

  // ── Perspective calibration for bars ──
  const perspectiveLine = eventRules?.perspectiveBias
    ? `\nCAMERA PERSPECTIVE: ${eventRules.perspectiveBias}`
    : "";

  // ── Compound rules for cascading deductions ──
  const compoundLines = eventRules?.compoundRules?.length
    ? `\nCOMPOUND RULES:\n${eventRules.compoundRules.join("\n")}`
    : "";

  const user = `Analyze this ${gender} ${level} ${isAutoDetect ? "gymnastics" : event} routine performed by ${athleteName}.
${autoDetectLine}
${programContext}
${requiredSkillsLine}
${benchLine}
${strictnessLine}
${perspectiveLine}

You are strictly forbidden from giving benefit of the doubt.
Evaluate using the ${level} Code of Points.
${compoundLines}

Watch the ENTIRE routine from start to finish. Then provide:

1. TIMESTAMPED SCORECARD — every skill in order:
   [MM:SS] | Skill Name | Deduction (0.00 if clean) | Reason

2. For EVERY skill — whether clean or not — note:
   - What the gymnast did WELL on this skill
   - What deduction was taken and exactly why
   - What "zero deduction" looks like for this skill

3. ARTISTRY & PRESENTATION (Global):
   - Finger/hand presentation
   - Eye contact and performance quality
   - Musicality and use of space
   - Energy and confidence
   - Artistry deductions typically total 0.15–0.40 for youth routines

4. SPLIT CHECK: ${level} requires ${splitMin}° minimum.
   Flag any leaps/jumps that fall short.
${eventTips}

5. TRUTH ANALYSIS:
   Why did this routine score what it scored?
   What is the single biggest "math win" — one fix that saves the most points?

6. TOP 3 IMPROVEMENTS ranked by point value saved.

7. CELEBRATIONS — top 3 things done exceptionally well.

START VALUE: 10.00
List every deduction. Sum them. Final Score = 10.00 - total deductions.

CALIBRATION: Total deductions for ${level} typically ${getExpectedDeductionRange(event, level)}.
Score range 8.60-9.20 for solid routines at State level.
A score above 9.30 means you missed deductions — re-check.
If total deductions < 0.80, you are MISSING deductions — re-watch for flexed feet, bent knees, landing steps, artistry gaps.

DEDUCTION VALUES: 0.00, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.50 ONLY.
${uploadData?.notes ? `Coach notes: "${uploadData.notes}"` : ""}`;

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
  // No responseMimeType — let Gemini return natural language for richer analysis
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
