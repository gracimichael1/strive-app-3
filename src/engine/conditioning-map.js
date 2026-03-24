/**
 * conditioning-map.js — Maps deduction types to conditioning exercises.
 * Deterministic — no AI call. Used by Mastermind engine.
 */

export const CONDITIONING_MAP = {
  bent_knees: { muscle: 'Quads + Hamstrings', exercise: 'Wall sits + terminal knee extensions', sets: '3 x 30 seconds', cue: 'Squeeze — don\'t just flex', why: 'Builds the tension needed to lock out in flight' },
  flexed_feet: { muscle: 'Ankle + Foot', exercise: 'Theraband circles + releve holds', sets: '3 x 20 reps', cue: 'Point through the heel, not just the toe', why: 'Extends the line judges deduct for' },
  low_cast: { muscle: 'Shoulders + Lats', exercise: 'Hollow body holds + banded lat pull-throughs', sets: '3 x 20 seconds', cue: 'Press the floor away', why: 'Builds the push needed for horizontal cast' },
  early_pike: { muscle: 'Hip Flexors + Core', exercise: 'Arch body holds + tuck jumps', sets: '3 x 15 seconds', cue: 'Stay long until peak', why: 'Prevents premature breaking of body line' },
  hip_angle: { muscle: 'Core + Hip Flexors', exercise: 'L-sits + hanging knee raises', sets: '3 x 20 seconds', cue: 'Rib cage down — no banana back', why: 'Controls the angles that create deductions on beam and bars' },
  short_handstand: { muscle: 'Shoulders + Serratus', exercise: 'Pike handstand push-up negatives + wall walks', sets: '3 x 5 reps', cue: 'Push the floor — don\'t just hold it', why: 'Essential for bars and beam bonus elements at Level 7+' },
  balance_breaks: { muscle: 'Proprioception + Ankle Stability', exercise: 'Single-leg balance progressions on folded mat', sets: '3 x 30 seconds each leg', cue: 'Find stillness before you move', why: 'Beam execution score depends on this' },
  leg_separation: { muscle: 'Hip Adductors + Core', exercise: 'Pilates leg squeeze + plie squats', sets: '3 x 15 reps', cue: 'Zip from the ankles up', why: 'Judges deduct for any visible gap in flight' },
  arm_position: { muscle: 'Rotator Cuff + Mid-Back', exercise: 'Band pull-aparts + face pulls', sets: '3 x 20 reps', cue: 'Shoulder blades down and back before you move', why: 'Arm form deductions are among the most frequent in floor and beam' },
  landing_form: { muscle: 'Glutes + Ankle Stabilizers', exercise: 'Box jumps with controlled landing + single-leg RDL', sets: '3 x 8 reps', cue: 'Land quiet — absorb, don\'t crash', why: 'Stuck landings add up to 0.10+ per element' },
  head_position: { muscle: 'Deep Neck Flexors', exercise: 'Chin tucks + wall angels', sets: '2 x 15 reps', cue: 'Tall through the crown, not the chin', why: 'Head position affects whole-body line judges evaluate' },
  rhythm_break: { muscle: 'Timing + Proprioception', exercise: 'Metronome drills — handstand holds to counts', sets: '5 x 8-count holds', cue: 'Let the rhythm lead, not chase it', why: 'Rhythm deductions often come from rushing connections' },
  arch_body: { muscle: 'Core + Glutes', exercise: 'Hollow body holds + plank progressions', sets: '3 x 20 seconds', cue: 'Posterior pelvic tilt — tuck the tailbone', why: 'Arched body deducts on every element it appears in' },
  toe_point: { muscle: 'Intrinsic Foot + Calf', exercise: 'Towel scrunches + standing calf raises on edge', sets: '3 x 20 reps', cue: 'Point from the ankle, not the knee', why: 'Toe point is evaluated on every skill in every event' },
  connection_deduction: { muscle: 'Conditioning + Timing', exercise: 'Skill-to-skill connection drills at reduced difficulty', sets: '5 x full connection attempt', cue: 'Commit to the exit before you land', why: 'Connection deductions are preventable with rehearsal' },
  fall: { muscle: 'Balance + Mental Reset', exercise: 'Repeated single-skill focus + controlled remount drill', sets: '10 x isolated skill attempt', cue: 'One skill at a time. Each rep is new.', why: 'Fall deductions are 0.50 — removing one fall is the single biggest score gain available' },
  artistry: { muscle: 'Body Awareness + Expression', exercise: 'Mirror work + dance conditioning 10 min/day', sets: 'Daily', cue: 'Every transition is part of the routine', why: 'Artistry deductions are small individually but compound across a floor set' },
  jump_height: { muscle: 'Glutes + Quads + Calves', exercise: 'Depth jumps + squat jumps', sets: '3 x 8 reps', cue: 'Drive through the floor, not off it', why: 'Jump height is explicitly scored in beam and floor leaps' },
  split_angle: { muscle: 'Hip Flexors + Hamstrings', exercise: 'Active split stretching + oversplit holds', sets: '3 x 30 second holds', cue: 'Active flexibility — not passive collapse', why: 'Split angle is measured — below 180 degrees deducts' },
  // ── Bars-specific entries (NAWGJ deduction categories) ─────────────────
  kip_mount: { muscle: 'Hip Flexors + Lats + Core', exercise: 'Kip drills on low bar + hollow body holds', sets: '4 x 10 reps', cue: 'Toes to bar, then snap to support — no pike in the middle', why: 'Kip mount requires rapid hip flexion followed by lat depression. Hip flexor strength and lat timing directly affect clean kip execution.' },
  lb_cast: { muscle: 'Shoulders + Core + Lats', exercise: 'Pike compression on floor + cast handstand drills on low bar', sets: '3 x 8 reps', cue: 'Hollow snap — shoulders over the bar before you push', why: 'Low bar cast deductions come from insufficient shoulder angle and early pike.' },
  long_hang_kip: { muscle: 'Lats + Hip Flexors + Grip', exercise: 'Long hang hollow swings + kip pulls on stall bar', sets: '4 x 8 reps', cue: 'Stay patient — extend before you pull', why: 'Long hang kip requires full extension before the pull phase. Rushing creates pike and swing deductions.' },
  hb_cast: { muscle: 'Shoulders + Serratus Anterior', exercise: 'Cast handstand drills on high bar + deficit push-ups', sets: '3 x 6 reps', cue: 'Lean over the bar, then push away', why: 'High bar cast requires aggressive shoulder lean and push. Insufficient angle = deduction.' },
  back_hip_circle: { muscle: 'Core + Hip Flexors + Forearms', exercise: 'Front support hip touches + slow back hip circle drills', sets: '4 x 6 reps', cue: 'Stay tight to the bar — no gap between hips and rail', why: 'Gap between body and bar during back hip circle is the primary deduction source.' },
  bp_first_counter: { muscle: 'Core + Shoulders + Wrists', exercise: 'Counter swing drills + cast snap exercises', sets: '3 x 8 reps', cue: 'Push and snap — aggressive shoulder change', why: 'First counter requires precise timing of shoulder angle change with hip snap.' },
  bp_second_counter: { muscle: 'Core + Lats + Timing', exercise: 'Second counter isolation drills + tap swing series', sets: '3 x 8 reps', cue: 'Reach for the ceiling at the top of the swing', why: 'Second counter deductions often come from insufficient height or early tap.' },
  extra_swing: { muscle: 'Core + Proprioception', exercise: 'Dead hang holds + body tension swing stops', sets: '3 x 10 seconds', cue: 'Control the stop — don\'t let momentum win', why: 'Extra swings are a 0.10-0.30 deduction per occurrence. Body tension eliminates them.' },

  // ── Beam-specific entries ─────────────────────────────────────────────
  surene: { muscle: 'Ankle + Calf + Balance', exercise: 'Releve walks on beam (low) + single-leg releve holds', sets: '3 x 8 steps each side', cue: 'Rise high and slow — control the transition', why: 'Surene (relevé walk) deductions come from insufficient height and wobble.' },
  balance_errors: { muscle: 'Ankle Stabilizers + Core + Vestibular', exercise: 'Eyes-closed single-leg stands + BOSU balance work', sets: '3 x 30 seconds each leg', cue: 'Micro-adjust from the ankle, not the arms', why: 'Balance errors (wobbles, arm waves) are the most frequent beam deduction category.' },
  cartwheel_beam: { muscle: 'Shoulders + Core + Hip Flexibility', exercise: 'Cartwheel on line → low beam → high beam progression', sets: '5 x each surface', cue: 'Hands go straight, hips go over — don\'t twist early', why: 'Cartwheel deductions on beam come from hand placement, hip alignment, and leg separation.' },
  half_turn: { muscle: 'Ankle + Core + Proprioception', exercise: 'Releve half-turn on floor line + eyes-spot drill', sets: '3 x 10 each direction', cue: 'Spot your mark — turn around your spine, not your feet', why: 'Half-turn deductions come from insufficient rotation, loss of releve, or balance check.' },
  jump_combination: { muscle: 'Quads + Calves + Timing', exercise: 'Jump-jump connection drills on floor → beam', sets: '4 x 5 combinations', cue: 'The first jump sets up the second — land to launch', why: 'Jump combination deductions come from pause between jumps or insufficient height on second.' },
  handstand_beam: { muscle: 'Shoulders + Core + Wrists', exercise: 'Wall handstand holds + kick-up-and-hold drills', sets: '3 x 15 second holds', cue: 'Lock out — if it\'s not vertical, it deducts', why: 'Beam handstand must be within 10° of vertical. Shoulder and core strength determine hold quality.' },
  scale_beam: { muscle: 'Hamstrings + Glutes + Lower Back', exercise: 'Standing scale holds + arabesque progressions', sets: '3 x 15 seconds each leg', cue: 'Lift from the heel, not the lower back', why: 'Scale deductions come from insufficient height of free leg and trunk dropping forward.' },
  leap_beam: { muscle: 'Hip Flexors + Hamstrings + Calves', exercise: 'Split leap drills with measured angle + hurdle practice', sets: '4 x 8 reps', cue: 'Drive the front knee up — the back leg follows', why: 'Leap must show 150°+ split. Active hip flexor strength determines split angle in air.' },

  // ── Vault-specific entries ────────────────────────────────────────────
  first_flight_body_position: { muscle: 'Core + Shoulders + Hip Flexors', exercise: 'Hurdle-to-board drills + pike snap on trampoline', sets: '4 x 6 reps', cue: 'Attack the board — stay tight through contact', why: 'First flight body position sets up the entire vault. Pike, arch, or head position here cascades.' },
  shoulder_angle_repulsion: { muscle: 'Shoulders + Triceps + Serratus', exercise: 'Handstand push-ups + overhead press + pike push-ups', sets: '3 x 8 reps', cue: 'Block through the shoulders — push the table away', why: 'Shoulder angle at repulsion determines post-flight height. Insufficient block = short vault.' },
  second_flight_body_position: { muscle: 'Core + Hip Flexors + Spatial Awareness', exercise: 'Back tuck off raised surface + layout drills', sets: '4 x 5 reps', cue: 'Find the ceiling before you find the floor', why: 'Second flight deductions come from body position (pike/arch) and insufficient height.' },
  angle_repulsion: { muscle: 'Shoulders + Core', exercise: 'Handstand snap-downs + block drills off springboard', sets: '3 x 8 reps', cue: 'Vertical through the shoulders at contact', why: 'Repulsion angle directly determines vault height and distance. Most common vault deduction.' },
  support_phase_too_long: { muscle: 'Explosive Power + Shoulders', exercise: 'Speed handstand pops + plyometric push-ups', sets: '3 x 10 reps', cue: 'Touch and go — fast hands, fast vault', why: 'Extended support phase on the table means insufficient speed and power. Deducts 0.10-0.30.' },

  default: { muscle: 'General Athletic Development', exercise: 'Core circuit — hollow, arch, plank, side plank', sets: '3 x 20 seconds each', cue: 'Quality over speed', why: 'Core stability underpins every gymnastics skill' },
};

export function getConditioning(deductionType) {
  const key = (deductionType || '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z_]/g, '');
  return CONDITIONING_MAP[key] || CONDITIONING_MAP.default;
}

export function matchDeductionToConditioning(deductionDescription) {
  if (!deductionDescription) return CONDITIONING_MAP['default'];

  const desc = deductionDescription.toLowerCase();

  // Direct key match first
  for (const key of Object.keys(CONDITIONING_MAP)) {
    if (key !== 'default' && desc.includes(key.replace(/_/g, ' '))) {
      return CONDITIONING_MAP[key];
    }
  }

  // Keyword fuzzy match
  const keywordMap = {
    'bent knee': 'bent_knees',
    'kip': 'kip_mount',
    'cast': 'lb_cast',
    'back hip': 'back_hip_circle',
    'handstand': 'handstand_beam',
    'leap': 'leap_beam',
    'cartwheel': 'cartwheel_beam',
    'turn': 'half_turn',
    'balance': 'balance_errors',
    'wobble': 'balance_errors',
    'scale': 'scale_beam',
    'vault': 'first_flight_body_position',
    'shoulder': 'shoulder_angle_repulsion',
    'repulsion': 'angle_repulsion',
    'block': 'shoulder_angle_repulsion',
    'flight': 'second_flight_body_position',
    'jump': 'jump_combination',
    'swing': 'extra_swing',
    'hollow': 'long_hang_kip',
    'counter': 'bp_first_counter',
    'pike': 'early_pike',
    'arch': 'arch_body',
    'split': 'split_angle',
    'flex': 'flexed_feet',
    'toe': 'toe_point',
    'land': 'landing_form',
    'step': 'landing_form',
    'fall': 'fall',
    'rhythm': 'rhythm_break',
    'surene': 'surene',
    'releve': 'surene',
    'support': 'support_phase_too_long',
  };

  for (const [keyword, mapKey] of Object.entries(keywordMap)) {
    if (desc.includes(keyword) && CONDITIONING_MAP[mapKey]) {
      return CONDITIONING_MAP[mapKey];
    }
  }

  return CONDITIONING_MAP['default'];
}
