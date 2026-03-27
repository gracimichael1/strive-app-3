/**
 * landmarkSerializer.js
 * Extracts MediaPipe landmarks from video frames and serializes them
 * into a structured format suitable for injection into Gemini prompts.
 *
 * Uses the existing poseDetector.js + biomechanics.js angle computations.
 * Runs client-side on extracted frames — completely separate from the
 * Gemini File API video upload path.
 */

import { loadPoseDetector, detectPose } from '../analysis/poseDetector';
import { angleDeg } from '../analysis/biomechanics';
import { extractFrames } from '../analysis/frameExtractor';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Frames per second for landmark extraction (lower = fewer frames, faster) */
const LANDMARK_FPS = 2;

/** Minimum visibility threshold — skip frames where key joints are occluded */
const MIN_VISIBILITY = 0.5;

/** Maximum frames to include in prompt (keep token budget reasonable) */
const MAX_PROMPT_FRAMES = 60;

// ─── Main entry point ───────────────────────────────────────────────────────

/**
 * Extract landmarks from a video file and serialize them for prompt injection.
 *
 * @param {File} videoFile — The video file (or compressed blob) to analyze
 * @param {function} onProgress — Optional progress callback (framesProcessed, totalFrames)
 * @returns {Promise<Object|null>} — Serialized landmark data, or null on failure
 *
 * Returns:
 * {
 *   frames: [
 *     {
 *       timestamp_seconds: 2.5,
 *       angles: {
 *         left_hip: 165.3,
 *         right_hip: 168.1,
 *         left_knee: 172.0,
 *         right_knee: 175.5,
 *         left_shoulder: 158.2,
 *         right_shoulder: 160.0,
 *         trunk_lean_from_vertical: 8.3,
 *         leg_separation: 12.1
 *       }
 *     }
 *   ],
 *   metadata: {
 *     fps: 2,
 *     total_frames_extracted: 120,
 *     valid_frames: 95,
 *     extraction_ms: 4500
 *   }
 * }
 */
export async function serializeLandmarksForPrompt(videoFile, onProgress = null) {
  const startMs = Date.now();

  // ── Create a video element from the file ─────────────────────────────────
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;

  const blobUrl = URL.createObjectURL(videoFile);
  video.src = blobUrl;

  try {
    // Wait for video to be ready
    await new Promise((resolve, reject) => {
      video.onloadeddata = resolve;
      video.onerror = () => reject(new Error('Could not load video for landmark extraction'));
      // Timeout after 10s
      setTimeout(() => reject(new Error('Video load timeout for landmarks')), 10000);
    });

    // ── Load MediaPipe model ──────────────────────────────────────────────
    await loadPoseDetector();

    // ── Extract frames at LANDMARK_FPS ────────────────────────────────────
    const rawFrames = await extractFrames(video, LANDMARK_FPS, onProgress);

    if (!rawFrames || rawFrames.length === 0) {
      return null;
    }

    // ── Detect pose on each frame and compute angles ──────────────────────
    const serializedFrames = [];

    for (let i = 0; i < rawFrames.length; i++) {
      const { timestamp, canvas } = rawFrames[i];

      try {
        const pose = await detectPose(canvas);
        if (!pose || !pose.joints) continue;

        const angles = computePromptAngles(pose.joints, pose.landmarks);
        if (!angles) continue; // Visibility too low

        serializedFrames.push({
          timestamp_seconds: round1(timestamp),
          angles,
        });
      } catch {
        // Skip frames that fail detection silently
      }

      if (onProgress) onProgress(i + 1, rawFrames.length);
    }

    if (serializedFrames.length === 0) {
      return null;
    }

    // ── Trim to MAX_PROMPT_FRAMES (evenly sampled) ────────────────────────
    const frames = downsample(serializedFrames, MAX_PROMPT_FRAMES);

    return {
      frames,
      metadata: {
        fps: LANDMARK_FPS,
        total_frames_extracted: rawFrames.length,
        valid_frames: serializedFrames.length,
        frames_in_prompt: frames.length,
        extraction_ms: Date.now() - startMs,
      },
    };
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}


// ─── Angle computation for prompt ───────────────────────────────────────────

/**
 * Compute the 8 angles needed for prompt injection from a joints object.
 * Returns null if key joints have visibility < MIN_VISIBILITY.
 */
function computePromptAngles(joints, rawLandmarks) {
  // Check visibility on key joints (hips, knees, shoulders)
  const keyIndices = [11, 12, 23, 24, 25, 26]; // shoulders, hips, knees
  if (rawLandmarks) {
    const lowVis = keyIndices.some(idx => {
      const lm = rawLandmarks[idx];
      return !lm || (lm.visibility || 0) < MIN_VISIBILITY;
    });
    if (lowVis) return null;
  }

  const j = joints;

  // Left/right hip angles: shoulder → hip → knee
  const leftHip = angleDeg(j.leftShoulder, j.leftHip, j.leftKnee);
  const rightHip = angleDeg(j.rightShoulder, j.rightHip, j.rightKnee);

  // Left/right knee angles: hip → knee → ankle
  const leftKnee = angleDeg(j.leftHip, j.leftKnee, j.leftAnkle);
  const rightKnee = angleDeg(j.rightHip, j.rightKnee, j.rightAnkle);

  // Left/right shoulder angles: elbow → shoulder → hip
  const leftShoulder = angleDeg(j.leftElbow, j.leftShoulder, j.leftHip);
  const rightShoulder = angleDeg(j.rightElbow, j.rightShoulder, j.rightHip);

  // Trunk lean from vertical (using midpoint shoulder and hip)
  const trunkLean = computeTrunkLean(j);

  // Leg separation (normalized distance between ankles, converted to degrees-like metric)
  const legSep = computeLegSeparation(j);

  // All 6 core angles must be present
  if (leftHip == null || rightHip == null || leftKnee == null || rightKnee == null) {
    return null;
  }

  return {
    left_hip: round1(leftHip),
    right_hip: round1(rightHip),
    left_knee: round1(leftKnee),
    right_knee: round1(rightKnee),
    left_shoulder: leftShoulder != null ? round1(leftShoulder) : null,
    right_shoulder: rightShoulder != null ? round1(rightShoulder) : null,
    trunk_lean_from_vertical: trunkLean != null ? round1(trunkLean) : null,
    leg_separation: legSep != null ? round1(legSep) : null,
  };
}


// ─── Trunk lean from vertical ───────────────────────────────────────────────

/**
 * Degrees the torso deviates from vertical.
 * 0° = perfectly upright, 90° = horizontal.
 */
function computeTrunkLean(joints) {
  const sh = joints.shoulder;
  const hp = joints.hip;
  if (!sh || !hp) return null;

  // Vector from hip to shoulder
  const dx = sh.x - hp.x;
  const dy = sh.y - hp.y; // y increases downward in MediaPipe

  // Angle from vertical (vertical = straight up = dy < 0)
  // atan2 of horizontal displacement vs vertical displacement
  const rad = Math.atan2(Math.abs(dx), Math.abs(dy));
  return Math.round(rad * 180 / Math.PI * 10) / 10;
}


// ─── Leg separation ────────────────────────────────────────────────────────

/**
 * Angular separation between legs (degrees).
 * Uses hip-to-ankle vectors. 0° = legs together, 180° = full split.
 */
function computeLegSeparation(joints) {
  const lh = joints.leftHip, la = joints.leftAnkle;
  const rh = joints.rightHip, ra = joints.rightAnkle;
  if (!lh || !la || !rh || !ra) return null;

  // Vectors from each hip to its ankle
  const lVec = { x: la.x - lh.x, y: la.y - lh.y };
  const rVec = { x: ra.x - rh.x, y: ra.y - rh.y };

  const dot = lVec.x * rVec.x + lVec.y * rVec.y;
  const magL = Math.hypot(lVec.x, lVec.y);
  const magR = Math.hypot(rVec.x, rVec.y);
  if (magL === 0 || magR === 0) return null;

  const rad = Math.acos(Math.max(-1, Math.min(1, dot / (magL * magR))));
  return Math.round(rad * 180 / Math.PI * 10) / 10;
}


// ─── Helpers ────────────────────────────────────────────────────────────────

function round1(n) {
  return Math.round(n * 10) / 10;
}

/**
 * Evenly downsample an array to at most maxLen items.
 */
function downsample(arr, maxLen) {
  if (arr.length <= maxLen) return arr;
  const step = arr.length / maxLen;
  const result = [];
  for (let i = 0; i < maxLen; i++) {
    result.push(arr[Math.floor(i * step)]);
  }
  return result;
}
