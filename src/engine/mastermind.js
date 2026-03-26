/**
 * mastermind.js — Core Mastermind engine.
 * Reads localStorage analysis history. Calls /api/mastermind for Claude panels.
 * Returns a complete MastermindPlan object.
 * TODO: migrate localStorage reads to Supabase at Phase 3-A.
 */

import { getConditioning } from './conditioning-map';

const INJURY_SIGNALS = {
  wrist: { deductions: ['low_cast', 'short_handstand', 'wrist'], flag: 'yellow', note: 'High wrist load pattern detected. Ensure proper wrist warm-up.', prehab: 'Wrist circles x 20 each direction before bars practice.' },
  ankle: { deductions: ['flexed_feet', 'landing_form', 'ankle', 'balance_breaks'], flag: 'yellow', note: 'Ankle loading pattern detected. Strengthen to protect the joint.', prehab: 'Theraband 3-way x 20 before floor and beam.' },
  back: { deductions: ['arch_body', 'hip_angle', 'back', 'landing'], flag: 'amber', note: 'Back extension pattern. Monitor for lower back fatigue.', prehab: 'Core activation sequence before backbend elements.' },
  shoulder: { deductions: ['arm_position', 'low_cast', 'short_handstand', 'shoulder'], flag: 'yellow', note: 'Shoulder loading pattern. Rotator cuff strengthening recommended.', prehab: 'Band pull-aparts x 20 + face pulls x 15 before bars.' },
};

export async function generateMastermindPlan(athleteProfile, recentAnalyses, upcomingMeet) {
  const plan = { generatedAt: Date.now(), version: '1.0-localStorage', goal: athleteProfile?.goal ?? 'unset', conditioning: null, mental: null, nutrition: null, injury: null, skills: null, goals: null };

  // 1. CONDITIONING (deterministic)
  const deductionFrequency = {};
  (recentAnalyses || []).slice(-3).forEach(a => {
    const skills = a?.gradedSkills || a?.skills || [];
    skills.forEach(skill => {
      const deds = skill?.faults || skill?.subFaults || skill?.deductions || [];
      deds.forEach(d => {
        const type = normalizeDeductionType(d?.fault || d?.description || d?.type || '');
        if (type) deductionFrequency[type] = (deductionFrequency[type] || 0) + 1;
      });
    });
  });

  const topDeductions = Object.entries(deductionFrequency).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([type]) => type);
  if (topDeductions.length === 0) topDeductions.push('default');

  const meetInDays = upcomingMeet ? Math.ceil((new Date(upcomingMeet) - new Date()) / 86400000) : null;
  const isTaper = meetInDays !== null && meetInDays <= 2;

  const days = ['Monday', 'Tuesday', 'Thursday', 'Friday'];
  plan.conditioning = {
    weeklyPlan: days.map((day, i) => ({
      day, focusDeduction: topDeductions[i % topDeductions.length],
      exercise: getConditioning(topDeductions[i % topDeductions.length]),
      isTaper, taperNote: isTaper ? 'Meet prep — keep it light, save energy.' : null,
    })),
    topDeductions,
    updatedFrom: recentAnalyses?.[0]?.date || recentAnalyses?.[0]?.timestamp || 'latest analysis',
  };

  // 2. MENTAL (Claude API)
  try {
    const recentScores = (recentAnalyses || []).slice(-5).map(a => a?.finalScore ?? a?.score ?? null).filter(s => s !== null);
    const topStrength = getTopStrength(recentAnalyses);
    const latestEvent = recentAnalyses?.[0]?.event || '';
    const res = await fetch('/api/mastermind', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Strive-Token': process.env.REACT_APP_STRIVE_TOKEN || '' },
      body: JSON.stringify({
        type: 'mental',
        athleteProfile: { ...athleteProfile, topStrength },
        recentScores,
        upcomingMeet,
        topFaults: topDeductions.slice(0, 3),
        event: latestEvent,
        level: athleteProfile?.level || '',
      }),
    });
    plan.mental = res.ok ? await res.json() : mentalFallback(athleteProfile);
  } catch { plan.mental = mentalFallback(athleteProfile); }

  // 3. NUTRITION (Claude API, cached 7 days)
  const cachedNutrition = getCachedNutrition(athleteProfile);
  if (cachedNutrition) {
    plan.nutrition = cachedNutrition;
  } else {
    try {
      const latestEvent = recentAnalyses?.[0]?.event || '';
      const res = await fetch('/api/mastermind', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Strive-Token': process.env.REACT_APP_STRIVE_TOKEN || '' },
        body: JSON.stringify({
          type: 'nutrition',
          athleteProfile,
          upcomingMeet,
          topFaults: topDeductions.slice(0, 3),
          event: latestEvent,
          level: athleteProfile?.level || '',
        }),
      });
      const data = res.ok ? await res.json() : nutritionFallback();
      plan.nutrition = data;
      cacheNutrition(data, athleteProfile?.goal);
    } catch { plan.nutrition = nutritionFallback(); }
  }

  // 4. INJURY (deterministic)
  const age = parseInt(athleteProfile?.age) || 12;
  const injuryFlags = [];
  const allTypes = Object.keys(deductionFrequency);
  Object.entries(INJURY_SIGNALS).forEach(([area, signal]) => {
    if (signal.deductions.some(d => allTypes.some(t => t.includes(d)))) {
      injuryFlags.push({
        area, flag: age < 12 ? 'prehab' : signal.flag,
        note: age < 12 ? null : signal.note, prehab: signal.prehab,
        disclaimer: 'STRIVE injury signals are not a medical diagnosis. Consult a qualified sports medicine professional.',
      });
    }
  });
  plan.injury = { flags: injuryFlags, underAgeNote: age < 12 ? 'Showing prehab guidance only for athletes under 12.' : null };

  // 5. SKILLS (deterministic)
  const latest = recentAnalyses?.[0];
  const latestSkills = latest?.gradedSkills || latest?.skills || [];
  const topSkills = [...latestSkills].sort((a, b) => skillDed(b) - skillDed(a)).slice(0, 3);
  plan.skills = {
    focusSkills: topSkills.map(skill => ({
      name: skill?.skillName || skill?.name || skill?.skill || 'Skill',
      deductionTotal: skillDed(skill),
      drill: skill?.drillRecommendation || skill?.drill || 'Work this element in practice with coach guidance.',
      why: `Reducing deductions here adds ${skillDed(skill).toFixed(2)} back to your score.`,
    })),
    fromAnalysis: latest?.date || latest?.timestamp || 'latest analysis',
  };

  // 6. GOALS
  const scores = (recentAnalyses || []).map(a => ({ score: a?.finalScore ?? a?.score, date: a?.date || a?.timestamp, event: a?.event })).filter(s => s.score != null);
  plan.goals = {
    goal: athleteProfile?.goal ?? 'unset', scores,
    levelUpReadiness: latest?.levelProgressionAnalysis?.overallReadiness ?? null,
    streakWeeks: calculateStreak(recentAnalyses),
  };

  return plan;
}

// Helpers
function normalizeDeductionType(desc) {
  if (!desc) return null;
  const d = desc.toLowerCase();
  if (d.includes('knee')) return 'bent_knees';
  if (d.includes('foot') || d.includes('feet') || (d.includes('toe') && d.includes('point'))) return 'flexed_feet';
  if (d.includes('cast')) return 'low_cast';
  if (d.includes('pike')) return 'early_pike';
  if (d.includes('hip')) return 'hip_angle';
  if (d.includes('handstand')) return 'short_handstand';
  if (d.includes('balance') || d.includes('wobble')) return 'balance_breaks';
  if (d.includes('leg') && d.includes('apart')) return 'leg_separation';
  if (d.includes('arm')) return 'arm_position';
  if (d.includes('landing')) return 'landing_form';
  if (d.includes('head')) return 'head_position';
  if (d.includes('rhythm')) return 'rhythm_break';
  if (d.includes('arch')) return 'arch_body';
  if (d.includes('toe')) return 'toe_point';
  if (d.includes('fall')) return 'fall';
  if (d.includes('artistry') || d.includes('expression')) return 'artistry';
  if (d.includes('jump') || d.includes('leap')) return 'jump_height';
  if (d.includes('split')) return 'split_angle';
  return null;
}

function skillDed(s) {
  if (!s) return 0;
  return s.deduction || s.gradeDeduction || s.totalDeduction || s.deductionTotal || 0;
}

function getTopStrength(analyses) {
  if (!analyses?.length) return null;
  const latest = analyses[0];
  const skills = latest?.gradedSkills || latest?.skills || [];
  return skills.filter(s => skillDed(s) < 0.05).map(s => s?.skillName || s?.name || s?.skill).filter(Boolean)[0] || null;
}

function calculateStreak(analyses) {
  const weeks = new Set((analyses || []).map(a => {
    const d = new Date(a?.date || a?.timestamp || Date.now());
    const jan1 = new Date(d.getFullYear(), 0, 1);
    return Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  }));
  return weeks.size;
}

function getCachedNutrition(profile) {
  try {
    const cached = JSON.parse(sessionStorage.getItem('strive_nutrition_plan') || 'null');
    if (!cached) return null;
    if (Date.now() - cached.generatedAt > 7 * 24 * 60 * 60 * 1000) return null;
    if (cached.goal !== profile?.goal) return null;
    return cached.data;
  } catch { return null; }
}

function cacheNutrition(data, goal) {
  try { sessionStorage.setItem('strive_nutrition_plan', JSON.stringify({ data, goal, generatedAt: Date.now() })); } catch {}
}

function mentalFallback(profile) {
  return { morningAffirmation: `${profile?.name || 'She'} shows up and puts in the work. That consistency is building something real.`, focusWord: 'STRONG', preMeetNote: null, postSlumpNote: null };
}

function nutritionFallback() {
  return { dailyTip: 'Start training days with a balanced meal 2 hours before practice.', weeklyFocus: 'Consistent hydration throughout every practice.', preMeetProtocol: null, disclaimer: 'General guidance for active young athletes. Consult a registered dietitian for personalized advice.' };
}
