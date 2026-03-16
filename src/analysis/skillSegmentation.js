/**
 * skillSegmentation.js
 * Detects gymnastics skill windows from pose frame data.
 *
 * Strategy:
 *   - Hip Y velocity detects takeoffs (hip rises = body going up)
 *   - Wrist height relative to hip detects arm raises (salutes, handstands, etc.)
 *   - Smoothing prevents single-frame spikes from creating fake skills
 *   - Minimum skill duration prevents noise
 */

const MIN_SKILL_DURATION_SEC = 0.3;  // skills shorter than this are noise
const COOLDOWN_SEC           = 0.4;  // don't start a new skill too soon after one ends
const HIP_RISE_THRESHOLD     = 0.012; // normalized Y per frame (down = positive in canvas space)
const SMOOTHING_WINDOW       = 3;    // frames to average

/**
 * @param {Array<{timestamp: number, joints: Object}>} poseFrames
 * @returns {Array<{
 *   id: string,
 *   start: number,
 *   end: number,
 *   duration: number,
 *   peakTimestamp: number,
 *   type: string,
 *   frames: Array
 * }>}
 */
export function segmentSkills(poseFrames) {
  if (poseFrames.length < 4) return [];

  // Smooth hip Y across frames
  const smoothHipY = smoothSignal(
    poseFrames.map(f => f.joints.hip?.y ?? 0.5),
    SMOOTHING_WINDOW
  );

  // Compute velocity (negative = hip moving up = takeoff)
  const velocity = [];
  for (let i = 1; i < smoothHipY.length; i++) {
    const dt = poseFrames[i].timestamp - poseFrames[i - 1].timestamp;
    velocity.push((smoothHipY[i] - smoothHipY[i - 1]) / Math.max(dt, 0.001));
  }
  velocity.unshift(0);

  const skills       = [];
  let inSkill        = false;
  let skillStart     = null;
  let skillFrames    = [];
  let peakHipY       = Infinity;
  let peakTimestamp  = 0;
  let lastSkillEnd   = -Infinity;

  for (let i = 0; i < poseFrames.length; i++) {
    const frame = poseFrames[i];
    const vel   = velocity[i];
    const hipY  = smoothHipY[i];

    // Takeoff: hip rising (negative velocity in canvas coords)
    const rising = vel < -HIP_RISE_THRESHOLD;

    if (!inSkill && rising) {
      const cooldownOk = frame.timestamp - lastSkillEnd > COOLDOWN_SEC;
      if (cooldownOk) {
        inSkill       = true;
        skillStart    = frame.timestamp;
        skillFrames   = [frame];
        peakHipY      = hipY;
        peakTimestamp = frame.timestamp;
      }
    } else if (inSkill) {
      skillFrames.push(frame);

      // Track peak (lowest Y value = highest point of body)
      if (hipY < peakHipY) {
        peakHipY      = hipY;
        peakTimestamp = frame.timestamp;
      }

      // Landing: hip has come back down (positive velocity sustained)
      const landed = vel > HIP_RISE_THRESHOLD * 0.5;
      const timeout = frame.timestamp - skillStart > 4.0; // 4s max skill

      if (landed || timeout) {
        const duration = frame.timestamp - skillStart;

        if (duration >= MIN_SKILL_DURATION_SEC) {
          const skillType = classifySkill(skillFrames);
          skills.push({
            id:            `skill_${skills.length}`,
            start:         skillStart,
            end:           frame.timestamp,
            duration:      Math.round(duration * 100) / 100,
            peakTimestamp,
            type:          skillType,
            frames:        skillFrames,
          });
          lastSkillEnd = frame.timestamp;
        }

        inSkill     = false;
        skillStart  = null;
        skillFrames = [];
        peakHipY    = Infinity;
      }
    }
  }

  return skills;
}

/**
 * Classify skill type based on body position heuristics.
 */
function classifySkill(frames) {
  if (frames.length === 0) return 'Skill';

  // Sample mid-flight frame
  const mid = frames[Math.floor(frames.length / 2)];
  const j   = mid.joints;

  if (!j) return 'Skill';

  const hipY      = j.hip?.y       ?? 0.5;
  const wristY    = j.wrist?.y     ?? 0.5;
  const kneeAngle = estimateKneeAngle(j);
  const hipAngle  = estimateHipAngle(j);

  // Handstand / inverted: wrists above hip
  if (wristY < hipY - 0.15) return 'Handstand / Inversion';

  // Tucked: tight knee angle
  if (kneeAngle < 80) return 'Tucked Element';

  // Piked: tight hip angle, straighter knees
  if (hipAngle < 100 && kneeAngle > 120) return 'Pike Element';

  // Layout / stretched
  if (hipAngle > 150 && kneeAngle > 150) return 'Layout / Stretched';

  return 'Skill';
}

function estimateKneeAngle(j) {
  if (!j.hip || !j.knee || !j.ankle) return 160;
  return angleDeg(j.hip, j.knee, j.ankle);
}

function estimateHipAngle(j) {
  if (!j.shoulder || !j.hip || !j.knee) return 160;
  return angleDeg(j.shoulder, j.hip, j.knee);
}

function angleDeg(A, B, C) {
  const ABx = A.x - B.x, ABy = A.y - B.y;
  const CBx = C.x - B.x, CBy = C.y - B.y;
  const dot  = ABx * CBx + ABy * CBy;
  const magA = Math.hypot(ABx, ABy);
  const magC = Math.hypot(CBx, CBy);
  if (magA === 0 || magC === 0) return 160;
  const angle = Math.acos(Math.max(-1, Math.min(1, dot / (magA * magC))));
  return (angle * 180) / Math.PI;
}

function smoothSignal(arr, window) {
  return arr.map((_, i) => {
    const start = Math.max(0, i - Math.floor(window / 2));
    const end   = Math.min(arr.length, start + window);
    const slice = arr.slice(start, end);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}
