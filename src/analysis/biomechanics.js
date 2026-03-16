/**
 * biomechanics.js
 * Computes joint angles, posture scores, and gymnastics-specific metrics
 * from a named joints object produced by poseDetector.js.
 */

// ─── Core angle utility ───────────────────────────────────────────────────────

/**
 * Angle at vertex B formed by rays BA and BC (degrees).
 */
export function angleDeg(A, B, C) {
  if (!A || !B || !C) return null;
  const ABx = A.x - B.x, ABy = A.y - B.y;
  const CBx = C.x - B.x, CBy = C.y - B.y;
  const dot  = ABx * CBx + ABy * CBy;
  const magA = Math.hypot(ABx, ABy);
  const magC = Math.hypot(CBx, CBy);
  if (magA === 0 || magC === 0) return null;
  const rad = Math.acos(Math.max(-1, Math.min(1, dot / (magA * magC))));
  return Math.round((rad * 180) / Math.PI * 10) / 10;
}

// ─── Single-frame biomechanics ────────────────────────────────────────────────

/**
 * Compute all relevant angles from a joints snapshot.
 *
 * @param {Object} joints  – named joints from poseDetector
 * @returns {Object}
 */
export function computeBiomechanics(joints) {
  const j = joints;

  const kneeAngle     = angleDeg(j.hip,      j.knee,      j.ankle);
  const hipAngle      = angleDeg(j.shoulder,  j.hip,       j.knee);
  const shoulderAngle = angleDeg(j.elbow,     j.shoulder,  j.hip);
  const elbowAngle    = angleDeg(j.shoulder,  j.elbow,     j.wrist);

  // Left + right separately if available
  const leftKneeAngle  = angleDeg(j.leftHip,       j.leftKnee,  j.leftAnkle);
  const rightKneeAngle = angleDeg(j.rightHip,       j.rightKnee, j.rightAnkle);

  // Body line straightness (0 = perfect, higher = more deviation)
  const bodyLineDev = bodyLineDeviation(j);

  // Leg separation (difference in ankle X positions)
  const legSep = legSeparation(j);

  // Arm symmetry
  const armSym = armSymmetry(j);

  return {
    kneeAngle,
    hipAngle,
    shoulderAngle,
    elbowAngle,
    leftKneeAngle,
    rightKneeAngle,
    bodyLineDev,
    legSep,
    armSym,
  };
}

/**
 * Compute biomechanics across a set of frames for a skill window.
 * Returns takeoff, peak, and landing snapshots plus aggregates.
 */
export function computeSkillBiomechanics(skillFrames) {
  if (!skillFrames || skillFrames.length === 0) return null;

  const takeoffFrame = skillFrames[0];
  const peakIdx      = Math.floor(skillFrames.length * 0.4);
  const peakFrame    = skillFrames[peakIdx];
  const landingFrame = skillFrames[skillFrames.length - 1];

  return {
    takeoff: computeBiomechanics(takeoffFrame.joints),
    peak:    computeBiomechanics(peakFrame.joints),
    landing: computeBiomechanics(landingFrame.joints),
    // Worst-case knee angle across all frames (flag bent knees)
    worstKneeAngle: worstKnee(skillFrames),
    // Average hip angle during flight
    avgHipAngle:    avgHip(skillFrames),
  };
}

// ─── Deduction hint generation ────────────────────────────────────────────────

/**
 * Produce a list of likely deductions based on biomechanics.
 * Returns array of { fault, deduction, severity, detail }.
 */
export function inferDeductions(bio) {
  const hints = [];
  if (!bio) return hints;

  const { peak, landing, worstKneeAngle, avgHipAngle } = bio;

  // Bent knees (threshold: < 160° is noticeable)
  if (worstKneeAngle !== null && worstKneeAngle < 155) {
    const diff = 160 - worstKneeAngle;
    const ded  = diff > 30 ? 0.30 : diff > 15 ? 0.15 : 0.10;
    hints.push({
      fault:     'Bent knees / legs',
      deduction: ded,
      severity:  ded >= 0.20 ? 'large' : ded >= 0.10 ? 'medium' : 'small',
      detail:    `Knee angle measured at ~${Math.round(worstKneeAngle)}° during flight (ideal ≥160°)`,
    });
  }

  // Hip angle (piked body)
  if (avgHipAngle !== null && avgHipAngle < 155) {
    const diff = 160 - avgHipAngle;
    const ded  = diff > 30 ? 0.20 : 0.10;
    hints.push({
      fault:     'Pike / arch in body position',
      deduction: ded,
      severity:  ded >= 0.20 ? 'large' : 'small',
      detail:    `Average hip angle ~${Math.round(avgHipAngle)}° (ideal ≥160° for layouts)`,
    });
  }

  // Landing posture
  if (landing) {
    if (landing.kneeAngle !== null && landing.kneeAngle < 120) {
      hints.push({
        fault:     'Deep squat on landing',
        deduction: 0.30,
        severity:  'large',
        detail:    `Landing knee angle ~${Math.round(landing.kneeAngle)}° (below 90° threshold)`,
      });
    }

    if (landing.bodyLineDev > 0.06) {
      hints.push({
        fault:     'Body alignment deviation on landing',
        deduction: 0.10,
        severity:  'small',
        detail:    'Hips not stacked vertically over feet on landing',
      });
    }
  }

  // Arm symmetry
  if (peak && peak.armSym > 0.08) {
    hints.push({
      fault:     'Bent arms / asymmetric arm position',
      deduction: 0.10,
      severity:  'small',
      detail:    'Arm positions appear asymmetric at peak of skill',
    });
  }

  return hints;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function bodyLineDeviation(j) {
  if (!j.shoulder || !j.hip || !j.ankle) return 0;
  // Ideal: shoulder, hip, ankle share the same X (in normalized coords)
  const midX  = j.hip.x;
  const devSh = Math.abs(j.shoulder.x - midX);
  const devAn = Math.abs(j.ankle.x   - midX);
  return (devSh + devAn) / 2;
}

function legSeparation(j) {
  if (!j.leftAnkle || !j.rightAnkle) return 0;
  return Math.abs(j.leftAnkle.x - j.rightAnkle.x);
}

function armSymmetry(j) {
  if (!j.leftElbow || !j.rightElbow || !j.leftShoulder || !j.rightShoulder) return 0;
  const leftReach  = Math.hypot(j.leftElbow.x  - j.leftShoulder.x,  j.leftElbow.y  - j.leftShoulder.y);
  const rightReach = Math.hypot(j.rightElbow.x - j.rightShoulder.x, j.rightElbow.y - j.rightShoulder.y);
  return Math.abs(leftReach - rightReach);
}

function worstKnee(frames) {
  let worst = Infinity;
  for (const f of frames) {
    const a = angleDeg(f.joints.hip, f.joints.knee, f.joints.ankle);
    if (a !== null && a < worst) worst = a;
  }
  return worst === Infinity ? null : worst;
}

function avgHip(frames) {
  const angles = frames
    .map(f => angleDeg(f.joints.shoulder, f.joints.hip, f.joints.knee))
    .filter(a => a !== null);
  if (angles.length === 0) return null;
  return Math.round(angles.reduce((s, a) => s + a, 0) / angles.length * 10) / 10;
}
