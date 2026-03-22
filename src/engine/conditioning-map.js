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
  default: { muscle: 'General Athletic Development', exercise: 'Core circuit — hollow, arch, plank, side plank', sets: '3 x 20 seconds each', cue: 'Quality over speed', why: 'Core stability underpins every gymnastics skill' },
};

export function getConditioning(deductionType) {
  const key = (deductionType || '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z_]/g, '');
  return CONDITIONING_MAP[key] || CONDITIONING_MAP.default;
}
