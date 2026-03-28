/**
 * injuryDetection.js — Angle-based injury risk detection.
 *
 * Replaces text-matching injury detection with real biomechanics-derived signals.
 * Uses measured MediaPipe angles (from pipeline.js measureSkillBiomechanics)
 * to identify landing impact, knee valgus risk, back hyperextension,
 * wrist loading, and repetitive stress patterns.
 *
 * Each rule returns: { area, severity, signal, prehab, detail }
 *   - area: body region (knee, ankle, back, wrist, shoulder)
 *   - severity: "low" | "moderate" | "high"
 *   - signal: short human-readable label
 *   - prehab: actionable exercise recommendation
 *   - detail: explanation with measured angle data
 *
 * IMPORTANT: These are awareness signals, NOT medical diagnoses.
 */

// ── Thresholds (based on sports medicine literature for youth gymnastics) ────

const THRESHOLDS = {
  // Knee angle at landing: <120° = high impact, 120-140° = moderate
  LANDING_KNEE_HIGH: 120,
  LANDING_KNEE_MOD: 140,

  // Leg separation during landing: >25° suggests valgus tendency
  VALGUS_LEG_SEP_HIGH: 30,
  VALGUS_LEG_SEP_MOD: 20,

  // Hip angle >190° indicates hyperextension (backbend load)
  BACK_HYPER_HIGH: 195,
  BACK_HYPER_MOD: 185,

  // Shoulder angle during support skills: <90° = high wrist load
  WRIST_LOAD_SHOULDER_HIGH: 80,
  WRIST_LOAD_SHOULDER_MOD: 100,

  // Trunk lean: >30° from vertical during landing = high impact
  TRUNK_LEAN_HIGH: 35,
  TRUNK_LEAN_MOD: 25,

  // Repetitive stress: same area flagged N+ times across skills
  REPETITIVE_THRESHOLD: 3,
};

// ── Support skill detection (handstands, cartwheels, etc.) ──────────────────

const SUPPORT_SKILLS = /handstand|cartwheel|round.?off|back.?walkover|front.?walkover|press|cast|giant|kip|clear.*hip|stalder|pike.*stand/i;

// ── Individual injury rules ─────────────────────────────────────────────────

function checkLandingImpact(skill, bio) {
  const signals = [];
  const kneeAngle = bio.worstKneeAngle;
  const trunkLean = bio.maxTrunkLean;

  if (kneeAngle != null && kneeAngle < THRESHOLDS.LANDING_KNEE_HIGH) {
    signals.push({
      area: "knee",
      severity: "high",
      signal: "High impact landing",
      prehab: "Box drop landings with focus on deep knee bend absorption. 3x8 before dismount practice.",
      detail: `Knee angle ${kneeAngle}° at lowest point (ideal: >${THRESHOLDS.LANDING_KNEE_MOD}°). Deep flexion increases joint stress.`,
    });
  } else if (kneeAngle != null && kneeAngle < THRESHOLDS.LANDING_KNEE_MOD) {
    signals.push({
      area: "knee",
      severity: "moderate",
      signal: "Moderate landing impact",
      prehab: "Single-leg balance holds (30s each) + controlled squat landings from low height.",
      detail: `Knee angle ${kneeAngle}° — consider strengthening landing mechanics.`,
    });
  }

  if (trunkLean != null && trunkLean > THRESHOLDS.TRUNK_LEAN_HIGH) {
    signals.push({
      area: "ankle",
      severity: "high",
      signal: "Off-balance landing",
      prehab: "BOSU ball balance drills + ankle stabilization exercises before tumbling.",
      detail: `Trunk lean ${trunkLean}° from vertical at landing (ideal: <${THRESHOLDS.TRUNK_LEAN_MOD}°). Increases ankle strain.`,
    });
  } else if (trunkLean != null && trunkLean > THRESHOLDS.TRUNK_LEAN_MOD) {
    signals.push({
      area: "ankle",
      severity: "moderate",
      signal: "Landing alignment",
      prehab: "Theraband 3-way ankle strengthening x20 before floor and beam.",
      detail: `Trunk lean ${trunkLean}° — moderate off-center landing force.`,
    });
  }

  return signals;
}

function checkKneeValgus(skill, bio) {
  const legSep = bio.maxLegSeparation;
  if (legSep == null) return [];

  if (legSep > THRESHOLDS.VALGUS_LEG_SEP_HIGH) {
    return [{
      area: "knee",
      severity: "high",
      signal: "Knee alignment concern",
      prehab: "Clamshell exercises 3x15 + monster walks with band. Focus on knee-over-toe alignment.",
      detail: `Leg separation ${legSep}° during skill (threshold: <${THRESHOLDS.VALGUS_LEG_SEP_MOD}°). May indicate valgus tendency.`,
    }];
  }
  if (legSep > THRESHOLDS.VALGUS_LEG_SEP_MOD) {
    return [{
      area: "knee",
      severity: "moderate",
      signal: "Leg alignment note",
      prehab: "Single-leg squats focusing on knee tracking over toes. 2x10 each side.",
      detail: `Leg separation ${legSep}° — monitor knee alignment during landings.`,
    }];
  }
  return [];
}

function checkBackHyperextension(skill, bio) {
  const hipAngle = bio.worstHipAngle != null ? bio.worstHipAngle : bio.avgHipAngle;
  if (hipAngle == null) return [];

  // Hip angle >185° means the body is arched past neutral — back extension load
  if (hipAngle > THRESHOLDS.BACK_HYPER_HIGH) {
    return [{
      area: "back",
      severity: "high",
      signal: "Back extension load",
      prehab: "Core activation sequence (dead bugs 3x10 + bird dogs 3x10) before backbend elements.",
      detail: `Hip angle ${hipAngle}° indicates significant back extension (neutral: ~180°). Core bracing critical.`,
    }];
  }
  if (hipAngle > THRESHOLDS.BACK_HYPER_MOD) {
    return [{
      area: "back",
      severity: "moderate",
      signal: "Back extension note",
      prehab: "Plank holds 3x30s + hollow body holds before back tumbling.",
      detail: `Hip angle ${hipAngle}° — moderate back extension load.`,
    }];
  }
  return [];
}

function checkWristLoad(skill, bio) {
  const skillName = skill.skill_name || skill.skill || "";
  if (!SUPPORT_SKILLS.test(skillName)) return [];

  const shoulderAngle = bio.avgShoulderAngle;
  if (shoulderAngle == null) return [];

  if (shoulderAngle < THRESHOLDS.WRIST_LOAD_SHOULDER_HIGH) {
    return [{
      area: "wrist",
      severity: "high",
      signal: "Wrist loading — support skill",
      prehab: "Wrist circles x20 each direction + rice bucket exercises before bars/floor.",
      detail: `Shoulder angle ${shoulderAngle}° during ${skillName} — significant wrist weight-bearing.`,
    }];
  }
  if (shoulderAngle < THRESHOLDS.WRIST_LOAD_SHOULDER_MOD) {
    return [{
      area: "wrist",
      severity: "moderate",
      signal: "Wrist load noted",
      prehab: "Wrist warm-up circles and stretches before weight-bearing skills.",
      detail: `Shoulder angle ${shoulderAngle}° — moderate wrist loading during support.`,
    }];
  }
  return [];
}

// ── Repetitive stress detection (cross-skill pattern) ───────────────────────

function checkRepetitiveStress(allSignals) {
  const areaCounts = {};
  for (const signal of allSignals) {
    areaCounts[signal.area] = (areaCounts[signal.area] || 0) + 1;
  }

  const repetitive = [];
  for (const [area, count] of Object.entries(areaCounts)) {
    if (count >= THRESHOLDS.REPETITIVE_THRESHOLD) {
      repetitive.push({
        area,
        severity: "high",
        signal: `Repetitive ${area} stress pattern`,
        prehab: `${area.charAt(0).toUpperCase() + area.slice(1)} flagged in ${count} skills — prioritize ${area} warm-up and consider reducing volume.`,
        detail: `${area} stress detected across ${count} different skills in this routine. Cumulative load may increase injury risk.`,
      });
    }
  }
  return repetitive;
}

// ── Main entry point ────────────────────────────────────────────────────────

/**
 * Run angle-based injury detection on measured biomechanics data.
 *
 * @param {Array} deductionLog - Skills from scorecard (for skill names)
 * @param {Array} measuredBiomechanics - Per-skill measured angles (from measureSkillBiomechanics)
 * @returns {Object} { per_skill: Array<Array>, routine_level: Array, summary: Object }
 */
export function detectInjurySignals(deductionLog, measuredBiomechanics) {
  if (!deductionLog || !measuredBiomechanics) {
    return { per_skill: [], routine_level: [], summary: { total_signals: 0, areas: {} } };
  }

  const perSkill = [];
  const allSignals = [];

  for (let i = 0; i < deductionLog.length; i++) {
    const skill = deductionLog[i];
    const bio = measuredBiomechanics[i];

    if (!bio) {
      perSkill.push([]);
      continue;
    }

    const signals = [
      ...checkLandingImpact(skill, bio),
      ...checkKneeValgus(skill, bio),
      ...checkBackHyperextension(skill, bio),
      ...checkWristLoad(skill, bio),
    ];

    perSkill.push(signals);
    allSignals.push(...signals);
  }

  // Cross-skill repetitive stress
  const repetitive = checkRepetitiveStress(allSignals);

  // Summary
  const areaSummary = {};
  for (const s of [...allSignals, ...repetitive]) {
    if (!areaSummary[s.area]) {
      areaSummary[s.area] = { count: 0, max_severity: "low" };
    }
    areaSummary[s.area].count++;
    if (s.severity === "high" || (s.severity === "moderate" && areaSummary[s.area].max_severity === "low")) {
      areaSummary[s.area].max_severity = s.severity;
    }
  }

  return {
    per_skill: perSkill,
    routine_level: repetitive,
    summary: {
      total_signals: allSignals.length + repetitive.length,
      areas: areaSummary,
    },
  };
}

export { THRESHOLDS };
