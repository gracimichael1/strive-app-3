/**
 * analysisPipeline.js
 * Orchestrates the full motion analysis flow:
 *   1. Frame extraction
 *   2. Pose detection (MediaPipe)
 *   3. Skill segmentation
 *   4. Biomechanics computation
 *   5. Deduction inference
 *
 * Returns a rich AnalysisResult object consumed by VideoAnalyzer.
 */

import { extractFrames } from './frameExtractor';
import { loadPoseDetector, detectPosesForFrames } from './poseDetector';
import { segmentSkills } from './skillSegmentation';
import { computeSkillBiomechanics, inferDeductions } from './biomechanics';

/**
 * @typedef {Object} ProgressUpdate
 * @property {'loading'|'extracting'|'detecting'|'segmenting'|'done'|'error'} stage
 * @property {number} pct  – 0-100
 * @property {string} label
 */

/**
 * Run the full pipeline.
 *
 * @param {HTMLVideoElement} video
 * @param {function(ProgressUpdate): void} onProgress
 * @returns {Promise<AnalysisResult>}
 */
export async function analyzeVideo(video, onProgress = () => {}) {

  // ── Stage 1: Load model ─────────────────────────────────────────────────────
  onProgress({ stage: 'loading', pct: 2, label: 'Loading pose detection model…' });

  try {
    await loadPoseDetector();
  } catch (e) {
    throw new Error('Failed to load pose model. Check your internet connection. ' + e.message);
  }

  // ── Stage 2: Extract frames ─────────────────────────────────────────────────
  onProgress({ stage: 'extracting', pct: 8, label: 'Extracting video frames…' });

  const frames = await extractFrames(video, 8, (done, total) => {
    onProgress({
      stage: 'extracting',
      pct:   8 + Math.round((done / total) * 22),
      label: `Extracting frames… (${done}/${total})`,
    });
  });

  if (frames.length === 0) {
    throw new Error('No frames could be extracted from the video.');
  }

  // ── Stage 3: Pose detection ─────────────────────────────────────────────────
  onProgress({ stage: 'detecting', pct: 30, label: 'Running pose detection…' });

  const poseFrames = await detectPosesForFrames(frames, (done, total) => {
    onProgress({
      stage: 'detecting',
      pct:   30 + Math.round((done / total) * 45),
      label: `Detecting poses… (${done}/${total} frames)`,
    });
  });

  if (poseFrames.length === 0) {
    throw new Error('No poses detected. Ensure the gymnast is clearly visible.');
  }

  // ── Stage 4: Skill segmentation ─────────────────────────────────────────────
  onProgress({ stage: 'segmenting', pct: 76, label: 'Identifying skills…' });

  const skills = segmentSkills(poseFrames);

  // ── Stage 5: Biomechanics per skill ─────────────────────────────────────────
  onProgress({ stage: 'segmenting', pct: 85, label: 'Computing biomechanics…' });

  const skillAnalysis = skills.map((skill, idx) => {
    const bio   = computeSkillBiomechanics(skill.frames);
    const deds  = inferDeductions(bio);

    return {
      id:            skill.id,
      index:         idx + 1,
      skillName:     skill.type,
      start:         skill.start,
      end:           skill.end,
      duration:      skill.duration,
      peakTimestamp: skill.peakTimestamp,
      biomechanics:  bio,
      deductionHints: deds,
      estimatedDed: deds.reduce((s, d) => s + d.deduction, 0),
    };
  });

  onProgress({ stage: 'done', pct: 100, label: `Analysis complete — ${skills.length} skill(s) detected` });

  return {
    duration:      video.duration,
    totalFrames:   frames.length,
    poseFrames,
    skills,
    skillAnalysis,
    frameWidth:    frames[0]?.canvas.width  ?? 640,
    frameHeight:   frames[0]?.canvas.height ?? 480,
  };
}
