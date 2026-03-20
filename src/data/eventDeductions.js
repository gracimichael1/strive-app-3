/**
 * eventDeductions.js
 * Event-specific deduction rules and compound logic for the "Pessimistic Judge" prompt.
 * These are injected into the Gemini prompt based on the selected event.
 *
 * The AI scored floor within 0.10 of actual but missed bars by 1.0 point.
 * Root cause: bars have 3D orbital physics, compound deductions, rhythm penalties,
 * and occlusion issues that floor doesn't have.
 *
 * This file provides event-specific deduction tables so Gemini knows EXACTLY
 * what to look for on each apparatus.
 */

// ─── BARS (Uneven Bars) ─────────────────────────────────────────────────────
// This is where the AI fails most. Bars deductions are COMPOUND — a low cast
// causes momentum loss which causes a rhythm break on the next skill.
export const BARS_DEDUCTIONS = `
UNEVEN BARS — APPARATUS-SPECIFIC DEDUCTIONS (apply IN ADDITION to general execution faults):

CRITICAL: Bars is the hardest event to judge visually. You MUST actively hunt for these deductions.
When in doubt on bars, TAKE THE DEDUCTION. Err strict.

CAST DEDUCTIONS (judge EVERY cast):
  Cast below horizontal (hips below bar): -0.30
  Cast 15-30° below horizontal:           -0.20
  Cast 5-15° below horizontal:            -0.10
  Cast to horizontal (no deduction):       0.00
  NOTE: If camera angle makes cast height ambiguous, assume 10° below horizontal (-0.10).

KIP DEDUCTIONS:
  Bent arms during kip pull:               -0.10
  Shoulders behind bar at finish:          -0.05
  Excessive pike/open on glide:            -0.10
  Slow/labored kip (momentum loss):        -0.10

CIRCLING ELEMENT DEDUCTIONS (back hip circles, front hip circles, sole circles):
  Bent knees during circle:                -0.05 to -0.10 per circle
  Flexed feet during circle:               -0.10 per circle
  Legs apart during circle:                -0.10 per circle
  Body not tight against bar:              -0.05 to -0.10
  Head position error (chin not tucked):   -0.05

RHYTHM & FLOW (THE HIDDEN 0.30-0.50 that AI typically misses):
  Pause 0.5-1.0 seconds between skills:   -0.10
  Pause 1.0-2.0 seconds between skills:   -0.20
  Pause >2.0 seconds (major rhythm break): -0.30
  Extra swing/pump to build momentum:      -0.10 to -0.30
  Visible grip adjustment between skills:  -0.10
  Re-grasp or hand shift on bar:           -0.05 per occurrence
  NOTE: On bars, EVERY pause and adjustment is a deduction. Judges want continuous flow.

COMPOUND RULES (apply these in sequence):
  1. If a kip has bent arms → the following cast is LIKELY low. Verify and deduct both.
  2. If a cast is below horizontal → the gymnast lost momentum. Flag the NEXT skill for rhythm.
  3. If there are 2+ rhythm pauses → add -0.10 "overall flow" deduction.
  4. Count total grip adjustments. If 3+, add -0.10 composition deduction.

TRANSITION DEDUCTIONS (bar changes — low bar to high bar or reverse):
  Hit low bar with feet during transition:  -0.30 to -0.50
  Brush feet on bar:                        -0.10
  Extra swing before catching:              -0.10 to -0.20

DISMOUNT:
  Insufficient height off bar:              -0.10
  Distance too close to bar:                -0.10
  Landing deductions apply (steps, squat, fall)
  Under-rotation on salto:                  -0.10 to -0.30
  Over-rotation on salto:                   -0.10 to -0.20

TYPICAL BARS DEDUCTION TOTAL: 1.00-1.50 for a competent routine. If your total is below 0.80, you are MISSING deductions — re-examine casts, rhythm, and feet.`;

// ─── BEAM (Balance Beam) ────────────────────────────────────────────────────
export const BEAM_DEDUCTIONS = `
BALANCE BEAM — APPARATUS-SPECIFIC DEDUCTIONS (apply IN ADDITION to general execution faults):

BALANCE DEDUCTIONS (these accumulate fast — a typical beam routine has 3-6 balance checks):
  Slight wobble / arms move for balance:   -0.10
  Significant wobble / torso adjustment:   -0.20
  Large wobble / near fall:                -0.30
  Grasp beam with hands to stay on:        -0.50
  Fall from beam:                          -0.50 (plus loss of element value)
  NOTE: Count EVERY wobble. A typical Level 6-8 gymnast has 2-4 wobbles per routine = 0.20-0.80.

MOUNT DEDUCTIONS:
  Hesitation before mount:                 -0.05
  Extra support / adjustment on beam:      -0.10
  Bent arms on press/mount:                -0.10 to -0.20

ACRO ELEMENT DEDUCTIONS:
  Bent knees in walkover/handstand:        -0.05 to -0.20
  Legs apart in cartwheel/walkover:        -0.05 to -0.10
  Off-center on beam after acro:           -0.10
  Insufficient extension/amplitude:        -0.05 to -0.20
  Pause/hesitation before acro skill:      -0.10

DANCE ELEMENT DEDUCTIONS:
  Split leap/jump below required angle:    See split standard above
  Insufficient height on leaps/jumps:      -0.05 to -0.20
  Landing with feet offset on beam:        -0.05 to -0.10
  Rhythm break between dance elements:     -0.05 to -0.10

TURN DEDUCTIONS:
  Under-rotated turn (by 15-45°):          -0.10
  Under-rotated turn (by 45-90°):          -0.20
  Heel down during turn:                   -0.05
  Flat foot (not on relevé):               -0.10
  Loss of balance during turn:             -0.10 to -0.30

BEAM-SPECIFIC COMPOSITION:
  Failure to use full length of beam:      -0.10
  All elements performed in center:        -0.05
  No changes of direction:                 -0.05
  Lack of varied tempo:                    -0.05 to -0.10

DISMOUNT:
  Insufficient height:                     -0.10 to -0.20
  Insufficient distance from beam:         -0.10
  Landing deductions apply (steps, squat, fall)
  Under-rotation:                          -0.10 to -0.30

TYPICAL BEAM DEDUCTION TOTAL: 1.00-1.80 for a competent routine. Beam is the highest-deduction event due to balance checks. If total is below 0.80, you are MISSING wobbles.`;

// ─── FLOOR (Floor Exercise) ─────────────────────────────────────────────────
export const FLOOR_DEDUCTIONS = `
FLOOR EXERCISE — APPARATUS-SPECIFIC DEDUCTIONS (apply IN ADDITION to general execution faults):

TUMBLING PASS DEDUCTIONS:
  Insufficient height/amplitude:           -0.05 to -0.30
  Under-rotation (visible):               -0.10 to -0.30
  Over-rotation:                           -0.10 to -0.20
  Cowboy/leg separation in flight:         -0.10 to -0.20
  Bent knees in flight:                    -0.05 to -0.20
  Arms not set properly:                   -0.05 to -0.10
  Poor hand placement on floor:            -0.05 to -0.10

LANDING DEDUCTIONS (apply to FINAL element of each pass):
  Small hop/adjustment:                    -0.05
  Small step:                              -0.10
  Medium step:                             -0.15 to -0.20
  Large step or lunge:                     -0.20 to -0.30
  Deep squat (knees below 90°):            -0.30
  Hands on floor:                          -0.30
  Fall:                                    -0.50
  NOTE: Intermediate connections (RO→BHS) are transitional. Only deduct if clearly faulty.

OUT OF BOUNDS:
  One foot out:                            -0.10
  Both feet or body out:                   -0.30
  NOTE: Look at final tumbling pass landings — this is where OOB happens most.

DANCE ELEMENTS:
  Split leap/jump below angle requirement: See split standard
  Insufficient height on leaps:            -0.05 to -0.20
  Heavy/flat landing from leap:            -0.05 to -0.10
  Turn under-rotated:                      -0.10 to -0.20

ARTISTRY & PERFORMANCE (Floor-specific — these are REAL deductions):
  No musicality / movements don't match music: -0.10 to -0.20
  Flat footwork / no relevé in dance:          -0.05 to -0.10
  Hollow hands / limp wrists:                  -0.05 per occurrence
  No eye contact / no projection:              -0.05 to -0.10
  Energy drops between passes:                 -0.05 to -0.10
  Rushed choreography:                         -0.10
  Limited floor space usage:                   -0.05 to -0.10
  NOTE: Artistry deductions typically total 0.15-0.40 for youth. Zero artistry deductions = WRONG.

TYPICAL FLOOR DEDUCTION TOTAL: 0.80-1.30 for a competent routine. Floor is typically the lowest-deduction event.`;

// ─── VAULT ──────────────────────────────────────────────────────────────────
export const VAULT_DEDUCTIONS = `
VAULT — APPARATUS-SPECIFIC DEDUCTIONS:

VAULT IS SCORED IN THREE PHASES — deduct in each phase separately:

1. PRE-FLIGHT (board to table contact):
  Insufficient speed on run:                -0.10 to -0.30
  Poor hurdle mechanics:                    -0.05 to -0.10
  Bent arms on table contact:               -0.10 to -0.30
  Shoulders not open at contact:            -0.10 to -0.20
  Insufficient height at pre-flight:        -0.10 to -0.20
  Body angle (pike/arch) at contact:        -0.05 to -0.20

2. TABLE CONTACT (repulsion):
  Bent arms during push:                    -0.10 to -0.30
  Long contact (not explosive):             -0.10
  Shoulder angle closed:                    -0.10 to -0.20
  Hands not simultaneous:                   -0.05

3. POST-FLIGHT (table to landing):
  Insufficient height:                      -0.10 to -0.30
  Insufficient distance from table:         -0.10 to -0.20
  Body position faults (pike/arch/twist):   -0.05 to -0.30
  Insufficient rotation:                    -0.10 to -0.30
  Legs apart:                               -0.05 to -0.20
  Bent knees:                               -0.05 to -0.20

4. LANDING:
  Small hop:                                -0.05
  Small step:                               -0.10
  Large step/lunge:                         -0.20 to -0.30
  Deep squat:                               -0.30
  Fall:                                     -0.50
  Direction deviation:                      -0.10

TYPICAL VAULT DEDUCTION TOTAL: 0.50-1.20 for a competent vault. Vault has fewer elements so fewer places to deduct.`;

// ─── MEN'S EVENTS ───────────────────────────────────────────────────────────

export const POMMEL_HORSE_DEDUCTIONS = `
POMMEL HORSE — APPARATUS-SPECIFIC DEDUCTIONS:

CIRCLE DEDUCTIONS:
  Bent arms during circles:                 -0.10 to -0.30
  Bent hips (pike) during circles:          -0.10 to -0.20
  Legs apart/crossed during circles:        -0.10 to -0.20
  Circles not to horizontal:               -0.10 to -0.20
  Uneven circle height (one side lower):   -0.10
  Loss of rhythm/tempo:                    -0.10 to -0.20

SCISSOR DEDUCTIONS:
  Insufficient amplitude:                   -0.10 to -0.20
  Bent legs:                               -0.05 to -0.10
  Legs not above horizontal:               -0.10

TRAVEL DEDUCTIONS:
  Loss of rhythm during travel:            -0.10
  Extra support/stop during travel:        -0.20 to -0.30

DISMOUNT:
  Insufficient height:                     -0.10
  Landing deductions apply

FALLS/STOPS:
  Brush/touch pommel with thigh:           -0.10
  Stop on pommel:                          -0.30
  Fall:                                    -0.50

TYPICAL POMMEL DEDUCTION TOTAL: 1.00-2.00. Pommel is the hardest MAG event with highest deduction rates.`;

export const RINGS_DEDUCTIONS = `
STILL RINGS — APPARATUS-SPECIFIC DEDUCTIONS:

SWING DEDUCTIONS:
  Ring cables not still (swinging):        -0.10 to -0.30
  Body not fully extended in swing:        -0.10
  Bent arms in giant swings:               -0.10 to -0.20
  Legs apart during swing:                 -0.10

STRENGTH HOLD DEDUCTIONS:
  L-sit not at horizontal:                 -0.10 to -0.20
  Cross arms not horizontal:              -0.20 to -0.30
  Body shake/tremor in hold:               -0.10
  Hold less than 2 seconds:                -0.30
  Bent arms in support hold:               -0.10 to -0.20
  Rings turned in:                         -0.05

HANDSTAND DEDUCTIONS:
  Not vertical (deviation):                -0.10 to -0.20
  Excessive arch/pike:                     -0.10
  Ring cables moving:                      -0.10

DISMOUNT:
  Insufficient height:                     -0.10 to -0.20
  Under-rotation:                          -0.10 to -0.30
  Landing deductions apply

TYPICAL RINGS DEDUCTION TOTAL: 0.80-1.50. Watch for ring cable movement — it reveals instability.`;

export const PARALLEL_BARS_DEDUCTIONS = `
PARALLEL BARS — APPARATUS-SPECIFIC DEDUCTIONS:

SWING DEDUCTIONS:
  Insufficient amplitude in swings:        -0.10 to -0.20
  Bent arms in support swings:             -0.10 to -0.20
  Legs apart during swing:                 -0.10
  Pike/arch in body during swing:          -0.05 to -0.15

HANDSTAND DEDUCTIONS:
  Not vertical:                            -0.10 to -0.20
  Excessive hold time (momentum loss):     -0.10
  Bent arms:                               -0.10 to -0.20

RELEASE MOVES:
  Insufficient height above bars:          -0.10 to -0.20
  Bent body in flight:                     -0.10
  Landing off-center on bars:              -0.10

SUPPORT ELEMENTS:
  Bent arms in L-sit/V-sit:               -0.10
  Hold less than 2 seconds:                -0.30
  Body angle deviation:                    -0.10

DISMOUNT:
  Insufficient height:                     -0.10 to -0.20
  Under-rotation:                          -0.10 to -0.30
  Landing deductions apply

TYPICAL P-BARS DEDUCTION TOTAL: 0.80-1.40.`;

export const HIGH_BAR_DEDUCTIONS = `
HIGH BAR — APPARATUS-SPECIFIC DEDUCTIONS:

GIANT SWING DEDUCTIONS:
  Bent arms in giants:                     -0.10 to -0.20
  Pike/arch during giants:                 -0.05 to -0.15
  Legs apart:                              -0.10
  Not passing through vertical:            -0.10

RELEASE MOVE DEDUCTIONS:
  Insufficient height above bar:           -0.10 to -0.30
  Bent body in flight:                     -0.10 to -0.20
  Legs apart:                              -0.10
  Grasp/catch with bent arms:              -0.10
  Extra swing after catch:                 -0.10

PIROUETTE DEDUCTIONS:
  Not in handstand position:               -0.10 to -0.20
  Bent arms during pirouette:              -0.10
  Extra swing after pirouette:             -0.10

RHYTHM & FLOW (same as Uneven Bars):
  Pause between skills:                    -0.10 to -0.30
  Extra swing to build momentum:           -0.10 to -0.30
  Grip adjustment:                         -0.10

DISMOUNT:
  Insufficient height:                     -0.10 to -0.20
  Insufficient distance from bar:          -0.10
  Under-rotation:                          -0.10 to -0.30
  Landing deductions apply

TYPICAL HIGH BAR DEDUCTION TOTAL: 0.80-1.50. Flow and release moves are the main differentiators.`;

// ─── Event mapping helper ───────────────────────────────────────────────────

/**
 * Get the apparatus-specific deduction prompt section for a given event.
 * @param {string} event - Event name (e.g., "Uneven Bars", "Floor Exercise")
 * @returns {string} The deduction rules text to inject into the Gemini prompt
 */
export function getEventDeductions(event) {
  const e = (event || '').toLowerCase();
  if (e.includes('bar') && !e.includes('parallel') && !e.includes('high')) return BARS_DEDUCTIONS;
  if (e.includes('uneven')) return BARS_DEDUCTIONS;
  if (e.includes('beam')) return BEAM_DEDUCTIONS;
  if (e.includes('floor')) return FLOOR_DEDUCTIONS;
  if (e.includes('vault')) return VAULT_DEDUCTIONS;
  if (e.includes('pommel')) return POMMEL_HORSE_DEDUCTIONS;
  if (e.includes('ring')) return RINGS_DEDUCTIONS;
  if (e.includes('parallel')) return PARALLEL_BARS_DEDUCTIONS;
  if (e.includes('high bar')) return HIGH_BAR_DEDUCTIONS;
  // Default: return floor (most common, safest fallback)
  return FLOOR_DEDUCTIONS;
}

/**
 * Get the strictness calibration for an event.
 * Some events need higher strictness multipliers because the AI
 * systematically under-deducts on them.
 */
export function getEventStrictnessGuidance(event) {
  const e = (event || '').toLowerCase();

  if (e.includes('bar') || e.includes('uneven') || e.includes('high bar')) {
    return `
STRICTNESS OVERRIDE FOR BARS:
- Bars is where AI scoring is LEAST accurate. Default to STRICT.
- If you cannot clearly see that a cast reaches horizontal, deduct -0.10.
- Count every pause, every grip adjustment, every rhythm break.
- Typical bars total deductions: 1.00-1.50. Below 0.80 means you are too lenient.
- The "flow" score matters: a routine with 3+ pauses should have 0.30+ in rhythm deductions alone.
- COMPOUND CHECK: After identifying all skills, re-read the routine looking ONLY for pauses and rhythm breaks you might have missed.`;
  }

  if (e.includes('beam')) {
    return `
STRICTNESS OVERRIDE FOR BEAM:
- Count EVERY wobble and balance check. Most gymnasts have 2-5 per routine.
- A routine with zero balance deductions is almost certainly wrong.
- Check landings on beam after acro and dance elements — feet offset is -0.05.
- Typical beam total deductions: 1.00-1.80. Below 0.80 means you missed wobbles.`;
  }

  if (e.includes('pommel')) {
    return `
STRICTNESS OVERRIDE FOR POMMEL HORSE:
- Pommel horse has the highest deduction rates in gymnastics.
- Watch for bent hips, legs apart, and uneven circle height on EVERY circle.
- Typical pommel total deductions: 1.00-2.00.`;
  }

  // Floor and vault have adequate default strictness
  return '';
}

/**
 * Format MediaPipe biomechanics data as a text block for injection into the Gemini prompt.
 * This gives Gemini mathematical angle data instead of relying on visual estimation.
 *
 * @param {Array} skillAnalysis - Array of skill analysis objects from analysisPipeline
 * @returns {string} Formatted text block
 */
export function formatBiomechanicsForPrompt(skillAnalysis) {
  if (!skillAnalysis || skillAnalysis.length === 0) return '';

  const lines = ['MEDIAPIPE POSE DATA — Use these measured angles to verify your visual assessment:'];
  lines.push('(If MediaPipe angles disagree with your visual assessment, trust the STRICTER interpretation)');
  lines.push('');

  for (const skill of skillAnalysis) {
    const bio = skill.biomechanics;
    if (!bio) continue;

    const time = typeof skill.start === 'number'
      ? `${Math.floor(skill.start / 60)}:${String(Math.floor(skill.start % 60)).padStart(2, '0')}`
      : '?:??';

    lines.push(`Skill at ${time} (${skill.skillName || 'detected motion'}):`);

    if (bio.peak) {
      const p = bio.peak;
      if (p.kneeAngle !== null) lines.push(`  Peak knee angle: ${Math.round(p.kneeAngle)}° ${p.kneeAngle < 160 ? '⚠ BENT' : '(OK)'}`);
      if (p.hipAngle !== null) lines.push(`  Peak hip angle: ${Math.round(p.hipAngle)}° ${p.hipAngle < 155 ? '⚠ PIKED' : '(OK)'}`);
      if (p.shoulderAngle !== null) lines.push(`  Shoulder angle: ${Math.round(p.shoulderAngle)}°`);
      if (p.elbowAngle !== null) lines.push(`  Elbow angle: ${Math.round(p.elbowAngle)}° ${p.elbowAngle < 160 ? '⚠ BENT ARMS' : '(OK)'}`);
      if (p.legSep > 0.04) lines.push(`  Leg separation: ${(p.legSep * 100).toFixed(0)}% ⚠ LEGS APART`);
    }

    if (bio.landing) {
      const l = bio.landing;
      if (l.kneeAngle !== null) lines.push(`  Landing knee angle: ${Math.round(l.kneeAngle)}° ${l.kneeAngle < 130 ? '⚠ DEEP SQUAT' : l.kneeAngle < 150 ? '⚠ SQUAT' : '(OK)'}`);
      if (l.bodyLineDev > 0.05) lines.push(`  Landing alignment deviation: ${(l.bodyLineDev * 100).toFixed(0)}% ⚠ OFF-BALANCE`);
    }

    if (bio.worstKneeAngle !== null) {
      lines.push(`  Worst knee angle in skill: ${Math.round(bio.worstKneeAngle)}° ${bio.worstKneeAngle < 155 ? '⚠ SIGNIFICANT BEND' : bio.worstKneeAngle < 165 ? '⚠ SLIGHT BEND' : '(OK)'}`);
    }

    // Include deduction hints from biomechanics
    if (skill.deductionHints && skill.deductionHints.length > 0) {
      lines.push(`  MediaPipe deduction hints:`);
      for (const hint of skill.deductionHints) {
        lines.push(`    - ${hint.fault}: -${hint.deduction.toFixed(2)} (${hint.detail})`);
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}
