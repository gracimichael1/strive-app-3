/**
 * poseDetector.js
 * Wraps @mediapipe/tasks-vision PoseLandmarker.
 * Already in package.json — no extra installs needed.
 *
 * MediaPipe landmark indices (33 points):
 *   0  nose         11 left_shoulder  12 right_shoulder
 *   13 left_elbow   14 right_elbow    15 left_wrist    16 right_wrist
 *   23 left_hip     24 right_hip      25 left_knee     26 right_knee
 *   27 left_ankle   28 right_ankle
 */

import {
  PoseLandmarker,
  FilesetResolver,
} from '@mediapipe/tasks-vision';

let landmarker = null;
let multiLandmarker = null; // Separate instance for multi-person detection

// Indices we care about
const JOINT_MAP = {
  nose:           0,
  leftShoulder:  11,
  rightShoulder: 12,
  leftElbow:     13,
  rightElbow:    14,
  leftWrist:     15,
  rightWrist:    16,
  leftHip:       23,
  rightHip:      24,
  leftKnee:      25,
  rightKnee:     26,
  leftAnkle:     27,
  rightAnkle:    28,
};

export async function loadPoseDetector() {
  if (landmarker) return landmarker;

  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
  );

  landmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
      delegate: 'GPU',
    },
    runningMode: 'IMAGE',
    numPoses: 1,
  });

  return landmarker;
}

/**
 * Detect pose for a single canvas frame.
 * When targetCenter is provided (from gymnast selector), detects multiple
 * people and returns the one closest to the target location.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {{ x: number, y: number }} [targetCenter] - Normalized (0-1) target position
 * @returns {{ landmarks: Array, joints: Object } | null}
 */
export async function detectPose(canvas, targetCenter = null) {
  if (!landmarker) throw new Error('Call loadPoseDetector() first');

  let raw;

  if (targetCenter) {
    // Multi-person mode — detect all people, pick closest to target
    if (!multiLandmarker) {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );
      multiLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
          delegate: 'GPU',
        },
        runningMode: 'IMAGE',
        numPoses: 6,
      });
    }

    const result = multiLandmarker.detect(canvas);
    if (!result.landmarks || result.landmarks.length === 0) return null;

    // Find person closest to target center (using torso midpoint)
    let bestIdx = 0;
    let bestDist = Infinity;

    for (let i = 0; i < result.landmarks.length; i++) {
      const lms = result.landmarks[i];
      // Torso center from shoulders + hips
      const torsoPoints = [lms[11], lms[12], lms[23], lms[24]].filter(
        l => l && (l.visibility || 0) > 0.3
      );
      if (torsoPoints.length === 0) continue;

      const cx = torsoPoints.reduce((s, l) => s + l.x, 0) / torsoPoints.length;
      const cy = torsoPoints.reduce((s, l) => s + l.y, 0) / torsoPoints.length;
      const dist = Math.hypot(cx - targetCenter.x, cy - targetCenter.y);

      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }

    raw = result.landmarks[bestIdx];
  } else {
    // Single-person mode (original behavior)
    const result = landmarker.detect(canvas);
    if (!result.landmarks || result.landmarks.length === 0) return null;
    raw = result.landmarks[0];
  }

  // Build named joints map (coordinates are 0-1 normalized)
  const joints = {};
  for (const [name, idx] of Object.entries(JOINT_MAP)) {
    const lm = raw[idx];
    if (lm) {
      joints[name] = {
        x: lm.x,
        y: lm.y,
        z: lm.z || 0,
        visibility: lm.visibility || 0,
      };
    }
  }

  // Convenience midpoints
  if (joints.leftHip && joints.rightHip) {
    joints.hip = midpoint(joints.leftHip, joints.rightHip);
  }
  if (joints.leftShoulder && joints.rightShoulder) {
    joints.shoulder = midpoint(joints.leftShoulder, joints.rightShoulder);
  }
  if (joints.leftKnee && joints.rightKnee) {
    joints.knee = midpoint(joints.leftKnee, joints.rightKnee);
  }
  if (joints.leftAnkle && joints.rightAnkle) {
    joints.ankle = midpoint(joints.leftAnkle, joints.rightAnkle);
  }
  if (joints.leftElbow && joints.rightElbow) {
    joints.elbow = midpoint(joints.leftElbow, joints.rightElbow);
  }
  if (joints.leftWrist && joints.rightWrist) {
    joints.wrist = midpoint(joints.leftWrist, joints.rightWrist);
  }

  return { landmarks: raw, joints };
}

/**
 * Process all frames with progress callback.
 *
 * @param {Array<{timestamp: number, canvas: HTMLCanvasElement}>} frames
 * @param {function} onProgress
 * @param {{ x: number, y: number }} [targetCenter] - From gymnast selector
 * @returns {Promise<Array<{timestamp: number, joints: Object, landmarks: Array}>>}
 */
export async function detectPosesForFrames(frames, onProgress = null, targetCenter = null) {
  const poseFrames = [];

  for (let i = 0; i < frames.length; i++) {
    const { timestamp, canvas } = frames[i];

    try {
      const pose = await detectPose(canvas, targetCenter);
      if (pose) {
        poseFrames.push({ timestamp, ...pose });
      }
    } catch (e) {
      // Skip bad frames silently
    }

    if (onProgress) onProgress(i + 1, frames.length);
  }

  return poseFrames;
}

/**
 * Release GPU memory held by MediaPipe PoseLandmarker instances.
 * Call after analysis pipeline completes.
 */
export function disposePoseDetector() {
  if (landmarker) { try { landmarker.close(); } catch {} landmarker = null; }
  if (multiLandmarker) { try { multiLandmarker.close(); } catch {} multiLandmarker = null; }
}

function midpoint(a, b) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: ((a.z || 0) + (b.z || 0)) / 2,
    visibility: Math.min(a.visibility || 0, b.visibility || 0),
  };
}
