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
