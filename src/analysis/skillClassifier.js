/**
 * skillClassifier.js
 * Orchestrates Gemini classification + element dictionary merge per skill.
 * Passes athlete level through every call so deductions are level-calibrated.
 */
import { extractSkillClip }         from '../utils/videoClipper';
import { matchSkillByName, getDeductionsForSkill, getElementsForLevel, ELEMENTS } from '../data/elementDictionary';

const API_BASE = process.env.REACT_APP_API_BASE || '';

export async function classifyAllSkills(video, skills, biomechanicsArr, athleteProfile = {}, onProgress = null) {
  const event      = athleteProfile.event || 'floor';
  const level      = athleteProfile.level || '';
  const candidates = getElementsForLevel(event, level).map(e => e.name);
  const enriched   = [];

  for (let i = 0; i < skills.length; i++) {
    if (onProgress) onProgress(i, skills.length);
    const skill = skills[i];
    const bio   = biomechanicsArr[i];
    let classification = null;

    try {
      const clip = await extractSkillClip(video, skill.start, skill.end);
      const body = { biomechanics: bio, athleteProfile, candidateSkills: candidates };
      if (clip) { body.clipBase64 = clip.base64; body.mimeType = clip.mimeType; }

      const res = await fetch(`${API_BASE}/api/classify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) classification = await res.json();
    } catch (e) {
      console.warn(`[classifier] skill ${i + 1}:`, e.message);
    }

    enriched.push(mergeClassification(skill, bio, classification, i, level));
  }

  if (onProgress) onProgress(skills.length, skills.length);
  return enriched;
}

function mergeClassification(skill, bio, geminiResult, idx, level) {
  const skillName = geminiResult?.skillName || skill.type || 'Skill';
  const skillId   = geminiResult?.skillId   || null;
  const confidence = geminiResult?.confidence ?? 0.5;

  // Match element in dictionary
  let element = null;
  if (skillId) {
    element = Object.values(ELEMENTS).find(e => e.id === skillId) || null;
  }
  if (!element) element = matchSkillByName(skillName);

  // Dictionary deductions — pass level for level-aware rules (e.g. split angle)
  const dictDeds   = element ? getDeductionsForSkill(element, bio, level) : [];
  const geminiDeds = (geminiResult?.faultObservations || []).map(f => ({
    fault: f.fault, deduction: f.deduction, severity: f.severity,
    detail: f.detail, confidence: f.confidence, source: 'gemini',
  }));

  const merged = deduplicate([...geminiDeds, ...dictDeds.map(d => ({ ...d, source: d.source || 'dict' }))]);
  merged.sort((a, b) => b.deduction - a.deduction);

  const estimatedDed = Math.round(merged.reduce((s, d) => s + d.deduction, 0) * 100) / 100;

  return {
    id: skill.id, index: idx + 1,
    skillName, skillId: element?.id ?? null, elementEntry: element,
    difficulty: element?.difficulty ?? null,
    start: skill.start, end: skill.end, duration: skill.duration, peakTimestamp: skill.peakTimestamp,
    biomechanics: bio,
    deductionHints: merged, estimatedDed,
    splitAngleAssessment: geminiResult?.splitAngleAssessment || null,
    confidence, confidenceLabel: geminiResult?.confidenceLabel ?? 'medium',
    confidenceReason: geminiResult?.confidenceReason || '',
    singleCameraWarning: geminiResult?.singleCameraWarning || null,
    landingQuality: geminiResult?.landingQuality || 'unknown',
    coachNote: geminiResult?.coachNote || '',
    levelContext: geminiResult?.levelContext || '',
    classifiedByGemini: !!geminiResult,
  };
}

function deduplicate(items) {
  const map = new Map();
  for (const item of items) {
    const key = (item.fault || '').toLowerCase().replace(/[^a-z]/g, '_').slice(0, 40);
    if (!map.has(key)) {
      map.set(key, { ...item });
    } else {
      const ex = map.get(key);
      if (item.deduction > ex.deduction) {
        map.set(key, { ...item, detail: item.detail || ex.detail, confidence: Math.max(item.confidence || 0.5, ex.confidence || 0.5), source: 'merged' });
      }
    }
  }
  return Array.from(map.values());
}
