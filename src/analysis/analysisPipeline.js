/**
 * analysisPipeline.js — v2 with level-aware Gemini classification
 */
import { extractFrames }                         from './frameExtractor';
import { loadPoseDetector, detectPosesForFrames }from './poseDetector';
import { segmentSkills }                         from './skillSegmentation';
import { computeSkillBiomechanics, inferDeductions } from './biomechanics';
import { classifyAllSkills }                     from './skillClassifier';

export async function analyzeVideo(video, options = {}, onProgress = () => {}) {
  const { athleteProfile = {}, useGemini = true } = options;

  onProgress({ stage: 'loading', pct: 2, label: 'Loading pose detection model…' });
  try { await loadPoseDetector(); }
  catch (e) { throw new Error('Failed to load pose model. ' + e.message); }

  onProgress({ stage: 'extracting', pct: 8, label: 'Extracting video frames…' });
  const frames = await extractFrames(video, 8, (done, total) =>
    onProgress({ stage: 'extracting', pct: 8 + Math.round((done/total)*20), label: `Extracting frames… (${done}/${total})` })
  );
  if (!frames.length) throw new Error('No frames extracted from video.');

  onProgress({ stage: 'detecting', pct: 28, label: 'Running pose detection…' });
  const poseFrames = await detectPosesForFrames(frames, (done, total) =>
    onProgress({ stage: 'detecting', pct: 28 + Math.round((done/total)*35), label: `Detecting poses… (${done}/${total})` })
  );
  if (!poseFrames.length) throw new Error('No poses detected. Film from the side with full body visible.');

  onProgress({ stage: 'segmenting', pct: 64, label: 'Identifying skill windows…' });
  const skills = segmentSkills(poseFrames);

  onProgress({ stage: 'biomechanics', pct: 72, label: 'Computing joint angles…' });
  const biomechanicsArr = skills.map(s => computeSkillBiomechanics(s.frames));

  let skillAnalysis;
  if (useGemini && skills.length > 0) {
    onProgress({ stage: 'classifying', pct: 80, label: `AI classifying skills for ${athleteProfile.level || 'your level'}…` });
    try {
      skillAnalysis = await classifyAllSkills(video, skills, biomechanicsArr, athleteProfile, (done, total) =>
        onProgress({ stage: 'classifying', pct: 80 + Math.round((done/total)*16), label: `Classifying skill ${done+1} of ${total}…` })
      );
    } catch (e) {
      console.warn('[pipeline] Gemini failed, using fallback:', e.message);
      skillAnalysis = fallback(skills, biomechanicsArr);
    }
  } else {
    skillAnalysis = fallback(skills, biomechanicsArr);
  }

  onProgress({ stage: 'done', pct: 100, label: `Complete — ${skills.length} skill${skills.length===1?'':'s'} detected` });

  return {
    duration: video.duration, totalFrames: frames.length, poseFrames, skills,
    skillAnalysis,
    frameWidth: frames[0]?.canvas.width ?? 640,
    frameHeight: frames[0]?.canvas.height ?? 480,
    athleteProfile, analysisVersion: 2,
  };
}

function fallback(skills, biomechanicsArr) {
  return skills.map((skill, idx) => {
    const bio = biomechanicsArr[idx];
    const deds = inferDeductions(bio);
    return {
      id: skill.id, index: idx+1, skillName: skill.type || 'Skill', skillId: null,
      elementEntry: null, difficulty: null,
      start: skill.start, end: skill.end, duration: skill.duration, peakTimestamp: skill.peakTimestamp,
      biomechanics: bio, deductionHints: deds,
      estimatedDed: deds.reduce((s,d) => s+d.deduction, 0),
      confidence: 0.4, confidenceLabel: 'low',
      confidenceReason: 'Heuristic classification (AI unavailable)',
      singleCameraWarning: 'Skill type estimated from pose only — may be inaccurate',
      landingQuality: 'unknown', coachNote: '', levelContext: '',
      classifiedByGemini: false,
    };
  });
}
