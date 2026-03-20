/**
 * ═══════════════════════════════════════════════════════════════════════
 * USAG CODE OF POINTS — DEDUCTION DATABASE
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Structured deduction data for Gemini AI judging prompt enforcement.
 * Covers WAG (Levels 1-10, Elite, Xcel) and MAG (Levels 1-10, Elite).
 *
 * Sources: USAG J.O. Code of Points, USAG Xcel Code of Points,
 *          FIG Code of Points (Elite), USAG Men's Program rules.
 *
 * NOTE: This file is consumed by buildJudgingPrompt() in LegacyApp.js.
 *       Do NOT modify deduction values without explicit owner approval.
 * ═══════════════════════════════════════════════════════════════════════
 */

// ─── SPLIT ANGLE REQUIREMENTS BY LEVEL ──────────────────────────────
export const SPLIT_REQUIREMENTS = {
  compulsory_1_3: 90,
  compulsory_4_5: 120,
  optional_6_7: 135,
  optional_8_10: 150,
  elite: 180,
  xcel_bronze_silver: 90,
  xcel_gold_platinum: 120,
  xcel_diamond_sapphire: 150,
};

// ─── SCORE RANGES BY LEVEL (for calibration) ────────────────────────
export const SCORE_RANGES = {
  "Level 1":        { low: 7.5, typical: 8.5, high: 9.5, state: { low: 8.0, typical: 8.8, high: 9.6 } },
  "Level 2":        { low: 7.5, typical: 8.4, high: 9.5, state: { low: 7.8, typical: 8.7, high: 9.5 } },
  "Level 3":        { low: 7.0, typical: 8.3, high: 9.5, state: { low: 7.5, typical: 8.6, high: 9.5 } },
  "Level 4":        { low: 7.0, typical: 8.5, high: 9.7, state: { low: 7.5, typical: 8.8, high: 9.7 } },
  "Level 5":        { low: 7.0, typical: 8.5, high: 9.8, state: { low: 7.5, typical: 8.8, high: 9.8 } },
  "Level 6":        { low: 7.0, typical: 8.2, high: 9.0, state: { low: 7.5, typical: 8.5, high: 9.3 } },
  "Level 7":        { low: 7.5, typical: 8.5, high: 9.2, state: { low: 7.8, typical: 8.7, high: 9.5 } },
  "Level 8":        { low: 7.5, typical: 8.6, high: 9.3, state: { low: 7.8, typical: 8.8, high: 9.5 } },
  "Level 9":        { low: 7.5, typical: 8.7, high: 9.4, state: { low: 7.8, typical: 9.0, high: 9.6 } },
  "Level 10":       { low: 7.5, typical: 8.8, high: 9.5, state: { low: 7.8, typical: 9.1, high: 9.7 } },
  "Elite":          { low: 12.0, typical: 13.5, high: 15.5, state: null },
  "Xcel Bronze":    { low: 7.0, typical: 8.0, high: 9.5, state: { low: 7.5, typical: 8.5, high: 9.5 } },
  "Xcel Silver":    { low: 7.5, typical: 8.3, high: 9.5, state: { low: 7.8, typical: 8.6, high: 9.5 } },
  "Xcel Gold":      { low: 7.5, typical: 8.5, high: 9.3, state: { low: 7.8, typical: 8.7, high: 9.5 } },
  "Xcel Platinum":  { low: 7.5, typical: 8.7, high: 9.5, state: { low: 7.8, typical: 8.9, high: 9.6 } },
  "Xcel Diamond":   { low: 7.5, typical: 8.8, high: 9.5, state: { low: 7.8, typical: 9.0, high: 9.7 } },
  "Xcel Sapphire":  { low: 7.5, typical: 8.9, high: 9.6, state: { low: 7.8, typical: 9.1, high: 9.7 } },
};


// ─── UNIVERSAL EXECUTION DEDUCTIONS ─────────────────────────────────
// These apply across ALL events unless overridden by apparatus-specific rules
const UNIVERSAL_EXECUTION = {
  bentArms: {
    small: 0.05, medium: 0.10, large: 0.20, veryLarge: 0.30,
    description: "Bent arms during skill execution",
  },
  bentKnees: {
    small: 0.05, medium: 0.10, large: 0.20, veryLarge: 0.30,
    description: "Bent knees / legs during flight or hold",
  },
  legSeparation: {
    small: 0.05, medium: 0.10, large: 0.20,
    description: "Legs apart when they should be together",
  },
  flexedFeet: {
    fixed: 0.05, per: "occurrence",
    description: "Toes not pointed / feet flexed or sickled",
  },
  bodyAlignment: {
    small: 0.05, medium: 0.10, large: 0.20,
    description: "Deviation from correct body line (arch, pike, twist)",
  },
  insufficientAmplitude: {
    small: 0.05, medium: 0.10, large: 0.20, veryLarge: 0.30,
    description: "Insufficient height, distance, or extension in skill",
  },
  headPosition: {
    small: 0.05, medium: 0.10,
    description: "Head thrown back, tucked too far, or misaligned",
  },
  incompleteTurn: {
    under45: 0.10, under90: 0.20, under180: 0.30,
    description: "Turn not completed to required degrees",
  },
};

// ─── UNIVERSAL LANDING DEDUCTIONS ───────────────────────────────────
const UNIVERSAL_LANDING = {
  smallStep: { fixed: 0.10, description: "Small adjustment step on landing" },
  mediumStep: { fixed: 0.20, description: "Medium step on landing" },
  largeStepOrLunge: { fixed: 0.30, description: "Large step or lunge on landing" },
  deepSquat: { fixed: 0.30, description: "Deep squat on landing (thighs below horizontal)" },
  handsOnFloor: { fixed: 0.30, description: "Hands touch floor on landing (no fall)" },
  touchMat: { fixed: 0.30, description: "Touch apparatus/mat with hands to prevent fall" },
  fall: { fixed: 0.50, description: "Fall on landing" },
  directionDeviation: { small: 0.05, medium: 0.10, description: "Landing not in line with apparatus" },
  chestDrop: { small: 0.10, medium: 0.20, description: "Chest drops forward on landing" },
  noExtensionBeforeLanding: { small: 0.10, medium: 0.20, large: 0.30, description: "Failure to open/extend before landing" },
};


// ═══════════════════════════════════════════════════════════════════════
// WAG — APPARATUS-SPECIFIC DEDUCTIONS
// ═══════════════════════════════════════════════════════════════════════

// ─── VAULT (WAG) ────────────────────────────────────────────────────
const WAG_VAULT = {
  executionDeductions: {
    // --- Pre-flight (board to table) ---
    preflight: {
      insufficientSpeed: { small: 0.10, medium: 0.20, description: "Slow or hesitant run" },
      hurdleTooFar: { fixed: 0.10, description: "Hurdle too far from board" },
      hurdleTooClose: { fixed: 0.10, description: "Hurdle too close to board" },
      bodyAngle: { small: 0.10, medium: 0.20, large: 0.30, description: "Body angle off vertical in pre-flight" },
      armBend: { small: 0.10, medium: 0.20, large: 0.30, description: "Bent arms during pre-flight" },
      shoulderAngle: { small: 0.10, medium: 0.20, description: "Shoulders not open in pre-flight" },
      insufficientHeight: { small: 0.10, medium: 0.20, large: 0.30, description: "Low pre-flight arc" },
    },
    // --- Table contact ---
    tableContact: {
      bentArms: { small: 0.10, medium: 0.20, large: 0.30, description: "Bent arms on table" },
      shoulderAngle: { small: 0.10, medium: 0.20, description: "Shoulders not past vertical on table" },
      longPush: { fixed: 0.10, description: "Hands on table too long (pushing, not blocking)" },
      shortPush: { fixed: 0.10, description: "Hands leave table too early (weak repulsion)" },
      offCenter: { fixed: 0.10, description: "Hands not centered on table" },
    },
    // --- Post-flight (table to landing) ---
    postflight: {
      insufficientHeight: { small: 0.10, medium: 0.20, large: 0.30, description: "Insufficient post-flight height" },
      insufficientDistance: { small: 0.10, medium: 0.20, large: 0.30, description: "Landing too close to table" },
      bodyPosition: { small: 0.10, medium: 0.20, large: 0.30, description: "Poor body shape in post-flight" },
      incompleteTwist: { under45: 0.10, under90: 0.20, under180: 0.30, description: "Incomplete twist in post-flight" },
      pikingDown: { small: 0.10, medium: 0.20, description: "Piking down early to land" },
    },
    // --- Landing ---
    landing: {
      step: { perStep: 0.10, max: 0.30, description: "Steps on landing (0.10 each, max 0.30)" },
      deepSquat: { fixed: 0.30, description: "Deep squat on landing" },
      fall: { fixed: 0.50, description: "Fall on landing" },
      direction: { fixed: 0.10, description: "Landing not straight / turned" },
      noSalute: { fixed: 0.10, description: "Failure to salute judge" },
    },
  },
  compoundRules: [
    {
      trigger: "tableContact.bentArms",
      effect: "postflightFlag",
      description: "Bent arms on table usually means weak post-flight — verify height and distance",
    },
    {
      trigger: "preflight.bodyAngle",
      effect: "tableContactFlag",
      description: "Poor pre-flight angle leads to bad table contact — check shoulder angle",
    },
  ],
};

// ─── UNEVEN BARS (WAG) ──────────────────────────────────────────────
const WAG_BARS = {
  executionDeductions: {
    // --- Cast deductions ---
    castBelowHorizontal: {
      small: 0.10, medium: 0.20, large: 0.30,
      description: "Cast hip height below horizontal",
    },
    castAboveButNotHandstand: {
      small: 0.05, medium: 0.10, large: 0.20,
      description: "Cast above horizontal but below handstand requirement (L7+)",
    },
    castPassedVertical: {
      fixed: 0.10,
      description: "Cast passed vertical and fell back (overcast)",
    },
    // --- Kip deductions ---
    bentArmsInKip: {
      fixed: 0.10,
      description: "Bent arms during kip",
    },
    slowKip: {
      fixed: 0.10,
      description: "Kip not continuous/fluid — visible muscling",
    },
    kipGlideTooShort: {
      fixed: 0.10,
      description: "Insufficient glide swing before kip",
    },
    // --- Circling elements ---
    bentKneesInCircle: {
      small: 0.05, medium: 0.10, large: 0.20,
      description: "Bent knees in circling elements (back hip circle, clear hip, etc.)",
    },
    flexedFeetInCircle: {
      fixed: 0.05, per: "skill",
      description: "Flexed feet during circling elements",
    },
    hipAngleOnBar: {
      small: 0.05, medium: 0.10, large: 0.20,
      description: "Excessive pike / open hip angle on bar during circling",
    },
    bodyTooFarFromBar: {
      small: 0.05, medium: 0.10,
      description: "Body too far from bar in circling (space between hips and bar)",
    },
    // --- Release moves ---
    insufficientHeightOnRelease: {
      small: 0.10, medium: 0.20, large: 0.30,
      description: "Insufficient height above bar on release move",
    },
    graspProblems: {
      fixed: 0.10,
      description: "Re-grasp with bent arms, extra swing to catch, or visible grip correction",
    },
    brushingBarOnRelease: {
      fixed: 0.30,
      description: "Body brushes or hits bar during release move",
    },
    // --- Transitions (low bar to high bar, high to low) ---
    hitBarOnTransition: {
      fixed: 0.30,
      description: "Feet or body hit bar during transition",
    },
    insufficientFlight: {
      small: 0.10, medium: 0.20,
      description: "Insufficient flight/amplitude on transition",
    },
    // --- Rhythm and flow ---
    rhythmPause: {
      threshold: "0.5s", small: 0.10, medium: 0.20, large: 0.30,
      description: "Pause between skills (>0.5s = deduction, >3s = major break)",
    },
    extraSwing: {
      small: 0.10, medium: 0.20, large: 0.30,
      description: "Extra swing/pump between skills to generate momentum",
    },
    gripAdjustments: {
      fixed: 0.10,
      description: "Visible grip adjustment / re-grip between skills",
    },
    // --- General body shape ---
    legSeparation: {
      small: 0.05, medium: 0.10, large: 0.20,
      description: "Legs apart during circling, release, or swing",
    },
    bentArmsDuringSwing: {
      small: 0.10, medium: 0.20,
      description: "Bent arms during swing or support phases",
    },
    shoulderAngle: {
      fixed: 0.10,
      description: "Shoulders not extended at top of swing / handstand",
    },
    pikedBody: {
      small: 0.05, medium: 0.10,
      description: "Pike in body during handstand or long hang swing",
    },
    archedBody: {
      small: 0.05, medium: 0.10,
      description: "Arch in body during handstand or swing",
    },
    // --- Dismount ---
    dismountLanding: {
      step: [0.10, 0.20, 0.30],
      deepSquat: 0.30,
      fall: 0.50,
      description: "Landing deductions on dismount",
    },
    dismountHeight: {
      small: 0.10, medium: 0.20,
      description: "Insufficient height on dismount",
    },
    dismountDistance: {
      small: 0.10, medium: 0.20,
      description: "Landing too close to bar on dismount",
    },
    dismountForm: {
      small: 0.10, medium: 0.20,
      description: "Poor body shape during dismount flight (tuck, pike, etc.)",
    },
  },
  compoundRules: [
    {
      trigger: "castBelowHorizontal",
      effect: "rhythmFlag",
      description: "Low cast causes momentum loss — flag rhythm on following skill",
    },
    {
      trigger: "bentArmsInKip",
      effect: "castHeightFlag",
      description: "Bent arm kip suggests weak shoulder pull — verify cast height",
    },
    {
      trigger: "rhythmPause",
      threshold: 3,
      effect: "majorRhythmDeduction",
      value: 0.20,
      description: "3+ second pause = major rhythm break",
    },
    {
      trigger: "extraSwing",
      effect: "connectionFlag",
      description: "Extra swing means connection bonus is NOT awarded",
    },
    {
      trigger: "gripAdjustments",
      effect: "rhythmFlag",
      description: "Grip adjustment breaks routine flow — flag rhythm deduction",
    },
    {
      trigger: "castBelowHorizontal",
      effect: "srFlag",
      description: "At L7+ cast to handstand is required — low cast may void SR credit",
    },
  ],
};

// ─── BALANCE BEAM (WAG) ─────────────────────────────────────────────
const WAG_BEAM = {
  executionDeductions: {
    // --- Balance checks ---
    balanceCheck: {
      arms: 0.10,
      torso: 0.20,
      touchBeam: 0.30,
      description: "Loss of balance: arms wave (0.10), torso wobble (0.20), hand touches beam (0.30)",
    },
    graspBeam: {
      fixed: 0.50,
      description: "Grasp beam with one or both hands to avoid fall",
    },
    fall: {
      fixed: 0.50,
      description: "Fall from apparatus (includes landing on beam with stomach/seat)",
    },
    // --- Acro elements ---
    acroFormFaults: {
      bentKnees: { small: 0.05, medium: 0.10, large: 0.20 },
      bentArms: { small: 0.05, medium: 0.10, large: 0.20 },
      legSeparation: { small: 0.05, medium: 0.10, large: 0.20 },
      description: "Form faults on acro elements (BWO, BHS, aerials, etc.)",
    },
    acroHeight: {
      small: 0.10, medium: 0.20,
      description: "Insufficient height on acro flight elements",
    },
    handPlacement: {
      fixed: 0.10,
      description: "Hands not centered on beam during acro skills",
    },
    // --- Dance elements ---
    splitAngle: {
      per10Degrees: 0.05,
      description: "Split angle below requirement: 0.05 per 10 degrees short",
    },
    turnCompletion: {
      under45: 0.10, under90: 0.20, under180: 0.30,
      description: "Incomplete turn (does not reach required degrees)",
    },
    turnFormFaults: {
      heelDown: 0.10,
      freeLegLow: 0.10,
      lossOfBalance: 0.10,
      description: "Form faults during turns on beam",
    },
    leapHeight: {
      small: 0.05, medium: 0.10,
      description: "Insufficient height on leap/jump",
    },
    // --- Movement quality ---
    footPlacement: {
      fixed: 0.05, per: "step",
      description: "Foot not on beam center / walking on side of beam",
    },
    rhythmHesitation: {
      small: 0.10, medium: 0.20, large: 0.30,
      description: "Hesitation or pause before skill (fear, lack of confidence)",
    },
    choreoRhythm: {
      fixed: 0.10,
      description: "Lack of rhythm/flow between elements",
    },
    paceVariation: {
      fixed: 0.10,
      description: "No variation in pace (all same speed) or too fast/rushed",
    },
    levelChanges: {
      fixed: 0.10,
      description: "No level changes throughout routine (all standing)",
    },
    confidence: {
      small: 0.05, medium: 0.10,
      description: "Lack of confidence / tentativeness visible",
    },
    // --- Mount ---
    mountForm: {
      small: 0.10, medium: 0.20,
      description: "Form or balance errors on mount",
    },
    // --- Dismount ---
    dismountLanding: {
      step: [0.10, 0.20, 0.30],
      deepSquat: 0.30,
      fall: 0.50,
      description: "Landing deductions on dismount",
    },
    dismountHeight: {
      small: 0.10, medium: 0.20,
      description: "Insufficient height/amplitude on dismount",
    },
    dismountForm: {
      small: 0.10, medium: 0.20,
      description: "Poor body position during dismount flight",
    },
    // --- Time ---
    overtime: {
      fixed: 0.10,
      description: "Routine exceeds 90 seconds (neutral deduction)",
    },
  },
  compoundRules: [
    {
      trigger: "balanceCheck",
      effect: "rhythmFlag",
      description: "Balance check usually causes hesitation on next element — check for rhythm break",
    },
    {
      trigger: "acroFormFaults",
      effect: "balanceFlag",
      description: "Poor acro form often causes landing wobble — check for balance check after skill",
    },
    {
      trigger: "rhythmHesitation",
      threshold: 3,
      effect: "majorConfidenceDeduction",
      value: 0.20,
      description: "3+ hesitations = systematic confidence issue — apply composition deduction",
    },
    {
      trigger: "splitAngle",
      effect: "srFlag",
      description: "Insufficient split may void special requirement credit if below minimum",
    },
  ],
};

// ─── FLOOR EXERCISE (WAG) ───────────────────────────────────────────
const WAG_FLOOR = {
  executionDeductions: {
    // --- Tumbling landings ---
    landingStep: {
      perStep: 0.10, max: 0.30,
      description: "Steps on landing (each step = 0.10, max 0.30)",
    },
    landingDeep: {
      fixed: 0.30,
      description: "Deep squat on landing (hips below knee level)",
    },
    landingFall: {
      fixed: 0.50,
      description: "Fall on landing (hands, knees, or seat touch floor)",
    },
    landingChest: {
      small: 0.10, medium: 0.20,
      description: "Chest drops forward on landing",
    },
    // --- Tumbling form ---
    bentKneesInFlight: {
      small: 0.05, medium: 0.10, large: 0.20,
      description: "Bent knees during salto / flip",
    },
    bentArmsInSupport: {
      small: 0.05, medium: 0.10, large: 0.20,
      description: "Bent arms during handspring / round-off",
    },
    legSeparation: {
      small: 0.05, medium: 0.10, large: 0.20,
      description: "Legs apart during tumbling",
    },
    tumblingHeight: {
      small: 0.10, medium: 0.20, large: 0.30,
      description: "Insufficient height in tumbling pass",
    },
    tumblingLength: {
      small: 0.10, medium: 0.20,
      description: "Insufficient distance / power in tumbling pass",
    },
    tuckOpenLate: {
      fixed: 0.10,
      description: "Late opening from tuck/pike position before landing",
    },
    underRotation: {
      small: 0.10, medium: 0.20, large: 0.30,
      description: "Under-rotation of salto (short landing)",
    },
    overRotation: {
      small: 0.10, medium: 0.20,
      description: "Over-rotation of salto (forward momentum on landing)",
    },
    // --- Dance elements ---
    splitAngle: {
      per10Degrees: 0.05,
      description: "Split angle below requirement (0.05 per 10 degrees short)",
    },
    turnCompletion: {
      under45: 0.10, under90: 0.20, under180: 0.30,
      description: "Incomplete turn / pirouette",
    },
    leapHeight: {
      small: 0.05, medium: 0.10,
      description: "Insufficient height/amplitude on leap/jump",
    },
    // --- Artistry ---
    artistry: {
      hollowHands: 0.05,
      noExpression: 0.10,
      musicality: 0.10,
      energyDrop: 0.10,
      choppy: 0.10,
      lackOfVariation: 0.10,
      description: "Artistry deductions — expression, musicality, energy, variation",
    },
    choreography: {
      insufficientMovement: 0.10,
      poorUseOfSpace: 0.10,
      noLevelChanges: 0.10,
      description: "Choreography deductions — coverage of floor, transitions",
    },
    // --- Boundary ---
    outOfBounds: {
      fixed: 0.10, per: "occurrence",
      description: "Foot or body part outside floor boundary line (0.10 each time)",
    },
    outOfBoundsWholeBody: {
      fixed: 0.30,
      description: "Entire body leaves floor area",
    },
    // --- Time ---
    overtime: {
      fixed: 0.10,
      description: "Routine exceeds time limit (neutral deduction)",
    },
  },
  compoundRules: [
    {
      trigger: "landingStep",
      count: 3,
      effect: "tumblingPowerFlag",
      description: "Multiple stepping landings = likely underpowered tumbling — verify height on all passes",
    },
    {
      trigger: "splitAngle",
      effect: "srFlag",
      description: "Insufficient split may void dance special requirement credit",
    },
    {
      trigger: "outOfBounds",
      count: 2,
      effect: "choreographyFlag",
      description: "Multiple OOB = choreography/spacing issue — check floor coverage",
    },
  ],
};


// ═══════════════════════════════════════════════════════════════════════
// MAG — APPARATUS-SPECIFIC DEDUCTIONS
// ═══════════════════════════════════════════════════════════════════════

// ─── FLOOR EXERCISE (MAG) ───────────────────────────────────────────
const MAG_FLOOR = {
  executionDeductions: {
    landingStep: { perStep: 0.10, max: 0.30, description: "Steps on landing" },
    landingDeep: { fixed: 0.30, description: "Deep squat on landing" },
    landingFall: { fixed: 0.50, description: "Fall on landing" },
    bentKneesInFlight: { small: 0.10, medium: 0.20, large: 0.30, description: "Bent knees during salto" },
    bentArmsInSupport: { small: 0.10, medium: 0.20, description: "Bent arms during support elements" },
    legSeparation: { small: 0.05, medium: 0.10, large: 0.20, description: "Legs apart in flight" },
    tumblingHeight: { small: 0.10, medium: 0.20, large: 0.30, description: "Insufficient tumbling height" },
    insufficientHold: { fixed: 0.30, description: "Strength hold not held 2 seconds" },
    outOfBounds: { fixed: 0.10, per: "occurrence", description: "Out of bounds" },
    overtime: { fixed: 0.10, description: "Exceeds 70 seconds" },
  },
  compoundRules: [],
  dScoreNotes: "D-score = sum of 10 highest-valued elements (8 best + dismount). Connection bonuses for linked saltos.",
};

// ─── POMMEL HORSE (MAG) ─────────────────────────────────────────────
const MAG_POMMEL = {
  executionDeductions: {
    // --- Circles ---
    circleHeight: {
      small: 0.10, medium: 0.20, large: 0.30,
      description: "Hips not reaching horizontal during circles",
    },
    circleForm: {
      legBend: { small: 0.10, medium: 0.20 },
      legSeparation: { small: 0.10, medium: 0.20, large: 0.30 },
      footCross: { fixed: 0.10 },
      description: "Form errors during circles (bent legs, separation, crossing)",
    },
    circleRhythm: {
      small: 0.10, medium: 0.20,
      description: "Uneven rhythm or tempo in circles",
    },
    // --- Scissors ---
    scissorHeight: {
      small: 0.10, medium: 0.20,
      description: "Insufficient height/amplitude in scissors",
    },
    scissorForm: {
      small: 0.10, medium: 0.20,
      description: "Poor leg extension or form in scissors",
    },
    // --- Flairs ---
    flairHeight: {
      small: 0.10, medium: 0.20, large: 0.30,
      description: "Insufficient amplitude in flairs",
    },
    flairForm: {
      bentKnees: { small: 0.10, medium: 0.20 },
      legSeparation: { small: 0.10, medium: 0.20 },
      description: "Form faults during flairs",
    },
    // --- Travel / spindles ---
    travelForm: {
      small: 0.10, medium: 0.20,
      description: "Poor form during travel moves (Russians, spindles)",
    },
    travelHeight: {
      small: 0.10, medium: 0.20,
      description: "Insufficient height during travel elements",
    },
    // --- General ---
    touchPommel: {
      fixed: 0.30,
      description: "Touching pommel with leg or body (not hands)",
    },
    supportStop: {
      fixed: 0.30,
      description: "Stopping in support (loss of swing momentum)",
    },
    fall: {
      fixed: 0.50,
      description: "Fall from apparatus",
    },
    // --- Dismount ---
    dismountLanding: {
      step: [0.10, 0.20, 0.30], fall: 0.50,
      description: "Landing deductions on dismount",
    },
    dismountForm: {
      small: 0.10, medium: 0.20,
      description: "Poor form during dismount",
    },
  },
  compoundRules: [
    {
      trigger: "circleRhythm",
      effect: "momentumFlag",
      description: "Uneven circles suggest momentum issues — check for stops or extra support",
    },
  ],
  dScoreNotes: "D-score = sum of 10 highest elements. Travel across all pommels/end required. Must include scissors.",
};

// ─── STILL RINGS (MAG) ──────────────────────────────────────────────
const MAG_RINGS = {
  executionDeductions: {
    // --- Swing elements ---
    swingDeviation: {
      small: 0.10, medium: 0.20, large: 0.30,
      description: "Deviation from vertical plane during swing",
    },
    cableMovement: {
      small: 0.10, medium: 0.20, large: 0.30,
      description: "Cables/rings swinging (should be still)",
    },
    bentArmsInSwing: {
      small: 0.10, medium: 0.20,
      description: "Bent arms during swing elements",
    },
    // --- Strength holds ---
    crossAngle: {
      per5Degrees: 0.10,
      description: "Iron cross: arms above horizontal (0.10 per 5 degrees above ring height)",
    },
    lSitAngle: {
      small: 0.10, medium: 0.20,
      description: "L-sit: legs below horizontal",
    },
    plancheAngle: {
      small: 0.10, medium: 0.20, large: 0.30,
      description: "Planche: body not horizontal (hips too high or too low)",
    },
    malteseCross: {
      small: 0.10, medium: 0.20,
      description: "Maltese: body not horizontal, arms bent",
    },
    holdDuration: {
      fixed: 0.30,
      description: "Strength hold not maintained for 2 full seconds",
    },
    holdForm: {
      bentArms: { small: 0.10, medium: 0.20, large: 0.30 },
      bodyAlignment: { small: 0.10, medium: 0.20 },
      description: "Form faults during strength holds",
    },
    // --- Handstand ---
    handstandAlignment: {
      small: 0.10, medium: 0.20,
      description: "Handstand not vertical (body line deviation)",
    },
    handstandHold: {
      fixed: 0.30,
      description: "Handstand not held for 2 seconds",
    },
    // --- General ---
    fall: {
      fixed: 0.50,
      description: "Fall from apparatus",
    },
    // --- Dismount ---
    dismountLanding: {
      step: [0.10, 0.20, 0.30], fall: 0.50,
      description: "Landing deductions on dismount",
    },
    dismountHeight: {
      small: 0.10, medium: 0.20, large: 0.30,
      description: "Insufficient dismount height",
    },
  },
  compoundRules: [
    {
      trigger: "cableMovement",
      effect: "controlFlag",
      description: "Cable swing means gymnast is using momentum instead of strength — deduct control",
    },
    {
      trigger: "holdDuration",
      effect: "elementCredit",
      description: "Hold less than 2s may not receive element credit at all",
    },
  ],
  dScoreNotes: "D-score requires minimum strength holds + swings. Must include at least 2 strength elements and 1 swing-to-hold.",
};

// ─── VAULT (MAG) ────────────────────────────────────────────────────
const MAG_VAULT = {
  executionDeductions: {
    preflight: {
      bodyAngle: { small: 0.10, medium: 0.20, large: 0.30 },
      armBend: { small: 0.10, medium: 0.20, large: 0.30 },
      shoulderAngle: { small: 0.10, medium: 0.20 },
      insufficientHeight: { small: 0.10, medium: 0.20, large: 0.30 },
      description: "Pre-flight deductions (approach to table)",
    },
    tableContact: {
      bentArms: { small: 0.10, medium: 0.20, large: 0.30 },
      shoulderAngle: { small: 0.10, medium: 0.20 },
      duration: { fixed: 0.10 },
      description: "Table contact deductions",
    },
    postflight: {
      height: { small: 0.10, medium: 0.20, large: 0.30 },
      distance: { small: 0.10, medium: 0.20, large: 0.30 },
      bodyPosition: { small: 0.10, medium: 0.20, large: 0.30 },
      incompleteTwist: { under90: 0.10, under180: 0.20, under270: 0.30 },
      description: "Post-flight deductions",
    },
    landing: {
      step: [0.10, 0.20, 0.30],
      deepSquat: 0.30,
      fall: 0.50,
      direction: 0.10,
      description: "Landing deductions",
    },
  },
  compoundRules: [],
  dScoreNotes: "Vault D-score = difficulty value from vault table. Score = D-score minus E-score deductions.",
};

// ─── PARALLEL BARS (MAG) ────────────────────────────────────────────
const MAG_PBARS = {
  executionDeductions: {
    // --- Swing elements ---
    swingHeight: {
      small: 0.10, medium: 0.20, large: 0.30,
      description: "Insufficient swing height (hips below bar height)",
    },
    swingForm: {
      bentArms: { small: 0.10, medium: 0.20 },
      bodyAlignment: { small: 0.10, medium: 0.20 },
      legSeparation: { small: 0.05, medium: 0.10 },
      description: "Form faults during swing elements",
    },
    // --- Support elements ---
    supportBentArms: {
      small: 0.10, medium: 0.20, large: 0.30,
      description: "Bent arms in support position",
    },
    supportShoulders: {
      small: 0.10, medium: 0.20,
      description: "Shoulders not above hands in support",
    },
    // --- Handstands ---
    handstandAlignment: {
      small: 0.10, medium: 0.20, large: 0.30,
      description: "Handstand not vertical / body line deviation",
    },
    handstandHold: {
      fixed: 0.30,
      description: "Handstand not held for required duration",
    },
    // --- Release / flight ---
    releaseHeight: {
      small: 0.10, medium: 0.20,
      description: "Insufficient height on release moves",
    },
    releaseCatch: {
      small: 0.10, medium: 0.20,
      description: "Rough or insecure re-catch after release",
    },
    // --- General ---
    touchBars: {
      fixed: 0.30,
      description: "Touching bars with feet/legs (not hands)",
    },
    fall: {
      fixed: 0.50,
      description: "Fall from apparatus",
    },
    // --- Dismount ---
    dismountLanding: {
      step: [0.10, 0.20, 0.30], fall: 0.50,
      description: "Landing deductions on dismount",
    },
    dismountHeight: {
      small: 0.10, medium: 0.20,
      description: "Insufficient dismount height",
    },
    dismountForm: {
      small: 0.10, medium: 0.20,
      description: "Poor form during dismount",
    },
  },
  compoundRules: [
    {
      trigger: "supportBentArms",
      effect: "swingFlag",
      description: "Bent arms in support typically leads to weak swing — verify swing height",
    },
  ],
  dScoreNotes: "D-score = sum of 10 highest elements. Must include swing, strength, and dismount elements.",
};

// ─── HIGH BAR (MAG) ─────────────────────────────────────────────────
const MAG_HIGHBAR = {
  executionDeductions: {
    // --- Giant swings ---
    giantSwingForm: {
      bodyAlignment: { small: 0.10, medium: 0.20 },
      bentArms: { small: 0.10, medium: 0.20 },
      legSeparation: { small: 0.05, medium: 0.10 },
      pikeOrArch: { small: 0.10, medium: 0.20 },
      description: "Form faults during giant swings",
    },
    giantSwingHandstand: {
      small: 0.10, medium: 0.20,
      description: "Giant swing not passing through vertical handstand",
    },
    // --- Release moves ---
    releaseHeight: {
      small: 0.10, medium: 0.20, large: 0.30,
      description: "Insufficient height above bar on release move",
    },
    releaseCatch: {
      small: 0.10, medium: 0.20, large: 0.30,
      description: "Insecure re-catch, extra swing needed after catch",
    },
    releaseForm: {
      small: 0.10, medium: 0.20,
      description: "Poor body shape during release move flight",
    },
    barBrush: {
      fixed: 0.30,
      description: "Body brushes bar during release move",
    },
    // --- Pirouettes / turns ---
    pirouetteForm: {
      small: 0.10, medium: 0.20,
      description: "Body shape deviation during pirouette (blind change, etc.)",
    },
    pirouetteGrasp: {
      fixed: 0.10,
      description: "Incorrect or delayed re-grasp after pirouette",
    },
    // --- Rhythm ---
    extraSwing: {
      small: 0.10, medium: 0.20, large: 0.30,
      description: "Extra swing between elements",
    },
    pauseOnBar: {
      fixed: 0.30,
      description: "Stop/pause on bar between elements",
    },
    // --- General ---
    fall: {
      fixed: 0.50,
      description: "Fall from apparatus",
    },
    // --- Dismount ---
    dismountLanding: {
      step: [0.10, 0.20, 0.30], fall: 0.50,
      description: "Landing deductions on dismount",
    },
    dismountHeight: {
      small: 0.10, medium: 0.20, large: 0.30,
      description: "Insufficient dismount height",
    },
    dismountDistance: {
      small: 0.10, medium: 0.20,
      description: "Landing too close to bar on dismount",
    },
    dismountForm: {
      small: 0.10, medium: 0.20, large: 0.30,
      description: "Poor body shape during dismount flight",
    },
    dismountTwist: {
      per90Degrees: 0.10,
      description: "Incomplete twist in dismount",
    },
  },
  compoundRules: [
    {
      trigger: "releaseCatch",
      effect: "rhythmFlag",
      description: "Poor catch usually requires extra swing — check for rhythm deduction too",
    },
    {
      trigger: "extraSwing",
      effect: "connectionFlag",
      description: "Extra swing breaks element connection — no connection bonus",
    },
  ],
  dScoreNotes: "D-score = sum of 10 highest elements. Release moves highly valued. Must include both release and dismount.",
};


// ═══════════════════════════════════════════════════════════════════════
// SPECIAL REQUIREMENTS BY LEVEL
// ═══════════════════════════════════════════════════════════════════════

const WAG_SPECIAL_REQUIREMENTS = {
  // --- COMPULSORY (Levels 1-5): compulsory routines — SRs are built into
  // the routine itself. Deductions are for deviations from compulsory choreography.
  "Level 1": {
    vault: { startValue: 10.0, specialRequirements: [], notes: "Straight jump from springboard. Judged on run, hurdle, jump technique." },
    bars: { startValue: 10.0, specialRequirements: [], notes: "Compulsory routine: pullover, back hip circle. All elements prescribed." },
    beam: { startValue: 10.0, specialRequirements: [], notes: "Compulsory routine: walks, releve, stretch jump. All elements prescribed." },
    floor: { startValue: 10.0, specialRequirements: [], notes: "Compulsory routine: forward roll, backward roll, cartwheel. All elements prescribed." },
  },
  "Level 2": {
    vault: { startValue: 10.0, specialRequirements: [], notes: "Straight jump to flat back on mats." },
    bars: { startValue: 10.0, specialRequirements: [], notes: "Compulsory routine with pullover, back hip circle, underswing dismount." },
    beam: { startValue: 10.0, specialRequirements: [], notes: "Compulsory routine with walks, arabesque, cartwheel." },
    floor: { startValue: 10.0, specialRequirements: [], notes: "Compulsory routine with handstand, bridge, round-off." },
  },
  "Level 3": {
    vault: { startValue: 10.0, specialRequirements: [], notes: "Handstand flat back on mats." },
    bars: { startValue: 10.0, specialRequirements: [], notes: "Compulsory: pullover, cast, back hip circle, underswing dismount." },
    beam: { startValue: 10.0, specialRequirements: [], notes: "Compulsory: leap, releve turn, cartwheel." },
    floor: { startValue: 10.0, specialRequirements: [], notes: "Compulsory: handstand forward roll, round-off, backward roll to push-up." },
  },
  "Level 4": {
    vault: { startValue: 10.0, specialRequirements: [], notes: "Handstand flat back onto mats." },
    bars: {
      startValue: 10.0,
      specialRequirements: [],
      notes: "Compulsory: kip attempt, cast, back hip circle, underswing dismount.",
    },
    beam: {
      startValue: 10.0,
      specialRequirements: [],
      notes: "Compulsory: cartwheel, full turn, split jump, straight jump dismount.",
    },
    floor: {
      startValue: 10.0,
      specialRequirements: [],
      notes: "Compulsory: round-off back handspring, front limber, full turn.",
    },
  },
  "Level 5": {
    vault: { startValue: 10.0, specialRequirements: [], notes: "Handspring vault over table." },
    bars: {
      startValue: 10.0,
      specialRequirements: [],
      notes: "Compulsory: kip, cast to horizontal+, back hip circle, squat-on, underswing/flyaway dismount.",
    },
    beam: {
      startValue: 10.0,
      specialRequirements: [],
      notes: "Compulsory: back walkover, split leap 120+, full turn, cartwheel/BHS dismount.",
    },
    floor: {
      startValue: 10.0,
      specialRequirements: [],
      notes: "Compulsory: RO BHS back tuck, front handspring, straddle jump, full turn.",
    },
  },

  // --- OPTIONAL (Levels 6-10): gymnast-composed routines with SRs
  "Level 6": {
    vault: {
      startValue: 10.0,
      specialRequirements: [
        { id: "vault", description: "Handspring vault", svPenalty: null, notes: "Only vault allowed at L6" },
      ],
    },
    bars: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "Kip", svPenalty: 0.50 },
        { id: "sr2", description: "Cast to 45 degrees above horizontal", svPenalty: 0.50 },
        { id: "sr3", description: "One circling element (B value or higher)", svPenalty: 0.50 },
        { id: "sr4", description: "Dismount (A value or higher)", svPenalty: 0.50 },
      ],
    },
    beam: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "One A acro skill", svPenalty: 0.50 },
        { id: "sr2", description: "One A dance element with 120+ split", svPenalty: 0.50 },
        { id: "sr3", description: "Full turn (360 degrees) on one foot", svPenalty: 0.50 },
        { id: "sr4", description: "Dismount (A value or higher)", svPenalty: 0.50 },
      ],
    },
    floor: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "One A acro pass", svPenalty: 0.50 },
        { id: "sr2", description: "One A dance element with 120+ split", svPenalty: 0.50 },
        { id: "sr3", description: "Full turn (360 degrees) on one foot", svPenalty: 0.50 },
        { id: "sr4", description: "Two tumbling passes of A value or higher", svPenalty: 0.50 },
      ],
    },
  },
  "Level 7": {
    vault: {
      startValue: 10.0,
      specialRequirements: [
        { id: "vault", description: "Handspring vault with higher amplitude", svPenalty: null },
      ],
    },
    bars: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "Kip", svPenalty: 0.50 },
        { id: "sr2", description: "Cast to handstand (within 10 degrees)", svPenalty: 0.50 },
        { id: "sr3", description: "One B+ circling, release, or flight element", svPenalty: 0.50 },
        { id: "sr4", description: "Flyaway dismount (A value or higher)", svPenalty: 0.50 },
      ],
    },
    beam: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "One B acro skill", svPenalty: 0.50 },
        { id: "sr2", description: "Acro series (two directly connected acro skills)", svPenalty: 0.50 },
        { id: "sr3", description: "One A+ dance element with 150+ split", svPenalty: 0.50 },
        { id: "sr4", description: "Full turn (360 degrees) on one foot", svPenalty: 0.50 },
        { id: "sr5", description: "Dismount (B value or higher)", svPenalty: 0.50 },
      ],
    },
    floor: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "One B acro pass with salto", svPenalty: 0.50 },
        { id: "sr2", description: "Split leap or jump with 150+ degrees", svPenalty: 0.50 },
        { id: "sr3", description: "1.5 turn (540 degrees) on one foot", svPenalty: 0.50 },
        { id: "sr4", description: "Two tumbling passes of B value or higher", svPenalty: 0.50 },
      ],
    },
  },
  "Level 8": {
    vault: {
      startValue: 10.0,
      specialRequirements: [
        { id: "vault", description: "Yurchenko or Tsukahara entry vault", svPenalty: null },
      ],
    },
    bars: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "Cast to handstand", svPenalty: 0.50 },
        { id: "sr2", description: "One B release or pirouette element", svPenalty: 0.50 },
        { id: "sr3", description: "One element from bar change (low to high or high to low)", svPenalty: 0.50 },
        { id: "sr4", description: "Dismount (C value or higher)", svPenalty: 0.50 },
      ],
    },
    beam: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "Acro series with flight element", svPenalty: 0.50 },
        { id: "sr2", description: "One B+ dance element with 150+ split", svPenalty: 0.50 },
        { id: "sr3", description: "Full turn (360 degrees) on one foot", svPenalty: 0.50 },
        { id: "sr4", description: "Dismount (C value or higher)", svPenalty: 0.50 },
      ],
    },
    floor: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "One C tumbling pass", svPenalty: 0.50 },
        { id: "sr2", description: "Dance series with 180+ split leap", svPenalty: 0.50 },
        { id: "sr3", description: "Three saltos minimum in routine", svPenalty: 0.50 },
        { id: "sr4", description: "Final pass C value or higher", svPenalty: 0.50 },
      ],
    },
  },
  "Level 9": {
    vault: {
      startValue: 10.0,
      specialRequirements: [
        { id: "vault", description: "Yurchenko layout or higher", svPenalty: null },
      ],
    },
    bars: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "Cast to handstand", svPenalty: 0.50 },
        { id: "sr2", description: "One C release or pirouette element", svPenalty: 0.50 },
        { id: "sr3", description: "One element with flight from high to low bar or reverse", svPenalty: 0.50 },
        { id: "sr4", description: "Dismount (D value or higher)", svPenalty: 0.50 },
      ],
    },
    beam: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "Acro series with flight", svPenalty: 0.50 },
        { id: "sr2", description: "One B+ dance element with 180+ split", svPenalty: 0.50 },
        { id: "sr3", description: "Turn series or one C+ turn", svPenalty: 0.50 },
        { id: "sr4", description: "Dismount (C value or higher)", svPenalty: 0.50 },
      ],
    },
    floor: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "One D tumbling pass", svPenalty: 0.50 },
        { id: "sr2", description: "Dance series with 180+ leap", svPenalty: 0.50 },
        { id: "sr3", description: "Multiple saltos across passes", svPenalty: 0.50 },
        { id: "sr4", description: "Final pass C value or higher", svPenalty: 0.50 },
      ],
    },
  },
  "Level 10": {
    vault: {
      startValue: 10.0,
      specialRequirements: [
        { id: "vault", description: "Yurchenko full twist or higher (D+ value)", svPenalty: null },
      ],
    },
    bars: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "Cast to handstand (two required)", svPenalty: 0.50 },
        { id: "sr2", description: "One D+ release or flight element", svPenalty: 0.50 },
        { id: "sr3", description: "One D+ pirouette or circling element", svPenalty: 0.50 },
        { id: "sr4", description: "Dismount (D value or higher)", svPenalty: 0.50 },
      ],
    },
    beam: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "Acro series (C+C or higher)", svPenalty: 0.50 },
        { id: "sr2", description: "Dance series (two connected dance elements)", svPenalty: 0.50 },
        { id: "sr3", description: "Turn or turn series (B+ value)", svPenalty: 0.50 },
        { id: "sr4", description: "Dismount (D value or higher)", svPenalty: 0.50 },
      ],
    },
    floor: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "D+ tumbling pass", svPenalty: 0.50 },
        { id: "sr2", description: "E+ connection in tumbling", svPenalty: 0.50 },
        { id: "sr3", description: "Three saltos minimum", svPenalty: 0.50 },
        { id: "sr4", description: "Final pass D value or higher", svPenalty: 0.50 },
      ],
    },
  },

  // --- ELITE (FIG-based scoring: D-score + E-score) ---
  "Elite": {
    vault: {
      startValue: null,
      notes: "Elite uses D-score (difficulty table) + E-score (10.0 minus deductions). No fixed start value.",
      specialRequirements: [],
    },
    bars: {
      startValue: null,
      notes: "D-score + E-score system. 8 best elements counted.",
      specialRequirements: [
        { id: "sr1", description: "Flight element from HB", svPenalty: 0.50 },
        { id: "sr2", description: "Element from element group", svPenalty: 0.50 },
        { id: "sr3", description: "Close bar circling with full turn", svPenalty: 0.50 },
        { id: "sr4", description: "Dismount D value or higher", svPenalty: 0.50 },
      ],
    },
    beam: {
      startValue: null,
      notes: "D-score + E-score system.",
      specialRequirements: [
        { id: "sr1", description: "Acro series with flight", svPenalty: 0.50 },
        { id: "sr2", description: "Dance elements from different groups", svPenalty: 0.50 },
        { id: "sr3", description: "Turn C value or higher", svPenalty: 0.50 },
        { id: "sr4", description: "Dismount D value or higher", svPenalty: 0.50 },
      ],
    },
    floor: {
      startValue: null,
      notes: "D-score + E-score system.",
      specialRequirements: [
        { id: "sr1", description: "Salto with double twist or double salto", svPenalty: 0.50 },
        { id: "sr2", description: "Salto forward/sideward", svPenalty: 0.50 },
        { id: "sr3", description: "Dance passage", svPenalty: 0.50 },
        { id: "sr4", description: "Dismount D value or higher in final pass", svPenalty: 0.50 },
      ],
    },
  },

  // --- XCEL PROGRAM ---
  "Xcel Bronze": {
    vault: {
      startValue: 10.0,
      specialRequirements: [],
      notes: "Run, hurdle, jump to land on mat stack. Straight/tuck/straddle jump options.",
    },
    bars: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "Pullover or kip mount", svPenalty: 0.50 },
        { id: "sr2", description: "One circling element", svPenalty: 0.50 },
        { id: "sr3", description: "Dismount", svPenalty: 0.50 },
      ],
    },
    beam: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "Mount", svPenalty: 0.50 },
        { id: "sr2", description: "One dance element", svPenalty: 0.50 },
        { id: "sr3", description: "One acro element or pose", svPenalty: 0.50 },
        { id: "sr4", description: "Dismount", svPenalty: 0.50 },
      ],
    },
    floor: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "One acro element", svPenalty: 0.50 },
        { id: "sr2", description: "One dance element", svPenalty: 0.50 },
        { id: "sr3", description: "One tumbling pass", svPenalty: 0.50 },
      ],
    },
  },
  "Xcel Silver": {
    vault: {
      startValue: 10.0,
      specialRequirements: [],
      notes: "Handspring vault to mat stack or table.",
    },
    bars: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "Pullover or kip", svPenalty: 0.50 },
        { id: "sr2", description: "Cast", svPenalty: 0.50 },
        { id: "sr3", description: "One circling element", svPenalty: 0.50 },
        { id: "sr4", description: "Dismount", svPenalty: 0.50 },
      ],
    },
    beam: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "Mount", svPenalty: 0.50 },
        { id: "sr2", description: "One leap or jump", svPenalty: 0.50 },
        { id: "sr3", description: "Half turn (180 degrees)", svPenalty: 0.50 },
        { id: "sr4", description: "Dismount", svPenalty: 0.50 },
      ],
    },
    floor: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "Round-off", svPenalty: 0.50 },
        { id: "sr2", description: "One dance element", svPenalty: 0.50 },
        { id: "sr3", description: "Backward roll or handstand", svPenalty: 0.50 },
      ],
    },
  },
  "Xcel Gold": {
    vault: {
      startValue: 10.0,
      specialRequirements: [
        { id: "vault", description: "Handspring vault over table", svPenalty: null },
      ],
    },
    bars: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "Skill to horizontal or above (cast, etc.)", svPenalty: 0.50 },
        { id: "sr2", description: "Two 360-degree circling skills", svPenalty: 0.50 },
        { id: "sr3", description: "Dismount from high bar", svPenalty: 0.50 },
      ],
    },
    beam: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "Full turn (360 degrees) on one foot", svPenalty: 0.50 },
        { id: "sr2", description: "Two different dance elements, one with 120-degree split", svPenalty: 0.50 },
        { id: "sr3", description: "Two acro elements", svPenalty: 0.50 },
        { id: "sr4", description: "Dismount", svPenalty: 0.50 },
      ],
    },
    floor: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "Round-off back handspring (connection)", svPenalty: 0.50 },
        { id: "sr2", description: "One dance element with 120-degree split", svPenalty: 0.50 },
        { id: "sr3", description: "Full turn (360 degrees) on one foot", svPenalty: 0.50 },
        { id: "sr4", description: "Two tumbling passes", svPenalty: 0.50 },
      ],
    },
  },
  "Xcel Platinum": {
    vault: {
      startValue: 10.0,
      specialRequirements: [
        { id: "vault", description: "Handspring or Tsukahara vault", svPenalty: null },
      ],
    },
    bars: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "Cast to horizontal or above", svPenalty: 0.50 },
        { id: "sr2", description: "One B circling element", svPenalty: 0.50 },
        { id: "sr3", description: "One element with flight or release (A value or higher)", svPenalty: 0.50 },
        { id: "sr4", description: "Dismount (B value or higher)", svPenalty: 0.50 },
      ],
    },
    beam: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "One B acro element", svPenalty: 0.50 },
        { id: "sr2", description: "One dance element with 150-degree split", svPenalty: 0.50 },
        { id: "sr3", description: "Full turn (360 degrees) on one foot", svPenalty: 0.50 },
        { id: "sr4", description: "Dismount (B value or higher)", svPenalty: 0.50 },
      ],
    },
    floor: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "One B tumbling pass", svPenalty: 0.50 },
        { id: "sr2", description: "One dance element with 150-degree split", svPenalty: 0.50 },
        { id: "sr3", description: "Full turn (360 degrees) on one foot", svPenalty: 0.50 },
        { id: "sr4", description: "Two tumbling passes (B value or higher)", svPenalty: 0.50 },
      ],
    },
  },
  "Xcel Diamond": {
    vault: {
      startValue: 10.0,
      specialRequirements: [
        { id: "vault", description: "Yurchenko or Tsukahara vault", svPenalty: null },
      ],
    },
    bars: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "Cast to handstand", svPenalty: 0.50 },
        { id: "sr2", description: "One C skill (release, pirouette, or circling)", svPenalty: 0.50 },
        { id: "sr3", description: "Bar change element", svPenalty: 0.50 },
        { id: "sr4", description: "Dismount (C value or higher)", svPenalty: 0.50 },
      ],
    },
    beam: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "Acro series (two connected acro elements)", svPenalty: 0.50 },
        { id: "sr2", description: "Dance element with 180-degree split", svPenalty: 0.50 },
        { id: "sr3", description: "Full turn (360 degrees) on one foot", svPenalty: 0.50 },
        { id: "sr4", description: "Dismount (C value or higher)", svPenalty: 0.50 },
      ],
    },
    floor: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "One C tumbling pass with salto", svPenalty: 0.50 },
        { id: "sr2", description: "Dance series with 180-degree leap", svPenalty: 0.50 },
        { id: "sr3", description: "Full turn (360 degrees) on one foot", svPenalty: 0.50 },
        { id: "sr4", description: "Final tumbling pass (C value or higher)", svPenalty: 0.50 },
      ],
    },
  },
  "Xcel Sapphire": {
    vault: {
      startValue: 10.0,
      specialRequirements: [
        { id: "vault", description: "Yurchenko layout or higher", svPenalty: null },
      ],
    },
    bars: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "Cast to handstand", svPenalty: 0.50 },
        { id: "sr2", description: "One D release or pirouette element", svPenalty: 0.50 },
        { id: "sr3", description: "Bar change element with flight", svPenalty: 0.50 },
        { id: "sr4", description: "Dismount (D value or higher)", svPenalty: 0.50 },
      ],
    },
    beam: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "Flight acro series", svPenalty: 0.50 },
        { id: "sr2", description: "Dance series with 180-degree elements", svPenalty: 0.50 },
        { id: "sr3", description: "Turn series or C+ turn", svPenalty: 0.50 },
        { id: "sr4", description: "Dismount (D value or higher)", svPenalty: 0.50 },
      ],
    },
    floor: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "One D tumbling pass", svPenalty: 0.50 },
        { id: "sr2", description: "Dance series with 180-degree elements", svPenalty: 0.50 },
        { id: "sr3", description: "1.5 turn (540 degrees) on one foot", svPenalty: 0.50 },
        { id: "sr4", description: "Final tumbling pass (D value or higher)", svPenalty: 0.50 },
      ],
    },
  },
};

// ─── MAG SPECIAL REQUIREMENTS (Levels 6-10, Elite) ──────────────────
const MAG_SPECIAL_REQUIREMENTS = {
  "Level 1": {
    floor: { startValue: 10.0, specialRequirements: [], notes: "Compulsory routine." },
    pommelHorse: { startValue: 10.0, specialRequirements: [], notes: "Compulsory routine." },
    rings: { startValue: 10.0, specialRequirements: [], notes: "Compulsory routine." },
    vault: { startValue: 10.0, specialRequirements: [], notes: "Compulsory vault." },
    parallelBars: { startValue: 10.0, specialRequirements: [], notes: "Compulsory routine." },
    highBar: { startValue: 10.0, specialRequirements: [], notes: "Compulsory routine." },
  },
  "Level 2": {
    floor: { startValue: 10.0, specialRequirements: [], notes: "Compulsory routine." },
    pommelHorse: { startValue: 10.0, specialRequirements: [], notes: "Compulsory routine." },
    rings: { startValue: 10.0, specialRequirements: [], notes: "Compulsory routine." },
    vault: { startValue: 10.0, specialRequirements: [], notes: "Compulsory vault." },
    parallelBars: { startValue: 10.0, specialRequirements: [], notes: "Compulsory routine." },
    highBar: { startValue: 10.0, specialRequirements: [], notes: "Compulsory routine." },
  },
  "Level 3": {
    floor: { startValue: 10.0, specialRequirements: [], notes: "Compulsory routine." },
    pommelHorse: { startValue: 10.0, specialRequirements: [], notes: "Compulsory routine." },
    rings: { startValue: 10.0, specialRequirements: [], notes: "Compulsory routine." },
    vault: { startValue: 10.0, specialRequirements: [], notes: "Compulsory vault." },
    parallelBars: { startValue: 10.0, specialRequirements: [], notes: "Compulsory routine." },
    highBar: { startValue: 10.0, specialRequirements: [], notes: "Compulsory routine." },
  },
  "Level 4": {
    floor: { startValue: 10.0, specialRequirements: [], notes: "Compulsory routine." },
    pommelHorse: { startValue: 10.0, specialRequirements: [], notes: "Compulsory routine." },
    rings: { startValue: 10.0, specialRequirements: [], notes: "Compulsory routine." },
    vault: { startValue: 10.0, specialRequirements: [], notes: "Compulsory vault." },
    parallelBars: { startValue: 10.0, specialRequirements: [], notes: "Compulsory routine." },
    highBar: { startValue: 10.0, specialRequirements: [], notes: "Compulsory routine." },
  },
  "Level 5": {
    floor: { startValue: 10.0, specialRequirements: [], notes: "Compulsory routine." },
    pommelHorse: { startValue: 10.0, specialRequirements: [], notes: "Compulsory routine." },
    rings: { startValue: 10.0, specialRequirements: [], notes: "Compulsory routine." },
    vault: { startValue: 10.0, specialRequirements: [], notes: "Compulsory vault." },
    parallelBars: { startValue: 10.0, specialRequirements: [], notes: "Compulsory routine." },
    highBar: { startValue: 10.0, specialRequirements: [], notes: "Compulsory routine." },
  },
  "Level 6": {
    floor: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "One A acro element", svPenalty: 0.50 },
        { id: "sr2", description: "One tumbling pass", svPenalty: 0.50 },
      ],
    },
    pommelHorse: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "Scissor elements", svPenalty: 0.50 },
        { id: "sr2", description: "Circle elements", svPenalty: 0.50 },
        { id: "sr3", description: "Dismount", svPenalty: 0.50 },
      ],
    },
    rings: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "Swing element", svPenalty: 0.50 },
        { id: "sr2", description: "Strength hold (L-sit or above)", svPenalty: 0.50 },
        { id: "sr3", description: "Dismount", svPenalty: 0.50 },
      ],
    },
    vault: {
      startValue: 10.0,
      specialRequirements: [
        { id: "vault", description: "Handspring vault", svPenalty: null },
      ],
    },
    parallelBars: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "Swing element in support", svPenalty: 0.50 },
        { id: "sr2", description: "One hold element", svPenalty: 0.50 },
        { id: "sr3", description: "Dismount", svPenalty: 0.50 },
      ],
    },
    highBar: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "Long hang swing", svPenalty: 0.50 },
        { id: "sr2", description: "One circling element", svPenalty: 0.50 },
        { id: "sr3", description: "Dismount", svPenalty: 0.50 },
      ],
    },
  },
  "Level 7": {
    floor: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "One B tumbling pass with salto", svPenalty: 0.50 },
        { id: "sr2", description: "Two tumbling passes", svPenalty: 0.50 },
        { id: "sr3", description: "One strength/flexibility element", svPenalty: 0.50 },
      ],
    },
    pommelHorse: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "Scissor sequence", svPenalty: 0.50 },
        { id: "sr2", description: "Circle sequence (minimum 3)", svPenalty: 0.50 },
        { id: "sr3", description: "Travel element", svPenalty: 0.50 },
        { id: "sr4", description: "Dismount (B value)", svPenalty: 0.50 },
      ],
    },
    rings: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "Kip or felge to support", svPenalty: 0.50 },
        { id: "sr2", description: "Strength hold (B value)", svPenalty: 0.50 },
        { id: "sr3", description: "Swing to handstand", svPenalty: 0.50 },
        { id: "sr4", description: "Dismount (B value)", svPenalty: 0.50 },
      ],
    },
    vault: {
      startValue: 10.0,
      specialRequirements: [
        { id: "vault", description: "Handspring vault with higher amplitude", svPenalty: null },
      ],
    },
    parallelBars: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "Swing to handstand", svPenalty: 0.50 },
        { id: "sr2", description: "One B swing element", svPenalty: 0.50 },
        { id: "sr3", description: "One support or upper arm element", svPenalty: 0.50 },
        { id: "sr4", description: "Dismount (B value)", svPenalty: 0.50 },
      ],
    },
    highBar: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "Giant swing", svPenalty: 0.50 },
        { id: "sr2", description: "One B circling or release element", svPenalty: 0.50 },
        { id: "sr3", description: "Pirouette or direction change", svPenalty: 0.50 },
        { id: "sr4", description: "Dismount (B value)", svPenalty: 0.50 },
      ],
    },
  },
  "Level 8": {
    floor: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "One C tumbling pass", svPenalty: 0.50 },
        { id: "sr2", description: "Three tumbling passes minimum", svPenalty: 0.50 },
        { id: "sr3", description: "One strength hold (2 seconds)", svPenalty: 0.50 },
      ],
    },
    pommelHorse: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "B circle or flair element", svPenalty: 0.50 },
        { id: "sr2", description: "Travel to all parts of horse", svPenalty: 0.50 },
        { id: "sr3", description: "Dismount (C value)", svPenalty: 0.50 },
      ],
    },
    rings: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "Swing to handstand", svPenalty: 0.50 },
        { id: "sr2", description: "Two strength holds (C value)", svPenalty: 0.50 },
        { id: "sr3", description: "Dismount (C value)", svPenalty: 0.50 },
      ],
    },
    vault: {
      startValue: 10.0,
      specialRequirements: [
        { id: "vault", description: "Yurchenko or Tsukahara entry", svPenalty: null },
      ],
    },
    parallelBars: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "Swing to handstand", svPenalty: 0.50 },
        { id: "sr2", description: "One C swing element", svPenalty: 0.50 },
        { id: "sr3", description: "One element in upper arm or L-support", svPenalty: 0.50 },
        { id: "sr4", description: "Dismount (C value)", svPenalty: 0.50 },
      ],
    },
    highBar: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "Giant swing sequence", svPenalty: 0.50 },
        { id: "sr2", description: "One C release move", svPenalty: 0.50 },
        { id: "sr3", description: "Pirouette element", svPenalty: 0.50 },
        { id: "sr4", description: "Dismount (C value)", svPenalty: 0.50 },
      ],
    },
  },
  "Level 9": {
    floor: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "One D tumbling pass", svPenalty: 0.50 },
        { id: "sr2", description: "Three saltos across passes", svPenalty: 0.50 },
        { id: "sr3", description: "One C+ strength or press element", svPenalty: 0.50 },
      ],
    },
    pommelHorse: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "C+ circle or flair element", svPenalty: 0.50 },
        { id: "sr2", description: "Travel/spindle element", svPenalty: 0.50 },
        { id: "sr3", description: "Dismount (C+ value)", svPenalty: 0.50 },
      ],
    },
    rings: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "Swing to handstand", svPenalty: 0.50 },
        { id: "sr2", description: "C+ strength hold", svPenalty: 0.50 },
        { id: "sr3", description: "Swing element from inverted hang", svPenalty: 0.50 },
        { id: "sr4", description: "Dismount (D value)", svPenalty: 0.50 },
      ],
    },
    vault: {
      startValue: 10.0,
      specialRequirements: [
        { id: "vault", description: "Yurchenko layout or higher", svPenalty: null },
      ],
    },
    parallelBars: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "Swing to handstand through various planes", svPenalty: 0.50 },
        { id: "sr2", description: "One D swing element", svPenalty: 0.50 },
        { id: "sr3", description: "Release or flight element", svPenalty: 0.50 },
        { id: "sr4", description: "Dismount (D value)", svPenalty: 0.50 },
      ],
    },
    highBar: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "Giant swing sequence", svPenalty: 0.50 },
        { id: "sr2", description: "One D release move", svPenalty: 0.50 },
        { id: "sr3", description: "Pirouette element (C+ value)", svPenalty: 0.50 },
        { id: "sr4", description: "Dismount (D value)", svPenalty: 0.50 },
      ],
    },
  },
  "Level 10": {
    floor: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "One D+ tumbling pass", svPenalty: 0.50 },
        { id: "sr2", description: "Four tumbling passes, three with saltos", svPenalty: 0.50 },
        { id: "sr3", description: "Strength/press element (C+ value)", svPenalty: 0.50 },
      ],
    },
    pommelHorse: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "D+ circle or flair element", svPenalty: 0.50 },
        { id: "sr2", description: "Russian/spindle travel element", svPenalty: 0.50 },
        { id: "sr3", description: "Travel to all parts of horse", svPenalty: 0.50 },
        { id: "sr4", description: "Dismount (D value)", svPenalty: 0.50 },
      ],
    },
    rings: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "Two swing elements to handstand", svPenalty: 0.50 },
        { id: "sr2", description: "D+ strength hold", svPenalty: 0.50 },
        { id: "sr3", description: "Swing element from inverted hang", svPenalty: 0.50 },
        { id: "sr4", description: "Dismount (D+ value)", svPenalty: 0.50 },
      ],
    },
    vault: {
      startValue: 10.0,
      specialRequirements: [
        { id: "vault", description: "Yurchenko full twist or higher", svPenalty: null },
      ],
    },
    parallelBars: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "Multiple swing to handstand elements", svPenalty: 0.50 },
        { id: "sr2", description: "D+ swing or flight element", svPenalty: 0.50 },
        { id: "sr3", description: "L-support or upper arm element", svPenalty: 0.50 },
        { id: "sr4", description: "Dismount (D+ value)", svPenalty: 0.50 },
      ],
    },
    highBar: {
      startValue: 10.0,
      specialRequirements: [
        { id: "sr1", description: "Giant swing with direction changes", svPenalty: 0.50 },
        { id: "sr2", description: "Two D+ release or flight elements", svPenalty: 0.50 },
        { id: "sr3", description: "Pirouette element (D value)", svPenalty: 0.50 },
        { id: "sr4", description: "Dismount (D+ value)", svPenalty: 0.50 },
      ],
    },
  },
  "Elite": {
    floor: {
      startValue: null, notes: "D-score + E-score system.",
      specialRequirements: [
        { id: "sr1", description: "Double salto", svPenalty: 0.50 },
        { id: "sr2", description: "Salto forward/sideward", svPenalty: 0.50 },
        { id: "sr3", description: "Strength/press to handstand", svPenalty: 0.50 },
      ],
    },
    pommelHorse: {
      startValue: null, notes: "D-score + E-score system.",
      specialRequirements: [
        { id: "sr1", description: "Scissor element", svPenalty: 0.50 },
        { id: "sr2", description: "Travel element (Russian, spindle)", svPenalty: 0.50 },
        { id: "sr3", description: "Circle/flair on all parts", svPenalty: 0.50 },
        { id: "sr4", description: "Dismount", svPenalty: 0.50 },
      ],
    },
    rings: {
      startValue: null, notes: "D-score + E-score system.",
      specialRequirements: [
        { id: "sr1", description: "Swing elements", svPenalty: 0.50 },
        { id: "sr2", description: "Strength hold elements", svPenalty: 0.50 },
        { id: "sr3", description: "Swing to strength hold", svPenalty: 0.50 },
        { id: "sr4", description: "Dismount", svPenalty: 0.50 },
      ],
    },
    vault: {
      startValue: null, notes: "D-score from vault table.",
      specialRequirements: [],
    },
    parallelBars: {
      startValue: null, notes: "D-score + E-score system.",
      specialRequirements: [
        { id: "sr1", description: "Swing through support/handstand", svPenalty: 0.50 },
        { id: "sr2", description: "Flight element", svPenalty: 0.50 },
        { id: "sr3", description: "L-support or press element", svPenalty: 0.50 },
        { id: "sr4", description: "Dismount", svPenalty: 0.50 },
      ],
    },
    highBar: {
      startValue: null, notes: "D-score + E-score system.",
      specialRequirements: [
        { id: "sr1", description: "Flight element close to bar", svPenalty: 0.50 },
        { id: "sr2", description: "Flight element far from bar", svPenalty: 0.50 },
        { id: "sr3", description: "Element from el-grip or dorsal hang", svPenalty: 0.50 },
        { id: "sr4", description: "Dismount", svPenalty: 0.50 },
      ],
    },
  },
};


// ═══════════════════════════════════════════════════════════════════════
// MAIN CODE_OF_POINTS OBJECT
// ═══════════════════════════════════════════════════════════════════════

// Maps event name variants to canonical apparatus data keys
const WAG_EVENT_MAP = {
  "Vault": "vault",
  "vault": "vault",
  "Bars": "bars",
  "bars": "bars",
  "Uneven Bars": "bars",
  "uneven bars": "bars",
  "UB": "bars",
  "Beam": "beam",
  "beam": "beam",
  "Balance Beam": "beam",
  "balance beam": "beam",
  "BB": "beam",
  "Floor": "floor",
  "floor": "floor",
  "Floor Exercise": "floor",
  "floor exercise": "floor",
  "FX": "floor",
};

const MAG_EVENT_MAP = {
  "Floor": "floor",
  "floor": "floor",
  "Floor Exercise": "floor",
  "floor exercise": "floor",
  "FX": "floor",
  "Pommel Horse": "pommelHorse",
  "pommel horse": "pommelHorse",
  "PH": "pommelHorse",
  "Rings": "rings",
  "Still Rings": "rings",
  "still rings": "rings",
  "SR": "rings",
  "Vault": "vault",
  "vault": "vault",
  "VT": "vault",
  "Parallel Bars": "parallelBars",
  "parallel bars": "parallelBars",
  "PB": "parallelBars",
  "High Bar": "highBar",
  "high bar": "highBar",
  "Horizontal Bar": "highBar",
  "HB": "highBar",
};

// Apparatus-specific deduction data keyed by canonical event name
const WAG_APPARATUS_DATA = {
  vault: WAG_VAULT,
  bars: WAG_BARS,
  beam: WAG_BEAM,
  floor: WAG_FLOOR,
};

const MAG_APPARATUS_DATA = {
  floor: MAG_FLOOR,
  pommelHorse: MAG_POMMEL,
  rings: MAG_RINGS,
  vault: MAG_VAULT,
  parallelBars: MAG_PBARS,
  highBar: MAG_HIGHBAR,
};

/**
 * Master Code of Points object.
 * Access pattern: CODE_OF_POINTS.women.levels["Level 7"].bars
 */
export const CODE_OF_POINTS = {
  women: {
    events: ["Vault", "Uneven Bars", "Balance Beam", "Floor Exercise"],
    eventMap: WAG_EVENT_MAP,
    apparatusData: WAG_APPARATUS_DATA,
    levels: WAG_SPECIAL_REQUIREMENTS,
    universalExecution: UNIVERSAL_EXECUTION,
    universalLanding: UNIVERSAL_LANDING,
  },
  men: {
    events: ["Floor Exercise", "Pommel Horse", "Still Rings", "Vault", "Parallel Bars", "High Bar"],
    eventMap: MAG_EVENT_MAP,
    apparatusData: MAG_APPARATUS_DATA,
    levels: MAG_SPECIAL_REQUIREMENTS,
    universalExecution: UNIVERSAL_EXECUTION,
    universalLanding: UNIVERSAL_LANDING,
    dScoreSystem: {
      description: "MAG uses D-score (difficulty) + E-score (execution from 10.0) at optional levels.",
      formula: "Final Score = D-score + E-score (where E-score = 10.0 - deductions)",
      elementCount: "Best 10 elements counted toward D-score (8 elements + group bonuses)",
    },
  },
};


// ═══════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Normalize gender input to "women" or "men"
 */
function normalizeGender(gender) {
  const g = (gender || "").toLowerCase().trim();
  if (g === "women" || g === "female" || g === "wag" || g === "girls" || g === "girl" || g === "w" || g === "f") return "women";
  if (g === "men" || g === "male" || g === "mag" || g === "boys" || g === "boy" || g === "m") return "men";
  return "women"; // default
}

/**
 * Normalize level input to match keys in the data
 */
function normalizeLevel(level) {
  if (!level) return null;
  const l = level.trim();
  // Already in correct format
  if (WAG_SPECIAL_REQUIREMENTS[l] || MAG_SPECIAL_REQUIREMENTS[l]) return l;
  // Try adding "Level " prefix
  const withPrefix = `Level ${l}`;
  if (WAG_SPECIAL_REQUIREMENTS[withPrefix]) return withPrefix;
  // Try "Xcel " prefix
  const withXcel = `Xcel ${l}`;
  if (WAG_SPECIAL_REQUIREMENTS[withXcel]) return withXcel;
  return l;
}

/**
 * Get all deduction data for a specific event at a specific level.
 * Returns apparatus-specific execution deductions, compound rules,
 * universal deductions, special requirements, and calibration data.
 *
 * @param {string} gender - "women"/"men"/"wag"/"mag"/etc.
 * @param {string} level - "Level 7", "Xcel Gold", etc.
 * @param {string} event - "Bars", "Uneven Bars", "Floor Exercise", etc.
 * @returns {Object|null} Combined deduction data or null if not found
 */
export function getDeductionsForEvent(gender, level, event) {
  const g = normalizeGender(gender);
  const l = normalizeLevel(level);
  const data = CODE_OF_POINTS[g];
  if (!data) return null;

  const eventKey = data.eventMap[event] || data.eventMap[event?.toLowerCase()];
  if (!eventKey) return null;

  const apparatus = data.apparatusData[eventKey];
  if (!apparatus) return null;

  const levelData = data.levels[l];
  const eventSRs = levelData ? levelData[eventKey] : null;

  // Determine split requirement
  const splitMin = getSplitMinimum(l);

  return {
    gender: g,
    level: l,
    event: eventKey,
    executionDeductions: apparatus.executionDeductions,
    compoundRules: apparatus.compoundRules || [],
    universalExecution: UNIVERSAL_EXECUTION,
    universalLanding: UNIVERSAL_LANDING,
    specialRequirements: eventSRs?.specialRequirements || [],
    startValue: eventSRs?.startValue ?? 10.0,
    notes: eventSRs?.notes || null,
    splitMinimum: splitMin,
    scoreRange: SCORE_RANGES[l] || null,
    dScoreNotes: apparatus.dScoreNotes || null,
  };
}

/**
 * Get special requirements for a specific event/level/gender.
 *
 * @param {string} gender
 * @param {string} level
 * @param {string} event
 * @returns {Array} Array of special requirement objects
 */
export function getSpecialRequirements(gender, level, event) {
  const g = normalizeGender(gender);
  const l = normalizeLevel(level);
  const data = CODE_OF_POINTS[g];
  if (!data) return [];

  const eventKey = data.eventMap[event] || data.eventMap[event?.toLowerCase()];
  if (!eventKey) return [];

  const levelData = data.levels[l];
  if (!levelData || !levelData[eventKey]) return [];

  return levelData[eventKey].specialRequirements || [];
}

/**
 * Get expected score range for a level (for AI calibration).
 *
 * @param {string} level
 * @returns {Object|null} { low, typical, high, state? }
 */
export function getScoreRange(level) {
  const l = normalizeLevel(level);
  return SCORE_RANGES[l] || null;
}

/**
 * Get minimum split angle requirement for a level.
 *
 * @param {string} level
 * @returns {number} Minimum split angle in degrees
 */
export function getSplitMinimum(level) {
  const l = normalizeLevel(level);
  if (!l) return 90;

  // Compulsory levels
  if (["Level 1", "Level 2", "Level 3"].includes(l)) return SPLIT_REQUIREMENTS.compulsory_1_3;
  if (["Level 4", "Level 5"].includes(l)) return SPLIT_REQUIREMENTS.compulsory_4_5;

  // Optional levels
  if (["Level 6", "Level 7"].includes(l)) return SPLIT_REQUIREMENTS.optional_6_7;
  if (["Level 8", "Level 9", "Level 10"].includes(l)) return SPLIT_REQUIREMENTS.optional_8_10;
  if (l === "Elite") return SPLIT_REQUIREMENTS.elite;

  // Xcel levels
  if (["Xcel Bronze", "Xcel Silver"].includes(l)) return SPLIT_REQUIREMENTS.xcel_bronze_silver;
  if (["Xcel Gold", "Xcel Platinum"].includes(l)) return SPLIT_REQUIREMENTS.xcel_gold_platinum;
  if (["Xcel Diamond", "Xcel Sapphire"].includes(l)) return SPLIT_REQUIREMENTS.xcel_diamond_sapphire;

  return 90; // safe default
}

/**
 * Get compound rules for a specific apparatus.
 * Compound rules flag cascading deductions (e.g., bent arm kip -> low cast).
 *
 * @param {string} gender
 * @param {string} event
 * @returns {Array} Array of compound rule objects
 */
export function getCompoundRules(gender, event) {
  const g = normalizeGender(gender);
  const data = CODE_OF_POINTS[g];
  if (!data) return [];

  const eventKey = data.eventMap[event] || data.eventMap[event?.toLowerCase()];
  if (!eventKey) return [];

  const apparatus = data.apparatusData[eventKey];
  return apparatus?.compoundRules || [];
}

/**
 * Get the strictness multiplier for meet context.
 * Higher-stakes meets should have tighter judging.
 *
 * @param {string} meetType - "local", "invitational", "sectional", "state", "regional", "national"
 * @returns {number} Multiplier (1.0 = normal, up to 1.3 for nationals)
 */
export function getStrictnessMultiplier(meetType) {
  const multipliers = {
    local: 1.0,
    invitational: 1.0,
    qualifying: 1.05,
    sectional: 1.10,
    state: 1.15,
    regional: 1.20,
    national: 1.30,
  };
  return multipliers[(meetType || "").toLowerCase()] || 1.0;
}

/**
 * Build a deduction summary string for inclusion in AI prompts.
 * Returns a formatted text block listing all relevant deductions for an event.
 *
 * @param {string} gender
 * @param {string} level
 * @param {string} event
 * @returns {string} Formatted deduction reference text
 */
export function buildDeductionPromptBlock(gender, level, event) {
  const data = getDeductionsForEvent(gender, level, event);
  if (!data) return "";

  const lines = [];
  lines.push(`=== DEDUCTION REFERENCE: ${data.event.toUpperCase()} (${data.level}, ${data.gender}) ===`);
  lines.push(`Start Value: ${data.startValue ?? "D-score based"}`);
  lines.push(`Split Minimum: ${data.splitMinimum} degrees`);

  if (data.scoreRange) {
    lines.push(`Expected Score Range: ${data.scoreRange.low} - ${data.scoreRange.high} (typical: ${data.scoreRange.typical})`);
  }

  // Special requirements
  if (data.specialRequirements.length > 0) {
    lines.push("\nSPECIAL REQUIREMENTS (each missing = -0.50 from Start Value):");
    data.specialRequirements.forEach((sr) => {
      lines.push(`  - ${sr.description} (penalty: ${sr.svPenalty ?? "N/A"})`);
    });
  }

  // Apparatus-specific deductions (top-level keys only for prompt brevity)
  lines.push("\nAPPARATUS-SPECIFIC DEDUCTIONS:");
  Object.entries(data.executionDeductions).forEach(([key, val]) => {
    if (val.description) {
      lines.push(`  ${key}: ${val.description}`);
    }
  });

  // Compound rules
  if (data.compoundRules.length > 0) {
    lines.push("\nCOMPOUND RULES (cascading deductions):");
    data.compoundRules.forEach((rule) => {
      lines.push(`  IF ${rule.trigger} THEN ${rule.effect}: ${rule.description}`);
    });
  }

  // D-score notes for MAG
  if (data.dScoreNotes) {
    lines.push(`\nD-SCORE: ${data.dScoreNotes}`);
  }

  return lines.join("\n");
}
