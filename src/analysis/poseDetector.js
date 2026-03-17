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
 * Returns a named joints object + raw landmarks array.
 *
 * @param {HTMLCanvasElement} canvas
 * @returns {{ landmarks: Array, joints: Object } | null}
 */
export async function detectPose(canvas) {
  if (!landmarker) throw new Error('Call loadPoseDetector() first');

  const result = landmarker.detect(canvas);

  if (!result.landmarks || result.landmarks.length === 0) return null;

  const raw = result.landmarks[0]; // [{x, y, z, visibility}]

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
 * @returns {Promise<Array<{timestamp: number, joints: Object, landmarks: Array}>>}
 */
export async function detectPosesForFrames(frames, onProgress = null) {
  const poseFrames = [];

  for (let i = 0; i < frames.length; i++) {
    const { timestamp, canvas } = frames[i];

    try {
      const pose = await detectPose(canvas);
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

function midpoint(a, b) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: ((a.z || 0) + (b.z || 0)) / 2,
    visibility: Math.min(a.visibility || 0, b.visibility || 0),
  };
}
