/**
 * elementDictionary.js
 * ─────────────────────────────────────────────────────────────────
 * Complete STRIVE gymnastics knowledge base.
 *
 * Covers:
 *   Women JO: Levels 1–10, Elite
 *   Women Xcel: Bronze, Silver, Gold, Platinum, Diamond, Sapphire
 *   Men JO: Levels 1–10, Elite (floor, vault, pommel, rings, pbars, hbar)
 *
 * Each element defines:
 *   • Which levels it appears at
 *   • Ideal joint angles at each phase
 *   • Exact deduction rules keyed to USA Gymnastics / FIG code of points
 *   • A natural-language description for Gemini classification
 *
 * Level-specific angle thresholds:
 *   Split angle requirements differ by level:
 *     Levels 1–4 / Xcel Bronze–Silver : ≥ 90° acceptable
 *     Level 5 / Xcel Gold             : ≥ 120° required
 *     Level 6–7 / Xcel Platinum       : ≥ 150° required
 *     Level 8+ / Xcel Diamond+        : ≥ 180° required (full split)
 */

// ─── SEVERITY HELPERS ─────────────────────────────────────────────────────────

export const SEVERITY = {
  SMALL:      { label: 'small',     range: '0.05–0.10', color: '#22C55E' },
  MEDIUM:     { label: 'medium',    range: '0.10–0.15', color: '#F59E0B' },
  LARGE:      { label: 'large',     range: '0.20–0.30', color: '#F97316' },
  VERY_LARGE: { label: 'veryLarge', range: '0.30–0.50', color: '#EF4444' },
  FALL:       { label: 'fall',      range: '0.50',      color: '#DC2626' },
};

export function sev(angleDiff) {
  if (angleDiff <= 0)   return null;
  if (angleDiff <= 10)  return { amount: 0.05, ...SEVERITY.SMALL };
  if (angleDiff <= 20)  return { amount: 0.10, ...SEVERITY.MEDIUM };
  if (angleDiff <= 35)  return { amount: 0.20, ...SEVERITY.LARGE };
  return                       { amount: 0.30, ...SEVERITY.VERY_LARGE };
}

// Split angle requirement by level
export function splitAngleRequired(level) {
  const lvl = (level || '').toLowerCase();
  if (lvl.includes('bronze') || lvl.includes('silver') ||
      lvl === 'level 1' || lvl === 'level 2' || lvl === 'level 3' || lvl === 'level 4') return 90;
  if (lvl === 'level 5' || lvl.includes('gold')) return 120;
  if (lvl === 'level 6' || lvl === 'level 7' || lvl.includes('platinum')) return 150;
  return 180; // Level 8+, Diamond, Sapphire, Elite
}

// ─── LEVEL-SPECIFIC REQUIREMENTS ─────────────────────────────────────────────

export const LEVEL_REQUIREMENTS = {
  'Level 1': {
    floor: { requiredSkills: ['forward_roll', 'backward_roll', 'cartwheel'], missingSkillDeduction: 0.50 },
    beam:  { requiredSkills: ['releve_walk', 'stretch_jump'], missingSkillDeduction: 0.50 },
    bars:  { requiredSkills: ['pullover', 'back_hip_circle'], missingSkillDeduction: 0.50 },
    notes: 'Compulsory — judges compare to prescribed routine exactly.',
  },
  'Level 2': {
    floor: { requiredSkills: ['handstand', 'bridge', 'round_off'], missingSkillDeduction: 0.50 },
    beam:  { requiredSkills: ['arabesque', 'cartwheel'], missingSkillDeduction: 0.50 },
    notes: 'Compulsory — handstand flat-back vault introduced.',
  },
  'Level 3': {
    floor: { requiredSkills: ['handstand_forward_roll', 'round_off', 'leap'], missingSkillDeduction: 0.50 },
    notes: 'Compulsory — first level with a required leap element.',
  },
  'Level 4': {
    floor: { requiredSkills: ['round_off', 'back_handspring', 'front_limber', 'full_turn'], missingSkillDeduction: 0.50 },
    beam:  { requiredSkills: ['cartwheel', 'full_turn', 'split_jump', 'straight_jump_dismount'], missingSkillDeduction: 0.50 },
    notes: 'Compulsory — round-off back handspring series required. Kip attempt on bars.',
  },
  'Level 5': {
    floor: { requiredSkills: ['round_off', 'back_handspring', 'back_tuck', 'front_handspring', 'straddle_jump', 'full_turn'], missingSkillDeduction: 0.50 },
    beam:  { requiredSkills: ['back_walkover', 'leap', 'full_turn', 'dismount'], minLeapAngle: 120, missingSkillDeduction: 0.50 },
    notes: 'Compulsory — BHS + back tuck series required. Kip required on bars. Split leap ≥120°.',
  },
  'Level 6': {
    floor: { minLeapAngle: 150, requiredB: 1, notes: 'B acro + B dance elements required. Split leap ≥150°.' },
    beam:  { minLeapAngle: 150, requiredB: 1 },
    notes: 'Optional begins. B-value skills now required. Split leap ≥150°.',
  },
  'Level 7': {
    floor: { minLeapAngle: 150, requiredB: 2, notes: 'Two tumbling passes, split leap ≥150°, 1.5 turn.' },
    beam:  { minLeapAngle: 150, requiredSeries: true },
    notes: 'Cast to handstand on bars. Acro series on beam required.',
  },
  'Level 8': {
    floor: { minLeapAngle: 180, requiredC: 1, notes: 'C tumbling required. 180° dance elements.' },
    beam:  { minLeapAngle: 180, requiredC: 1 },
    notes: 'Yurchenko/Tsukahara vault. C skills throughout. 180° full split required.',
  },
  'Level 9': {
    floor: { minLeapAngle: 180, requiredD: 1 },
    beam:  { minLeapAngle: 180, requiredC: 1 },
    notes: 'D-value tumbling pass required. High-difficulty connections rewarded.',
  },
  'Level 10': {
    floor: { minLeapAngle: 180, requiredD: 1, notes: 'D+ tumbling, E connections, 3 saltos minimum.' },
    notes: 'Highest JO level. Near-elite skill set.',
  },
  'Elite': {
    notes: 'FIG code of points. D-score + E-score. All deductions per FIG COP.',
    scoringSystem: 'FIG',
  },
  'Xcel Bronze': {
    floor: { requiredSkills: ['forward_roll', 'cartwheel', 'bridge'], minLeapAngle: 90, missingSkillDeduction: 0.50 },
    notes: 'Entry-level Xcel. Basic acro and dance. Split angle minimum 90°.',
  },
  'Xcel Silver': {
    floor: { requiredSkills: ['round_off', 'handstand', 'leap'], minLeapAngle: 90, missingSkillDeduction: 0.50 },
    notes: 'Xcel Silver. Round-off introduced. Split angle minimum 90°.',
  },
  'Xcel Gold': {
    floor: { minLeapAngle: 120, requiredB: 1 },
    notes: 'B acro required. Split angle minimum 120°.',
  },
  'Xcel Platinum': {
    floor: { minLeapAngle: 150, requiredB: 2 },
    notes: 'Two B passes. Split angle minimum 150°. Near Level 6–7.',
  },
  'Xcel Diamond': {
    floor: { minLeapAngle: 180, requiredC: 1 },
    notes: 'C skills required. Full 180° split. Near Level 8.',
  },
  'Xcel Sapphire': {
    floor: { minLeapAngle: 180, requiredD: 1 },
    notes: 'D skills required. Near Level 9–10.',
  },
};

// ─── ELEMENT DICTIONARY ───────────────────────────────────────────────────────

export const ELEMENTS = {

  // ══════════════════════════════════════════════════════════════════
  // BASIC SKILLS — Levels 1–3, Xcel Bronze–Silver
  // ══════════════════════════════════════════════════════════════════

  forward_roll: {
    id: 'forward_roll', name: 'Forward Roll',
    aliases: ['fwd roll', 'front roll'],
    events: ['floor', 'beam'],
    levels: ['Level 1', 'Level 2', 'Level 3', 'Xcel Bronze', 'Xcel Silver'],
    difficulty: 0.0,
    geminiDescription: `A forward roll: gymnast crouches, places hands on floor, tucks chin, rolls forward along their spine and returns to standing. Common at beginner levels.`,
    deductionRules: {
      bentKnees: { fault: 'Bent knees during roll-out', measure: 'kneeAngle', phase: 'peak', idealAngle: 145, calc: (m) => sev(Math.max(0, 145 - m)), detail: (m) => `Knee angle: ${Math.round(m)}°` },
      headNotTucked: { fault: 'Head not tucked (chin not to chest)', measure: 'shoulderAngle', phase: 'peak', idealAngle: 60, calc: (m) => m > 90 ? { amount: 0.10, ...SEVERITY.MEDIUM } : null, detail: () => 'Head position open during roll' },
    },
  },

  backward_roll: {
    id: 'backward_roll', name: 'Backward Roll',
    aliases: ['back roll', 'bwd roll'],
    events: ['floor'],
    levels: ['Level 1', 'Level 2', 'Level 3', 'Xcel Bronze'],
    difficulty: 0.0,
    geminiDescription: `A backward roll: gymnast sits, rolls backward along spine, pushes with hands as head passes, and returns to standing.`,
    deductionRules: {
      bentKnees: { fault: 'Bent knees', measure: 'kneeAngle', phase: 'peak', idealAngle: 140, calc: (m) => sev(Math.max(0, 140 - m)), detail: (m) => `Knee angle: ${Math.round(m)}°` },
    },
  },

  bridge: {
    id: 'bridge', name: 'Bridge / Back Bend',
    aliases: ['backbend', 'back bend', 'wheel'],
    events: ['floor'],
    levels: ['Level 1', 'Level 2', 'Level 3', 'Xcel Bronze', 'Xcel Silver'],
    difficulty: 0.0,
    geminiDescription: `A bridge: gymnast arches back with hands and feet on the floor, body in an inverted arch. Arms and legs should be straight.`,
    deductionRules: {
      bentArms: { fault: 'Bent arms', measure: 'elbowAngle', phase: 'peak', idealAngle: 170, calc: (m) => sev(Math.max(0, 170 - m)), detail: (m) => `Elbow angle: ${Math.round(m)}°` },
      bentKnees: { fault: 'Bent knees', measure: 'kneeAngle', phase: 'peak', idealAngle: 160, calc: (m) => sev(Math.max(0, 160 - m)), detail: (m) => `Knee angle: ${Math.round(m)}°` },
    },
  },

  handstand: {
    id: 'handstand', name: 'Handstand',
    aliases: ['hand stand', 'hs'],
    events: ['floor', 'beam', 'bars'],
    levels: ['Level 2', 'Level 3', 'Level 4', 'Level 5', 'Level 6', 'Level 7', 'Level 8', 'Level 9', 'Level 10', 'Elite', 'Xcel Silver', 'Xcel Gold', 'Xcel Platinum', 'Xcel Diamond', 'Xcel Sapphire'],
    difficulty: 0.0,
    geminiDescription: `A handstand: gymnast supports body weight on two hands, fully inverted. Arms straight, legs together, toes pointed, body in a straight line from wrists to toes.`,
    poseSignature: { peak_phase: { wristAboveHip: true, hipAngle: { ideal: 180, minAcceptable: 170 }, kneeAngle: { ideal: 180, minAcceptable: 170 } } },
    deductionRules: {
      bentArms:  { fault: 'Bent arms', measure: 'elbowAngle', phase: 'peak', idealAngle: 175, calc: (m) => sev(Math.max(0, 175 - m)), detail: (m) => `Elbow angle: ${Math.round(m)}°` },
      bentKnees: { fault: 'Bent knees', measure: 'kneeAngle', phase: 'peak', idealAngle: 175, calc: (m) => sev(Math.max(0, 175 - m)), detail: (m) => `Knee angle: ${Math.round(m)}°` },
      pikedBody: { fault: 'Pike in handstand', measure: 'hipAngle', phase: 'peak', idealAngle: 175, calc: (m) => sev(Math.max(0, 175 - m)), detail: (m) => `Hip angle: ${Math.round(m)}°` },
    },
  },

  cartwheel: {
    id: 'cartwheel', name: 'Cartwheel',
    aliases: ['cart wheel'],
    events: ['floor', 'beam'],
    levels: ['Level 1', 'Level 2', 'Level 3', 'Level 4', 'Xcel Bronze', 'Xcel Silver', 'Xcel Gold'],
    difficulty: 0.0,
    geminiDescription: `A cartwheel: gymnast moves sideways, placing hands one at a time, passing through a straddle handstand, stepping out one foot at a time.`,
    deductionRules: {
      bentKnees:     { fault: 'Bent knees', measure: 'worstKneeAngle', phase: 'flight', idealAngle: 165, calc: (m) => sev(Math.max(0, 165 - m)), detail: (m) => `Worst knee angle: ${Math.round(m)}°` },
      bentArms:      { fault: 'Bent arms', measure: 'elbowAngle', phase: 'peak', idealAngle: 165, calc: (m) => sev(Math.max(0, 165 - m)), detail: (m) => `Elbow angle: ${Math.round(m)}°` },
      bodyAlignment: { fault: 'Body not vertical at handstand', measure: 'bodyLineDev', phase: 'peak', threshold: 0.08, calc: (m) => m > 0.12 ? { amount: 0.10, ...SEVERITY.MEDIUM } : { amount: 0.05, ...SEVERITY.SMALL }, detail: () => 'Hips not stacked over hands' },
    },
  },

  // ══════════════════════════════════════════════════════════════════
  // ACRO BASICS — Levels 2–6, Xcel Silver–Gold
  // ══════════════════════════════════════════════════════════════════

  round_off: {
    id: 'round_off', name: 'Round-Off',
    aliases: ['round off', 'roundoff', 'ro'],
    events: ['floor', 'beam'],
    levels: ['Level 2', 'Level 3', 'Level 4', 'Level 5', 'Level 6', 'Level 7', 'Level 8', 'Level 9', 'Level 10', 'Elite', 'Xcel Silver', 'Xcel Gold', 'Xcel Platinum', 'Xcel Diamond', 'Xcel Sapphire'],
    difficulty: 0.0,
    geminiDescription: `A round-off: gymnast runs, hurdles, places both hands simultaneously, rotates 180° through a handstand, snaps legs down landing on two feet facing the direction of origin. Often used as a connection to a back tumbling skill.`,
    deductionRules: {
      bentKnees:    { fault: 'Bent knees during round-off', measure: 'worstKneeAngle', phase: 'flight', idealAngle: 175, calc: (m) => sev(Math.max(0, 175 - m)), detail: (m) => `Worst knee angle: ${Math.round(m)}°` },
      pikedBody:    { fault: 'Pike in body position', measure: 'hipAngle', phase: 'peak', idealAngle: 175, calc: (m) => sev(Math.max(0, 175 - m)), detail: (m) => `Hip angle at push-off: ${Math.round(m)}°` },
      legSeparation:{ fault: 'Leg separation', measure: 'legSep', phase: 'peak', threshold: 0.05, calc: (m) => m > 0.12 ? { amount: 0.20, ...SEVERITY.LARGE } : { amount: 0.10, ...SEVERITY.MEDIUM }, detail: () => 'Legs apart during flight phase' },
    },
  },

  front_limber: {
    id: 'front_limber', name: 'Front Limber',
    aliases: ['limber', 'front limber'],
    events: ['floor'],
    levels: ['Level 4', 'Level 5', 'Xcel Gold'],
    difficulty: 0.0,
    geminiDescription: `A front limber: gymnast kicks up to handstand, arches over through a bridge position, and stands. Arms stay straight throughout.`,
    deductionRules: {
      bentArms:  { fault: 'Bent arms', measure: 'elbowAngle', phase: 'peak', idealAngle: 170, calc: (m) => sev(Math.max(0, 170 - m)), detail: (m) => `Elbow angle: ${Math.round(m)}°` },
      bentKnees: { fault: 'Bent knees', measure: 'worstKneeAngle', phase: 'flight', idealAngle: 165, calc: (m) => sev(Math.max(0, 165 - m)), detail: (m) => `Worst knee angle: ${Math.round(m)}°` },
    },
  },

  // ══════════════════════════════════════════════════════════════════
  // WALKOVERS — Levels 3–7, Xcel Gold–Platinum
  // ══════════════════════════════════════════════════════════════════

  back_walkover: {
    id: 'back_walkover', name: 'Back Walkover',
    aliases: ['back walk over', 'walkover back', 'bwo'],
    events: ['floor', 'beam'],
    levels: ['Level 3', 'Level 4', 'Level 5', 'Level 6', 'Level 7', 'Xcel Silver', 'Xcel Gold', 'Xcel Platinum'],
    difficulty: 0.0,
    geminiDescription: `A back walkover: gymnast arches backward from standing, places hands on floor, kicks one leg over then the other through a split handstand, steps out. Body passes through full arch and split position.`,
    poseSignature: { handstand_phase: { hipAngle: { ideal: 180, minAcceptable: 155 }, splitAtPeak: true } },
    deductionRules: {
      insufficientArch: { fault: 'Insufficient arch / flexibility', measure: 'hipAngle', phase: 'peak', idealAngle: 175, calc: (m) => sev(Math.max(0, 175 - m)), detail: (m) => `Hip angle at handstand: ${Math.round(m)}° (ideal ≥175°)` },
      bentKnees:        { fault: 'Bent knees / legs', measure: 'worstKneeAngle', phase: 'flight', idealAngle: 165, calc: (m) => sev(Math.max(0, 165 - m)), detail: (m) => `Worst knee angle: ${Math.round(m)}°` },
      bentArms:         { fault: 'Bent arms on floor contact', measure: 'elbowAngle', phase: 'peak', idealAngle: 170, calc: (m) => sev(Math.max(0, 170 - m)), detail: (m) => `Elbow angle: ${Math.round(m)}°` },
    },
  },

  front_walkover: {
    id: 'front_walkover', name: 'Front Walkover',
    aliases: ['front walk over', 'fwo', 'walkover forward'],
    events: ['floor', 'beam'],
    levels: ['Level 3', 'Level 4', 'Level 5', 'Xcel Silver', 'Xcel Gold'],
    difficulty: 0.0,
    geminiDescription: `A front walkover: gymnast kicks one leg up and over, places hands on floor, passes through an arched split handstand, steps out to stand facing forward.`,
    deductionRules: {
      bentKnees:        { fault: 'Bent knees', measure: 'worstKneeAngle', phase: 'flight', idealAngle: 165, calc: (m) => sev(Math.max(0, 165 - m)), detail: (m) => `Worst knee angle: ${Math.round(m)}°` },
      insufficientArch: { fault: 'Insufficient arch', measure: 'hipAngle', phase: 'peak', idealAngle: 170, calc: (m) => sev(Math.max(0, 170 - m)), detail: (m) => `Hip angle: ${Math.round(m)}°` },
      bentArms:         { fault: 'Bent arms', measure: 'elbowAngle', phase: 'peak', idealAngle: 165, calc: (m) => sev(Math.max(0, 165 - m)), detail: (m) => `Elbow angle: ${Math.round(m)}°` },
    },
  },

  // ══════════════════════════════════════════════════════════════════
  // BACK HANDSPRING FAMILY — Levels 4–10, Elite, Xcel Gold+
  // ══════════════════════════════════════════════════════════════════

  back_handspring: {
    id: 'back_handspring', name: 'Back Handspring',
    aliases: ['back hand spring', 'bhs', 'flic flac', 'flip flop', 'back spring'],
    events: ['floor', 'beam'],
    levels: ['Level 4', 'Level 5', 'Level 6', 'Level 7', 'Level 8', 'Level 9', 'Level 10', 'Elite', 'Xcel Gold', 'Xcel Platinum', 'Xcel Diamond', 'Xcel Sapphire'],
    difficulty: 0.0,
    geminiDescription: `A back handspring: gymnast jumps backward from two feet, arches through a near-handstand position with arms overhead, and snaps down to land on two feet. Arms must be straight. Often performed in series.`,
    poseSignature: { handstand_phase: { hipAngle: { ideal: 180, minAcceptable: 160 }, kneeAngle: { ideal: 180, minAcceptable: 165 }, wristAboveHip: true } },
    deductionRules: {
      bentArms:         { fault: 'Bent arms in handstand phase', measure: 'elbowAngle', phase: 'peak', idealAngle: 175, calc: (m) => sev(Math.max(0, 175 - m)), detail: (m) => `Elbow angle at handstand: ${Math.round(m)}°` },
      bentKnees:        { fault: 'Bent knees / legs', measure: 'worstKneeAngle', phase: 'flight', idealAngle: 170, calc: (m) => sev(Math.max(0, 170 - m)), detail: (m) => `Worst knee angle in flight: ${Math.round(m)}°` },
      insufficientArch: { fault: 'Insufficient arch / body not reaching handstand', measure: 'hipAngle', phase: 'peak', idealAngle: 170, calc: (m) => m < 150 ? { amount: 0.20, ...SEVERITY.LARGE } : { amount: 0.10, ...SEVERITY.MEDIUM }, detail: (m) => `Hip angle at peak: ${Math.round(m)}°` },
      legSeparation:    { fault: 'Leg separation', measure: 'legSep', phase: 'peak', threshold: 0.05, calc: (m) => m > 0.12 ? { amount: 0.20, ...SEVERITY.LARGE } : { amount: 0.10, ...SEVERITY.MEDIUM }, detail: () => 'Legs visible apart in handstand phase' },
    },
  },

  // ══════════════════════════════════════════════════════════════════
  // AERIALS — Levels 7–10, Elite, Xcel Diamond+
  // ══════════════════════════════════════════════════════════════════

  front_aerial: {
    id: 'front_aerial', name: 'Front Aerial',
    aliases: ['aerial cartwheel', 'aerial', 'no-hands cartwheel', 'aerial walkover'],
    events: ['floor', 'beam'],
    levels: ['Level 7', 'Level 8', 'Level 9', 'Level 10', 'Elite', 'Xcel Diamond', 'Xcel Sapphire'],
    difficulty: 0.3,
    geminiDescription: `A front aerial (aerial cartwheel): gymnast performs a cartwheel without hands touching the floor. Rotates sideways airborne through a straddle position. No hand contact with floor at any point.`,
    deductionRules: {
      bentKnees:          { fault: 'Bent knees', measure: 'worstKneeAngle', phase: 'flight', idealAngle: 165, calc: (m) => sev(Math.max(0, 165 - m)), detail: (m) => `Worst knee angle: ${Math.round(m)}°` },
      insufficientHeight: { fault: 'Insufficient height / amplitude', measure: 'hipY_peak', phase: 'peak', threshold: 0.4, calc: (m) => m > 0.5 ? { amount: 0.20, ...SEVERITY.LARGE } : { amount: 0.10, ...SEVERITY.MEDIUM }, detail: () => 'Insufficient height in aerial' },
    },
  },

  // ══════════════════════════════════════════════════════════════════
  // SALTOS (TUMBLING) — Levels 5–10, Elite, Xcel Gold+
  // ══════════════════════════════════════════════════════════════════

  back_tuck: {
    id: 'back_tuck', name: 'Back Tuck',
    aliases: ['back salto', 'back flip', 'back somersault tucked', 'salto backward tucked', 'back somi'],
    events: ['floor', 'beam'],
    levels: ['Level 5', 'Level 6', 'Level 7', 'Level 8', 'Level 9', 'Level 10', 'Elite', 'Xcel Gold', 'Xcel Platinum', 'Xcel Diamond', 'Xcel Sapphire'],
    difficulty: 0.2,
    geminiDescription: `A back tuck (salto backward tucked): gymnast jumps from two feet rotating backward with knees pulled tightly to chest (tucked), completes a full 360° rotation, lands on two feet. Arms wrap around knees at peak.`,
    poseSignature: { peak_phase: { kneeAngle: { ideal: 60, maxAcceptable: 90 }, hipAngle: { ideal: 70, maxAcceptable: 100 } } },
    deductionRules: {
      openTuck: {
        fault: 'Open / loose tuck position', measure: 'kneeAngle', phase: 'peak',
        calc: (m) => m > 110 ? { amount: 0.20, ...SEVERITY.LARGE } : m > 85 ? { amount: 0.10, ...SEVERITY.MEDIUM } : { amount: 0.05, ...SEVERITY.SMALL },
        detail: (m) => `Knee angle at peak: ${Math.round(m)}° (ideal ≤80° for tight tuck)`,
      },
      insufficientHeight: { fault: 'Insufficient height / amplitude', measure: 'hipY_peak', phase: 'peak', threshold: 0.35, calc: (m) => m > 0.45 ? { amount: 0.20, ...SEVERITY.LARGE } : { amount: 0.10, ...SEVERITY.MEDIUM }, detail: () => 'Insufficient height at peak of salto' },
    },
  },

  back_pike: {
    id: 'back_pike', name: 'Back Pike',
    aliases: ['salto backward piked', 'back salto piked', 'pike back'],
    events: ['floor'],
    levels: ['Level 8', 'Level 9', 'Level 10', 'Elite', 'Xcel Diamond', 'Xcel Sapphire'],
    difficulty: 0.3,
    geminiDescription: `A back pike salto: gymnast jumps backward rotating with hips piked (legs straight, body folded at hips ~90°), reaching toward toes at peak, landing on two feet.`,
    poseSignature: { peak_phase: { hipAngle: { ideal: 80, maxAcceptable: 110 }, kneeAngle: { ideal: 175, minAcceptable: 165 } } },
    deductionRules: {
      bentKnees: { fault: 'Bent knees in pike', measure: 'kneeAngle', phase: 'peak', idealAngle: 175, calc: (m) => sev(Math.max(0, 175 - m)), detail: (m) => `Knee angle: ${Math.round(m)}°` },
      openPike:  { fault: 'Insufficient hip angle / open pike', measure: 'hipAngle', phase: 'peak', calc: (m) => m > 120 ? { amount: 0.20, ...SEVERITY.LARGE } : m > 100 ? { amount: 0.10, ...SEVERITY.MEDIUM } : null, detail: (m) => `Hip angle: ${Math.round(m)}° (ideal ≤90° for tight pike)` },
    },
  },

  back_layout: {
    id: 'back_layout', name: 'Back Layout',
    aliases: ['layout', 'back salto stretched', 'salto backward stretched', 'layout back', 'back full', 'layout full'],
    events: ['floor', 'beam'],
    levels: ['Level 7', 'Level 8', 'Level 9', 'Level 10', 'Elite', 'Xcel Platinum', 'Xcel Diamond', 'Xcel Sapphire'],
    difficulty: 0.3,
    geminiDescription: `A back layout (salto backward stretched): gymnast jumps from two feet rotating backward with body completely straight — legs together, toes pointed, body in a straight line at peak. May include a full twist (layout full).`,
    poseSignature: { peak_phase: { hipAngle: { ideal: 180, minAcceptable: 165 }, kneeAngle: { ideal: 180, minAcceptable: 165 } } },
    deductionRules: {
      pikedLayout:   { fault: 'Pike / arch in layout position', measure: 'hipAngle', phase: 'peak', idealAngle: 175, calc: (m) => sev(Math.max(0, 175 - m)), detail: (m) => `Hip angle: ${Math.round(m)}° (ideal ≥175°)` },
      bentKnees:     { fault: 'Bent knees / legs', measure: 'worstKneeAngle', phase: 'flight', idealAngle: 170, calc: (m) => sev(Math.max(0, 170 - m)), detail: (m) => `Worst knee angle: ${Math.round(m)}°` },
      legSeparation: { fault: 'Leg separation', measure: 'legSep', phase: 'peak', threshold: 0.04, calc: (m) => m > 0.10 ? { amount: 0.20, ...SEVERITY.LARGE } : { amount: 0.10, ...SEVERITY.MEDIUM }, detail: () => 'Legs visible apart in layout' },
    },
  },

  front_tuck: {
    id: 'front_tuck', name: 'Front Tuck',
    aliases: ['front salto', 'front flip', 'front somi', 'salto forward tucked'],
    events: ['floor'],
    levels: ['Level 7', 'Level 8', 'Level 9', 'Level 10', 'Elite', 'Xcel Diamond', 'Xcel Sapphire'],
    difficulty: 0.2,
    geminiDescription: `A front tuck (salto forward tucked): gymnast runs, hurdles, jumps forward rotating with knees pulled tightly to chest, completes a full 360° forward rotation, lands on two feet.`,
    poseSignature: { peak_phase: { kneeAngle: { ideal: 60, maxAcceptable: 90 } } },
    deductionRules: {
      openTuck: { fault: 'Open / loose tuck position', measure: 'kneeAngle', phase: 'peak', calc: (m) => m > 110 ? { amount: 0.20, ...SEVERITY.LARGE } : m > 85 ? { amount: 0.10, ...SEVERITY.MEDIUM } : { amount: 0.05, ...SEVERITY.SMALL }, detail: (m) => `Knee angle: ${Math.round(m)}° (ideal ≤80°)` },
      bentArmsEntry: { fault: 'Bent arms on entry / hurdle', measure: 'elbowAngle', phase: 'takeoff', idealAngle: 165, calc: (m) => sev(Math.max(0, 165 - m)), detail: (m) => `Elbow angle at hurdle: ${Math.round(m)}°` },
    },
  },

  front_handspring: {
    id: 'front_handspring', name: 'Front Handspring',
    aliases: ['front hand spring', 'fhs'],
    events: ['floor', 'vault'],
    levels: ['Level 5', 'Level 6', 'Level 7', 'Level 8', 'Level 9', 'Level 10', 'Elite', 'Xcel Gold', 'Xcel Platinum'],
    difficulty: 0.1,
    geminiDescription: `A front handspring: gymnast runs, hurdles, places both hands on floor (or vault), pushes off with arms while rotating forward, landing on two feet. Arms must be straight.`,
    deductionRules: {
      bentArms:  { fault: 'Bent arms', measure: 'elbowAngle', phase: 'peak', idealAngle: 175, calc: (m) => sev(Math.max(0, 175 - m)), detail: (m) => `Elbow angle: ${Math.round(m)}°` },
      bentKnees: { fault: 'Bent knees', measure: 'worstKneeAngle', phase: 'flight', idealAngle: 165, calc: (m) => sev(Math.max(0, 165 - m)), detail: (m) => `Worst knee angle: ${Math.round(m)}°` },
      pikedBody: { fault: 'Pike in body position', measure: 'hipAngle', phase: 'peak', idealAngle: 170, calc: (m) => sev(Math.max(0, 170 - m)), detail: (m) => `Hip angle: ${Math.round(m)}°` },
    },
  },

  // ══════════════════════════════════════════════════════════════════
  // DANCE ELEMENTS — All levels (angle requirements vary by level)
  // ══════════════════════════════════════════════════════════════════

  leap: {
    id: 'leap', name: 'Split Leap',
    aliases: ['grand jete', 'grand jeté', 'split jump', 'switch leap', 'leap', 'tour jete'],
    events: ['floor', 'beam'],
    levels: ['Level 1', 'Level 2', 'Level 3', 'Level 4', 'Level 5', 'Level 6', 'Level 7', 'Level 8', 'Level 9', 'Level 10', 'Elite', 'Xcel Bronze', 'Xcel Silver', 'Xcel Gold', 'Xcel Platinum', 'Xcel Diamond', 'Xcel Sapphire'],
    difficulty: 0.1,
    geminiDescription: `A split leap (grand jeté): gymnast leaps from one foot with legs splitting in the air, landing on one foot. The split angle required varies by level (90° at Levels 1–4/Xcel Bronze–Silver, 120° at Level 5/Xcel Gold, 150° at Levels 6–7/Xcel Platinum, 180° at Levels 8+).`,
    levelAware: true, // signal to use splitAngleRequired()
    deductionRules: {
      insufficientSplit: {
        fault: 'Insufficient split angle', measure: 'hipAngle', phase: 'peak',
        levelAware: true, // threshold computed at runtime from athlete level
        calc: (measured, level) => {
          const required = splitAngleRequired(level);
          const diff = required - measured;
          if (diff <= 0) return null;
          if (diff <= 15) return { amount: 0.05, ...SEVERITY.SMALL };
          if (diff <= 30) return { amount: 0.10, ...SEVERITY.MEDIUM };
          if (diff <= 50) return { amount: 0.20, ...SEVERITY.LARGE };
          return { amount: 0.30, ...SEVERITY.VERY_LARGE };
        },
        detail: (measured, level) => {
          const required = splitAngleRequired(level);
          return `Split angle ~${Math.round(measured)}° (${level} requires ≥${required}°)`;
        },
      },
      bentKnees: { fault: 'Bent knees / legs', measure: 'worstKneeAngle', phase: 'flight', idealAngle: 165, calc: (m) => sev(Math.max(0, 165 - m)), detail: (m) => `Worst knee angle: ${Math.round(m)}°` },
    },
  },

  straddle_jump: {
    id: 'straddle_jump', name: 'Straddle Jump',
    aliases: ['straddle', 'pike jump'],
    events: ['floor', 'beam'],
    levels: ['Level 4', 'Level 5', 'Level 6', 'Level 7', 'Level 8', 'Level 9', 'Level 10', 'Elite', 'Xcel Gold', 'Xcel Platinum', 'Xcel Diamond', 'Xcel Sapphire'],
    difficulty: 0.0,
    geminiDescription: `A straddle jump: gymnast jumps straight up, opens legs to a straddle position (to the sides) at peak, returns legs together for landing. Legs should be straight and horizontal or above.`,
    deductionRules: {
      bentKnees:          { fault: 'Bent knees', measure: 'kneeAngle', phase: 'peak', idealAngle: 165, calc: (m) => sev(Math.max(0, 165 - m)), detail: (m) => `Knee angle: ${Math.round(m)}°` },
      insufficientHeight: { fault: 'Insufficient height', measure: 'hipY_peak', phase: 'peak', threshold: 0.45, calc: (m) => m > 0.5 ? { amount: 0.10, ...SEVERITY.MEDIUM } : null, detail: () => 'Jump lacks amplitude' },
    },
  },

  full_turn: {
    id: 'full_turn', name: 'Full Turn (Pirouette)',
    aliases: ['pirouette', '360 turn', 'turn', 'full pirouette'],
    events: ['floor', 'beam'],
    levels: ['Level 4', 'Level 5', 'Level 6', 'Level 7', 'Level 8', 'Level 9', 'Level 10', 'Elite', 'Xcel Gold', 'Xcel Platinum', 'Xcel Diamond', 'Xcel Sapphire'],
    difficulty: 0.1,
    geminiDescription: `A full turn (pirouette): gymnast rises to releve on one foot, completes a full 360° rotation, maintaining upright posture with free leg in passé or other position.`,
    deductionRules: {
      incompleteRotation: { fault: 'Incomplete rotation (< 360°)', measure: 'shoulderAngle', phase: 'peak', idealAngle: 170, calc: (m) => m < 150 ? { amount: 0.20, ...SEVERITY.LARGE } : { amount: 0.10, ...SEVERITY.MEDIUM }, detail: () => 'Turn appears incomplete or falls short of 360°' },
      bodyAlignment:      { fault: 'Body alignment / leaning', measure: 'bodyLineDev', phase: 'peak', threshold: 0.07, calc: (m) => m > 0.12 ? { amount: 0.10, ...SEVERITY.MEDIUM } : { amount: 0.05, ...SEVERITY.SMALL }, detail: () => 'Body not vertical during turn' },
    },
  },

  // ══════════════════════════════════════════════════════════════════
  // VAULT — Levels 3–10, Elite, Xcel Silver+
  // ══════════════════════════════════════════════════════════════════

  handspring_vault: {
    id: 'handspring_vault', name: 'Handspring Vault (Tsukahara / Front)',
    aliases: ['handspring', 'vault handspring', 'front vault'],
    events: ['vault'],
    levels: ['Level 5', 'Level 6', 'Level 7', 'Level 8', 'Xcel Gold', 'Xcel Platinum'],
    difficulty: 0.2,
    geminiDescription: `A handspring vault: gymnast runs, hurdles, contacts springboard, reaches hands to vault table, pushes off rotating forward, lands on two feet. Arms straight at contact, body should reach near-vertical, good amplitude over the table.`,
    deductionRules: {
      bentArms:           { fault: 'Bent arms on vault contact', measure: 'elbowAngle', phase: 'peak', idealAngle: 170, calc: (m) => sev(Math.max(0, 170 - m)), detail: (m) => `Elbow angle: ${Math.round(m)}°` },
      insufficientHeight: { fault: 'Insufficient height / amplitude', measure: 'hipY_peak', phase: 'peak', threshold: 0.35, calc: (m) => m > 0.45 ? { amount: 0.20, ...SEVERITY.LARGE } : { amount: 0.10, ...SEVERITY.MEDIUM }, detail: () => 'Insufficient height over vault' },
      bentKnees:          { fault: 'Bent knees in post-flight', measure: 'worstKneeAngle', phase: 'flight', idealAngle: 165, calc: (m) => sev(Math.max(0, 165 - m)), detail: (m) => `Worst knee angle: ${Math.round(m)}°` },
    },
  },

  yurchenko_vault: {
    id: 'yurchenko_vault', name: 'Yurchenko Vault',
    aliases: ['yurchenko', 'yurchenko layout', 'yurchenko full', 'round off entry vault'],
    events: ['vault'],
    levels: ['Level 8', 'Level 9', 'Level 10', 'Elite', 'Xcel Diamond', 'Xcel Sapphire'],
    difficulty: 0.5,
    geminiDescription: `A Yurchenko vault: gymnast runs, round-off onto springboard, back handspring onto vault table, salto (layout, full, double, etc.) off. The entry is the distinctive round-off + back entry onto the table.`,
    deductionRules: {
      bentKnees:          { fault: 'Bent knees in post-flight', measure: 'worstKneeAngle', phase: 'flight', idealAngle: 168, calc: (m) => sev(Math.max(0, 168 - m)), detail: (m) => `Worst knee angle: ${Math.round(m)}°` },
      pikedBody:          { fault: 'Pike in layout / body position', measure: 'hipAngle', phase: 'peak', idealAngle: 170, calc: (m) => sev(Math.max(0, 170 - m)), detail: (m) => `Hip angle: ${Math.round(m)}°` },
      insufficientHeight: { fault: 'Insufficient height / amplitude', measure: 'hipY_peak', phase: 'peak', threshold: 0.30, calc: (m) => m > 0.40 ? { amount: 0.30, ...SEVERITY.VERY_LARGE } : { amount: 0.10, ...SEVERITY.MEDIUM }, detail: () => 'Vault lacks amplitude' },
    },
  },

  // ══════════════════════════════════════════════════════════════════
  // MEN'S EVENTS — Basic coverage Levels 1–10, Elite
  // ══════════════════════════════════════════════════════════════════

  pommel_circle: {
    id: 'pommel_circle', name: 'Pommel Horse Circle',
    aliases: ['circle', 'double leg circle', 'thomas flair', 'flairs'],
    events: ['pommel'],
    levels: ['Level 5', 'Level 6', 'Level 7', 'Level 8', 'Level 9', 'Level 10', 'Elite'],
    difficulty: 0.1,
    geminiDescription: `Pommel horse double-leg circles: gymnast swings both legs in continuous circular motion around the pommel horse, supporting on hands/pommels. Legs together, toes pointed, body should remain elevated.`,
    deductionRules: {
      bentKnees:     { fault: 'Bent knees / legs', measure: 'kneeAngle', phase: 'peak', idealAngle: 170, calc: (m) => sev(Math.max(0, 170 - m)), detail: (m) => `Knee angle: ${Math.round(m)}°` },
      legSeparation: { fault: 'Leg separation', measure: 'legSep', phase: 'peak', threshold: 0.05, calc: (m) => m > 0.10 ? { amount: 0.20, ...SEVERITY.LARGE } : { amount: 0.10, ...SEVERITY.MEDIUM }, detail: () => 'Legs visible apart' },
    },
  },

  rings_cross: {
    id: 'rings_cross', name: 'Rings — Cross / Iron Cross',
    aliases: ['iron cross', 'cross', 'L cross', 'victorian cross'],
    events: ['rings'],
    levels: ['Level 7', 'Level 8', 'Level 9', 'Level 10', 'Elite'],
    difficulty: 0.5,
    geminiDescription: `Rings iron cross: gymnast holds rings with arms extended horizontally to the sides, body hanging in a straight vertical line. Arms must be completely straight and horizontal.`,
    deductionRules: {
      bentArms:      { fault: 'Bent arms in cross position', measure: 'elbowAngle', phase: 'peak', idealAngle: 175, calc: (m) => sev(Math.max(0, 175 - m)), detail: (m) => `Elbow angle: ${Math.round(m)}°` },
      bodyAlignment: { fault: 'Body not vertical', measure: 'bodyLineDev', phase: 'peak', threshold: 0.05, calc: (m) => m > 0.10 ? { amount: 0.20, ...SEVERITY.LARGE } : { amount: 0.10, ...SEVERITY.MEDIUM }, detail: () => 'Body deviating from vertical' },
    },
  },

  parallel_bars_kip: {
    id: 'parallel_bars_kip', name: 'Parallel Bars — Kip',
    aliases: ['pbars kip', 'kip to support'],
    events: ['parallel_bars'],
    levels: ['Level 5', 'Level 6', 'Level 7', 'Level 8', 'Level 9', 'Level 10', 'Elite'],
    difficulty: 0.1,
    geminiDescription: `Parallel bars kip: gymnast swings forward under the bars, then pikes and kips (hip snap + extension) to arrive in a support position above the bars. Arms must be straight at finish.`,
    deductionRules: {
      bentArms:  { fault: 'Bent arms in support position', measure: 'elbowAngle', phase: 'peak', idealAngle: 170, calc: (m) => sev(Math.max(0, 170 - m)), detail: (m) => `Elbow angle: ${Math.round(m)}°` },
      bentKnees: { fault: 'Bent knees', measure: 'kneeAngle', phase: 'peak', idealAngle: 165, calc: (m) => sev(Math.max(0, 165 - m)), detail: (m) => `Knee angle: ${Math.round(m)}°` },
    },
  },

  high_bar_giant: {
    id: 'high_bar_giant', name: 'High Bar — Giant Swing',
    aliases: ['giant', 'giant swing', 'horizontal bar giant'],
    events: ['horizontal_bar'],
    levels: ['Level 7', 'Level 8', 'Level 9', 'Level 10', 'Elite'],
    difficulty: 0.1,
    geminiDescription: `High bar giant swing: gymnast swings in a full 360° rotation around the bar while maintaining a hollow or arched body position depending on direction. Arms straight throughout.`,
    deductionRules: {
      bentArms:   { fault: 'Bent arms during giant', measure: 'elbowAngle', phase: 'peak', idealAngle: 170, calc: (m) => sev(Math.max(0, 170 - m)), detail: (m) => `Elbow angle: ${Math.round(m)}°` },
      bentKnees:  { fault: 'Bent knees / legs', measure: 'worstKneeAngle', phase: 'flight', idealAngle: 165, calc: (m) => sev(Math.max(0, 165 - m)), detail: (m) => `Worst knee angle: ${Math.round(m)}°` },
      pikedBody:  { fault: 'Pike in body position', measure: 'hipAngle', phase: 'peak', idealAngle: 170, calc: (m) => sev(Math.max(0, 170 - m)), detail: (m) => `Hip angle: ${Math.round(m)}°` },
    },
  },

  // ══════════════════════════════════════════════════════════════════
  // UNIVERSAL LANDING RULES (applied to ALL skills)
  // ══════════════════════════════════════════════════════════════════

  _landing_rules: {
    id: '_landing_rules', name: 'Landing (Universal)', isUniversal: true,
    deductionRules: {
      smallStep:  { fault: 'Small step on landing', deduction: 0.05, severity: SEVERITY.SMALL.label,  detail: 'Foot moved after initial contact' },
      mediumStep: { fault: 'Medium step / stumble',  deduction: 0.10, severity: SEVERITY.MEDIUM.label, detail: 'Visible step or stumble on landing' },
      largeStep:  { fault: 'Large step / lunge',     deduction: 0.30, severity: SEVERITY.LARGE.label,  detail: 'Large lunge or significant weight shift' },
      deepSquat: {
        fault: 'Deep squat on landing', measure: 'kneeAngle', phase: 'landing',
        calc: (m) => m < 90 ? { amount: 0.30, ...SEVERITY.LARGE } : m < 110 ? { amount: 0.20, ...SEVERITY.LARGE } : null,
        detail: (m) => `Landing knee angle: ${Math.round(m)}°`,
      },
      fall: { fault: 'Fall on landing', deduction: 0.50, severity: SEVERITY.FALL.label, detail: 'Hands or body contacted the floor on landing' },
    },
  },
};

// ─── LOOKUP HELPERS ───────────────────────────────────────────────────────────

export function matchSkillByName(geminiName) {
  if (!geminiName) return null;
  const n = geminiName.toLowerCase().trim();
  for (const el of Object.values(ELEMENTS)) {
    if (el.isUniversal) continue;
    if (el.name.toLowerCase() === n) return el;
    if (el.aliases?.some(a => a.toLowerCase() === n)) return el;
    if (n.includes(el.id.replace(/_/g, ' ')) || el.id.replace(/_/g, ' ').includes(n)) return el;
  }
  return null;
}

export function getElementsForLevel(event, level) {
  return Object.values(ELEMENTS).filter(el =>
    !el.isUniversal && el.events?.includes(event) && el.levels?.includes(level)
  );
}

export function getLevelRequirements(level) {
  return LEVEL_REQUIREMENTS[level] || null;
}

/**
 * Compute rule-based deductions for a classified skill + biomechanics.
 * Passes athlete level through for level-aware rules (e.g. split angle).
 */
export function getDeductionsForSkill(element, bio, level = '') {
  if (!element || !bio) return [];
  const results = [];

  const MEASURE_MAP = {
    kneeAngle:       bio.peak?.kneeAngle,
    hipAngle:        bio.peak?.hipAngle,
    shoulderAngle:   bio.peak?.shoulderAngle,
    elbowAngle:      bio.peak?.elbowAngle,
    worstKneeAngle:  bio.worstKneeAngle,
    legSep:          bio.peak?.legSep,
    bodyLineDev:     bio.peak?.bodyLineDev,
    hipY_peak:       null,
    kneeAngle_landing: bio.landing?.kneeAngle,
  };

  for (const [key, rule] of Object.entries(element.deductionRules || {})) {
    try {
      const measured = MEASURE_MAP[rule.measure];
      if (measured === null || measured === undefined) continue;
      if (rule.threshold !== undefined && measured < rule.threshold) continue;

      const result = rule.levelAware
        ? rule.calc(measured, level)
        : rule.calc(measured);

      if (!result || result.amount <= 0) continue;

      results.push({
        key,
        fault:      rule.fault,
        deduction:  result.amount,
        severity:   result.label || 'small',
        detail:     rule.detail ? (rule.levelAware ? rule.detail(measured, level) : rule.detail(measured)) : '',
        measured,
        confidence: 0.80,
        source:     'dict',
      });
    } catch (e) { /* skip bad rules */ }
  }

  // Universal landing check
  const lk = bio.landing?.kneeAngle;
  if (lk != null) {
    const lr = ELEMENTS._landing_rules.deductionRules.deepSquat.calc(lk);
    if (lr) results.push({ key: 'deepSquat', fault: ELEMENTS._landing_rules.deductionRules.deepSquat.fault, deduction: lr.amount, severity: lr.label, detail: ELEMENTS._landing_rules.deductionRules.deepSquat.detail(lk), measured: lk, confidence: 0.75, source: 'dict' });
  }

  return results;
}
