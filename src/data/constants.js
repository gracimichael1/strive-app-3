// ─── EVENTS & LEVELS ─────────────────────────────────────────────
export const WOMEN_EVENTS = ["Vault", "Uneven Bars", "Balance Beam", "Floor Exercise"];
export const MEN_EVENTS = ["Floor Exercise", "Pommel Horse", "Still Rings", "Vault", "Parallel Bars", "High Bar"];

export const LEVELS = {
  women: {
    compulsory: ["Level 1", "Level 2", "Level 3", "Level 4", "Level 5"],
    optional: ["Level 6", "Level 7", "Level 8", "Level 9", "Level 10", "Elite"],
    xcel: ["Xcel Bronze", "Xcel Silver", "Xcel Gold", "Xcel Platinum", "Xcel Diamond", "Xcel Sapphire"],
  },
  men: {
    compulsory: ["Level 1", "Level 2", "Level 3", "Level 4", "Level 5"],
    optional: ["Level 6", "Level 7", "Level 8", "Level 9", "Level 10", "Elite"],
    xcel: [],
  },
};

// ─── DEDUCTION SCALE ─────────────────────────────────────────────
export const DEDUCTION_SCALE = {
  small: { range: "0.05 – 0.10", color: "#22c55e" },
  medium: { range: "0.10 – 0.15", color: "#f59e0b" },
  large: { range: "0.20 – 0.30", color: "#f97316" },
  veryLarge: { range: "0.30 – 0.50", color: "#ef4444" },
  fall: { range: "0.50 (DP) / 1.00 (FIG)", color: "#dc2626" },
};

// ─── DEDUCTION CATEGORIES ────────────────────────────────────────
export const DEDUCTION_CATEGORIES = {
  execution: [
    { fault: "Bent arms", deduction: "up to 0.30", category: "small-large" },
    { fault: "Bent knees / legs", deduction: "up to 0.30", category: "small-large" },
    { fault: "Leg separation", deduction: "up to 0.20", category: "small-medium" },
    { fault: "Flexed / sickled feet", deduction: "0.05 each", category: "small" },
    { fault: "Insufficient height / amplitude", deduction: "up to 0.30", category: "small-large" },
    { fault: "Body alignment deviation", deduction: "up to 0.20", category: "small-medium" },
    { fault: "Pike / arch in body position", deduction: "up to 0.30", category: "small-large" },
    { fault: "Incomplete turn / twist", deduction: "up to 0.30", category: "small-large" },
    { fault: "Insufficient extension", deduction: "up to 0.30", category: "small-large" },
    { fault: "Head position error", deduction: "up to 0.10", category: "small" },
  ],
  landing: [
    { fault: "Small step (foot movement)", deduction: "0.05", category: "small" },
    { fault: "Small step-close", deduction: "0.05 – 0.10", category: "small" },
    { fault: "Medium step", deduction: "0.10 – 0.15", category: "medium" },
    { fault: "Large step / lunge", deduction: "0.20 – 0.30", category: "large" },
    { fault: "Squat on landing", deduction: "up to 0.30", category: "large" },
    { fault: "Deep squat (below 90°)", deduction: "0.30", category: "large" },
    { fault: "Hands on floor (no fall)", deduction: "0.30", category: "large" },
    { fault: "Fall on landing", deduction: "0.50", category: "fall" },
    { fault: "Incorrect body posture on landing", deduction: "up to 0.20", category: "medium" },
    { fault: "Absence of extension before landing", deduction: "up to 0.30", category: "large" },
  ],
  artistry: [
    { fault: "Lack of confidence / hesitation", deduction: "up to 0.10", category: "small" },
    { fault: "Insufficient use of space (FX)", deduction: "up to 0.10", category: "small" },
    { fault: "Poor musicality / rhythm (FX)", deduction: "up to 0.20", category: "medium" },
    { fault: "Lack of personal style / expression", deduction: "up to 0.10", category: "small" },
    { fault: "Insufficient amplitude in dance", deduction: "up to 0.20", category: "medium" },
    { fault: "Lack of variation in tempo", deduction: "up to 0.10", category: "small" },
  ],
  neutral: [
    { fault: "Out of bounds (one body part)", deduction: "0.10", category: "small" },
    { fault: "Out of bounds (two+ body parts)", deduction: "0.30", category: "large" },
    { fault: "Overtime (beam/floor 90s limit)", deduction: "0.10", category: "small" },
    { fault: "Missing special requirement", deduction: "0.50 each", category: "fall" },
    { fault: "Failure to salute judge", deduction: "0.10", category: "small" },
    { fault: "Coach on floor without cause", deduction: "0.30", category: "large" },
  ],
};

// ─── SCORE BENCHMARKS ────────────────────────────────────────────
export const SCORE_BENCHMARKS = {
  "Level 1": { low: 7.5, avg: 8.5, high: 9.5, top10: 9.3 },
  "Level 2": { low: 7.5, avg: 8.4, high: 9.5, top10: 9.2 },
  "Level 3": { low: 7.0, avg: 8.3, high: 9.5, top10: 9.2 },
  "Level 4": { low: 7.0, avg: 8.5, high: 9.7, top10: 9.3 },
  "Level 5": { low: 7.0, avg: 8.5, high: 9.8, top10: 9.4 },
  "Level 6": { low: 7.5, avg: 8.6, high: 9.6, top10: 9.3 },
  "Level 7": { low: 7.5, avg: 8.7, high: 9.7, top10: 9.4 },
  "Level 8": { low: 7.5, avg: 8.8, high: 9.7, top10: 9.4 },
  "Level 9": { low: 7.5, avg: 8.9, high: 9.8, top10: 9.5 },
  "Level 10": { low: 7.5, avg: 9.0, high: 9.9, top10: 9.6 },
  "Elite": { low: 12.0, avg: 13.5, high: 15.5, top10: 14.5 },
  "Xcel Bronze": { low: 7.0, avg: 8.0, high: 9.5, top10: 9.0 },
  "Xcel Silver": { low: 7.5, avg: 8.3, high: 9.5, top10: 9.1 },
  "Xcel Gold": { low: 7.5, avg: 8.5, high: 9.6, top10: 9.3 },
  "Xcel Platinum": { low: 7.5, avg: 8.7, high: 9.7, top10: 9.4 },
  "Xcel Diamond": { low: 7.5, avg: 8.8, high: 9.7, top10: 9.5 },
  "Xcel Sapphire": { low: 7.5, avg: 8.9, high: 9.8, top10: 9.5 },
};

// ─── LEVEL SKILLS REQUIRED ───────────────────────────────────────
export const LEVEL_SKILLS = {
  "Level 1": { vault: "Straight jump off springboard", bars: "Pullover, back hip circle", beam: "Walks, relevé, stretch jump", floor: "Forward roll, backward roll, cartwheel" },
  "Level 2": { vault: "Straight jump to flat back on mats", bars: "Pullover, back hip circle, underswing dismount", beam: "Walks, arabesque, cartwheel", floor: "Handstand, bridge, round-off" },
  "Level 3": { vault: "Handstand flat back on mats", bars: "Pullover, cast, back hip circle, underswing dismount", beam: "Leap, relevé turn, cartwheel", floor: "Handstand forward roll, round-off, backward roll to push-up" },
  "Level 4": { vault: "Handstand flat back onto mats", bars: "Kip (attempt), cast, back hip circle, underswing dismount", beam: "Cartwheel, full turn, split jump, straight jump dismount", floor: "Round-off back handspring, front limber, full turn" },
  "Level 5": { vault: "Handspring over vault", bars: "Kip, cast to horizontal+, back hip circle, squat-on, underswing dismount or flyaway", beam: "Back walkover, split leap 120°+, full turn, cartwheel/BHS dismount", floor: "Round-off BHS back tuck, front handspring, straddle jump, full turn" },
  "Level 6": { vault: "Handspring vault", bars: "Kip, cast to 45° above horizontal, any B circling skill, underswing/flyaway dismount", beam: "B acro skill, 150°+ leap/jump, full turn, B dismount", floor: "B tumbling pass, 150°+ leap, full turn, B second pass" },
  "Level 7": { vault: "Handspring vault (higher amplitude required)", bars: "Kip, cast to handstand, B+ circling/release, flyaway or better dismount", beam: "B acro series (2 skills), 150°+ split leap, full turn, C dismount", floor: "B+B tumbling, 180° split leap, 1.5 turn, 2 tumbling passes" },
  "Level 8": { vault: "Yurchenko or Tsukahara entry vaults", bars: "Cast handstand, B release or pirouette, C dismount", beam: "Acro series w/ flight, 180° leap, full turn, C dismount", floor: "C tumbling, dance series w/ 180° split, 3+ saltos, C final pass" },
  "Level 9": { vault: "Yurchenko layout or higher", bars: "Cast handstand, C release/pirouette, D dismount", beam: "Flight acro series, 180° split leap, 1+ turn, C+ dismount", floor: "D tumbling pass, 180° leap series, multiple saltos, C+ final" },
  "Level 10": { vault: "Yurchenko full or higher (D+ value)", bars: "D+ skills, release + pirouette, D/E dismount", beam: "C+C acro series, dance series, D+ dismount", floor: "D+ tumbling, E connections, 3 saltos min, D+ final pass" },
  "Xcel Bronze": { vault: "Run, hurdle, jump to land on mat", bars: "Pullover, cast, back hip circle", beam: "Mount, walks, jumps, stretch jump off", floor: "Forward roll, cartwheel, bridge, stretch jump" },
  "Xcel Silver": { vault: "Handspring to mat stack", bars: "Pullover, cast, back hip circle, dismount", beam: "Mount, leap, turn, cartwheel, jump off", floor: "Round-off, handstand, backward roll, leap" },
  "Xcel Gold": { vault: "Handspring vault", bars: "Kip, cast, back hip circle, A+B skills, dismount", beam: "Acro skill, 120°+ leap, turn, dismount", floor: "Round-off BHS, leap/jump, turn, second pass" },
  "Xcel Platinum": { vault: "Handspring or Tsukahara", bars: "B circling, cast horizontal+, B release/dismount", beam: "B acro, 150°+ leap, full turn, B dismount", floor: "B tumbling pass, 150°+ leap, turn, B second pass" },
  "Xcel Diamond": { vault: "Yurchenko or Tsukahara", bars: "Cast handstand, C skill, C dismount", beam: "Acro series, 180° leap, C dismount", floor: "C tumbling, 180° dance series, C final pass" },
  "Xcel Sapphire": { vault: "Yurchenko layout+", bars: "D release/pirouette, D dismount", beam: "Flight series, D acro/dismount", floor: "D tumbling, 180° dance, D final pass" },
};

// ─── PARENT TIPS ─────────────────────────────────────────────────
export const PARENT_TIPS = [
  "A 9.0 at Level 5 is a really strong score! The maximum is 10.0 and typical scores range from 7.5 to 9.5.",
  "Judges deduct for bent knees, flexed feet, and steps on landings. Even 0.05 per skill adds up across a full routine.",
  "At compulsory levels (1-5), every gymnast performs the exact same routine. The score reflects how precisely they match the required choreography.",
  "A 'stuck' landing (no steps) is one of the most impressive things to watch for. Extra steps cost 0.05-0.30 each.",
  "Artistry counts! On beam and floor, judges score confidence, expression, and musicality — not just the tricks.",
  "The split leap is one of the most common deduction areas. Most gymnasts lose 0.10-0.20 on insufficient split angle.",
  "Flexed feet (not pointed toes) is the single most common deduction in all of gymnastics. It happens on EVERY skill.",
  "A score of 8.5 is average, 9.0+ is strong, and 9.5+ is exceptional at most levels.",
  "Don't compare your child's score to other levels — a 9.0 at Level 7 is very different from a 9.0 at Level 4.",
  "Mental preparation is huge. The car ride to the gym is a great time for visualization and positive affirmations.",
  "Recovery matters as much as training. Make sure your gymnast gets 9+ hours of sleep before competition days.",
  "Proper nutrition before a meet: complex carbs + lean protein 2-3 hours before, light snack 30-60 min before.",
];

// ─── EVENT-SPECIFIC JUDGING RULES ──────────────────────────────────
// These rules teach the AI to judge each apparatus with proper strictness.
// Bars/beam/vault have specific physics that require different judging logic than floor.
export const EVENT_JUDGING_RULES = {
  "Uneven Bars": {
    strictnessBias: 1.3, // Multiply deduction confidence by this — bars deductions are commonly under-counted
    compoundRules: [
      "COMPOUND RULE: If a cast is below horizontal, AUTOMATICALLY flag the following circling skill for momentum loss (-0.05 to -0.10 additional).",
      "COMPOUND RULE: If a kip shows bent arms, the subsequent cast will likely be low — check both and deduct both independently.",
      "COMPOUND RULE: Any pause >0.5 seconds on the bar is a RHYTHM deduction (-0.10 to -0.20), not 'preparation'.",
    ],
    hiddenDeductions: [
      "HIDDEN: Shoulder angle — if shoulders dip below bar height during cast support, -0.05 to -0.10.",
      "HIDDEN: Grip adjustments — each hand re-grip on the bar is -0.05 for rhythm break.",
      "HIDDEN: Head position — chin must be neutral during circles. Tucked chin = -0.05, extended = -0.05.",
      "HIDDEN: Leg tension — legs can appear 'straight' but not LOCKED. Any softness in the knee = -0.05.",
      "HIDDEN: Toe point in circling skills — feet must be pointed throughout every rotation. Flexed = -0.05 per skill.",
      "HIDDEN: Cast height — if hips don't reach bar height, -0.10 to -0.30 depending on shortfall.",
      "HIDDEN: Extra swing (pump) before a skill = -0.10 to -0.30.",
    ],
    perspectiveBias: "WARNING: Camera angle affects bar skill perception. If the camera is not perfectly side-on, cast angles may appear higher than reality. When in doubt about cast height, assume it is LOWER than it appears and deduct accordingly.",
    rhythmJudging: "Bars are judged on FLOW. The routine should move continuously from one skill to the next. Any pause, hesitation, or 'setting up' between skills is a rhythm deduction. Total rhythm deductions on a typical youth routine: 0.10-0.30.",
    specialRequirements: {
      "Xcel Gold": [
        "One skill to horizontal or above (cast or clear hip)",
        "Two 360° circling skills (back hip circle, clear hip, etc.)",
        "Dismount (flyaway or underswing to land)",
        "Missing any SR = -0.50 from Start Value"
      ],
      "Xcel Platinum": [
        "Cast to horizontal or above",
        "B-value circling skill",
        "B-value release OR dismount",
        "Missing any SR = -0.50 from Start Value"
      ],
      "Xcel Diamond": [
        "Cast to handstand (within 10° of vertical)",
        "C-value skill",
        "C-value dismount",
        "Missing any SR = -0.50 from Start Value"
      ],
      "Level 5": [
        "Kip",
        "Cast to horizontal or above",
        "Back hip circle",
        "Squat-on or squat-through",
        "Underswing dismount or flyaway"
      ],
      "Level 6": [
        "Kip",
        "Cast to 45° above horizontal",
        "B-value circling skill",
        "Underswing or flyaway dismount"
      ],
      "Level 7": [
        "Kip",
        "Cast to handstand",
        "B+ circling or release move",
        "Flyaway or better dismount"
      ],
      "Level 8": [
        "Cast to handstand",
        "B release or pirouette",
        "C dismount"
      ],
      "Level 9": [
        "Cast to handstand",
        "C release or pirouette",
        "D dismount"
      ],
      "Level 10": [
        "D+ skills",
        "Release + pirouette combination",
        "D/E dismount"
      ]
    },
    typicalDeductionRange: { min: 0.90, max: 1.50, note: "Bars routines typically have MORE deductions than floor due to compounding. If total < 0.90, you are missing deductions." },
  },

  "Balance Beam": {
    strictnessBias: 1.2,
    compoundRules: [
      "COMPOUND RULE: Any wobble or balance check after a skill = -0.10 to -0.30 IN ADDITION to skill execution deductions.",
      "COMPOUND RULE: If a gymnast touches the beam with hands to maintain balance = -0.50 (grasp).",
      "COMPOUND RULE: Pauses longer than 2 seconds between skills = -0.10 rhythm deduction.",
    ],
    hiddenDeductions: [
      "HIDDEN: Foot placement — feet must be on the beam in relevé or flat. Any sideways foot placement = -0.05.",
      "HIDDEN: Balance checks — arms waving, torso adjusting, extra step to maintain balance = -0.10 to -0.30 each.",
      "HIDDEN: Beam mount — if the gymnast hesitates, needs multiple attempts, or uses poor form = -0.05 to -0.20.",
      "HIDDEN: Turns — weight must stay centered over support foot. Any travel during turn = -0.05 to -0.10.",
      "HIDDEN: Eye focus — looking down at the beam during skills = -0.05 (lack of confidence).",
      "HIDDEN: Pace — beam routine should have even tempo. Rushing or stalling = -0.05 to -0.10.",
      "HIDDEN: Squat position before acro skills (preparatory squat) = -0.10 if below 90°.",
    ],
    perspectiveBias: "WARNING: Beam width is 4 inches (10cm). What looks like 'centered' foot placement from a distance may actually be off-center. When evaluating foot placement and balance, be strict.",
    rhythmJudging: "Beam is judged on CONFIDENCE and FLOW. Hesitations, extra steps, and balance checks all indicate lack of confidence. Even if the gymnast doesn't fall, wobbles and checks add up quickly. Typical balance check deductions: 0.10-0.40 total.",
    specialRequirements: {
      "Xcel Gold": [
        "One acro skill (cartwheel, back walkover, etc.)",
        "Leap or jump with 120°+ split",
        "Full turn (360°) on one foot",
        "Dismount from the beam"
      ],
      "Level 5": [
        "Back walkover or back handspring",
        "Split leap 120°+",
        "Full turn (360°) on one foot",
        "Cartwheel or BHS dismount"
      ],
      "Level 6": [
        "B-value acro skill",
        "150°+ leap or jump",
        "Full turn",
        "B-value dismount"
      ],
      "Level 7": [
        "B acro series (2 connected acro skills)",
        "150°+ split leap",
        "Full turn",
        "C dismount"
      ],
      "Level 8": [
        "Acro series with flight element",
        "180° split leap",
        "Full turn",
        "C dismount"
      ],
      "Level 9": [
        "Flight acro series",
        "180° split leap",
        "1+ full turn",
        "C+ dismount"
      ],
      "Level 10": [
        "C+C acro series",
        "Dance series",
        "D+ dismount"
      ]
    },
    typicalDeductionRange: { min: 0.90, max: 1.60, note: "Beam has the highest deduction totals due to balance checks. If total < 0.90, you are missing balance checks and foot placement errors." },
  },

  "Floor Exercise": {
    strictnessBias: 1.0, // Floor is baseline — AI performs well here
    compoundRules: [
      "COMPOUND RULE: Out-of-bounds (foot on or over the line) = -0.10 neutral deduction per occurrence. Check EVERY pass landing.",
      "COMPOUND RULE: If the gymnast takes 3+ steps on a landing, that is a LARGE step deduction (-0.20-0.30), not three small steps.",
    ],
    hiddenDeductions: [
      "HIDDEN: Flexed feet throughout transitions and dance = -0.05 per occurrence (cumulative, often 0.10-0.20 total).",
      "HIDDEN: Hollow hands / limp wrists in arm movements = -0.05 per occurrence.",
      "HIDDEN: Energy drops between passes — standing still or low energy = -0.05 to -0.10.",
      "HIDDEN: Rushed choreography — dancing too fast without musicality = -0.05 to -0.10.",
      "HIDDEN: Not using full floor space — staying in center = -0.05.",
    ],
    perspectiveBias: null,
    rhythmJudging: "Floor is judged on MUSICALITY and PERFORMANCE QUALITY. The gymnast should match the music's rhythm, express emotion, and fill the floor space. Artistry deductions typically total 0.15-0.35 for youth routines.",
    specialRequirements: {
      "Xcel Gold": [
        "Two tumbling passes (one with two flight elements: RO+BHS or similar)",
        "Dance passage with leap/jump (120°+ split)",
        "Full turn (360°) on one foot",
        "Second acro pass"
      ],
      "Level 5": [
        "Round-off BHS back tuck",
        "Front handspring",
        "Straddle jump or split leap",
        "Full turn (360°)"
      ],
      "Level 6": [
        "B-value tumbling pass",
        "150°+ leap or jump",
        "Full turn",
        "B-value second pass"
      ],
      "Level 7": [
        "B+B tumbling connection",
        "180° split leap",
        "1.5 turn",
        "2 tumbling passes"
      ],
      "Level 8": [
        "C tumbling skill",
        "Dance series with 180° split",
        "3+ saltos total",
        "C-value final pass"
      ]
    },
    typicalDeductionRange: { min: 0.80, max: 1.30, note: "Floor is the baseline apparatus. Deductions are relatively straightforward." },
  },

  "Vault": {
    strictnessBias: 1.1,
    compoundRules: [
      "COMPOUND RULE: Vault is ONE skill — but has distinct phases: run, hurdle, board contact, pre-flight, table contact, post-flight, landing. Deduct each phase independently.",
      "COMPOUND RULE: If pre-flight is too low or flat, the ENTIRE vault will have reduced post-flight. Deduct for BOTH low pre-flight AND short post-flight.",
      "COMPOUND RULE: Distance from the table on landing matters. Landing too close to the table = -0.10 to -0.30.",
    ],
    hiddenDeductions: [
      "HIDDEN: Run speed — hesitation or deceleration in the run = -0.10 (poor confidence).",
      "HIDDEN: Hurdle — improper arm swing or timing = -0.05 to -0.10.",
      "HIDDEN: Shoulder angle on table — shoulders should be OVER or PAST the hands. If behind = -0.10 to -0.20.",
      "HIDDEN: Body position in post-flight — any deviation from declared position (tuck/pike/layout) = -0.10 to -0.30.",
      "HIDDEN: Landing distance — must land at least body-length from the table. Close landing = -0.10 to -0.30.",
      "HIDDEN: Direction — vault should travel straight. Any lateral deviation = -0.05 to -0.10.",
    ],
    perspectiveBias: "WARNING: Side-on view is essential for vault. If the camera is behind the gymnast, pre-flight and post-flight angles cannot be accurately assessed. Note any perspective limitations.",
    rhythmJudging: null,
    specialRequirements: {
      "Xcel Gold": ["Handspring vault (must achieve brief flight in post-flight)"],
      "Level 5": ["Handspring over vault table"],
      "Level 6": ["Handspring vault (higher amplitude)"],
      "Level 7": ["Handspring vault with good amplitude and distance"],
      "Level 8": ["Yurchenko or Tsukahara entry vault"],
      "Level 9": ["Yurchenko layout or higher"],
      "Level 10": ["Yurchenko full or higher (D+ value)"]
    },
    typicalDeductionRange: { min: 0.30, max: 1.00, note: "Vault is a single skill — lower total deductions but each fault matters more." },
  },

  // ─── MEN'S EVENTS ──────────────────────────────────────────────────
  "Pommel Horse": {
    strictnessBias: 1.3,
    compoundRules: [
      "COMPOUND RULE: Any stop of swing = -0.30 to -0.50. Pommel horse is CONTINUOUS circular motion.",
      "COMPOUND RULE: If legs touch the horse (hit) = -0.30 per occurrence.",
      "COMPOUND RULE: Support on one pommel too long = -0.10 (rhythm break).",
    ],
    hiddenDeductions: [
      "HIDDEN: Leg separation during circles = -0.10 to -0.20 per circle.",
      "HIDDEN: Bent arms during support = -0.10 to -0.30.",
      "HIDDEN: Body not horizontal during circles = -0.10 to -0.20.",
      "HIDDEN: Insufficient travel (not moving across full horse) = -0.10.",
    ],
    perspectiveBias: "WARNING: Pommel horse requires side-on view. End-on view makes leg separation invisible.",
    rhythmJudging: "Pommel horse is ALL about rhythm and flow. The routine should be continuous circular swings without pause. Any break = major deduction.",
    specialRequirements: {},
    typicalDeductionRange: { min: 0.80, max: 1.50, note: "Pommel horse is the most deduction-heavy men's event." },
  },

  "Still Rings": {
    strictnessBias: 1.2,
    compoundRules: [
      "COMPOUND RULE: Ring cables must remain STILL. Any swing of the cables = -0.10 to -0.30.",
      "COMPOUND RULE: Strength holds must be held 2 full seconds. Less than 2 seconds = -0.30 (not counted as hold).",
    ],
    hiddenDeductions: [
      "HIDDEN: Ring instability (wobble) = -0.05 to -0.10.",
      "HIDDEN: Insufficient hold duration = -0.30.",
      "HIDDEN: Body position deviation in holds (bent arms, pike) = -0.10 to -0.30.",
      "HIDDEN: Shoulder extension in handstand = -0.10.",
    ],
    perspectiveBias: null,
    rhythmJudging: "Rings combine swing and strength. Transitions between swing and hold should be smooth and controlled.",
    specialRequirements: {},
    typicalDeductionRange: { min: 0.70, max: 1.30, note: "Rings deductions come from hold duration and cable swing." },
  },

  "Parallel Bars": {
    strictnessBias: 1.2,
    compoundRules: [
      "COMPOUND RULE: Support swings must reach horizontal. Below horizontal = -0.10 to -0.30.",
      "COMPOUND RULE: Bent arms in any support position = -0.10 to -0.30.",
    ],
    hiddenDeductions: [
      "HIDDEN: Insufficient swing height = -0.10 to -0.30.",
      "HIDDEN: Bent arms in handstand = -0.10 to -0.20.",
      "HIDDEN: Body alignment — pike or arch in swing = -0.10 to -0.20.",
      "HIDDEN: Pause between elements = -0.10 rhythm break.",
    ],
    perspectiveBias: "WARNING: Side-on view essential for parallel bars to judge swing height.",
    rhythmJudging: "P-bars should flow with continuous swings. Stops or extra swings between skills = rhythm deduction.",
    specialRequirements: {},
    typicalDeductionRange: { min: 0.80, max: 1.40, note: "Parallel bars deductions focus on swing height and arm straightness." },
  },

  "High Bar": {
    strictnessBias: 1.3,
    compoundRules: [
      "COMPOUND RULE: Giants must pass through vertical handstand. Short of handstand = -0.10 to -0.30.",
      "COMPOUND RULE: Release moves — if catch is late or grip adjustment needed after = -0.10.",
      "COMPOUND RULE: Extra giant swings between skills (setup swings) = -0.10 each.",
    ],
    hiddenDeductions: [
      "HIDDEN: Bent arms in giants = -0.10 to -0.20.",
      "HIDDEN: Body shape — pike or arch deviations = -0.10 to -0.20.",
      "HIDDEN: Distance from bar during flight = important for release difficulty.",
      "HIDDEN: Grip changes — re-gripping = -0.05.",
    ],
    perspectiveBias: "WARNING: High bar shares the same perspective challenges as uneven bars. Side-on view is critical for handstand position verification.",
    rhythmJudging: "High bar is judged on continuous swing and flow. Extra swings and pauses = major deductions.",
    specialRequirements: {},
    typicalDeductionRange: { min: 0.80, max: 1.40, note: "High bar deductions focus on giant form and release execution." },
  },
};
