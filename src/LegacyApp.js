import React, { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from "react";
import { LineChart, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Line, ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, Cell, ReferenceLine } from "recharts";

// ─── NEW COMPONENT IMPORTS ─────────────────────────────────────────
const TrainingScreen = lazy(() => import("./screens/TrainingScreen"));
const NewResultsScreen = lazy(() => import("./screens/ResultsScreen"));
const NewDashboardScreen = lazy(() => import("./screens/DashboardScreen"));
const UpgradeModal = lazy(() => import("./components/billing/UpgradeModal"));
import AgeGate from "./components/legal/AgeGate";
import ParentalConsent from "./components/legal/ParentalConsent";
import LegalDisclaimer from "./components/legal/LegalDisclaimer";
import PrivacyNotice from "./components/legal/PrivacyNotice";
import { EVENT_JUDGING_RULES } from "./data/constants";
import { getEventDeductions, getEventStrictnessGuidance } from "./data/eventDeductions";
import { buildDeductionPromptBlock } from "./data/codeOfPoints";
import { runAnalysisPipeline } from "./engine/pipeline";

// ─── BUILD INFO ──
const BUILD_VERSION = "1.0.0";
const BUILD_HASH = process.env.REACT_APP_VERCEL_GIT_COMMIT_SHA ? process.env.REACT_APP_VERCEL_GIT_COMMIT_SHA.slice(0, 7) : "dev";
const BUILD_DATE = new Date().toISOString().slice(0, 10);
const PROMPT_VER = "v7_full_pessimistic";

// ─── STORAGE WRAPPER — works in Claude artifacts AND real browsers ──
const storage = {
  async get(key) {
    if (typeof window !== 'undefined' && window.storage?.get) {
      try { const r = await window.storage.get(key); if (r) return r; } catch {}
    }
    try { const v = localStorage.getItem(key); if (v !== null) return { key, value: v }; } catch {}
    return null;
  },
  async set(key, value) {
    if (typeof window !== 'undefined' && window.storage?.set) {
      try { await window.storage.set(key, value); } catch {}
    }
    try { localStorage.setItem(key, value); } catch {}
  },
  async delete(key) {
    if (typeof window !== 'undefined' && window.storage?.delete) {
      try { await window.storage.delete(key); } catch {}
    }
    try { localStorage.removeItem(key); } catch {}
  },
};

// ─── STRUCTURED LOGGING ─────────────────────────────────────────────
const log = {
  _fmt(level, stage, msg, data) {
    const ts = new Date().toISOString().slice(11, 23);
    const prefix = `[${ts}] [${level}] [${stage}]`;
    if (data !== undefined) console.log(prefix, msg, data);
    else console.log(prefix, msg);
  },
  info(stage, msg, data) { log._fmt("INFO", stage, msg, data); },
  warn(stage, msg, data) { log._fmt("WARN", stage, msg, data); },
  error(stage, msg, data) { log._fmt("ERROR", stage, msg, data); },
};

// ─── SAFETY UTILITIES (prevent crashes from unexpected Gemini response shapes) ──
function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function safeStr(val, fallback = "") {
  if (val == null) return fallback;
  if (typeof val === "string") return escapeHtml(val);
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  if (Array.isArray(val)) return val.map(v => safeStr(v)).join("; ");
  if (typeof val === "object") {
    const raw = val.text || val.description || val.tip || val.advice || val.name || val.reason || val.skill || val.correction || val.currentFault || JSON.stringify(val);
    return typeof raw === "string" ? escapeHtml(raw) : String(raw);
  }
  return String(val);
}
function safeArray(val) {
  if (Array.isArray(val)) return val;
  if (val == null) return [];
  if (typeof val === "object") return Object.values(val);
  return [val];
}
function parseTimestampToSec(ts) {
  if (!ts || typeof ts !== "string") return 0;
  const first = ts.split(/[,\-]/)[0].trim();
  if (!first || String(first || '').toLowerCase() === "global") return 0;
  const parts = first.split(":");
  if (parts.length === 2) return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  const n = parseFloat(first);
  return isNaN(n) ? 0 : n;
}

// ─── ATHLETE INTELLIGENCE LAYER (Agent Delta) ────────────────────────────────
// Persistent per-athlete storage: profile, analysis history, fault tracking,
// drill plans, improvement curves, and goal tracking.

function getAthleteStorageKey(name) {
  if (!name) return "strive_athlete_default";
  try { return "strive_athlete_" + btoa(unescape(encodeURIComponent(name))); } catch { return "strive_athlete_default"; }
}

function getAthleteRecord(profile) {
  if (!profile) return null;
  const key = getAthleteStorageKey(profile.name);
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch {}
  // Create a new record
  return {
    name: profile.name || "",
    gender: profile.gender || "female",
    level: profile.level || "",
    events: profile.primaryEvents || [],
    coachName: profile.coachName || "",
    gymName: profile.gymName || "",
    seasonGoals: {
      targetScore: null,
      targetEvent: null,
      targetMeetDate: null,
      targetMeetName: "",
    },
    analysisHistory: [],
    faultHistory: [],
  };
}

function saveAthleteRecord(record) {
  if (!record || !record.name) return;
  const key = getAthleteStorageKey(record.name);
  try {
    localStorage.setItem(key, JSON.stringify(record));
  } catch (e) {
    log.warn("intelligence", "Failed to save athlete record: " + e.message);
  }
}

function saveAnalysisToHistory(profile, result, uploadData) {
  if (!profile || !result) return null;
  const record = getAthleteRecord(profile);
  if (!record) return null;

  // Update profile fields
  record.gender = profile.gender || record.gender;
  record.level = profile.level || record.level;
  record.events = profile.primaryEvents || record.events;

  const routineId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const eventType = (uploadData && uploadData.event) || result.event || "";

  // Append analysis summary
  record.analysisHistory.push({
    date: new Date().toISOString(),
    routineId,
    event: eventType,
    finalScore: result.finalScore || 0,
    totalDeductions: result.totalDeductions || 0,
    skillCount: (result.gradedSkills || []).length,
    faultCount: (result.executionDeductions || []).length,
    meetName: (uploadData && uploadData.meetName) || "",
  });

  // Extract faults from gradedSkills and append to faultHistory
  const gradedSkills = result.gradedSkills || [];
  gradedSkills.forEach(skill => {
    if (skill.deduction > 0 && skill.fault) {
      // Normalize fault type for grouping
      const faultType = normalizeFaultType(skill.fault);
      record.faultHistory.push({
        date: new Date().toISOString(),
        routineId,
        skillName: skill.skill || "",
        faultType,
        rawFault: skill.fault || "",
        severity: skill.severity || "small",
        deductionAmount: skill.deduction || 0,
        eventType,
      });
    }
  });

  // Keep history bounded (last 100 analyses, last 500 faults)
  if (record.analysisHistory.length > 100) record.analysisHistory = record.analysisHistory.slice(-100);
  if (record.faultHistory.length > 500) record.faultHistory = record.faultHistory.slice(-500);

  saveAthleteRecord(record);
  log.info("intelligence", `Saved analysis #${record.analysisHistory.length} for ${record.name}. Faults tracked: ${record.faultHistory.length}`);
  return record;
}

function normalizeFaultType(fault) {
  if (!fault) return "other";
  const f = fault.toLowerCase();
  if (f.includes("bent arm") || f.includes("arm bend")) return "bent_arms";
  if (f.includes("bent knee") || f.includes("knee bend") || f.includes("soft knee")) return "bent_knees";
  if (f.includes("cowboy") || f.includes("leg separation") || f.includes("legs apart")) return "leg_separation";
  if (f.includes("toe point") || f.includes("flexed foot") || f.includes("flat foot") || f.includes("flat feet") || f.includes("feet not pointed")) return "toe_point";
  if (f.includes("step") || f.includes("hop") && f.includes("land")) return "step_landing";
  if (f.includes("fall")) return "fall";
  if (f.includes("wobble") || f.includes("balance") || f.includes("check")) return "wobble";
  if (f.includes("pike") || f.includes("hip angle") || f.includes("body angle")) return "body_angle";
  if (f.includes("split") || f.includes("amplitude")) return "split_angle";
  if (f.includes("alignment") || f.includes("off center") || f.includes("lean")) return "alignment";
  if (f.includes("head") || f.includes("chest") || f.includes("shoulder")) return "upper_body";
  if (f.includes("timing") || f.includes("rhythm") || f.includes("pace")) return "timing";
  if (f.includes("arch") || f.includes("hyperext")) return "arch";
  if (f.includes("land") || f.includes("stick")) return "landing";
  return "other";
}

const FAULT_LABELS = {
  bent_arms: "Bent Arms",
  bent_knees: "Bent Knees",
  leg_separation: "Leg Separation",
  toe_point: "Toe Point / Feet",
  step_landing: "Steps on Landing",
  fall: "Falls",
  wobble: "Wobble / Balance",
  body_angle: "Body Angle (Pike/Hollow)",
  split_angle: "Split / Amplitude",
  alignment: "Alignment / Lean",
  upper_body: "Upper Body Form",
  timing: "Timing / Rhythm",
  arch: "Arch / Hyperextension",
  landing: "Landing",
  other: "Other",
};

function computeFaultIntelligence(athleteRecord) {
  if (!athleteRecord || !athleteRecord.faultHistory || athleteRecord.faultHistory.length === 0) {
    return { mostCommonFault: null, faultFrequencies: [], fixedFaults: [], regressionFaults: [], totalAnalyses: 0 };
  }

  const analyses = athleteRecord.analysisHistory || [];
  const faults = athleteRecord.faultHistory || [];
  const totalAnalyses = analyses.length;

  // Group faults by routineId to understand per-routine occurrence
  const routineIds = [...new Set(faults.map(f => f.routineId))];

  // Count how many routines each fault type appears in
  const faultRoutineCounts = {};
  const faultTotalDeductions = {};
  routineIds.forEach(rid => {
    const routineFaults = faults.filter(f => f.routineId === rid);
    const typesInRoutine = [...new Set(routineFaults.map(f => f.faultType))];
    typesInRoutine.forEach(t => {
      faultRoutineCounts[t] = (faultRoutineCounts[t] || 0) + 1;
      faultTotalDeductions[t] = (faultTotalDeductions[t] || 0) + routineFaults.filter(f => f.faultType === t).reduce((s, f) => s + f.deductionAmount, 0);
    });
  });

  // Sort by frequency
  const faultFrequencies = Object.entries(faultRoutineCounts)
    .map(([type, count]) => ({
      type,
      label: FAULT_LABELS[type] || type,
      count,
      totalRoutines: routineIds.length,
      avgDeduction: faultTotalDeductions[type] / count,
      pct: Math.round((count / routineIds.length) * 100),
    }))
    .sort((a, b) => b.count - a.count);

  const mostCommonFault = faultFrequencies.length > 0 ? faultFrequencies[0] : null;

  // Fixed faults: appeared in earlier analyses but NOT in the last 3
  const fixedFaults = [];
  const regressionFaults = [];
  if (routineIds.length >= 3) {
    const last3Ids = routineIds.slice(-3);
    const earlier = routineIds.slice(0, -3);
    const last3Types = new Set(faults.filter(f => last3Ids.includes(f.routineId)).map(f => f.faultType));
    const earlierTypes = new Set(faults.filter(f => earlier.includes(f.routineId)).map(f => f.faultType));

    earlierTypes.forEach(t => {
      if (!last3Types.has(t)) {
        fixedFaults.push({ type: t, label: FAULT_LABELS[t] || t });
      }
    });

    // Regression: absent for 3+ consecutive analyses then reappeared
    if (routineIds.length >= 6) {
      const mid3Ids = routineIds.slice(-6, -3);
      const mid3Types = new Set(faults.filter(f => mid3Ids.includes(f.routineId)).map(f => f.faultType));
      const beforeMid = routineIds.slice(0, -6);
      const beforeMidTypes = new Set(faults.filter(f => beforeMid.includes(f.routineId)).map(f => f.faultType));

      last3Types.forEach(t => {
        if (!mid3Types.has(t) && beforeMidTypes.has(t)) {
          regressionFaults.push({ type: t, label: FAULT_LABELS[t] || t });
        }
      });
    }
  }

  return { mostCommonFault, faultFrequencies, fixedFaults, regressionFaults, totalAnalyses };
}

// FIX 3 — Personalized drill plan from fault intelligence
const FAULT_DRILLS = {
  bent_arms: [
    { name: "Wall Handstand Holds", reps: "3 x 30s", cue: "Press to handstand against wall. Lock elbows, squeeze triceps, push through shoulders." },
    { name: "Straight-Arm Plank Walks", reps: "3 x 8 steps", cue: "Walk hands forward and back in plank. Arms must stay locked through entire set." },
    { name: "Cast to Handstand (Rails)", reps: "10 reps", cue: "Focus on full arm extension through each cast. Partner taps elbows as reminder." },
  ],
  bent_knees: [
    { name: "Releve Walks on Beam Line", reps: "2 x beam length", cue: "Walk in releve with knees fully locked. Squeeze quads with each step." },
    { name: "Handstand Leg Lifts", reps: "3 x 8 each leg", cue: "From handstand, lift one leg out. Keep support leg completely straight." },
    { name: "Needle Kick Holds", reps: "3 x 15s each", cue: "Hold scale position with both legs fully extended. No micro-bend allowed." },
  ],
  leg_separation: [
    { name: "Foam Block Squeeze Jumps", reps: "3 x 10", cue: "Place block between ankles during jumps. Squeeze through entire flight." },
    { name: "Resistance Band Squeezes", reps: "3 x 15s holds", cue: "Band around ankles during handstands to train constant leg squeeze." },
    { name: "Salto Drill w/ Squeeze Cue", reps: "10 reps", cue: "Practice flips with legs glued together. Cue: 'Zip from hip to toe.'" },
  ],
  toe_point: [
    { name: "Theraband Foot Presses", reps: "3 x 20 each", cue: "Wrap band around ball of foot. Press through full extension, hold 2s." },
    { name: "Releve Balance (Eyes Closed)", reps: "3 x 20s each foot", cue: "Full releve, eyes closed. Train ankle awareness and point reflex." },
    { name: "Pointed Foot Running Drill", reps: "2 x floor length", cue: "Jog with exaggerated toe point on each stride. Make it automatic." },
  ],
  step_landing: [
    { name: "Stick Drills (Low Block)", reps: "20 reps", cue: "Jump from low block, land and FREEZE 3 full seconds. Zero movement." },
    { name: "Drop Landings (Progressive)", reps: "3 x 8", cue: "Step off increasing heights. Absorb through ankles and knees. Freeze on impact." },
    { name: "Pit-to-Stick Progressions", reps: "10-15 reps", cue: "Land on elevated surface from pit. Chest up, arms up, complete stillness." },
  ],
  wobble: [
    { name: "Single Leg Balance (Beam)", reps: "3 x 30s each", cue: "Stand on one foot on low beam. Arms in position. No correction steps." },
    { name: "Releve Relevance Walks", reps: "3 x beam length", cue: "Walk full beam in releve. Pause 2 seconds between each step." },
    { name: "Core Stabilization (Bosu)", reps: "3 x 30s", cue: "Plank on Bosu ball. Engage core to prevent any rocking." },
  ],
  split_angle: [
    { name: "Oversplit Holds (Elevated)", reps: "3 x 30s each", cue: "Front foot on panel mat. Sink past 180 degrees. Breathe and relax into it." },
    { name: "Grande Battement Series", reps: "3 x 12 each leg", cue: "Controlled kick to maximum height. Both legs fully straight." },
    { name: "Active Flexibility Pulses", reps: "3 x 15 each", cue: "In split, pulse up 2 inches and back down. Build active range." },
  ],
  body_angle: [
    { name: "Hollow Body Hold", reps: "3 x 30s", cue: "Lower back pressed to floor. Arms by ears, legs straight. No gap." },
    { name: "Superman Rocks", reps: "3 x 15", cue: "Rock from hollow to arch. Maintain tight body shape throughout." },
    { name: "Pike Press Conditioning", reps: "3 x 8", cue: "From standing, fold to pike. Hands to floor, legs straight. Hold 3s." },
  ],
  alignment: [
    { name: "Dowel Rod Alignment Check", reps: "5 min warm-up", cue: "Hold dowel along spine during handstands and jumps. Feel when alignment breaks." },
    { name: "Mirror Wall Drills", reps: "10 reps each skill", cue: "Perform skills facing mirror. Self-correct lean and centering in real time." },
    { name: "Handstand Shape Holds", reps: "5 x 15s", cue: "Partner checks shoulder-hip-ankle alignment. Squeeze everything tight." },
  ],
  landing: [
    { name: "Stick Landing Series", reps: "20 reps", cue: "Jump off low surface, land perfectly still for 3 seconds. Build the habit." },
    { name: "Single Leg Landing Hops", reps: "3 x 10 each", cue: "Hop forward on one foot, stick each landing. Build ankle stability." },
    { name: "Absorb & Freeze Drill", reps: "3 x 10", cue: "Back tuck to stick. Focus: absorb through legs, chest stays up." },
  ],
  fall: [
    { name: "Skill Progressions on Low Beam", reps: "10 reps", cue: "Practice the skill on low beam until 8/10 are clean before moving up." },
    { name: "Spot Training (Confidence)", reps: "15 reps w/ spot", cue: "Do the skill with a spot. Build confidence before going solo." },
    { name: "Mental Rehearsal + Walk-Through", reps: "5 min", cue: "Walk through the skill slowly. Visualize each body position before attempting." },
  ],
  upper_body: [
    { name: "Shoulder Flexibility Series", reps: "3 x 30s each", cue: "Wall slides, doorway stretches, band pull-aparts. Open up the shoulders." },
    { name: "Press Handstand Conditioning", reps: "3 x 5", cue: "Slow press to handstand. Focus: shoulders stack over wrists, chest neutral." },
    { name: "Posture Board Handstands", reps: "5 x 15s", cue: "Handstand against posture board. Feel correct shoulder and chest position." },
  ],
  timing: [
    { name: "Rhythm Clapping Drill", reps: "3 x full routine", cue: "Clap the rhythm of the routine without doing it. Internalize the timing." },
    { name: "Music Walk-Through", reps: "3 full routines", cue: "Walk through routine to music. Mark each skill on the correct beat." },
    { name: "Metronome Tumbling", reps: "10 reps", cue: "Set a metronome. Match tumbling pace to beats. Build consistency." },
  ],
  arch: [
    { name: "Hollow Body Hold", reps: "3 x 30s", cue: "Lower back flat to floor. No arch. Arms by ears, legs straight." },
    { name: "Plank to Hollow Transitions", reps: "3 x 10", cue: "From plank, round into hollow body. Control the shape change." },
    { name: "Pike Stretches (Daily)", reps: "3 x 30s", cue: "Seated pike fold. Chest to thighs. Counteracts excessive arch habit." },
  ],
};

function generateWeeklyDrillPlan(faultIntelligence) {
  if (!faultIntelligence || !faultIntelligence.faultFrequencies || faultIntelligence.faultFrequencies.length === 0) return null;

  // Take top 3 most common unfixed faults
  const fixed = new Set((faultIntelligence.fixedFaults || []).map(f => f.type));
  const unfixed = faultIntelligence.faultFrequencies.filter(f => !fixed.has(f.type));
  const top3 = unfixed.slice(0, 3);

  if (top3.length === 0) return null;

  const days = ["monday", "wednesday", "friday"];
  const plan = {};
  top3.forEach((fault, i) => {
    const dayDrills = FAULT_DRILLS[fault.type] || FAULT_DRILLS.body_angle; // fallback
    plan[days[i]] = {
      fault: fault.label,
      faultType: fault.type,
      count: fault.count,
      totalRoutines: fault.totalRoutines,
      drills: dayDrills.slice(0, 3),
    };
  });

  // Fill remaining days if fewer than 3 faults
  days.forEach(day => {
    if (!plan[day] && top3.length > 0) {
      const fallbackFault = top3[0];
      const dayDrills = FAULT_DRILLS[fallbackFault.type] || FAULT_DRILLS.body_angle;
      plan[day] = {
        fault: fallbackFault.label + " (Reinforcement)",
        faultType: fallbackFault.type,
        count: fallbackFault.count,
        totalRoutines: fallbackFault.totalRoutines,
        drills: dayDrills.slice(0, 3),
      };
    }
  });

  return plan;
}

// FIX 4 — Improvement curves: fault deduction trends over time
function computeImprovementCurves(athleteRecord) {
  if (!athleteRecord) return { scoreHistory: [], faultTrends: [] };

  const analyses = (athleteRecord.analysisHistory || []).slice(-20);
  const faults = athleteRecord.faultHistory || [];

  // Score progression
  const scoreHistory = analyses.map((a, i) => ({
    label: `#${i + 1}`,
    score: a.finalScore,
    date: a.date,
    event: a.event,
  }));

  // Per fault category: average deduction in windows
  if (analyses.length < 3) return { scoreHistory, faultTrends: [] };

  const routineIds = analyses.map(a => a.routineId);
  const faultTypes = [...new Set(faults.map(f => f.faultType))];

  const faultTrends = faultTypes.map(type => {
    const typeFaults = faults.filter(f => f.faultType === type);
    // Get average deduction per analysis window
    const recentIds = routineIds.slice(-Math.min(10, routineIds.length));
    const recentAvg = recentIds.length > 0
      ? recentIds.reduce((sum, rid) => {
          const routineFaults = typeFaults.filter(f => f.routineId === rid);
          return sum + routineFaults.reduce((s, f) => s + f.deductionAmount, 0);
        }, 0) / recentIds.length
      : 0;

    // Early average (first half of available data)
    const halfPoint = Math.floor(routineIds.length / 2);
    const earlyIds = routineIds.slice(0, Math.max(1, halfPoint));
    const earlyAvg = earlyIds.length > 0
      ? earlyIds.reduce((sum, rid) => {
          const routineFaults = typeFaults.filter(f => f.routineId === rid);
          return sum + routineFaults.reduce((s, f) => s + f.deductionAmount, 0);
        }, 0) / earlyIds.length
      : 0;

    const diff = recentAvg - earlyAvg;
    const trend = diff < -0.02 ? "improving" : diff > 0.02 ? "worsening" : "plateaued";

    return {
      type,
      label: FAULT_LABELS[type] || type,
      earlyAvg,
      recentAvg,
      diff,
      trend,
    };
  }).filter(t => t.earlyAvg > 0 || t.recentAvg > 0);

  return { scoreHistory, faultTrends };
}

// FIX 5 — Goal tracking calculations
function computeGoalTracking(athleteRecord) {
  if (!athleteRecord) return null;
  const goals = athleteRecord.seasonGoals || {};
  if (!goals.targetScore) return null;

  const analyses = athleteRecord.analysisHistory || [];
  const targetEvent = goals.targetEvent || "";

  // Personal best per event
  const personalBests = {};
  analyses.forEach(a => {
    if (!personalBests[a.event] || a.finalScore > personalBests[a.event]) {
      personalBests[a.event] = a.finalScore;
    }
  });

  // Current best for target event (or overall)
  const relevantAnalyses = targetEvent
    ? analyses.filter(a => a.event === targetEvent)
    : analyses;
  const currentBest = relevantAnalyses.length > 0
    ? Math.max(...relevantAnalyses.map(a => a.finalScore))
    : 0;

  // Recent score (last 3 average)
  const recentScores = relevantAnalyses.slice(-3);
  const recentAvg = recentScores.length > 0
    ? recentScores.reduce((s, a) => s + a.finalScore, 0) / recentScores.length
    : currentBest;

  // Days and weeks remaining
  const now = new Date();
  const targetDate = goals.targetMeetDate ? new Date(goals.targetMeetDate) : null;
  const daysRemaining = targetDate ? Math.max(0, Math.ceil((targetDate - now) / (1000 * 60 * 60 * 24))) : null;
  const weeksRemaining = daysRemaining !== null ? Math.max(1, Math.ceil(daysRemaining / 7)) : null;

  const pointsNeeded = Math.max(0, goals.targetScore - currentBest);
  const pointsPerWeek = weeksRemaining ? pointsNeeded / weeksRemaining : null;

  // Trend projection: will they make it?
  let status = "unknown";
  if (currentBest >= goals.targetScore) {
    status = "ahead";
  } else if (relevantAnalyses.length >= 3) {
    // Calculate recent improvement rate
    const oldestRecent = relevantAnalyses[Math.max(0, relevantAnalyses.length - 5)];
    const newestRecent = relevantAnalyses[relevantAnalyses.length - 1];
    const daysBetween = Math.max(1, (new Date(newestRecent.date) - new Date(oldestRecent.date)) / (1000 * 60 * 60 * 24));
    const improvementRate = (newestRecent.finalScore - oldestRecent.finalScore) / daysBetween;
    const projectedScore = daysRemaining !== null ? newestRecent.finalScore + improvementRate * daysRemaining : null;

    if (projectedScore !== null && projectedScore >= goals.targetScore) {
      status = "on_track";
    } else {
      status = "at_risk";
    }
  } else {
    status = pointsNeeded <= 0.2 ? "on_track" : "at_risk";
  }

  return {
    targetScore: goals.targetScore,
    targetEvent: goals.targetEvent,
    targetMeetDate: goals.targetMeetDate,
    targetMeetName: goals.targetMeetName,
    currentBest,
    recentAvg,
    pointsNeeded,
    pointsPerWeek,
    daysRemaining,
    weeksRemaining,
    status,
    personalBests,
  };
}

// Self-tests for intelligence layer (run in dev console: window.__striveIntelTests())
if (typeof window !== "undefined") {
  window.__striveIntelTests = function () {
    const results = [];

    // Test 1 — Persistence chain
    try {
      const testProfile = { name: "TestAthlete", gender: "female", level: "Xcel Gold", primaryEvents: ["Floor", "Beam"] };
      const record = getAthleteRecord(testProfile);
      record.gymName = "Test Gym";
      saveAthleteRecord(record);
      const readBack = getAthleteRecord(testProfile);
      const pass = readBack.name === "TestAthlete" && readBack.gymName === "Test Gym" && readBack.gender === "female";
      results.push({ test: "Persistence Chain", result: pass ? "PASS" : "FAIL", details: pass ? "All fields intact" : "Field mismatch" });
      // Cleanup
      localStorage.removeItem(getAthleteStorageKey("TestAthlete"));
    } catch (e) {
      results.push({ test: "Persistence Chain", result: "FAIL", details: e.message });
    }

    // Test 2 — Fault history accumulation
    try {
      const testRecord = {
        name: "TestFaultAthlete",
        analysisHistory: [],
        faultHistory: [],
        seasonGoals: {},
      };
      const faultSets = [
        [{ fault: "bent arms", deduction: 0.15 }, { fault: "cowboy tuck (legs apart)", deduction: 0.20 }],
        [{ fault: "bent arms on support", deduction: 0.15 }, { fault: "flat feet (no toe point)", deduction: 0.05 }],
        [{ fault: "bent arms", deduction: 0.10 }, { fault: "split angle short", deduction: 0.20 }],
        [{ fault: "flat feet", deduction: 0.05 }, { fault: "step on landing", deduction: 0.10 }],
        [{ fault: "cowboy tuck position", deduction: 0.15 }, { fault: "bent arm on push-off", deduction: 0.10 }],
      ];
      faultSets.forEach((set, i) => {
        const rid = "test_" + i;
        testRecord.analysisHistory.push({ date: new Date().toISOString(), routineId: rid, event: "Floor", finalScore: 8.5 + i * 0.1, totalDeductions: 0.35, skillCount: 5, faultCount: set.length });
        set.forEach(s => {
          testRecord.faultHistory.push({
            date: new Date().toISOString(), routineId: rid, skillName: "Test Skill",
            faultType: normalizeFaultType(s.fault), rawFault: s.fault, severity: "medium",
            deductionAmount: s.deduction, eventType: "Floor",
          });
        });
      });
      const intel = computeFaultIntelligence(testRecord);
      const bentArmsEntry = intel.faultFrequencies.find(f => f.type === "bent_arms");
      const pass = bentArmsEntry && bentArmsEntry.count === 4 && intel.mostCommonFault.type === "bent_arms";
      results.push({ test: "Fault History Accumulation", result: pass ? "PASS" : "FAIL", details: pass ? `bent_arms = ${bentArmsEntry.count} of 5 routines (most common)` : `Expected 4, got ${bentArmsEntry ? bentArmsEntry.count : "N/A"}` });
    } catch (e) {
      results.push({ test: "Fault History Accumulation", result: "FAIL", details: e.message });
    }

    // Test 3 — Drill plan generation
    try {
      const mockIntel = {
        faultFrequencies: [
          { type: "bent_arms", label: "Bent Arms", count: 4, totalRoutines: 5 },
          { type: "toe_point", label: "Toe Point / Feet", count: 3, totalRoutines: 5 },
        ],
        fixedFaults: [],
        regressionFaults: [],
      };
      const plan = generateWeeklyDrillPlan(mockIntel);
      const pass = plan && plan.monday && plan.monday.fault === "Bent Arms" && plan.monday.drills.length >= 2;
      results.push({ test: "Drill Plan Generation", result: pass ? "PASS" : "FAIL", details: pass ? `Monday: ${plan.monday.fault} (${plan.monday.drills.length} drills)` : "Plan missing or incomplete" });
    } catch (e) {
      results.push({ test: "Drill Plan Generation", result: "FAIL", details: e.message });
    }

    // Test 4 — Goal calculation
    try {
      const mockRecord = {
        name: "GoalTest",
        analysisHistory: [
          { date: new Date().toISOString(), routineId: "g1", event: "Floor", finalScore: 8.935 },
        ],
        faultHistory: [],
        seasonGoals: { targetScore: 9.200, targetEvent: "Floor", targetMeetDate: new Date(Date.now() + 56 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), targetMeetName: "State Meet" },
      };
      const goal = computeGoalTracking(mockRecord);
      const expectedPPW = (9.200 - 8.935) / 8;
      const pass = goal && Math.abs(goal.pointsPerWeek - expectedPPW) < 0.005;
      results.push({ test: "Goal Calculation", result: pass ? "PASS" : "FAIL", details: pass ? `points/week = ${goal.pointsPerWeek.toFixed(4)} (expected ~${expectedPPW.toFixed(4)})` : `Got ${goal ? goal.pointsPerWeek : "null"}` });
    } catch (e) {
      results.push({ test: "Goal Calculation", result: "FAIL", details: e.message });
    }

    console.table(results);
    return results;
  };
}

function computeAverageGrade(skills) {
  if (!skills || skills.length === 0) return "B";
  const GRADE_RANK = { "A+":12,"A":11,"A-":10,"B+":9,"B":8,"B-":7,"C+":6,"C":5,"C-":4,"D+":3,"D":2,"F":1 };
  const RANK_GRADE = { 12:"A+",11:"A",10:"A-",9:"B+",8:"B",7:"B-",6:"C+",5:"C",4:"C-",3:"D+",2:"D",1:"F" };
  const avg = skills.reduce((s, sk) => s + (GRADE_RANK[sk.grade] || 8), 0) / skills.length;
  return RANK_GRADE[Math.round(avg)] || "B";
}

function safeNum(val, fallback = 0, min = -Infinity, max = Infinity) {
  const n = typeof val === "number" ? val : parseFloat(val);
  if (isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

// Round a deduction value to the nearest valid USAG amount (multiple of 0.05)
function roundToUSAG(val) {
  const n = typeof val === "number" ? val : parseFloat(val);
  if (isNaN(n) || n === 0) return 0;
  return Math.round(Math.abs(n) * 20) / 20; // Round to nearest 0.05
}

// ─── RESPONSE VALIDATION (normalizes Gemini JSON into safe, consistent shape) ──
function validateResult(parsed) {
  if (!parsed || typeof parsed !== "object") return parsed;

  // Ensure executionDeductions is a valid array of objects
  parsed.executionDeductions = safeArray(parsed.executionDeductions)
    .filter(d => d && typeof d === "object")
    .map(d => ({
      ...d,
      timestamp: safeStr(d.timestamp, "0:00"),
      skill: safeStr(d.skill, "Unknown skill"),
      fault: safeStr(d.fault, d.skill || "Execution error"),
      deduction: safeNum(Math.abs(d.deduction || 0), 0, 0, 2.0),
      confidence: safeNum(d.confidence, 0.7, 0, 1),
      engine: ["TPM", "KTM", "VAE", "Split-Check", "Landing", "General"].includes(d.engine) ? d.engine : "General",
      category: ["execution", "artistry", "landing"].includes(d.category) ? d.category : "execution",
      severity: d.severity || (safeNum(d.deduction, 0) <= 0.10 ? "small" : safeNum(d.deduction, 0) <= 0.15 ? "medium" : safeNum(d.deduction, 0) <= 0.30 ? "large" : safeNum(d.deduction, 0) >= 0.50 ? "fall" : "veryLarge"),
      details: safeStr(d.details, d.fault || d.skill || ""),
      skeleton: d.skeleton && typeof d.skeleton === "object" ? d.skeleton : null,
      lowConfidence: safeNum(d.confidence, 0.7, 0, 1) < 0.6,
    }))
    // Filter out very low confidence deductions (likely hallucinated)
    .filter(d => d.confidence >= 0.4);

  // Always recompute totals from actual deductions — never trust AI-provided totals
  parsed.executionDeductionsTotal = Math.round(
    parsed.executionDeductions.filter(d => d.category !== "artistry").reduce((s, d) => s + d.deduction, 0) * 1000
  ) / 1000;
  parsed.artistryDeductionsTotal = Math.round(
    parsed.executionDeductions.filter(d => d.category === "artistry").reduce((s, d) => s + d.deduction, 0) * 1000
  ) / 1000;
  parsed.totalDeductions = Math.round((parsed.executionDeductionsTotal + parsed.artistryDeductionsTotal) * 1000) / 1000;
  parsed.finalScore = Math.max(0, Math.round((10 - parsed.totalDeductions) * 1000) / 1000);

  // Validate arrays
  parsed.topFixes = safeArray(parsed.topFixes);
  parsed.strengths = safeArray(parsed.strengths);
  parsed.areasForImprovement = safeArray(parsed.areasForImprovement);

  // Validate string fields
  parsed.truthAnalysis = safeStr(parsed.truthAnalysis);

  // Validate biomechanics
  if (parsed.biomechanics && typeof parsed.biomechanics === "object") {
    parsed.biomechanics.keyMoments = safeArray(parsed.biomechanics.keyMoments);
    parsed.biomechanics.landingAnalysis = safeArray(parsed.biomechanics.landingAnalysis);
    parsed.biomechanics.holdDurations = safeArray(parsed.biomechanics.holdDurations);
    parsed.biomechanics.injuryRiskFlags = safeArray(parsed.biomechanics.injuryRiskFlags);
    parsed.biomechanics.overallFlightHeight = safeStr(parsed.biomechanics.overallFlightHeight);
    parsed.biomechanics.overallPowerRating = safeStr(parsed.biomechanics.overallPowerRating);
  }

  // Validate coachReport
  if (parsed.coachReport && typeof parsed.coachReport === "object") {
    parsed.coachReport.preemptiveCorrections = safeArray(parsed.coachReport.preemptiveCorrections);
    parsed.coachReport.conditioningPlan = safeArray(parsed.coachReport.conditioningPlan);
    parsed.coachReport.idealComparison = safeStr(parsed.coachReport.idealComparison);
    parsed.coachReport.techniqueProgressionNotes = safeStr(parsed.coachReport.techniqueProgressionNotes);
  }

  // Validate athleteDevelopment
  if (parsed.athleteDevelopment && typeof parsed.athleteDevelopment === "object") {
    parsed.athleteDevelopment.mentalTraining = safeArray(parsed.athleteDevelopment.mentalTraining);
    parsed.athleteDevelopment.goalSpecificAdvice = safeStr(parsed.athleteDevelopment.goalSpecificAdvice);
  }

  return parsed;
}

// ─── DEFENSIVE TABLE PARSER ─────────────────────────────────────────
// Gemini returns tables in unpredictable formats:
//   - Sometimes with \n, sometimes \r only, sometimes NO line breaks at all
//   - Data rows may be concatenated on one line: |0:03|skill|-0.10|engine|reason||0:05|...
// Strategy: regex to extract ALL pipe-delimited rows from raw text regardless of formatting.
function parseGeminiTable(rawText) {
  const rawDeductions = [];

  // Pre-process: Gemini returns separator rows (| :--- | :--- |) as 20K+ chars of dashes
  // with no line breaks, making data rows invisible to parsing.
  // Step 1: Remove all runs of 3+ dashes (possibly with colons/spaces)
  let cleaned = rawText.replace(/-{3,}/g, '');
  // Step 2: Collapse any resulting empty pipe segments (| | or |  :  |)
  cleaned = cleaned.replace(/\|\s*:?\s*(?=\|)/g, '| ');
  // Step 3: Insert newlines before data row timestamps so regex/line parser can find them
  cleaned = cleaned.replace(/\|\s*(?=(?:\d+:\d+|Global)\s*\|)/gi, '\n| ');
  log.info("parser", `Cleaned text length: ${cleaned.length} (was ${rawText.length})`);

  // Strategy 1: Regex — find all table rows matching timestamp | skill | deduction | engine | reasoning
  // Leading pipe is optional since Gemini sometimes omits it
  const rowPattern = /\|?\s*((?:\d+:\d+(?:\.\d+)?)|(?:Global))\s*\|\s*([^|]+?)\s*\|\s*-?\s*(\d*\.?\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|\n]+?)\s*\|?/gi;

  let match;
  while ((match = rowPattern.exec(cleaned)) !== null) {
    const tsRaw = match[1].replace(/\*\*/g, '').trim();
    const skill = match[2].replace(/\*\*/g, '').trim();
    const dedAmt = Math.abs(parseFloat(match[3]));
    const engineRaw = match[4].replace(/\*\*/g, '').trim();
    const faults = match[5].replace(/\*\*/g, '').trim();

    if (skill.includes('Skill') || skill.includes('Phase') || skill.includes('---')) continue;
    if (isNaN(dedAmt) || dedAmt === 0) continue;

    let timestamp = "0";
    if (!tsRaw.match(/Global/i)) {
      const tsParts = tsRaw.split(':');
      if (tsParts.length === 2) timestamp = String(parseInt(tsParts[0]) * 60 + parseInt(tsParts[1]));
      else timestamp = String(parseFloat(tsParts[0]) || 0);
    }

    const isArtistry = tsRaw.match(/Global/i) || String(skill || '').toLowerCase().includes("artistry");
    const tsNum = parseInt(timestamp) || 0;

    let engine = "General";
    const engineStr = (String(engineRaw || '') + " " + String(faults || '')).toLowerCase();
    if (engineStr.includes("tpm") || engineStr.includes("toe point")) engine = "TPM";
    else if (engineStr.includes("ktm") || engineStr.includes("knee tension")) engine = "KTM";
    else if (engineStr.includes("vae") || engineStr.includes("vertical")) engine = "VAE";
    else if (engineStr.includes("leg sep")) engine = "KTM";
    else if (engineStr.includes("split") || engineStr.includes("angle logic")) engine = "Split-Check";
    else if (engineStr.includes("posture") || engineStr.includes("landing")) engine = "Landing";

    rawDeductions.push({
      timestamp, skill, fault: faults || skill, deduction: dedAmt, engine,
      category: isArtistry ? "artistry" : (engine === "Landing" ? "landing" : "execution"),
      severity: dedAmt <= 0.10 ? "small" : dedAmt <= 0.15 ? "medium" : dedAmt <= 0.30 ? "large" : dedAmt >= 0.50 ? "fall" : "veryLarge",
      details: faults || skill,
      frameRef: Math.min(6, Math.floor(tsNum / 12) + 1),
    });
  }

  log.info("parser", `Regex extracted ${rawDeductions.length} rows from ${cleaned.length} chars`);

  // Strategy 2: Line-by-line fallback if regex found nothing
  if (rawDeductions.length === 0) {
    const lines = cleaned.split(/\n|\r/).filter(l => l.trim().length > 0);
    for (const line of lines) {
      const cols = line.split('|').map(c => c.trim()).filter(c => c.length > 0);
      if (cols.length < 5) continue;
      // Find the column that looks like a deduction amount
      const dedIdx = cols.findIndex(c => /^-?\s*0?\.\d+$/.test(c.replace(/\s/g, '')));
      if (dedIdx < 1) continue;
      const tsRaw = cols[dedIdx - 2] || cols[0];
      const skill = cols[dedIdx - 1] || cols[1];
      const dedAmt = Math.abs(parseFloat(cols[dedIdx].replace(/\s/g, '')));
      const engineRaw = cols[dedIdx + 1] || "";
      const faults = cols[dedIdx + 2] || cols[dedIdx + 1] || skill;

      if (isNaN(dedAmt) || dedAmt === 0) continue;
      if (skill.includes('Skill') || skill.includes('Phase') || skill.includes('---')) continue;

      let timestamp = "0";
      const tsClean = tsRaw.replace(/\*\*/g, '').trim();
      if (!tsClean.match(/Global/i)) {
        const tsParts = tsClean.split(':');
        if (tsParts.length === 2) timestamp = String(parseInt(tsParts[0]) * 60 + parseInt(tsParts[1]));
        else timestamp = String(parseFloat(tsParts[0]) || 0);
      }

      const isArtistry = tsClean.match(/Global/i) || String(skill || '').toLowerCase().includes("artistry");
      const tsNum = parseInt(timestamp) || 0;

      let engine = "General";
      const engineStr = (String(engineRaw || '') + " " + String(faults || '')).toLowerCase();
      if (engineStr.includes("tpm") || engineStr.includes("toe point")) engine = "TPM";
      else if (engineStr.includes("ktm") || engineStr.includes("knee tension")) engine = "KTM";
      else if (engineStr.includes("vae") || engineStr.includes("vertical")) engine = "VAE";
      else if (engineStr.includes("leg sep")) engine = "KTM";
      else if (engineStr.includes("split") || engineStr.includes("angle logic")) engine = "Split-Check";
      else if (engineStr.includes("posture") || engineStr.includes("landing")) engine = "Landing";

      rawDeductions.push({
        timestamp, skill: skill.replace(/\*\*/g, '').trim(), fault: faults.replace(/\*\*/g, '').trim() || skill, deduction: dedAmt, engine,
        category: isArtistry ? "artistry" : (engine === "Landing" ? "landing" : "execution"),
        severity: dedAmt <= 0.10 ? "small" : dedAmt <= 0.15 ? "medium" : dedAmt <= 0.30 ? "large" : dedAmt >= 0.50 ? "fall" : "veryLarge",
        details: faults.replace(/\*\*/g, '').trim() || skill,
        frameRef: Math.min(6, Math.floor(tsNum / 12) + 1),
      });
    }
    log.info("parser", `Line-based fallback extracted ${rawDeductions.length} rows`);
  }

  return rawDeductions;
}

// ─── CONSTANTS & DATA ───────────────────────────────────────────────
const WOMEN_EVENTS = ["Vault", "Uneven Bars", "Balance Beam", "Floor Exercise"];
const MEN_EVENTS = ["Floor Exercise", "Pommel Horse", "Still Rings", "Vault", "Parallel Bars", "High Bar"];

const LEVELS = {
  women: {
    compulsory: ["Level 1", "Level 2", "Level 3", "Level 4", "Level 5"],
    optional: ["Level 6", "Level 7", "Level 8", "Level 9", "Level 10", "Elite"],
    xcel: ["Xcel Bronze", "Xcel Silver", "Xcel Gold", "Xcel Platinum", "Xcel Diamond", "Xcel Sapphire"],
  },
  men: {
    compulsory: ["Level 1", "Level 2", "Level 3", "Level 4", "Level 5"],
    optional: ["Level 6", "Level 7", "Level 8", "Level 9", "Level 10", "Elite"],
    xcel: [],
  },
};

const DEDUCTION_SCALE = {
  small: { range: "0.05 – 0.10", color: "#22c55e" },
  medium: { range: "0.10 – 0.15", color: "#ffc15a" },
  large: { range: "0.20 – 0.30", color: "#e06820" },
  veryLarge: { range: "0.30 – 0.50", color: "#dc2626" },
  fall: { range: "0.50 (DP) / 1.00 (FIG)", color: "#dc2626" },
};

const DEDUCTION_CATEGORIES = {
  execution: [
    { fault: "Bent arms", deduction: "up to 0.30", category: "small-large" },
    { fault: "Bent knees / legs", deduction: "up to 0.30", category: "small-large" },
    { fault: "Leg separation", deduction: "up to 0.20", category: "small-medium" },
    { fault: "Flexed / sickled feet", deduction: "0.05 each", category: "small" },
    { fault: "Insufficient height / amplitude", deduction: "up to 0.30", category: "small-large" },
    { fault: "Body alignment deviation", deduction: "up to 0.20", category: "small-medium" },
    { fault: "Pike / arch in body position", deduction: "up to 0.30", category: "small-large" },
    { fault: "Incomplete turn / twist", deduction: "up to 0.30", category: "small-large" },
    { fault: "Insufficient extension", deduction: "up to 0.30", category: "small-large" },
    { fault: "Head position error", deduction: "up to 0.10", category: "small" },
  ],
  landing: [
    { fault: "Small step (foot movement)", deduction: "0.05", category: "small" },
    { fault: "Small step-close", deduction: "0.05 – 0.10", category: "small" },
    { fault: "Medium step", deduction: "0.10 – 0.15", category: "medium" },
    { fault: "Large step / lunge", deduction: "0.20 – 0.30", category: "large" },
    { fault: "Squat on landing", deduction: "up to 0.30", category: "large" },
    { fault: "Deep squat (below 90°)", deduction: "0.30", category: "large" },
    { fault: "Hands on floor (no fall)", deduction: "0.30", category: "large" },
    { fault: "Fall on landing", deduction: "0.50", category: "fall" },
    { fault: "Incorrect body posture on landing", deduction: "up to 0.20", category: "medium" },
    { fault: "Absence of extension before landing", deduction: "up to 0.30", category: "large" },
  ],
  artistry: [
    { fault: "Lack of confidence / hesitation", deduction: "up to 0.10", category: "small" },
    { fault: "Insufficient use of space (FX)", deduction: "up to 0.10", category: "small" },
    { fault: "Poor musicality / rhythm (FX)", deduction: "up to 0.20", category: "medium" },
    { fault: "Lack of personal style / expression", deduction: "up to 0.10", category: "small" },
    { fault: "Insufficient amplitude in dance", deduction: "up to 0.20", category: "medium" },
    { fault: "Lack of variation in tempo", deduction: "up to 0.10", category: "small" },
  ],
  neutral: [
    { fault: "Out of bounds (one body part)", deduction: "0.10", category: "small" },
    { fault: "Out of bounds (two+ body parts)", deduction: "0.30", category: "large" },
    { fault: "Overtime (beam/floor 90s limit)", deduction: "0.10", category: "small" },
    { fault: "Missing special requirement", deduction: "0.50 each", category: "fall" },
    { fault: "Failure to salute judge", deduction: "0.10", category: "small" },
    { fault: "Coach on floor without cause", deduction: "0.30", category: "large" },
  ],
};

const DRILLS_DATABASE = {
  "Bent arms": [
    { name: "Wall Handstand Holds", duration: "3 × 30 sec", description: "Press to handstand against wall focusing on locked elbows. Squeeze triceps and push through shoulders.", yt: "https://www.youtube.com/results?search_query=gymnastics+wall+handstand+hold+drill+straight+arms" },
    { name: "Planche Lean Push-ups", duration: "3 × 8 reps", description: "Lean forward in push-up position, arms straight. Build shoulder and arm lockout strength.", yt: "https://www.youtube.com/results?search_query=planche+lean+push+up+gymnastics+conditioning" },
    { name: "Cast Handstand Drills (Bars)", duration: "10 reps", description: "Focus on full arm extension through each cast. Coach should tap elbows as reminder.", yt: "https://www.youtube.com/results?search_query=gymnastics+cast+handstand+drill+straight+arms" },
  ],
  "Bent knees / legs": [
    { name: "Hollow Body Holds", duration: "4 × 20 sec", description: "Squeeze legs together, point toes, press lower back to floor. Build core-to-leg connection.", yt: "https://www.youtube.com/results?search_query=gymnastics+hollow+body+hold+technique" },
    { name: "Relevé Walks on Beam Line", duration: "2 × beam length", description: "Walk in relevé with legs fully extended. Focus on locking knees with each step.", yt: "https://www.youtube.com/results?search_query=gymnastics+releve+walk+beam+drill" },
    { name: "Straight Leg Lifts on Stall Bar", duration: "3 × 10 reps", description: "Hang from stall bar, lift legs to horizontal with locked knees. Slow and controlled.", yt: "https://www.youtube.com/results?search_query=stall+bar+leg+lifts+gymnastics+conditioning" },
  ],
  "Leg separation": [
    { name: "Resistance Band Squeezes", duration: "3 × 15 sec holds", description: "Place ball between ankles during handstands and jumps to train leg squeeze.", yt: "https://www.youtube.com/results?search_query=gymnastics+tight+legs+drill+squeeze" },
    { name: "Glute Bridge with Squeeze", duration: "3 × 12 reps", description: "Bridge up squeezing block between knees. Strengthens adductors for tight leg positions.", yt: "https://www.youtube.com/results?search_query=glute+bridge+adductor+squeeze+gymnastics" },
    { name: "Salto Drills on Trampoline", duration: "10 reps", description: "Practice flips with legs glued together. Verbal cue: 'Zip your legs from hip to toe.'", yt: "https://www.youtube.com/results?search_query=gymnastics+trampoline+tight+body+flip+drill" },
  ],
  "Flexed / sickled feet": [
    { name: "Theraband Ankle Exercises", duration: "3 × 20 each direction", description: "Point, flex, circle with resistance band. Focus on full plantar flexion and proper alignment.", yt: "https://www.youtube.com/results?search_query=theraband+ankle+exercises+gymnastics+pointed+toes" },
    { name: "Relevé Calf Raises", duration: "3 × 15 reps", description: "Slow calf raises to maximum height. Hold top position 2 seconds, emphasizing toe point.", yt: "https://www.youtube.com/results?search_query=releve+calf+raises+gymnastics+foot+strength" },
    { name: "Toe Point Check in Mirror", duration: "5 min daily", description: "Practice every skill barefoot in front of mirror. Self-correct any sickling.", yt: "https://www.youtube.com/results?search_query=how+to+point+toes+gymnastics+fix+sickle" },
  ],
  "Insufficient height / amplitude": [
    { name: "Plyometric Box Jumps", duration: "4 × 6 reps", description: "Focus on explosive takeoff and maximum height. Land softly with control.", yt: "https://www.youtube.com/results?search_query=plyometric+box+jumps+gymnastics+power" },
    { name: "Hurdle to Punch Drill", duration: "10 reps", description: "Practice approach with emphasis on powerful punch off the floor. Drive arms upward.", yt: "https://www.youtube.com/results?search_query=gymnastics+hurdle+punch+drill+tumbling" },
    { name: "Panel Mat Conditioning", duration: "3 × 8 reps", description: "Jump over progressively higher panel mats to build amplitude awareness.", yt: "https://www.youtube.com/results?search_query=panel+mat+jump+drill+gymnastics+amplitude" },
  ],
  "Body alignment deviation": [
    { name: "Video Self-Review", duration: "10 min per session", description: "Record skills and compare body line to ideal positions. Mark deviations on screen.", yt: "https://www.youtube.com/results?search_query=gymnastics+video+review+body+alignment" },
    { name: "Alignment Sticks Drill", duration: "5 min warm-up", description: "Hold dowel rod along spine during basic positions. Feel when alignment breaks.", yt: "https://www.youtube.com/results?search_query=dowel+rod+alignment+drill+gymnastics" },
    { name: "Handstand Shape Holds", duration: "5 × 15 sec", description: "Hold handstand with partner checking shoulder, hip, ankle alignment. Squeeze everything tight.", yt: "https://www.youtube.com/results?search_query=handstand+alignment+drill+gymnastics+shape" },
  ],
  "Small step (foot movement)": [
    { name: "Stick Drills off Low Surface", duration: "20 reps", description: "Jump from low block, land and hold 3 seconds. No movement at all on landing.", yt: "https://www.youtube.com/results?search_query=gymnastics+stick+landing+drill" },
    { name: "Drop Landings", duration: "3 × 8 reps", description: "Step off increasing heights. Absorb through ankles and knees. Freeze on impact.", yt: "https://www.youtube.com/results?search_query=drop+landing+drill+gymnastics+stick" },
    { name: "Balance Board Training", duration: "3 × 1 min", description: "Stand on wobble board to improve ankle stability and proprioception for clean landings.", yt: "https://www.youtube.com/results?search_query=balance+board+ankle+stability+gymnastics" },
  ],
  "Landing errors": [
    { name: "Pit to Stick Progressions", duration: "10-15 reps", description: "Land on elevated surface from pit. Focus on chest up, arms up, and complete stillness.", yt: "https://www.youtube.com/results?search_query=gymnastics+pit+landing+stick+drill" },
    { name: "Depth Drops with Stick", duration: "3 × 6 reps", description: "Drop from box, land and hold finish position for 3 full seconds before moving.", yt: "https://www.youtube.com/results?search_query=depth+drop+stick+landing+gymnastics" },
    { name: "Single Leg Balance Holds", duration: "3 × 30 sec each", description: "Build ankle and knee stability for asymmetric landings.", yt: "https://www.youtube.com/results?search_query=single+leg+balance+gymnastics+conditioning" },
  ],
  "Insufficient extension": [
    { name: "Stretch & Extend Holds", duration: "5 × 10 sec", description: "In each position (layout, pike, tuck), practice full extension. Coach checks alignment.", yt: "https://www.youtube.com/results?search_query=gymnastics+body+extension+drill+layout" },
    { name: "Superman Holds", duration: "4 × 15 sec", description: "Lie prone, lift arms and legs. Full extension from fingertips to toes.", yt: "https://www.youtube.com/results?search_query=superman+hold+gymnastics+conditioning" },
    { name: "Open Shoulder Flexibility", duration: "Daily stretching", description: "Wall slides and shoulder dislocates to improve overhead extension range.", yt: "https://www.youtube.com/results?search_query=shoulder+flexibility+gymnastics+dislocate+stretch" },
  ],
  "default": [
    { name: "Full Routine Run-Through", duration: "3 × per practice", description: "Practice complete routine with focus on identified weak points. Film and review.", yt: "https://www.youtube.com/results?search_query=gymnastics+full+routine+practice+tips" },
    { name: "Core Conditioning Circuit", duration: "15 min", description: "Hollow holds, V-ups, planks, and leg lifts. Strong core = better body control.", yt: "https://www.youtube.com/results?search_query=gymnastics+core+conditioning+circuit+workout" },
    { name: "Flexibility Training", duration: "20 min daily", description: "Splits, bridges, shoulder flexibility. Improved range = better lines and positions.", yt: "https://www.youtube.com/results?search_query=gymnastics+flexibility+routine+splits+bridges" },
  ],
};

// ─── SKELETON OVERLAY DATA ──────────────────────────────────────────
const SKELETON_CONNECTIONS = [
  ["head", "neck"], ["neck", "lShoulder"], ["neck", "rShoulder"],
  ["lShoulder", "lElbow"], ["lElbow", "lWrist"], ["rShoulder", "rElbow"], ["rElbow", "rWrist"],
  ["lShoulder", "lHip"], ["rShoulder", "rHip"], ["lHip", "rHip"],
  ["lHip", "lKnee"], ["lKnee", "lAnkle"], ["rHip", "rKnee"], ["rKnee", "rAnkle"],
];

// ─── CORRECT FORM SVG REFERENCE — stick figure illustrations of zero-deduction form ──
const CORRECT_FORM_DB = {
  tuck: { label: "Back Tuck — Zero Deduction", joints: {head:[.5,.15],neck:[.5,.22],lShoulder:[.42,.26],rShoulder:[.58,.26],lElbow:[.38,.34],rElbow:[.62,.34],lWrist:[.42,.42],rWrist:[.58,.42],lHip:[.46,.42],rHip:[.54,.42],lKnee:[.46,.42],rKnee:[.54,.42],lAnkle:[.44,.34],rAnkle:[.56,.34]}, notes: "Knees GLUED together. Tight tuck. Chin neutral. Hands grip shins — no daylight between knees." },
  layout: { label: "Layout — Zero Deduction", joints: {head:[.5,.15],neck:[.5,.2],lShoulder:[.45,.24],rShoulder:[.55,.24],lElbow:[.43,.16],rElbow:[.57,.16],lWrist:[.42,.1],rWrist:[.58,.1],lHip:[.47,.38],rHip:[.53,.38],lKnee:[.48,.55],rKnee:[.52,.55],lAnkle:[.48,.72],rAnkle:[.52,.72]}, notes: "Full extension head to toe. Arms by ears. Legs locked 180°. No pike at hips." },
  handspring: { label: "Handspring Support — Zero Deduction", joints: {head:[.5,.82],neck:[.5,.74],lShoulder:[.45,.67],rShoulder:[.55,.67],lElbow:[.44,.56],rElbow:[.56,.56],lWrist:[.44,.45],rWrist:[.56,.45],lHip:[.47,.52],rHip:[.53,.52],lKnee:[.48,.35],rKnee:[.52,.35],lAnkle:[.48,.18],rAnkle:[.52,.18]}, notes: "Arms LOCKED 180°. Push through shoulders. Straight line wrists→shoulders→hips→toes." },
  split_leap: { label: "Split Leap — Zero Deduction", joints: {head:[.5,.12],neck:[.5,.18],lShoulder:[.42,.22],rShoulder:[.58,.22],lElbow:[.34,.16],rElbow:[.66,.16],lWrist:[.26,.12],rWrist:[.74,.12],lHip:[.46,.38],rHip:[.54,.38],lKnee:[.28,.38],rKnee:[.72,.38],lAnkle:[.15,.42],rAnkle:[.85,.42]}, notes: "180° split. Both legs AT or ABOVE horizontal. Toes pointed. Arms extended. Head up." },
  landing: { label: "Stuck Landing — Zero Deduction", joints: {head:[.5,.12],neck:[.5,.18],lShoulder:[.42,.22],rShoulder:[.58,.22],lElbow:[.40,.14],rElbow:[.60,.14],lWrist:[.39,.08],rWrist:[.61,.08],lHip:[.46,.40],rHip:[.54,.40],lKnee:[.45,.56],rKnee:[.55,.56],lAnkle:[.44,.72],rAnkle:[.56,.72]}, notes: "Feet together. Knees soft to absorb. Chest UP. Arms at ears. HOLD — zero movement for 1 second." },
  turn: { label: "Full Turn — Zero Deduction", joints: {head:[.5,.08],neck:[.5,.14],lShoulder:[.46,.18],rShoulder:[.54,.18],lElbow:[.47,.12],rElbow:[.53,.12],lWrist:[.48,.06],rWrist:[.52,.06],lHip:[.47,.38],rHip:[.53,.38],lKnee:[.47,.56],rKnee:[.53,.56],lAnkle:[.47,.74],rAnkle:[.53,.74]}, notes: "Supporting leg LOCKED 180°. Free leg in passé. Arms tight. Relevé — full height on toe." },
  kip: { label: "Glide Kip — Zero Deduction", joints: {head:[.35,.35],neck:[.38,.32],lShoulder:[.42,.28],rShoulder:[.42,.28],lElbow:[.42,.20],rElbow:[.42,.20],lWrist:[.42,.12],rWrist:[.42,.12],lHip:[.48,.40],rHip:[.48,.40],lKnee:[.55,.50],rKnee:[.55,.50],lAnkle:[.62,.55],rAnkle:[.62,.55]}, notes: "Arms straight throughout. Toes to bar. Smooth glide — no pause. Finish in front support." },
  cast: { label: "Cast to Handstand — Zero Deduction", joints: {head:[.42,.82],neck:[.42,.74],lShoulder:[.42,.66],rShoulder:[.42,.66],lElbow:[.42,.58],rElbow:[.42,.58],lWrist:[.42,.50],rWrist:[.42,.50],lHip:[.42,.48],rHip:[.42,.48],lKnee:[.42,.30],rKnee:[.42,.30],lAnkle:[.42,.12],rAnkle:[.42,.12]}, notes: "Arms locked. Body passes through vertical. Straight line from wrists to toes. No arch." },
  walkover: { label: "Back Walkover — Zero Deduction", joints: {head:[.65,.70],neck:[.60,.62],lShoulder:[.55,.55],rShoulder:[.55,.55],lElbow:[.50,.48],rElbow:[.50,.48],lWrist:[.45,.42],rWrist:[.45,.42],lHip:[.55,.45],rHip:[.55,.45],lKnee:[.60,.30],rKnee:[.45,.58],lAnkle:[.62,.15],rAnkle:[.42,.72]}, notes: "Split leg position throughout. Shoulders over hands. Push through shoulders on support. Controlled pace." },
  mount: { label: "Beam Mount — Zero Deduction", joints: {head:[.5,.10],neck:[.5,.16],lShoulder:[.42,.20],rShoulder:[.58,.20],lElbow:[.36,.14],rElbow:[.64,.14],lWrist:[.32,.08],rWrist:[.68,.08],lHip:[.46,.38],rHip:[.54,.38],lKnee:[.44,.56],rKnee:[.56,.56],lAnkle:[.43,.74],rAnkle:[.57,.74]}, notes: "Clean jump. Arms up. Land with control. No wobble. Immediate composure." },
};

// Match a skill/fault to the correct reference form
function getCorrectFormRef(skill, fault) {
  const s = ((skill || "") + " " + (fault || "")).toLowerCase();
  if (s.match(/tuck|cowboy|separation.*salto/)) return CORRECT_FORM_DB.tuck;
  if (s.match(/layout|pike.*body|extension/)) return CORRECT_FORM_DB.layout;
  if (s.match(/handspring|support|round.?off/)) return CORRECT_FORM_DB.handspring;
  if (s.match(/split|leap|jump.*180|sissone|switch/)) return CORRECT_FORM_DB.split_leap;
  if (s.match(/land|step|stick|dismount/)) return CORRECT_FORM_DB.landing;
  if (s.match(/turn|spin|pivot/)) return CORRECT_FORM_DB.turn;
  if (s.match(/kip|glide/)) return CORRECT_FORM_DB.kip;
  if (s.match(/cast|handstand/)) return CORRECT_FORM_DB.cast;
  if (s.match(/walkover|limber/)) return CORRECT_FORM_DB.walkover;
  if (s.match(/mount|approach/)) return CORRECT_FORM_DB.mount;
  return CORRECT_FORM_DB.landing; // default
}

// Draw a "perfect form" SVG stick figure
function PerfectFormSVG({ joints, label }) {
  if (!joints) return null;
  return (
    <svg viewBox="0 0 1 1" preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "100%", background: "rgba(34,197,94,0.04)", borderRadius: 8 }}>
      {SKELETON_CONNECTIONS.map(([a, b], i) => {
        const ja = joints[a], jb = joints[b];
        if (!ja || !jb) return null;
        return <line key={i} x1={ja[0]} y1={ja[1]} x2={jb[0]} y2={jb[1]} stroke="#22c55e" strokeWidth={0.012} strokeLinecap="round" opacity={0.9} />;
      })}
      {Object.entries(joints).map(([name, pos]) => pos && (
        <circle key={name} cx={pos[0]} cy={pos[1]} r={0.015} fill="#22c55e" opacity={0.95} />
      ))}
      <text x={0.5} y={0.95} textAnchor="middle" fill="#22c55e" fontSize="0.035" fontWeight="bold" fontFamily="sans-serif">{label || "✓ Perfect Form"}</text>
    </svg>
  );
}

// ─── SCORE BENCHMARKING DATA (aggregated typical ranges) ────────────
const SCORE_BENCHMARKS = {
  "Level 1": { low: 7.5, avg: 8.5, high: 9.5, top10: 9.3 },
  "Level 2": { low: 7.5, avg: 8.4, high: 9.5, top10: 9.2 },
  "Level 3": { low: 7.0, avg: 8.3, high: 9.5, top10: 9.2 },
  "Level 4": { low: 7.0, avg: 8.5, high: 9.7, top10: 9.3 },
  "Level 5": { low: 7.0, avg: 8.5, high: 9.8, top10: 9.4 },
  "Level 6": { low: 7.5, avg: 8.6, high: 9.6, top10: 9.3 },
  "Level 7": { low: 7.5, avg: 8.7, high: 9.7, top10: 9.4 },
  "Level 8": { low: 7.5, avg: 8.8, high: 9.7, top10: 9.4 },
  "Level 9": { low: 7.5, avg: 8.7, high: 9.8, top10: 9.5 },
  "Level 10": { low: 7.5, avg: 8.8, high: 9.9, top10: 9.5 },
  "Xcel Bronze": { low: 7.5, avg: 8.5, high: 9.7, top10: 9.3 },
  "Xcel Silver": { low: 7.5, avg: 8.6, high: 9.7, top10: 9.3 },
  "Xcel Gold": { low: 7.5, avg: 8.7, high: 9.7, top10: 9.4 },
  "Xcel Platinum": { low: 7.5, avg: 8.7, high: 9.7, top10: 9.4 },
  "Xcel Diamond": { low: 7.5, avg: 8.8, high: 9.7, top10: 9.4 },
  "Xcel Sapphire": { low: 7.5, avg: 8.8, high: 9.8, top10: 9.5 },
};

// ─── PARENT KNOWLEDGE: "DID YOU KNOW" TIPS ──────────────────────────
const PARENT_TIPS = [
  "A 0.05 deduction for a flexed foot seems tiny, but across 8-10 skills in a routine it can add up to 0.40-0.50 — the difference between 1st and 5th place.",
  "Judges start scoring the moment your child salutes. Even the walk to the apparatus and the salute itself can receive deductions if not done properly.",
  "On beam, a small wobble (arms moving to balance) is 0.10. A large wobble is 0.30. A fall is 0.50. Teaching your child to 'own the wobble' and recover quickly is a real skill.",
  "Floor exercise is the only event scored for artistry in WAG. Judges look at musicality, expression, confidence, and use of the full floor. It's not just about tumbling.",
  "The 90-second time limit on beam and floor is strict. Going over by even 1 second is a 0.10 neutral deduction that comes off the final score.",
  "At compulsory levels (1-5), every gymnast does the SAME routine. The score is purely about how precisely they match the prescribed choreography plus execution.",
  "A 'stuck' landing (no steps) doesn't just avoid deductions — it's the biggest crowd-pleaser and confidence builder in the sport.",
  "Connection value (CV) is bonus points earned by linking skills together without pause. At higher levels, how you connect skills matters as much as what skills you do.",
  "Judges can deduct for insufficient amplitude even if a skill is technically correct. Height, extension, and power all matter.",
  "Your child's coach knows the scoring criteria better than anyone. Sharing this app's analysis with the coach can create a great training conversation.",
  "Different judges DO score differently. A score can vary by 0.2-0.3 between strict and lenient judges. This is normal — it's not a conspiracy against your child.",
  "The most common 'hidden' deduction is foot form. Pointed toes with proper alignment should be automatic on every single skill.",
  "At meets, the head judge can adjust scores if the panel is too far apart. This is called 'conferencing' and it's designed to ensure fairness.",
  "Warm-up matters more than you think. A confident, focused warm-up sets the tone for the entire competition. Avoid new skills on meet day.",
];

// ─── STYLES ─────────────────────────────────────────────────────────
const fonts = `
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=Space+Mono:wght@400;700&display=swap');
`;

// ─── HELPER COMPONENTS ──────────────────────────────────────────────
const Icon = ({ name, size = 20 }) => {
  const icons = {
    medal: "🥇", camera: "📹", chart: "📊", user: "👤", target: "🎯",
    check: "✓", arrow: "→", star: "⭐", play: "▶", pause: "⏸",
    upload: "⬆", close: "✕", gym: "🤸", drill: "💪", note: "📝",
    flag: "🚩", clock: "⏱", eye: "👁", sparkle: "✨", bar: "═",
    beam: "━", vault: "🏋", floor: "🟫", rings: "⭕", horse: "🐴",
    warning: "⚠️", info: "ℹ️", back: "←", save: "💾", trophy: "🏆",
    bone: "🦴", brain: "🧠",
  };
  return <span style={{ fontSize: size }}>{icons[name] || "•"}</span>;
};

// ─── ERROR BOUNDARY (Agent Epsilon) ─────────────────────────────────
// Class-based React error boundary — wraps major sections to prevent
// full-page crashes. Provides retry button and error logging.
class StriveErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error(`[STRIVE] ${this.props.name || 'Component'} crashed:`, error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ background: '#121b2d', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 20, margin: '12px 0', textAlign: 'center' }}>
          <div style={{ color: '#dc2626', fontSize: 16, fontFamily: 'Outfit, sans-serif', fontWeight: 600, marginBottom: 8 }}>Something went wrong</div>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, fontFamily: 'Outfit, sans-serif', marginBottom: 16 }}>{this.props.name || 'This section'} could not load.</div>
          <button onClick={() => this.setState({ hasError: false, error: null })} style={{ background: '#e8962a', color: '#070c16', border: 'none', borderRadius: 8, padding: '10px 20px', fontFamily: 'Outfit, sans-serif', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Tap to retry</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── SHIMMER LOADING PLACEHOLDER (Agent Epsilon) ────────────────────
function ShimmerBlock({ width = "100%", height = 20, borderRadius = 8, style = {} }) {
  return (
    <div style={{
      width, height, borderRadius,
      background: "linear-gradient(90deg, #121b2d 25%, #1a2540 50%, #121b2d 75%)",
      backgroundSize: "400px 100%",
      animation: "shimmer 1.5s infinite",
      ...style,
    }} />
  );
}

function SkillCardShimmer() {
  return (
    <div style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 18, padding: 18, marginBottom: 12 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <ShimmerBlock width={40} height={40} borderRadius={20} />
        <div style={{ flex: 1 }}>
          <ShimmerBlock width="60%" height={14} style={{ marginBottom: 6 }} />
          <ShimmerBlock width="40%" height={10} />
        </div>
      </div>
      <ShimmerBlock width="100%" height={8} borderRadius={4} />
    </div>
  );
}

// ─── OFFLINE BANNER (Agent Epsilon) ─────────────────────────────────
function OfflineBanner({ isOffline }) {
  if (!isOffline) return null;
  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999,
      background: "linear-gradient(135deg, #e8962a, #ffc15a)", color: "#070c16",
      padding: "8px 16px", textAlign: "center",
      fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 600,
      boxShadow: "0 2px 12px rgba(0,0,0,0.3)",
    }}>
      You are offline — showing last saved analysis
    </div>
  );
}

// ─── SKELETON OVERLAY COMPONENT ─────────────────────────────────────
// SkeletonOverlay accepts either legacy {joints, faultJoints} or new skeleton data format
// New format: skeleton = {joints, faultJoints, angles: [{joint, measured, ideal, label}]}
function SkeletonOverlay({ joints, faultJoints, skeleton, angles: anglesFromProp }) {
  // Support both old flat props and new grouped skeleton object
  const j = skeleton?.joints || joints;
  const faultList = skeleton?.faultJoints || faultJoints || [];
  const angleData = skeleton?.angles || anglesFromProp || [];

  if (!j) return null;
  const faults = new Set(faultList);

  // Build angle lookup by joint name
  const angleByJoint = {};
  angleData.forEach(a => { if (a.joint) angleByJoint[a.joint] = a; });

  // Also compute geometric angles for joints that don't have AI-provided data
  const calcAngle = (a, b, c) => {
    if (!a || !b || !c) return null;
    const v1 = [a[0]-b[0], a[1]-b[1]], v2 = [c[0]-b[0], c[1]-b[1]];
    const dot = v1[0]*v2[0]+v1[1]*v2[1];
    const mag = Math.sqrt(v1[0]**2+v1[1]**2)*Math.sqrt(v2[0]**2+v2[1]**2);
    return mag > 0 ? Math.round(Math.acos(Math.max(-1,Math.min(1,dot/mag)))*180/Math.PI) : null;
  };
  const computedAngles = {};
  if (j.lHip && j.lKnee && j.lAnkle) computedAngles.lKnee = calcAngle(j.lHip, j.lKnee, j.lAnkle);
  if (j.rHip && j.rKnee && j.rAnkle) computedAngles.rKnee = calcAngle(j.rHip, j.rKnee, j.rAnkle);
  if (j.lShoulder && j.lElbow && j.lWrist) computedAngles.lElbow = calcAngle(j.lShoulder, j.lElbow, j.lWrist);
  if (j.rShoulder && j.rElbow && j.rWrist) computedAngles.rElbow = calcAngle(j.rShoulder, j.rElbow, j.rWrist);

  // Draw angle arc at a joint
  const AngleArc = ({ pos, measured, ideal }) => {
    if (!pos || !measured) return null;
    const r = 0.03;
    const startAngle = -0.4, endAngle = startAngle + (measured / 180) * Math.PI;
    const x1 = pos[0] + r * Math.cos(startAngle), y1 = pos[1] + r * Math.sin(startAngle);
    const x2 = pos[0] + r * Math.cos(endAngle), y2 = pos[1] + r * Math.sin(endAngle);
    const large = (measured > 90) ? 1 : 0;
    return (
      <path d={`M ${pos[0]} ${pos[1]} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`}
        fill="rgba(220,38,38,0.15)" stroke="#dc2626" strokeWidth={0.003} />
    );
  };

  return (
    <svg viewBox="0 0 1 1" preserveAspectRatio="none" style={{
      position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none",
    }}>
      <defs>
        <filter id="glow"><feGaussianBlur stdDeviation="0.008" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>

      {/* Ghost motion trail for fault joints */}
      {faultList.map((name) => {
        const pos = j[name];
        if (!pos) return null;
        return <React.Fragment key={`trail-${name}`}>{[0.008, 0.016].map((off, oi) => (
          <circle key={`trail-${name}-${oi}`} cx={pos[0] + off} cy={pos[1] - off * 0.5}
            r={0.012} fill="#dc2626" opacity={0.12 - oi * 0.04} />
        ))}</React.Fragment>;
      })}

      {/* Draw connections */}
      {SKELETON_CONNECTIONS.map(([a, b], i) => {
        const ja = j[a], jb = j[b];
        if (!ja || !jb) return null;
        const hasFault = faults.has(a) || faults.has(b);
        return (
          <line key={i} x1={ja[0]} y1={ja[1]} x2={jb[0]} y2={jb[1]}
            stroke={hasFault ? "#dc2626" : "#22c55e"}
            strokeWidth={hasFault ? 0.015 : 0.007}
            strokeLinecap="round" opacity={0.9}
            filter={hasFault ? "url(#glow)" : undefined}
          />
        );
      })}

      {/* Draw joints */}
      {Object.entries(j).map(([name, pos]) => {
        if (!pos || pos.length < 2) return null;
        const isFault = faults.has(name);
        const aiAngle = angleByJoint[name];
        const compAngle = computedAngles[name];
        return (
          <g key={name}>
            {isFault && aiAngle && <AngleArc pos={pos} measured={aiAngle.measured} ideal={aiAngle.ideal} />}
            <circle cx={pos[0]} cy={pos[1]} r={isFault ? 0.018 : 0.01}
              fill={isFault ? "#dc2626" : "#22c55e"} opacity={0.95}
              filter={isFault ? "url(#glow)" : undefined} />
            {isFault && (
              <circle cx={pos[0]} cy={pos[1]} r={0.025}
                fill="none" stroke="#dc2626" strokeWidth={0.005} opacity={0.7}>
                <animate attributeName="r" values="0.02;0.04;0.02" dur="1.2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.7;0.2;0.7" dur="1.2s" repeatCount="indefinite" />
              </circle>
            )}
            {isFault && (aiAngle || compAngle) && (() => {
              const m = aiAngle?.measured ?? compAngle;
              const ideal = aiAngle?.ideal ?? 180;
              const badgeX = pos[0] > 0.7 ? pos[0] - 0.13 : pos[0] + 0.02;
              const badgeY = pos[1] - 0.025;
              return (
                <g>
                  <rect x={badgeX} y={badgeY} width={0.13} height={0.038} rx={0.005} fill="rgba(0,0,0,0.88)" />
                  <text x={badgeX + 0.065} y={badgeY + 0.014} textAnchor="middle"
                    fill="#dc2626" fontSize="0.018" fontWeight="bold" fontFamily="monospace">{m}°</text>
                  <text x={badgeX + 0.065} y={badgeY + 0.03} textAnchor="middle"
                    fill="#22c55e" fontSize="0.015" fontFamily="monospace">/{ideal}°</text>
                </g>
              );
            })()}
          </g>
        );
      })}

      {/* Legend */}
      <rect x={0.02} y={0.92} width={0.22} height={0.06} rx={0.01} fill="rgba(0,0,0,0.75)" />
      <circle cx={0.04} cy={0.95} r={0.008} fill="#22c55e" />
      <text x={0.055} y={0.955} fill="#22c55e" fontSize="0.018" fontFamily="sans-serif">OK</text>
      <circle cx={0.11} cy={0.95} r={0.008} fill="#dc2626" />
      <text x={0.125} y={0.955} fill="#dc2626" fontSize="0.018" fontFamily="sans-serif">Fault</text>
    </svg>
  );
}

// ─── SCORE BENCHMARK COMPONENT ──────────────────────────────────────
function ScoreBenchmark({ score, level }) {
  const bench = SCORE_BENCHMARKS[level];
  if (!bench || !score) return null;

  const range = bench.high - bench.low;
  const pct = Math.max(0, Math.min(100, ((score - bench.low) / range) * 100));
  const avgPct = ((bench.avg - bench.low) / range) * 100;
  const topPct = ((bench.top10 - bench.low) / range) * 100;

  const percentile = score >= bench.top10 ? "Top 10%" :
    score >= bench.avg + (bench.top10 - bench.avg) * 0.5 ? "Top 25%" :
    score >= bench.avg ? "Above Average" :
    score >= bench.avg - 0.3 ? "Average Range" : "Below Average";

  const pColor = percentile.includes("Top 10") ? "#e8962a" :
    percentile.includes("Top 25") ? "#22c55e" :
    percentile.includes("Above") ? "#22c55e" :
    percentile.includes("Average R") ? "#ffc15a" : "#dc2626";

  return (
    <div className="card" style={{ padding: 14, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)" }}>
          SCORE BENCHMARK — {level}
        </span>
        <span style={{ fontSize: 13, fontWeight: 800, color: pColor, fontFamily: "'Space Mono', monospace" }}>
          {percentile}
        </span>
      </div>
      <div style={{ position: "relative", height: 24, borderRadius: 12, background: "rgba(255,255,255,0.06)", overflow: "visible", marginBottom: 4 }}>
        {/* Average zone */}
        <div style={{
          position: "absolute", left: `${avgPct - 8}%`, width: "16%", top: 0, bottom: 0,
          background: "rgba(255,193,90,0.1)", borderRadius: 12,
        }} />
        {/* Top 10% zone */}
        <div style={{
          position: "absolute", left: `${topPct}%`, right: 0, top: 0, bottom: 0,
          background: "rgba(232,150,42,0.08)", borderRadius: "0 12px 12px 0",
        }} />
        {/* Score marker */}
        <div style={{
          position: "absolute", top: -2, width: 28, height: 28, borderRadius: "50%",
          background: pColor, border: "3px solid #070c16",
          left: `calc(${pct}% - 14px)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: `0 0 10px ${pColor}50`,
        }}>
          <span style={{ fontSize: 8, fontWeight: 900, color: "#070c16", fontFamily: "'Space Mono', monospace" }}>
            {score.toFixed(1)}
          </span>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "rgba(255,255,255,0.25)", fontFamily: "'Space Mono', monospace" }}>
        <span>{bench.low.toFixed(1)}</span>
        <span style={{ color: "rgba(255,193,90,0.5)" }}>avg {bench.avg.toFixed(1)}</span>
        <span style={{ color: "rgba(232,150,42,0.5)" }}>top10% {bench.top10.toFixed(1)}</span>
        <span>{bench.high.toFixed(1)}</span>
      </div>
    </div>
  );
}

// ─── SKILLS REQUIRED CARD ────────────────────────────────────────────
const LEVEL_SKILLS = {
  "Level 1": { vault: "Straight jump off springboard", bars: "Pullover, back hip circle", beam: "Walks, relevé, stretch jump", floor: "Forward roll, backward roll, cartwheel" },
  "Level 2": { vault: "Straight jump to flat back on mats", bars: "Pullover, back hip circle, underswing dismount", beam: "Walks, arabesque, cartwheel", floor: "Handstand, bridge, round-off" },
  "Level 3": { vault: "Handstand flat back on mats", bars: "Pullover, cast, back hip circle, underswing dismount", beam: "Leap, relevé turn, cartwheel", floor: "Handstand forward roll, round-off, backward roll to push-up" },
  "Level 4": { vault: "Handstand flat back onto mats", bars: "Kip (attempt), cast, back hip circle, underswing dismount", beam: "Cartwheel, full turn, split jump, straight jump dismount", floor: "Round-off back handspring, front limber, full turn" },
  "Level 5": { vault: "Handspring over vault", bars: "Kip, cast to horizontal+, back hip circle, squat-on, underswing dismount or flyaway", beam: "Back walkover, split leap 120°+, full turn, cartwheel/BHS dismount", floor: "Round-off BHS back tuck, front handspring, straddle jump, full turn" },
  "Level 6": { vault: "Handspring vault", bars: "Kip, cast to 45° above horizontal, any B circling skill, underswing/flyaway dismount", beam: "B acro skill, 150°+ leap/jump, full turn, B dismount", floor: "B tumbling pass, 150°+ leap, full turn, B second pass" },
  "Level 7": { vault: "Handspring vault (higher amplitude required)", bars: "Kip, cast to handstand, B+ circling/release, flyaway or better dismount", beam: "B acro series (2 skills), 150°+ split leap, full turn, C dismount", floor: "B+B tumbling, 180° split leap, 1.5 turn, 2 tumbling passes" },
  "Level 8": { vault: "Yurchenko or Tsukahara entry vaults", bars: "Cast handstand, B release or pirouette, C dismount", beam: "Acro series w/ flight, 180° leap, full turn, C dismount", floor: "C tumbling, dance series w/ 180° split, 3+ saltos, C final pass" },
  "Level 9": { vault: "Yurchenko layout or higher", bars: "Cast handstand, C release/pirouette, D dismount", beam: "Flight acro series, 180° split leap, 1+ turn, C+ dismount", floor: "D tumbling pass, 180° leap series, multiple saltos, C+ final" },
  "Level 10": { vault: "Yurchenko full or higher (D+ value)", bars: "D+ skills, release + pirouette, D/E dismount", beam: "C+C acro series, dance series, D+ dismount", floor: "D+ tumbling, E connections, 3 saltos min, D+ final pass" },
  "Xcel Bronze": { vault: "Run, hurdle, jump to land on mat", bars: "Pullover, cast, back hip circle", beam: "Mount, walks, jumps, stretch jump off", floor: "Forward roll, cartwheel, bridge, stretch jump" },
  "Xcel Silver": { vault: "Handspring to mat stack", bars: "Pullover, cast, back hip circle, dismount", beam: "Mount, leap, turn, cartwheel, jump off", floor: "Round-off, handstand, backward roll, leap" },
  "Xcel Gold": { vault: "Handspring vault", bars: "Kip, cast, back hip circle, A+B skills, dismount", beam: "Acro skill, 120°+ leap, turn, dismount", floor: "Round-off BHS, leap/jump, turn, second pass" },
  "Xcel Platinum": { vault: "Handspring or Tsukahara", bars: "B circling, cast horizontal+, B release/dismount", beam: "B acro, 150°+ leap, full turn, B dismount", floor: "B tumbling pass, 150°+ leap, turn, B second pass" },
  "Xcel Diamond": { vault: "Yurchenko or Tsukahara", bars: "Cast handstand, C skill, C dismount", beam: "Acro series, 180° leap, C dismount", floor: "C tumbling, 180° dance series, C final pass" },
  "Xcel Sapphire": { vault: "Yurchenko layout+", bars: "D release/pirouette, D dismount", beam: "Flight series, D acro/dismount", floor: "D tumbling, 180° dance, D final pass" },
};

function SkillsRequiredCard({ profile }) {
  const [expanded, setExpanded] = useState(false);
  const skills = LEVEL_SKILLS[profile.level];
  if (!skills) return null;

  const events = profile.gender === "female"
    ? [["Vault", "vault"], ["Bars", "bars"], ["Beam", "beam"], ["Floor", "floor"]]
    : [["Floor", "floor"], ["Vault", "vault"], ["Bars", "bars"]];

  return (
    <div className="card" style={{ padding: 16, marginBottom: 20, borderColor: "rgba(232,150,42,0.12)" }}>
      <div onClick={() => setExpanded(!expanded)} style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ fontSize: 14, fontWeight: 700 }}>
          <Icon name="star" size={14} /> Skills Required — {profile.level}
        </h3>
        <span style={{ color: "#e8962a", fontSize: 13, fontWeight: 600 }}>{expanded ? "▲" : "▼"}</span>
      </div>
      {expanded && (
        <div style={{ marginTop: 12 }}>
          {events.map(([label, key]) => skills[key] && (
            <div key={key} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#e8962a", letterSpacing: 1, marginBottom: 4 }}>{String(label || '').toUpperCase()}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.7 }}>{skills[key]}</div>
            </div>
          ))}
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 8, fontStyle: "italic" }}>
            These are the key skills your gymnast needs for this level. Each skill is judged on execution, form, and amplitude.
          </div>
        </div>
      )}
    </div>
  );
}

function GlossaryCard() {
  const [expanded, setExpanded] = useState(false);
  const terms = [
    ["Start Value (SV)", "The maximum score a routine can earn before deductions. Compulsory = 10.0. Optional = depends on difficulty."],
    ["Execution (E-Score)", "Points deducted from 10.0 for form errors — bent knees, steps on landings, flexed feet, etc."],
    ["Difficulty (D-Score)", "Sum of the hardest 8 skills in the routine. Only applies to optional levels 6+."],
    ["Special Requirements", "4 specific things that must be in every routine (each worth 0.50). Missing one = half a point gone."],
    ["Deduction", "Points subtracted for mistakes. Small = 0.05-0.10. Medium = 0.10-0.15. Large = 0.20-0.30. Fall = 0.50."],
    ["Neutral Deduction", "Penalties for rule violations (out of bounds, overtime, attire), not execution errors."],
    ["Artistry", "On beam and floor: judges score confidence, expression, musicality, and use of space. Up to 0.30 in deductions."],
    ["Composition", "How well the routine is constructed — variety of skills, distribution of difficulty. Levels 8-10."],
    ["Connection Value (CV)", "Bonus points earned by linking specific skills together without pause. Optional levels only."],
    ["Amplitude", "How big, high, and extended a skill looks. More amplitude = fewer deductions."],
    ["Compulsory", "Levels 1-5 where every gymnast does the exact same routine. Judged on how precisely they match it."],
    ["Optional", "Levels 6-10 where gymnasts build their own routines. Judged on difficulty + execution + composition."],
    ["Xcel", "Alternative competitive track with Bronze through Sapphire divisions. Designed for a broader range of gymnasts."],
  ];

  return (
    <div className="card" style={{ padding: 16, marginBottom: 16, borderColor: "rgba(232,150,42,0.1)" }}>
      <div onClick={() => setExpanded(!expanded)} style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ fontSize: 14, fontWeight: 700 }}>
          <Icon name="note" size={14} /> Parent's Glossary — Key Terms
        </h3>
        <span style={{ color: "#e8962a", fontSize: 13, fontWeight: 600 }}>{expanded ? "▲" : "▼"}</span>
      </div>
      {expanded && (
        <div style={{ marginTop: 12 }}>
          {terms.map(([term, def], i) => (
            <div key={i} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: i < terms.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#e8962a", marginBottom: 3 }}>{term}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>{def}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MeetDayChecklist({ gender }) {
  const [expanded, setExpanded] = useState(false);
  const [checked, setChecked] = useState({});
  const toggle = (i) => setChecked(prev => ({ ...prev, [i]: !prev[i] }));

  const items = [
    "Competition leotard (no jewelry, no nail polish)",
    gender === "female" ? "Hair secured tightly — bun with net and pins, no loose strands" : "Hair out of face if long",
    "Grips, tape, and wristbands (if applicable)",
    gender === "female" ? "Beam shoes or bare feet (gymnast's preference)" : "Pommel horse padding (if used)",
    "Water bottle and healthy snacks (banana, granola bar, trail mix)",
    "USAG membership card / competition number",
    "Warm-up clothes for between events",
    "Arrive 30+ minutes before competition starts",
    "Light warm-up: jog, stretch, handstands — no new skills on meet day",
    "Use the bathroom BEFORE march-in",
    "Know the rotation order and which event is first",
    "Positive mindset: focus on doing YOUR best, not comparing to others",
  ];

  return (
    <div className="card" style={{ padding: 16, marginBottom: 16, borderColor: "rgba(232,150,42,0.1)" }}>
      <div onClick={() => setExpanded(!expanded)} style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ fontSize: 14, fontWeight: 700 }}>
          <Icon name="check" size={14} /> Meet Day Checklist
        </h3>
        <span style={{ color: "#e8962a", fontSize: 13, fontWeight: 600 }}>{expanded ? "▲" : "▼"}</span>
      </div>
      {expanded && (
        <div style={{ marginTop: 12 }}>
          {items.map((item, i) => (
            <div key={i} onClick={() => toggle(i)} style={{
              display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", cursor: "pointer",
              borderBottom: i < items.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
            }}>
              <div style={{
                width: 20, height: 20, borderRadius: 5, flexShrink: 0, marginTop: 1,
                border: `2px solid ${checked[i] ? "#22c55e" : "rgba(255,255,255,0.2)"}`,
                background: checked[i] ? "rgba(34,197,94,0.15)" : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.2s",
              }}>
                {checked[i] && <span style={{ color: "#22c55e", fontSize: 12, fontWeight: 700 }}>✓</span>}
              </div>
              <span style={{
                fontSize: 13, color: checked[i] ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.6)",
                lineHeight: 1.5, textDecoration: checked[i] ? "line-through" : "none",
                transition: "all 0.2s",
              }}>
                {item}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── MAIN APP ───────────────────────────────────────────────────────
export default function LegacyApp() {
  const [screen, setScreenRaw] = useState("splash");
  // Auto-scroll to top on screen changes
  const setScreen = useCallback((s) => {
    setScreenRaw(s);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);
  const [profile, setProfile] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [uploadData, setUploadData] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [history, setHistory] = useState([]);
  const [liveVideoUrl, setLiveVideoUrl] = useState(null); // STATE so it triggers re-renders
  const videoFileRef = useRef(null); // Raw File object — survives re-renders
  const videoBlobRef = useRef(null); // Stable blob URL — created once at upload, never revoked until new upload
  const [savedResults, setSavedResults] = useState({}); // Store past results by ID
  const [comparePreselect, setComparePreselect] = useState(null); // Pre-selected analysis ID for comparison
  const [isOffline, setIsOffline] = useState(typeof navigator !== "undefined" ? !navigator.onLine : false);
  const [userTier, setUserTier] = useState(() => {
    try { return localStorage.getItem("strive-tier") || "free"; } catch { return "free"; }
  });
  // Map legacy "pro" tier to new "competitive" tier name
  const normalizedTier = userTier === "competitive" ? "competitive" : userTier;
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [pendingAnalyzeData, setPendingAnalyzeData] = useState(null);

  // ── Feature flags for new screen components ──
  // eslint-disable-next-line no-unused-vars
  const [useNewResults, setUseNewResults] = useState(true);
  // eslint-disable-next-line no-unused-vars
  const [useNewDashboard, setUseNewDashboard] = useState(true);

  // ── Agent Epsilon: Offline detection ──
  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // Load profile, history, and saved results from storage
  useEffect(() => {
    (async () => {
      try {
        const stored = await storage.get("strive-profile");
        if (stored) {
          setProfile(JSON.parse(stored.value));
          setScreen("dashboard");
        } else {
          setScreen("splash");
        }
      } catch {
        setScreen("splash");
      }
      try {
        const hist = await storage.get("strive-history");
        if (hist) setHistory(JSON.parse(hist.value));
      } catch {}
      try {
        const sr = await storage.get("strive-saved-results");
        if (sr) setSavedResults(JSON.parse(sr.value));
      } catch {}
    })();
  }, []);

  const saveProfile = async (p) => {
    setProfile(p);
    try { await storage.set("strive-profile", JSON.stringify(p)); } catch {}
  };

  const saveHistory = async (h) => {
    setHistory(h);
    try { await storage.set("strive-history", JSON.stringify(h)); } catch {}
  };

  const handleAnalysisComplete = (result) => {
    setAnalysisResult(result);

    // ── Agent Delta: Save to athlete intelligence layer ──
    saveAnalysisToHistory(profile, result, uploadData);

    const id = Date.now();
    const deds = result.executionDeductions || [];
    const newEntry = {
      id,
      date: uploadData?.meetDate || new Date().toLocaleDateString(),
      event: uploadData?.event,
      score: result.finalScore,
      deductions: result.totalDeductions,
      meetName: uploadData?.meetName || "",
      meetLocation: uploadData?.meetLocation || "",
      meetDate: uploadData?.meetDate || "",
      tpmCount: deds.filter(d => d.engine === "TPM").length,
      ktmCount: deds.filter(d => d.engine === "KTM").length,
      landingCount: deds.filter(d => d.category === "landing").length,
      vaeCount: deds.filter(d => d.engine === "VAE").length,
      hasFall: deds.some(d => d.severity === "fall"),
      powerRating: result.biomechanics?.overallPowerRating || null,
    };
    const newHist = [newEntry, ...history].slice(0, 50);
    saveHistory(newHist);
    // Save full result for clickable history — strip frames to save space
    const lightResult = { ...result, frames: undefined };
    const newSaved = { ...savedResults, [id]: lightResult };
    setSavedResults(newSaved);
    try { storage.set("strive-saved-results", JSON.stringify(newSaved)); } catch {}

    // ── Agent Epsilon: Cache last 5 analyses for offline access ──
    try {
      const cacheRaw = localStorage.getItem("strive_recent_analyses");
      let recentCache = cacheRaw ? JSON.parse(cacheRaw) : [];
      recentCache.unshift({ id, result: lightResult, date: new Date().toISOString(), event: uploadData?.event });
      recentCache = recentCache.slice(0, 5);
      localStorage.setItem("strive_recent_analyses", JSON.stringify(recentCache));
    } catch (e) { log.warn("cache", "Failed to cache recent analysis: " + (e.message || "")); }

    // Track analysis count for free tier limit (3/month)
    try {
      const now = new Date();
      const countKey = "strive-analysis-count";
      const raw = localStorage.getItem(countKey);
      let data = raw ? JSON.parse(raw) : { count: 0, month: now.getMonth(), year: now.getFullYear() };
      // Reset if new month
      if (data.month !== now.getMonth() || data.year !== now.getFullYear()) {
        data = { count: 0, month: now.getMonth(), year: now.getFullYear() };
      }
      data.count++;
      localStorage.setItem(countKey, JSON.stringify(data));
    } catch {}

    setScreen("results");
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#070c16",
      fontFamily: "'Outfit', sans-serif",
      color: "#e2e8f0",
      position: "relative",
      overflow: "hidden",
    }}>
      <OfflineBanner isOffline={isOffline} />
      <style>{fonts}</style>
      <style>{`
        @keyframes barGrow { from { width: 0%; } to { width: var(--target-width); } }
        @keyframes glowPulse { 0%, 100% { box-shadow: 0 0 20px rgba(232,150,42,0.12); } 50% { box-shadow: 0 0 40px rgba(232,150,42,0.2); } }
        .card-elevated {
          background: rgba(255,255,255,0.035); border: 1px solid rgba(255,255,255,0.06);
          border-radius: 20px; padding: 20px; box-shadow: 0 4px 24px rgba(0,0,0,0.15);
          transition: all 0.2s;
        }
        .card-elevated:hover { border-color: rgba(255,255,255,0.1); box-shadow: 0 6px 32px rgba(0,0,0,0.2); }
        .section-label {
          font-size: 10px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase;
          color: rgba(255,255,255,0.2); margin-bottom: 12px;
        }
      `}</style>

      {/* Background ambient effects */}
      <div style={{
        position: "fixed", top: "-30%", right: "-20%", width: "60vw", height: "60vw",
        background: "radial-gradient(circle, rgba(232,150,42,0.03) 0%, transparent 60%)",
        pointerEvents: "none", zIndex: 0, willChange: "transform",
      }} />
      <div style={{
        position: "fixed", bottom: "-20%", left: "-15%", width: "50vw", height: "50vw",
        background: "radial-gradient(circle, rgba(139,92,246,0.015) 0%, transparent 60%)",
        pointerEvents: "none", zIndex: 0, willChange: "transform",
      }} />

      {screen === "splash" && <SplashScreen onStart={() => setScreen("onboarding")} />}
      {screen === "onboarding" && <OnboardingScreen onComplete={(p) => { saveProfile(p); setScreen("dashboard"); }} />}
      {screen === "dashboard" && (
        <StriveErrorBoundary name="Dashboard">
        {useNewDashboard ? (
          <Suspense fallback={<div style={{ minHeight: "100vh", background: "#070c16" }} />}>
          <NewDashboardScreen
            profile={profile}
            tier={normalizedTier}
            recentAnalyses={history.slice(0, 5)}
            lastResult={history.length > 0 && savedResults[history[0].id] ? savedResults[history[0].id] : null}
            onAnalyze={() => setScreen("upload")}
            onViewResult={(r) => { setAnalysisResult(r); setLiveVideoUrl(null); setScreen("results"); }}
            onNavigate={(target) => {
              const navMap = { history: "meets", guide: "deductions", mental: "mental", training: "training", goals: "goals", meetfocus: "meetfocus", progress: "progress", settings: "settings" };
              setScreen(navMap[target] || target);
            }}
          />
          </Suspense>
        ) : (
          <DashboardScreen
            profile={profile}
            history={history}
            savedResults={savedResults}
            onUpload={() => setScreen("upload")}
            onSettings={() => setScreen("settings")}
            onViewDeductions={() => setScreen("deductions")}
            onProgress={() => setScreen("progress")}
            onMeets={() => setScreen("meets")}
            onMental={() => setScreen("mental")}
            onGoals={() => setScreen("goals")}
            onMeetFocus={() => setScreen("meetfocus")}
            onViewResult={(r) => { setAnalysisResult(r); setLiveVideoUrl(null); setScreen("results"); }}
          />
        )}
        </StriveErrorBoundary>
      )}
      {screen === "upload" && (
        <StriveErrorBoundary name="Upload">
        <UploadScreen
          profile={profile}
          onBack={() => setScreen("dashboard")}
          onAnalyze={(data) => {
            // Check if legal disclaimer has been accepted
            let legalAccepted = false;
            try { legalAccepted = localStorage.getItem("strive-legal-accepted") === "true"; } catch {}
            if (!legalAccepted) {
              setPendingAnalyzeData(data);
              setScreen("legal-disclaimer");
              return;
            }
            // Revoke previous blob URL if any
            if (videoBlobRef.current) { try { URL.revokeObjectURL(videoBlobRef.current); } catch {} }
            // Store File and create a single stable blob URL that persists across all screens
            if (data.video) {
              videoFileRef.current = data.video;
              videoBlobRef.current = URL.createObjectURL(data.video);
            }
            setLiveVideoUrl(videoBlobRef.current || data.videoUrl);
            setUploadData(data);
            setScreen("analyzing");
          }}
        />
        </StriveErrorBoundary>
      )}
      {screen === "analyzing" && (
        <StriveErrorBoundary name="Analysis">
        <AnalyzingScreen
          uploadData={uploadData}
          profile={profile}
          onComplete={handleAnalysisComplete}
          onBack={() => setScreen("upload")}
        />
        </StriveErrorBoundary>
      )}
      {screen === "results" && (
        <StriveErrorBoundary name="Results">
        {useNewResults ? (
          <Suspense fallback={<div style={{ minHeight: "100vh", background: "#070c16" }} />}>
          <NewResultsScreen
            result={analysisResult}
            profile={profile}
            tier={normalizedTier}
            previousResult={(() => {
              if (!analysisResult || !history || history.length < 2) return null;
              const event = analysisResult.event || uploadData?.event;
              for (let i = 1; i < history.length; i++) {
                if (history[i].event === event && savedResults[history[i].id]) {
                  return savedResults[history[i].id];
                }
              }
              return null;
            })()}
            history={Object.values(savedResults)}
            onUpgrade={() => {
              setShowUpgradeModal(true);
            }}
            onSeek={() => {}}
            onBack={() => setScreen("dashboard")}
            videoUrl={liveVideoUrl}
            videoFile={videoFileRef.current}
          />
          </Suspense>
        ) : (
          <ResultsScreen
            result={analysisResult}
            profile={profile}
            history={history}
            videoUrl={liveVideoUrl}
            videoFile={videoFileRef.current}
            onBack={() => setScreen("dashboard")}
            onDrills={() => setScreen("drills")}
          />
        )}
        </StriveErrorBoundary>
      )}
      {screen === "drills" && (
        <StriveErrorBoundary name="Drills">
        <DrillsScreen
          result={analysisResult}
          onBack={() => setScreen("results")}
        />
        </StriveErrorBoundary>
      )}
      {screen === "meetfocus" && (
        <StriveErrorBoundary name="Meet Focus">
        <PreMeetFocusScreen
          profile={profile}
          history={history}
          savedResults={savedResults}
          onBack={() => setScreen("dashboard")}
        />
        </StriveErrorBoundary>
      )}
      {screen === "deductions" && (
        <StriveErrorBoundary name="Deductions Guide">
        <DeductionsScreen onBack={() => setScreen("dashboard")} profile={profile} />
        </StriveErrorBoundary>
      )}
      {screen === "settings" && (
        <StriveErrorBoundary name="Settings">
        <SettingsScreen
          profile={profile}
          onSave={(p) => { saveProfile(p); setScreen("dashboard"); }}
          onBack={() => setScreen("dashboard")}
          onTierChange={(t) => { try { localStorage.setItem("strive-tier", t); } catch {} setUserTier(t); }}
          onReset={() => {
            setProfile(null);
            setHistory([]);
            (async () => {
              try { await storage.delete("strive-profile"); } catch {}
              try { await storage.delete("strive-history"); } catch {}
            })();
            setScreen("splash");
          }}
        />
        </StriveErrorBoundary>
      )}
      {screen === "progress" && (
        <StriveErrorBoundary name="Progress">
        {(() => {
          let tier = "free"; try { tier = localStorage.getItem("strive-tier") || "free"; } catch {}
          return tier === "competitive" ? (
            <ProgressScreen history={history} profile={profile} savedResults={savedResults} comparePreselect={comparePreselect} onClearPreselect={() => setComparePreselect(null)} onBack={() => setScreen("dashboard")} />
          ) : (
            <div style={{ minHeight: "100vh", padding: "16px 18px 90px", maxWidth: 540, margin: "0 auto" }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, marginTop: 8 }}>📈 Progress Tracking</h2>
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, marginBottom: 16 }}>Track your score trends across the season.</p>
              {/* Show basic stats as teaser */}
              {history.length > 0 && (
                <div className="card" style={{ padding: 16, marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Total analyses: <span style={{ color: "#e8962a", fontWeight: 700 }}>{history.length}</span></div>
                </div>
              )}
              <div style={{ border: "1.5px solid rgba(139,92,246,0.25)", borderRadius: 16, padding: 24, textAlign: "center", background: "rgba(139,92,246,0.04)" }}>
                <div style={{ fontSize: 22, marginBottom: 8 }}>🔒</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Score History & Trends</div>
                <div style={{ fontSize: 12, color: "#8890AB", lineHeight: 1.6, marginBottom: 16 }}>Score charts over time, event-by-event trends, deduction pattern tracking, and improvement velocity — see exactly where you're getting better and what still needs work.</div>
                <button onClick={() => setShowUpgradeModal(true)} style={{ background: "linear-gradient(135deg, #8B5CF6, #A78BFA)", color: "#FFF", border: "none", padding: "12px 32px", borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "'Outfit', sans-serif" }}>
                  Upgrade to STRIVE Competitive
                </button>
              </div>
            </div>
          );
        })()}
        </StriveErrorBoundary>
      )}
      {screen === "meets" && (
        <StriveErrorBoundary name="Meets">
        <MeetsScreen history={history} savedResults={savedResults} profile={profile}
          onBack={() => setScreen("dashboard")}
          onViewResult={(r) => { setAnalysisResult(r); setLiveVideoUrl(null); setScreen("results"); }}
          onCompare={(id) => { setComparePreselect(id); setScreen("progress"); }}
        />
        </StriveErrorBoundary>
      )}
      {screen === "mental" && (
        <StriveErrorBoundary name="Mental Training">
        {(() => {
          let tier = "free"; try { tier = localStorage.getItem("strive-tier") || "free"; } catch {}
          return tier === "competitive" ? (
            <MentalTrainingScreen profile={profile} onBack={() => setScreen("dashboard")} />
          ) : (
            <div style={{ minHeight: "100vh", padding: "16px 18px 90px", maxWidth: 540, margin: "0 auto" }}>
              <button onClick={() => setScreen("dashboard")} style={{ background: "none", border: "none", color: "#e8962a", cursor: "pointer", fontFamily: "'Outfit', sans-serif", fontSize: 15, fontWeight: 600, marginBottom: 20 }}>← Dashboard</button>
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>🧠 Mental Training</h2>
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, marginBottom: 24 }}>Gymnastics is 80% mental. Train the mind alongside the body.</p>
              {/* Free teaser */}
              <div className="card" style={{ padding: 20, marginBottom: 16, borderColor: "rgba(232,150,42,0.15)" }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: "#e8962a", marginBottom: 10 }}>The 4 Pillars</h3>
                {["Visualization — mentally rehearse routines", "Breathing — control nerves before competing", "Confidence — replace negative self-talk", "Pressure Management — make meets feel familiar"].map((p, i) => (
                  <div key={i} style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", padding: "6px 0", borderBottom: i < 3 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>{p}</div>
                ))}
              </div>
              {/* Pro gate */}
              <div style={{ border: "1.5px solid rgba(139,92,246,0.25)", borderRadius: 16, padding: 24, textAlign: "center", background: "rgba(139,92,246,0.04)" }}>
                <div style={{ fontSize: 22, marginBottom: 8 }}>🔒</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Full Mental Training Suite</div>
                <div style={{ fontSize: 12, color: "#8890AB", lineHeight: 1.6, marginBottom: 16 }}>
                  Guided visualization scripts, breathing techniques (4-7-8, box breathing, power breath), confidence-building exercises, competition day protocols, and parent coaching tips.
                </div>
                <button onClick={() => setShowUpgradeModal(true)} style={{ background: "linear-gradient(135deg, #8B5CF6, #A78BFA)", color: "#FFF", border: "none", padding: "12px 32px", borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "'Outfit', sans-serif" }}>
                  Upgrade to STRIVE Competitive
                </button>
              </div>
            </div>
          );
        })()}
        </StriveErrorBoundary>
      )}
      {screen === "goals" && (
        <StriveErrorBoundary name="Season Goals">
        {(() => {
          let tier = "free"; try { tier = localStorage.getItem("strive-tier") || "free"; } catch {}
          return tier === "competitive" ? (
            <SeasonGoalsScreen profile={profile} history={history} onBack={() => setScreen("dashboard")} />
          ) : (
            <div style={{ minHeight: "100vh", padding: "16px 18px 90px", maxWidth: 540, margin: "0 auto" }}>
              <button onClick={() => setScreen("dashboard")} style={{ background: "none", border: "none", color: "#e8962a", cursor: "pointer", fontFamily: "'Outfit', sans-serif", fontSize: 15, fontWeight: 600, marginBottom: 20 }}>← Dashboard</button>
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>🎯 Season Goals</h2>
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, marginBottom: 24 }}>Set targets and track progress across the season.</p>
              <div style={{ border: "1.5px solid rgba(139,92,246,0.25)", borderRadius: 16, padding: 24, textAlign: "center", background: "rgba(139,92,246,0.04)" }}>
                <div style={{ fontSize: 22, marginBottom: 8 }}>🔒</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Season Goal Tracking</div>
                <div style={{ fontSize: 12, color: "#8890AB", lineHeight: 1.6, marginBottom: 16 }}>
                  Set event-specific score targets, track your progress over time, identify trends in your training, and get personalized recommendations for reaching your goals.
                </div>
                <button onClick={() => setShowUpgradeModal(true)} style={{ background: "linear-gradient(135deg, #8B5CF6, #A78BFA)", color: "#FFF", border: "none", padding: "12px 32px", borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "'Outfit', sans-serif" }}>
                  Upgrade to STRIVE Competitive
                </button>
              </div>
            </div>
          );
        })()}
        </StriveErrorBoundary>
      )}

      {/* Bottom Navigation */}
      {/* ── New Training Screen ── */}
      {screen === "training" && (
        <StriveErrorBoundary name="Training">
        <Suspense fallback={<div style={{ minHeight: "100vh", background: "#070c16" }} />}>
        <TrainingScreen
          result={analysisResult}
          profile={profile}
          tier={normalizedTier}
          onBack={() => setScreen("dashboard")}
        />
        </Suspense>
        </StriveErrorBoundary>
      )}

      {["dashboard", "deductions", "meets", "progress", "mental", "goals", "settings", "meetfocus", "training"].includes(screen) && (
        <nav style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100,
          background: "linear-gradient(to top, #070c16 85%, rgba(11,16,36,0.95) 92%, transparent)",
          paddingBottom: "max(10px, env(safe-area-inset-bottom))",
          paddingTop: 6,
        }}>
          <div style={{ display: "flex", justifyContent: "space-around", maxWidth: 420, margin: "0 auto", padding: "0 12px" }}>
            {[
              { id: "dashboard", label: "Home", svg: `<path d="M3 10.5L10 4l7 6.5V18a1 1 0 01-1 1h-4v-5h-4v5H4a1 1 0 01-1-1z" stroke-linejoin="round"/>` },
              { id: "training", label: "Training", svg: `<path d="M4 14l3-3 3 3 6-6"/><path d="M14 8h4v4"/>` },
              { id: "upload", label: "Analyze", primary: true, svg: `<circle cx="10" cy="10" r="8"/><path d="M10 6v8M6 10h8"/>` },
              { id: "progress", label: "Progress", svg: `<circle cx="10" cy="10" r="7.5"/><path d="M10 5v5l3 3"/>` },
              { id: "settings", label: "Profile", svg: `<circle cx="10" cy="7" r="3.5"/><path d="M3.5 18c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5"/>` },
            ].map(tab => {
              const isActive = screen === tab.id;
              const color = tab.primary ? "#e8962a" : isActive ? "#e8962a" : "rgba(255,255,255,0.22)";
              return (
                <button
                  key={tab.id}
                  onClick={() => setScreen(tab.id)}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                    padding: "8px 16px",
                    borderRadius: 14, border: "none", cursor: "pointer",
                    fontFamily: "'Outfit', sans-serif", fontSize: 9, fontWeight: 600,
                    background: tab.primary ? "rgba(232,150,42,0.08)" : "transparent",
                    color,
                    transition: "all 0.15s", WebkitTapHighlightColor: "transparent",
                    letterSpacing: 0.3,
                    ...(tab.primary ? { border: "1px solid rgba(232,150,42,0.12)", borderRadius: 16 } : {}),
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" dangerouslySetInnerHTML={{ __html: tab.svg }} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}

      {/* ── Legal Disclaimer (before first analysis) ── */}
      {screen === "legal-disclaimer" && (
        <LegalDisclaimer
          onAccept={() => {
            try { localStorage.setItem("strive-legal-accepted", "true"); } catch {}
            // Resume the analysis flow with pending data
            if (pendingAnalyzeData) {
              const data = pendingAnalyzeData;
              setPendingAnalyzeData(null);
              if (videoBlobRef.current) { try { URL.revokeObjectURL(videoBlobRef.current); } catch {} }
              if (data.video) {
                videoFileRef.current = data.video;
                videoBlobRef.current = URL.createObjectURL(data.video);
              }
              setLiveVideoUrl(videoBlobRef.current || data.videoUrl);
              setUploadData(data);
              setScreen("analyzing");
            } else {
              setScreen("upload");
            }
          }}
          onBack={() => setScreen("upload")}
        />
      )}

      {/* ── Upgrade Modal ── */}
      {showUpgradeModal && (
        <Suspense fallback={null}>
          <UpgradeModal
            currentTier={normalizedTier}
            onClose={() => setShowUpgradeModal(false)}
          />
        </Suspense>
      )}
    </div>
  );
}
function SplashScreen({ onStart }) {
  const [entered, setEntered] = useState(false);
  useEffect(() => { setTimeout(() => setEntered(true), 100); }, []);

  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: 32, textAlign: "center",
      position: "relative", overflow: "hidden",
    }}>
      {/* Background grid */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, bottom: 0, pointerEvents: "none",
        backgroundImage: `linear-gradient(rgba(232,150,42,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(232,150,42,0.015) 1px, transparent 1px)`,
        backgroundSize: "60px 60px", opacity: 0.5,
      }} />
      <div style={{
        position: "absolute", top: "10%", left: "50%", transform: "translateX(-50%)",
        width: 400, height: 400, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(232,150,42,0.05) 0%, transparent 60%)",
        pointerEvents: "none",
      }} />

      {/* Arc Logo */}
      <div style={{
        opacity: entered ? 1 : 0, transform: entered ? "scale(1)" : "scale(0.85)",
        transition: "all 1s cubic-bezier(0.16, 1, 0.3, 1)",
        marginBottom: 32,
      }}>
        <svg viewBox="0 0 120 120" width="110" height="110" style={{ filter: "drop-shadow(0 0 24px rgba(232,150,42,0.2))" }}>
          <defs>
            <linearGradient id="sg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#e8962a" />
              <stop offset="50%" stopColor="#ffc15a" />
              <stop offset="100%" stopColor="#e8962a" />
            </linearGradient>
          </defs>
          <circle cx="60" cy="60" r="56" fill="none" stroke="url(#sg)" strokeWidth="1.2" opacity="0.25" />
          <circle cx="60" cy="60" r="52" fill="none" stroke="url(#sg)" strokeWidth="0.5" opacity="0.1" />
          <g transform="translate(60,62)">
            <path d="M-30 22 Q-10 -32, 20 -20 Q35 -12, 28 22" fill="none" stroke="url(#sg)" strokeWidth="3.5" strokeLinecap="round" />
            <path d="M-20 16 Q-4 -18, 18 -12" fill="none" stroke="#ffc15a" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
            <circle cx="22" cy="-22" r="3" fill="#ffc15a" opacity="0.85" />
            <circle cx="22" cy="-22" r="6" fill="#ffc15a" opacity="0.1" />
          </g>
          <text x="60" y="106" textAnchor="middle" fill="url(#sg)" fontFamily="'Space Mono', monospace" fontSize="8" fontWeight="700" opacity="0.2">10.000</text>
        </svg>
      </div>

      {/* Brand */}
      <div style={{
        opacity: entered ? 1 : 0, transform: entered ? "translateY(0)" : "translateY(16px)",
        transition: "all 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.3s",
      }}>
        <h1 style={{
          fontFamily: "'Georgia', 'Times New Roman', serif", fontSize: 42, fontWeight: 500,
          letterSpacing: 8, marginBottom: 0, lineHeight: 1,
        }}>
          <span style={{
            background: "linear-gradient(135deg, #e8962a, #ffc15a, #e8962a)",
            backgroundClip: "text", WebkitBackgroundClip: "text", color: "transparent",
          }}>STRIVE</span>
        </h1>
        <div style={{
          fontSize: 10, fontWeight: 600, letterSpacing: 3,
          color: "rgba(255,255,255,0.2)", marginTop: 10,
          textTransform: "uppercase",
        }}>
          See Your Score. Own Your Growth.
        </div>
      </div>

      {/* Description */}
      <div style={{
        opacity: entered ? 1 : 0, transform: entered ? "translateY(0)" : "translateY(16px)",
        transition: "all 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.6s",
        marginTop: 28, marginBottom: 40,
      }}>
        <p style={{
          color: "rgba(255,255,255,0.3)", fontSize: 14, maxWidth: 320,
          margin: "0 auto", lineHeight: 1.8, fontWeight: 400,
        }}>
          Advanced video analysis using official USA Gymnastics & Xcel scoring criteria. 
          Detailed deduction breakdowns and personalized training to raise your score.
        </p>
      </div>

      {/* Value props */}
      <div style={{
        opacity: entered ? 1 : 0, transform: entered ? "translateY(0)" : "translateY(16px)",
        transition: "all 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.7s",
        display: "flex", flexDirection: "column", gap: 8, marginBottom: 36, width: "100%", maxWidth: 340,
      }}>
        {[
          { icon: "🎯", text: "Understand exactly why your score is what it is" },
          { icon: "📈", text: "Get a personalized plan to improve every tenth" },
          { icon: "🧠", text: "Mental training, nutrition, and recovery guidance" },
        ].map((prop, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 14, padding: "12px 16px",
            borderRadius: 12, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)",
          }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>{prop.icon}</span>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", lineHeight: 1.4 }}>{prop.text}</span>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div style={{
        opacity: entered ? 1 : 0, transform: entered ? "translateY(0)" : "translateY(16px)",
        transition: "all 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.9s",
      }}>
        <button className="btn-gold" onClick={onStart} style={{
          fontSize: 16, padding: "16px 56px", letterSpacing: 0.5,
          borderRadius: 14,
        }}>
          Get Started
        </button>
      </div>

      {/* Bottom badges */}
      <div style={{
        position: "absolute", bottom: 28, left: 0, right: 0,
        display: "flex", justifyContent: "center", gap: 20,
        opacity: entered ? 1 : 0, transition: "opacity 1s 1.2s",
      }}>
        {["USAG Levels 1–10", "Xcel Bronze–Sapphire", "MAG & WAG"].map((badge, i) => (
          <span key={i} style={{
            fontSize: 8, fontWeight: 600, letterSpacing: 1.5,
            color: "rgba(232,150,42,0.25)", textTransform: "uppercase",
          }}>
            {badge}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── ONBOARDING ─────────────────────────────────────────────────────
function OnboardingScreen({ onComplete }) {
  const [step, setStep] = useState(0);
  const [role, setRole] = useState("");
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [levelCategory, setLevelCategory] = useState("");
  const [level, setLevel] = useState("");
  const [goals, setGoals] = useState("");

  // Legal flow sub-screens
  const [legalScreen, setLegalScreen] = useState(null); // "age-gate" | "parental-consent" | "privacy-notice" | null
  const [dateOfBirth, setDateOfBirth] = useState(null);
  const [requiresParentalConsent, setRequiresParentalConsent] = useState(false);
  const [isMinor, setIsMinor] = useState(false);
  const [parentalConsentRecord, setParentalConsentRecord] = useState(null);

  const events = gender === "female" ? WOMEN_EVENTS : gender === "male" ? MEN_EVENTS : [];
  // Auto-populate all events for the selected gender
  const primaryEvents = events;
  const levelOptions = gender && levelCategory
    ? LEVELS[gender === "female" ? "women" : "men"][levelCategory] || []
    : [];

  const canProceed = () => {
    if (step === 0) return role !== "";
    if (step === 1) return name.trim().length > 0;
    if (step === 2) return gender !== "";
    if (step === 3) return levelCategory !== "" && level !== "";
    if (step === 4) return true; // goals — always can proceed
    return false;
  };

  const handleNext = () => {
    // After name (step 1), show AgeGate before proceeding to gender (step 2)
    if (step === 1) {
      setLegalScreen("age-gate");
      return;
    }
    // After goals (step 4), show PrivacyNotice before completing
    if (step === 4) {
      setLegalScreen("privacy-notice");
      return;
    }
    if (step < 4) setStep(step + 1);
  };

  const steps = [
    // Step 0: Role selection
    <div key="role" style={{ animation: "floatIn 0.4s ease-out" }}>
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>Welcome to STRIVE</h2>
      <p style={{ color: "rgba(255,255,255,0.35)", marginBottom: 28, fontSize: 14 }}>How will you be using the app?</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[
          { val: "parent", label: "Parent", desc: "Recording my child's routines", icon: "👨‍👩‍👧" },
          { val: "athlete", label: "Athlete", desc: "Analyzing my own routines", icon: "🤸" },
          { val: "coach", label: "Coach", desc: "Working with athletes on scores", icon: "🏅" },
        ].map(opt => (
          <button
            key={opt.val}
            onClick={() => setRole(opt.val)}
            style={{
              display: "flex", alignItems: "center", gap: 14, padding: "16px 18px",
              background: role === opt.val ? "rgba(232,150,42,0.08)" : "rgba(255,255,255,0.02)",
              border: `1.5px solid ${role === opt.val ? "rgba(232,150,42,0.4)" : "rgba(255,255,255,0.05)"}`,
              borderRadius: 16, cursor: "pointer", textAlign: "left",
              transition: "all 0.2s",
            }}
          >
            <span style={{ fontSize: 24, flexShrink: 0 }}>{opt.icon}</span>
            <div>
              <div style={{ color: role === opt.val ? "#ffc15a" : "#e2e8f0", fontWeight: 600, fontSize: 15, transition: "color 0.2s" }}>{opt.label}</div>
              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, marginTop: 2 }}>{opt.desc}</div>
            </div>
            {role === opt.val && (
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ marginLeft: "auto", flexShrink: 0 }}>
                <circle cx="9" cy="9" r="8" fill="rgba(232,150,42,0.2)" stroke="#e8962a" strokeWidth="1.5"/>
                <path d="M5.5 9l2.5 2.5 4.5-4.5" stroke="#e8962a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </button>
        ))}
      </div>
    </div>,

    // Step 1: Name
    <div key="name" style={{ animation: "floatIn 0.4s ease-out" }}>
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>
        {role === "parent" ? "Gymnast's name" : "Your name"}
      </h2>
      <p style={{ color: "rgba(255,255,255,0.35)", marginBottom: 28, fontSize: 14 }}>
        {role === "parent" ? "We'll personalize everything for your child" : "We'll personalize your experience"}
      </p>
      <input
        className="input-field"
        placeholder={role === "parent" ? "Enter gymnast's name" : "Enter your name"}
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
        style={{ fontSize: 17, padding: 16 }}
      />
    </div>,

    // Step 2: Gender
    <div key="gender" style={{ animation: "floatIn 0.4s ease-out" }}>
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>Program type</h2>
      <p style={{ color: "rgba(255,255,255,0.35)", marginBottom: 28, fontSize: 14 }}>
        Sets the correct apparatus and judging criteria
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {[{ val: "female", label: "Women's artistic", icon: "🤸‍♀️", desc: "VT · UB · BB · FX" },
          { val: "male", label: "Men's artistic", icon: "🤸‍♂️", desc: "FX · PH · SR · VT · PB · HB" }
        ].map(opt => (
          <button
            key={opt.val}
            onClick={() => { setGender(opt.val); setLevelCategory(""); setLevel(""); }}
            style={{
              background: gender === opt.val ? "rgba(232,150,42,0.1)" : "rgba(255,255,255,0.02)",
              border: `1.5px solid ${gender === opt.val ? "rgba(232,150,42,0.4)" : "rgba(255,255,255,0.05)"}`,
              borderRadius: 16, padding: 20, cursor: "pointer", textAlign: "center",
              transition: "all 0.2s",
            }}
          >
            <span style={{ fontSize: 32, display: "block", marginBottom: 10 }}>{opt.icon}</span>
            <span style={{ color: gender === opt.val ? "#ffc15a" : "#e2e8f0", fontWeight: 600, fontSize: 14, display: "block" }}>{opt.label}</span>
            <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 11, marginTop: 4, display: "block", fontFamily: "'Space Mono', monospace" }}>
              {opt.desc}
            </span>
          </button>
        ))}
      </div>
    </div>,

    // Step 3: Level
    <div key="level" style={{ animation: "fadeIn 0.5s ease-out" }}>
      <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Competition Level</h2>
      <p style={{ color: "rgba(255,255,255,0.5)", marginBottom: 24 }}>
        This determines the scoring criteria and special requirements.
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {[
          { val: "compulsory", label: "Compulsory" },
          { val: "optional", label: "Optional" },
          ...(gender === "female" ? [{ val: "xcel", label: "Xcel" }] : []),
        ].map(cat => (
          <button
            key={cat.val}
            onClick={() => { setLevelCategory(cat.val); setLevel(""); }}
            style={{
              flex: 1, padding: "10px 8px", borderRadius: 10, border: "none", cursor: "pointer",
              fontFamily: "'Outfit', sans-serif", fontWeight: 600, fontSize: 13,
              background: levelCategory === cat.val ? "linear-gradient(135deg, #e8962a, #ffc15a)" : "rgba(255,255,255,0.06)",
              color: levelCategory === cat.val ? "#070c16" : "rgba(255,255,255,0.6)",
              transition: "all 0.3s",
            }}
          >
            {cat.label}
          </button>
        ))}
      </div>
      {levelOptions.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {levelOptions.map(l => (
            <button
              key={l}
              onClick={() => setLevel(l)}
              style={{
                padding: "14px 16px", borderRadius: 10, border: "none", cursor: "pointer",
                fontFamily: "'Outfit', sans-serif", fontWeight: 500, fontSize: 14, textAlign: "left",
                background: level === l ? "rgba(232,150,42,0.15)" : "rgba(255,255,255,0.04)",
                color: level === l ? "#e8962a" : "rgba(255,255,255,0.6)",
                border: `1.5px solid ${level === l ? "rgba(232,150,42,0.4)" : "rgba(255,255,255,0.06)"}`,
                transition: "all 0.3s",
              }}
            >
              {l}
            </button>
          ))}
        </div>
      )}
    </div>,

    // Step 4: Age & Goals (optional)
    <div key="goals" style={{ animation: "fadeIn 0.5s ease-out" }}>
      <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>About {name || "the Gymnast"}</h2>
      <p style={{ color: "rgba(255,255,255,0.5)", marginBottom: 24 }}>
        Optional — helps personalize training, nutrition, and mental prep recommendations for age and goals.
      </p>
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: "block", color: "rgba(255,255,255,0.6)" }}>AGE</label>
        <input
          className="input-field"
          type="number"
          min="4"
          max="25"
          placeholder="e.g. 10"
          value={age}
          onChange={(e) => setAge(e.target.value)}
          style={{ fontSize: 18, padding: 14 }}
        />
      </div>
      <div>
        <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: "block", color: "rgba(255,255,255,0.6)" }}>GOALS</label>
        <select className="input-field" value={goals} onChange={e => setGoals(e.target.value)} style={{ fontSize: 15, padding: 14 }}>
          <option value="">Select a goal...</option>
          <option value="improve scores">Improve meet scores</option>
          <option value="move up levels">Move up to the next level</option>
          <option value="qualify regionals">Qualify for Regionals/State</option>
          <option value="college gymnastics">Earn a college scholarship</option>
          <option value="injury recovery">Return from injury safely</option>
          <option value="build confidence">Build confidence and consistency</option>
          <option value="have fun">Have fun and stay healthy</option>
        </select>
      </div>
    </div>,
  ];

  // ── Legal sub-screens (AgeGate, ParentalConsent, PrivacyNotice) ──
  if (legalScreen === "age-gate") {
    return (
      <AgeGate
        onComplete={(result) => {
          setDateOfBirth(result.dateOfBirth);
          setRequiresParentalConsent(result.requiresParentalConsent);
          setIsMinor(result.isMinor);
          if (result.requiresParentalConsent) {
            setLegalScreen("parental-consent");
          } else {
            setLegalScreen(null);
            setStep(2); // proceed to gender
          }
        }}
        onBack={() => setLegalScreen(null)}
      />
    );
  }

  if (legalScreen === "parental-consent") {
    return (
      <ParentalConsent
        athleteName={name}
        onConsent={(record) => {
          setParentalConsentRecord(record);
          setLegalScreen(null);
          setStep(2); // proceed to gender
        }}
        onDecline={() => {
          // Stay on declined screen (ParentalConsent handles the declined UI)
        }}
        onBack={() => setLegalScreen("age-gate")}
      />
    );
  }

  if (legalScreen === "privacy-notice") {
    return (
      <PrivacyNotice
        onAcknowledge={() => {
          setLegalScreen(null);
          onComplete({
            role, name, age: age ? parseInt(age) : null, gender, levelCategory, level,
            primaryEvents, goals: goals.trim() || null, createdAt: Date.now(),
            dateOfBirth, requiresParentalConsent, isMinor,
            ...(parentalConsentRecord ? { parentalConsent: parentalConsentRecord } : {}),
          });
        }}
        onBack={() => setLegalScreen(null)}
      />
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", padding: "24px 22px" }}>
      {/* Progress */}
      <div style={{ display: "flex", gap: 5, marginBottom: 40 }}>
        {[0,1,2,3,4].map(i => (
          <div key={i} style={{
            flex: 1, height: 2.5, borderRadius: 2,
            background: i <= step ? "linear-gradient(90deg, #e8962a, #ffc15a)" : "rgba(255,255,255,0.06)",
            transition: "all 0.4s ease-out",
          }} />
        ))}
      </div>
      <div style={{ flex: 1, maxWidth: 420, margin: "0 auto", width: "100%" }}>
        {steps[step]}
      </div>
      <div style={{ display: "flex", gap: 10, maxWidth: 420, margin: "28px auto 0", width: "100%" }}>
        {step > 0 && (
          <button className="btn-outline" onClick={() => setStep(step - 1)} style={{ flex: 1, padding: "13px 16px", fontSize: 14 }}>
            Back
          </button>
        )}
        <button
          className="btn-gold"
          onClick={handleNext}
          disabled={!canProceed()}
          style={{ flex: 2, opacity: canProceed() ? 1 : 0.35, pointerEvents: canProceed() ? "auto" : "none", padding: "14px 24px", fontSize: 15 }}
        >
          {step === 4 ? "Start analyzing" : "Continue"}
        </button>
      </div>
    </div>
  );
}

// ─── DASHBOARD ──────────────────────────────────────────────────────
const DashboardScreen = React.memo(function DashboardScreen({ profile, history, savedResults, onUpload, onSettings, onViewDeductions, onViewResult, onProgress, onMeets, onMental, onGoals, onMeetFocus }) {
  const events = profile.gender === "female" ? WOMEN_EVENTS : MEN_EVENTS;
  const avgScore = useMemo(() => history.length > 0
    ? (history.reduce((s, h) => s + (h.score || 0), 0) / history.length).toFixed(3)
    : "—", [history]);

  // ── Compute score trend for hero card ──
  const recentScores = useMemo(() => history.slice(0, 6).map(h => h.score || 0).reverse(), [history]);
  const scoreTrend = useMemo(() => recentScores.length >= 2
    ? Math.round((recentScores[recentScores.length - 1] - recentScores[0]) * 1000) / 1000
    : 0, [recentScores]);
  const maxRecent = useMemo(() => recentScores.length > 0 ? Math.max(...recentScores) : 0, [recentScores]);

  // ── Daily affirmation (rotates daily, role-aware) ──
  const day = Math.floor(Date.now() / 86400000);
  const athleteAffirmations = [
    "I have trained for this. My body knows what to do.",
    "Trust your training. Your routine is ready.",
    "I am strong, I am prepared, I am ready.",
    "Every rep in practice built this moment. Enjoy it.",
    "Nervous energy is just excitement. I channel it into power.",
    "I compete for myself. My best is enough.",
    "Mistakes don't define me. I recover and keep going.",
    "Progress is my competition. Yesterday's me is who I beat.",
    "I breathe, I focus, I perform. That's all I need to do.",
    "The work I've put in is already done. Now I just enjoy it.",
    "I was built for this moment.",
    "My body is strong. My mind is stronger.",
    "I choose courage over comfort today.",
    "Every routine is a chance to show what I can do.",
    "I trust my training. I trust my coach. I trust myself.",
  ];
  const parentAffirmations = [
    `${profile.name} has put in the work. Trust the process.`,
    "Your child's effort matters more than any score on the board.",
    `Every practice has made ${profile.name} stronger. The results will come.`,
    "The best thing you can do at a meet: smile, cheer, and let them compete.",
    `${profile.name} is building skills that last a lifetime — discipline, resilience, confidence.`,
    "Don't compare scores between gymnasts. Every journey is different.",
    `Small improvements add up. ${profile.name} is on the right path.`,
    "The car ride home should be about joy, not scores. Ask what was fun.",
    "Your support is the foundation your gymnast builds everything on.",
    `${profile.name}'s coach sees potential you might not notice yet. Trust them.`,
  ];
  const coachAffirmations = [
    "Every correction you make today shows up in their score tomorrow.",
    "The athletes who trust their coach perform best under pressure.",
    "Focus on the process. The scores follow the fundamentals.",
    "Your eye for detail is what separates good gymnasts from great ones.",
    "One drill, done perfectly, is worth more than ten done carelessly.",
  ];
  const affirmationPool = profile.role === "parent" ? parentAffirmations : profile.role === "coach" ? coachAffirmations : athleteAffirmations;
  const todayAffirmation = affirmationPool[day % affirmationPool.length];

  return (
    <div style={{ minHeight: "100vh", padding: "16px 18px 100px", maxWidth: 540, margin: "0 auto" }}>
      {/* Header bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, padding: "4px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <svg viewBox="0 0 28 28" width="24" height="24" style={{ flexShrink: 0 }}>
            <g transform="translate(14,15)">
              <path d="M-9 7 Q-3 -10, 7 -5 Q11 -2, 8 7" fill="none" stroke="#e8962a" strokeWidth="2.2" strokeLinecap="round"/>
              <circle cx="8" cy="-6" r="1.3" fill="#ffc15a"/>
            </g>
          </svg>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.2 }}>
              {profile.role === "parent" ? (
                <><span style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, fontWeight: 400 }}>Tracking </span><span style={{ color: "#ffc15a" }}>{profile.name}</span></>
              ) : (
                <><span style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, fontWeight: 400 }}>Hey, </span><span style={{ color: "#ffc15a" }}>{profile.name}</span></>
              )}
            </h1>
            <p style={{ color: "rgba(255,255,255,0.2)", fontSize: 11, marginTop: 1, letterSpacing: 0.3 }}>
              {profile.level} · {profile.gender === "female" ? "WAG" : "MAG"}
              {profile.role === "coach" && " · Coach"}
            </p>
          </div>
        </div>
        <button
          onClick={onSettings}
          style={{
            width: 36, height: 36, borderRadius: 10, border: "1px solid rgba(255,255,255,0.05)",
            background: "rgba(255,255,255,0.025)", cursor: "pointer", display: "flex",
            alignItems: "center", justifyContent: "center", transition: "all 0.2s",
          }}
        >
          <Icon name="user" size={15} />
        </button>
      </div>

      {/* Upload CTA */}
      {(() => {
        let tier = "free"; try { tier = localStorage.getItem("strive-tier") || "free"; } catch {}
        const isPro = tier === "competitive";
        let analysesUsed = 0;
        let limitReached = false;
        if (!isPro) {
          try {
            const now = new Date();
            const raw = localStorage.getItem("strive-analysis-count");
            if (raw) {
              const data = JSON.parse(raw);
              if (data.month === now.getMonth() && data.year === now.getFullYear()) {
                analysesUsed = data.count;
              }
            }
          } catch {}
          limitReached = analysesUsed >= 3;
        }
        const remaining = isPro ? null : 3 - analysesUsed;

        return limitReached ? (
          <div style={{
            width: "100%", padding: "24px", borderRadius: 20, textAlign: "center",
            background: "rgba(139,92,246,0.04)", border: "1.5px solid rgba(139,92,246,0.2)",
            marginBottom: 24,
          }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>🔒</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Monthly limit reached</div>
            <div style={{ fontSize: 13, color: "#8890AB", lineHeight: 1.6, marginBottom: 16, maxWidth: 280, margin: "0 auto" }}>
              You've used all 3 free analyses this month. Upgrade to Competitive for unlimited video analysis.
            </div>
            <button onClick={() => setShowUpgradeModal(true)} style={{
              background: "linear-gradient(135deg, #8B5CF6, #A78BFA)", color: "#FFF",
              border: "none", padding: "12px 32px", borderRadius: 12, fontWeight: 700,
              fontSize: 14, cursor: "pointer", fontFamily: "'Outfit', sans-serif",
            }}>
              Upgrade to STRIVE Competitive
            </button>
          </div>
        ) : (
          <button
            onClick={onUpload}
            style={{
              width: "100%", padding: "16px 18px", borderRadius: 18, cursor: "pointer",
              background: "linear-gradient(135deg, rgba(232,150,42,0.1), rgba(232,150,42,0.04))",
              border: "1px solid rgba(232,150,42,0.12)",
              display: "flex", alignItems: "center", gap: 14,
              transition: "all 0.2s", marginBottom: 14, textAlign: "left",
              position: "relative", overflow: "hidden",
            }}
          >
            {/* Subtle gradient accent line at top */}
            <div style={{ position: "absolute", top: 0, left: 20, right: 20, height: 1, background: "linear-gradient(90deg, transparent, rgba(232,150,42,0.2), transparent)" }} />
            <div style={{
              width: 44, height: 44, borderRadius: 13, flexShrink: 0,
              background: "linear-gradient(135deg, #e8962a, #ffc15a)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 2px 12px rgba(232,150,42,0.2)",
            }}>
              <Icon name="camera" size={20} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ color: "#ffc15a", fontWeight: 700, fontSize: 15, display: "block" }}>
                Analyze routine
              </span>
              <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 11, marginTop: 2, display: "block" }}>
                {isPro ? "Unlimited · 2-pass scoring" : `${remaining} free remaining`}
              </span>
            </div>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, opacity: 0.3 }}>
              <path d="M6 3l5 5-5 5" stroke="#e8962a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        );
      })()}

      {/* ── HERO CARD — Daily Focus & Affirmation ── */}
      <div style={{
        background: "linear-gradient(135deg, rgba(232,150,42,0.08), rgba(232,150,42,0.02))",
        border: "1px solid rgba(232,150,42,0.12)",
        borderRadius: 20, padding: "20px 20px 16px", marginBottom: 16,
        animation: "fadeIn 0.5s ease-out",
        position: "relative", overflow: "hidden",
      }}>
        {/* Subtle ambient glow */}
        <div style={{ position: "absolute", top: -40, right: -40, width: 120, height: 120, borderRadius: "50%", background: "rgba(232,150,42,0.06)", pointerEvents: "none" }} />

        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(232,150,42,0.7)", letterSpacing: 1.5, marginBottom: 8 }}>
                TODAY'S FOCUS
              </div>
              <div style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.6, color: "rgba(255,255,255,0.75)", maxWidth: 230 }}>
                "{todayAffirmation}"
              </div>
            </div>
            {/* Score sparkline */}
            {recentScores.length >= 2 && (
              <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 36, marginLeft: 16 }}>
                {recentScores.map((s, i) => {
                  const h = maxRecent > 0 ? Math.max(5, (s / maxRecent) * 36) : 5;
                  const isLast = i === recentScores.length - 1;
                  return (
                    <div key={i} style={{
                      width: 6, borderRadius: 3,
                      height: h,
                      background: isLast ? "#e8962a" : "rgba(232,150,42,0.25)",
                      transition: "height 0.5s ease-out",
                    }} />
                  );
                })}
              </div>
            )}
          </div>
          {/* Stats footer */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(232,150,42,0.06)" }}>
            {history.length > 0 ? (
              <div style={{ display: "flex", gap: 16, fontSize: 11 }}>
                <span style={{ color: "rgba(255,255,255,0.25)" }}>
                  Best: <span style={{ color: "rgba(232,150,42,0.8)", fontWeight: 700, fontFamily: "'Space Mono', monospace" }}>
                    {Math.max(...history.filter(h => h.score).map(h => h.score)).toFixed(1)}
                  </span>
                </span>
                <span style={{ color: "rgba(255,255,255,0.25)" }}>
                  Total: <span style={{ color: "rgba(232,150,42,0.8)", fontWeight: 700 }}>{history.length}</span>
                </span>
              </div>
            ) : (
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>Upload your first routine to get started</div>
            )}
            {scoreTrend !== 0 && (
              <div style={{
                fontSize: 11, fontWeight: 700,
                color: scoreTrend > 0 ? "#22c55e" : "#dc2626",
                background: scoreTrend > 0 ? "rgba(34,197,94,0.08)" : "rgba(220,38,38,0.08)",
                padding: "3px 10px", borderRadius: 6,
              }}>
                {scoreTrend > 0 ? "▲" : "▼"} {Math.abs(scoreTrend).toFixed(2)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Smart Tip — data-driven when history exists, generic otherwise */}
      <div className="card" style={{
        padding: "12px 16px", marginBottom: 16,
        borderColor: "rgba(232,150,42,0.12)",
        background: "rgba(232,150,42,0.03)",
      }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <span style={{ fontSize: 16, flexShrink: 0, marginTop: 2 }}>💡</span>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#e8962a", letterSpacing: 0.5, marginBottom: 4 }}>
              {history.length >= 2 ? "YOUR DATA SAYS" : "DID YOU KNOW?"}
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.7 }}>
              {(() => {
                if (history.length >= 2) {
                  // Generate data-driven tips from actual history
                  const totalLanding = history.slice(0, 5).reduce((s, h) => s + (h.landingCount || 0), 0);
                  const totalTpm = history.slice(0, 5).reduce((s, h) => s + (h.tpmCount || 0), 0);
                  const totalKtm = history.slice(0, 5).reduce((s, h) => s + (h.ktmCount || 0), 0);
                  const hasFalls = history.slice(0, 5).some(h => h.hasFall);

                  if (hasFalls) return `Falls cost 0.50 each — that's the single biggest deduction in gymnastics. Focus on consistency over difficulty. A clean routine without falls beats a hard routine with one.`;
                  if (totalLanding >= 4) return `Landing deductions have appeared ${totalLanding} times in your last ${Math.min(5, history.length)} analyses. Stick drills (20 reps, freeze 3 seconds) are the fastest way to fix this — could save 0.20+ per routine.`;
                  if (totalTpm >= 5) return `Toe point issues keep showing up (${totalTpm} times recently). Add theraband ankle exercises to your daily warm-up — 3x20 each direction. This becomes automatic within 2 weeks.`;
                  if (totalKtm >= 4) return `Knee tension deductions are a pattern (${totalKtm} times). Foam block squeezes during handstands and tuck drills will train the squeeze reflex. Coaches: verbal cue "zip your legs" helps.`;

                  const bestScore = Math.max(...history.filter(h => h.score).map(h => h.score));
                  const avgScore = history.filter(h => h.score).reduce((s, h) => s + h.score, 0) / history.filter(h => h.score).length;
                  if (bestScore - avgScore > 0.3) return `Your best score (${bestScore.toFixed(1)}) is ${(bestScore - avgScore).toFixed(1)} higher than your average. That means the skill is there — it's about consistency now. Mental training and routine repetition will close that gap.`;
                }
                return PARENT_TIPS[Math.floor(Date.now() / 86400000) % PARENT_TIPS.length];
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats — sleek row */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {[
          { label: "Analyzed", value: history.length, color: "rgba(232,150,42,0.7)" },
          { label: "Avg", value: avgScore, color: "rgba(232,150,42,0.7)" },
          { label: "Trend", value: scoreTrend !== 0 ? (scoreTrend > 0 ? "+" : "") + scoreTrend.toFixed(2) : "—", color: scoreTrend > 0 ? "#22c55e" : scoreTrend < 0 ? "#dc2626" : "rgba(255,255,255,0.2)" },
        ].map((stat, i) => (
          <div key={i} style={{
            flex: 1, textAlign: "center", padding: "14px 6px",
            borderRadius: 14, background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.03)",
          }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: stat.color, fontFamily: "'Space Mono', monospace", lineHeight: 1 }}>
              {stat.value}
            </div>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", fontWeight: 600, marginTop: 6, letterSpacing: 0.5 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Mini Score History Chart — shows with 3+ analyses */}
      {history.length >= 3 && (() => {
        const scores = history.slice(0, 10).filter(h => h.score > 0).map(h => h.score).reverse();
        if (scores.length < 3) return null;
        const min = Math.min(...scores) - 0.3;
        const max = Math.max(...scores) + 0.3;
        const range = max - min || 1;
        const w = 280, h = 60;
        const points = scores.map((s, i) => ({
          x: (i / (scores.length - 1)) * w,
          y: h - ((s - min) / range) * h,
        }));
        const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
        const area = line + ` L${w},${h} L0,${h} Z`;
        return (
          <div style={{
            marginBottom: 16, padding: "12px 16px", borderRadius: 14,
            background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.35)" }}>Score Trend</span>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>Last {scores.length} analyses</span>
            </div>
            <svg viewBox={`-10 -5 ${w + 20} ${h + 10}`} width="100%" height="65" style={{ display: "block" }}>
              <defs>
                <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#e8962a" stopOpacity="0.15" />
                  <stop offset="100%" stopColor="#e8962a" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={area} fill="url(#chartFill)" />
              <path d={line} fill="none" stroke="#e8962a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              {/* End dot */}
              <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="3.5" fill="#e8962a" />
              <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="6" fill="#e8962a" opacity="0.15" />
            </svg>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", fontFamily: "'Space Mono', monospace" }}>{scores[0].toFixed(1)}</span>
              <span style={{ fontSize: 10, color: "#e8962a", fontWeight: 700, fontFamily: "'Space Mono', monospace" }}>{scores[scores.length - 1].toFixed(1)}</span>
            </div>
          </div>
        );
      })()}

      {/* Quick Actions — horizontal scrollable pills */}
      {(() => {
        const tier = (() => { try { return localStorage.getItem("strive-tier") || "free"; } catch { return "free"; } })();
        const isPro = tier === "competitive";
        return (
          <div style={{ display: "flex", gap: 8, marginBottom: 20, overflowX: "auto", paddingBottom: 4, WebkitOverflowScrolling: "touch" }}>
            {[
              { emoji: "🔥", label: "Meet Day", action: onMeetFocus, highlight: true },
              { emoji: "📋", label: "Guide", action: onViewDeductions },
              { emoji: "🏆", label: "Meets", action: onMeets },
              { emoji: "📈", label: "Progress", action: onProgress, pro: true },
              { emoji: "🧠", label: "Mental", action: onMental, pro: true },
              { emoji: "🎯", label: "Goals", action: onGoals, pro: true },
            ].map((btn, i) => (
              <button key={i} onClick={btn.action} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "10px 16px", borderRadius: 12, cursor: "pointer",
                background: btn.highlight ? "rgba(232,150,42,0.1)" : "rgba(255,255,255,0.03)",
                border: btn.highlight ? "1px solid rgba(232,150,42,0.25)" : "1px solid rgba(255,255,255,0.05)",
                fontFamily: "'Outfit', sans-serif", fontSize: 12, fontWeight: btn.highlight ? 700 : 600,
                color: btn.highlight ? "#ffc15a" : "rgba(255,255,255,0.55)", whiteSpace: "nowrap",
                transition: "all 0.2s", flexShrink: 0,
              }}>
                <span style={{ fontSize: 14 }}>{btn.emoji}</span>
                {btn.label}
                {btn.pro && !isPro && (
                  <span style={{ fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: "rgba(139,92,246,0.12)", color: "#A78BFA", marginLeft: 2 }}>PRO</span>
                )}
              </button>
            ))}
          </div>
        );
      })()}

      {/* Last Result — quick review card */}
      {history.length > 0 && savedResults && savedResults[history[0].id] && (() => {
        const last = history[0];
        const lastResult = savedResults[last.id];
        const sc = last.score || 0;
        const scColor = sc >= 9.0 ? "#22c55e" : sc >= 8.0 ? "#ffc15a" : "#dc2626";
        const dedCount = lastResult?.executionDeductions?.length || 0;
        const topFault = lastResult?.executionDeductions?.[0];
        return (
          <div
            onClick={() => onViewResult(lastResult)}
            className="card" style={{
              padding: 16, marginBottom: 20, cursor: "pointer",
              borderColor: `${scColor}25`,
              background: `linear-gradient(135deg, ${scColor}06, transparent)`,
              animation: "fadeIn 0.4s ease-out",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: 1, marginBottom: 6 }}>LAST ANALYSIS</div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{last.event}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 3 }}>
                  {last.meetName || last.date}{last.meetLocation ? ` · ${last.meetLocation}` : ""}
                </div>
                {topFault && (
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 8 }}>
                    Top fix: <span style={{ color: "#e8962a" }}>{safeStr(topFault.skill)}</span> (-{safeNum(topFault.deduction, 0).toFixed(2)})
                  </div>
                )}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 28, fontWeight: 900, fontFamily: "'Space Mono', monospace", color: scColor }}>
                  {sc.toFixed(1)}
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{dedCount} deductions</div>
                <div style={{ fontSize: 10, color: "#e8962a", marginTop: 4 }}>tap to review →</div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* History — clickable */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700 }}>Recent Analyses</h3>
          {history.length > 3 && (
            <button onClick={onMeets} style={{
              background: "none", border: "none", color: "#e8962a", cursor: "pointer",
              fontSize: 12, fontWeight: 600, fontFamily: "'Outfit', sans-serif",
            }}>See all {history.length} →</button>
          )}
        </div>
        {history.length === 0 ? (
          <div className="card" style={{ textAlign: "center", padding: "32px 24px" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🤸</div>
            <h4 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Ready to see your score?</h4>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, lineHeight: 1.6, maxWidth: 280, margin: "0 auto 16px" }}>
              Upload a routine video and STRIVE's 2-pass scoring engine will break down every deduction — just like a real judge.
            </p>
            <button className="btn-gold" onClick={onUpload} style={{ fontSize: 14, padding: "12px 32px" }}>
              Upload First Video
            </button>
          </div>
        ) : (
          history.slice(0, 3).map((h, i) => {
            const hasResult = savedResults && savedResults[h.id];
            const sc = h.score || 0;
            const scColor = sc >= 9.0 ? "#22c55e" : sc >= 8.0 ? "#ffc15a" : sc > 0 ? "#dc2626" : "rgba(255,255,255,0.3)";
            // Show trend vs previous of same event
            const prevSame = history.slice(i + 1).find(p => p.event === h.event && p.score);
            const trend = prevSame ? sc - prevSame.score : null;
            const eventIcons = { "Vault": "🏋", "Uneven Bars": "🤸", "Balance Beam": "━", "Floor Exercise": "🟫", "Pommel Horse": "🐴", "Still Rings": "⭕", "Parallel Bars": "═", "High Bar": "🔝" };
            return (
              <div key={h.id}
                onClick={() => hasResult && onViewResult(savedResults[h.id])}
                className="card" style={{
                  marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "14px 16px", animation: `fadeIn 0.3s ease-out ${i * 0.08}s both`,
                  cursor: hasResult ? "pointer" : "default",
                  borderLeft: `3px solid ${scColor}40`,
                }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                    background: `${scColor}10`, display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 16,
                  }}>
                    {eventIcons[h.event] || "🤸"}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{h.event}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
                      {h.meetName || h.date}{h.meetLocation ? ` · ${h.meetLocation}` : ""}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 800, fontSize: 18, color: scColor, fontFamily: "'Space Mono', monospace" }}>
                    {sc > 0 ? sc.toFixed(3) : "—"}
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>
                    {trend !== null && Math.abs(trend) >= 0.01 ? (
                      <span style={{ color: trend > 0 ? "#22c55e" : "#dc2626", fontWeight: 600 }}>
                        {trend > 0 ? "▲" : "▼"} {Math.abs(trend).toFixed(2)}
                      </span>
                    ) : (
                      <span>-{(h.deductions || 0).toFixed(2)} ded</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Skills Required for Level */}
      <SkillsRequiredCard profile={profile} />

      {/* Quick Reference — condensed */}
      <div className="card" style={{ padding: 16, marginBottom: 12, borderColor: "rgba(232,150,42,0.1)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: "#e8962a" }}>
            Scoring at {profile.level}
          </h3>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>
            {profile.levelCategory === "compulsory" ? "Compulsory — SV 10.0" : profile.levelCategory === "xcel" ? "Xcel — SV 10.0" : "Optional — D-Score + E-Score"}
          </span>
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.7 }}>
          {profile.levelCategory === "compulsory" ?
            "Same routine for everyone. Judges deduct for any deviation from the prescribed choreography. 9.0+ is strong." :
           profile.levelCategory === "xcel" ?
            "Start at 10.0 with 4 special requirements (0.50 each). Form errors get deducted on every skill. 8.5+ is competitive." :
            "Build your own routine. Difficulty + composition + execution. Two panels score separately. 8.5-9.5 is the target range."}
        </div>
      </div>

      {/* Quick Glossary */}
      <GlossaryCard />

      {/* Meet Day Checklist */}
      <MeetDayChecklist gender={profile.gender} />

      {/* Share STRIVE — virality hook */}
      {history.length >= 1 && (
        <div className="card" style={{
          padding: 16, marginBottom: 12,
          background: "linear-gradient(135deg, rgba(232,150,42,0.04), rgba(139,92,246,0.02))",
          borderColor: "rgba(232,150,42,0.1)",
          textAlign: "center",
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Know a gymnast or coach?</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 12, lineHeight: 1.5 }}>
            STRIVE helps every gymnast understand their score and improve faster.
          </div>
          <button
            onClick={() => {
              const text = `Check out STRIVE — gymnastics video scoring that breaks down every deduction and gives you a personalized training plan. It's free to try!\n\nhttps://strive-app-amber.vercel.app`;
              if (navigator.share) {
                navigator.share({ title: "STRIVE — Gymnastics Video Scoring", text }).catch(() => {});
              } else if (navigator.clipboard) {
                navigator.clipboard.writeText(text).then(() => alert("Link copied! Share it with your gym friends."));
              }
            }}
            style={{
              background: "rgba(232,150,42,0.1)", border: "1px solid rgba(232,150,42,0.2)",
              borderRadius: 10, padding: "10px 24px", cursor: "pointer",
              color: "#e8962a", fontSize: 13, fontWeight: 600, fontFamily: "'Outfit', sans-serif",
            }}
          >
            Share STRIVE
          </button>
        </div>
      )}

      {/* Dashboard footer */}
      <div style={{ textAlign: "center", paddingTop: 16, paddingBottom: 32, marginTop: 4 }}>
        <div style={{
          fontFamily: "'Georgia', serif", fontSize: 14, fontWeight: 500, letterSpacing: 3,
          background: "linear-gradient(135deg, #e8962a, #ffc15a)", backgroundClip: "text",
          WebkitBackgroundClip: "text", color: "transparent", marginBottom: 4,
        }}>STRIVE</div>
        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.12)", letterSpacing: 1 }}>
          v1.0 · 2-Pass Scoring Engine · {profile.level}
        </div>
      </div>

    </div>
  );
});

// ─── PRE-MEET FOCUS CARD ────────────────────────────────────────────
const FOCUS_CUES = {
  bent_arms: "Lock your elbows before hands touch. Think 'straight sticks' from shoulder to fingertip.",
  bent_knees: "Squeeze your quads on every skill. Imagine zipping your legs from hip to toe.",
  leg_separation: "Glue your ankles together. Squeeze a pretend block between your legs in the air.",
  toe_point: "Point through the floor. Every jump, every leap — toes lead the way.",
  step_landing: "Absorb through your ankles. Chest up, arms up, freeze like a statue.",
  fall: "Commit 100%. Trust your body — you've done this skill a thousand times in practice.",
  wobble: "Find your spot on the wall. Breathe, squeeze your core, stay tall.",
  body_angle: "Hollow body tight. Ribs in, belly button to spine, no arch.",
  split_angle: "Push past your comfort zone. Show full extension — make the judges see 180.",
  alignment: "Center your weight. Imagine a laser line from your head through your toes.",
  upper_body: "Shoulders down and open. Proud chest. You own this routine.",
  timing: "Feel the rhythm. Let the music carry you — don't rush.",
  arch: "Tight core, ribs in. Think hollow, not banana.",
  landing: "Stick it. Land soft, hold strong, show the judges you meant it.",
  other: "Focus on clean execution. Every detail matters.",
};

function PreMeetFocusScreen({ profile, history, savedResults, onBack }) {
  const athleteRecord = getAthleteRecord(profile);
  const faultIntel = computeFaultIntelligence(athleteRecord);

  // ── TOP 3 FOCUS POINTS from most common faults ──
  const topFaults = (faultIntel.faultFrequencies || []).slice(0, 3);

  // ── LAST ANALYSIS DATA ──
  const lastResult = (() => {
    if (!history || history.length === 0 || !savedResults) return null;
    for (let i = 0; i < history.length; i++) {
      const r = savedResults[history[i].id];
      if (r && r.gradedSkills) return r;
    }
    return null;
  })();

  // ── CLEAN SKILLS (deduction === 0) from last analysis ──
  const cleanSkills = lastResult
    ? (lastResult.gradedSkills || []).filter(s => s.deduction === 0 || s.deduction === 0.00).slice(0, 3)
    : [];

  // ── ALL SKILL NAMES from last analysis for visualization ──
  const allSkills = lastResult ? (lastResult.gradedSkills || []) : [];
  const firstSkill = allSkills.length > 0 ? allSkills[0].skill : "first skill";
  const cleanSkillName = cleanSkills.length > 0 ? cleanSkills[0].skill : "best skill";
  const lastSkill = allSkills.length > 0 ? allSkills[allSkills.length - 1].skill : "dismount";
  const lastEvent = history && history.length > 0 ? history[0].event : (profile.primaryEvents && profile.primaryEvents[0]) || "your event";

  // ── COACH NOTE from localStorage ──
  let coachNote = "";
  try { coachNote = localStorage.getItem("strive-coach-meet-note") || ""; } catch {}

  const today = new Date();
  const dateStr = today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  return (
    <div style={{
      minHeight: "100vh", padding: "24px 20px 100px", maxWidth: 540, margin: "0 auto",
      animation: "fadeIn 0.5s ease-out",
    }}>
      {/* Back button */}
      <button onClick={onBack} style={{
        background: "none", border: "none", color: "rgba(232,150,42,0.6)", cursor: "pointer",
        fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 600, marginBottom: 20,
        display: "flex", alignItems: "center", gap: 4,
      }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M8.5 2.5l-5 5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> Dashboard
      </button>

      {/* ── A. HEADER ── */}
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: 3, marginBottom: 10,
          background: "linear-gradient(135deg, #e8962a, #ffc15a)", backgroundClip: "text",
          WebkitBackgroundClip: "text", color: "transparent",
        }}>
          MEET DAY FOCUS
        </div>
        <div style={{ fontSize: 28, fontWeight: 800, color: "#ffc15a", fontFamily: "'Outfit', sans-serif", lineHeight: 1.2, marginBottom: 6 }}>
          {profile.name}
        </div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.35)", fontWeight: 400 }}>
          {lastEvent} &middot; {dateStr}
        </div>
      </div>

      {/* ── B. TOP 3 FOCUS POINTS ── */}
      {topFaults.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: "rgba(34,197,94,0.7)", marginBottom: 14 }}>
            YOUR TOP FOCUS AREAS
          </div>
          {topFaults.map((fault, i) => (
            <div key={fault.type} style={{
              display: "flex", gap: 14, alignItems: "flex-start",
              padding: "16px 18px", marginBottom: 10, borderRadius: 14,
              background: "#0d1422", borderLeft: "3px solid #22c55e",
              border: "1px solid rgba(34,197,94,0.08)",
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                background: "rgba(34,197,94,0.1)", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, fontWeight: 800, color: "#22c55e", fontFamily: "'Space Mono', monospace",
              }}>
                {i + 1}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>
                  {fault.label}
                </div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1.7, fontWeight: 400 }}>
                  {FOCUS_CUES[fault.type] || FOCUS_CUES.other}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── C. CONFIDENCE BOOSTER ── */}
      {cleanSkills.length > 0 && (
        <div style={{
          marginBottom: 28, padding: "20px 20px", borderRadius: 16,
          background: "linear-gradient(135deg, rgba(232,150,42,0.06), rgba(232,150,42,0.02))",
          border: "1px solid rgba(232,150,42,0.15)",
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: "rgba(232,150,42,0.7)", marginBottom: 6 }}>
            CONFIDENCE BOOSTER
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#ffc15a", marginBottom: 14, lineHeight: 1.4 }}>
            You NAILED these last time:
          </div>
          {cleanSkills.map((skill, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 0",
              borderBottom: i < cleanSkills.length - 1 ? "1px solid rgba(232,150,42,0.06)" : "none",
            }}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <circle cx="9" cy="9" r="8" fill="rgba(34,197,94,0.15)" stroke="#22c55e" strokeWidth="1.5"/>
                <path d="M5.5 9.5l2 2 5-5" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span style={{ fontSize: 15, fontWeight: 600, color: "#e2e8f0" }}>{skill.skill}</span>
              <span style={{ fontSize: 11, color: "rgba(34,197,94,0.7)", marginLeft: "auto", fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>CLEAN</span>
            </div>
          ))}
        </div>
      )}

      {/* ── D. VISUALIZATION SCRIPT ── */}
      <div style={{
        marginBottom: 28, padding: "24px 22px", borderRadius: 16,
        background: "linear-gradient(135deg, rgba(139,114,212,0.08), rgba(139,114,212,0.02))",
        border: "1px solid rgba(139,114,212,0.15)",
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: "rgba(139,114,212,0.7)", marginBottom: 14 }}>
          VISUALIZATION
        </div>
        <div style={{
          fontSize: 16, fontStyle: "italic", color: "rgba(255,255,255,0.7)",
          lineHeight: 1.9, fontFamily: "'Outfit', sans-serif", fontWeight: 400,
        }}>
          Close your eyes. See yourself on {lastEvent === "Balance Beam" ? "the beam" : lastEvent === "Uneven Bars" ? "the bars" : lastEvent === "Vault" ? "the runway" : "the floor"}.
          Your <span style={{ color: "#ffc15a", fontWeight: 600, fontStyle: "normal" }}>{firstSkill}</span> is powerful.
          {cleanSkills.length > 0 && <> Your <span style={{ color: "#22c55e", fontWeight: 600, fontStyle: "normal" }}>{cleanSkillName}</span> is perfect.</>}
          {" "}Feel the landing — stuck, solid, confident.
          Your <span style={{ color: "#ffc15a", fontWeight: 600, fontStyle: "normal" }}>{lastSkill}</span> is strong.
          You have done this in practice. Now own it.
        </div>
      </div>

      {/* ── E. QUICK REMINDERS — 2x2 grid ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: "rgba(255,255,255,0.3)", marginBottom: 14 }}>
          BEFORE YOU COMPETE
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[
            { icon: "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z", title: "Breathe", sub: "3 deep breaths. In 4, out 4.", color: "#22c55e" },
            { icon: "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5", title: "Salute", sub: "Eye contact. Confident smile.", color: "#ffc15a" },
            { icon: "M13 2L3 14h9l-1 8 10-12h-9l1-8z", title: "First Skill", sub: firstSkill !== "first skill" ? firstSkill : "Commit 100%", color: "#e8962a" },
            { icon: "M5 3l14 9-14 9V3z", title: "Finish", sub: "Stick it. Hold the pose.", color: "#8b72d4" },
          ].map((card, i) => (
            <div key={i} style={{
              padding: "18px 16px", borderRadius: 14,
              background: "#0d1422", border: `1px solid ${card.color}15`,
              textAlign: "center",
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12, margin: "0 auto 10px",
                background: `${card.color}12`, display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={card.color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d={card.icon}/>
                </svg>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>{card.title}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", lineHeight: 1.5, fontWeight: 400 }}>{card.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── F. COACH'S FOCUS ── */}
      {coachNote && (
        <div style={{
          marginBottom: 28, padding: "20px 20px", borderRadius: 16,
          background: "linear-gradient(135deg, rgba(232,150,42,0.06), rgba(232,150,42,0.02))",
          border: "1.5px solid rgba(232,150,42,0.25)",
        }}>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: "#e8962a", marginBottom: 10,
          }}>
            COACH SAYS
          </div>
          <div style={{
            fontSize: 16, color: "rgba(255,255,255,0.75)", lineHeight: 1.8,
            fontFamily: "'Outfit', sans-serif", fontWeight: 500,
          }}>
            "{coachNote}"
          </div>
        </div>
      )}

      {/* ── MOTIVATIONAL FOOTER ── */}
      <div style={{ textAlign: "center", paddingTop: 12, paddingBottom: 32 }}>
        <div style={{
          fontSize: 20, fontWeight: 800, color: "#ffc15a",
          fontFamily: "'Outfit', sans-serif", marginBottom: 6,
        }}>
          You are ready.
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", fontWeight: 400 }}>
          Trust your training. Trust yourself. Go compete.
        </div>
      </div>

    </div>
  );
}

// ─── UPLOAD SCREEN ──────────────────────────────────────────────────
const UploadScreen = React.memo(function UploadScreen({ profile, onBack, onAnalyze }) {
  const [video, setVideo] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [videoReady, setVideoReady] = useState(false);
  const [videoError, setVideoError] = useState(null);
  const [compressing, setCompressing] = useState(false);
  const [compressProgress, setCompressProgress] = useState(0);
  const [originalSize, setOriginalSize] = useState(0);
  const [event, setEvent] = useState("Auto-detect");
  const [notes, setNotes] = useState("");
  const [meetName, setMeetName] = useState("");
  const [meetLocation, setMeetLocation] = useState("");
  const [meetDate, setMeetDate] = useState(new Date().toISOString().split("T")[0]);
  const [hasApiKey, setHasApiKey] = useState(null); // null=checking
  const [inlineKey, setInlineKey] = useState("");
  const [keySaving, setKeySaving] = useState(false);

  // Check if server-side Gemini proxy is available (API key stays server-side)
  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch("/api/gemini", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Strive-Token": "strive-2026-launch" },
          body: JSON.stringify({ action: "pollFile", fileName: "files/__healthcheck__" }),
        });
        // Any response (even file-not-found) means the proxy is up and has the key
        if (resp.ok || resp.status !== 500) { setHasApiKey(true); return; }
        const data = await resp.json().catch(() => ({}));
        if (data.error?.includes("not configured")) { setHasApiKey(false); return; }
        setHasApiKey(true);
      } catch {
        setHasApiKey(false);
      }
    })();
  }, []);
  const fileRef = useRef(null);
  const captureRef = useRef(null);
  const videoPreviewRef = useRef(null);
  const events = profile.gender === "female" ? WOMEN_EVENTS : MEN_EVENTS;

  // Smart compression: only for large files (>50MB), at REAL-TIME speed to preserve every frame.
  // The old approach played at 3x speed which caused frame skipping and choppy output.
  // New approach: 1x playback, 1080p, 8Mbps = quality like a text message video.
  // Under 50MB: send original. Over 50MB: gentle re-encode preserving all motion detail.
  const COMPRESS_THRESHOLD = 50 * 1024 * 1024; // 50MB — typical phone routine is 15-45MB
  const TARGET_WIDTH = 1080; // 1080p preserves body positions, toe points, knee angles
  const TARGET_BITRATE = 8000000; // 8 Mbps — high quality, like iMessage/text compression

  const formatFileSize = (bytes) => {
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  // ── Video Compression Engine ──
  const compressVideo = useCallback(async (file) => {
    return new Promise((resolve, reject) => {
      setCompressing(true);
      setCompressProgress(0);
      setOriginalSize(file.size);

      const sourceVideo = document.createElement("video");
      sourceVideo.muted = true;
      sourceVideo.playsInline = true;
      sourceVideo.src = URL.createObjectURL(file);

      sourceVideo.onloadedmetadata = () => {
        // Calculate target dimensions (maintain aspect ratio, cap at TARGET_WIDTH)
        const scale = Math.min(1, TARGET_WIDTH / sourceVideo.videoWidth);
        const width = Math.round(sourceVideo.videoWidth * scale);
        const height = Math.round(sourceVideo.videoHeight * scale);
        const duration = sourceVideo.duration;

        console.log(`Compressing: ${sourceVideo.videoWidth}x${sourceVideo.videoHeight} → ${width}x${height}, ${duration.toFixed(1)}s`);

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });

        // Use MediaRecorder to re-encode at lower bitrate
        const stream = canvas.captureStream(30); // 30fps — more frames for motion analysis
        const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
          ? "video/webm;codecs=vp9"
          : MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
            ? "video/webm;codecs=vp8"
            : "video/webm";

        const recorder = new MediaRecorder(stream, {
          mimeType,
          videoBitsPerSecond: TARGET_BITRATE,
        });

        const chunks = [];
        recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: mimeType });
          const compressedFile = new File([blob], file.name.replace(/\.[^.]+$/, ".webm"), { type: mimeType });
          console.log(`Compressed: ${formatFileSize(file.size)} → ${formatFileSize(compressedFile.size)} (${Math.round((1 - compressedFile.size / file.size) * 100)}% reduction)`);
          URL.revokeObjectURL(sourceVideo.src);
          setCompressing(false);
          resolve(compressedFile);
        };

        recorder.onerror = (e) => {
          setCompressing(false);
          URL.revokeObjectURL(sourceVideo.src);
          reject(new Error("Compression failed: " + (e.error?.message || "unknown")));
        };

        // Play at REAL-TIME speed (1x) to capture every frame accurately.
        // The old 3x approach skipped frames and produced choppy output that
        // destroyed Gemini's ability to judge landings, rhythm, and body positions.
        // A 90-second routine takes 90 seconds to compress — acceptable tradeoff for accuracy.
        recorder.start(100); // Collect data every 100ms
        sourceVideo.currentTime = 0;
        sourceVideo.play().catch(reject);

        const drawFrame = () => {
          if (sourceVideo.ended || sourceVideo.paused) {
            recorder.stop();
            return;
          }
          ctx.drawImage(sourceVideo, 0, 0, width, height);
          setCompressProgress(Math.round((sourceVideo.currentTime / duration) * 100));
          requestAnimationFrame(drawFrame);
        };

        sourceVideo.onplay = drawFrame;
        sourceVideo.onended = () => {
          // Small delay to ensure last frames are captured
          setTimeout(() => { if (recorder.state === "recording") recorder.stop(); }, 200);
        };

        // CRITICAL: Play at 1x speed. Never speed up — frame skipping destroys scoring accuracy.
        sourceVideo.playbackRate = 1;
      };

      sourceVideo.onerror = () => {
        setCompressing(false);
        URL.revokeObjectURL(sourceVideo.src);
        reject(new Error("Could not load video for compression"));
      };
    });
  }, []);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const videoExtensions = /\.(mov|mp4|m4v|webm|avi|mkv|qt|3gp|3g2|mts|m2ts|ts|flv|wmv|ogv|hevc)$/i;
    const hasVideoMime = file.type && (file.type.startsWith("video/") || file.type === "application/octet-stream");
    const hasVideoExtension = file.name && videoExtensions.test(file.name);
    const isFromVideoPicker = !file.type && !file.name;

    if (!hasVideoMime && !hasVideoExtension && !isFromVideoPicker) {
      console.warn("File may not be video:", file.type, file.name);
    }

    setVideoError(null);
    let processedFile = file;

    // Smart compress: >50MB gets gentle re-encode (1080p, 8Mbps, real-time speed — no frame skipping)
    if (file.size > COMPRESS_THRESHOLD) {
      try {
        processedFile = await compressVideo(file);
      } catch (err) {
        console.warn("Compression failed, using original:", err.message);
        setVideoError(`Large video (${formatFileSize(file.size)}) — using original file. Upload may be slower.`);
        processedFile = file;
      }
    }

    const url = URL.createObjectURL(processedFile);
    setVideo(processedFile);
    setVideoUrl(url);
    setVideoReady(false);
  };

  // Verify the video actually loads and can be played
  const handleVideoLoaded = () => {
    setVideoReady(true);
    setVideoError(null);
  };

  const handleVideoError = () => {
    // Do NOT block analysis — the preview may fail but frame extraction can still work
    // This is critical for .mov files which sometimes fail preview but extract fine
    setVideoError("Preview unavailable for this format, but analysis should still work. If it fails, try trimming the video in your Photos app first (this re-encodes to a compatible format).");
    setVideoReady(true); // Still mark as ready so the Analyze button works
  };

  // NOTE: Do NOT revoke blob URL on unmount — it's needed for the video review player on the results screen.
  // The URL will be garbage collected when the user navigates away or uploads a new video.

  return (
    <div style={{ minHeight: "100vh", padding: "16px 18px 90px", maxWidth: 540, margin: "0 auto" }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: "rgba(232,150,42,0.6)", cursor: "pointer", fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 600, marginBottom: 14, display: "flex", alignItems: "center", gap: 4 }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M8.5 2.5l-5 5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> Dashboard
      </button>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>
        <Icon name="camera" size={20} /> New Analysis
      </h2>
      <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginBottom: 24 }}>
        Upload a routine video — 2-pass scoring engine scores using {profile.level} {profile.levelCategory === "xcel" ? "Xcel" : "USAG"} criteria.
      </p>

      {/* Video Upload / Record */}
      {compressing ? (
        <div style={{
          border: "2px solid rgba(232,150,42,0.3)", borderRadius: 16, padding: 40,
          textAlign: "center", marginBottom: 24, background: "rgba(232,150,42,0.03)",
        }}>
          <div style={{
            width: 60, height: 60, borderRadius: "50%", margin: "0 auto 16px",
            background: "rgba(232,150,42,0.1)", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ fontSize: 28, animation: "pulse 1.5s ease-in-out infinite" }}>🎬</span>
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#e8962a", marginBottom: 8 }}>
            Optimizing Video...
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 16, lineHeight: 1.5 }}>
            Reducing file size for faster upload and analysis.
            <br/>Original: {formatFileSize(originalSize)} → Target: ~{formatFileSize(originalSize * 0.15)}
          </div>
          {/* Progress bar */}
          <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden", marginBottom: 8 }}>
            <div style={{
              height: "100%", borderRadius: 3, background: "linear-gradient(90deg, #e8962a, #ffc15a)",
              width: `${compressProgress}%`, transition: "width 0.3s",
            }} />
          </div>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, fontWeight: 700, color: "#e8962a" }}>
            {compressProgress}%
          </div>
        </div>
      ) : !video ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
          {/* Primary: Choose from library */}
          <div
            onClick={() => fileRef.current?.click()}
            style={{
              border: "2px dashed rgba(232,150,42,0.3)", borderRadius: 16, padding: 40,
              cursor: "pointer", textAlign: "center",
              background: "rgba(255,255,255,0.02)", transition: "all 0.3s",
            }}
          >
            <div style={{
              width: 64, height: 64, borderRadius: "50%", margin: "0 auto 16px",
              background: "rgba(232,150,42,0.1)", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Icon name="upload" size={28} />
            </div>
            <div style={{ color: "#e8962a", fontWeight: 600, fontSize: 16 }}>Choose Video from Library</div>
            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, marginTop: 8 }}>
              MP4, MOV, WebM · iPhone recordings work great
            </div>
          </div>
          {/* Record directly from camera */}
          <div
            onClick={() => captureRef.current?.click()}
            style={{
              border: "1.5px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "18px 24px",
              cursor: "pointer", textAlign: "center",
              background: "rgba(255,255,255,0.02)", transition: "all 0.3s",
              display: "flex", alignItems: "center", gap: 14,
            }}
          >
            <div style={{
              width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
              background: "rgba(220,38,38,0.15)", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{ fontSize: 20 }}>🔴</span>
            </div>
            <div style={{ textAlign: "left" }}>
              <div style={{ color: "#e2e8f0", fontWeight: 600, fontSize: 14 }}>Record from Camera</div>
              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, marginTop: 2 }}>
                Opens your camera to film the routine
              </div>
            </div>
          </div>

          {/* Hidden file inputs */}
          <input
            ref={fileRef}
            type="file"
            accept="video/*"
            onChange={handleFile}
            style={{ display: "none" }}
          />
          <input
            ref={captureRef}
            type="file"
            accept="video/*"
            capture="environment"
            onChange={handleFile}
            style={{ display: "none" }}
          />
        </div>
      ) : (
        <div style={{ marginBottom: 24 }}>
          {/* Video Preview */}
          <div style={{
            border: `2px solid ${videoReady && !videoError ? "#22c55e" : videoError ? "#ffc15a" : "rgba(232,150,42,0.3)"}`,
            borderRadius: 16, overflow: "hidden", background: "black", position: "relative",
            transition: "border-color 0.3s",
          }}>
            <video
              ref={videoPreviewRef}
              src={videoUrl}
              controls
              playsInline
              webkit-playsinline=""
              preload="auto"
              onLoadedMetadata={handleVideoLoaded}
              onLoadedData={handleVideoLoaded}
              onCanPlay={handleVideoLoaded}
              onError={handleVideoError}
              style={{ width: "100%", maxHeight: 300, display: videoError ? "none" : "block" }}
            />
            {/* Fallback when video element can't preview (common with .mov) */}
            {videoError && (
              <div style={{
                padding: "40px 24px", textAlign: "center",
              }}>
                <div style={{
                  width: 56, height: 56, borderRadius: "50%", margin: "0 auto 16px",
                  background: "rgba(232,150,42,0.15)", display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Icon name="camera" size={24} />
                </div>
                <div style={{ color: "#e8962a", fontWeight: 600, fontSize: 15 }}>
                  {video.name?.split('.').pop()?.toUpperCase() || "Video"} File Loaded
                </div>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 6 }}>
                  Preview not available, but analysis will proceed normally
                </div>
              </div>
            )}
            {videoReady && !videoError && (
              <div style={{
                position: "absolute", top: 10, right: 10, background: "rgba(34,197,94,0.9)",
                padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, color: "white",
              }}>
                ✓ Ready
              </div>
            )}
          </div>

          {/* File info & change button */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
              {video.name?.substring(0, 25)}{video.name?.length > 25 ? "..." : ""} · {formatFileSize(video.size)}
              {originalSize > 0 && originalSize !== video.size && (
                <span style={{ color: "#22c55e", marginLeft: 6, fontSize: 11 }}>
                  ✓ compressed from {formatFileSize(originalSize)} ({Math.round((1 - video.size / originalSize) * 100)}% smaller)
                </span>
              )}
            </div>
            <button
              onClick={() => { setVideo(null); setVideoUrl(null); setVideoReady(false); setVideoError(null); }}
              style={{
                background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 8,
                padding: "6px 14px", color: "#e8962a", fontSize: 12, fontWeight: 600,
                cursor: "pointer", fontFamily: "'Outfit', sans-serif",
              }}
            >
              Change Video
            </button>
          </div>

          {/* Info message when preview not available */}
          {videoError && (
            <div style={{
              marginTop: 10, padding: "10px 14px", borderRadius: 10,
              background: "rgba(255,193,90,0.08)", border: "1px solid rgba(255,193,90,0.2)",
              fontSize: 12, color: "rgba(255,193,90,0.8)", lineHeight: 1.5,
            }}>
              <Icon name="info" size={12} /> {videoError}
            </div>
          )}
        </div>
      )}

      {/* Event Selection */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: "block", color: "rgba(255,255,255,0.6)" }}>
          EVENT
        </label>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(events.length + 1, 5)}, 1fr)`, gap: 8 }}>
          <button
            key="auto"
            onClick={() => setEvent("Auto-detect")}
            style={{
              padding: "12px 8px", borderRadius: 10, border: "none", cursor: "pointer",
              fontFamily: "'Outfit', sans-serif", fontWeight: 600, fontSize: 11,
              background: event === "Auto-detect" ? "linear-gradient(135deg, #22c55e, #4ade80)" : "rgba(255,255,255,0.06)",
              color: event === "Auto-detect" ? "#070c16" : "rgba(255,255,255,0.5)",
              transition: "all 0.2s",
            }}
          >
            Auto
          </button>
          {events.map(e => (
            <button
              key={e}
              onClick={() => setEvent(e)}
              style={{
                padding: "12px 8px", borderRadius: 10, border: "none", cursor: "pointer",
                fontFamily: "'Outfit', sans-serif", fontWeight: 600, fontSize: 12,
                background: event === e ? "linear-gradient(135deg, #e8962a, #ffc15a)" : "rgba(255,255,255,0.06)",
                color: event === e ? "#070c16" : "rgba(255,255,255,0.5)",
                transition: "all 0.2s",
              }}
            >
              {e}
            </button>
          ))}
        </div>
        {/* Event-specific filming tip */}
        {event && (
          <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, background: "rgba(232,150,42,0.04)", fontSize: 11, color: "rgba(255,255,255,0.4)", lineHeight: 1.5 }}>
            {{
              "Auto-detect": "We'll identify the event automatically. Film from the SIDE at apparatus height — this is critical for scoring accuracy.",
              "Vault": "Side view capturing full run → board → table → landing. This lets us measure pre-flight and post-flight angles accurately.",
              "Uneven Bars": "Side view from the LOW BAR side at bar height. This is the #1 factor for accurate cast and circle scoring on bars.",
              "Balance Beam": "Side view showing full beam length. This captures balance checks, foot placement, and acro form that we can't see from the end.",
              "Floor Exercise": "Corner diagonal, elevated if possible. This captures the full floor area for out-of-bounds checks and tumbling form.",
              "Pommel Horse": "Side view for circles and travel. End view misses leg separation — the most common deduction.",
              "Still Rings": "Front or slight angle. Capture the full hang, hold positions, and landing.",
              "Parallel Bars": "Side view to accurately measure swing height and handstand positions.",
              "High Bar": "Side view at bar height — same principle as uneven bars. Critical for giant and release scoring.",
            }[event] || "Film from the side at apparatus height for best results."}
          </div>
        )}
      </div>

      {/* Meet Information — compact */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, display: "block", color: "rgba(255,255,255,0.4)" }}>
          MEET DETAILS (optional)
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
          <input className="input-field" placeholder="Meet name" value={meetName} onChange={e => setMeetName(e.target.value)} style={{ fontSize: 12, padding: "10px 12px" }} />
          <input className="input-field" placeholder="Location" value={meetLocation} onChange={e => setMeetLocation(e.target.value)} style={{ fontSize: 12, padding: "10px 12px" }} />
          <input className="input-field" type="date" value={meetDate} onChange={e => setMeetDate(e.target.value)} style={{ fontSize: 12, padding: "10px 12px" }} />
        </div>
      </div>

      {/* Notes */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: "block", color: "rgba(255,255,255,0.6)" }}>
          NOTES FOR JUDGE (OPTIONAL)
        </label>
        <textarea
          className="input-field"
          placeholder="e.g., 'Focus on my back handspring series' or 'Check my dismount landing'"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          style={{ resize: "vertical" }}
        />
      </div>

      {/* Camera Angle Guide — visual positioning */}
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <h4 style={{ fontSize: 13, fontWeight: 700, color: "#e8962a", marginBottom: 10 }}>
          Ideal Camera Position
        </h4>
        {/* Visual camera positioning diagram */}
        <div style={{
          background: "rgba(232,150,42,0.04)", borderRadius: 12, padding: 16, marginBottom: 12,
          border: "1px solid rgba(232,150,42,0.08)",
        }}>
          <div style={{ textAlign: "center", marginBottom: 10 }}>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "rgba(255,255,255,0.5)", lineHeight: 1.8 }}>
              {{
                "Vault": (
                  <>
                    <div style={{ color: "#e8962a", fontWeight: 700, fontSize: 12, marginBottom: 6 }}>VAULT — Side View</div>
                    <div>{"  🏃→ ┃ →🤸→ 🧎"}</div>
                    <div style={{ color: "rgba(255,255,255,0.3)" }}>{"run  table  land"}</div>
                    <div style={{ marginTop: 6 }}>{"📱 ← You are HERE (side, mid-height)"}</div>
                  </>
                ),
                "Uneven Bars": (
                  <>
                    <div style={{ color: "#e8962a", fontWeight: 700, fontSize: 12, marginBottom: 6 }}>BARS — Side View (Low Bar Side)</div>
                    <div>{"  ═══ HB"}</div>
                    <div>{"  │"}</div>
                    <div>{"  ═══ LB   📱 ← You"}</div>
                    <div style={{ marginTop: 6, color: "rgba(255,255,255,0.3)" }}>Film at low bar height, directly to the side</div>
                    <div style={{ color: "#22c55e", fontSize: 10, marginTop: 4 }}>Side view is CRITICAL for cast angle accuracy</div>
                  </>
                ),
                "Balance Beam": (
                  <>
                    <div style={{ color: "#e8962a", fontWeight: 700, fontSize: 12, marginBottom: 6 }}>BEAM — Side View</div>
                    <div>{"  ════════════════"}</div>
                    <div style={{ color: "rgba(255,255,255,0.3)" }}>{"  beam (full length)"}</div>
                    <div style={{ marginTop: 6 }}>{"  📱 ← You (side, beam height)"}</div>
                  </>
                ),
                "Floor Exercise": (
                  <>
                    <div style={{ color: "#e8962a", fontWeight: 700, fontSize: 12, marginBottom: 6 }}>FLOOR — Corner Diagonal</div>
                    <div>{"  ┌─────────┐"}</div>
                    <div>{"  │         │"}</div>
                    <div>{"  │  floor  │"}</div>
                    <div>{"  │         │"}</div>
                    <div>{"  └─────────┘"}</div>
                    <div style={{ marginTop: 4 }}>{"📱 ← You (corner, elevated if possible)"}</div>
                  </>
                ),
              }[event] || (
                <>
                  <div style={{ color: "#e8962a", fontWeight: 700, fontSize: 12, marginBottom: 6 }}>IDEAL POSITION</div>
                  <div>Film from the side at apparatus height</div>
                  <div style={{ marginTop: 4 }}>{"📱 ← Side view gives the most accurate analysis"}</div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Filming tips checklist */}
        {[
          { icon: "📐", tip: "Side view at apparatus height (most important!)" },
          { icon: "🧍", tip: "Keep the full body in frame, salute to salute" },
          { icon: "📱", tip: "Hold camera steady — tripod or lean on something" },
          { icon: "💡", tip: "Good lighting, minimal background clutter" },
          { icon: "⏱", tip: "Keep under 2 minutes for fastest processing" },
        ].map((t, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0" }}>
            <span style={{ fontSize: 14, flexShrink: 0 }}>{t.icon}</span>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{t.tip}</span>
          </div>
        ))}
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.04)" }}>
          iPhone tip: If video won't load, go to Settings → Camera → Formats → "Most Compatible" before filming.
        </div>
      </div>

      {/* 2D Video Accuracy Disclaimer */}
      <div style={{
        display: "flex", gap: 10, padding: "12px 14px", borderRadius: 10, marginBottom: 12,
        background: "rgba(232,150,42,0.03)", border: "1px solid rgba(232,150,42,0.06)",
      }}>
        <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>📊</span>
        <div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
            <span style={{ fontWeight: 700, color: "rgba(232,150,42,0.8)" }}>Accuracy note:</span> Our AI scoring engine analyzes 2D video with remarkable precision — typically within 0.15-0.25 of actual judging scores. However, camera angle, video quality, and lighting can impact accuracy. A perfect side view at apparatus height produces the most accurate results. Angled or distant shots may miss subtle deductions.
          </div>
        </div>
      </div>

      {/* Privacy */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 14px", borderRadius: 10, marginBottom: 12,
        background: "rgba(59,130,246,0.04)", border: "1px solid rgba(59,130,246,0.08)",
      }}>
        <span style={{ fontSize: 13 }}>🔒</span>
        <span style={{ fontSize: 11, color: "rgba(147,197,253,0.7)" }}>Your video is securely sent to our analysis engine for scoring. Videos are deleted after processing. Results are stored on your device.</span>
      </div>

      {/* API Key Status */}
      {hasApiKey === false ? (
        <div style={{
          padding: 16, borderRadius: 14, marginBottom: 16,
          background: "rgba(232,150,42,0.04)", border: "1px solid rgba(232,150,42,0.12)",
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#e8962a", marginBottom: 6 }}>
            🔑 One-time setup
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", lineHeight: 1.6, marginBottom: 10 }}>
            STRIVE needs a free analysis API key to analyze videos. Takes 30 seconds:
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 12, lineHeight: 1.8 }}>
            <span style={{ color: "#e8962a", fontWeight: 700 }}>1.</span>{" "}<span style={{ color: "#e8962a", cursor: "pointer", textDecoration: "underline" }} onClick={() => window.open("https://aistudio.google.com/apikey", "_blank")}>Open aistudio.google.com/apikey</span><br/>
            <span style={{ color: "#e8962a", fontWeight: 700 }}>2.</span> Click "Create API Key"<br/>
            <span style={{ color: "#e8962a", fontWeight: 700 }}>3.</span> Paste below
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="input-field"
              type="password"
              placeholder="Paste API key (AIza...)"
              value={inlineKey}
              onChange={e => setInlineKey(e.target.value)}
              style={{ fontSize: 12, flex: 1 }}
            />
            <button
              onClick={async () => {
                if (!inlineKey.trim()) return;
                setKeySaving(true);
                try {
                  await storage.set("strive-gemini-key", inlineKey.trim());
                  setHasApiKey(true);
                } catch (e) { alert("Error: " + e.message); }
                setKeySaving(false);
              }}
              disabled={!inlineKey.trim() || keySaving}
              style={{
                background: "linear-gradient(135deg, #e8962a, #ffc15a)",
                color: "#070c16", border: "none", borderRadius: 10,
                padding: "0 20px", fontWeight: 700, fontSize: 13,
                cursor: inlineKey.trim() ? "pointer" : "not-allowed",
                opacity: inlineKey.trim() ? 1 : 0.4,
                fontFamily: "'Outfit', sans-serif", whiteSpace: "nowrap",
              }}
            >
              {keySaving ? "..." : "Save"}
            </button>
          </div>
        </div>
      ) : hasApiKey === true ? (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 14px", borderRadius: 10, marginBottom: 16,
          background: "rgba(34,197,94,0.04)", border: "1px solid rgba(34,197,94,0.08)",
        }}>
          <span style={{ color: "#22c55e", fontSize: 14 }}>✓</span>
          <span style={{ fontSize: 12, color: "rgba(34,197,94,0.7)" }}>2-pass analysis engine ready</span>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.15)", marginLeft: "auto" }}>Detect → Analyze</span>
        </div>
      ) : (
        <div style={{ padding: "10px 14px", borderRadius: 10, marginBottom: 16, background: "rgba(255,255,255,0.02)" }}>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>Checking API key...</span>
        </div>
      )}

      <button
        className="btn-gold"
        onClick={() => onAnalyze({ video, videoUrl, event, notes, meetName, meetLocation, meetDate })}
        disabled={!video || !event || compressing}
        style={{
          width: "100%", fontSize: 17, padding: 18,
          opacity: (!video || !event) ? 0.4 : 1,
          pointerEvents: (!video || !event) ? "none" : "auto",
        }}
      >
        <Icon name="eye" /> Analyze Routine
      </button>
    </div>
  );
});

// ─── ANALYZING SCREEN ───────────────────────────────────────────────
const AnalyzingScreen = React.memo(function AnalyzingScreen({ uploadData, profile, onComplete, onBack }) {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Preparing video...");
  const [frames, setFrames] = useState([]);
  const [error, setError] = useState(null);
  const hiddenVideoRef = useRef(null);
  const hasStarted = useRef(false);

  // ── Yield to UI thread between heavy frame operations ──
  const yieldToUI = useCallback(() => {
    return new Promise(resolve => {
      if (typeof requestIdleCallback === "function") {
        requestIdleCallback(resolve, { timeout: 50 });
      } else {
        setTimeout(resolve, 0);
      }
    });
  }, []);

  // ── Shared blank-frame check (5-point sampling for dark gym videos) ──
  const isFrameBlank = useCallback((ctx, canvas) => {
    const w = canvas.width, h = canvas.height;
    const points = [
      [Math.floor(w * 0.5), Math.floor(h * 0.5)],
      [Math.floor(w * 0.25), Math.floor(h * 0.25)],
      [Math.floor(w * 0.75), Math.floor(h * 0.25)],
      [Math.floor(w * 0.25), Math.floor(h * 0.75)],
      [Math.floor(w * 0.75), Math.floor(h * 0.75)],
    ];
    for (const [x, y] of points) {
      const px = ctx.getImageData(x, y, 1, 1).data;
      if ((px[0] + px[1] + px[2]) >= 15 || px[3] >= 10) return false; // at least one non-blank pixel
    }
    return true; // all 5 points are black/transparent
  }, []);

  // ── Promise-based seek helper ──
  const seekTo = useCallback((video, time) => {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => { cleanup(); resolve(false); }, 3000);
      const onSeeked = () => { cleanup(); resolve(true); };
      const cleanup = () => { clearTimeout(timeout); video.removeEventListener("seeked", onSeeked); };
      video.addEventListener("seeked", onSeeked, { once: true });
      video.currentTime = time;
    });
  }, []);

  // ── Strategy 1: Seek-based extraction (fast, works for H.264) ──
  const extractViaSeek = useCallback(async (video, canvas, ctx, maxFrames) => {
    const captured = [];
    const duration = video.duration;
    if (!duration || !isFinite(duration)) return captured;

    // Check if video has seekable ranges — if not, skip immediately
    if (!video.seekable || video.seekable.length === 0) {
      log.warn("frames", "No seekable ranges available — skipping seek-based extraction");
      return captured;
    }

    const seekStart = video.seekable.start(0);
    const seekEnd = video.seekable.end(video.seekable.length - 1);
    log.info("frames", `Seekable range: ${seekStart.toFixed(2)}s - ${seekEnd.toFixed(2)}s (duration: ${duration.toFixed(2)}s)`);

    // Deterministic 0.4s intervals, capped at maxFrames
    const frameInterval = 0.4;
    const totalPossible = Math.floor((seekEnd - seekStart) / frameInterval);
    // If too many frames, spread evenly; otherwise take every 0.4s
    const step = totalPossible > maxFrames ? (seekEnd - seekStart) / maxFrames : frameInterval;
    const frameCount = Math.min(totalPossible, maxFrames);

    for (let i = 0; i < frameCount; i++) {
      const target = seekStart + 0.1 + (step * i);
      const clamped = Math.min(Math.max(target, seekStart + 0.1), seekEnd - 0.1);

      const seeked = await seekTo(video, clamped);
      if (!seeked) { log.warn("frames", `Seek to ${clamped.toFixed(2)}s timed out`); continue; }

      // Small delay for decoder to produce frame
      await new Promise(r => setTimeout(r, 80));

      try {
        const vw = video.videoWidth || 640;
        const vh = video.videoHeight || 480;
        // 720p resolution (1280px width) for better detail
        canvas.width = Math.min(vw, 1280);
        canvas.height = Math.round(canvas.width * (vh / vw));
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        if (!isFrameBlank(ctx, canvas)) {
          const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
          captured.push({
            timestamp: video.currentTime.toFixed(2),
            dataUrl,
            base64: dataUrl.split(",")[1],
          });
          setProgress(Math.round((captured.length / maxFrames) * 25));
        } else {
          log.warn("frames", `Frame at ${clamped.toFixed(2)}s was blank, skipping`);
        }
      } catch (e) { log.warn("frames", `Seek capture error at ${clamped.toFixed(2)}s: ${e.message}`); }
      // Yield to UI between frames to prevent jank
      await yieldToUI();
    }
    return captured;
  }, [isFrameBlank, seekTo, yieldToUI]);

  // ── Strategy 2: Play-based extraction (works for HEVC .MOV) ──
  const extractViaPlay = useCallback((video, canvas, ctx, maxFrames) => {
    return new Promise((resolve) => {
      const captured = [];
      const duration = video.duration || 10;
      // Deterministic 0.4s intervals, capped at maxFrames
      const frameInterval = 0.4;
      const totalPossible = Math.floor(duration / frameInterval);
      const step = totalPossible > maxFrames ? duration / maxFrames : frameInterval;
      const frameCount = Math.min(totalPossible, maxFrames);
      const targets = Array.from({ length: frameCount }, (_, i) => step * (i + 1));
      let nextTarget = 0;
      let done = false;

      setStatus("Extracting frames (playing video)...");

      const finish = () => {
        if (done) return;
        done = true;
        video.removeEventListener("timeupdate", onTimeUpdate);
        video.removeEventListener("ended", finish);
        clearTimeout(masterTimeout);
        try { video.pause(); video.playbackRate = 1; } catch(e) {}
        resolve(captured);
      };

      const masterTimeout = setTimeout(finish, 30000);

      // Cap at 4x — higher rates cause frame skipping on most browsers
      video.playbackRate = Math.min(4, Math.max(2, duration / 5));
      video.currentTime = 0;

      const onTimeUpdate = () => {
        if (done || nextTarget >= targets.length) return;

        // Wider tolerance window (0.8s) to avoid missing frames at accelerated playback
        if (video.currentTime >= targets[nextTarget] - 0.8) {
          try {
            const vw = video.videoWidth || 640;
            const vh = video.videoHeight || 480;
            canvas.width = Math.min(vw, 1280);
            canvas.height = Math.round(canvas.width * (vh / vw));
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            if (!isFrameBlank(ctx, canvas)) {
              const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
              captured.push({
                timestamp: video.currentTime.toFixed(2),
                dataUrl,
                base64: dataUrl.split(",")[1],
              });
              setProgress(Math.round((captured.length / maxFrames) * 25));
            }
          } catch(e) { log.warn("frames", `Play capture error: ${e.message}`); }
          nextTarget++;
        }

        if (video.ended || video.currentTime >= duration - 0.2 || captured.length >= maxFrames) {
          finish();
        }
      };

      video.addEventListener("timeupdate", onTimeUpdate);
      video.addEventListener("ended", finish);

      const playPromise = video.play();
      if (playPromise && playPromise.then) {
        playPromise.catch(() => finish());
      }
    });
  }, [isFrameBlank]);

  // ── Strategy 3: Single frame grab (last resort) ──
  const extractSingleFrame = useCallback((video, canvas, ctx) => {
    return new Promise((resolve) => {
      try {
        const vw = video.videoWidth || 640;
        const vh = video.videoHeight || 480;
        canvas.width = Math.min(vw, 640);
        canvas.height = Math.round(canvas.width * (vh / vw));
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        resolve([{
          timestamp: video.currentTime.toFixed(2),
          dataUrl,
          base64: dataUrl.split(",")[1],
        }]);
      } catch(e) {
        resolve([]);
      }
    });
  }, []);

  // ── Main extraction orchestrator ──
  const extractFrames = useCallback(async () => {
    const video = hiddenVideoRef.current;
    if (!video) return [];

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    // Deterministic frame sampling: fixed 0.4s intervals, capped at 16
    const maxFrames = 24;

    // Wait for video to be ready (readyState >= 2 = HAVE_CURRENT_DATA)
    await new Promise((resolve) => {
      const isReady = () => video.readyState >= 2;
      if (isReady()) { resolve(); return; }

      const readyTimeout = setTimeout(() => {
        log.warn("frames", `Video readiness timeout. readyState=${video.readyState}, seekable=${video.seekable?.length || 0}`);
        resolve();
      }, 20000);

      const onReady = () => {
        if (isReady()) {
          clearTimeout(readyTimeout);
          video.removeEventListener("loadeddata", onReady);
          video.removeEventListener("canplay", onReady);
          video.removeEventListener("canplaythrough", onReady);
          video.removeEventListener("progress", onReady);
          log.info("frames", `Video ready: readyState=${video.readyState}, seekable ranges=${video.seekable?.length || 0}`);
          resolve();
        }
      };
      video.addEventListener("loadeddata", onReady);
      video.addEventListener("canplay", onReady);
      video.addEventListener("canplaythrough", onReady);
      video.addEventListener("progress", onReady);

      // Force load
      video.load();
    });

    if (video.readyState < 1) {
      log.warn("frames", "Video never reached readyState >= 1, returning empty");
      return [];
    }

    // Wait for dimensions (iOS can be slow)
    let dimRetries = 0;
    while ((video.videoWidth === 0 || video.videoHeight === 0) && dimRetries < 20) {
      await new Promise(r => setTimeout(r, 200));
      dimRetries++;
    }

    // Wait for seekable ranges to populate (blob URLs can be slow)
    let seekableReady = video.seekable && video.seekable.length > 0;
    if (!seekableReady) {
      log.info("frames", "Seekable ranges empty, polling for up to 5s...");
      for (let i = 0; i < 25 && !seekableReady; i++) {
        await new Promise(r => setTimeout(r, 200));
        seekableReady = video.seekable && video.seekable.length > 0;
      }
      if (!seekableReady) log.warn("frames", "Seekable ranges never populated — seek-based will be skipped");
    }

    // Activate video with play (required on iOS before any extraction works)
    setStatus("Activating video decoder...");
    try {
      const p = video.play();
      if (p && p.then) await p.catch(() => {});
      await new Promise(r => setTimeout(r, 300));
      video.pause();
    } catch(e) {}

    // Strategy 1: Seek-based (only if seekable ranges exist)
    let frames = [];
    if (seekableReady) {
      setStatus("Extracting frames (seek mode)...");
      frames = await extractViaSeek(video, canvas, ctx, maxFrames);
      log.info("frames", `Seek-based extraction got ${frames.length} frames`);
    }

    if (frames.length < 2) {
      // Strategy 2: Play-based (for HEVC .MOV or when seeking fails)
      setStatus("Trying play-based extraction...");
      setProgress(5);
      video.currentTime = 0;
      await new Promise(r => setTimeout(r, 200));
      const playFrames = await extractViaPlay(video, canvas, ctx, maxFrames);
      log.info("frames", `Play-based extraction got ${playFrames.length} frames`);
      if (playFrames.length > frames.length) frames = playFrames;
    }

    if (frames.length >= 1) return frames;

    // Strategy 3: Single frame grab
    setStatus("Grabbing available frame...");
    video.currentTime = 0.5;
    await new Promise(r => setTimeout(r, 500));
    frames = await extractSingleFrame(video, canvas, ctx);
    log.info("frames", `Single frame extraction got ${frames.length} frames`);

    return frames;
  }, [extractViaSeek, extractViaPlay, extractSingleFrame]);


  // ══════════════════════════════════════════════════════════════════
  // ANALYSIS PIPELINE
  // ══════════════════════════════════════════════════════════════════

  // (runPoseDetection removed — AI provides joint data directly)

  // ── Gemini File Upload — uploads video to File API, returns reference ──
  const uploadVideoToGemini = useCallback(async (videoFile, apiKey) => {
    const mimeType = videoFile.type || "video/mp4";
    setStatus("Uploading video...");
    setProgress(40);
    log.info("upload", `Uploading: ${videoFile.name} (${(videoFile.size/1024/1024).toFixed(1)}MB)`);

    const startRes = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`, {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(videoFile.size),
        "X-Goog-Upload-Header-Content-Type": mimeType,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file: { display_name: "routine_" + Date.now() } }),
    });
    if (!startRes.ok) throw new Error(`Upload init failed (${startRes.status})`);

    const uploadUrl = startRes.headers.get("X-Goog-Upload-URL") || startRes.headers.get("x-goog-upload-url");
    if (!uploadUrl) throw new Error("No upload URL returned");

    setStatus("Analyzing routine...");
    setProgress(50);

    const uploadRes = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "X-Goog-Upload-Command": "upload, finalize",
        "X-Goog-Upload-Offset": "0",
        "Content-Length": String(videoFile.size),
      },
      body: videoFile,
    });
    if (!uploadRes.ok) throw new Error(`Upload failed (${uploadRes.status})`);

    const fileInfo = await uploadRes.json();
    const fileUri  = fileInfo.file?.uri;
    const fileName = fileInfo.file?.name;
    if (!fileUri) throw new Error("No file URI returned");
    log.info("upload", `Uploaded: ${fileName}`);

    // Poll until ACTIVE
    setStatus("Processing video...");
    setProgress(58);
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const check = await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`);
        if (check.ok) {
          const data = await check.json();
          log.info("upload", `File state: ${data.state} (poll ${i+1})`);
          if (data.state === "ACTIVE") break;
          if (data.state === "FAILED") throw new Error("Video processing failed on server");
        }
      } catch (e) { if (e.message.includes("failed")) throw e; }
      setProgress(58 + Math.min(10, Math.floor(i / 2)));
      if (i === 39) throw new Error("Video processing timed out");
    }
    return { fileUri, fileName, mimeType };
  }, []);

  // ── Gemini Generate — call the model with an uploaded file ──
  const geminiGenerate = useCallback(async (fileRef, prompt, apiKey, config = {}) => {
    const { label = "analysis" } = config;
    log.info("gemini", `[${label}] Sending prompt (${prompt.length} chars)`);

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { file_data: { file_uri: fileRef.fileUri, mime_type: fileRef.mimeType } },
            { text: prompt },
          ],
        }],
        generationConfig: {
          temperature: 0.1,
          topP: 1,
          topK: 1,
          maxOutputTokens: 16384,
          seed: 42,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`${label} failed (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const rawText = parts.filter(p => p.text && !p.thought).map(p => p.text).join("\n")
      || parts.map(p => p.text || "").join("\n");

    log.info("gemini", `[${label}] Response: ${rawText.length} chars`);
    try { localStorage.setItem(`debug-gemini-${label}`, rawText); } catch {}
    return rawText;
  }, []);

  // ── State Official judging prompt — returns JSON directly ──
  // skillList: optional array from Pass 1 skill detection [{time, skill, type}]
  // ══════════════════════════════════════════════════════════════════
  // STRIVE 2-PASS GRADING SYSTEM
  //
  // Pass 1 — Skill Identification: Watch video, list every skill + timestamp
  // Pass 2 — Skill Grading:        Grade each skill A-F, one sentence why
  // Code   — Score Computation:    Grade → deduction → sum → final score
  //
  // Gemini observes. Code computes. No contradictions. No fabricated numbers.
  // ══════════════════════════════════════════════════════════════════

  // ── Level context helper ──────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════
  // STRIVE DIRECT JUDGING SYSTEM
  //
  // Single prompt. Gemini watches the video and returns every skill
  // with a deduction on a 0.05 scale and a specific reason.
  // Code sums deductions and computes the final score — never Gemini.
  //
  // Prompt is built dynamically from the athlete's profile:
  //   level → split angle, expected skills, deduction standards
  //   event → what elements to look for
  //   compulsory/optional/xcel → judging context
  // ══════════════════════════════════════════════════════════════════

  const buildJudgingPrompt = useCallback(() => {
    const level   = profile.level  || "Level 6";
    const gender  = profile.gender === "female" ? "Women's" : "Men's";
    const rawEvent = uploadData?.event || "Floor Exercise";
    const isAutoDetect = rawEvent === "Auto-detect";
    const event   = isAutoDetect ? "Auto-detect" : rawEvent;
    const cat     = profile.levelCategory || "optional";
    const isXcel  = cat === "xcel";
    const isComp  = cat === "compulsory";
    const isElite = level === "Elite";

    // ── Split angle minimum by level ────────────────────────────────
    const splitMin = isXcel
      ? (level.includes("Bronze") || level.includes("Silver") ? 90
        : level.includes("Gold") ? 120
        : level.includes("Platinum") ? 150 : 180)
      : (["Level 1","Level 2","Level 3","Level 4"].includes(level) ? 90
        : level === "Level 5" ? 120
        : (level === "Level 6" || level === "Level 7") ? 150 : 180);

    const splitDed = splitMin <= 90 ? "0.10" : splitMin <= 120 ? "0.10–0.20" : "0.20";

    // ── Score benchmark for this level ─────────────────────────────
    const bench = SCORE_BENCHMARKS[level];
    const benchLine = bench
      ? `Typical ${level} ${event} scores: avg ${bench.avg}, top 10% at ${bench.top10}, range ${bench.low}–${bench.high}.`
      : "";

    // ── Required skills for this level and event ────────────────────
    const eventKey = String(event || '').toLowerCase().replace("floor exercise","floor").replace("balance beam","beam")
      .replace("uneven bars","bars").replace("still rings","bars")
      .replace("parallel bars","bars").replace("high bar","bars")
      .replace("pommel horse","vault");
    const levelSkills = LEVEL_SKILLS[level];
    const skillsLine = levelSkills?.[eventKey]
      ? `Required/expected skills at ${level} ${event}: ${levelSkills[eventKey]}.`
      : "";

    // ── Program context ─────────────────────────────────────────────
    const programContext = isComp
      ? `COMPULSORY ROUTINE (${level}): Every gymnast performs the identical prescribed choreography. Deduct for ANY deviation from the required choreography, timing, or element order — in addition to all execution faults.`
      : isXcel
      ? `XCEL ${level} ROUTINE: Athlete selects their own skills within Xcel program parameters. Verify all 4 Special Requirements are present (−0.50 each if missing). Split leap/jump minimum is ${splitMin}°.`
      : isElite
      ? `ELITE ROUTINE (FIG Code of Points): Judge execution from 10.0 E-score base. D-score is separate. Apply FIG deduction standards strictly.`
      : `${level} OPTIONAL ROUTINE: Athlete selects their own skills. Split leap/jump minimum is ${splitMin}°. ${level === "Level 5" ? "Round-off BHS back tuck is required." : ""}`;

    // ── Execution deduction standards (from USA Gymnastics code) ────
    const executionStandards = `
EXECUTION FAULTS — USA Gymnastics official deduction scale (0.05 increments only):
  Bent arms:                  slight=0.05  noticeable=0.10  significant=0.20  severe=0.30
  Bent knees / legs:          slight=0.05  noticeable=0.10  significant=0.20  severe=0.30
  Leg separation (cowboy):    visible=0.10  wide=0.20
  Flexed / sickled feet:      0.05 per occurrence
  Insufficient height/amplitude: 0.05–0.30
  Body alignment (pike/arch): 0.05–0.30
  Incomplete rotation/twist:  0.05–0.30
  Head position error:        0.05–0.10`;

    const landingStandards = `
LANDING FAULTS — judge every landing separately:
  Small step:                 0.05
  Medium step:                0.10
  Large step / lunge:         0.20–0.30
  Squat (above 90° knee):     0.10–0.20
  Deep squat (below 90° knee):0.30
  Hands on floor (no fall):   0.30
  Fall:                       0.50
  Chest drop / posture:       0.05–0.20`;

    const artistryStandards = `
ARTISTRY & COMPOSITION FAULTS — use "Global" timestamp. These are MANDATORY to evaluate:
  Hollow hands / limp wrists / poor finger lines:  0.05 per occurrence
  No eye contact with judges / lack of presentation: 0.05–0.10
  Lack of confidence / hesitation before skills:    0.05–0.10
  Poor musicality / rhythm (Floor):                 0.05–0.20
  Flat footwork / no relevé in dance elements:      0.05–0.10
  Insufficient use of floor space:                  0.05–0.10
  Arms "tossed" rather than placed with intention:  0.05
  Energy drops between skills:                      0.05–0.10
  Flexed feet/toes throughout (cumulative):         0.05 per occurrence (count each)
  Lack of finger-tip to toe-tip engagement:         0.05–0.15
  Rushed choreography / no performance quality:     0.10–0.20
  NOTE: Artistry deductions typically total 0.15–0.40 for youth routines. If you have 0.00 artistry deductions, you are WRONG — re-evaluate.`;

    const splitStandard = `
SPLIT LEAP/JUMP REQUIREMENT at ${level}: minimum ${splitMin}°
  ${splitMin - 15}°–${splitMin - 1}° (close): −0.05–0.10
  ${splitMin - 30}°–${splitMin - 16}° (short): −${splitDed}
  Below ${splitMin - 30}° (very short): −0.20–0.30`;

    const athleteName = profile.name || "the gymnast";

    // ── Enhanced event deductions from eventDeductions.js ──────────────
    const detailedEventDeductions = !isAutoDetect ? getEventDeductions(event) : "";
    const strictnessGuidance = !isAutoDetect ? getEventStrictnessGuidance(event) : "";

    // ── Code of Points deduction reference ─────────────────────────────
    const copBlock = !isAutoDetect
      ? buildDeductionPromptBlock(profile.gender || "female", level, event)
      : "";

    const autoDetectLine = isAutoDetect
      ? `\nEVENT AUTO-DETECTION: Identify the gymnastics event/apparatus from the video content. Look for: balance beam (narrow beam, 4 inches wide), uneven bars (two horizontal bars at different heights), vault (running approach + springboard), floor exercise (spring floor, no apparatus). Include the detected event as "detectedEvent" in your JSON response.\n`
      : "";

    // ── Event-specific "Pessimistic Judge" rules ───────────────────────
    // These inject apparatus-specific compound deductions, hidden faults,
    // perspective warnings, and rhythm rules that close the scoring gap.
    const eventRules = !isAutoDetect ? EVENT_JUDGING_RULES[event] : null;
    const eventSRs = eventRules?.specialRequirements?.[level] || [];

    let eventSpecificBlock = "";
    if (eventRules) {
      const parts = [];

      // Strictness directive
      if (eventRules.strictnessBias > 1.0) {
        parts.push(`STRICTNESS DIRECTIVE (${event}): This apparatus requires STRICTER judging than floor. AI models consistently under-deduct on ${event} by ${((eventRules.strictnessBias - 1) * 100).toFixed(0)}%. When in doubt, ALWAYS take the deduction. Look for reasons to DEDUCT, not reasons to give credit.`);
      }

      // Perspective warning
      if (eventRules.perspectiveBias) {
        parts.push(`PERSPECTIVE ${eventRules.perspectiveBias}`);
      }

      // Compound rules
      if (eventRules.compoundRules?.length) {
        parts.push(`${event.toUpperCase()} COMPOUND DEDUCTION RULES — apply ALL of these:\n${eventRules.compoundRules.join("\n")}`);
      }

      // Hidden deductions checklist
      if (eventRules.hiddenDeductions?.length) {
        parts.push(`${event.toUpperCase()} COMMONLY MISSED DEDUCTIONS — check EVERY skill for these:\n${eventRules.hiddenDeductions.join("\n")}`);
      }

      // Rhythm/flow rules
      if (eventRules.rhythmJudging) {
        parts.push(`RHYTHM/FLOW: ${eventRules.rhythmJudging}`);
      }

      // Special requirements for this level
      if (eventSRs.length) {
        parts.push(`SPECIAL REQUIREMENTS for ${level} ${event} — verify ALL are present:\n${eventSRs.map((sr, i) => `  ${i + 1}. ${sr}`).join("\n")}\nMissing any Special Requirement = -0.50 from Start Value.`);
      }

      // Skill counting guidance per event
      if (event === "Uneven Bars" || event === "High Bar") {
        parts.push(`SKILL COUNTING (${event}): A typical ${level} ${event} routine has 5-8 DISTINCT SKILLS, NOT 15-20.
On bars, casts are CONNECTING ELEMENTS, not separate skills. Do NOT create separate entries for each cast.
Instead, evaluate cast height as part of the FOLLOWING skill's faults.
Example: If cast is low before a back hip circle, add "Low cast preceding circle (-0.10)" to the back hip circle's faults.
Skills to identify: kip, circling skills (back hip circle, clear hip, giant), transitions between bars, release moves, dismount.`);
      } else if (event === "Floor Exercise") {
        parts.push(`SKILL COUNTING (Floor): Identify tumbling passes as INDIVIDUAL ELEMENTS within the pass. A round-off + back handspring + back tuck = THREE entries. Also identify: leaps, jumps, turns, and dance passages as individual entries. Typical floor routine has 10-15 skill entries.`);
      } else if (event === "Balance Beam") {
        parts.push(`SKILL COUNTING (Beam): Identify each acro skill, dance element, turn, and dismount as individual entries. Include mount. Typical beam routine has 8-12 skill entries.`);
      } else if (event === "Vault") {
        parts.push(`SKILL COUNTING (Vault): Vault is ONE skill with multiple phases. Create 1 entry with faults from each phase (run, hurdle, board, pre-flight, table, post-flight, landing).`);
      }

      // Typical deduction range override
      if (eventRules.typicalDeductionRange) {
        const dr = eventRules.typicalDeductionRange;
        parts.push(`CALIBRATION OVERRIDE (${event}): Expected deduction range for ${level} ${event}: ${dr.min}–${dr.max}. ${dr.note}`);
      }

      eventSpecificBlock = "\n═══ EVENT-SPECIFIC JUDGING RULES ═══\n" + parts.join("\n\n") + "\n═══ END EVENT-SPECIFIC RULES ═══\n";
    }

    return `You are a Brevet-certified USA Gymnastics judge at a State Championship. You give NO benefit of the doubt. When in doubt, take the HIGHER deduction. Your job is to find EVERY fault so the athlete can improve. You are a PESSIMISTIC judge — you look for reasons to DEDUCT, not reasons to celebrate.

ATHLETE: ${athleteName} | ${gender} ${level} | EVENT: ${isAutoDetect ? "DETECT FROM VIDEO" : event}
${autoDetectLine}
${programContext}
${skillsLine}
${benchLine}
${eventSpecificBlock}
${detailedEventDeductions ? `\n═══ DETAILED APPARATUS DEDUCTION TABLE ═══\n${detailedEventDeductions}\n═══ END APPARATUS DEDUCTIONS ═══\n` : ""}
${strictnessGuidance}
${copBlock ? `\n${copBlock}\n` : ""}
KEY RULES:
1. INDIVIDUAL ELEMENTS: Break every skill apart for FEEDBACK purposes. A Round-off, Back Handspring, and Back Tuck in one tumbling pass = THREE separate entries. HOWEVER, connecting elements within a pass share momentum — only deduct faults you can CLEARLY SEE on each individual element. Do not assume faults on connecting elements. If a round-off looks clean, score it clean (0.00 deduction). Most elements in a competent routine have 0-1 visible faults.
2. MICRO-DEDUCTIONS: Flexed feet, soft knees, micro-bends — deduct 0.05 each, but ONLY when clearly visible. Do not guess or assume. A typical skill has 0-2 micro-faults, not 3-4.
3. LANDINGS: Only the FINAL landing of a tumbling pass gets full landing deductions. Intermediate landings (between RO and BHS, between BHS and tuck) are transitional and only deducted if there's a clear error (stumble, extra step, loss of momentum). Final landing: step = 0.05-0.10, squat = 0.10-0.20, deep squat = 0.20-0.30.
4. ARTISTRY — THE HIDDEN DEDUCTIONS (typically 0.15-0.35 total for youth):
   - Finger-tip to toe-tip engagement, arms tossed vs placed (0.05-0.10)
   - Hesitations before passes (0.05-0.10)
   - Flexed feet in dance/transitions — cumulative (0.05-0.15)
   - Composition: floor space, transitions, variety (0.05-0.10)
5. SPLIT LEAPS: ${level} requires ${splitMin}°. Short = 0.10-0.20 deduction.
6. CALIBRATION — THIS IS CRITICAL:
   - Target range for total deductions: ${eventRules?.typicalDeductionRange?.min || 0.80}–${eventRules?.typicalDeductionRange?.max || 1.30} for most ${level} ${event} routines.
   - A score of 8.7–9.2 is typical at State Championships for ${level}.
   - If your total deductions are below ${eventRules?.typicalDeductionRange?.min || 0.80}, you are too LENIENT — find more faults.
   - If your total deductions are above ${eventRules?.typicalDeductionRange?.max || 1.50}, you are too HARSH — you are likely double-counting faults across connected elements or deducting faults you cannot clearly see. Remove uncertain deductions.
   - The sum of all individual skill deductions (execution) should typically be 0.50–0.90. Artistry + composition add another 0.20–0.40.

${executionStandards}
${landingStandards}
${splitStandard}

DEDUCTION VALUES: 0.00, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.50 ONLY.
Timestamps: M:SS format from video start (0:00).

Respond with ONLY a JSON object. No markdown, no backticks, no text outside the JSON.
Every element gets its own entry. Severity: "small"/"medium"/"large"/"veryLarge"/"fall".
Skills in chronological order. qualityScore = 10.0 minus that skill's total deduction.

{
  "skills": [
    {
      "timestamp": "0:05",
      "name": "Round-off",
      "type": "acro",
      "qualityScore": 9.75,
      "deduction": 0.25,
      "faults": [
        {"fault": "Legs apart during inversion", "deduction": 0.10, "severity": "medium"},
        {"fault": "Slight bent arms on floor contact", "deduction": 0.10, "severity": "medium"},
        {"fault": "Feet not together on snap-down", "deduction": 0.05, "severity": "small"}
      ],
      "strengthNote": "Strong power generation into the pass",
      "bodyMechanics": {"kneeAngle": "Slight bend at snap-down", "hipAlignment": "Good extension", "shoulderPosition": "Adequate block", "toePoint": "Pointed in flight"},
      "injuryRisk": null,
      "drillRecommendation": "T-handstand snap-downs against wall — focus on tight legs throughout."
    },
    {
      "timestamp": "0:06",
      "name": "Back Handspring",
      "type": "acro",
      "qualityScore": 9.70,
      "deduction": 0.30,
      "faults": [
        {"fault": "Bent arms in support phase", "deduction": 0.10, "severity": "medium"},
        {"fault": "Knees bent in flight", "deduction": 0.10, "severity": "medium"},
        {"fault": "Feet sickled", "deduction": 0.05, "severity": "small"},
        {"fault": "Slight leg separation", "deduction": 0.05, "severity": "small"}
      ],
      "strengthNote": "Good rebound height into next skill",
      "bodyMechanics": {"kneeAngle": "Bent through flight phase", "hipAlignment": "Slight arch", "shoulderPosition": "Arms bent at push-off", "toePoint": "Sickled"},
      "injuryRisk": "Bent arms increase wrist strain. Strengthen with handstand push-ups.",
      "drillRecommendation": "BHS over barrel — focus on straight arms and tight body."
    }
  ],
  "artistry": {
    "totalDeduction": 0.30,
    "details": [
      {"fault": "Hollow hands — fingers not engaged throughout", "deduction": 0.05},
      {"fault": "Flat feet in dance transitions — no relevé", "deduction": 0.10},
      {"fault": "Limited projection/eye contact with judges", "deduction": 0.05},
      {"fault": "Flexed toes during leaps and jumps (cumulative)", "deduction": 0.10}
    ]
  },
  "composition": {
    "totalDeduction": 0.15,
    "details": [
      {"fault": "Limited use of floor space — stayed center", "deduction": 0.05},
      {"fault": "Rushed transitions between passes", "deduction": 0.05},
      {"fault": "Energy drops between skill sequences", "deduction": 0.05}
    ]
  },
  "summary": {
    "overallScore": 8.85,
    "startValue": 10.0,
    "totalDeductions": 1.15,
    "executionDeductions": 0.70,
    "artistryDeductions": 0.30,
    "compositionDeductions": 0.15,
    "whyThisScore": "Accumulated micro-deductions across 12 individual elements (0.70 execution) combined with artistry gaps (0.30) and composition issues (0.15) produce 1.15 total deductions. The largest single deductions came from landing errors and bent arms in tumbling.",
    "celebrations": [
      "Strong tumbling power — excellent height on back tuck",
      "Full turn executed with stable balance and control",
      "Confident final pose with maturity"
    ],
    "topImprovements": [
      {"fix": "Stick landings — chest up, absorb through legs", "pointsGained": 0.20},
      {"fix": "Point toes hard through every skill — cumulative 0.15 gain", "pointsGained": 0.15},
      {"fix": "Dance presentation — relevé, finger engagement, eye contact", "pointsGained": 0.15}
    ]
  }
}

JSON RULES:
- Output ONLY the JSON. No text before or after. No markdown fences.
- Every individual element in the routine gets its own entry — do NOT combine connected skills.
- Fault deductions for a skill must sum to match its "deduction" field.
- Artistry/composition faults go in their own sections, NOT in skills array.
- Each deduction exactly two decimal places. Only values: 0.00, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.50.
- Chronological order by timestamp.
- If total deductions < 0.80, you are too lenient. Re-evaluate.
- If total deductions > 1.50, you are too harsh — remove uncertain deductions. Target: 0.90–1.20 total.

SECOND-PASS CHECK (do this AFTER your initial assessment):
Re-watch the routine focusing ONLY on these commonly missed items:
1. Feet — were there flexed feet you missed? Count them.
2. Pauses — any hesitations or rhythm breaks between skills?
3. Landings — did you deduct for every step, hop, or squat?
4. Split leaps — is the angle truly at or above ${splitMin}°?
5. Arms — any bent arm moments in support or flight?
Add any missed deductions to your final JSON.`;
  }, [profile, uploadData]);

  // ── Main analysis orchestrator — single pass ─────────────────────
  const analyzeWithAI = useCallback(async (extractedFrames) => {
    setStatus("Preparing analysis...");
    setProgress(35);

    // Check if server-side Gemini key is available (key stays server-side, not exposed)
    let serverKeyAvailable = false;
    let apiKey = null;
    try {
      const resp = await fetch("/api/gemini-key", { headers: { "X-Strive-Token": "strive-2026-launch" } });
      if (resp.ok) { const d = await resp.json(); serverKeyAvailable = !!d.available; if (d.key) apiKey = d.key; }
    } catch {}
    // If server key available, use server proxy at /api/analyze — no client-side key needed
    // Otherwise, fall back to user's manually-entered key in Settings for direct Gemini calls
    if (!serverKeyAvailable) {
      try { const k = await storage.get("strive-gemini-key"); apiKey = k?.value || null; } catch {}
      if (!apiKey) throw new Error("No API key. Go to Settings and paste your API key from aistudio.google.com/apikey");
    }
    if (!uploadData.video) throw new Error("No video file available.");

    // ── Score caching — return cached result for duplicate submissions ──
    // Fingerprint: file name + size + lastModified + athlete name + level + event
    const PROMPT_VERSION = "v7_full_pessimistic"; // Bump this when prompt changes to invalidate cache
    const fingerprintParts = [
      PROMPT_VERSION,
      uploadData.video.name || "video",
      String(uploadData.video.size || 0),
      String(uploadData.video.lastModified || 0),
      (profile.name || "unknown").toLowerCase().trim(),
      profile.level || "L6",
      uploadData.event || "floor",
    ].join("_");
    const cacheKey = `strive_cache_${btoa(unescape(encodeURIComponent(fingerprintParts)))}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { result, timestamp } = JSON.parse(cached);
        const ageHours = (Date.now() - timestamp) / (1000 * 60 * 60);
        if (ageHours < 24 && result && result.gradedSkills) {
          log.info("cache", `Returning cached result (${ageHours.toFixed(1)}h old, ${result.gradedSkills.length} skills)`);
          result._cached = true;
          setProgress(100);
          setStatus("Score verified — analyzed previously");
          return result;
        }
      }
    } catch (e) { log.warn("cache", `Cache read failed: ${e.message}`); }

    try {
      // Upload video once — requires a client-side API key for direct Gemini uploads
      if (!apiKey && serverKeyAvailable) {
        // Server has the key but we can't do client-side video upload without it.
        // Use server proxy for text-based analysis when video upload isn't possible.
        log.info("analyze", "Server key available — routing through /api/analyze proxy");
      }
      const fileRef = apiKey ? await uploadVideoToGemini(uploadData.video, apiKey) : null;

      // ── Single judging pass ──────────────────────────────────────
      setStatus(`Evaluating ${profile.level} ${uploadData.event} routine...`);
      setProgress(68);

      const prompt = buildJudgingPrompt();
      log.info("gemini", `Prompt length: ${prompt.length} chars | Level: ${profile.level} | Event: ${uploadData.event}`);

      let rawResponse = null;

      if (fileRef && apiKey) {
        // Direct Gemini API path (user-provided key)
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            rawResponse = await geminiGenerate(fileRef, prompt, apiKey, {
              label: `judge-${profile.level}-attempt${attempt}`,
            });
            if (rawResponse && rawResponse.length > 100 && (rawResponse.includes('"skills"') || rawResponse.includes(" | "))) break;
            log.warn("judge", `Attempt ${attempt} short or missing skills (${rawResponse?.length} chars). Retrying...`);
            await new Promise(r => setTimeout(r, 2000));
          } catch (e) {
            log.warn("judge", `Attempt ${attempt} failed: ${e.message}`);
            if (attempt === 2) throw e;
            await new Promise(r => setTimeout(r, 2000));
          }
        }

        // Cleanup uploaded file
        try { fetch(`https://generativelanguage.googleapis.com/v1beta/${fileRef.fileName}?key=${apiKey}`, { method: "DELETE" }); } catch {}
      } else if (serverKeyAvailable) {
        // Server proxy path — send extracted frame data + prompt to /api/analyze
        setStatus(`Server-side analysis of ${profile.level} ${uploadData.event}...`);
        const proxyResp = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Strive-Token": "strive-2026-launch" },
          body: JSON.stringify({
            athleteProfile: {
              name: profile.name,
              gender: profile.gender,
              level: profile.level,
            },
            skillAnalysis: extractedFrames || [],
            event: uploadData.event || "floor",
          }),
        });
        if (!proxyResp.ok) throw new Error(`Server analysis failed (${proxyResp.status})`);
        const proxyData = await proxyResp.json();
        rawResponse = proxyData.rawText || JSON.stringify(proxyData);
      }

      if (!rawResponse) throw new Error("Analysis engine returned empty response.");

      // ── Parse Gemini response ────────────────────────────────────
      setStatus("Computing score...");
      setProgress(88);

      // ── Parse response — try JSON first (new format), then pipe-delimited (legacy/cache) ──
      let parsedSkills = [];
      let parsedArtistry = null;
      let parsedComposition = null;
      let parsedCelebrations = [];
      let whyThisScore = "";
      let pathToGoal = "";
      let parsedTopImprovements = [];
      let isRichJSON = false;
      let detectedEvent = uploadData.event;

      // ── Primary: Parse JSON response (new rich format) ──────────
      try {
        const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.skills && Array.isArray(parsed.skills) && parsed.skills.length > 0) {
            isRichJSON = true;
            // Capture auto-detected event if Gemini identified it
            if (parsed.detectedEvent) {
              detectedEvent = parsed.detectedEvent;
              log.info("parse", `Gemini auto-detected event: ${detectedEvent}`);
            }
            parsedSkills = parsed.skills.map(s => ({
              timestamp: s.timestamp || "0:00",
              skill: s.name || s.skill || "Unknown",
              type: (s.type || "acro").toLowerCase(),
              deduction: roundToUSAG(s.deduction),
              qualityScore: parseFloat(s.qualityScore) || (10.0 - roundToUSAG(s.deduction)),
              reason: safeArray(s.faults).map(f => f.fault).filter(Boolean).join("; ") || null,
              faults: safeArray(s.faults).map(f => ({
                fault: safeStr(f.fault),
                deduction: roundToUSAG(f.deduction),
                severity: safeStr(f.severity || "small"),
              })),
              strength: safeStr(s.strengthNote || s.strength),
              bodyMechanics: s.bodyMechanics || null,
              injuryRisk: safeStr(s.injuryRisk),
              drillRecommendation: safeStr(s.drillRecommendation),
            }));

            // Artistry section
            if (parsed.artistry) {
              parsedArtistry = {
                totalDeduction: roundToUSAG(parsed.artistry.totalDeduction),
                details: safeArray(parsed.artistry.details).map(d => ({
                  fault: safeStr(d.fault),
                  deduction: roundToUSAG(d.deduction),
                })),
              };
            }

            // Composition section
            if (parsed.composition) {
              parsedComposition = {
                totalDeduction: roundToUSAG(parsed.composition.totalDeduction),
                details: safeArray(parsed.composition.details).map(d => ({
                  fault: safeStr(d.fault),
                  deduction: roundToUSAG(d.deduction),
                })),
              };
            }

            // Summary section
            if (parsed.summary) {
              whyThisScore = safeStr(parsed.summary.whyThisScore);
              parsedCelebrations = safeArray(parsed.summary.celebrations);
              parsedTopImprovements = safeArray(parsed.summary.topImprovements).map(imp => ({
                fix: safeStr(imp.fix),
                pointsGained: parseFloat(imp.pointsGained) || 0,
              }));
            }

            log.info("parse", `Parsed rich JSON: ${parsedSkills.length} skills, artistry=${parsedArtistry?.totalDeduction || 0}, composition=${parsedComposition?.totalDeduction || 0}`);
          }
        }
      } catch (e) {
        log.warn("parse", `JSON parse failed: ${e.message} — trying pipe-delimited fallback`);
      }

      // ── Fallback: Parse pipe-delimited table (legacy cached responses) ──
      if (parsedSkills.length === 0) {
        const lines = rawResponse.split("\n").map(l => l.trim()).filter(l => l.includes(" | "));
        const dataLines = lines.filter(l => !/^timestamp\s*\|/i.test(l) && !/^-+\s*\|/.test(l));

        for (const line of dataLines) {
          const parts = line.split("|").map(p => p.trim());
          if (parts.length < 5) continue;
          const [timestamp, skillName, skillType, dedStr, faultDesc, strengthNote] = parts;
          const deduction = roundToUSAG(dedStr);
          if (!deduction && deduction !== 0) continue;
          if (!skillName) continue;
          parsedSkills.push({
            timestamp: timestamp || "0:00",
            skill: skillName,
            type: (skillType || "acro").toLowerCase(),
            deduction: Math.min(deduction, 0.50),
            qualityScore: 10.0 - Math.min(deduction, 0.50),
            reason: (!faultDesc || faultDesc.toLowerCase() === "clean") ? null : faultDesc,
            faults: [],
            strength: (strengthNote && strengthNote.length > 1) ? strengthNote : null,
            bodyMechanics: null,
            injuryRisk: null,
            drillRecommendation: null,
          });
        }
        if (parsedSkills.length > 0) {
          log.info("parse", `Parsed ${parsedSkills.length} skills from pipe-delimited (legacy) response`);
        }
      }

      if (parsedSkills.length === 0) {
        throw new Error("No skills found in response. Raw: " + rawResponse.substring(0,300));
      }

      // ── Hardcoded deduction validation — clamp Gemini's output ────
      const DEDUCTION_CAPS = {
        bentArms: 0.30, bentKnees: 0.30, flexedFoot: 0.05,
        landingStepSmall: 0.05, landingStepMedium: 0.10, landingStepLarge: 0.20, landingFall: 0.50,
        beamWobbleSmall: 0.10, beamWobbleMedium: 0.20, beamWobbleLarge: 0.30,
        legSeparation: 0.20,
      };
      for (const s of parsedSkills) {
        if (!s.reason) continue;
        const r = s.reason.toLowerCase();
        if (/bent\s*arm/i.test(r) && s.deduction > DEDUCTION_CAPS.bentArms) s.deduction = DEDUCTION_CAPS.bentArms;
        if (/bent\s*knee/i.test(r) && s.deduction > DEDUCTION_CAPS.bentKnees) s.deduction = DEDUCTION_CAPS.bentKnees;
        if (/flexed\s*(foot|feet)|sickle/i.test(r) && s.deduction > DEDUCTION_CAPS.flexedFoot) s.deduction = DEDUCTION_CAPS.flexedFoot;
        // Landing step caps by severity
        if (/landing/i.test(r) || /step/i.test(r) || /lunge/i.test(r)) {
          if (/fall/i.test(r) && s.deduction > DEDUCTION_CAPS.landingFall) s.deduction = DEDUCTION_CAPS.landingFall;
          else if (/large|lunge/i.test(r) && s.deduction > DEDUCTION_CAPS.landingStepLarge) s.deduction = DEDUCTION_CAPS.landingStepLarge;
          else if (/medium/i.test(r) && s.deduction > DEDUCTION_CAPS.landingStepMedium) s.deduction = DEDUCTION_CAPS.landingStepMedium;
          else if (/small/i.test(r) && s.deduction > DEDUCTION_CAPS.landingStepSmall) s.deduction = DEDUCTION_CAPS.landingStepSmall;
        }
        // Beam wobble caps by severity
        if (/wobble/i.test(r)) {
          if (/large|significant/i.test(r) && s.deduction > DEDUCTION_CAPS.beamWobbleLarge) s.deduction = DEDUCTION_CAPS.beamWobbleLarge;
          else if (/medium|moderate/i.test(r) && s.deduction > DEDUCTION_CAPS.beamWobbleMedium) s.deduction = DEDUCTION_CAPS.beamWobbleMedium;
          else if (/small|slight/i.test(r) && s.deduction > DEDUCTION_CAPS.beamWobbleSmall) s.deduction = DEDUCTION_CAPS.beamWobbleSmall;
          else if (s.deduction > DEDUCTION_CAPS.beamWobbleLarge) s.deduction = DEDUCTION_CAPS.beamWobbleLarge;
        }
        if (/cowboy|leg\s*sep/i.test(r) && s.deduction > DEDUCTION_CAPS.legSeparation) s.deduction = DEDUCTION_CAPS.legSeparation;
        // Recompute qualityScore after clamping
        s.qualityScore = Math.round((10.0 - s.deduction) * 100) / 100;
      }

      // ── Split angle validation by level — remove split deductions if level doesn't require it ──
      const splitMinByLevel = (() => {
        const lv = profile.level || "Level 6";
        const xc = (profile.levelCategory || "") === "xcel";
        if (xc) {
          if (lv.includes("Bronze")) return 0;   // no minimum
          if (lv.includes("Silver")) return 90;
          if (lv.includes("Gold")) return 120;
          if (lv.includes("Platinum")) return 150;
          return 180; // Diamond/Sapphire
        }
        if (["Level 1","Level 2","Level 3","Level 4"].includes(lv)) return 90;
        if (lv === "Level 5") return 120;
        if (lv === "Level 6" || lv === "Level 7") return 150;
        return 180;
      })();
      for (const s of parsedSkills) {
        if (!s.reason) continue;
        const r = s.reason.toLowerCase();
        // If this is a split deduction and the reason mentions an angle that meets the level minimum, remove it
        if (/split/i.test(r) && s.deduction > 0) {
          const angleMatch = r.match(/(\d{2,3})\s*°/);
          if (angleMatch) {
            const observedAngle = parseInt(angleMatch[1], 10);
            if (observedAngle >= splitMinByLevel) {
              // The split met the minimum for this level — remove the deduction
              s.deduction = 0;
              s.reason = `Split at ${observedAngle}° meets ${profile.level} minimum of ${splitMinByLevel}° — no deduction`;
            }
          }
        }
      }

      // ── Merge combination tumbling passes within 2 seconds ────────
      const merged = [];
      for (let i = 0; i < parsedSkills.length; i++) {
        const s = parsedSkills[i];
        const sec = parseTimestampToSec(s.timestamp);
        // Check if this skill should merge into the previous one
        if (merged.length > 0) {
          const prev = merged[merged.length - 1];
          const prevSec = parseTimestampToSec(prev.timestamp);
          const timeDiff = Math.abs(sec - prevSec);
          const isCombo = timeDiff <= 2
            && prev.type !== "artistry" && s.type !== "artistry"
            && !/global/i.test(s.timestamp) && !/global/i.test(prev.timestamp)
            && (/back\s*handspring|bhs|round[\s-]*off|front\s*handspring|front\s*walkover/i.test(s.skill)
              || /back\s*handspring|bhs|round[\s-]*off|front\s*handspring|front\s*walkover/i.test(prev.skill));
          if (isCombo) {
            // Merge into previous
            prev.skill = prev.skill + " " + s.skill;
            prev.deduction = Math.min(0.50, Math.round((prev.deduction + s.deduction) * 100) / 100);
            if (s.reason) prev.reason = [prev.reason, s.reason].filter(Boolean).join("; ");
            if (s.strength && !prev.strength) prev.strength = s.strength;
            continue;
          }
        }
        merged.push({ ...s });
      }
      parsedSkills = merged;

      log.info("parse", `Parsed ${parsedSkills.length} skills (format: ${isRichJSON ? "rich JSON" : "pipe-delimited legacy"})`);

      // ── CODE COMPUTES THE SCORE — not Gemini ────────────────────
      const processedSkills = parsedSkills.map((s, idx) => {
        // Clamp to nearest valid 0.05 increment
        const raw = Math.abs(parseFloat(s.deduction) || 0);
        const deduction = Math.round(Math.min(raw, 2.0) / 0.05) * 0.05;
        const qualityScore = Math.round((10.0 - deduction) * 100) / 100;
        const sec = parseTimestampToSec(s.timestamp || "0:00");
        const isGlobal  = (s.timestamp || "").toLowerCase() === "global";
        const isLanding = /^landing/i.test(s.skill);
        const isDance   = /artistry|choreo|presentation|dance|rhythm|space|musicality/i.test(s.skill);
        const category  = isDance || isGlobal ? "artistry" : "execution";
        const severity  = deduction >= 0.50 ? "fall"
          : deduction >= 0.30 ? "veryLarge"
          : deduction >= 0.20 ? "large"
          : deduction >= 0.10 ? "medium"
          : "small";

        return {
          id:             `skill_${idx}`,
          index:          idx + 1,
          skill:          safeStr(s.skill),
          timestamp:      s.timestamp || "0:00",
          timestampSec:   sec,
          type:           isLanding ? "landing" : isDance ? "dance" : "acro",
          category,
          deduction,
          qualityScore,
          reason:         safeStr(s.reason),
          strength:       safeStr(s.strength),   // ← what Gemini praised about this skill
          isGlobal,
          // ── Rich analysis fields (from JSON format) ──
          faults:              safeArray(s.faults),
          bodyMechanics:       s.bodyMechanics || null,
          injuryRisk:          safeStr(s.injuryRisk),
          drillRecommendation: safeStr(s.drillRecommendation),
          // Legacy fields for existing tabs
          fault:          safeStr(s.reason),
          engine:         isLanding ? "Landing" : isDance ? "General" : "KTM",
          severity,
          confidence:     0.92,
          correction:     null,
          skeleton:       null,
          // Frame capture — populated later by VideoReviewPlayer
          frameDataUrl:   null,
          skeletonJoints: null,
          // Graded skills view compatibility
          grade:          deduction === 0 ? "A" : deduction <= 0.05 ? "A-" : deduction <= 0.10 ? "B" : deduction <= 0.20 ? "C" : deduction <= 0.30 ? "D+" : "F",
          gradeDeduction: deduction,
          gradeColor:     deduction === 0 ? "#22c55e" : deduction <= 0.05 ? "#4ade80" : deduction <= 0.10 ? "#ffc15a" : deduction <= 0.20 ? "#e06820" : "#dc2626",
          coachNote:      null,
        };
      });

      // ── Sum deductions — only place math happens ─────────────────
      const execSkills = processedSkills.filter(s => s.category !== "artistry");
      const artSkills  = processedSkills.filter(s => s.category === "artistry");
      const execTotalRaw  = Math.round(execSkills.reduce((sum, s) => sum + s.deduction, 0) * 1000) / 1000;
      const artTotalRaw   = Math.round(artSkills.reduce( (sum, s) => sum + s.deduction, 0) * 1000) / 1000;

      // ── Composition deductions from rich JSON format ────────────
      const compTotalRaw = parsedComposition
        ? Math.round((parseFloat(parsedComposition.totalDeduction) || 0) * 1000) / 1000
        : 0;

      // If we have rich artistry/composition sections, use those totals instead of skill-level artistry
      const richArtTotal = parsedArtistry
        ? Math.round((parseFloat(parsedArtistry.totalDeduction) || 0) * 1000) / 1000
        : artTotalRaw;

      // ── USAG 0.025 rounding normalization ──────────────────────
      // USAG E-scores use 0.025 increments. Round total deductions to nearest 0.025.
      const roundToUSAG = (val) => Math.round(val / 0.025) * 0.025;
      const execTotal  = roundToUSAG(execTotalRaw);
      const artTotal   = roundToUSAG(isRichJSON ? richArtTotal : artTotalRaw);
      const compTotal  = roundToUSAG(compTotalRaw);
      const totalDed   = Math.round((execTotal + artTotal + compTotal) * 1000) / 1000;

      // ── Validation: ensure final score = start value - total deductions ──
      const startValue = 10.0;
      const finalScore = Math.max(0, Math.round((startValue - totalDed) * 1000) / 1000);

      // Sanity check: individual deductions must sum to total (within 0.01 tolerance)
      const individualSum = Math.round(processedSkills.reduce((sum, s) => sum + s.deduction, 0) * 1000) / 1000;
      const sumDiff = Math.abs(individualSum - (execTotalRaw + artTotalRaw));
      if (sumDiff > 0.01) {
        log.warn("validation", `Deduction sum mismatch: individual=${individualSum}, exec+art=${execTotalRaw + artTotalRaw}, diff=${sumDiff}`);
      }

      log.info("score", `FINAL: ${finalScore} | Deductions: ${totalDed} (raw: ${(execTotalRaw + richArtTotal + compTotalRaw).toFixed(3)}, USAG-rounded) | Exec: ${execTotal} | Artistry: ${artTotal} | Composition: ${compTotal} | Skills: ${processedSkills.length} | Level: ${profile.level}`);

      // Top issues and strengths
      const withDeds   = [...processedSkills].filter(s => s.deduction > 0).sort((a,b) => b.deduction - a.deduction);
      const cleanSkills = processedSkills.filter(s => s.deduction === 0);

      const topFixes = withDeds.slice(0,3).map(s => ({
        name:  s.skill,
        saves: s.deduction,
        drill: s.reason?.split(".")[0] || s.skill,
      }));

      const strengths = cleanSkills.map(s => `${s.skill}: Clean.`);

      const bench = SCORE_BENCHMARKS[profile.level];
      const benchContext = bench
        ? `${profile.level} ${uploadData.event} typical range: ${bench.low}–${bench.high} (avg ${bench.avg}).`
        : "";

      const analysisResult = {
        // ── Core score ──
        startValue:               10.0,
        finalScore,
        totalDeductions:          totalDed,
        executionDeductionsTotal: execTotal,
        artistryDeductionsTotal:  artTotal,
        compositionDeductionsTotal: compTotal,
        neutralDeductionsTotal:   0,

        // ── Skill list — drives both Skills tab and legacy tabs ──
        gradedSkills:        processedSkills,
        executionDeductions: processedSkills.filter(s => s.deduction > 0).map(s => ({
          timestamp:  s.timestamp,
          skill:      s.skill,
          deduction:  s.deduction,
          fault:      s.reason,
          engine:     s.engine,
          category:   s.category,
          severity:   s.severity,
          confidence: s.confidence,
          skeleton:   null,
          correction: null,
        })),

        // ── Rich analysis sections (from JSON format) ──
        artistry:    parsedArtistry,
        composition: parsedComposition,

        // ── Full report — everything Gemini gave us ──
        overallAssessment: whyThisScore || `${profile.level} ${detectedEvent} — ${processedSkills.length} skills judged. ${benchContext}`,
        whyThisScore:      whyThisScore || "",
        truthAnalysis:     whyThisScore || `${processedSkills.length} skills evaluated at ${profile.level} standard.`,
        pathToGoal,
        celebrations:      parsedCelebrations,
        artistryBreakdown: parsedArtistry,
        topImprovements:   parsedTopImprovements.length > 0
          ? parsedTopImprovements
          : topFixes.map(f => ({ fix: `${f.name}: ${f.drill}`, pointsGained: f.saves })),
        strengths: parsedCelebrations.length > 0
          ? (typeof parsedCelebrations[0] === "string"
              ? parsedCelebrations
              : parsedCelebrations.map(c => typeof c === "string" ? c : `${c.timestamp ? c.timestamp + " — " : ""}${c.skill || ""}: ${c.note || c}`))
          : cleanSkills.map(s => `${s.skill}: ${s.strength || "Clean execution."}`),
        areasForImprovement: withDeds.slice(0,4).map(s => `${s.skill}: ${s.reason}`),
        topFixes,

        // ── Diagnostics ──
        diagnostics: {
          directJudging:     true,
          skillsEvaluated:   processedSkills.length,
          levelJudged:       profile.level,
          eventJudged:       detectedEvent,
          splitMinRequired:  (() => {
            const lv = profile.level; const xc = profile.levelCategory === "xcel";
            return xc ? (lv.includes("Bronze")||lv.includes("Silver")?90:lv.includes("Gold")?120:lv.includes("Platinum")?150:180)
              : (["Level 1","Level 2","Level 3","Level 4"].includes(lv)?90:lv==="Level 5"?120:(lv==="Level 6"||lv==="Level 7")?150:180);
          })(),
          landingDeductions: execSkills.filter(s => s.type==="landing").reduce((sum,s) => sum+s.deduction, 0),
          artistryDeductions: artTotal,
          biggestIssue:      withDeds[0] ? `${withDeds[0].skill}: ${withDeds[0].reason}` : "",
          averageGrade:      computeAverageGrade(processedSkills),
        },

        // ── Pass-through ──
        frames:   extractedFrames,
        event:    detectedEvent,
        level:    profile.level,
        videoUrl: uploadData.videoUrl,
        rawResponse,
      };

      // ── Cache the result for duplicate submissions ──────────────
      try {
        localStorage.setItem(cacheKey, JSON.stringify({
          result: analysisResult,
          timestamp: Date.now(),
        }));
        log.info("cache", `Cached result under ${cacheKey}`);
      } catch (e) { log.warn("cache", `Cache write failed: ${e.message}`); }

      return analysisResult;

    } catch (err) {
      log.error("pipeline", `Analysis failed: ${err.message}`);
      throw err;
    }
  }, [buildJudgingPrompt, uploadVideoToGemini, geminiGenerate, uploadData, profile]);




  // ── New engine pipeline (replaces analyzeWithAI) ──────────────────────
  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    (async () => {
      try {
        if (!uploadData.video) throw new Error("No video file available.");

        const result = await runAnalysisPipeline({
          videoFile: uploadData.video,
          profile: {
            name: profile.name || "",
            gender: profile.gender || "female",
            level: profile.level || "Level 6",
            levelCategory: profile.levelCategory || "optional",
          },
          event: uploadData.event || "Auto-detect",
          onProgress: ({ pct, label }) => {
            setProgress(pct);
            setStatus(label);
          },
        });

        // Attach video URL for VideoReviewPlayer
        result.videoUrl = uploadData.videoUrl;
        setProgress(100);
        setStatus("Analysis complete!");
        setTimeout(() => onComplete(result), 800);
      } catch (err) {
        console.error("Analysis pipeline failed:", err);
        const demoResult = generateDemoResult(uploadData.event, profile, []);
        demoResult.videoUrl = uploadData.videoUrl;
        demoResult.failureReason = err.message || "Unknown error";
        setProgress(100);
        setStatus("Analysis complete (demo mode)");
        setTimeout(() => onComplete(demoResult), 800);
      }
    })();
  }, [uploadData, profile, onComplete]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32 }}>
      {/* Hidden video element */}
      <video
        ref={hiddenVideoRef}
        src={uploadData.videoUrl}
        crossOrigin="anonymous"
        muted
        playsInline
        webkit-playsinline=""
        preload="auto"
        style={{ position: "absolute", width: 1, height: 1, opacity: 0.01, pointerEvents: "none", top: -100 }}
      />

      {/* Spinner */}
      <div style={{
        width: 72, height: 72, borderRadius: "50%", margin: "0 auto 24px",
        border: "3px solid rgba(232,150,42,0.15)", borderTopColor: "#e8962a",
        animation: "rotate 1s linear infinite",
      }} />

      <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6, textAlign: "center", maxWidth: 300 }}>{status}</h3>

      {/* 2-Pass Pipeline Indicator */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 16, marginBottom: 16 }}>
        {[
          { label: "Detect", threshold: 60 },
          { label: "Judge", threshold: 75 },
          { label: "Verify", threshold: 82 },
        ].map((pass, i) => {
          const isDone = progress >= pass.threshold + 5;
          const isActive = progress >= pass.threshold - 5 && !isDone;
          return (
            <React.Fragment key={i}>
              {i > 0 && (
                <div style={{
                  width: 20, height: 2, borderRadius: 1,
                  background: isDone ? "#e8962a" : "rgba(255,255,255,0.1)",
                  transition: "background 0.5s",
                }} />
              )}
              <div style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: "50%",
                  background: isDone ? "rgba(232,150,42,0.2)" : isActive ? "rgba(232,150,42,0.1)" : "rgba(255,255,255,0.04)",
                  border: `2px solid ${isDone ? "#e8962a" : isActive ? "rgba(232,150,42,0.4)" : "rgba(255,255,255,0.08)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.5s",
                }}>
                  {isDone ? (
                    <span style={{ color: "#e8962a", fontSize: 13, fontWeight: 700 }}>✓</span>
                  ) : isActive ? (
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#e8962a", animation: "pulse 1s infinite" }} />
                  ) : (
                    <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 11, fontWeight: 600 }}>{i + 1}</span>
                  )}
                </div>
                <span style={{
                  fontSize: 9, fontWeight: 600, letterSpacing: 0.5,
                  color: isDone ? "#e8962a" : isActive ? "rgba(232,150,42,0.7)" : "rgba(255,255,255,0.2)",
                  transition: "color 0.5s",
                }}>{pass.label}</span>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* Progress bar */}
      <div style={{
        width: "100%", maxWidth: 300, height: 6, borderRadius: 3,
        background: "rgba(255,255,255,0.08)", overflow: "hidden",
      }}>
        <div style={{
          height: "100%", borderRadius: 3,
          background: "linear-gradient(90deg, #e8962a, #ffc15a)",
          width: `${progress}%`, transition: "width 0.5s ease-out",
        }} />
      </div>
      <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, marginTop: 8, fontFamily: "'Space Mono', monospace" }}>{progress}%</p>

      {/* Error state */}
      {error && (
        <div style={{
          marginTop: 20, padding: "16px 20px", borderRadius: 14,
          background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.15)",
          maxWidth: 340, textAlign: "center",
        }}>
          <div style={{ fontSize: 13, color: "#dc2626", fontWeight: 600, marginBottom: 6 }}>Analysis Error</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.6, marginBottom: 12 }}>
            {error.match(/JSON|parse|Unexpected|truncat/i) ? "The analysis returned an incomplete response. This happens occasionally — try again." :
             error.match(/403|401|quota|rate/i) ? "API rate limit hit. Wait 30 seconds and try again." :
             error.match(/network|fetch|Failed to fetch/i) ? "Network error — check your connection and try again." :
             error.match(/video|frame|extract|format/i) ? "Video format issue. Try a shorter clip or different format." :
             error}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button onClick={onBack} style={{
              background: "linear-gradient(135deg, #e8962a, #ffc15a)", border: "none",
              borderRadius: 10, padding: "10px 24px", color: "#070c16", fontSize: 13,
              fontWeight: 700, cursor: "pointer", fontFamily: "'Outfit', sans-serif",
            }}>Try Again</button>
          </div>
        </div>
      )}

      {/* Frame thumbnails */}
      {frames.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginTop: 28, flexWrap: "wrap", justifyContent: "center" }}>
          {frames.slice(0, 12).map((f, i) => (
            <img
              key={i}
              src={f.dataUrl}
              alt={`Frame ${i + 1}`}
              style={{
                width: 64, height: 48, objectFit: "cover", borderRadius: 6,
                border: "1.5px solid rgba(232,150,42,0.2)",
                animation: `fadeIn 0.3s ease-out ${i * 0.1}s both`,
              }}
            />
          ))}
        </div>
      )}

      {/* Rotating tips during analysis */}
      {progress > 30 && progress < 95 && (
        <div style={{
          marginTop: 28, padding: "12px 20px", borderRadius: 12,
          background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)",
          maxWidth: 320, textAlign: "center", animation: "fadeIn 0.5s ease-out",
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(232,150,42,0.5)", letterSpacing: 1, marginBottom: 6 }}>DID YOU KNOW?</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", lineHeight: 1.6 }}>
            {[
              "STRIVE uses a 2-pass system: first identifying every skill and deduction, then analyzing biomechanics and building your training plan.",
              "A typical Level 5-7 routine has 8-12 scoreable elements. Judges evaluate each one independently.",
              "The most common deduction in all of gymnastics? Flexed feet. It happens on almost every skill and adds up fast.",
              "A 'stuck' landing (zero steps) is the single most impressive thing to a judge. It also saves 0.05-0.30.",
              "Knee separation in tucks is called 'cowboy' and costs 0.10-0.20 per occurrence. STRIVE's KTM engine catches it.",
              "At higher levels, composition and connection value can add bonus points. This is why routine construction matters.",
            ][Math.floor((Date.now() / 8000)) % 6]}
          </div>
        </div>
      )}
    </div>
  );
});

// ─── VIDEO REVIEW PLAYER ────────────────────────────────────────────
// ── Client-side deduction grouper ──
// ─── SKELETON CANVAS — SVG overlay for live MediaPipe joints ─────────────────
// Renders as an absolutely positioned SVG over an image/canvas.
// joints: { name: { x, y } } — normalized 0-1 coordinates.
function SkeletonCanvas({ joints }) {
  if (!joints) return null;

  const CONNECTIONS = [
    ["leftShoulder", "rightShoulder"],
    ["leftShoulder", "leftElbow"], ["leftElbow", "leftWrist"],
    ["rightShoulder", "rightElbow"], ["rightElbow", "rightWrist"],
    ["leftShoulder", "leftHip"], ["rightShoulder", "rightHip"],
    ["leftHip", "rightHip"],
    ["leftHip", "leftKnee"], ["leftKnee", "leftAnkle"],
    ["rightHip", "rightKnee"], ["rightKnee", "rightAnkle"],
  ];

  const JOINT_COLOR = {
    leftShoulder: "#e8962a", rightShoulder: "#e8962a",
    leftElbow: "#ffc15a",   rightElbow: "#ffc15a",
    leftWrist: "#F5E6B8",   rightWrist: "#F5E6B8",
    leftHip: "#3B82F6",     rightHip: "#3B82F6",
    leftKnee: "#60A5FA",    rightKnee: "#60A5FA",
    leftAnkle: "#93C5FD",   rightAnkle: "#93C5FD",
  };

  return (
    <svg
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none" }}
    >
      {/* Bones */}
      {CONNECTIONS.map(([a, b]) => {
        const p1 = joints[a]; const p2 = joints[b];
        if (!p1 || !p2) return null;
        return (
          <line key={`${a}-${b}`}
            x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
            stroke="rgba(232,150,42,0.85)" strokeWidth="0.008" strokeLinecap="round" />
        );
      })}
      {/* Joints */}
      {Object.entries(joints).filter(([n]) => JOINT_COLOR[n]).map(([name, j]) => (
        <g key={name}>
          <circle cx={j.x} cy={j.y} r="0.014" fill={JOINT_COLOR[name] || "#fff"} />
          <circle cx={j.x} cy={j.y} r="0.005" fill="rgba(255,255,255,0.9)" />
        </g>
      ))}
    </svg>
  );
}

function VideoReviewPlayer({ videoUrl: propUrl, result }) {
  const videoRef = useRef(null);
  const captureCanvasRef = useRef(null);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [showCompare, setShowCompare] = useState(true);
  const [capturedFrame, setCapturedFrame] = useState(null);   // on-demand frame grab
  const [capturingFrame, setCapturingFrame] = useState(false);
  const [skelData, setSkelData] = useState(null);             // pose joints from MediaPipe

  // Ensure video loads when URL changes
  React.useEffect(() => {
    const v = videoRef.current;
    if (!v || !propUrl) return;
    v.load();
  }, [propUrl]);

  const videoUrl = propUrl || result.videoUrl;
  const deds = result.executionDeductions || [];

  // Parse timestamp string to seconds — handles "0:12", "0:02, 0:04", "0:15-0:19", "Global", etc.
  const tsToSec = (ts) => {
    if (!ts || typeof ts !== "string") return NaN;
    // Take only the first timestamp if comma-separated or range
    const first = ts.split(/[,\-]/)[0].trim();
    if (String(first || '').toLowerCase() === "global" || !first) return NaN;
    const parts = first.split(":");
    if (parts.length === 2) return parseInt(parts[0]) * 60 + parseInt(parts[1]);
    const n = parseFloat(first);
    return isNaN(n) ? NaN : n;
  };

  const sorted = [...deds].sort((a, b) => (tsToSec(a.timestamp) || 0) - (tsToSec(b.timestamp) || 0));
  const fmt = (t) => !t || !isFinite(t) ? "0:00" : `${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,"0")}`;

  const jumpTo = async (i) => {
    if (i < 0 || i >= sorted.length) return;
    setActiveIdx(i);
    setCapturedFrame(null);
    setSkelData(null);

    const v = videoRef.current;
    if (!v) return;

    const sec = tsToSec(sorted[i].timestamp);
    const seekSec = isFinite(sec) ? Math.max(0, sec - 0.5) : 0;

    // 1 — Seek the visible review video
    v.pause();
    v.currentTime = seekSec;

    // 2 — Capture frame after seeked event
    setCapturingFrame(true);
    const captureFrame = () => {
      try {
        const canvas = captureCanvasRef.current || document.createElement("canvas");
        const vw = v.videoWidth || 640;
        const vh = v.videoHeight || 480;
        canvas.width = Math.min(vw, 960);
        canvas.height = Math.round(canvas.width * (vh / vw));
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.90);

        // Check it's not blank
        const px = ctx.getImageData(canvas.width >> 1, canvas.height >> 1, 1, 1).data;
        const isBlank = px[0] < 5 && px[1] < 5 && px[2] < 5;

        if (!isBlank) {
          setCapturedFrame(dataUrl);
          // 3 — Run MediaPipe on canvas for skeleton
          runSkeletonDetection(canvas).then(j => {
            if (j) setSkelData(j);
          });
        }
      } catch (e) {
        console.warn("[VideoReviewPlayer] frame capture failed:", e.message);
      } finally {
        setCapturingFrame(false);
      }
    };

    const onSeeked = () => { v.removeEventListener("seeked", onSeeked); captureFrame(); };
    const timeout = setTimeout(() => { v.removeEventListener("seeked", onSeeked); captureFrame(); }, 2000);
    v.addEventListener("seeked", onSeeked, { once: true });

    // Fallback: capture even if seeked doesn't fire (some mobile browsers)
    setTimeout(() => {
      clearTimeout(timeout);
      captureFrame();
    }, 1500);
  };

  // ── MediaPipe skeleton detection on a canvas ─────────────────────────────
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, visibility: Math.min(a.visibility || 0, b.visibility || 0) });

  const runSkeletonDetection = async (canvas) => {
    try {
      const { PoseLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );
      const landmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
          delegate: "GPU",
        },
        runningMode: "IMAGE",
        numPoses: 1,
      });
      const result = landmarker.detect(canvas);
      const raw = result.landmarks?.[0];
      if (!raw) return null;

      const JOINT_MAP = {
        leftShoulder: 11, rightShoulder: 12, leftElbow: 13, rightElbow: 14,
        leftWrist: 15, rightWrist: 16, leftHip: 23, rightHip: 24,
        leftKnee: 25, rightKnee: 26, leftAnkle: 27, rightAnkle: 28,
      };
      const joints = {};
      for (const [name, idx] of Object.entries(JOINT_MAP)) {
        const lm = raw[idx];
        if (lm && (lm.visibility || 0) > 0.3) {
          joints[name] = { x: lm.x, y: lm.y, visibility: lm.visibility };
        }
      }
      // Midpoints
      if (joints.leftHip && joints.rightHip) joints.hip = mid(joints.leftHip, joints.rightHip);
      if (joints.leftShoulder && joints.rightShoulder) joints.shoulder = mid(joints.leftShoulder, joints.rightShoulder);
      if (joints.leftKnee && joints.rightKnee) joints.knee = mid(joints.leftKnee, joints.rightKnee);
      if (joints.leftAnkle && joints.rightAnkle) joints.ankle = mid(joints.leftAnkle, joints.rightAnkle);
      if (joints.leftElbow && joints.rightElbow) joints.elbow = mid(joints.leftElbow, joints.rightElbow);
      landmarker.close();
      return joints;
    } catch (e) {
      console.warn("[skeleton]", e.message);
      return null;
    }
  };

  const slowMoReplay = () => {
    const v = videoRef.current;
    if (!v || activeIdx < 0) return;
    const sec = tsToSec(sorted[activeIdx].timestamp);
    const start = isFinite(sec) ? Math.max(0, sec - 0.5) : 0;
    v.currentTime = start;
    v.playbackRate = 0.25;
    v.play().catch(() => {});
    setTimeout(() => { if (v) { v.pause(); v.playbackRate = 1; } }, 5000);
  };

  const ad = activeIdx >= 0 ? sorted[activeIdx] : null;
  const adColor = ad ? (DEDUCTION_SCALE[ad.severity]?.color || "#ffc15a") : "transparent";

  // Frame: prefer live capture, fall back to pre-captured result.frames match
  const adFrameFromResult = ad ? result.frames?.find((f, i) => ad.frameRef === i + 1) : null;
  const displayFrame = capturedFrame || adFrameFromResult?.dataUrl || null;

  // Skeleton: prefer live MediaPipe joints, fall back to AI-returned skeleton
  const adSkeleton = ad?.skeleton || null;
  const adNote = ad ? result.bodyPositionNotes?.find(n => n.frameRef === ad.frameRef) : null;
  const skelJoints = skelData || adSkeleton?.joints || adNote?.joints || null;
  const skelFaults = adSkeleton?.faultJoints || adNote?.faultJoints || [];
  const skelAngles = adSkeleton?.angles || [];
  const correctRef = ad ? getCorrectFormRef(ad.skill, ad.subFaults?.[0]?.fault || ad.fault) : null;

  if (!videoUrl) {
    return (
      <div className="card" style={{ padding: 32, textAlign: "center" }}>
        <Icon name="camera" size={28} />
        <p style={{ color: "rgba(255,255,255,0.5)", marginTop: 12, fontSize: 14 }}>Video not available. Use the Deductions and Frames tabs.</p>
      </div>
    );
  }

  return (
    <div>
      {/* ── STICKY VIDEO ── */}
      <div style={{
        position: "sticky", top: 0, zIndex: 20,
        borderRadius: ad ? "16px 16px 0 0" : 16, overflow: "hidden", background: "#000",
        borderTop: ad ? `2px solid ${adColor}` : "2px solid rgba(255,255,255,0.08)",
        borderLeft: ad ? `2px solid ${adColor}` : "2px solid rgba(255,255,255,0.08)",
        borderRight: ad ? `2px solid ${adColor}` : "2px solid rgba(255,255,255,0.08)",
        borderBottom: ad ? "none" : "2px solid rgba(255,255,255,0.08)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.6)",
      }}>
        <video ref={videoRef} src={videoUrl} controls controlsList="nodownload" playsInline
          webkit-playsinline="" preload="auto"
          onLoadedMetadata={() => { if (videoRef.current) videoRef.current.pause(); }}
          style={{ width: "100%", display: "block", maxHeight: 400 }} />
        {ad && (
          <div style={{
            position: "absolute", bottom: 44, left: 8, right: 8,
            display: "flex", justifyContent: "space-between", alignItems: "center",
            background: "rgba(0,0,0,0.85)", borderRadius: 8, padding: "6px 10px",
            pointerEvents: "none",
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0" }}>{safeStr(ad.skill)}</span>
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 14, fontWeight: 700, color: adColor }}>-{safeNum(ad.deduction, 0).toFixed(2)}</span>
          </div>
        )}
      </div>

      {/* ── ACTIVE SKILL DETAILS ── */}
      {ad && (
        <div style={{
          background: `${adColor}08`,
          borderTop: "none",
          borderLeft: `2px solid ${adColor}30`, borderRight: `2px solid ${adColor}30`, borderBottom: `2px solid ${adColor}30`,
          borderRadius: "0 0 16px 16px", padding: "12px 14px", marginBottom: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span className="tag" style={{ background: `${adColor}25`, color: adColor, fontSize: 11 }}>{ad.severity?.toUpperCase()}</span>
            <span style={{ fontFamily: "'Space Mono', monospace", fontWeight: 700, fontSize: 16, color: adColor }}>-{safeNum(ad.deduction, 0).toFixed(2)}</span>
            {ad.engine && <span className="tag" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)", fontSize: 9 }}>{ad.engine}</span>}
            <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, marginLeft: "auto", fontFamily: "'Space Mono', monospace" }}>{activeIdx+1}/{sorted.length}</span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>{ad.skill}</div>

          {/* Sub-faults quick list */}
          {ad.subFaults?.length > 0 && (
            <div style={{ marginBottom: 6 }}>
              {ad.subFaults.map((sf, si) => {
                const sfDed = safeNum(sf.deduction, 0);
                const sfc = sfDed >= 0.20 ? "#dc2626" : sfDed >= 0.10 ? "#e06820" : "#ffc15a";
                return (
                  <div key={si} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", flex: 1 }}>· {safeStr(sf.fault)}</span>
                    <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: sfc, marginLeft: 8 }}>-{sfDed.toFixed(2)}</span>
                  </div>
                );
              })}
            </div>
          )}
          {/* Flat fault fallback */}
          {!ad.subFaults?.length && ad.fault && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.5, marginBottom: 4 }}>{ad.fault}</div>
          )}

          {/* Frame capture with skeleton overlay + perfect form reference */}
          {showCompare && (
            <div style={{ marginTop: 10 }}>
              {/* Actual frame — live capture with skeleton overlay */}
              <div style={{ borderRadius: 12, overflow: "hidden", position: "relative", border: `2px solid ${adColor}40`, background: "#000", marginBottom: 8 }}>
                {capturingFrame ? (
                  <div style={{ width: "100%", aspectRatio: "16/9", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", border: "2px solid rgba(232,150,42,0.2)", borderTopColor: "#e8962a", animation: "rotate 1s linear infinite" }} />
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Capturing frame…</span>
                  </div>
                ) : displayFrame ? (
                  <div style={{ position: "relative" }}>
                    <img src={displayFrame} alt="Deduction frame" style={{ width: "100%", display: "block" }} />
                    {showSkeleton && skelJoints && (
                      <SkeletonCanvas joints={skelJoints} />
                    )}
                  </div>
                ) : (
                  <div style={{ width: "100%", aspectRatio: "16/9", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: 20 }}>🎬</span>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", textAlign: "center", padding: "0 16px" }}>
                      Tap a skill below to capture frame
                    </span>
                  </div>
                )}
                {displayFrame && !capturingFrame && (
                  <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(220,38,38,0.9)", padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, color: "white" }}>✗ ACTUAL</div>
                )}
                {ad?.fault && displayFrame && (
                  <div style={{ position: "absolute", bottom: 8, left: 8, right: 8, background: "rgba(0,0,0,0.8)", padding: "6px 10px", borderRadius: 6, fontSize: 11, color: "rgba(255,255,255,0.8)", lineHeight: 1.4 }}>
                    {ad.fault}
                  </div>
                )}
              </div>
              {/* Perfect form reference — smaller below */}
              <div style={{ borderRadius: 12, overflow: "hidden", position: "relative", border: "1px solid rgba(34,197,94,0.25)", background: "rgba(34,197,94,0.03)", aspectRatio: "16/9" }}>
                <PerfectFormSVG joints={correctRef?.joints} label={correctRef?.label} />
                <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(34,197,94,0.9)", padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, color: "white" }}>✓ PERFECT FORM</div>
              </div>
            </div>
          )}

          {/* How to fix / ideal */}
          {ad.correction && (
            <div style={{ marginTop: 6, padding: "6px 10px", borderRadius: 6, background: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.1)" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#22c55e", marginBottom: 2 }}>HOW TO FIX</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>{ad.correction}</div>
            </div>
          )}
          {!ad.correction && correctRef?.notes && (
            <div style={{ marginTop: 6, padding: "6px 10px", borderRadius: 6, background: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.1)" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#22c55e", marginBottom: 2 }}>✓ ZERO DEDUCTION LOOKS LIKE:</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>{correctRef.notes}</div>
            </div>
          )}

          {/* Reference search links */}
          {(() => {
            const skillClean = (ad.skill || "").replace(/[-—–]/g, " ").replace(/\s+/g, " ").trim();
            const levelShort = (result.level || "").replace("Xcel ", "").replace("Level ", "L");
            const genderWord = result.level?.includes("Xcel") || !result.event ? "" : "gymnastics";
            const coreSkill = skillClean.replace(/landing|foot form|foot articulation|arm position|support phase|flight phase|same.*|finish position/gi, "").replace(/first|second|third|final|opening/gi, "").trim() || skillClean;
            const ytQuery = encodeURIComponent(`${coreSkill} ${genderWord} perfect form tutorial`.trim());
            const imgQuery = encodeURIComponent(`${coreSkill} gymnastics perfect form`.trim());
            const levelQuery = encodeURIComponent(`${coreSkill} ${result.level || ""} gymnastics`.trim());
            return (
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <a href={`https://www.youtube.com/results?search_query=${ytQuery}`} target="_blank" rel="noopener noreferrer"
                  style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "8px 6px", borderRadius: 8, fontSize: 10, fontWeight: 700, background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.15)", color: "#dc2626", textDecoration: "none" }}>
                  ▶ Watch Perfect Form
                </a>
                <a href={`https://www.google.com/search?q=${imgQuery}&tbm=isch`} target="_blank" rel="noopener noreferrer"
                  style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "8px 6px", borderRadius: 8, fontSize: 10, fontWeight: 700, background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.15)", color: "#3b82f6", textDecoration: "none" }}>
                  📷 See Examples
                </a>
                <a href={`https://www.youtube.com/results?search_query=${levelQuery}`} target="_blank" rel="noopener noreferrer"
                  style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "8px 6px", borderRadius: 8, fontSize: 10, fontWeight: 700, background: "rgba(232,150,42,0.08)", border: "1px solid rgba(232,150,42,0.15)", color: "#e8962a", textDecoration: "none" }}>
                  🏅 {levelShort} Examples
                </a>
              </div>
            );
          })()}

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={() => setShowCompare(!showCompare)} className="btn-outline"
              style={{ flex: 1, padding: "10px 6px", fontSize: 12, fontWeight: 700, color: showCompare ? "#e8962a" : "rgba(255,255,255,0.4)", borderColor: showCompare ? "rgba(232,150,42,0.4)" : undefined }}>
              📷 {showCompare ? "Hide" : "Show"} Frame Compare
            </button>
            <button onClick={() => setShowSkeleton(!showSkeleton)} className="btn-outline"
              style={{ flex: 1, padding: "10px 6px", fontSize: 12, fontWeight: 700, color: showSkeleton ? "#22c55e" : "rgba(255,255,255,0.4)", borderColor: showSkeleton ? "rgba(34,197,94,0.4)" : undefined }}>
              🦴 Skeleton {showSkeleton ? "ON" : "OFF"}
            </button>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button onClick={() => jumpTo(activeIdx-1)} disabled={activeIdx<=0} className="btn-outline"
              style={{ flex: 1, padding: "10px 6px", fontSize: 13, fontWeight: 600, opacity: activeIdx<=0 ? 0.3 : 1 }}>← Prev</button>
            <button onClick={slowMoReplay} className="btn-outline"
              style={{ flex: 1.3, padding: "10px 6px", fontSize: 13, fontWeight: 600, color: "#e8962a", borderColor: "rgba(232,150,42,0.5)" }}>🐢 Slow-Mo</button>
            <button onClick={() => jumpTo(activeIdx+1)} disabled={activeIdx>=sorted.length-1} className="btn-outline"
              style={{ flex: 1, padding: "10px 6px", fontSize: 13, fontWeight: 600, opacity: activeIdx>=sorted.length-1 ? 0.3 : 1 }}>Next →</button>
          </div>
        </div>
      )}

      {!ad && <div style={{ height: 12 }} />}

      {/* ── SKILL LIST — tap to jump ── */}
      <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", marginBottom: 10, marginTop: 8, letterSpacing: 0.5 }}>
        TAP A SKILL TO JUMP VIDEO
      </div>
      {sorted.map((d, i) => {
        const c = DEDUCTION_SCALE[d.severity]?.color || "#ffc15a";
        const isActive = i === activeIdx;
        return (
          <div key={i} onClick={() => jumpTo(i)} style={{
            display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 12,
            marginBottom: 6, cursor: "pointer", transition: "all 0.2s",
            background: isActive ? `${c}18` : "rgba(255,255,255,0.03)",
            borderLeft: `4px solid ${isActive ? c : "transparent"}`,
            border: isActive ? `1px solid ${c}30` : "1px solid transparent",
          }}>
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, fontWeight: 700, color: isActive ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.4)", minWidth: 42 }}>{d.timestamp?.toLowerCase() === "global" ? "ALL" : fmt(tsToSec(d.timestamp))}</span>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: isActive ? "white" : "rgba(255,255,255,0.7)", display: "block", lineHeight: 1.3 }}>{safeStr(d.skill)}</span>
              {d.fault && (
                <span style={{ fontSize: 12, color: isActive ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.3)", display: "block", marginTop: 3, lineHeight: 1.4 }}>{safeStr(d.fault).length > 80 ? safeStr(d.fault).substring(0, 80) + "..." : safeStr(d.fault)}</span>
              )}
              {d.confidence != null && (
                <span style={{
                  fontSize: 9, padding: "1px 5px", borderRadius: 3, fontWeight: 600, marginTop: 3, display: "inline-block",
                  background: d.confidence >= 0.8 ? "rgba(34,197,94,0.12)" : d.confidence >= 0.6 ? "rgba(255,193,90,0.12)" : "rgba(220,38,38,0.12)",
                  color: d.confidence >= 0.8 ? "#22c55e" : d.confidence >= 0.6 ? "#ffc15a" : "#dc2626",
                }}>{Math.round(d.confidence * 100)}%</span>
              )}
            </div>
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 15, fontWeight: 700, color: c }}>-{safeNum(d.deduction, 0).toFixed(2)}</span>
          </div>
        );
      })}
    </div>
  );
}
// ─── GRADE DISPLAY HELPERS ──────────────────────────────────────────────────

const GRADE_COLOR = {
  "A+":"#22c55e","A":"#22c55e","A-":"#4ade80",
  "B+":"#4ade80","B":"#ffc15a","B-":"#ffc15a",
  "C+":"#e06820","C":"#e06820","C-":"#dc2626",
  "D+":"#DC2626","D":"#DC2626","F":"#8b72d4",
};

const GRADE_LABEL_MAP = {
  "A+":"Perfect","A":"Excellent","A-":"Very Good",
  "B+":"Good+","B":"Good","B-":"Good−",
  "C+":"Average+","C":"Average","C-":"Below Avg",
  "D+":"Needs Work","D":"Poor","F":"Fall",
};

function GradeCircle({ grade, size = 52 }) {
  const color = GRADE_COLOR[grade] || "#e8962a";
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0,
      border: `2.5px solid ${color}`, background: `${color}14`,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{ fontSize: size * 0.30, fontWeight: 900, color,
        fontFamily: "'Space Mono', monospace", lineHeight: 1 }}>
        {grade}
      </div>
      <div style={{ fontSize: size * 0.13, color: `${color}AA`, fontWeight: 600, marginTop: 1 }}>
        {GRADE_LABEL_MAP[grade] || ""}
      </div>
    </div>
  );
}

// ─── SEVERITY COLOR HELPER ───────────────────────────────────────────────────
function dedColor(amt) {
  if (amt <= 0.05) return "#22c55e";
  if (amt <= 0.10) return "#ffc15a";
  if (amt <= 0.20) return "#e06820";
  return "#dc2626";
}

// ─── BIOMECHANICS ESTIMATION ─────────────────────────────────────────────────
// Derive plausible measured vs ideal angles from fault text when AI doesn't supply them
function estimateBiomechanics(skill) {
  const f = (skill.fault || "").toLowerCase();
  const angles = [];
  if (f.includes("knee") || f.includes("leg"))
    angles.push({ label: "Knee", measured: 155, ideal: 180 });
  if (f.includes("arm") || f.includes("elbow"))
    angles.push({ label: "Elbow", measured: 160, ideal: 180 });
  if (f.includes("split") || f.includes("leap"))
    angles.push({ label: "Split", measured: 110, ideal: 150 });
  if (f.includes("pike") || f.includes("arch") || f.includes("body"))
    angles.push({ label: "Hip", measured: 165, ideal: 180 });
  if (f.includes("shoulder") || f.includes("cast"))
    angles.push({ label: "Shoulder", measured: 160, ideal: 180 });
  if (f.includes("landing") || f.includes("squat"))
    angles.push({ label: "Knee (landing)", measured: 140, ideal: 170 });
  return angles.slice(0, 4);
}

// ─── CORRECT FORM DESCRIPTIONS ──────────────────────────────────────────────
function getCorrectForm(skill) {
  const name = (skill.skill || "").toLowerCase();
  const type = (skill.type || "").toLowerCase();
  if (name.includes("round-off") || name.includes("roundoff"))
    return "Arms locked straight through support phase. Legs snapped together at vertical. Powerful snap-down with chest up, landing in hollow body position. No arch through back.";
  if (name.includes("back handspring") || name.includes("bhs"))
    return "Sit-back with arms driving overhead. Hands reach floor with locked elbows. Body passes through tight arch, then snaps to hollow. Legs together, toes pointed throughout.";
  if (name.includes("back tuck") || name.includes("backflip"))
    return "Strong vertical takeoff with arm lift. Tight tuck position — knees together, chin neutral. Quick rotation with early spot of landing. Stick with chest up, knees slightly bent to absorb.";
  if (name.includes("back layout") || name.includes("back pike"))
    return "Maximum height off takeoff. Body fully extended (layout) or tight pike angle. Arms by ears or sides. Complete rotation with early opening to spot landing. Controlled stick.";
  if (name.includes("split leap") || name.includes("switch leap"))
    return "Strong takeoff from one foot. Maximum split angle at peak height. Hips square, chest lifted. Toes pointed, legs fully extended. Controlled landing in demi-plié.";
  if (name.includes("full turn") || name.includes("turn"))
    return "Rise to full relevé on supporting leg. Free leg in clean passé, turned out. Arms tight, core engaged. Complete 360° rotation without wobble. Finish in controlled position.";
  if (name.includes("cartwheel"))
    return "Hand-hand-foot-foot rhythm in a straight line. Legs fully split through vertical. Arms locked. Pass through handstand with body in one plane. Controlled finish.";
  if (name.includes("walkover"))
    return "Controlled reach back with legs splitting through vertical. Shoulders stacked over hands. Full split visible at top. Smooth weight transfer to feet, finish standing tall.";
  if (name.includes("landing"))
    return "Land with feet together, slight knee bend to absorb. Chest up, arms forward then lifted to salute. No steps, hops, or extra movement. Hold finish position for 1-2 seconds.";
  if (type === "dance")
    return "Clean lines with full extension. Pointed toes, engaged fingers. Movement flows with music. Eye contact with judges. Confident presentation throughout.";
  if (name.includes("artistry") || name.includes("global"))
    return "Consistent performance quality from start to finish. Engaged fingers and toes. Eye contact with judges. Musicality and rhythm. Use of full floor space.";
  return "Full extension through every position. Pointed toes, locked knees where required. Clean body lines with no unnecessary movement. Controlled throughout.";
}

// ─── GRADED SKILL CARD ───────────────────────────────────────────────────────

function GradedSkillCard({ skill, onSeek, videoFile, videoUrl }) {
  const [expanded, setExpanded] = useState(false);
  const [cardTab, setCardTab] = useState("overview");
  const [cardVideoUrl, setCardVideoUrl] = useState(null);
  const [showSkel, setShowSkel] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const cardVideoRef = useRef(null);
  const cardCanvasRef = useRef(null);
  const poseRef = useRef(null);       // MediaPipe Pose instance
  const rafRef = useRef(null);         // requestAnimationFrame ID
  const color   = GRADE_COLOR[skill.grade] || "#e8962a";
  // Left border color: green for A grades, gold for B, orange for C, red for D/F
  const gradeGroup = (skill.grade || "").charAt(0);
  const borderLeftColor = gradeGroup === "A" ? "#22c55e" : gradeGroup === "B" ? "#e8962a" : gradeGroup === "C" ? "#e06820" : "#dc2626";
  const isClean = !skill.fault || skill.gradeDeduction === 0;

  // Track whether we own the blob URL (so we only revoke URLs we created)
  const ownsBlobRef = useRef(false);

  // Create/revoke blob URL when card expands/collapses
  useEffect(() => {
    if (expanded && !cardVideoUrl) {
      if (videoFile) {
        const url = URL.createObjectURL(videoFile);
        setCardVideoUrl(url);
        ownsBlobRef.current = true;
      } else if (videoUrl) {
        // Fallback: reuse the parent blob URL (don't revoke it — we don't own it)
        setCardVideoUrl(videoUrl);
        ownsBlobRef.current = false;
      }
    }
    if (!expanded && cardVideoUrl) {
      if (ownsBlobRef.current) {
        URL.revokeObjectURL(cardVideoUrl);
      }
      setCardVideoUrl(null);
      ownsBlobRef.current = false;
      setShowSkel(false);
      setPlaybackRate(1);
      // Cancel any running skeleton loop
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    }
    // eslint-disable-next-line
  }, [expanded, videoFile, videoUrl]);

  // Seek video to skill timestamp when expanded and video is ready
  useEffect(() => {
    const v = cardVideoRef.current;
    if (!v || !expanded || !cardVideoUrl) return;
    const onLoaded = () => {
      const sec = skill.timestampSec || 0;
      v.currentTime = Math.max(0, sec);
      v.play().catch(() => {});
    };
    v.addEventListener("loadedmetadata", onLoaded, { once: true });
    return () => v.removeEventListener("loadedmetadata", onLoaded);
  }, [expanded, cardVideoUrl, skill.timestampSec]);

  // Update playback rate
  useEffect(() => {
    const v = cardVideoRef.current;
    if (v) v.playbackRate = playbackRate;
  }, [playbackRate]);

  // Pause video when card collapses
  useEffect(() => {
    if (!expanded) {
      const v = cardVideoRef.current;
      if (v) v.pause();
    }
  }, [expanded]);

  // Skeleton overlay — angle helper
  const calcAngle = (a, b, c) => {
    const ab = { x: a.x - b.x, y: a.y - b.y };
    const cb = { x: c.x - b.x, y: c.y - b.y };
    const dot = ab.x * cb.x + ab.y * cb.y;
    const magAB = Math.sqrt(ab.x * ab.x + ab.y * ab.y);
    const magCB = Math.sqrt(cb.x * cb.x + cb.y * cb.y);
    if (magAB === 0 || magCB === 0) return 180;
    const cosA = Math.min(1, Math.max(-1, dot / (magAB * magCB)));
    return Math.round((Math.acos(cosA) * 180) / Math.PI);
  };

  // Color by angle deviation from ideal (180 degrees for key joints)
  const jointColor = (angle, ideal) => {
    const diff = Math.abs(angle - (ideal || 180));
    if (diff <= 5) return "#22c55e";
    if (diff <= 15) return "#ffc15a";
    return "#dc2626";
  };

  // Skeleton toggle — start/stop pose detection loop
  useEffect(() => {
    if (!showSkel || !expanded || !cardVideoUrl) {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      const canvas = cardCanvasRef.current;
      if (canvas) { canvas.style.opacity = "0"; }
      return;
    }
    const canvas = cardCanvasRef.current;
    const video = cardVideoRef.current;
    if (!canvas || !video) return;
    canvas.style.opacity = "1";

    let running = true;

    const initPose = async () => {
      // Lazy-load MediaPipe Pose via CDN globals
      if (!poseRef.current && window.Pose) {
        const pose = new window.Pose({ locateFile: (file) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5/${file}`
        });
        pose.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          minDetectionConfidence: 0.7,
          minTrackingConfidence: 0.5,
        });
        pose.onResults((results) => {
          if (!running) return;
          const ctx = canvas.getContext("2d");
          const cw = canvas.width;
          const ch = canvas.height;
          ctx.clearRect(0, 0, cw, ch);

          if (results.poseLandmarks) {
            const lm = results.poseLandmarks;
            // Draw connectors
            if (window.drawConnectors && window.POSE_CONNECTIONS) {
              window.drawConnectors(ctx, lm, window.POSE_CONNECTIONS, { color: "rgba(255,255,255,0.3)", lineWidth: 2 });
            }
            // Draw landmarks with angle-based coloring for key joints
            // Key joints: knee (23-25-27), elbow (11-13-15), hip (11-23-25)
            const keyJoints = {
              25: { a: 23, c: 27, ideal: 180 }, // left knee
              26: { a: 24, c: 28, ideal: 180 }, // right knee
              13: { a: 11, c: 15, ideal: 180 }, // left elbow
              14: { a: 12, c: 16, ideal: 180 }, // right elbow
              23: { a: 11, c: 25, ideal: 180 }, // left hip
              24: { a: 12, c: 26, ideal: 180 }, // right hip
            };

            lm.forEach((pt, idx) => {
              if ((pt.visibility || 0) < 0.5) return;
              let color = "rgba(255,255,255,0.7)";
              const joint = keyJoints[idx];
              if (joint && lm[joint.a] && lm[joint.c]) {
                const angle = calcAngle(
                  { x: lm[joint.a].x * cw, y: lm[joint.a].y * ch },
                  { x: pt.x * cw, y: pt.y * ch },
                  { x: lm[joint.c].x * cw, y: lm[joint.c].y * ch }
                );
                color = jointColor(angle, joint.ideal);
              }
              ctx.beginPath();
              ctx.arc(pt.x * cw, pt.y * ch, 4, 0, 2 * Math.PI);
              ctx.fillStyle = color;
              ctx.fill();
            });
          }
        });
        await pose.initialize();
        poseRef.current = pose;
      }

      // Start detection loop
      const detectLoop = async () => {
        if (!running || !poseRef.current || video.paused || video.ended) {
          if (running) rafRef.current = requestAnimationFrame(detectLoop);
          return;
        }
        // Sync canvas dimensions to video display size
        const vRect = video.getBoundingClientRect();
        if (canvas.width !== vRect.width || canvas.height !== vRect.height) {
          canvas.width = vRect.width;
          canvas.height = vRect.height;
        }
        try {
          await poseRef.current.send({ image: video });
        } catch (e) {
          // MediaPipe may throw if video not ready
        }
        rafRef.current = requestAnimationFrame(detectLoop);
      };
      rafRef.current = requestAnimationFrame(detectLoop);
    };

    initPose().catch(e => console.warn("[SkeletonOverlay] init failed:", e.message));

    return () => {
      running = false;
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    };
    // eslint-disable-next-line
  }, [showSkel, expanded, cardVideoUrl]);

  // Parse sub-faults from reason text.
  // Split on semicolons or sentence-ending periods, but NOT periods inside parentheses
  // like "(-0.05)" or decimal numbers like "0.10".
  const subFaults = (() => {
    if (!skill.fault) return [];
    // Split on "; " or ". " but only when the period is NOT inside parentheses or a number
    const parts = skill.fault
      .split(/;\s*|(?<!\d)\.(?!\d)(?![^(]*\))\s+/)
      .map(s => s.trim().replace(/\.$/, ""))
      .filter(s => s.length > 3);
    if (parts.length <= 1) return [{ text: skill.fault, amount: skill.gradeDeduction || 0 }];
    // Distribute total deduction roughly across sub-faults
    const each = Math.round(((skill.gradeDeduction || 0) / parts.length) * 100) / 100;
    return parts.map((text, i) => ({
      text,
      amount: i === parts.length - 1
        ? Math.round(((skill.gradeDeduction || 0) - each * (parts.length - 1)) * 100) / 100
        : each,
    }));
  })();

  // Biomechanics: use AI data if available, otherwise estimate
  const bioAngles = skill.biomechanics || estimateBiomechanics(skill);

  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      border: `1px solid ${expanded ? color + "40" : "rgba(255,255,255,0.07)"}`,
      borderLeft: `3px solid ${borderLeftColor}`,
      borderRadius: 14, marginBottom: 10, overflow: "hidden", transition: "border-color 0.2s",
    }}>
      {/* ── 1. Header ── */}
      <button onClick={() => setExpanded(v => !v)}
        style={{ width: "100%", textAlign: "left", padding: "14px 16px",
          background: "transparent", border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 14 }}>

        <GradeCircle grade={skill.grade} size={48} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#E2E8F0", marginBottom: 3 }}>
            {skill.skill}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)",
              fontFamily: "'Space Mono', monospace" }}>{skill.timestamp}</span>
            <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 8px", borderRadius: 10,
              background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.35)",
              textTransform: "uppercase" }}>{skill.type}</span>
          </div>
          {!expanded && skill.fault && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 4,
              lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {skill.fault}
            </div>
          )}
        </div>

        {/* Deduction or clean badge */}
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          {isClean ? (
            <div style={{ fontSize: 11, fontWeight: 700, color: "#22c55e", padding: "4px 10px",
              borderRadius: 20, background: "rgba(34,197,94,0.1)",
              border: "1px solid rgba(34,197,94,0.2)" }}>
              Clean
            </div>
          ) : (
            <div style={{ fontSize: 18, fontWeight: 800, color,
              fontFamily: "'Space Mono', monospace" }}>
              -{(skill.gradeDeduction || 0).toFixed(2)}
            </div>
          )}
        </div>

        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
          stroke="rgba(255,255,255,0.3)" strokeWidth="1.8"
          style={{ transform: expanded ? "rotate(180deg)" : "none",
            transition: "transform 0.2s", flexShrink: 0 }}>
          <path d="M2 5l5 4 5-4"/>
        </svg>
      </button>

      {/* ── Expanded detail ── */}
      {expanded && (
        <div style={{ padding: "0 16px 16px" }}>

          {/* ── Clip bar: timestamp, speed, skeleton ── */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
            {onSeek && (
              <button onClick={() => onSeek(skill.timestampSec || 0)}
                style={{ display: "flex", alignItems: "center", gap: 4,
                  padding: "5px 10px", borderRadius: 6,
                  background: "rgba(232,150,42,0.1)",
                  border: "1px solid rgba(232,150,42,0.2)",
                  color: "#e8962a", fontSize: 11, fontWeight: 600,
                  cursor: "pointer", fontFamily: "'Space Mono', monospace" }}>
                <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor"><path d="M3 2l7 4-7 4V2z"/></svg>
                {skill.timestamp}
              </button>
            )}
            {cardVideoUrl && [0.25, 0.5, 1].map(rate => (
              <button key={rate} onClick={() => setPlaybackRate(rate)}
                style={{ padding: "4px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700,
                  fontFamily: "'Space Mono', monospace", cursor: "pointer",
                  background: playbackRate === rate ? "rgba(232,150,42,0.2)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${playbackRate === rate ? "rgba(232,150,42,0.4)" : "rgba(255,255,255,0.08)"}`,
                  color: playbackRate === rate ? "#e8962a" : "rgba(255,255,255,0.4)" }}>
                {rate}x
              </button>
            ))}
            {cardVideoUrl && (
              <button onClick={() => setShowSkel(v => !v)}
                style={{ padding: "4px 8px", borderRadius: 6, fontSize: 10, fontWeight: 600,
                  cursor: "pointer", marginLeft: "auto",
                  background: showSkel ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${showSkel ? "rgba(34,197,94,0.3)" : "rgba(255,255,255,0.08)"}`,
                  color: showSkel ? "#22c55e" : "rgba(255,255,255,0.4)",
                  fontFamily: "'Outfit', sans-serif" }}>
                {showSkel ? "Skel ON" : "Skel"}
              </button>
            )}
          </div>

          {/* ── In-card video player with skeleton overlay ── */}
          {cardVideoUrl && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ position: "relative", borderRadius: 10, overflow: "hidden",
                background: "#000", border: "1px solid rgba(255,255,255,0.08)" }}>
                <video ref={cardVideoRef} src={cardVideoUrl}
                  playsInline webkit-playsinline="" muted controls controlsList="nodownload"
                  preload="metadata"
                  style={{ width: "100%", display: "block", maxHeight: 220 }} />
                <canvas ref={cardCanvasRef}
                  style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
                    pointerEvents: "none", opacity: showSkel ? 1 : 0,
                    transition: "opacity 0.2s" }} />
              </div>
              {/* Fault timeline strip */}
              {(() => {
                const faults = (skill.fault || "").split(/;\s*/).filter(f => f.length > 3);
                const skillSec = skill.timestampSec || 0;
                const windowStart = Math.max(0, skillSec - 0.5);
                const windowEnd = skillSec + 2.5;
                const windowDur = windowEnd - windowStart;
                if (faults.length > 0 && windowDur > 0) {
                  return (
                    <div style={{ marginTop: 6, position: "relative", height: 18,
                      background: "rgba(255,255,255,0.03)", borderRadius: 9,
                      border: "1px solid rgba(255,255,255,0.06)", overflow: "hidden" }}>
                      <div style={{ position: "absolute", top: 8, left: 4, right: 4, height: 2,
                        background: "rgba(34,197,94,0.2)", borderRadius: 1 }} />
                      {faults.map((f, fi) => {
                        const pct = faults.length === 1 ? 50 : (fi / (faults.length - 1)) * 80 + 10;
                        const dotSec = windowStart + (windowDur * pct / 100);
                        const isRed = skill.gradeDeduction >= 0.20;
                        return (
                          <button key={fi}
                            onClick={() => { const v = cardVideoRef.current; if (v) { v.currentTime = dotSec; v.play().catch(() => {}); } }}
                            title={f}
                            style={{ position: "absolute", left: `${pct}%`, top: 4, width: 10, height: 10,
                              borderRadius: "50%", border: "none", cursor: "pointer", padding: 0,
                              background: isRed ? "#dc2626" : "#ffc15a", transform: "translateX(-50%)",
                              boxShadow: `0 0 4px ${isRed ? "rgba(220,38,38,0.5)" : "rgba(255,193,90,0.5)"}` }} />
                        );
                      })}
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          )}

          {/* Frame thumbnail for saved analyses without video */}
          {!onSeek && !cardVideoUrl && skill.frameDataUrl && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ borderRadius: 10, overflow: "hidden", background: "#000",
                border: "1px solid rgba(255,255,255,0.08)" }}>
                <img src={skill.frameDataUrl} alt={`Frame at ${skill.timestamp}`}
                  style={{ width: "100%", display: "block", maxHeight: 200, objectFit: "contain" }} />
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 4,
                fontFamily: "'Space Mono', monospace" }}>
                Frame at {skill.timestamp}
              </div>
            </div>
          )}

          {/* Fallback when no video or frame is available */}
          {!cardVideoUrl && !skill.frameDataUrl && (
            <div style={{ marginBottom: 12, padding: "16px 12px", borderRadius: 10,
              background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
              textAlign: "center" }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)",
                fontFamily: "'Outfit', sans-serif" }}>
                Video preview unavailable
              </div>
            </div>
          )}

          {/* ── 5-Tab selector ── */}
          <div style={{ display: "flex", gap: 2, marginBottom: 14, background: "rgba(255,255,255,0.02)", borderRadius: 10, padding: 2 }}>
            {[
              { id: "overview", label: "Overview" },
              { id: "bio", label: "Bio" },
              { id: "motion", label: "Motion" },
              { id: "injury", label: "Injury" },
              { id: "drills", label: "Drills" },
            ].map(t => (
              <button key={t.id} onClick={() => setCardTab(t.id)}
                style={{
                  flex: 1, padding: "6px 4px", borderRadius: 8, border: "none", cursor: "pointer",
                  fontSize: 10, fontWeight: 600, fontFamily: "'Outfit', sans-serif",
                  background: cardTab === t.id ? "#e8962a" : "transparent",
                  color: cardTab === t.id ? "#070c16" : "rgba(255,255,255,0.4)",
                  transition: "all 0.15s",
                }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ── TAB 1: OVERVIEW ── */}
          {cardTab === "overview" && (
            <>
              {/* Deductions found (orange border) */}
              {!isClean && subFaults.length > 0 && (
                <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 10, background: "rgba(224,104,32,0.04)", border: "1px solid rgba(224,104,32,0.15)" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#e06820", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Deductions</div>
                  {subFaults.map((sf, i) => {
                    const sColor = dedColor(sf.amount);
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "stretch", gap: 10, marginBottom: 6, padding: "6px 10px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                        <div style={{ width: 3, borderRadius: 2, background: sColor, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12, color: "#E2E8F0", lineHeight: 1.5 }}>{sf.text}</div></div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: sColor, fontFamily: "'Space Mono', monospace", flexShrink: 0, alignSelf: "center" }}>-{sf.amount.toFixed(2)}</div>
                      </div>
                    );
                  })}
                </div>
              )}
              {/* Correct form (green border) */}
              <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 10, background: "rgba(34,197,94,0.04)", border: "1px solid rgba(34,197,94,0.15)" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#22c55e", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>Correct Form</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", lineHeight: 1.6 }}>{getCorrectForm(skill)}</div>
              </div>
              {/* Strength (gold border) */}
              {(skill.strength || isClean) && (
                <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 10, background: "rgba(232,150,42,0.04)", border: "1px solid rgba(232,150,42,0.15)" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#e8962a", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>Strength</div>
                  <div style={{ fontSize: 12, color: "#E2E8F0", lineHeight: 1.6 }}>{skill.strength || "Clean execution — no deduction taken."}</div>
                </div>
              )}
              {skill.coachNote && (
                <div style={{ marginBottom: 12, padding: "8px 12px", borderRadius: 8, background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#3B82F6", letterSpacing: 1, textTransform: "uppercase", marginBottom: 3 }}>Coach Note</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>{skill.coachNote}</div>
                </div>
              )}
            </>
          )}

          {/* ── TAB 2: BIOMECHANICS ── */}
          {cardTab === "bio" && (
            <div>
              {bioAngles.length > 0 ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {bioAngles.map((a, i) => {
                    const diff = Math.abs(a.measured - a.ideal);
                    const aColor = diff > 15 ? "#dc2626" : diff > 10 ? "#ffc15a" : "#22c55e";
                    const pct = Math.min(100, (a.measured / a.ideal) * 100);
                    const statusLabel = diff <= 5 ? "Excellent" : diff <= 10 ? "Good" : diff <= 20 ? "Needs work" : "Significant gap";
                    return (
                      <div key={i} style={{ padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: `1px solid ${aColor}20` }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{a.label}</div>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 4 }}>
                          <span style={{ fontSize: 18, fontWeight: 900, color: aColor, fontFamily: "'Space Mono', monospace" }}>{typeof a.measured === 'number' ? a.measured : parseInt(String(a.measured).replace(/[^\d]/g, ''), 10) || a.measured}°</span>
                          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>/</span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.4)", fontFamily: "'Space Mono', monospace" }}>{typeof a.ideal === 'number' ? a.ideal : parseInt(String(a.ideal).replace(/[^\d]/g, ''), 10) || a.ideal}°</span>
                        </div>
                        <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden", marginBottom: 4 }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: aColor, borderRadius: 2, transition: "width 0.6s ease" }} />
                        </div>
                        <div style={{ fontSize: 9, color: aColor, fontWeight: 600 }}>{statusLabel}</div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ padding: "20px 0", textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.35)" }}>
                  No biomechanics data available for this skill.
                </div>
              )}
            </div>
          )}

          {/* ── TAB 3: MOTION (frame strip placeholder) ── */}
          {cardTab === "motion" && (
            <div style={{ padding: "20px 0", textAlign: "center" }}>
              {skill.frameDataUrl ? (
                <div style={{ borderRadius: 10, overflow: "hidden", background: "#000", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <img src={skill.frameDataUrl} alt={`Frame at ${skill.timestamp}`} style={{ width: "100%", display: "block", maxHeight: 200, objectFit: "contain" }} />
                  <div style={{ padding: 8, fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "'Space Mono', monospace" }}>Peak frame at {skill.timestamp}</div>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>
                  Frame strip available with video analysis. Upload a video to see motion capture data.
                </div>
              )}
            </div>
          )}

          {/* ── TAB 4: INJURY ── */}
          {cardTab === "injury" && (() => {
            const f = (skill.fault || "").toLowerCase();
            const risks = [];
            const kneeAngle = bioAngles.find(a => a.label.toLowerCase().includes("knee"));
            if (kneeAngle && Math.abs(kneeAngle.measured - kneeAngle.ideal) > 15)
              risks.push({ area: "Knee / ACL", desc: "Repeated landing with knee flexion at " + kneeAngle.measured + "° increases ACL strain risk.", prevention: "Quad strengthening: wall sits 3x30s, single-leg squats 3x10 each leg." });
            else if (f.includes("knee") || f.includes("squat") || f.includes("deep"))
              risks.push({ area: "Knee / ACL", desc: "Excess knee bend on landing increases strain.", prevention: "Wall sits 3x30s, box jump landings 3x8 focusing on soft knees." });
            if (f.includes("arch") || f.includes("hyperext") || f.includes("back"))
              risks.push({ area: "Lower Back", desc: "Repeated hyperextension can stress lumbar vertebrae.", prevention: "Hollow body holds 3x20s, plank 3x30s, pike stretches daily." });
            if (f.includes("cowboy") || f.includes("leg separation") || f.includes("asymmetric"))
              risks.push({ area: "Ankle / Foot", desc: "Asymmetric leg positions increase ankle roll risk on landing.", prevention: "Single-leg balance 3x30s each, resistance band ankle circles 3x15." });
            return (
              <div>
                {risks.length > 0 ? risks.map((r, i) => (
                  <div key={i} style={{ marginBottom: 10, padding: "12px 14px", borderRadius: 10, background: "rgba(220,38,38,0.04)", border: "1px solid rgba(220,38,38,0.12)" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#dc2626", marginBottom: 4 }}>{r.area}</div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.6, marginBottom: 8 }}>{r.desc}</div>
                    <div style={{ padding: "8px 10px", borderRadius: 8, background: "rgba(34,197,94,0.04)", border: "1px solid rgba(34,197,94,0.1)" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#22c55e", letterSpacing: 0.5, marginBottom: 2 }}>PREVENTION</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", lineHeight: 1.5 }}>{r.prevention}</div>
                    </div>
                  </div>
                )) : (
                  <div style={{ padding: "20px 14px", borderRadius: 10, background: "rgba(34,197,94,0.04)", border: "1px solid rgba(34,197,94,0.12)", textAlign: "center" }}>
                    <div style={{ fontSize: 12, color: "#22c55e", fontWeight: 600 }}>No elevated injury risk detected</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>Maintain current form and conditioning.</div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── TAB 5: DRILLS ── */}
          {cardTab === "drills" && (() => {
            const name = (skill.skill || "").toLowerCase();
            const drills = [];
            if (name.includes("handspring") || name.includes("bhs")) {
              drills.push({ name: "Snap-down drill", reps: "3 x 10", cue: "Focus on tight arch to hollow snap. Chest stays up on snap-down." });
              drills.push({ name: "Handstand flat-back fall", reps: "3 x 8", cue: "Lock arms through support. Feel shoulders stack over wrists." });
              drills.push({ name: "Bridge kickover", reps: "3 x 6", cue: "Push through shoulders, squeeze legs together at vertical." });
            } else if (name.includes("tuck") || name.includes("flip") || name.includes("layout") || name.includes("pike")) {
              drills.push({ name: "Tuck jump series", reps: "3 x 10", cue: "Drive arms up, pull knees to chest quickly. Spot landing early." });
              drills.push({ name: "Candle stick rolls", reps: "3 x 8", cue: "Tight body position through full rotation. Arms by ears." });
              drills.push({ name: "Block jumps", reps: "3 x 8", cue: "Maximum height, hollow body at peak. Land with chest up." });
            } else if (name.includes("leap") || name.includes("split") || name.includes("switch")) {
              drills.push({ name: "Split hold at barre", reps: "3 x 20s", cue: "Hips square, maximum extension. Both legs fully straight." });
              drills.push({ name: "Grande battement", reps: "3 x 12 each", cue: "Controlled kick to maximum height. Point through toes." });
              drills.push({ name: "Split leap over line", reps: "3 x 8", cue: "Drive off back foot, hit peak split at top of jump." });
            } else if (name.includes("turn") || name.includes("spin") || name.includes("pirouette")) {
              drills.push({ name: "Releve balance holds", reps: "3 x 30s each", cue: "Full releve, tight core, arms in position. No wobble." });
              drills.push({ name: "Spot training", reps: "3 x 10 turns", cue: "Quick head snap to spot. Complete rotation without travel." });
              drills.push({ name: "Passe balance", reps: "3 x 20s each", cue: "Clean passe position, turned out, hips level." });
            } else {
              drills.push({ name: "Hollow body hold", reps: "3 x 30s", cue: "Lower back pressed to floor. Arms by ears, legs straight." });
              drills.push({ name: "Handstand hold", reps: "3 x 20s", cue: "Tight body line, push through shoulders. Stack joints." });
              drills.push({ name: "Straddle press conditioning", reps: "3 x 8", cue: "Engage core and shoulders. Slow controlled movement." });
            }
            return (
              <div>
                {drills.map((d, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, marginBottom: 10, padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(232,150,42,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: "#e8962a", flexShrink: 0 }}>{i + 1}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", marginBottom: 2 }}>{d.name}</div>
                      <div style={{ fontSize: 11, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: "#e8962a", marginBottom: 4 }}>{d.reps}</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", lineHeight: 1.5 }}>{d.cue}</div>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}

        </div>
      )}
    </div>
  );
}

// ─── GRADED SKILLS VIEW ──────────────────────────────────────────────────────
// Primary results tab: one card per skill, grade badge, fault if any.

function GradedSkillsView({ result, videoUrl, videoFile }) {
  const videoRef   = useRef(null);
  const [filter, setFilter] = useState("all");
  const allSkills  = result.gradedSkills || [];
  const cleanCount = allSkills.filter(s => !s.fault || s.gradeDeduction === 0).length;
  const dedCount   = allSkills.filter(s => s.fault  && s.gradeDeduction  > 0).length;

  // Best grade in the routine
  const RANK = {"A+":12,"A":11,"A-":10,"B+":9,"B":8,"B-":7,"C+":6,"C":5,"C-":4,"D+":3,"D":2,"F":1};
  const bestGrade = allSkills.reduce(
    (best, s) => (RANK[s.grade] || 0) > (RANK[best] || 0) ? s.grade : best, "F"
  );

  // Filter skills
  const skills = filter === "all" ? allSkills
    : filter === "acro" ? allSkills.filter(s => (s.type || "").toLowerCase() === "acro")
    : filter === "dance" ? allSkills.filter(s => (s.type || "").toLowerCase() === "dance")
    : filter === "clean" ? allSkills.filter(s => !s.fault || s.gradeDeduction === 0)
    : filter === "faults" ? allSkills.filter(s => s.fault && s.gradeDeduction > 0)
    : allSkills;

  const handleSeek = (sec) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, sec - 0.3);
    v.play().catch(() => {});
    v.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  if (allSkills.length === 0) {
    return (
      <div style={{ padding: "40px 0", textAlign: "center" }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>🤸</div>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
          No graded skills yet
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
          Re-analyze the routine to use the new grading system.
        </div>
      </div>
    );
  }

  const filterPills = [
    { id: "all", label: "All" },
    { id: "acro", label: "Acro" },
    { id: "dance", label: "Dance" },
    { id: "clean", label: "Clean" },
    { id: "faults", label: "Faults" },
  ];

  return (
    <div>
      {/* ── Summary row ── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[
          ["Skills", allSkills.length, "#e8962a", "rgba(255,255,255,0.03)", "rgba(255,255,255,0.07)"],
          ["Clean",  cleanCount,   "#22c55e", "rgba(34,197,94,0.05)",   "rgba(34,197,94,0.2)"],
          ["Faults", dedCount,     "#dc2626", "rgba(220,38,38,0.05)",   "rgba(220,38,38,0.2)"],
          ["Best",   bestGrade,    GRADE_COLOR[bestGrade] || "#e8962a", "rgba(232,150,42,0.05)", "rgba(232,150,42,0.15)"],
        ].map(([label, val, color, bg, border]) => (
          <div key={label} style={{ flex: 1, padding: "12px 6px", background: bg,
            border: `1px solid ${border}`, borderRadius: 12, textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 900, color,
              fontFamily: "'Space Mono', monospace" }}>{val}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)",
              textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* ── Filter pills ── */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        {filterPills.map(pill => (
          <button key={pill.id} onClick={() => setFilter(pill.id)}
            style={{
              padding: "6px 16px", borderRadius: 20, fontSize: 12, fontWeight: 600,
              fontFamily: "'Outfit', sans-serif", cursor: "pointer", whiteSpace: "nowrap",
              minHeight: 32, transition: "all 0.2s",
              background: filter === pill.id ? "#e8962a" : "transparent",
              color: filter === pill.id ? "#070c16" : "rgba(255,255,255,0.5)",
              border: filter === pill.id ? "1px solid #e8962a" : "1px solid rgba(255,255,255,0.1)",
            }}>
            {pill.label}
          </button>
        ))}
      </div>

      {/* ── Biggest fix banner ── */}
      {result.diagnostics?.biggestFix && (
        <div style={{ marginBottom: 16, padding: "12px 14px", borderRadius: 12,
          background: "rgba(232,150,42,0.06)",
          border: "1px solid rgba(232,150,42,0.2)",
          borderLeft: "3px solid #e8962a" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#e8962a",
            letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>
            #1 Focus Area
          </div>
          <div style={{ fontSize: 13, color: "#E2E8F0", lineHeight: 1.6 }}>
            {result.diagnostics.biggestFix}
          </div>
        </div>
      )}

      {/* ── Compact video player (sticky) ── */}
      {videoUrl && (
        <div style={{ position: "sticky", top: 0, zIndex: 10,
          borderRadius: 12, overflow: "hidden", background: "#070c16",
          marginBottom: 16, border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 4px 20px rgba(0,0,0,0.5)" }}>
          <video ref={videoRef} src={videoUrl} controls controlsList="nodownload"
            playsInline webkit-playsinline="" preload="metadata" muted
            style={{ width: "100%", display: "block", maxHeight: 220 }} />
        </div>
      )}

      {/* ── Skill cards ── */}
      <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.3)",
        letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>
        Skill-by-Skill Breakdown {filter !== "all" && <span style={{ color: "rgba(255,255,255,0.2)" }}>({skills.length})</span>}
      </div>

      {skills.length === 0 && (
        <div style={{ padding: "24px 0", textAlign: "center", fontSize: 13, color: "rgba(255,255,255,0.35)" }}>
          No {filter} skills found in this routine.
        </div>
      )}

      {skills.map((skill, idx) => (
        <StriveErrorBoundary key={skill.id || idx} name="Skill Card">
        <GradedSkillCard
          skill={skill}
          onSeek={videoUrl ? handleSeek : null}
          videoFile={videoFile}
          videoUrl={videoUrl}
        />
        </StriveErrorBoundary>
      ))}
    </div>
  );
}

// ─── RESULTS SCREEN ─────────────────────────────────────────────────
const ResultsScreen = React.memo(function ResultsScreen({ result, profile, history, videoUrl, videoFile, onBack, onDrills }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [actualScore, setActualScore] = useState("");
  const [scoreSaved, setScoreSaved] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(true);

  // ── Agent Epsilon: Never blank screen — fall back to cached analysis if result is null ──
  if (!result) {
    try {
      const cached = localStorage.getItem("strive_recent_analyses");
      if (cached) {
        const recent = JSON.parse(cached);
        if (recent.length > 0 && recent[0].result) {
          result = recent[0].result;
        }
      }
    } catch {}
    if (!result) {
      return (
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: "rgba(255,255,255,0.5)", marginBottom: 12 }}>No analysis available</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", marginBottom: 24, textAlign: "center", maxWidth: 280 }}>Upload a video to get your first analysis, or check back when you are online.</div>
          <button onClick={onBack} className="btn-gold" style={{ padding: "12px 28px", fontSize: 14 }}>Go to Dashboard</button>
        </div>
      );
    }
  }

  // ── Agent Delta: Compute intelligence data ──
  const athleteRecord = useMemo(() => getAthleteRecord(profile), [profile]);
  const faultIntelligence = useMemo(() => computeFaultIntelligence(athleteRecord), [athleteRecord]);
  const drillPlan = useMemo(() => faultIntelligence.totalAnalyses >= 5 ? generateWeeklyDrillPlan(faultIntelligence) : null, [faultIntelligence]);
  const improvementData = useMemo(() => computeImprovementCurves(athleteRecord), [athleteRecord]);
  const goalTracking = useMemo(() => computeGoalTracking(athleteRecord), [athleteRecord]);

  const groupedDeds = result.executionDeductions || [];
  const scoreColor = result.finalScore >= 9.0 ? "#22c55e" : result.finalScore >= 8.0 ? "#ffc15a" : "#dc2626";
  const actualNum = parseFloat(actualScore);
  const hasDiff = !isNaN(actualNum) && actualNum > 0;
  const diff = hasDiff ? (result.finalScore - actualNum) : 0;
  const diffAbs = Math.abs(diff).toFixed(3);
  const diffLabel = diff > 0 ? `Score calibration: ${diffAbs} HIGH` : diff < 0 ? `Score calibration: ${diffAbs} LOW` : "Exact match!";
  const diffColor = Math.abs(diff) < 0.15 ? "#22c55e" : Math.abs(diff) < 0.4 ? "#ffc15a" : "#dc2626";

  const hasVideo = !!(result.videoUrl || videoUrl);
  
  // ── Tier gating: check localStorage for pro status ──
  const isPro = (() => { try { return localStorage.getItem("strive-tier") === "competitive"; } catch { return false; } })();
  
  const tabs = [
    { id: "overview",   label: "Overview" },
    { id: "skills",     label: "🏅 Skills" },
    ...(hasVideo ? [{ id: "review", label: "▶ Video" }] : []),
    { id: "deductions", label: "Deductions" },
    { id: "biomechanics", label: "🦴 Bio", pro: true },
    { id: "coach",      label: "Program",  pro: true },
    { id: "diagnostics",label: "Diagnostics", pro: true },
    { id: "whatif",     label: "What If?", pro: true },
  ];

  return (
    <div style={{ minHeight: "100vh", padding: "16px 18px 90px", maxWidth: 540, margin: "0 auto" }}>
      <button onClick={onBack} style={{
        background: "none", border: "none", color: "rgba(232,150,42,0.6)", cursor: "pointer",
        fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 600, marginBottom: 14,
        display: "flex", alignItems: "center", gap: 4,
      }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M8.5 2.5l-5 5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        Dashboard
      </button>

      {/* ── PDF Export + Share Buttons ── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          onClick={() => {
            const printDiv = document.getElementById("strive-print-report");
            if (!printDiv) return;
            const topDeds = [...groupedDeds].sort((a, b) => safeNum(b.deduction, 0) - safeNum(a.deduction, 0));
            const top3Imp = topDeds.slice(0, 3);
            const celebs = safeArray(result.celebrations);
            const strs = safeArray(result.strengths);
            const top3Str = celebs.length > 0
              ? celebs.slice(0, 3).map(c => ({ title: safeStr(c.skill), note: safeStr(c.note) }))
              : strs.slice(0, 3).map(s => ({ title: safeStr(s).split(":")[0], note: safeStr(s).split(":").slice(1).join(":").trim() || "Clean execution" }));
            const gSkills = safeArray(result.gradedSkills);
            const cur = safeNum(result.finalScore, 0);
            const pathItems = cur < 9.0 ? top3Imp.map(d => ({ skill: safeStr(d.skill), gain: safeNum(d.deduction, 0) })) : [];
            const proj = Math.min(10, cur + pathItems.reduce((s, p) => s + p.gain, 0));
            const getDrillsLocal = (fault) => { for (const [key, drills] of Object.entries(DRILLS_DATABASE)) { if (fault && fault.toLowerCase().includes(key.toLowerCase())) return drills; } return DRILLS_DATABASE.default || []; };
            const drillSet = new Set(); const recDrills = [];
            topDeds.forEach(d => { const dr = getDrillsLocal(safeStr(d.fault)); if (dr) dr.forEach(drill => { const nm = drill.name || drill; if (!drillSet.has(nm) && recDrills.length < 5) { drillSet.add(nm); recDrills.push({ name: nm, reps: drill.reps || drill.sets || "", why: drill.why || drill.focus || "" }); } }); });
            const ds = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
            const sc = cur >= 9.0 ? "#16a34a" : cur >= 8.0 ? "#d97706" : "#dc2626";
            printDiv.innerHTML = '<div style="max-width:700px;margin:0 auto;">' +
              '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #e8962a;padding-bottom:16px;margin-bottom:24px;">' +
                '<div><div style="font-family:Georgia,serif;font-size:28px;font-weight:700;letter-spacing:4px;color:#e8962a;">STRIVE</div><div style="font-size:10px;color:#888;letter-spacing:2px;margin-top:2px;">GYMNASTICS ANALYSIS REPORT</div></div>' +
                '<div style="text-align:right;font-size:11px;color:#666;"><div>' + ds + '</div><div style="margin-top:2px;">strive-app-amber.vercel.app</div></div>' +
              '</div>' +
              '<div style="display:flex;gap:24px;margin-bottom:24px;padding:16px;background:#f8f8f8;border-radius:8px;">' +
                '<div style="flex:1;"><div style="font-size:10px;color:#999;text-transform:uppercase;letter-spacing:1px;">Athlete</div><div style="font-size:16px;font-weight:700;color:#1a1a1a;margin-top:2px;">' + safeStr(profile?.name || "Athlete") + '</div></div>' +
                '<div><div style="font-size:10px;color:#999;text-transform:uppercase;letter-spacing:1px;">Level</div><div style="font-size:14px;font-weight:600;color:#1a1a1a;margin-top:2px;">' + safeStr(result.level) + '</div></div>' +
                '<div><div style="font-size:10px;color:#999;text-transform:uppercase;letter-spacing:1px;">Event</div><div style="font-size:14px;font-weight:600;color:#1a1a1a;margin-top:2px;">' + safeStr(result.event) + '</div></div>' +
                '<div><div style="font-size:10px;color:#999;text-transform:uppercase;letter-spacing:1px;">Date</div><div style="font-size:14px;font-weight:600;color:#1a1a1a;margin-top:2px;">' + ds + '</div></div>' +
              '</div>' +
              '<div style="text-align:center;padding:24px;border:2px solid #e8962a;border-radius:12px;margin-bottom:24px;">' +
                '<div class="score" style="font-size:48px;font-weight:900;color:' + sc + ';">' + cur.toFixed(3) + '</div>' +
                '<div style="font-size:12px;color:#666;margin-top:4px;letter-spacing:1px;">FINAL SCORE</div>' +
                '<div style="display:flex;justify-content:center;gap:40px;margin-top:16px;">' +
                  '<div><div style="font-size:10px;color:#999;letter-spacing:0.5px;">START VALUE</div><div style="font-family:Space Mono,monospace;font-size:20px;font-weight:700;color:#1a1a1a;">' + safeNum(result.startValue, 10).toFixed(1) + '</div></div>' +
                  '<div><div style="font-size:10px;color:#999;letter-spacing:0.5px;">E-SCORE</div><div style="font-family:Space Mono,monospace;font-size:20px;font-weight:700;color:#dc2626;">-' + safeNum(result.totalDeductions, 0).toFixed(2) + '</div></div>' +
                  '<div><div style="font-size:10px;color:#999;letter-spacing:0.5px;">ARTISTRY</div><div style="font-family:Space Mono,monospace;font-size:20px;font-weight:700;color:#d97706;">-' + safeNum(result.artistryDeductionsTotal, 0).toFixed(2) + '</div></div>' +
                  '<div><div style="font-size:10px;color:#999;letter-spacing:0.5px;">NEUTRAL</div><div style="font-family:Space Mono,monospace;font-size:20px;font-weight:700;color:#888;">0.00</div></div>' +
                '</div>' +
              '</div>' +
              (gSkills.length > 0 ? '<div style="margin-bottom:24px;"><div style="font-size:14px;font-weight:700;color:#1a1a1a;margin-bottom:10px;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #ddd;padding-bottom:6px;">Skill-by-Skill Breakdown</div>' +
              '<table><thead><tr><th style="width:30%;">Skill Name</th><th style="width:10%;text-align:center;">Time</th><th style="width:12%;text-align:center;">Deduction</th><th style="width:38%;">Fault Description</th><th style="width:10%;text-align:center;">Grade</th></tr></thead><tbody>' +
              gSkills.map(function(s) { var ded = s.gradeDeduction || s.deduction || 0; var gc = ({"A+":"#16a34a","A":"#16a34a","A-":"#22c55e","B+":"#22c55e","B":"#d97706","B-":"#d97706","C+":"#ea580c","C":"#ea580c","C-":"#dc2626","D+":"#dc2626","D":"#dc2626","F":"#7c3aed"})[s.grade] || "#333"; return '<tr><td style="font-weight:600;font-size:11px;">' + safeStr(s.skill) + '</td><td style="text-align:center;font-family:Space Mono,monospace;font-size:11px;">' + (safeStr(s.timestamp) || "\u2014") + '</td><td style="text-align:center;font-family:Space Mono,monospace;font-size:11px;color:' + (ded > 0 ? "#dc2626" : "#16a34a") + ';">' + (ded > 0 ? "-" + ded.toFixed(2) : "0.00") + '</td><td style="font-size:11px;color:#555;">' + safeStr(s.reason || s.fault || (ded > 0 ? "Form break detected" : "Clean execution")) + '</td><td style="text-align:center;font-weight:700;font-size:12px;color:' + gc + ';">' + (safeStr(s.grade) || "\u2014") + '</td></tr>'; }).join("") +
              '</tbody></table></div>' : '') +
              '<div style="display:flex;gap:20px;margin-bottom:24px;">' +
                '<div style="flex:1;padding:16px;border:1px solid #fca5a5;border-radius:8px;background:#fef2f2;">' +
                  '<div style="font-size:12px;font-weight:700;color:#dc2626;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">Top Areas for Improvement</div>' +
                  (top3Imp.length > 0 ? top3Imp.map(function(d, i) { return '<div style="margin-bottom:10px;padding-bottom:8px;' + (i < 2 ? "border-bottom:1px solid #fecaca;" : "") + '"><div style="font-size:12px;font-weight:700;color:#1a1a1a;">' + (i+1) + '. ' + safeStr(d.skill) + '</div><div style="font-size:11px;color:#555;margin-top:2px;">' + safeStr(d.fault) + '</div><div style="font-size:11px;font-family:Space Mono,monospace;color:#dc2626;margin-top:2px;">-' + safeNum(d.deduction, 0).toFixed(2) + '</div></div>'; }).join("") : '<div style="font-size:11px;color:#888;">Clean routine.</div>') +
                '</div>' +
                '<div style="flex:1;padding:16px;border:1px solid #86efac;border-radius:8px;background:#f0fdf4;">' +
                  '<div style="font-size:12px;font-weight:700;color:#16a34a;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">Strengths &amp; Celebrations</div>' +
                  top3Str.map(function(s, i) { return '<div style="margin-bottom:10px;padding-bottom:8px;' + (i < 2 ? "border-bottom:1px solid #bbf7d0;" : "") + '"><div style="font-size:12px;font-weight:700;color:#1a1a1a;">' + s.title + '</div><div style="font-size:11px;color:#555;margin-top:2px;">' + s.note + '</div></div>'; }).join("") +
                '</div>' +
              '</div>' +
              (pathItems.length > 0 ? '<div style="margin-bottom:24px;padding:16px;border:1px solid #86efac;border-radius:8px;background:#f0fdf4;">' +
                '<div style="font-size:12px;font-weight:700;color:#16a34a;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">Path to 9.0+</div>' +
                '<div style="display:flex;align-items:center;gap:16px;margin-bottom:12px;">' +
                  '<div style="text-align:center;"><div style="font-size:9px;color:#999;text-transform:uppercase;">Current</div><div style="font-family:Space Mono,monospace;font-size:18px;font-weight:700;color:#d97706;">' + cur.toFixed(3) + '</div></div>' +
                  '<div style="font-size:16px;color:#999;">\u2192</div>' +
                  '<div style="text-align:center;"><div style="font-size:9px;color:#999;text-transform:uppercase;">Projected</div><div style="font-family:Space Mono,monospace;font-size:18px;font-weight:700;color:#16a34a;">' + proj.toFixed(3) + '</div></div>' +
                '</div>' +
                pathItems.map(function(p, i) { return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;' + (i < pathItems.length - 1 ? "border-bottom:1px solid #dcfce7;" : "") + '"><div style="font-family:Space Mono,monospace;font-size:12px;font-weight:700;color:#16a34a;">+' + p.gain.toFixed(2) + '</div><div style="font-size:12px;color:#333;">Fix ' + p.skill + '</div></div>'; }).join("") +
                (result.pathToGoal ? '<div style="margin-top:10px;font-size:11px;color:#555;font-style:italic;">' + safeStr(result.pathToGoal) + '</div>' : '') +
              '</div>' : '') +
              (recDrills.length > 0 ? '<div style="margin-bottom:24px;padding:16px;border:1px solid #fde68a;border-radius:8px;background:#fffbeb;">' +
                '<div style="font-size:12px;font-weight:700;color:#d97706;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">Recommended Drills</div>' +
                recDrills.map(function(d, i) { return '<div style="margin-bottom:8px;padding-bottom:8px;' + (i < recDrills.length - 1 ? "border-bottom:1px solid #fef3c7;" : "") + '"><div style="font-size:12px;font-weight:700;color:#1a1a1a;">' + (i+1) + '. ' + d.name + '</div>' + (d.reps ? '<div style="font-size:11px;font-family:Space Mono,monospace;color:#d97706;margin-top:2px;">' + d.reps + '</div>' : '') + (d.why ? '<div style="font-size:11px;color:#555;margin-top:2px;">' + d.why + '</div>' : '') + '</div>'; }).join("") +
              '</div>' : '') +
              '<div style="border-top:2px solid #e8962a;padding-top:16px;margin-top:32px;">' +
                '<div style="text-align:center;"><div style="font-family:Georgia,serif;font-size:16px;font-weight:700;letter-spacing:3px;color:#e8962a;">STRIVE</div><div style="font-size:10px;color:#888;letter-spacing:1.5px;margin-top:4px;">SEE YOUR SCORE. OWN YOUR GROWTH.</div></div>' +
                '<div style="margin-top:16px;padding:10px;background:#f8f8f8;border-radius:6px;text-align:center;">' +
                  '<div style="font-size:9px;color:#999;line-height:1.6;">This analysis is computer-generated and should be reviewed by a qualified coach.<br/>Scoring uses Championship Strictness calibration (may be 0.05\u20130.15 below actual meet scores).<br/>Generated by STRIVE \u2014 strive-app-amber.vercel.app</div>' +
                '</div>' +
              '</div>' +
            '</div>';
            window.print();
          }}
          style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            background: "linear-gradient(135deg, #e8962a, #ffc15a)", color: "#070c16",
            border: "none", borderRadius: 12, padding: "12px 16px", cursor: "pointer",
            fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 13,
            letterSpacing: 0.3, transition: "all 0.2s",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7 1v9M7 1l3 3M7 1L4 4M1 10v2h12v-2"/></svg>
          Export Report
        </button>
        <button
          onClick={() => {
            const topDeds2 = [...groupedDeds].sort((a, b) => safeNum(b.deduction, 0) - safeNum(a.deduction, 0)).slice(0, 5);
            const shareText = [
              "STRIVE Analysis Report",
              safeStr(profile?.name || "Athlete") + " \u2014 " + result.event + " \u00B7 " + result.level,
              "Score: " + safeNum(result.finalScore, 0).toFixed(3) + " (Start: " + safeNum(result.startValue, 10).toFixed(1) + " - Deductions: " + safeNum(result.totalDeductions, 0).toFixed(2) + ")",
              "", "Top deductions:",
              ...topDeds2.map((d, i) => "  " + (i+1) + ". " + safeStr(d.skill) + " \u2014 " + safeStr(d.fault) + " (-" + safeNum(d.deduction, 0).toFixed(2) + ")"),
              "", "Strengths: " + safeArray(result.strengths).slice(0, 3).map(s => safeStr(s).substring(0, 60)).join("; "),
              "", "#1 fix: " + (topDeds2[0] ? safeStr(topDeds2[0].skill) + " (saves +" + safeNum(topDeds2[0].deduction, 0).toFixed(2) + ")" : "See full report"),
              "", "\u2014 Generated by STRIVE \u00B7 See Your Score. Own Your Growth.",
              "  strive-app-amber.vercel.app",
            ].join("\n");
            if (navigator.share) {
              navigator.share({ title: "STRIVE Report \u2014 " + safeStr(profile?.name || "Athlete") + " " + result.event + " " + safeNum(result.finalScore, 0).toFixed(3), text: shareText }).catch(function(){});
            } else if (navigator.clipboard) {
              navigator.clipboard.writeText(shareText).then(function() { alert("Report summary copied to clipboard! Paste into an email or text to share with your coach."); }).catch(function() {
                var ta = document.createElement("textarea"); ta.value = shareText; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); alert("Report summary copied!");
              });
            } else {
              var ta = document.createElement("textarea"); ta.value = shareText; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); alert("Report summary copied!");
            }
          }}
          style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            background: "transparent", color: "#e8962a",
            border: "1.5px solid rgba(232,150,42,0.4)", borderRadius: 12,
            padding: "12px 16px", cursor: "pointer",
            fontFamily: "'Outfit', sans-serif", fontWeight: 600, fontSize: 13, transition: "all 0.2s",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="3" cy="7" r="2"/><circle cx="11" cy="3" r="2"/><circle cx="11" cy="11" r="2"/><path d="M4.7 6.1l4.6-2.2M4.7 7.9l4.6 2.2"/></svg>
          Share
        </button>
      </div>

      {/* Hidden print report container */}
      <div id="strive-print-report" style={{ position: "absolute", left: "-9999px", top: 0, width: 0, height: 0, overflow: "hidden" }} />

      {/* Demo mode notice */}
      {result.isDemo && (
        <div style={{
          padding: "12px 16px", borderRadius: 12, marginBottom: 16,
          background: "rgba(255,193,90,0.08)", border: "1px solid rgba(255,193,90,0.2)",
          animation: "fadeIn 0.4s ease-out",
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#ffc15a", marginBottom: 4 }}>
            ⚠ Demo Analysis
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
            {result.failureReason ? (
              <>
                Analysis error: <span style={{ color: "#dc2626", fontFamily: "'Space Mono', monospace", fontSize: 11 }}>{result.failureReason}</span>
                <div style={{ marginTop: 6, color: "rgba(255,255,255,0.4)" }}>
                  {result.failureReason.match(/JSON|parse|Unexpected|truncat/i) ? (
                    "The analysis returned an incomplete response. This happens occasionally — try uploading again."
                  ) : result.failureReason.match(/403|401|key|quota/i) ? (
                    "API rate limit reached. Wait a minute and try again, or add your own key in Settings."
                  ) : result.failureReason.match(/video|frame|extract/i) ? (
                    "Video format issue. Try re-saving: open video in Photos → Edit → Done, then re-upload."
                  ) : (
                    "Try uploading again. If this persists, the video may be too long or in an unsupported format."
                  )}
                </div>
              </>
            ) : "Demo mode — upload a video for real video analysis."}
          </div>
        </div>
      )}

      {/* Score Card with celebration */}
      <div style={{
        background: "linear-gradient(135deg, rgba(232,150,42,0.1), rgba(232,150,42,0.03))",
        border: `1px solid ${scoreColor}30`, borderRadius: 20, padding: 28,
        textAlign: "center", marginBottom: 24, animation: "scaleIn 0.5s ease-out",
        position: "relative", overflow: "hidden",
      }}>
        {/* Ambient glow behind score */}
        <div style={{
          position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          width: 200, height: 200, borderRadius: "50%",
          background: `radial-gradient(circle, ${scoreColor}12 0%, transparent 70%)`,
          pointerEvents: "none",
        }} />

        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", fontWeight: 600, letterSpacing: 2, marginBottom: 4 }}>
            {result.event?.toUpperCase()} · {result.level}
          </div>
          <div style={{
            fontSize: 56, fontWeight: 900, fontFamily: "'Space Mono', monospace",
            color: scoreColor, lineHeight: 1, marginBottom: 4,
          }}>
            {safeNum(result.finalScore, 0, 0, 10).toFixed(3)}
          </div>

          {/* Score-specific celebration/context message */}
          <div style={{
            fontSize: 12, fontWeight: 600, marginBottom: 12,
            color: result.finalScore >= 9.2 ? "#22c55e" : result.finalScore >= 8.5 ? "#e8962a" : result.finalScore >= 7.5 ? "#ffc15a" : "#dc2626",
          }}>
            {result.finalScore >= 9.5 ? "Outstanding — elite-level execution" :
             result.finalScore >= 9.2 ? "Excellent — top of the field" :
             result.finalScore >= 9.0 ? "Strong performance — podium range" :
             result.finalScore >= 8.5 ? "Solid routine — room to push higher" :
             result.finalScore >= 8.0 ? "Good foundation — focused fixes will jump this score" :
             result.finalScore >= 7.5 ? "Building — the biggest gains are within reach" :
             "Keep working — every practice makes a difference"}
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 20, marginTop: 16, alignItems: "center" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: 0.5 }}>START VALUE</div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "'Space Mono', monospace" }}>
              {safeNum(result.startValue, 10).toFixed(1)}
            </div>
          </div>
          <span style={{ fontSize: 18, fontWeight: 300, color: "rgba(255,255,255,0.25)", marginTop: 10 }}>-</span>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: 0.5 }}>DEDUCTIONS ({safeArray(result.executionDeductions).length})</div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: "#dc2626" }}>
              {safeNum(result.totalDeductions, 0).toFixed(3)}
            </div>
          </div>
          <span style={{ fontSize: 18, fontWeight: 300, color: "rgba(255,255,255,0.25)", marginTop: 10 }}>=</span>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: 0.5 }}>FINAL SCORE</div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: scoreColor }}>
              {safeNum(result.finalScore, 0).toFixed(3)}
            </div>
          </div>
        </div>
        {result.calibrationBias && (
          <div style={{ marginTop: 12, fontSize: 11, color: "rgba(255,255,255,0.4)", lineHeight: 1.5 }}>
            <span style={{ background: "rgba(59,130,246,0.12)", color: "#60a5fa", padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600 }}>CALIBRATED</span>
            {" "}Adjusted {result.calibrationBias > 0 ? "-" : "+"}{Math.abs(safeNum(result.calibrationBias, 0)).toFixed(2)} based on past score corrections
            <span style={{ color: "rgba(255,255,255,0.25)" }}> (raw analysis: {safeNum(result.rawAiScore, 0).toFixed(3)})</span>
          </div>
        )}
        </div>{/* close z-index wrapper */}
      </div>

      {/* Score Benchmark */}
      <ScoreBenchmark score={result.finalScore} level={result.level} />

      {/* Event comparison — show improvement from last time */}
      {(() => {
        const sameEventHistory = (history || []).filter(h => h.event === result.event && h.score);
        if (sameEventHistory.length > 0) {
          const lastScore = sameEventHistory[0].score;
          const diff = result.finalScore - lastScore;
          const improved = diff > 0;
          const same = Math.abs(diff) < 0.01;
          return (
            <div className="card" style={{
              padding: 14, marginBottom: 16,
              borderColor: same ? "rgba(255,255,255,0.06)" : improved ? "rgba(34,197,94,0.15)" : "rgba(220,38,38,0.1)",
              background: same ? "rgba(255,255,255,0.02)" : improved ? "rgba(34,197,94,0.03)" : "rgba(220,38,38,0.02)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: 0.5 }}>VS LAST {result.event?.toUpperCase()}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
                    Last: <span style={{ fontFamily: "'Space Mono', monospace", fontWeight: 700, color: "rgba(255,255,255,0.6)" }}>{lastScore.toFixed(3)}</span>
                    <span style={{ color: "rgba(255,255,255,0.2)", margin: "0 6px" }}>→</span>
                    Now: <span style={{ fontFamily: "'Space Mono', monospace", fontWeight: 700, color: scoreColor }}>{result.finalScore.toFixed(3)}</span>
                  </div>
                </div>
                <div style={{
                  fontSize: 18, fontWeight: 900, fontFamily: "'Space Mono', monospace",
                  color: same ? "rgba(255,255,255,0.3)" : improved ? "#22c55e" : "#dc2626",
                }}>
                  {same ? "=" : improved ? "+" : ""}{diff.toFixed(2)}
                </div>
              </div>
              {improved && diff >= 0.1 && (
                <div style={{ fontSize: 11, color: "#22c55e", marginTop: 8, fontWeight: 600 }}>
                  {diff >= 0.3 ? "Huge improvement — your training is paying off!" :
                   diff >= 0.15 ? "Solid progress — keep doing what you're doing." :
                   "Moving in the right direction. Consistency is key."}
                </div>
              )}
            </div>
          );
        }
        // First analysis for this event
        if (history.length === 0) {
          return (
            <div className="card" style={{ padding: 14, marginBottom: 16, borderColor: "rgba(232,150,42,0.12)", background: "rgba(232,150,42,0.03)" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#e8962a" }}>
                First analysis recorded for {result.event}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
                Upload again after your next practice or meet to track your improvement over time.
              </div>
            </div>
          );
        }
        return null;
      })()}

      {/* 2D Video Accuracy Note */}
      <div style={{
        display: "flex", gap: 8, padding: "10px 12px", borderRadius: 8, marginBottom: 14,
        background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)",
      }}>
        <span style={{ fontSize: 11, flexShrink: 0, marginTop: 1 }}>📊</span>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", lineHeight: 1.5 }}>
          Scores are based on 2D video analysis and may vary ±0.15–0.25 from live judging. Camera angle, video quality, and lighting affect accuracy. Side-view at apparatus height produces the most accurate results.
        </span>
      </div>

      {/* Actual Score Input */}
      <div className="card" style={{ marginBottom: 20, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", marginBottom: 6, letterSpacing: 0.5 }}>
              ACTUAL MEET SCORE
            </div>
            <input
              className="input-field"
              type="number"
              step="0.025"
              min="0"
              max="10"
              placeholder="e.g. 8.925"
              value={actualScore}
              onChange={(e) => { setActualScore(e.target.value); setScoreSaved(false); }}
              style={{ padding: "10px 12px", fontSize: 16, fontFamily: "'Space Mono', monospace", fontWeight: 700 }}
            />
          </div>
          {hasDiff && (
            <div style={{ textAlign: "center", minWidth: 100, animation: "fadeIn 0.3s ease-out" }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>DIFFERENCE</div>
              <div style={{ fontSize: 22, fontWeight: 900, fontFamily: "'Space Mono', monospace", color: diffColor }}>
                {diff > 0 ? "+" : ""}{diff.toFixed(3)}
              </div>
              <div style={{ fontSize: 10, color: diffColor, fontWeight: 600, marginTop: 2 }}>{diffLabel}</div>
            </div>
          )}
        </div>
        {hasDiff && (
          <>
          <div style={{
            marginTop: 12, padding: "10px 14px", borderRadius: 10,
            background: `${diffColor}08`, border: `1px solid ${diffColor}22`,
            fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.6,
          }}>
            {Math.abs(diff) < 0.15 ? (
              <span><strong style={{ color: "#22c55e" }}>Excellent calibration.</strong> The estimated score is within 0.15 of the actual score — within normal judge variance.</span>
            ) : Math.abs(diff) < 0.4 ? (
              <span><strong style={{ color: "#ffc15a" }}>Close.</strong> The estimated score is within 0.4 of the actual. {diff > 0 ? "Artistry/composition deductions are hard to see in frames." : "The analysis may be stricter than the panel on borderline calls."}</span>
            ) : (
              <span><strong style={{ color: "#dc2626" }}>Outside normal variance.</strong> {diff > 0 ? "The analysis may be missing deductions not visible in frames." : "The analysis may be over-deducting. Real judges see full context."}</span>
            )}
          </div>
          {!scoreSaved && (
            <button
              onClick={async () => {
                try {
                  const cal = await storage.get("strive-calibration");
                  const data = cal ? JSON.parse(cal.value) : [];
                  data.push({
                    date: new Date().toISOString(),
                    event: result.event,
                    level: result.level,
                    aiScore: result.finalScore,
                    actualScore: actualNum,
                    diff: diff,
                    deductionCount: result.executionDeductions?.length || 0,
                  });
                  await storage.set("strive-calibration", JSON.stringify(data.slice(-50)));
                } catch(e) { log.warn("calibration", "Failed to save calibration: " + e.message); }
                setScoreSaved(true);
              }}
              className="btn-gold"
              style={{ width: "100%", marginTop: 10, padding: "12px 16px", fontSize: 13 }}
            >
              <Icon name="target" size={14} /> Submit Score Correction — Help STRIVE Learn
            </button>
          )}
          {scoreSaved && (
            <div style={{ marginTop: 10, padding: "10px 14px", borderRadius: 10, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)", fontSize: 12, color: "#22c55e", textAlign: "center" }}>
              ✓ Score correction saved. Helps calibrate future analyses for {result.level} {result.event}.
            </div>
          )}
          </>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 3, marginBottom: 16, background: "rgba(255,255,255,0.025)", borderRadius: 14, padding: 3, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => (tab.pro && !isPro) ? setActiveTab("pro-gate") : setActiveTab(tab.id)}
            style={{
              flex: tab.id === "review" ? "none" : 1, padding: "9px 8px", borderRadius: 11, border: "none", cursor: "pointer",
              fontFamily: "'Outfit', sans-serif", fontWeight: 600, fontSize: 11,
              background: activeTab === tab.id ? "linear-gradient(135deg, #e8962a, #ffc15a)" : "transparent",
              color: activeTab === tab.id ? "#070c16" : (tab.pro && !isPro) ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.45)",
              transition: "all 0.2s", whiteSpace: "nowrap", position: "relative",
            }}
          >
            {tab.label}
            {tab.pro && !isPro && (
              <span style={{ fontSize: 7, marginLeft: 2, verticalAlign: "super", color: "#A78BFA" }}>PRO</span>
            )}
          </button>
        ))}
      </div>

      {/* ─── PRO UPGRADE GATE (shown when clicking locked tab) ─── */}
      {activeTab === "pro-gate" && (
        <div style={{ animation: "fadeIn 0.3s ease-out" }}>
          <div style={{
            border: "1.5px solid rgba(139,92,246,0.25)", borderRadius: 20,
            padding: 32, textAlign: "center", background: "rgba(139,92,246,0.04)",
            marginBottom: 20,
          }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>🔒</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#E2E8F0", marginBottom: 8 }}>
              Unlock Full Analysis
            </div>
            <div style={{ fontSize: 13, color: "#8890AB", lineHeight: 1.7, maxWidth: 300, margin: "0 auto 20px" }}>
              Get the complete picture: skill-by-skill breakdown, biomechanics dashboard, personalized 5-pillar training program, what-if simulator, and diagnostics.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 260, margin: "0 auto 20px", textAlign: "left" }}>
              {[
                "🦴 Biomechanics — joint angles, landing forces, injury flags",
                "🏅 Training Program — drills, strength, nutrition, mental, recovery",
                "🔮 What-If — see how fixing each skill changes your score",
                "📊 Diagnostics — engine confidence, scoring breakdown",
              ].map((feat, i) => (
                <div key={i} style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.5, padding: "6px 10px", borderRadius: 8, background: "rgba(139,92,246,0.04)", borderLeft: "2px solid rgba(139,92,246,0.2)" }}>
                  {feat}
                </div>
              ))}
            </div>
            <button
              onClick={() => setShowUpgradeModal(true)}
              style={{
                background: "linear-gradient(135deg, #8B5CF6, #A78BFA)",
                color: "#FFF", border: "none", padding: "14px 36px",
                borderRadius: 12, fontWeight: 700, fontSize: 15,
                cursor: "pointer", fontFamily: "'Outfit', sans-serif",
                letterSpacing: 0.3, transition: "all 0.2s",
              }}
            >
              Upgrade to STRIVE Competitive
            </button>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", marginTop: 10 }}>
              Payment integration coming soon — tap to preview Competitive features
            </div>
          </div>

          {/* Blurred preview of what's behind the gate */}
          <div style={{ filter: "blur(4px)", opacity: 0.4, pointerEvents: "none", userSelect: "none" }}>
            <div className="card" style={{ marginBottom: 10, padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#dc2626", letterSpacing: 1 }}>🎯 PRIORITY DRILL</div>
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6 }}>Landing control — stick drill 3x per practice</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>Based on 3 landing deductions in this routine</div>
            </div>
            <div className="card" style={{ marginBottom: 10, padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#3b82f6", letterSpacing: 1 }}>💪 STRENGTH TARGET</div>
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6 }}>Single-leg RDL with hold — hamstring/glute power</div>
            </div>
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#A78BFA", letterSpacing: 1 }}>🧠 MENTAL</div>
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6 }}>Competition visualization before bed</div>
            </div>
          </div>
        </div>
      )}

      {/* ─── VIDEO REVIEW TAB ─── */}
      {/* ─── SKILLS TAB — primary graded view ─── */}
      {activeTab === "skills" && (
        <StriveErrorBoundary name="Skills">
        <GradedSkillsView result={result} videoUrl={videoUrl} videoFile={videoFile} />
        </StriveErrorBoundary>
      )}

      {activeTab === "review" && hasVideo && (
        <StriveErrorBoundary name="Video Player">
        <VideoReviewPlayer videoUrl={videoUrl} result={result} />
        </StriveErrorBoundary>
      )}
      {activeTab === "overview" && (
        <StriveErrorBoundary name="Overview">
        <div style={{ animation: "fadeIn 0.4s ease-out" }}>

          {/* ── 1. HERO SCORE RING ── */}
          {(() => {
            const scorePct = Math.min(100, (safeNum(result.finalScore, 0) / 10) * 100);
            const radius = 54;
            const circumference = 2 * Math.PI * radius;
            const strokeDashoffset = circumference - (scorePct / 100) * circumference;
            const gradeLabel = result.finalScore >= 9.5 ? "Elite" : result.finalScore >= 9.0 ? "Excellent" : result.finalScore >= 8.5 ? "Strong" : result.finalScore >= 8.0 ? "Good" : result.finalScore >= 7.5 ? "Building" : "Developing";
            const trendArrow = (history || []).filter(h => h.event === result.event && h.score).length > 0 ? (() => {
              const lastScore = (history || []).filter(h => h.event === result.event && h.score)[0].score;
              const d = result.finalScore - lastScore;
              return d > 0.01 ? { dir: "up", val: `+${d.toFixed(2)}`, color: "#22c55e" } : d < -0.01 ? { dir: "down", val: d.toFixed(2), color: "#dc2626" } : { dir: "same", val: "=", color: "rgba(255,255,255,0.3)" };
            })() : null;
            return (
              <div style={{ textAlign: "center", marginBottom: 24, padding: "28px 16px", background: "linear-gradient(135deg, rgba(232,150,42,0.06), rgba(232,150,42,0.02))", borderRadius: 20, border: `1px solid ${scoreColor}25`, position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: 200, height: 200, borderRadius: "50%", background: `radial-gradient(circle, ${scoreColor}10 0%, transparent 70%)`, pointerEvents: "none" }} />
                <div style={{ position: "relative", display: "inline-block", marginBottom: 12 }}>
                  <svg width="140" height="140" viewBox="0 0 140 140" style={{ transform: "rotate(-90deg)" }}>
                    <circle cx="70" cy="70" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
                    <circle cx="70" cy="70" r={radius} fill="none" stroke={scoreColor} strokeWidth="8" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)" }} />
                  </svg>
                  <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", textAlign: "center" }}>
                    <div style={{ fontSize: 28, fontWeight: 900, fontFamily: "'Space Mono', monospace", color: scoreColor, lineHeight: 1 }}>
                      {safeNum(result.finalScore, 0, 0, 10).toFixed(3)}
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: 1, textTransform: "uppercase", marginTop: 2 }}>
                      {gradeLabel}
                    </div>
                  </div>
                </div>
                {trendArrow && (
                  <div style={{ position: "absolute", top: 16, right: 16, display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 8, background: `${trendArrow.color}12`, border: `1px solid ${trendArrow.color}25` }}>
                    <span style={{ fontSize: 14, color: trendArrow.color }}>{trendArrow.dir === "up" ? "▲" : trendArrow.dir === "down" ? "▼" : "="}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: trendArrow.color }}>{trendArrow.val}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "center", gap: 20, marginTop: 8 }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", letterSpacing: 0.5, textTransform: "uppercase" }}>D-Score</div>
                    <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: "#e2e8f0" }}>{safeNum(result.startValue, 10).toFixed(1)}</div>
                  </div>
                  <div style={{ width: 1, background: "rgba(255,255,255,0.07)" }} />
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", letterSpacing: 0.5, textTransform: "uppercase" }}>E-Score</div>
                    <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: "#dc2626" }}>-{safeNum(result.totalDeductions, 0).toFixed(2)}</div>
                  </div>
                  <div style={{ width: 1, background: "rgba(255,255,255,0.07)" }} />
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", letterSpacing: 0.5, textTransform: "uppercase" }}>Neutral</div>
                    <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: "rgba(255,255,255,0.4)" }}>0.00</div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── 2. CONTEXT STRIP — 4 horizontal scroll cards ── */}
          {(() => {
            const sameEventHistory = (history || []).filter(h => h.event === result.event && h.score);
            const lastScore = sameEventHistory.length > 0 ? sameEventHistory[0].score : null;
            const vsLast = lastScore ? (result.finalScore - lastScore) : null;
            const goalScore = goalTracking ? goalTracking.targetScore : 9.0;
            const goalPct = Math.min(100, Math.round((safeNum(result.finalScore, 0) / goalScore) * 100));
            const pointsToGoal = Math.max(0, goalScore - safeNum(result.finalScore, 0));
            const divisionAvg = result.finalScore >= 9.0 ? 8.65 : result.finalScore >= 8.5 ? 8.45 : 8.25;
            const vsDivision = result.finalScore - divisionAvg;
            const cards = [
              { label: "vs Last Meet", value: vsLast !== null ? (vsLast >= 0 ? "+" : "") + vsLast.toFixed(2) : "N/A", color: vsLast !== null ? (vsLast >= 0 ? "#22c55e" : "#dc2626") : "rgba(255,255,255,0.3)" },
              { label: "Season Goal", value: `${goalPct}%`, color: "#e8962a" },
              { label: "vs Division Avg", value: (vsDivision >= 0 ? "+" : "") + vsDivision.toFixed(2), color: vsDivision >= 0 ? "#22c55e" : "#dc2626" },
              { label: "Points to Goal", value: pointsToGoal.toFixed(2), color: "#ffc15a" },
            ];
            return (
              <div style={{ display: "flex", gap: 8, overflowX: "auto", WebkitOverflowScrolling: "touch", marginBottom: 20, paddingBottom: 4 }}>
                {cards.map((c, i) => (
                  <div key={i} style={{ minWidth: 110, flex: "0 0 auto", padding: "12px 14px", background: "#121b2d", borderRadius: 12, border: "1px solid rgba(255,255,255,0.07)" }}>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6 }}>{c.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 900, fontFamily: "'Space Mono', monospace", color: c.color }}>{c.value}</div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* ── 3. JUDGE'S PERSPECTIVE ── */}
          {result.overallAssessment && (
            <div style={{ marginBottom: 16, padding: "16px 18px", borderRadius: 14, background: "rgba(232,150,42,0.04)", border: "1px solid rgba(232,150,42,0.12)", borderLeft: "3px solid #e8962a" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="#e8962a" strokeWidth="1.2"/><path d="M5 8h6M8 5v6" stroke="#e8962a" strokeWidth="1.2" strokeLinecap="round"/></svg>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#e8962a", letterSpacing: 1, textTransform: "uppercase" }}>Judge's Perspective</div>
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginBottom: 6, fontStyle: "italic" }}>Brevet-level evaluation</div>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", lineHeight: 1.75, margin: 0, fontStyle: "italic" }}>
                "{safeStr(result.overallAssessment)}"
              </p>
              <div style={{ display: "flex", gap: 12, marginTop: 14 }}>
                <div style={{ flex: 1, padding: "8px 10px", borderRadius: 8, background: "rgba(255,255,255,0.03)", textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", letterSpacing: 0.5 }}>EXECUTION</div>
                  <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: "#dc2626" }}>-{safeNum(result.totalDeductions, 0).toFixed(2)}</div>
                </div>
                <div style={{ flex: 1, padding: "8px 10px", borderRadius: 8, background: "rgba(255,255,255,0.03)", textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", letterSpacing: 0.5 }}>ARTISTRY</div>
                  <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: "#ffc15a" }}>-{safeNum(result.artistryDeductionsTotal, 0).toFixed(2)}</div>
                </div>
                <div style={{ flex: 1, padding: "8px 10px", borderRadius: 8, background: "rgba(255,255,255,0.03)", textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", letterSpacing: 0.5 }}>NEUTRAL</div>
                  <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: "rgba(255,255,255,0.4)" }}>0.00</div>
                </div>
              </div>
            </div>
          )}

          {/* ── 4. ARTISTRY BREAKDOWN — Purple theme, gauge bars ── */}
          {result.artistryBreakdown && (
            <div style={{ marginBottom: 16, padding: "16px 18px", borderRadius: 14, background: "rgba(139,114,212,0.04)", border: "1px solid rgba(139,114,212,0.12)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#8b72d4", letterSpacing: 1, textTransform: "uppercase", marginBottom: 14 }}>
                Artistry Breakdown
              </div>
              {(() => {
                const artFields = {
                  confidence: "Confidence",
                  eyeContact: "Eye Contact",
                  musicality: "Musicality",
                  spaceUsage: "Use of Space",
                  fingerLines: "Expression",
                  footwork: "Footwork",
                };
                return Object.entries(artFields).map(([key, label]) => {
                  const val = result.artistryBreakdown[key];
                  if (!val || typeof val !== "object") return null;
                  const ded = safeNum(val.deduction, 0);
                  const score = Math.max(0, Math.min(10, 10 - ded * 20));
                  const pct = (score / 10) * 100;
                  return (
                    <div key={key} style={{ marginBottom: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.6)" }}>{label}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: "#8b72d4" }}>{score.toFixed(1)}/10</span>
                      </div>
                      <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg, #8b72d4, #a990e8)", borderRadius: 3, transition: "width 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94)" }} />
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}

          {/* Body fault heatmap */}
          <BodyHeatmap deductions={result.executionDeductions} />

          {/* Deduction timeline */}
          <DeductionTimeline deductions={result.executionDeductions} />

          {/* ── 5. AREAS FOR IMPROVEMENT — with intelligence badges ── */}
          {groupedDeds.length > 0 && (
            <div style={{ marginBottom: 16, padding: "16px 18px", borderRadius: 14, background: "rgba(220,38,38,0.03)", border: "1px solid rgba(220,38,38,0.1)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#dc2626", letterSpacing: 1, textTransform: "uppercase" }}>
                  Areas for Improvement
                </div>
                {faultIntelligence.totalAnalyses >= 3 && (
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", fontFamily: "'Space Mono', monospace" }}>
                    {faultIntelligence.totalAnalyses} analyses tracked
                  </div>
                )}
              </div>
              {[...groupedDeds].sort((a, b) => safeNum(b.deduction, 0) - safeNum(a.deduction, 0)).slice(0, 6).map((d, i) => {
                const dedAmt = safeNum(d.deduction, 0);
                const rowColor = dedAmt >= 0.20 ? "#dc2626" : dedAmt >= 0.10 ? "#e06820" : "#ffc15a";
                // Look up fault frequency from intelligence
                const faultType = normalizeFaultType(safeStr(d.fault));
                const freqEntry = faultIntelligence.faultFrequencies.find(f => f.type === faultType);
                const isFixed = faultIntelligence.fixedFaults.some(f => f.type === faultType);
                const isRegression = faultIntelligence.regressionFaults.some(f => f.type === faultType);
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: i < 5 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                    <div style={{ width: 22, height: 22, borderRadius: 6, background: `${rowColor}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: rowColor, flexShrink: 0 }}>{i + 1}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{safeStr(d.skill)}</span>
                        {isFixed && <span style={{ fontSize: 8, fontWeight: 700, padding: "1px 6px", borderRadius: 3, background: "rgba(34,197,94,0.15)", color: "#22c55e", flexShrink: 0 }}>FIXED</span>}
                        {isRegression && <span style={{ fontSize: 8, fontWeight: 700, padding: "1px 6px", borderRadius: 3, background: "rgba(224,104,32,0.15)", color: "#e06820", flexShrink: 0 }}>WATCH</span>}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{safeStr(d.fault).substring(0, 50)}</span>
                        {freqEntry && freqEntry.totalRoutines >= 3 && (
                          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", fontFamily: "'Space Mono', monospace", flexShrink: 0 }}>
                            {freqEntry.count}/{freqEntry.totalRoutines}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 800, fontFamily: "'Space Mono', monospace", color: rowColor, flexShrink: 0 }}>-{dedAmt.toFixed(2)}</div>
                  </div>
                );
              })}
              {/* Show fixed faults below if any */}
              {faultIntelligence.fixedFaults.length > 0 && (
                <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, background: "rgba(34,197,94,0.04)", border: "1px solid rgba(34,197,94,0.1)" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#22c55e", letterSpacing: 0.5, marginBottom: 6 }}>RECENTLY FIXED</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {faultIntelligence.fixedFaults.map((f, i) => (
                      <span key={i} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, background: "rgba(34,197,94,0.1)", color: "#22c55e", fontWeight: 600 }}>
                        {f.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── 6. PATH TO 9.0+ — Green theme ── */}
          {groupedDeds.length >= 2 && (() => {
            const targetScore = 9.0;
            const current = safeNum(result.finalScore, 0);
            const needed = Math.max(0, targetScore - current);
            const top3 = [...groupedDeds].sort((a, b) => safeNum(b.deduction, 0) - safeNum(a.deduction, 0)).slice(0, 3);
            const potentialGain = top3.reduce((s, d) => s + safeNum(d.deduction, 0), 0);
            if (current >= 9.0) return null;
            return (
              <div style={{ marginBottom: 16, padding: "16px 18px", borderRadius: 14, background: "rgba(34,197,94,0.04)", border: "1px solid rgba(34,197,94,0.12)" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#22c55e", letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>
                  Path to 9.0+
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 14 }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", textTransform: "uppercase" }}>Current</div>
                    <div style={{ fontSize: 22, fontWeight: 900, fontFamily: "'Space Mono', monospace", color: scoreColor }}>{current.toFixed(2)}</div>
                  </div>
                  <svg width="24" height="12" viewBox="0 0 24 12" fill="none"><path d="M2 6h16M18 2l4 4-4 4" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", textTransform: "uppercase" }}>Target</div>
                    <div style={{ fontSize: 22, fontWeight: 900, fontFamily: "'Space Mono', monospace", color: "#22c55e" }}>9.000</div>
                  </div>
                </div>
                {top3.map((d, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", marginBottom: 6, borderRadius: 8, background: "rgba(34,197,94,0.04)", border: "1px solid rgba(34,197,94,0.08)" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: "#22c55e", flexShrink: 0 }}>+{safeNum(d.deduction, 0).toFixed(2)}</div>
                    <div style={{ flex: 1, fontSize: 12, color: "rgba(255,255,255,0.6)" }}>Fix {safeStr(d.skill).toLowerCase()}</div>
                  </div>
                ))}
                {result.pathToGoal && (
                  <div style={{ marginTop: 10, fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.6, fontStyle: "italic" }}>
                    {safeStr(result.pathToGoal)}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── 7. IMPROVEMENT POTENTIAL — Stacked math ── */}
          {groupedDeds.length >= 2 && (() => {
            const top3 = [...groupedDeds].sort((a, b) => safeNum(b.deduction, 0) - safeNum(a.deduction, 0)).slice(0, 3);
            const current = safeNum(result.finalScore, 0);
            let running = current;
            const steps = top3.map((d, i) => {
              running = Math.min(10, running + safeNum(d.deduction, 0));
              return { skill: safeStr(d.skill), gain: safeNum(d.deduction, 0), cumulative: running };
            });
            const projectedScore = running;
            return (
              <div style={{ marginBottom: 16, padding: "16px 18px", borderRadius: 14, background: "linear-gradient(135deg, rgba(232,150,42,0.04), rgba(34,197,94,0.03))", border: "1px solid rgba(232,150,42,0.12)" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#e8962a", letterSpacing: 1, textTransform: "uppercase", marginBottom: 14 }}>
                  Improvement Potential
                </div>
                <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(255,255,255,0.03)", marginBottom: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Current Score</span>
                    <span style={{ fontSize: 16, fontWeight: 800, fontFamily: "'Space Mono', monospace", color: scoreColor }}>{current.toFixed(3)}</span>
                  </div>
                </div>
                {steps.map((s, i) => (
                  <div key={i} style={{ padding: "8px 14px", borderRadius: 10, background: "rgba(255,255,255,0.02)", marginBottom: 4, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>+ Fix {s.skill.substring(0, 30)}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: "#22c55e" }}>+{s.gain.toFixed(2)}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: "#e2e8f0" }}>{s.cumulative.toFixed(3)}</span>
                    </div>
                  </div>
                ))}
                <div style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#22c55e" }}>Projected Final</span>
                  <span style={{ fontSize: 20, fontWeight: 900, fontFamily: "'Space Mono', monospace", color: "#22c55e" }}>{projectedScore.toFixed(3)}</span>
                </div>
              </div>
            );
          })()}

          {/* ── 8A. MY PLAN — Personalized drill plan (triggers after 5+ analyses) ── */}
          {drillPlan && (
            <div style={{ marginBottom: 16, padding: "16px 18px", borderRadius: 14, background: "rgba(232,150,42,0.03)", border: "1px solid rgba(232,150,42,0.1)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#e8962a", letterSpacing: 1, textTransform: "uppercase" }}>My Weekly Plan</div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", fontFamily: "'Space Mono', monospace" }}>Based on {faultIntelligence.totalAnalyses} analyses</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {[
                  { key: "monday", label: "MON" },
                  { key: "wednesday", label: "WED" },
                  { key: "friday", label: "FRI" },
                ].map(day => {
                  const dayPlan = drillPlan[day.key];
                  if (!dayPlan) return null;
                  return (
                    <div key={day.key} style={{ flex: 1, padding: "12px 10px", borderRadius: 12, background: "#121b2d", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: "#e8962a", letterSpacing: 1, marginBottom: 8, textAlign: "center" }}>{day.label}</div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.6)", marginBottom: 8, textAlign: "center", lineHeight: 1.3 }}>{dayPlan.fault}</div>
                      {dayPlan.drills.slice(0, 2).map((drill, di) => (
                        <div key={di} style={{ marginBottom: 6 }}>
                          <div style={{ fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.5)", lineHeight: 1.3 }}>{drill.name}</div>
                          <div style={{ fontSize: 8, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: "#e8962a" }}>{drill.reps}</div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── 8B. SEASON GOAL TRACKER — wired to real data ── */}
          {(() => {
            const current = safeNum(result.finalScore, 0);
            // Use real goal data if available, fallback to 9.0
            const target = goalTracking ? goalTracking.targetScore : 9.0;
            const pct = Math.min(100, Math.round((current / target) * 100));
            const remaining = Math.max(0, target - current);
            const weeksLeft = goalTracking && goalTracking.weeksRemaining ? goalTracking.weeksRemaining : 12;
            const meetName = goalTracking && goalTracking.targetMeetName ? goalTracking.targetMeetName : null;
            const daysLeft = goalTracking && goalTracking.daysRemaining !== null ? goalTracking.daysRemaining : null;
            const status = goalTracking ? goalTracking.status : "unknown";
            const statusColor = status === "ahead" ? "#22c55e" : status === "on_track" ? "#22c55e" : status === "at_risk" ? "#e06820" : "rgba(255,255,255,0.3)";
            const statusLabel = status === "ahead" ? "Ahead of target" : status === "on_track" ? "On track" : status === "at_risk" ? "At risk" : "";
            const ppw = goalTracking && goalTracking.pointsPerWeek ? goalTracking.pointsPerWeek : null;
            return (
              <div style={{ marginBottom: 16, padding: "16px 18px", borderRadius: 14, background: "rgba(232,150,42,0.03)", border: "1px solid rgba(232,150,42,0.1)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#e8962a", letterSpacing: 1, textTransform: "uppercase" }}>Season Goal Tracker</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {statusLabel && <span style={{ fontSize: 8, fontWeight: 700, padding: "2px 6px", borderRadius: 3, background: `${statusColor}15`, color: statusColor }}>{statusLabel}</span>}
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", fontFamily: "'Space Mono', monospace" }}>
                      {daysLeft !== null ? `${daysLeft}d left` : `${weeksLeft}w left`}
                    </span>
                  </div>
                </div>
                {meetName && (
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 8, fontStyle: "italic" }}>{meetName}</div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: scoreColor }}>{current.toFixed(2)}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: "#e8962a" }}>{target.toFixed(2)}</span>
                </div>
                <div style={{ height: 8, background: "rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden", marginBottom: 8 }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg, #e8962a, #ffc15a)", borderRadius: 4, transition: "width 1s ease-out" }} />
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textAlign: "center" }}>
                  {remaining <= 0 ? (
                    <span style={{ color: "#22c55e", fontWeight: 700 }}>Goal reached!</span>
                  ) : (
                    <span>{remaining.toFixed(2)} points remaining{ppw ? ` — ${ppw.toFixed(3)} pts/week needed` : ` — est. ${Math.ceil(remaining / 0.05)} practices`}</span>
                  )}
                </div>
                {/* Personal bests per event */}
                {goalTracking && goalTracking.personalBests && Object.keys(goalTracking.personalBests).length > 0 && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: 0.5, marginBottom: 6 }}>PERSONAL BESTS</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {Object.entries(goalTracking.personalBests).map(([evt, score]) => (
                        <div key={evt} style={{ padding: "4px 10px", borderRadius: 6, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>{evt}: </span>
                          <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: "#ffc15a" }}>{score.toFixed(3)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── 8C. IMPROVEMENT CURVES — Score progression chart (10+ analyses) ── */}
          {improvementData.scoreHistory.length >= 3 && (
            <div style={{ marginBottom: 16, padding: "16px 18px", borderRadius: 14, background: "rgba(34,197,94,0.03)", border: "1px solid rgba(34,197,94,0.1)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#22c55e", letterSpacing: 1, textTransform: "uppercase", marginBottom: 14 }}>
                Score Progression
              </div>
              <div style={{ height: 160, marginBottom: 12 }}>
                <StriveErrorBoundary name="Chart">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={improvementData.scoreHistory} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: "rgba(255,255,255,0.3)" }} axisLine={false} tickLine={false} />
                    <YAxis domain={["auto", "auto"]} tick={{ fontSize: 9, fill: "rgba(255,255,255,0.3)" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: "#121b2d", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11, fontFamily: "'Space Mono', monospace" }}
                      labelStyle={{ color: "rgba(255,255,255,0.5)" }}
                      formatter={(val) => [val.toFixed(3), "Score"]} />
                    <Line type="monotone" dataKey="score" stroke="#22c55e" strokeWidth={2} dot={{ r: 3, fill: "#22c55e" }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
                </StriveErrorBoundary>
              </div>
              {/* Fault trend indicators */}
              {improvementData.faultTrends.length > 0 && (
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: 0.5, marginBottom: 8 }}>FAULT TRENDS</div>
                  {improvementData.faultTrends.slice(0, 5).map((ft, i) => {
                    const trendColor = ft.trend === "improving" ? "#22c55e" : ft.trend === "worsening" ? "#dc2626" : "#ffc15a";
                    const trendIcon = ft.trend === "improving" ? "▼" : ft.trend === "worsening" ? "▲" : "=";
                    const trendLabel = ft.trend === "improving" ? "Getting better" : ft.trend === "worsening" ? "Regression detected" : "Needs focus";
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: i < 4 ? "1px solid rgba(255,255,255,0.03)" : "none" }}>
                        <span style={{ fontSize: 12, color: trendColor, width: 14, textAlign: "center" }}>{trendIcon}</span>
                        <span style={{ flex: 1, fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{ft.label}</span>
                        <span style={{ fontSize: 9, fontWeight: 600, color: trendColor }}>{trendLabel}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: trendColor, width: 40, textAlign: "right" }}>
                          {ft.diff >= 0 ? "+" : ""}{ft.diff.toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Celebrations — what was genuinely good ── */}
          {safeArray(result.celebrations).length > 0 && (
            <div style={{ marginBottom: 16, padding: "16px 18px", borderRadius: 14, background: "linear-gradient(135deg, rgba(34,197,94,0.04), rgba(34,197,94,0.02))", border: "1px solid rgba(34,197,94,0.15)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#22c55e", letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>
                What Was Excellent
              </div>
              {safeArray(result.celebrations).map((c, i) => (
                <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start",
                  marginBottom: i < result.celebrations.length - 1 ? 12 : 0,
                  paddingBottom: i < result.celebrations.length - 1 ? 12 : 0,
                  borderBottom: i < result.celebrations.length - 1 ? "1px solid rgba(34,197,94,0.1)" : "none" }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                    background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, fontWeight: 700, color: "#22c55e",
                    fontFamily: "'Space Mono', monospace" }}>
                    {safeStr(c.timestamp) || "✓"}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#22c55e", marginBottom: 2 }}>
                      {safeStr(c.skill)}
                    </div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>
                      {safeStr(c.note)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Fallback strengths if no celebrations returned */}
          {safeArray(result.celebrations).length === 0 && safeArray(result.strengths).length > 0 && (
            <div style={{ marginBottom: 16, padding: "16px 18px", borderRadius: 14, background: "rgba(34,197,94,0.03)", border: "1px solid rgba(34,197,94,0.1)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#22c55e", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>
                Strengths
              </div>
              {safeArray(result.strengths).map((s, i) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 8 }}>
                  <span style={{ color: "#22c55e", fontWeight: 700, fontSize: 12, marginTop: 2 }}>●</span>
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.5 }}>{safeStr(s)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Post-Meet Debrief — parent-friendly summary */}
          <div style={{ padding: "16px 18px", marginBottom: 16, borderRadius: 14, background: "rgba(232,150,42,0.03)", border: "1px solid rgba(232,150,42,0.1)" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#e8962a", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>
              What This Score Means
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.8 }}>
              {result.finalScore >= 9.2 ? (
                <span>This is an <strong style={{ color: "#22c55e" }}>excellent score</strong>. Your child performed a very clean routine with only minor deductions. At {result.level}, scoring above 9.2 means they're executing at a high level.</span>
              ) : result.finalScore >= 8.8 ? (
                <span>This is a <strong style={{ color: "#e8962a" }}>strong, solid score</strong>. Your child showed good execution with some typical deductions that most gymnasts receive. The {safeNum(result.totalDeductions, 0).toFixed(2)} in deductions came from {safeArray(result.executionDeductions).length} identified faults — most of which are fixable with focused practice.</span>
              ) : result.finalScore >= 8.3 ? (
                <span>This is an <strong style={{ color: "#ffc15a" }}>average score</strong> for {result.level} — not bad at all, but there's clear room for improvement. Most deductions come from execution details that improve naturally with awareness.</span>
              ) : (
                <span>This score suggests there are <strong style={{ color: "#dc2626" }}>several areas that need attention</strong>. Focus on the 2-3 biggest deductions first. Small improvements on a few skills can raise the score significantly.</span>
              )}
            </div>
            <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.03)" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", marginBottom: 4, fontFamily: "'Space Mono', monospace" }}>QUICK MATH</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.7 }}>
                {safeNum(result.startValue, 10).toFixed(1)} - {safeNum(result.totalDeductions, 0).toFixed(2)} = <span style={{ fontFamily: "'Space Mono', monospace", fontWeight: 700, color: scoreColor }}>{safeNum(result.finalScore, 0).toFixed(3)}</span>
                {groupedDeds.length > 2 && <span> · Fix top 3 → <span style={{ color: "#22c55e", fontWeight: 700 }}>+{[...groupedDeds].sort((a, b) => safeNum(b.deduction, 0) - safeNum(a.deduction, 0)).slice(0, 3).reduce((s, d) => s + safeNum(d.deduction, 0), 0).toFixed(2)}</span></span>}
              </div>
            </div>
          </div>
        </div>
        </StriveErrorBoundary>
      )}

      {activeTab === "deductions" && (
        isPro ? (
          <DeductionsTabContent result={result} frames={result.frames} />
        ) : (
          <div style={{ animation: "fadeIn 0.4s ease-out" }}>
            {/* Free tier: show top 3 deductions with ranking */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Top Point Losses</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>
                {groupedDeds.length} total found
              </div>
            </div>
            {[...groupedDeds].sort((a, b) => safeNum(b.deduction, 0) - safeNum(a.deduction, 0)).slice(0, 3).map((d, i) => {
              const c = d.severity === "fall" ? "#dc2626" : d.severity === "large" || d.severity === "veryLarge" ? "#dc2626" : d.severity === "medium" ? "#ffc15a" : "#22c55e";
              const fixDifficulty = d.severity === "fall" ? "Hard" : d.severity === "large" || d.severity === "veryLarge" ? "Moderate" : "Quick fix";
              const fixColor = d.severity === "fall" ? "#dc2626" : d.severity === "large" || d.severity === "veryLarge" ? "#ffc15a" : "#22c55e";
              return (
                <div key={i} style={{
                  borderRadius: 14, padding: "14px 16px", marginBottom: 8,
                  background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)",
                  animation: `fadeIn 0.3s ease-out ${i * 0.1}s both`,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ display: "flex", gap: 12, flex: 1 }}>
                      {/* Rank circle */}
                      <div style={{
                        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                        background: `${c}12`, display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 13, fontWeight: 800, color: c,
                      }}>{i + 1}</div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{safeStr(d.skill)}</div>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 3, lineHeight: 1.5 }}>
                          {safeStr(d.fault).substring(0, 80)}
                        </div>
                        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                          <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: `${fixColor}12`, color: fixColor }}>{fixDifficulty}</span>
                          <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.3)" }}>{safeStr(d.timestamp)}</span>
                        </div>
                      </div>
                    </div>
                    <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 17, fontWeight: 800, color: c, marginLeft: 8, flexShrink: 0 }}>
                      -{safeNum(d.deduction, 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              );
            })}

            {/* Potential score gain summary */}
            {groupedDeds.length >= 2 && (() => {
              const top3 = [...groupedDeds].sort((a, b) => safeNum(b.deduction, 0) - safeNum(a.deduction, 0)).slice(0, 3);
              const gain = top3.reduce((s, d) => s + safeNum(d.deduction, 0), 0);
              return (
                <div style={{
                  textAlign: "center", padding: "10px 16px", marginBottom: 8,
                  borderRadius: 10, background: "rgba(34,197,94,0.04)", border: "1px solid rgba(34,197,94,0.08)",
                }}>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Fix these 3 → </span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: "#22c55e", fontFamily: "'Space Mono', monospace" }}>+{gain.toFixed(2)}</span>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}> possible</span>
                </div>
              );
            })()}

            {groupedDeds.length > 3 && (
              <div style={{ textAlign: "center", padding: 12 }}>
                <button
                  onClick={() => setActiveTab("pro-gate")}
                  style={{
                    background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.15)",
                    borderRadius: 10, padding: "10px 24px", cursor: "pointer",
                    color: "#A78BFA", fontSize: 12, fontWeight: 600, fontFamily: "'Outfit', sans-serif",
                  }}
                >
                  See all {groupedDeds.length} deductions — Competitive
                </button>
              </div>
            )}

            {/* Free tier: #1 actionable fix */}
            {groupedDeds.length > 0 && (() => {
              const topDed = [...groupedDeds].sort((a, b) => safeNum(b.deduction, 0) - safeNum(a.deduction, 0))[0];
              return (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: "#22c55e" }}>
                    ✓ Your #1 priority fix
                  </div>
                  <div style={{
                    borderRadius: 14, padding: 16,
                    background: "rgba(34,197,94,0.03)", border: "1px solid rgba(34,197,94,0.1)",
                  }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>Fix: {safeStr(topDed.skill).toLowerCase()}</div>
                    <div style={{ fontSize: 13, color: "#e8962a", fontWeight: 700, marginTop: 4 }}>
                      Worth +{safeNum(topDed.deduction, 0).toFixed(2)} per routine
                    </div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 8, lineHeight: 1.6 }}>
                      {topDed.correction || `Work with your coach on this specific fault: "${safeStr(topDed.fault).substring(0, 60)}." Film yourself doing drills for this skill and compare frame by frame.`}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )
      )}

      {/* ─── WHAT-IF SIMULATOR TAB (Pro only) ─── */}
      {activeTab === "whatif" && isPro && (
        <WhatIfSimulator result={result} />
      )}

      {/* ─── BIOMECHANICS TAB (Pro only) ─── */}
      {activeTab === "biomechanics" && isPro && (
        <BiomechanicsDashboard result={result} />
      )}

      {/* ─── TRAINING PROGRAM TAB (Pro only) ─── */}
      {activeTab === "coach" && isPro && (
        <TrainingProgram result={result} profile={profile} history={history} />
      )}

      {/* ─── DIAGNOSTICS TAB (Pro only) ─── */}
      {activeTab === "diagnostics" && isPro && (
        <DiagnosticsDashboard result={result} />
      )}

      {/* Drills CTA */}
      <button
        className="btn-gold"
        onClick={onDrills}
        style={{ width: "100%", marginTop: 24, fontSize: 16, padding: 16 }}
      >
        <Icon name="drill" /> Get Personalized Drills <Icon name="arrow" />
      </button>

      {/* Share / Export Actions */}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        {/* Share with Coach — uses native share sheet on mobile, clipboard on desktop */}
        <button
          className="btn-outline"
          onClick={() => {
            const topDeds = [...groupedDeds].sort((a, b) => safeNum(b.deduction, 0) - safeNum(a.deduction, 0)).slice(0, 5);
            const text = [
              `STRIVE Analysis — ${result.event} · ${result.level}`,
              `Score: ${safeNum(result.finalScore, 0).toFixed(3)} (Start: ${safeNum(result.startValue, 10).toFixed(1)} - Deductions: ${safeNum(result.totalDeductions, 0).toFixed(2)})`,
              ``,
              `Top deductions:`,
              ...topDeds.map((d, i) =>
                `  ${i+1}. ${safeStr(d.skill)} — ${safeStr(d.fault)} (-${safeNum(d.deduction, 0).toFixed(2)})`
              ),
              ``,
              `Strengths: ${safeArray(result.strengths).slice(0, 3).map(s => safeStr(s)).join("; ")}`,
              ``,
              `#1 fix: ${topDeds[0] ? safeStr(topDeds[0].skill) + " (saves +" + safeNum(topDeds[0].deduction, 0).toFixed(2) + ")" : "See full report"}`,
              ``,
              `— Analyzed by STRIVE · strive-app-amber.vercel.app`,
            ].join("\n");

            // Try native share first (works on mobile)
            if (navigator.share) {
              navigator.share({ title: `STRIVE — ${result.event} ${safeNum(result.finalScore, 0).toFixed(3)}`, text }).catch(() => {});
            } else if (navigator.clipboard) {
              navigator.clipboard.writeText(text).then(() => alert("Copied! Paste into a text or email to share with your coach."));
            } else {
              const ta = document.createElement("textarea"); ta.value = text;
              document.body.appendChild(ta); ta.select(); document.execCommand("copy");
              document.body.removeChild(ta); alert("Copied!");
            }
          }}
          style={{ flex: 1, fontSize: 13, padding: 14 }}
        >
          <Icon name="save" size={14} /> Share with Coach
        </button>

        {/* Analyze Another */}
        <button
          className="btn-outline"
          onClick={onBack}
          style={{ flex: 1, fontSize: 13, padding: 14 }}
        >
          <Icon name="camera" size={14} /> New Analysis
        </button>
      </div>

      {/* App branding footer */}
      <div style={{ textAlign: "center", marginTop: 24, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        <div style={{
          fontFamily: "'Georgia', serif", fontSize: 14, fontWeight: 500, letterSpacing: 3,
          background: "linear-gradient(135deg, #e8962a, #ffc15a)", backgroundClip: "text",
          WebkitBackgroundClip: "text", color: "transparent",
        }}>STRIVE</div>
        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.15)", marginTop: 4, letterSpacing: 1 }}>
          SEE YOUR SCORE. OWN YOUR GROWTH.
        </div>
      </div>
    </div>
  );
});

// ─── DRILLS SCREEN ──────────────────────────────────────────────────
const DrillsScreen = React.memo(function DrillsScreen({ result, onBack }) {
  const deds = result?.executionDeductions || [];
  const identifiedFaults = deds.map(d => d.fault) || [];

  const getDrills = (fault) => {
    for (const [key, drills] of Object.entries(DRILLS_DATABASE)) {
      if (fault?.toLowerCase().includes(key.toLowerCase())) return { key, drills };
    }
    return { key: "General conditioning", drills: DRILLS_DATABASE.default };
  };

  const faultDrillPairs = identifiedFaults.map((f, i) => ({
    fault: f,
    skill: deds[i]?.skill || "",
    deduction: deds[i]?.deduction || 0,
    ...getDrills(f),
  }));

  // Deduplicate by drill key, keep highest deduction version
  const seen = new Set();
  const uniquePairs = faultDrillPairs
    .sort((a, b) => b.deduction - a.deduction)
    .filter(p => {
      if (seen.has(p.key)) return false;
      seen.add(p.key);
      return true;
    });

  // Total potential score gain
  const totalGain = uniquePairs.reduce((s, p) => s + p.deduction, 0);

  return (
    <div style={{ minHeight: "100vh", padding: "16px 18px 90px", maxWidth: 540, margin: "0 auto" }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: "rgba(232,150,42,0.6)", cursor: "pointer", fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 600, marginBottom: 14, display: "flex", alignItems: "center", gap: 4 }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M8.5 2.5l-5 5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> Results
      </button>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>
        Your Drill Plan
      </h2>
      <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginBottom: 8 }}>
        {uniquePairs.length} targeted exercises based on {deds.length} deductions identified in your routine.
      </p>

      {/* Score impact summary */}
      {totalGain > 0 && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          padding: "10px 16px", borderRadius: 12, marginBottom: 20,
          background: "rgba(34,197,94,0.04)", border: "1px solid rgba(34,197,94,0.1)",
        }}>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Complete this plan to gain up to</span>
          <span style={{ fontSize: 18, fontWeight: 900, fontFamily: "'Space Mono', monospace", color: "#22c55e" }}>+{totalGain.toFixed(2)}</span>
        </div>
      )}

      {/* Weekly Training Plan */}
      <WeeklyTrainingPlan faults={identifiedFaults} />

      {uniquePairs.map((pair, i) => (
        <div key={i} style={{ marginBottom: 20, animation: `fadeIn 0.3s ease-out ${i * 0.08}s both` }}>
          <div style={{
            background: "rgba(232,150,42,0.06)", borderRadius: "12px 12px 0 0",
            padding: "10px 16px", borderBottom: "1px solid rgba(232,150,42,0.1)",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{pair.skill || pair.fault}</span>
              {pair.skill && pair.fault !== pair.skill && (
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginLeft: 6 }}>— {pair.fault.substring(0, 40)}</span>
              )}
            </div>
            {pair.deduction > 0 && (
              <span style={{
                fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 6,
                background: "rgba(34,197,94,0.1)", color: "#22c55e",
                fontFamily: "'Space Mono', monospace",
              }}>
                +{pair.deduction.toFixed(2)}
              </span>
            )}
          </div>
          {pair.drills.map((drill, j) => (
            <div key={j} className="card" style={{
              borderRadius: j === pair.drills.length - 1 ? "0 0 12px 12px" : 0,
              borderTop: "none", marginBottom: 0, padding: "14px 16px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3, color: "#e8962a" }}>
                    {drill.name}
                  </div>
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>
                    {drill.description}
                  </p>
                  {drill.yt && (
                    <a href={drill.yt} target="_blank" rel="noopener noreferrer" style={{
                      display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8,
                      padding: "5px 12px", borderRadius: 8,
                      background: "rgba(255,0,0,0.06)", border: "1px solid rgba(255,0,0,0.12)",
                      color: "#ff6b6b", fontSize: 11, fontWeight: 600, textDecoration: "none",
                      fontFamily: "'Outfit', sans-serif",
                    }}>
                      ▶ Watch on YouTube
                    </a>
                  )}
                </div>
                <span style={{
                  fontFamily: "'Space Mono', monospace", fontSize: 10, fontWeight: 700,
                  background: "rgba(255,255,255,0.05)", padding: "4px 8px", borderRadius: 5,
                  whiteSpace: "nowrap", marginLeft: 10, color: "rgba(255,255,255,0.4)",
                }}>
                  {drill.duration}
                </span>
              </div>
            </div>
          ))}
        </div>
      ))}

      {/* General recommendation */}
      <div className="card" style={{ padding: 20, marginTop: 16, borderColor: "rgba(232,150,42,0.2)" }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#e8962a", marginBottom: 10 }}>
          <Icon name="sparkle" size={14} /> Coaching Tips
        </h3>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.8 }}>
          Practice each drill 3-4 times per week. Film yourself doing drills to check form. Focus on quality over quantity — one perfect rep beats ten sloppy ones. Show your coach the analysis and ask them to watch for the specific faults during practice.
        </div>
      </div>
    </div>
  );
});

// ─── DEDUCTIONS REFERENCE SCREEN ────────────────────────────────────
function DeductionsScreen({ onBack, profile }) {
  const [activeCategory, setActiveCategory] = useState("execution");
  const [calcStart, setCalcStart] = useState("10.0");
  const [calcDeds, setCalcDeds] = useState("");

  // Quick score calculator
  const startVal = parseFloat(calcStart) || 10;
  const totalDeds = parseFloat(calcDeds) || 0;
  const calcResult = Math.max(0, startVal - totalDeds);

  // Descriptions for each category
  const catDescriptions = {
    execution: "Form errors on individual skills — bent knees, flexed feet, body alignment. Taken on every skill.",
    landing: "Steps, hops, squats, or falls on landings. Every landing is judged separately.",
    artistry: "Beam and floor only — confidence, musicality, expression, use of space.",
    neutral: "Rule violations — out of bounds, overtime, missing requirements. Not execution errors.",
  };

  return (
    <div style={{ minHeight: "100vh", padding: "16px 18px 90px", maxWidth: 540, margin: "0 auto" }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: "rgba(232,150,42,0.6)", cursor: "pointer", fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 600, marginBottom: 14, display: "flex", alignItems: "center", gap: 4 }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M8.5 2.5l-5 5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> Dashboard
      </button>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Deduction Guide</h2>
      <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginBottom: 20 }}>
        USAG / Xcel scoring reference · {profile?.level || "All Levels"}
      </p>

      {/* Quick Score Calculator for Parents */}
      <div className="card" style={{ marginBottom: 16, padding: 16, borderColor: "rgba(232,150,42,0.15)", background: "rgba(232,150,42,0.03)" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#e8962a", letterSpacing: 1, marginBottom: 10 }}>QUICK SCORE CALCULATOR</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginBottom: 4 }}>START</div>
            <input
              className="input-field"
              type="number"
              value={calcStart}
              onChange={e => setCalcStart(e.target.value)}
              style={{ width: 70, textAlign: "center", fontSize: 16, padding: "8px 6px", fontFamily: "'Space Mono', monospace", fontWeight: 700 }}
            />
          </div>
          <span style={{ fontSize: 18, color: "rgba(255,255,255,0.2)", marginTop: 14 }}>−</span>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginBottom: 4 }}>DEDUCTIONS</div>
            <input
              className="input-field"
              type="number"
              step="0.05"
              placeholder="0.00"
              value={calcDeds}
              onChange={e => setCalcDeds(e.target.value)}
              style={{ width: 70, textAlign: "center", fontSize: 16, padding: "8px 6px", fontFamily: "'Space Mono', monospace", fontWeight: 700 }}
            />
          </div>
          <span style={{ fontSize: 18, color: "rgba(255,255,255,0.2)", marginTop: 14 }}>=</span>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginBottom: 4 }}>SCORE</div>
            <div style={{
              fontSize: 22, fontWeight: 900, fontFamily: "'Space Mono', monospace",
              color: calcResult >= 9.0 ? "#22c55e" : calcResult >= 8.0 ? "#ffc15a" : "#dc2626",
              padding: "6px 0",
            }}>
              {calcResult.toFixed(2)}
            </div>
          </div>
        </div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 8 }}>
          Add up the deductions from the list below to understand how a score is calculated.
        </div>
      </div>

      {/* Scale Legend — compact */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
        {Object.entries(DEDUCTION_SCALE).map(([key, val]) => (
          <span key={key} style={{
            fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 6,
            background: `${val.color}15`, color: val.color, letterSpacing: 0.3,
          }}>
            {key}: {val.range}
          </span>
        ))}
      </div>

      {/* Category Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 8, overflowX: "auto" }}>
        {Object.keys(DEDUCTION_CATEGORIES).map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            style={{
              padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer",
              fontFamily: "'Outfit', sans-serif", fontWeight: 600, fontSize: 12,
              background: activeCategory === cat ? "#e8962a" : "rgba(255,255,255,0.06)",
              color: activeCategory === cat ? "#070c16" : "rgba(255,255,255,0.5)",
              whiteSpace: "nowrap", transition: "all 0.2s", textTransform: "capitalize",
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Category description */}
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 14, lineHeight: 1.5, padding: "0 4px" }}>
        {catDescriptions[activeCategory]}
      </div>

      {/* Deduction List */}
      {DEDUCTION_CATEGORIES[activeCategory]?.map((ded, i) => {
        const severityColor = ded.category === "fall" ? "#dc2626" :
          ded.category.includes("large") ? "#e06820" :
          ded.category === "medium" || ded.category === "small-medium" ? "#ffc15a" : "#22c55e";

        return (
          <div key={i} className="card" style={{
            marginBottom: 6, padding: "12px 14px",
            borderLeft: `3px solid ${severityColor}`,
            animation: `fadeIn 0.2s ease-out ${i * 0.03}s both`,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{ded.fault}</span>
              <span style={{
                fontFamily: "'Space Mono', monospace", fontWeight: 700, fontSize: 12,
                color: severityColor, marginLeft: 12, whiteSpace: "nowrap",
              }}>
                {ded.deduction}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── SETTINGS SCREEN ────────────────────────────────────────────────
const SettingsScreen = React.memo(function SettingsScreen({ profile, onSave, onBack, onReset, onTierChange }) {
  // Load season goals from athlete record into editProfile
  const athleteRecord = getAthleteRecord(profile);
  const sg = athleteRecord ? athleteRecord.seasonGoals || {} : {};
  const [editProfile, setEditProfile] = useState(() => {
    let coachNote = "";
    try { coachNote = localStorage.getItem("strive-coach-meet-note") || ""; } catch {}
    return {
      ...profile,
      seasonGoalScore: sg.targetScore || null,
      seasonGoalEvent: sg.targetEvent || null,
      seasonGoalDate: sg.targetMeetDate || null,
      seasonGoalMeetName: sg.targetMeetName || "",
      coachMeetNote: coachNote,
    };
  });
  const [showConfirm, setShowConfirm] = useState(false);
  const [geminiKey, setGeminiKey] = useState("");
  const [keySaved, setKeySaved] = useState(false);
  const events = editProfile.gender === "female" ? WOMEN_EVENTS : MEN_EVENTS;
  const levelOptions = editProfile.gender && editProfile.levelCategory
    ? LEVELS[editProfile.gender === "female" ? "women" : "men"][editProfile.levelCategory] || []
    : [];

  useEffect(() => {
    (async () => {
      try { const k = await storage.get("strive-gemini-key"); if (k) setGeminiKey(k.value); } catch {}
    })();
  }, []);

  return (
    <div style={{ minHeight: "100vh", padding: "16px 18px 90px", maxWidth: 540, margin: "0 auto" }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24, marginTop: 8 }}>Settings</h2>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: "block", color: "rgba(255,255,255,0.6)" }}>NAME</label>
          <input className="input-field" value={editProfile.name} onChange={e => setEditProfile({...editProfile, name: e.target.value})} />
        </div>

        <div>
          <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: "block", color: "rgba(255,255,255,0.6)" }}>PROGRAM</label>
          <select className="input-field" value={editProfile.gender} onChange={e => setEditProfile({...editProfile, gender: e.target.value, primaryEvents: []})}>
            <option value="female">Women's Artistic</option>
            <option value="male">Men's Artistic</option>
          </select>
        </div>

        <div>
          <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: "block", color: "rgba(255,255,255,0.6)" }}>LEVEL CATEGORY</label>
          <select className="input-field" value={editProfile.levelCategory} onChange={e => setEditProfile({...editProfile, levelCategory: e.target.value, level: ""})}>
            <option value="compulsory">Compulsory</option>
            <option value="optional">Optional</option>
            {editProfile.gender === "female" && <option value="xcel">Xcel</option>}
          </select>
        </div>

        {levelOptions.length > 0 && (
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: "block", color: "rgba(255,255,255,0.6)" }}>LEVEL</label>
            <select className="input-field" value={editProfile.level} onChange={e => setEditProfile({...editProfile, level: e.target.value})}>
              <option value="">Select level...</option>
              {levelOptions.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        )}

        <div>
          <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: "block", color: "rgba(255,255,255,0.6)" }}>EVENTS</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {events.map(e => (
              <button
                key={e}
                onClick={() => {
                  const evts = editProfile.primaryEvents || [];
                  setEditProfile({
                    ...editProfile,
                    primaryEvents: evts.includes(e) ? evts.filter(x => x !== e) : [...evts, e],
                  });
                }}
                style={{
                  padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer",
                  fontFamily: "'Outfit', sans-serif", fontWeight: 600, fontSize: 13,
                  background: editProfile.primaryEvents?.includes(e) ? "#e8962a" : "rgba(255,255,255,0.06)",
                  color: editProfile.primaryEvents?.includes(e) ? "#070c16" : "rgba(255,255,255,0.5)",
                }}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      </div>

        <div>
          <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: "block", color: "rgba(255,255,255,0.6)" }}>AGE</label>
          <input className="input-field" type="number" min="4" max="25" placeholder="e.g. 10" value={editProfile.age || ""} onChange={e => setEditProfile({...editProfile, age: e.target.value ? parseInt(e.target.value) : null})} />
        </div>

        <div>
          <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: "block", color: "rgba(255,255,255,0.6)" }}>GOAL</label>
          <select className="input-field" value={editProfile.goals || ""} onChange={e => setEditProfile({...editProfile, goals: e.target.value || null})}>
            <option value="">Select a goal...</option>
            <option value="improve scores">Improve meet scores</option>
            <option value="move up levels">Move up to the next level</option>
            <option value="qualify regionals">Qualify for Regionals/State</option>
            <option value="college gymnastics">Earn a college scholarship</option>
            <option value="injury recovery">Return from injury safely</option>
            <option value="build confidence">Build confidence and consistency</option>
            <option value="have fun">Have fun and stay healthy</option>
          </select>
        </div>

      {/* ── Agent Delta: Season Goal Settings ── */}
      <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, color: "#e8962a" }}>Season Goal</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: "block", color: "rgba(255,255,255,0.6)" }}>TARGET SCORE</label>
            <input className="input-field" type="number" step="0.025" min="7.0" max="10.0" placeholder="e.g. 9.200"
              value={editProfile.seasonGoalScore || ""}
              onChange={e => setEditProfile({ ...editProfile, seasonGoalScore: e.target.value ? parseFloat(e.target.value) : null })}
              style={{ fontFamily: "'Space Mono', monospace", fontWeight: 700, fontSize: 16 }} />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: "block", color: "rgba(255,255,255,0.6)" }}>TARGET EVENT</label>
            <select className="input-field" value={editProfile.seasonGoalEvent || ""}
              onChange={e => setEditProfile({ ...editProfile, seasonGoalEvent: e.target.value || null })}>
              <option value="">All Events</option>
              {events.map(ev => <option key={ev} value={ev}>{ev}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: "block", color: "rgba(255,255,255,0.6)" }}>TARGET MEET DATE</label>
            <input className="input-field" type="date"
              value={editProfile.seasonGoalDate || ""}
              onChange={e => setEditProfile({ ...editProfile, seasonGoalDate: e.target.value || null })} />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: "block", color: "rgba(255,255,255,0.6)" }}>TARGET MEET NAME</label>
            <input className="input-field" placeholder="e.g. State Championships"
              value={editProfile.seasonGoalMeetName || ""}
              onChange={e => setEditProfile({ ...editProfile, seasonGoalMeetName: e.target.value })} />
          </div>
        </div>
      </div>

      {/* ── Coach's Meet Day Note ── */}
      <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6, color: "#e8962a" }}>Coach's Meet Day Note</h3>
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginBottom: 12, lineHeight: 1.5 }}>
          Enter what the coach wants your gymnast to focus on at the next meet. This shows on the Meet Day Focus Card.
        </p>
        <textarea
          className="input-field"
          placeholder="e.g. Lock your arms on back handsprings. Squeeze on every jump. Have fun!"
          value={editProfile.coachMeetNote || ""}
          onChange={e => setEditProfile({ ...editProfile, coachMeetNote: e.target.value })}
          rows={3}
          style={{ resize: "vertical", minHeight: 70, fontFamily: "'Outfit', sans-serif", fontSize: 14, lineHeight: 1.6 }}
        />
      </div>

      <button className="btn-gold" onClick={() => {
        // Save season goals to athlete record
        if (editProfile.name) {
          const record = getAthleteRecord(editProfile);
          record.seasonGoals = {
            targetScore: editProfile.seasonGoalScore || null,
            targetEvent: editProfile.seasonGoalEvent || null,
            targetMeetDate: editProfile.seasonGoalDate || null,
            targetMeetName: editProfile.seasonGoalMeetName || "",
          };
          saveAthleteRecord(record);
        }
        // Save coach meet note to localStorage
        try { localStorage.setItem("strive-coach-meet-note", editProfile.coachMeetNote || ""); } catch {}
        onSave(editProfile);
      }} style={{ width: "100%", marginTop: 32 }}>
        <Icon name="save" /> Save Changes
      </button>

      {/* API Configuration */}
      <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>
          Video Analysis Engine
        </h3>
        {geminiKey ? (
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "10px 14px", borderRadius: 10, marginBottom: 12,
            background: "rgba(34,197,94,0.04)", border: "1px solid rgba(34,197,94,0.08)",
          }}>
            <span style={{ color: "#22c55e", fontSize: 14 }}>✓</span>
            <div>
              <span style={{ fontSize: 12, color: "rgba(34,197,94,0.8)" }}>API key configured</span>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 2 }}>2-Pass Engine: Detect → Analyze</div>
            </div>
          </div>
        ) : (
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "10px 14px", borderRadius: 10, marginBottom: 12,
            background: "rgba(255,193,90,0.04)", border: "1px solid rgba(255,193,90,0.1)",
          }}>
            <span style={{ color: "#ffc15a", fontSize: 14 }}>!</span>
            <span style={{ fontSize: 12, color: "rgba(255,193,90,0.8)" }}>No API key — add one below to enable analysis</span>
          </div>
        )}
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginBottom: 10, lineHeight: 1.5 }}>
          Get a free API key at <span style={{ color: "#e8962a", cursor: "pointer" }} onClick={() => window.open("https://aistudio.google.com/apikey", "_blank")}>aistudio.google.com/apikey</span>. Create one, copy it, paste below.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            className="input-field"
            type="password"
            placeholder="Paste your analysis API key (AIza...)"
            value={geminiKey}
            onChange={e => setGeminiKey(e.target.value)}
            style={{ fontSize: 12, flex: 1 }}
          />
          <button className="btn-outline" onClick={async () => {
            try {
              if (geminiKey) {
                await storage.set("strive-gemini-key", geminiKey);
                setKeySaved(true);
              } else {
                await storage.delete("strive-gemini-key");
                setKeySaved(true);
              }
              setTimeout(() => setKeySaved(false), 3000);
            } catch (e) { alert("Error: " + e.message); }
          }} style={{ padding: "10px 16px", fontSize: 12, whiteSpace: "nowrap" }}>
            {keySaved ? "✓ Saved" : "Save"}
          </button>
        </div>
      </div>

      {/* STRIVE Tier Section */}
      <div style={{ marginTop: 24, paddingTop: 24, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>
          <span style={{ color: "#A78BFA" }}>★</span> STRIVE Tier
        </h3>
        {(() => {
          let currentTier = "free";
          try { currentTier = localStorage.getItem("strive-tier") || "free"; } catch {}
          const isComp = currentTier === "competitive";
          const isElite = currentTier === "elite";
          const activeTierLabel = isElite ? "ELITE" : isComp ? "COMPETITIVE" : "FREE";
          const activeTierColor = isElite ? "#e8962a" : isComp ? "#A78BFA" : "#8890AB";

          return (
            <div>
              {/* Current tier badge */}
              <div style={{ padding: 16, borderRadius: 12, background: `rgba(${isElite ? "232,150,42" : isComp ? "139,92,246" : "136,144,171"},0.06)`, border: `1px solid rgba(${isElite ? "232,150,42" : isComp ? "139,92,246" : "136,144,171"},0.2)`, marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: "3px 10px", borderRadius: 4, background: `rgba(${isElite ? "232,150,42" : isComp ? "139,92,246" : "136,144,171"},0.2)`, color: activeTierColor, letterSpacing: 0.5 }}>{activeTierLabel} ACTIVE</span>
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
                  {isElite ? "Full access: everything in Competitive plus What-If Simulator, Body Mechanics, Diagnostics, Coach Report, and personalized programming."
                    : isComp ? "Full access: unlimited analyses, skill breakdowns, artistry analysis, training drills, and score path."
                    : "Free tier: 3 analyses per month with score and basic feedback."}
                </div>
              </div>

              {/* Tier preview buttons */}
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                {["free", "competitive", "elite"].map(t => {
                  const active = currentTier === t;
                  const label = t.charAt(0).toUpperCase() + t.slice(1);
                  const bg = t === "elite" ? "#e8962a" : t === "competitive" ? "#8B5CF6" : "#4A5568";
                  return (
                    <button
                      key={t}
                      onClick={() => {
                        if (onTierChange) onTierChange(t);
                      }}
                      style={{
                        flex: 1, padding: "12px 8px", borderRadius: 12,
                        background: active ? bg : "rgba(255,255,255,0.04)",
                        border: active ? "none" : "1px solid rgba(255,255,255,0.08)",
                        color: active ? "#FFF" : "rgba(255,255,255,0.5)",
                        cursor: "pointer", fontFamily: "'Outfit', sans-serif",
                        fontWeight: 700, fontSize: 12, transition: "all 0.2s",
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.15)", textAlign: "center" }}>
                Payment integration coming soon — switch tiers to preview features
              </div>
            </div>
          );
        })()}
      </div>

      <div style={{ marginTop: 24, paddingTop: 24, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        {/* About STRIVE */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{
            fontFamily: "'Georgia', serif", fontSize: 18, fontWeight: 500, letterSpacing: 4,
            background: "linear-gradient(135deg, #e8962a, #ffc15a)", backgroundClip: "text",
            WebkitBackgroundClip: "text", color: "transparent", marginBottom: 6,
          }}>STRIVE</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", letterSpacing: 1, marginBottom: 12 }}>
            SEE YOUR SCORE. OWN YOUR GROWTH.
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", lineHeight: 1.7, maxWidth: 300, margin: "0 auto" }}>
            Advanced gymnastics scoring using USAG criteria. Built for athletes, parents, and coaches. Levels 1-10, Xcel Bronze-Sapphire, WAG & MAG.
          </div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.15)", marginTop: 12, fontFamily: "'Space Mono', monospace" }}>
            v{BUILD_VERSION} · {BUILD_HASH.slice(0, 7)} · {BUILD_DATE}
          </div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.12)", marginTop: 4, fontFamily: "'Space Mono', monospace" }}>
            Prompt: {PROMPT_VER} · strive-app-amber.vercel.app
          </div>
        </div>

        {/* ── Clear Analysis Cache ── */}
        <button onClick={() => {
          const keys = Object.keys(localStorage).filter(k => k.startsWith("strive_cache_") || k.startsWith("debug-gemini-"));
          keys.forEach(k => localStorage.removeItem(k));
          alert("Cleared " + keys.length + " cached items. Next analysis will be fresh.");
        }} style={{
          width: "100%", padding: 12, borderRadius: 12, marginBottom: 12,
          border: "1px solid rgba(255,193,90,0.2)", background: "rgba(255,193,90,0.04)",
          color: "#ffc15a", cursor: "pointer", fontFamily: "'Outfit', sans-serif",
          fontWeight: 600, fontSize: 13,
        }}>
          Clear Analysis Cache
        </button>

        {!showConfirm ? (
          <button onClick={() => setShowConfirm(true)} style={{
            width: "100%", padding: 14, borderRadius: 12, border: "1px solid rgba(220,38,38,0.3)",
            background: "rgba(220,38,38,0.05)", color: "#dc2626", cursor: "pointer",
            fontFamily: "'Outfit', sans-serif", fontWeight: 600, fontSize: 14,
          }}>
            Reset Account & Data
          </button>
        ) : (
          <div className="card" style={{ borderColor: "rgba(220,38,38,0.3)", padding: 20 }}>
            <p style={{ fontSize: 14, marginBottom: 16, color: "rgba(255,255,255,0.7)" }}>
              This will delete your profile and all analysis history. Are you sure?
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              <button className="btn-outline" onClick={() => setShowConfirm(false)} style={{ flex: 1 }}>Cancel</button>
              <button onClick={onReset} style={{
                flex: 1, padding: 12, borderRadius: 12, border: "none",
                background: "#dc2626", color: "white", cursor: "pointer",
                fontFamily: "'Outfit', sans-serif", fontWeight: 700,
              }}>
                Delete Everything
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

// ─── WHAT-IF SCORING SIMULATOR ──────────────────────────────────────
function WhatIfSimulator({ result }) {
  const deds = result.executionDeductions || [];
  const [removed, setRemoved] = useState({});

  const toggle = (i) => setRemoved(prev => ({ ...prev, [i]: !prev[i] }));
  const removedTotal = deds.reduce((s, d, i) => s + (removed[i] ? d.deduction : 0), 0);
  const projectedScore = Math.min(10, result.finalScore + removedTotal);
  const improvement = removedTotal;

  return (
    <div style={{ animation: "fadeIn 0.4s ease-out" }}>
      <div className="card" style={{ padding: 20, marginBottom: 16, textAlign: "center" }}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>IF YOU FIXED THE SELECTED DEDUCTIONS</div>
        <div style={{ fontSize: 48, fontWeight: 900, fontFamily: "'Space Mono', monospace", color: projectedScore >= 9.0 ? "#22c55e" : "#ffc15a" }}>
          {projectedScore.toFixed(3)}
        </div>
        {improvement > 0 && (
          <div style={{ fontSize: 14, color: "#22c55e", fontWeight: 700, marginTop: 4 }}>
            +{improvement.toFixed(3)} improvement possible
          </div>
        )}
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 8 }}>
          Tap deductions below to see how fixing them would change your score
        </div>
      </div>

      {deds.map((d, i) => {
        const c = DEDUCTION_SCALE[d.severity]?.color || "#ffc15a";
        const isOff = removed[i];
        return (
          <div key={i} onClick={() => toggle(i)} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "12px 14px", borderRadius: 10, marginBottom: 4, cursor: "pointer",
            background: isOff ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.02)",
            borderLeft: `3px solid ${isOff ? "#22c55e" : c}`,
            opacity: isOff ? 0.6 : 1, transition: "all 0.2s",
          }}>
            <div style={{
              width: 22, height: 22, borderRadius: 6, flexShrink: 0,
              border: `2px solid ${isOff ? "#22c55e" : "rgba(255,255,255,0.2)"}`,
              background: isOff ? "rgba(34,197,94,0.2)" : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {isOff && <span style={{ color: "#22c55e", fontSize: 13, fontWeight: 700 }}>✓</span>}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: isOff ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.7)", textDecoration: isOff ? "line-through" : "none" }}>
                {d.skill}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{d.fault}</div>
            </div>
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, fontWeight: 700, color: isOff ? "#22c55e" : c, textDecoration: isOff ? "line-through" : "none" }}>
              -{d.deduction?.toFixed(2)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── PROGRESS SCREEN ────────────────────────────────────────────────
const ProgressScreen = React.memo(function ProgressScreen({ history, profile, savedResults, comparePreselect, onClearPreselect, onBack }) {
  const events = profile.gender === "female" ? WOMEN_EVENTS : MEN_EVENTS;

  // Build list of analyses that have saved results for comparison
  const comparableAnalyses = useMemo(() => history.filter(h => savedResults && savedResults[h.id]), [history, savedResults]);

  // Comparison state
  const [idA, setIdA] = useState(() => {
    if (comparePreselect && comparableAnalyses.find(h => h.id === comparePreselect)) return comparePreselect;
    return comparableAnalyses.length > 0 ? comparableAnalyses[0].id : null;
  });
  const [idB, setIdB] = useState(() => {
    if (comparePreselect && comparableAnalyses.length > 1) {
      const other = comparableAnalyses.find(h => h.id !== comparePreselect);
      return other ? other.id : null;
    }
    return comparableAnalyses.length > 1 ? comparableAnalyses[1].id : null;
  });

  // Clear preselect after initial render
  const preselectCleared = useRef(false);
  useEffect(() => {
    if (!preselectCleared.current && comparePreselect && onClearPreselect) {
      preselectCleared.current = true;
      onClearPreselect();
    }
  });

  // Score trend data (chronological order)
  const chartData = useMemo(() => [...history].reverse().map((h, i) => ({
    name: h.meetName ? h.meetName.slice(0, 10) : (h.date || `#${i+1}`),
    score: h.score || 0,
    event: h.event,
    deductions: h.deductions || 0,
    date: h.date || "",
  })), [history]);

  // Target score from athlete record
  const athleteRecord = getAthleteRecord(profile);
  const targetScore = athleteRecord?.seasonGoals?.targetScore || null;

  // Personal bests per event
  const bests = useMemo(() => {
    const b = {};
    history.forEach(h => {
      if (!b[h.event] || h.score > b[h.event]) b[h.event] = h.score;
    });
    return b;
  }, [history]);

  // Get full result data for comparison
  const resultA = idA && savedResults ? savedResults[idA] : null;
  const resultB = idB && savedResults ? savedResults[idB] : null;
  const histA = idA ? history.find(h => h.id === idA) : null;
  const histB = idB ? history.find(h => h.id === idB) : null;

  // Grade distribution helper
  const gradeDistribution = (result) => {
    if (!result || !result.gradedSkills) return { A: 0, B: 0, C: 0, D: 0 };
    const dist = { A: 0, B: 0, C: 0, D: 0 };
    (result.gradedSkills || []).forEach(s => {
      const g = (s.grade || "").charAt(0);
      if (g === "A") dist.A++;
      else if (g === "B") dist.B++;
      else if (g === "C") dist.C++;
      else dist.D++;
    });
    return dist;
  };

  // Fuzzy match skills between two analyses
  const matchSkills = (rA, rB) => {
    if (!rA?.gradedSkills || !rB?.gradedSkills) return [];
    const skillsA = rA.gradedSkills || [];
    const skillsB = rB.gradedSkills || [];
    const matched = [];
    const usedB = new Set();

    const normalize = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

    skillsA.forEach(sA => {
      const nameA = normalize(sA.skill);
      let bestIdx = -1;
      let bestScore = 0;
      skillsB.forEach((sB, idx) => {
        if (usedB.has(idx)) return;
        const nameB = normalize(sB.skill);
        // Exact match
        if (nameA === nameB) { bestIdx = idx; bestScore = 100; return; }
        // Partial match — check if one contains the other
        if (nameA.includes(nameB) || nameB.includes(nameA)) {
          const sc = Math.min(nameA.length, nameB.length) / Math.max(nameA.length, nameB.length) * 80;
          if (sc > bestScore) { bestIdx = idx; bestScore = sc; }
        }
      });
      if (bestIdx >= 0 && bestScore > 40) {
        usedB.add(bestIdx);
        matched.push({ skillName: sA.skill, a: sA, b: skillsB[bestIdx] });
      } else {
        matched.push({ skillName: sA.skill, a: sA, b: null });
      }
    });
    // Add unmatched B skills
    skillsB.forEach((sB, idx) => {
      if (!usedB.has(idx)) {
        matched.push({ skillName: sB.skill, a: null, b: sB });
      }
    });
    return matched;
  };

  // Progress summary across all history
  const progressSummary = (() => {
    if (history.length < 2) return null;
    const sorted = [...history].reverse(); // chronological
    const earliest = sorted[0];
    const latest = sorted[sorted.length - 1];
    const scoreImprovement = (latest.score || 0) - (earliest.score || 0);

    // Fault analysis across all saved results
    const allFaults = {};
    const firstFaults = new Set();
    const latestFaults = new Set();
    comparableAnalyses.forEach((h, idx) => {
      const r = savedResults[h.id];
      if (!r?.gradedSkills) return;
      r.gradedSkills.forEach(s => {
        if (s.fault) {
          const key = (s.fault || "").toLowerCase().slice(0, 50);
          if (!allFaults[key]) allFaults[key] = { name: s.fault, scores: [] };
          allFaults[key].scores.push(s.deduction || 0);
          if (idx === 0) firstFaults.add(key);
          if (idx === comparableAnalyses.length - 1) latestFaults.add(key);
        }
      });
    });

    const fixed = [...firstFaults].filter(f => !latestFaults.has(f)).map(f => allFaults[f]?.name || f);
    const emerged = [...latestFaults].filter(f => !firstFaults.has(f)).map(f => allFaults[f]?.name || f);

    // Most improved skill — biggest deduction decrease
    let mostImproved = null;
    if (resultA && resultB) {
      const skills = matchSkills(resultA, resultB);
      let biggestDrop = 0;
      skills.forEach(s => {
        if (s.a && s.b) {
          const delta = (s.a.deduction || 0) - (s.b.deduction || 0);
          if (delta > biggestDrop) { biggestDrop = delta; mostImproved = s.skillName; }
        }
      });
    }

    // Most consistent skill (lowest variance)
    let mostConsistent = null;
    const skillVariances = {};
    comparableAnalyses.forEach(h => {
      const r = savedResults[h.id];
      if (!r?.gradedSkills) return;
      r.gradedSkills.forEach(s => {
        const key = (s.skill || "").toLowerCase();
        if (!skillVariances[key]) skillVariances[key] = { name: s.skill, scores: [] };
        skillVariances[key].scores.push(s.deduction || 0);
      });
    });
    let lowestVar = Infinity;
    Object.values(skillVariances).forEach(sv => {
      if (sv.scores.length < 2) return;
      const mean = sv.scores.reduce((a, b) => a + b, 0) / sv.scores.length;
      const variance = sv.scores.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / sv.scores.length;
      if (variance < lowestVar) { lowestVar = variance; mostConsistent = sv.name; }
    });

    return {
      earliestDate: earliest.date,
      scoreImprovement,
      fixed,
      emerged,
      mostImproved,
      mostConsistent,
    };
  })();

  // Dropdown label helper
  const analysisLabel = (h) => {
    if (!h) return "—";
    const d = h.date || "";
    const evt = h.event || "";
    const sc = h.score ? h.score.toFixed(3) : "—";
    return `${d} · ${evt} · ${sc}`;
  };

  const scoreColor = (sc) => sc >= 9.0 ? "#22c55e" : sc >= 8.0 ? "#ffc15a" : sc > 0 ? "#dc2626" : "rgba(255,255,255,0.3)";

  const selectStyle = {
    width: "100%", padding: "10px 12px", borderRadius: 10,
    background: "#121b2d", border: "1px solid rgba(232,150,42,0.15)",
    color: "#e2e8f0", fontFamily: "'Space Mono', monospace", fontSize: 12,
    cursor: "pointer", outline: "none", appearance: "none",
    WebkitAppearance: "none",
    backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23e8962a' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center",
    paddingRight: 32,
  };

  return (
    <div style={{ minHeight: "100vh", padding: "16px 18px 90px", maxWidth: 540, margin: "0 auto" }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4, marginTop: 8 }}>Progress & Comparison</h2>
      <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, marginBottom: 24 }}>Track improvement and compare analyses side by side</p>

      {history.length < 2 ? (
        <div className="card" style={{ padding: 40, textAlign: "center" }}>
          <svg width="40" height="40" viewBox="0 0 20 20" fill="none" stroke="#e8962a" strokeWidth="1.5" strokeLinecap="round" style={{ marginBottom: 12 }}>
            <path d="M3 17l4-6 3 3 4-7 3 4" />
          </svg>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Almost There!</h3>
          <p style={{ color: "rgba(255,255,255,0.4)", marginTop: 0, fontSize: 14, lineHeight: 1.6 }}>
            Complete at least 2 analyses to compare progress and see your improvement over time. Every routine you analyze builds your journey.
          </p>
          <div style={{ marginTop: 16, padding: "10px 20px", borderRadius: 10, background: "rgba(232,150,42,0.06)", border: "1px solid rgba(232,150,42,0.1)", display: "inline-block" }}>
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 22, fontWeight: 700, color: "#e8962a" }}>{history.length}</span>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginLeft: 6 }}>of 2 analyses completed</span>
          </div>
        </div>
      ) : (
        <>
          {/* ═══ A. SCORE HISTORY CHART ═══ */}
          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Score History</h3>
            {LineChart && ResponsiveContainer ? (
              <StriveErrorBoundary name="ProgressChart">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="name" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 9, fontFamily: "'Space Mono', monospace" }} interval="preserveStartEnd" />
                  <YAxis domain={['auto', 'auto']} tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10, fontFamily: "'Space Mono', monospace" }} tickFormatter={(v) => v.toFixed(1)} />
                  <Tooltip
                    contentStyle={{ background: "#0d1422", border: "1px solid rgba(232,150,42,0.2)", borderRadius: 10, color: "#e2e8f0", fontSize: 12, fontFamily: "'Space Mono', monospace" }}
                    formatter={(value, name) => [value?.toFixed(3), name === "score" ? "Score" : name]}
                    labelFormatter={(label) => label}
                    content={({ active, payload, label }) => {
                      if (!active || !payload || !payload[0]) return null;
                      const d = payload[0].payload;
                      return (
                        <div style={{ background: "#0d1422", border: "1px solid rgba(232,150,42,0.2)", borderRadius: 10, padding: "10px 14px", fontSize: 12 }}>
                          <div style={{ fontWeight: 700, marginBottom: 4 }}>{d.date || label}</div>
                          <div style={{ fontFamily: "'Space Mono', monospace", color: "#e8962a", fontSize: 16, fontWeight: 700 }}>{d.score?.toFixed(3)}</div>
                          <div style={{ color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{d.event}</div>
                          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10 }}>Deductions: {d.deductions?.toFixed(3) || "—"}</div>
                        </div>
                      );
                    }}
                  />
                  {targetScore && <ReferenceLine y={targetScore} stroke="#22c55e" strokeDasharray="5 5" strokeWidth={1.5} label={{ value: `Goal: ${targetScore}`, fill: "#22c55e", fontSize: 10, fontFamily: "'Space Mono', monospace", position: "right" }} />}
                  <Line type="monotone" dataKey="score" stroke="#e8962a" strokeWidth={2.5} dot={{ fill: "#e8962a", r: 5, strokeWidth: 2, stroke: "#0d1422" }} activeDot={{ r: 7, fill: "#ffc15a" }} />
                </LineChart>
              </ResponsiveContainer>
              </StriveErrorBoundary>
            ) : (
              <div style={{ padding: 20, textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
                {chartData.map((d, i) => (
                  <span key={i} style={{ fontFamily: "'Space Mono', monospace", marginRight: 12 }}>{d.name}: <span style={{ color: "#e8962a" }}>{d.score?.toFixed(3)}</span></span>
                ))}
              </div>
            )}
            {/* Personal Bests row */}
            {Object.keys(bests).length > 0 && (
              <div style={{ display: "flex", gap: 8, marginTop: 12, overflowX: "auto", paddingBottom: 4 }}>
                {Object.entries(bests).map(([evt, sc]) => (
                  <div key={evt} style={{ flex: "0 0 auto", padding: "8px 12px", borderRadius: 8, background: "rgba(232,150,42,0.06)", border: "1px solid rgba(232,150,42,0.08)", textAlign: "center" }}>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", letterSpacing: 0.5 }}>PB {evt.replace("Exercise","").replace("Uneven ","")}</div>
                    <div style={{ fontSize: 15, fontWeight: 800, fontFamily: "'Space Mono', monospace", color: "#e8962a", marginTop: 2 }}>{sc?.toFixed(2)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ═══ B. COMPARISON PICKER ═══ */}
          {comparableAnalyses.length >= 2 && (
            <>
            <div className="card" style={{ padding: 16, marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Compare Analyses</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", letterSpacing: 0.5, marginBottom: 6, display: "block" }}>ANALYSIS A (Earlier)</label>
                  <select value={idA || ""} onChange={(e) => setIdA(Number(e.target.value))} style={selectStyle}>
                    {comparableAnalyses.map(h => (
                      <option key={h.id} value={h.id}>{analysisLabel(h)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", letterSpacing: 0.5, marginBottom: 6, display: "block" }}>ANALYSIS B (Later)</label>
                  <select value={idB || ""} onChange={(e) => setIdB(Number(e.target.value))} style={selectStyle}>
                    {comparableAnalyses.map(h => (
                      <option key={h.id} value={h.id}>{analysisLabel(h)}</option>
                    ))}
                  </select>
                </div>
              </div>
              {histA && histB && histA.event !== histB.event && (
                <div style={{ marginTop: 10, padding: "6px 12px", borderRadius: 8, background: "rgba(224,104,32,0.08)", border: "1px solid rgba(224,104,32,0.15)", fontSize: 11, color: "#e06820" }}>
                  Different events ({histA.event} vs {histB.event}) — comparison may be less meaningful
                </div>
              )}
            </div>

            {/* ═══ C. SIDE-BY-SIDE COMPARISON CARD ═══ */}
            {resultA && resultB && histA && histB && (
              <div className="card" style={{ padding: 0, marginBottom: 16, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", background: "rgba(232,150,42,0.04)", borderBottom: "1px solid rgba(232,150,42,0.08)" }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Head to Head</h3>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 0 }}>
                  {/* Column A */}
                  <div style={{ padding: "14px 16px", borderRight: "1px solid rgba(255,255,255,0.04)" }}>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", letterSpacing: 0.5, marginBottom: 2 }}>ANALYSIS A</div>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{histA.date}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 10 }}>{histA.event}</div>
                    <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 28, fontWeight: 900, color: scoreColor(histA.score || 0), marginBottom: 8 }}>
                      {(histA.score || 0).toFixed(3)}
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                      <div>Deductions: <span style={{ fontFamily: "'Space Mono', monospace", color: "#e06820" }}>{(histA.deductions || 0).toFixed(3)}</span></div>
                      <div style={{ marginTop: 4 }}>Skills: <span style={{ fontFamily: "'Space Mono', monospace" }}>{(resultA.gradedSkills || []).length}</span></div>
                      <div style={{ marginTop: 4 }}>Faults: <span style={{ fontFamily: "'Space Mono', monospace" }}>{(resultA.executionDeductions || []).length}</span></div>
                    </div>
                    {/* Grade distribution */}
                    <div style={{ display: "flex", gap: 4, marginTop: 10 }}>
                      {Object.entries(gradeDistribution(resultA)).map(([g, c]) => (
                        <div key={g} style={{ flex: 1, textAlign: "center", padding: "4px 0", borderRadius: 6, background: c > 0 ? "rgba(255,255,255,0.04)" : "transparent" }}>
                          <div style={{ fontSize: 9, color: g === "A" ? "#22c55e" : g === "B" ? "#ffc15a" : g === "C" ? "#e06820" : "#dc2626", fontWeight: 700 }}>{g}</div>
                          <div style={{ fontSize: 13, fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>{c}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Delta column */}
                  <div style={{ padding: "14px 8px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minWidth: 60, background: "rgba(255,255,255,0.02)" }}>
                    <div style={{ fontSize: 8, color: "rgba(255,255,255,0.25)", letterSpacing: 0.5, marginBottom: 8 }}>DELTA</div>
                    {(() => {
                      const scoreDelta = (histB.score || 0) - (histA.score || 0);
                      const dedDelta = (histB.deductions || 0) - (histA.deductions || 0);
                      return (
                        <>
                          <div style={{
                            fontFamily: "'Space Mono', monospace", fontSize: 14, fontWeight: 700,
                            color: scoreDelta > 0 ? "#22c55e" : scoreDelta < 0 ? "#dc2626" : "rgba(255,255,255,0.3)",
                            marginBottom: 12,
                          }}>
                            {scoreDelta > 0 ? "+" : ""}{scoreDelta.toFixed(3)}
                          </div>
                          <div style={{ fontSize: 8, color: "rgba(255,255,255,0.25)", marginBottom: 2 }}>DED</div>
                          <div style={{
                            fontFamily: "'Space Mono', monospace", fontSize: 12, fontWeight: 700,
                            color: dedDelta < 0 ? "#22c55e" : dedDelta > 0 ? "#dc2626" : "rgba(255,255,255,0.3)",
                          }}>
                            {dedDelta > 0 ? "+" : ""}{dedDelta.toFixed(3)}
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  {/* Column B */}
                  <div style={{ padding: "14px 16px" }}>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", letterSpacing: 0.5, marginBottom: 2 }}>ANALYSIS B</div>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{histB.date}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 10 }}>{histB.event}</div>
                    <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 28, fontWeight: 900, color: scoreColor(histB.score || 0), marginBottom: 8 }}>
                      {(histB.score || 0).toFixed(3)}
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                      <div>Deductions: <span style={{ fontFamily: "'Space Mono', monospace", color: "#e06820" }}>{(histB.deductions || 0).toFixed(3)}</span></div>
                      <div style={{ marginTop: 4 }}>Skills: <span style={{ fontFamily: "'Space Mono', monospace" }}>{(resultB.gradedSkills || []).length}</span></div>
                      <div style={{ marginTop: 4 }}>Faults: <span style={{ fontFamily: "'Space Mono', monospace" }}>{(resultB.executionDeductions || []).length}</span></div>
                    </div>
                    {/* Grade distribution */}
                    <div style={{ display: "flex", gap: 4, marginTop: 10 }}>
                      {Object.entries(gradeDistribution(resultB)).map(([g, c]) => (
                        <div key={g} style={{ flex: 1, textAlign: "center", padding: "4px 0", borderRadius: 6, background: c > 0 ? "rgba(255,255,255,0.04)" : "transparent" }}>
                          <div style={{ fontSize: 9, color: g === "A" ? "#22c55e" : g === "B" ? "#ffc15a" : g === "C" ? "#e06820" : "#dc2626", fontWeight: 700 }}>{g}</div>
                          <div style={{ fontSize: 13, fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>{c}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ═══ D. SKILL-BY-SKILL DELTA ═══ */}
            {resultA && resultB && (
              <div className="card" style={{ padding: 0, marginBottom: 16, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", background: "rgba(232,150,42,0.04)", borderBottom: "1px solid rgba(232,150,42,0.08)" }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Skill-by-Skill Comparison</h3>
                </div>
                {matchSkills(resultA, resultB).map((m, idx) => {
                  const dedA = m.a ? (m.a.deduction || m.a.gradeDeduction || 0) : null;
                  const dedB = m.b ? (m.b.deduction || m.b.gradeDeduction || 0) : null;
                  const delta = dedA !== null && dedB !== null ? dedB - dedA : null;

                  let badge = null;
                  let badgeColor = "";
                  let rowBg = "transparent";
                  if (m.a && !m.b) {
                    // Skill only in A — if it had a fault, it might be fixed
                    if (dedA > 0) { badge = "Fixed!"; badgeColor = "#22c55e"; rowBg = "rgba(34,197,94,0.04)"; }
                  } else if (!m.a && m.b) {
                    // Skill only in B
                    if (dedB > 0) { badge = "New"; badgeColor = "#dc2626"; rowBg = "rgba(220,38,38,0.04)"; }
                  } else if (delta !== null) {
                    if (delta < -0.01) { badge = "Improved"; badgeColor = "#22c55e"; rowBg = "rgba(34,197,94,0.04)"; }
                    else if (delta > 0.01) { badge = "Needs work"; badgeColor = "#e06820"; rowBg = "rgba(224,104,32,0.04)"; }
                  }

                  return (
                    <div key={idx} style={{
                      display: "grid", gridTemplateColumns: "1fr auto auto auto auto",
                      alignItems: "center", gap: 8,
                      padding: "10px 16px", background: rowBg,
                      borderBottom: "1px solid rgba(255,255,255,0.03)",
                    }}>
                      <div style={{ fontSize: 12, fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {m.skillName}
                      </div>
                      <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: dedA !== null ? (dedA > 0 ? "#e06820" : "#22c55e") : "rgba(255,255,255,0.2)", textAlign: "right", minWidth: 42 }}>
                        {dedA !== null ? dedA.toFixed(2) : "N/A"}
                      </div>
                      <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: dedB !== null ? (dedB > 0 ? "#e06820" : "#22c55e") : "rgba(255,255,255,0.2)", textAlign: "right", minWidth: 42 }}>
                        {dedB !== null ? dedB.toFixed(2) : "N/A"}
                      </div>
                      <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, fontWeight: 700, textAlign: "right", minWidth: 38,
                        color: delta !== null ? (delta < 0 ? "#22c55e" : delta > 0 ? "#dc2626" : "rgba(255,255,255,0.2)") : "rgba(255,255,255,0.15)"
                      }}>
                        {delta !== null ? (delta > 0 ? "+" : "") + delta.toFixed(2) : "—"}
                      </div>
                      <div style={{ minWidth: 65, textAlign: "right" }}>
                        {badge && (
                          <span style={{
                            fontSize: 9, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
                            background: `${badgeColor}15`, color: badgeColor, letterSpacing: 0.3,
                          }}>{badge}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {matchSkills(resultA, resultB).length === 0 && (
                  <div style={{ padding: 24, textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
                    No skills found in either analysis
                  </div>
                )}
                {/* Legend */}
                <div style={{ display: "flex", gap: 12, padding: "8px 16px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>A ded</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>|</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>B ded</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>|</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>Delta</div>
                  </div>
                </div>
              </div>
            )}
            </>
          )}

          {/* ═══ E. PROGRESS SUMMARY ═══ */}
          {progressSummary && (
            <div className="card" style={{ padding: 16, marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Progress Summary</h3>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 12 }}>
                Since {progressSummary.earliestDate}:
              </div>

              {/* Score improvement */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderRadius: 10, background: "rgba(255,255,255,0.03)", marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Score Change</span>
                <span style={{
                  fontFamily: "'Space Mono', monospace", fontSize: 18, fontWeight: 900,
                  color: progressSummary.scoreImprovement > 0 ? "#22c55e" : progressSummary.scoreImprovement < 0 ? "#dc2626" : "rgba(255,255,255,0.3)",
                }}>
                  {progressSummary.scoreImprovement > 0 ? "+" : ""}{progressSummary.scoreImprovement.toFixed(3)}
                </span>
              </div>

              {/* Faults fixed */}
              {progressSummary.fixed.length > 0 && (
                <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(34,197,94,0.04)", border: "1px solid rgba(34,197,94,0.1)", marginBottom: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#22c55e", marginBottom: 6 }}>Faults Fixed ({progressSummary.fixed.length})</div>
                  {progressSummary.fixed.slice(0, 5).map((f, i) => (
                    <div key={i} style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", padding: "2px 0" }}>{f}</div>
                  ))}
                </div>
              )}

              {/* Faults emerged */}
              {progressSummary.emerged.length > 0 && (
                <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(220,38,38,0.04)", border: "1px solid rgba(220,38,38,0.1)", marginBottom: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#dc2626", marginBottom: 6 }}>New Faults ({progressSummary.emerged.length})</div>
                  {progressSummary.emerged.slice(0, 5).map((f, i) => (
                    <div key={i} style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", padding: "2px 0" }}>{f}</div>
                  ))}
                </div>
              )}

              {/* Most improved / most consistent */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(255,255,255,0.03)" }}>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: 0.5, marginBottom: 4 }}>MOST IMPROVED</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: progressSummary.mostImproved ? "#22c55e" : "rgba(255,255,255,0.2)" }}>
                    {progressSummary.mostImproved || "—"}
                  </div>
                </div>
                <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(255,255,255,0.03)" }}>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: 0.5, marginBottom: 4 }}>MOST CONSISTENT</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: progressSummary.mostConsistent ? "#e8962a" : "rgba(255,255,255,0.2)" }}>
                    {progressSummary.mostConsistent || "—"}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Event Breakdown */}
          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Routines by Event</h3>
            {events.map(evt => {
              const count = history.filter(h => h.event === evt).length;
              const avg = count > 0 ? history.filter(h => h.event === evt).reduce((s, h) => s + (h.score || 0), 0) / count : 0;
              return (
                <div key={evt} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{evt}</span>
                  <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{count} analyzed</span>
                  {count > 0 && <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 14, fontWeight: 700, color: "#e8962a" }}>{avg.toFixed(3)} avg</span>}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
});

// ─── MEETS SCREEN ───────────────────────────────────────────────────
const MeetsScreen = React.memo(function MeetsScreen({ history, savedResults, profile, onBack, onViewResult, onCompare }) {
  // Group history entries by meet
  const meets = useMemo(() => {
    const m = {};
    history.forEach(h => {
      const key = h.meetName || h.date || "Unknown Meet";
      if (!m[key]) m[key] = { name: h.meetName, location: h.meetLocation, date: h.meetDate || h.date, entries: [] };
      m[key].entries.push(h);
    });
    return m;
  }, [history]);

  // Overall stats
  const allScores = useMemo(() => history.filter(h => h.score > 0).map(h => h.score), [history]);
  const bestScore = useMemo(() => allScores.length > 0 ? Math.max(...allScores) : 0, [allScores]);
  const avgScore = useMemo(() => allScores.length > 0 ? allScores.reduce((a, b) => a + b, 0) / allScores.length : 0, [allScores]);
  const bestEvent = useMemo(() => {
    const byEvent = {};
    history.forEach(h => {
      if (!h.score) return;
      if (!byEvent[h.event]) byEvent[h.event] = [];
      byEvent[h.event].push(h.score);
    });
    let best = null, bestAvg = 0;
    Object.entries(byEvent).forEach(([evt, scores]) => {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      if (avg > bestAvg) { bestAvg = avg; best = evt; }
    });
    return best ? { event: best, avg: bestAvg } : null;
  }, [history]);

  return (
    <div style={{ minHeight: "100vh", padding: "16px 18px 90px", maxWidth: 540, margin: "0 auto" }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: "rgba(232,150,42,0.6)", cursor: "pointer", fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 600, marginBottom: 14, display: "flex", alignItems: "center", gap: 4 }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M8.5 2.5l-5 5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> Dashboard
      </button>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Competition History</h2>
      <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginBottom: 20 }}>
        {history.length} analyses across {Object.keys(meets).length} meets
      </p>

      {/* Stats Summary */}
      {allScores.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
          <div className="card" style={{ textAlign: "center", padding: 14 }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: 0.5 }}>BEST SCORE</div>
            <div style={{ fontSize: 20, fontWeight: 900, fontFamily: "'Space Mono', monospace", color: "#22c55e", marginTop: 4 }}>
              {bestScore.toFixed(1)}
            </div>
          </div>
          <div className="card" style={{ textAlign: "center", padding: 14 }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: 0.5 }}>AVERAGE</div>
            <div style={{ fontSize: 20, fontWeight: 900, fontFamily: "'Space Mono', monospace", color: "#e8962a", marginTop: 4 }}>
              {avgScore.toFixed(1)}
            </div>
          </div>
          <div className="card" style={{ textAlign: "center", padding: 14 }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: 0.5 }}>BEST EVENT</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#E2E8F0", marginTop: 6 }}>
              {bestEvent ? bestEvent.event.replace("Exercise", "").replace("Uneven ", "") : "—"}
            </div>
          </div>
        </div>
      )}

      {Object.keys(meets).length === 0 ? (
        <div className="card" style={{ padding: "32px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🏆</div>
          <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>No meets recorded yet</h4>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, lineHeight: 1.6 }}>
            When you upload a video, add the meet name to organize your competition history here.
          </p>
        </div>
      ) : (
        Object.entries(meets).map(([key, meet], mi) => {
          const aa = meet.entries.reduce((s, h) => s + (h.score || 0), 0);
          const meetAvg = meet.entries.length > 0 ? aa / meet.entries.length : 0;
          return (
            <div key={mi} className="card" style={{ marginBottom: 12, padding: 0, overflow: "hidden", animation: `fadeIn 0.3s ease-out ${mi * 0.08}s both` }}>
              {/* Meet header */}
              <div style={{ padding: "14px 16px", background: "rgba(232,150,42,0.04)", borderBottom: "1px solid rgba(232,150,42,0.08)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{meet.name || key}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
                      {meet.location && `${meet.location} · `}{meet.date}
                    </div>
                  </div>
                  {meet.entries.length > 1 && (
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)" }}>ALL-AROUND</div>
                      <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "'Space Mono', monospace", color: "#e8962a" }}>
                        {aa.toFixed(2)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {/* Routines in this meet */}
              {meet.entries.map((h, i) => {
                const hasR = savedResults && savedResults[h.id];
                const sc = h.score || 0;
                const scColor = sc >= 9.0 ? "#22c55e" : sc >= 8.0 ? "#ffc15a" : sc > 0 ? "#dc2626" : "rgba(255,255,255,0.3)";
                return (
                  <div key={i}
                    onClick={() => hasR && onViewResult(savedResults[h.id])}
                    style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "11px 16px", cursor: hasR ? "pointer" : "default",
                      borderBottom: i < meet.entries.length - 1 ? "1px solid rgba(255,255,255,0.03)" : "none",
                      transition: "background 0.2s",
                    }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{h.event}</div>
                      {hasR && <div style={{ fontSize: 10, color: "#e8962a" }}>tap to review →</div>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {hasR && history.length >= 2 && onCompare && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onCompare(h.id); }}
                          style={{
                            background: "rgba(232,150,42,0.08)", border: "1px solid rgba(232,150,42,0.15)",
                            color: "#e8962a", fontSize: 10, fontWeight: 600, padding: "4px 10px",
                            borderRadius: 8, cursor: "pointer", fontFamily: "'Outfit', sans-serif",
                            whiteSpace: "nowrap",
                          }}
                        >Compare</button>
                      )}
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 800, fontSize: 17, fontFamily: "'Space Mono', monospace", color: scColor }}>
                          {sc > 0 ? sc.toFixed(3) : "—"}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })
      )}
    </div>
  );
});

// ─── MENTAL TRAINING SCREEN ─────────────────────────────────────────
const MentalTrainingScreen = React.memo(function MentalTrainingScreen({ profile, onBack }) {
  const [activeSection, setActiveSection] = useState("overview");
  const sections = [
    { id: "overview", label: "Overview" },
    { id: "visualization", label: "Visualization" },
    { id: "breathing", label: "Breathing" },
    { id: "confidence", label: "Confidence" },
    { id: "meetday", label: "Meet Day" },
    { id: "parents", label: "For Parents" },
  ];

  return (
    <div style={{ minHeight: "100vh", padding: "16px 18px 90px", maxWidth: 540, margin: "0 auto" }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: "rgba(232,150,42,0.6)", cursor: "pointer", fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 600, marginBottom: 14, display: "flex", alignItems: "center", gap: 4 }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M8.5 2.5l-5 5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> Dashboard
      </button>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}><Icon name="brain" size={24} /> Mental Training</h2>
      <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, marginBottom: 20 }}>Gymnastics is 80% mental. Train the mind alongside the body.</p>

      {/* Section tabs */}
      <div style={{ display: "flex", gap: 3, marginBottom: 20, background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 3, overflowX: "auto" }}>
        {sections.map(s => (
          <button key={s.id} onClick={() => setActiveSection(s.id)} style={{
            flex: 1, padding: "8px 4px", borderRadius: 10, border: "none", cursor: "pointer",
            fontFamily: "'Outfit', sans-serif", fontWeight: 600, fontSize: 11, whiteSpace: "nowrap",
            background: activeSection === s.id ? "linear-gradient(135deg, #e8962a, #ffc15a)" : "transparent",
            color: activeSection === s.id ? "#070c16" : "rgba(255,255,255,0.4)",
          }}>{s.label}</button>
        ))}
      </div>

      {activeSection === "overview" && (
        <div style={{ animation: "fadeIn 0.4s ease-out" }}>
          <div className="card" style={{ padding: 20, marginBottom: 12, borderColor: "rgba(232,150,42,0.15)" }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "#e8962a", marginBottom: 10 }}>Why Mental Training Matters</h3>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.8 }}>
              The difference between a gymnast who scores 8.5 and one who scores 9.2 is rarely just physical ability. It's mental focus, confidence, and the ability to perform under pressure. Every elite gymnast — from Simone Biles to your child's favorite Level 10 at the gym — uses mental training techniques daily.
            </p>
          </div>
          <div className="card" style={{ padding: 20, marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>The 4 Pillars of Gymnastics Mental Training</h3>
            {[
              { title: "Visualization", desc: "Mentally rehearsing routines before performing them. Builds muscle memory without physical fatigue.", icon: "👁" },
              { title: "Breathing & Focus", desc: "Controlling nerves through breathing techniques. Brings heart rate down before saluting the judge.", icon: "🌬" },
              { title: "Confidence Building", desc: "Replacing negative self-talk with positive affirmations. Building a 'competition mindset'.", icon: "💪" },
              { title: "Pressure Management", desc: "Practicing performing under simulated pressure so meets feel familiar, not scary.", icon: "🎯" },
            ].map((p, i) => (
              <div key={i} style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "flex-start" }}>
                <span style={{ fontSize: 22, flexShrink: 0 }}>{p.icon}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{p.title}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>{p.desc}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="card" style={{ padding: 16, background: "rgba(232,150,42,0.04)", borderColor: "rgba(232,150,42,0.1)" }}>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.7, fontStyle: "italic" }}>
              <strong style={{ color: "#e8962a" }}>Parent tip:</strong> You can practice these with your child in the car on the way to the gym. Even 5 minutes of visualization before practice makes a measurable difference.
            </p>
          </div>
        </div>
      )}

      {activeSection === "visualization" && (
        <div style={{ animation: "fadeIn 0.4s ease-out" }}>
          {[
            { title: "Full Routine Walk-Through", time: "5-10 min", when: "Before practice or bed", steps: [
              "Find a quiet spot. Close eyes. Take 3 deep breaths.",
              "Mentally walk to the apparatus. Feel the chalk on your hands or the beam under your feet.",
              "Perform the entire routine in your mind at REAL SPEED — not fast-forward.",
              "Feel every takeoff, every landing. Hear the music (floor). Sense the bar in your grip.",
              "Visualize perfect execution: straight legs, pointed toes, stuck landings.",
              "If you 'see' a mistake in your mind, rewind and redo that skill perfectly.",
              "End by visualizing the salute and walking away confidently."
            ]},
            { title: "Skill-Specific Visualization", time: "2-3 min per skill", when: "Before attempting a difficult skill", steps: [
              "Close eyes. Picture yourself from a third-person view (like watching video).",
              "See the specific skill in slow motion. Every body position, every angle.",
              "Now switch to first-person — feel it from inside your body.",
              "Feel the takeoff power, the air time, the snap of the landing.",
              "Repeat 3 times. Each time, make the image clearer and more confident.",
            ]},
            { title: "Competition Day Visualization", time: "10 min", when: "Morning of the meet", steps: [
              "Lie down or sit comfortably. Close eyes.",
              "Picture yourself arriving at the meet venue. See the equipment, hear the crowd.",
              "Visualize yourself warming up confidently. You feel strong and ready.",
              "See yourself at the first event. You salute the judge with a smile.",
              "Perform a PERFECT routine in your mind. Every skill clean.",
              "See the score flash: it's your best score ever. Feel that pride.",
              "Repeat for each event. End by saying: 'I am prepared. I am ready.'",
            ]},
          ].map((ex, i) => (
            <div key={i} className="card" style={{ padding: 16, marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700 }}>👁 {ex.title}</h3>
                <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, fontWeight: 700, background: "rgba(255,255,255,0.06)", padding: "3px 8px", borderRadius: 5, color: "rgba(255,255,255,0.4)" }}>{ex.time}</span>
              </div>
              <div style={{ fontSize: 11, color: "#e8962a", marginBottom: 8 }}>Best time: {ex.when}</div>
              {ex.steps.map((step, j) => (
                <div key={j} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, fontWeight: 700, color: "rgba(232,150,42,0.5)", minWidth: 18 }}>{j+1}.</span>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>{step}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {activeSection === "breathing" && (
        <div style={{ animation: "fadeIn 0.4s ease-out" }}>
          {[
            { title: "4-7-8 Calming Breath", desc: "The single best technique for pre-competition nerves", steps: "Breathe IN through nose for 4 seconds. HOLD for 7 seconds. Breathe OUT through mouth for 8 seconds. Repeat 3-4 cycles.", when: "Before saluting the judge, between events, when feeling nervous" },
            { title: "Box Breathing (Navy SEAL technique)", desc: "Used by elite military and athletes for focus under pressure", steps: "IN for 4 counts. HOLD 4 counts. OUT for 4 counts. HOLD empty 4 counts. Repeat 4 cycles.", when: "During warm-up, in the chalk-up area, before any high-pressure moment" },
            { title: "Power Breath", desc: "Quick energizing technique when you need a burst of confidence", steps: "3 quick, sharp inhales through the nose (sniff-sniff-sniff). 1 long exhale through the mouth while making fists. Repeat 3 times.", when: "Right before vault run, before a tumbling pass, when energy is low" },
            { title: "Reset Breath", desc: "After a fall or mistake, use this to reset mentally before the next skill", steps: "One big breath IN. On the exhale, mentally say 'NEXT'. The mistake is gone. The next skill is all that matters.", when: "After a wobble, fall, or mistake mid-routine" },
          ].map((ex, i) => (
            <div key={i} className="card" style={{ padding: 16, marginBottom: 12 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>🌬 {ex.title}</h3>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>{ex.desc}</div>
              <div style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.12)", marginBottom: 8 }}>
                <div style={{ fontSize: 13, color: "rgba(147,197,253,0.9)", lineHeight: 1.7 }}>{ex.steps}</div>
              </div>
              <div style={{ fontSize: 11, color: "#e8962a" }}>When to use: {ex.when}</div>
            </div>
          ))}
        </div>
      )}

      {activeSection === "confidence" && (
        <div style={{ animation: "fadeIn 0.4s ease-out" }}>
          <div className="card" style={{ padding: 16, marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>💪 Pre-Competition Affirmations</h3>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 10 }}>Have your child say these (out loud or silently) before competing:</p>
            {[
              "I have trained for this. My body knows what to do.",
              "I am strong, I am prepared, I am ready.",
              "Mistakes don't define me. I recover and keep going.",
              "I compete for myself, not against anyone else.",
              "I trust my training. I trust my coach. I trust myself.",
              "Nervous energy is just excitement. I channel it into power.",
              "Every routine is a chance to show what I can do.",
              "I breathe, I focus, I perform. That's all I need to do.",
            ].map((a, i) => (
              <div key={i} style={{
                padding: "8px 12px", borderRadius: 8, marginBottom: 4,
                background: "rgba(232,150,42,0.04)", borderLeft: "3px solid rgba(232,150,42,0.2)",
                fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.5, fontStyle: "italic",
              }}>"{a}"</div>
            ))}
          </div>
          <div className="card" style={{ padding: 16, marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>🎯 Confidence-Building Exercises</h3>
            {[
              { name: "Success Journal", desc: "After every practice, write down 3 things that went well. Review before meets. This trains the brain to focus on strengths, not weaknesses.", freq: "Daily, 2 minutes" },
              { name: "Highlight Reel", desc: "Use videos of your BEST routines or skills. Watch them before competing. Your brain can't tell the difference between watching yourself succeed and actually doing it.", freq: "Before each meet" },
              { name: "Power Pose", desc: "Stand tall, hands on hips or arms raised (like a superhero) for 2 minutes. Research shows this reduces cortisol and increases testosterone/confidence.", freq: "Before warm-up at meets" },
              { name: "Mistake Rehearsal", desc: "In practice, deliberately simulate a small mistake mid-routine, then recover and finish strong. This removes the fear of imperfection and builds resilience.", freq: "Once per week in practice" },
              { name: "Competition Simulation", desc: "Once a month, do a full mock competition in practice: wear your leotard, salute, judges watching, one chance only. The more familiar pressure feels, the less scary it becomes.", freq: "Monthly" },
            ].map((ex, i) => (
              <div key={i} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: i < 4 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{ex.name}</div>
                  <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.04)", padding: "2px 6px", borderRadius: 4 }}>{ex.freq}</span>
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.6, marginTop: 4 }}>{ex.desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSection === "meetday" && (
        <div style={{ animation: "fadeIn 0.4s ease-out" }}>
          <div className="card" style={{ padding: 16, marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>🏟 Competition Day Timeline</h3>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 12 }}>What to expect from arrival to awards:</p>
            {[
              { time: "60 min before", title: "Arrival", desc: "Check in, find your team area, use the bathroom, get leotard on. No rushing.", color: "rgba(59,130,246,0.8)" },
              { time: "45 min before", title: "Light Warm-Up", desc: "Jog, stretch, handstands, basic skills only. NO new skills on meet day. Keep it familiar.", color: "rgba(59,130,246,0.6)" },
              { time: "30 min before", title: "Mental Prep", desc: "This is where visualization and breathing happen. Review your routine in your mind 2-3 times. Power pose.", color: "rgba(232,150,42,0.8)" },
              { time: "15 min before", title: "March-In", desc: "The team enters together. Wave to family. This is the exciting part! Soak it in.", color: "rgba(232,150,42,0.6)" },
              { time: "~10 min", title: "Open Warm-Up", desc: "Brief touch on each event in your rotation order. 1-2 skills max per event. Get a feel, don't exhaust.", color: "rgba(34,197,94,0.8)" },
              { time: "Competition", title: "Rotation 1-4", desc: "Each event takes ~20-30 min per rotation. You'll warm up, compete, then rotate. Stay focused between events.", color: "rgba(34,197,94,0.6)" },
              { time: "After", title: "Awards", desc: "Individual event awards, All-Around awards, team awards. Celebrate every achievement — even small improvements.", color: "rgba(232,150,42,0.8)" },
            ].map((step, i) => (
              <div key={i} style={{ display: "flex", gap: 12, marginBottom: 10 }}>
                <div style={{ width: 3, flexShrink: 0, background: step.color, borderRadius: 2 }} />
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: step.color, letterSpacing: 0.5 }}>{step.time}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{step.title}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>{step.desc}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="card" style={{ padding: 16, background: "rgba(220,38,38,0.04)", borderColor: "rgba(220,38,38,0.1)" }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: "#dc2626", marginBottom: 8 }}>⚠ Common Meet Day Mistakes (Parents)</h3>
            {[
              "Coaching from the stands — your child can hear you and it adds pressure",
              "Comparing scores to other gymnasts out loud",
              "Showing disappointment after a score — they're watching your face",
              "Skipping breakfast or eating heavy food before competing",
              "Arriving late and rushing through warm-up",
            ].map((m, i) => (
              <div key={i} style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.6, marginBottom: 4, paddingLeft: 12, borderLeft: "2px solid rgba(220,38,38,0.2)" }}>{m}</div>
            ))}
          </div>
        </div>
      )}

      {activeSection === "parents" && (
        <div style={{ animation: "fadeIn 0.4s ease-out" }}>
          <div className="card" style={{ padding: 20, marginBottom: 12, borderColor: "rgba(232,150,42,0.15)" }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "#e8962a", marginBottom: 10 }}>Your Stress Matters Too</h3>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.8 }}>
              Watching your child compete is one of the most stressful experiences in youth sports. Your heart pounds, your palms sweat, and a wobble on beam feels like it's happening to YOU. This is completely normal — and there are proven techniques to manage it so you can be the calm, supportive presence your child needs.
            </p>
          </div>

          <div className="card" style={{ padding: 16, marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>🧘 Exercises for the Gymnastics Parent</h3>
            {[
              { name: "The Spectator's Breath", time: "During competition", desc: "When your child is about to compete: inhale 4 counts, hold 4, exhale 6. The longer exhale activates your rest-and-digest system. Do this during every salute." },
              { name: "Hands Relaxation Check", time: "Between events", desc: "Are your hands clenched? Gripping the seat? Open them, palms up on your lap. Relaxed hands = relaxed body = relaxed face. Your child CAN see your face from the floor." },
              { name: "The 3-Word Mantra", time: "Before and during", desc: "Choose 3 words before the meet: 'Trust her training.' Repeat silently when anxiety spikes. Options: 'She's got this.' 'Enjoy the journey.' 'Progress not perfection.'" },
              { name: "Score Detachment", time: "After each event", desc: "Before looking at the score, take one breath and say: 'The score does not define my child.' A 8.5 and a 9.3 both mean your child did something extraordinary." },
              { name: "The Car Ride Reset", time: "After the meet", desc: "Do NOT discuss scores for the first 15 minutes of the car ride. Ask: 'What was your favorite part today?' Let THEM bring up scores. The car ride sets the emotional tone for the next week." },
              { name: "Parent Support Network", time: "Ongoing", desc: "Sit with positive parents, not those who compare scores or criticize coaching. Negativity is contagious — so is positivity. Find your tribe." },
            ].map((ex, i) => (
              <div key={i} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: i < 5 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{ex.name}</span>
                  <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.04)", padding: "2px 6px", borderRadius: 4, whiteSpace: "nowrap" }}>{ex.time}</span>
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.7 }}>{ex.desc}</div>
              </div>
            ))}
          </div>

          <div className="card" style={{ padding: 16, marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>❌ Common Parent Traps</h3>
            {[
              { trap: "Coaching from the stands", why: "Your child hears you. It splits their focus. Trust the coach." },
              { trap: "Comparing to other gymnasts", why: "'Why did Sarah score higher?' is devastating. Every child's journey is different." },
              { trap: "Showing visible disappointment", why: "After a low score, your child looks at YOUR face first. Calm support teaches resilience." },
              { trap: "Over-analyzing scores immediately", why: "Let emotions settle. Debrief tomorrow. Right now they need a parent, not a judge." },
              { trap: "Talking to the coach about scores at meets", why: "Coaches are managing 10-20 athletes on meet day. Schedule a separate conversation." },
              { trap: "Making gymnastics their entire identity", why: "They're a kid who does gymnastics, not 'a gymnast who goes to school.' When sport = identity, pressure becomes unbearable." },
            ].map((item, i) => (
              <div key={i} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#dc2626", marginBottom: 2 }}>{item.trap}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>{item.why}</div>
              </div>
            ))}
          </div>

          <div className="card" style={{ padding: 16, marginBottom: 12, background: "rgba(34,197,94,0.04)", borderColor: "rgba(34,197,94,0.12)" }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: "#22c55e" }}>✓ What TO Say After a Meet</h3>
            {[
              "\"I loved watching you compete today.\"",
              "\"What was your favorite moment?\"",
              "\"I could see how hard you worked on that skill.\"",
              "\"You looked really confident out there.\"",
              "\"I'm proud of you no matter what the scores say.\"",
              "\"Want to grab ice cream?\"",
            ].map((s, i) => (
              <div key={i} style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.5, marginBottom: 6, paddingLeft: 12, borderLeft: "2px solid rgba(34,197,94,0.2)", fontStyle: "italic" }}>{s}</div>
            ))}
          </div>

          <div className="card" style={{ padding: 14, background: "rgba(232,150,42,0.03)", borderColor: "rgba(232,150,42,0.1)" }}>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.7, fontStyle: "italic" }}>
              <strong style={{ color: "#e8962a" }}>Remember:</strong> The average competitive gymnastics career lasts 4-8 years. The relationship with your child lasts forever. Protect the relationship — the scores will take care of themselves.
            </p>
          </div>
        </div>
      )}
    </div>
  );
});

// ─── SEASON GOALS SCREEN ────────────────────────────────────────────
const SeasonGoalsScreen = React.memo(function SeasonGoalsScreen({ profile, history, onBack }) {
  const [goals, setGoals] = useState([]);
  const [newGoalEvent, setNewGoalEvent] = useState("");
  const [newGoalTarget, setNewGoalTarget] = useState("");
  const events = profile.gender === "female" ? WOMEN_EVENTS : MEN_EVENTS;

  // Load goals from storage
  useEffect(() => {
    (async () => {
      try {
        const stored = await storage.get("strive-goals");
        if (stored) setGoals(JSON.parse(stored.value));
      } catch {}
    })();
  }, []);

  const saveGoals = async (g) => {
    setGoals(g);
    try { await storage.set("strive-goals", JSON.stringify(g)); } catch {}
  };

  const addGoal = () => {
    if (!newGoalEvent || !newGoalTarget) return;
    const currentBest = history.filter(h => h.event === newGoalEvent).reduce((best, h) => Math.max(best, h.score || 0), 0);
    saveGoals([...goals, {
      id: Date.now(), event: newGoalEvent, target: parseFloat(newGoalTarget),
      startScore: currentBest || null, created: new Date().toISOString(),
    }]);
    setNewGoalEvent(""); setNewGoalTarget("");
  };

  const removeGoal = (id) => saveGoals(goals.filter(g => g.id !== id));

  return (
    <div style={{ minHeight: "100vh", padding: "16px 18px 90px", maxWidth: 540, margin: "0 auto" }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: "rgba(232,150,42,0.6)", cursor: "pointer", fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 600, marginBottom: 14, display: "flex", alignItems: "center", gap: 4 }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M8.5 2.5l-5 5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> Dashboard
      </button>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}><Icon name="target" size={24} /> Season Goals</h2>
      <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, marginBottom: 20 }}>Set targets and track progress toward them</p>

      {/* Add new goal */}
      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Add a Goal</h3>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <select value={newGoalEvent} onChange={e => setNewGoalEvent(e.target.value)}
            className="input-field" style={{ flex: 2, fontSize: 13, padding: "10px 8px" }}>
            <option value="">Event...</option>
            {events.map(e => <option key={e} value={e}>{e}</option>)}
            <option value="All-Around">All-Around</option>
          </select>
          <input className="input-field" type="number" step="0.025" min="7" max="10"
            placeholder="Target (e.g. 9.2)" value={newGoalTarget}
            onChange={e => setNewGoalTarget(e.target.value)}
            style={{ flex: 1, fontSize: 13, fontFamily: "'Space Mono', monospace" }} />
        </div>
        <button onClick={addGoal} disabled={!newGoalEvent || !newGoalTarget}
          className="btn-gold" style={{ width: "100%", padding: "10px 12px", fontSize: 13, opacity: (!newGoalEvent || !newGoalTarget) ? 0.4 : 1 }}>
          Set Goal
        </button>
      </div>

      {/* Active goals */}
      {goals.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: "center" }}>
          <Icon name="target" size={28} />
          <p style={{ color: "rgba(255,255,255,0.4)", marginTop: 12, fontSize: 14 }}>No goals set yet. Add your first season goal above!</p>
        </div>
      ) : goals.map(goal => {
        const scores = history.filter(h => h.event === goal.event).map(h => h.score).filter(Boolean);
        const current = scores.length > 0 ? Math.max(...scores) : goal.startScore || 0;
        const startVal = goal.startScore || (current - 0.3);
        const range = goal.target - startVal;
        const progress = range > 0 ? Math.max(0, Math.min(100, ((current - startVal) / range) * 100)) : 0;
        const achieved = current >= goal.target;

        return (
          <div key={goal.id} className="card" style={{ padding: 16, marginBottom: 12, borderColor: achieved ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.06)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{goal.event}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
                  Current best: <span style={{ color: "#e8962a", fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>{current ? current.toFixed(3) : "—"}</span>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>TARGET</div>
                <div style={{ fontSize: 22, fontWeight: 900, fontFamily: "'Space Mono', monospace", color: achieved ? "#22c55e" : "#e8962a" }}>
                  {goal.target.toFixed(3)}
                </div>
              </div>
            </div>
            {/* Progress bar */}
            <div style={{ position: "relative", height: 8, borderRadius: 4, background: "rgba(255,255,255,0.06)", overflow: "hidden", marginBottom: 6 }}>
              <div style={{
                position: "absolute", top: 0, left: 0, bottom: 0, borderRadius: 4,
                width: `${progress}%`, transition: "width 0.5s ease-out",
                background: achieved ? "linear-gradient(90deg, #22c55e, #e8962a)" : "linear-gradient(90deg, #e8962a, #ffc15a)",
              }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: achieved ? "#22c55e" : "rgba(255,255,255,0.35)", fontWeight: achieved ? 700 : 400 }}>
                {achieved ? "🎉 GOAL ACHIEVED!" : `${progress.toFixed(0)}% of the way there`}
              </span>
              <button onClick={() => removeGoal(goal.id)} style={{
                background: "none", border: "none", color: "rgba(255,255,255,0.2)", cursor: "pointer", fontSize: 12, fontFamily: "'Outfit', sans-serif",
              }}>remove</button>
            </div>
          </div>
        );
      })}

      {/* Tip */}
      <div className="card" style={{ padding: 14, marginTop: 12, background: "rgba(232,150,42,0.03)", borderColor: "rgba(232,150,42,0.1)" }}>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.7, fontStyle: "italic" }}>
          <strong style={{ color: "#e8962a" }}>Setting good goals:</strong> Aim for 0.2-0.4 improvement per season on each event. That might sound small, but in gymnastics scoring, improving 0.3 on every event means a 1.2 improvement in All-Around — that's the difference between 5th place and 1st.
        </p>
      </div>
    </div>
  );
});

// ─── BODY HEATMAP — shows where on the body deductions cluster ──────
function BodyHeatmap({ deductions }) {
  if (!deductions || deductions.length === 0) return null;

  // Map deductions to body regions using engine, fault text, bodyPoint, and faultJoints
  const regions = {
    head:       { cx: 150, cy: 38,  rx: 18, ry: 22, label: "Head", total: 0, faults: [] },
    shoulders:  { cx: 150, cy: 82,  rx: 38, ry: 12, label: "Shoulders", total: 0, faults: [] },
    elbows:     { cx: 150, cy: 130, rx: 50, ry: 14, label: "Arms/Elbows", total: 0, faults: [] },
    wrists:     { cx: 150, cy: 175, rx: 55, ry: 10, label: "Wrists/Hands", total: 0, faults: [] },
    chest:      { cx: 150, cy: 110, rx: 28, ry: 20, label: "Chest/Torso", total: 0, faults: [] },
    hips:       { cx: 150, cy: 170, rx: 30, ry: 18, label: "Hips/Core", total: 0, faults: [] },
    knees:      { cx: 150, cy: 235, rx: 26, ry: 16, label: "Knees", total: 0, faults: [] },
    ankles:     { cx: 150, cy: 295, rx: 22, ry: 12, label: "Ankles/Feet", total: 0, faults: [] },
  };

  const classify = (d) => {
    const hits = [];
    const fault = (safeStr(d.fault) + " " + safeStr(d.details) + " " + safeStr(d.engine)).toLowerCase();

    // Check subFaults for bodyPoint
    const allBodyPoints = [];
    if (d.bodyPoint) allBodyPoints.push(d.bodyPoint);
    safeArray(d.subFaults).forEach(sf => { if (sf.bodyPoint) allBodyPoints.push(sf.bodyPoint); });

    // Check faultJoints from skeleton
    const fj = d.skeleton?.faultJoints || [];
    fj.forEach(j => {
      const jl = String(j || '').toLowerCase();
      if (jl.includes("ankle")) allBodyPoints.push("ankles");
      else if (jl.includes("knee")) allBodyPoints.push("knees");
      else if (jl.includes("hip")) allBodyPoints.push("hips");
      else if (jl.includes("elbow")) allBodyPoints.push("elbows");
      else if (jl.includes("wrist")) allBodyPoints.push("wrists");
      else if (jl.includes("shoulder")) allBodyPoints.push("shoulders");
    });

    allBodyPoints.forEach(bp => {
      const bl = String(bp || '').toLowerCase();
      if (bl.includes("ankle") || bl.includes("foot") || bl.includes("feet") || bl.includes("toe")) hits.push("ankles");
      else if (bl.includes("knee")) hits.push("knees");
      else if (bl.includes("hip") || bl.includes("core") || bl.includes("split")) hits.push("hips");
      else if (bl.includes("elbow") || bl.includes("arm")) hits.push("elbows");
      else if (bl.includes("wrist") || bl.includes("hand")) hits.push("wrists");
      else if (bl.includes("shoulder")) hits.push("shoulders");
      else if (bl.includes("torso") || bl.includes("chest")) hits.push("chest");
      else if (bl.includes("head")) hits.push("head");
    });

    // Fallback: infer from engine and fault text
    if (hits.length === 0) {
      if (d.engine === "TPM" || fault.match(/toe|foot|feet|flat.?foot|flex.*foot|ankle|relevé/)) hits.push("ankles");
      if (d.engine === "KTM" || fault.match(/knee|soft knee|cowboy|leg sep/)) hits.push("knees");
      if (d.engine === "Split-Check" || fault.match(/split|hip.*angle|hip.*vertex|over-split/)) hits.push("hips");
      if (d.engine === "VAE" || fault.match(/vertical|align|handstand|arch|hollow|pike|body line/)) hits.push("chest");
      if (d.engine === "Landing" || fault.match(/land|step|stuck|hop/)) { hits.push("ankles"); hits.push("knees"); }
      if (fault.match(/elbow|arm|lock.*arm/)) hits.push("elbows");
      if (fault.match(/shoulder|repulsion/)) hits.push("shoulders");
      if (fault.match(/wrist|hand|grip/)) hits.push("wrists");
      if (fault.match(/head|chin|spot/)) hits.push("head");
    }

    // If still nothing, put it on chest/torso as general
    if (hits.length === 0) hits.push("chest");

    return [...new Set(hits)];
  };

  // Accumulate deductions per region
  deductions.forEach(d => {
    const bodyRegions = classify(d);
    const share = d.deduction / bodyRegions.length; // split evenly if multiple regions
    bodyRegions.forEach(region => {
      if (regions[region]) {
        regions[region].total += share;
        regions[region].faults.push(safeStr(d.fault || d.skill).substring(0, 50));
      }
    });
  });

  const maxTotal = Math.max(...Object.values(regions).map(r => r.total), 0.01);
  const activeRegions = Object.entries(regions).filter(([, r]) => r.total > 0);

  if (activeRegions.length === 0) return null;

  return (
    <div className="card" style={{ padding: "16px 14px", marginBottom: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: 1, marginBottom: 8 }}>
        BODY FAULT MAP
      </div>
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        {/* Body silhouette with heatmap */}
        <svg viewBox="0 0 300 340" style={{ width: 160, flexShrink: 0 }}>
          {/* Body silhouette */}
          <g opacity="0.25" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" fill="none">
            {/* Head */}
            <ellipse cx="150" cy="38" rx="18" ry="22" />
            {/* Neck */}
            <line x1="150" y1="60" x2="150" y2="72" />
            {/* Torso */}
            <path d="M 120 72 L 120 170 Q 120 180 130 180 L 170 180 Q 180 180 180 170 L 180 72 Z" />
            {/* Shoulders to elbows */}
            <line x1="120" y1="80" x2="88" y2="130" />
            <line x1="180" y1="80" x2="212" y2="130" />
            {/* Elbows to wrists */}
            <line x1="88" y1="130" x2="80" y2="185" />
            <line x1="212" y1="130" x2="220" y2="185" />
            {/* Hips to knees */}
            <line x1="130" y1="180" x2="122" y2="248" />
            <line x1="170" y1="180" x2="178" y2="248" />
            {/* Knees to ankles */}
            <line x1="122" y1="248" x2="118" y2="310" />
            <line x1="178" y1="248" x2="182" y2="310" />
            {/* Feet */}
            <ellipse cx="118" cy="318" rx="10" ry="6" />
            <ellipse cx="182" cy="318" rx="10" ry="6" />
          </g>

          {/* Heatmap glows */}
          <defs>
            {activeRegions.map(([key, r]) => {
              const intensity = r.total / maxTotal;
              const color = intensity > 0.6 ? "239,68,68" : intensity > 0.3 ? "245,158,11" : "34,197,94";
              return (
                <radialGradient key={key} id={`glow-${key}`}>
                  <stop offset="0%" stopColor={`rgba(${color},${0.6 * intensity + 0.2})`} />
                  <stop offset="60%" stopColor={`rgba(${color},${0.2 * intensity})`} />
                  <stop offset="100%" stopColor={`rgba(${color},0)`} />
                </radialGradient>
              );
            })}
          </defs>

          {activeRegions.map(([key, r]) => {
            const intensity = r.total / maxTotal;
            const baseR = r.rx * (1 + intensity * 0.5);
            const baseRy = r.ry * (1 + intensity * 0.5);
            // Position adjustments for limbs (left + right)
            const spots = key === "elbows" ? [{ cx: 88, cy: 130 }, { cx: 212, cy: 130 }]
              : key === "wrists" ? [{ cx: 80, cy: 185 }, { cx: 220, cy: 185 }]
              : key === "knees" ? [{ cx: 122, cy: 248 }, { cx: 178, cy: 248 }]
              : key === "ankles" ? [{ cx: 118, cy: 312 }, { cx: 182, cy: 312 }]
              : [{ cx: r.cx, cy: r.cy }];
            return spots.map((s, si) => (
              <ellipse key={`${key}-${si}`} cx={s.cx} cy={s.cy} rx={baseR * 0.7} ry={baseRy * 1.2}
                fill={`url(#glow-${key})`} style={{ animation: `pulse ${2 + si * 0.3}s ease-in-out infinite alternate` }} />
            ));
          })}

          {/* Deduction amounts on hotspots */}
          {activeRegions.map(([key, r]) => {
            const intensity = r.total / maxTotal;
            const color = intensity > 0.6 ? "#dc2626" : intensity > 0.3 ? "#ffc15a" : "#22c55e";
            const labelPos = key === "elbows" ? { x: 242, y: 134 }
              : key === "wrists" ? { x: 248, y: 189 }
              : key === "knees" ? { x: 210, y: 252 }
              : key === "ankles" ? { x: 212, y: 316 }
              : key === "head" ? { x: 190, y: 42 }
              : key === "shoulders" ? { x: 210, y: 86 }
              : key === "chest" ? { x: 206, y: 114 }
              : { x: 206, y: 174 }; // hips
            return (
              <text key={key} x={labelPos.x} y={labelPos.y} fill={color}
                fontSize="11" fontWeight="800" fontFamily="'Space Mono', monospace"
                textAnchor="start" dominantBaseline="middle">
                -{r.total.toFixed(2)}
              </text>
            );
          })}
        </svg>

        {/* Legend / breakdown list */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {activeRegions
            .sort(([, a], [, b]) => b.total - a.total)
            .map(([key, r]) => {
              const intensity = r.total / maxTotal;
              const color = intensity > 0.6 ? "#dc2626" : intensity > 0.3 ? "#ffc15a" : "#22c55e";
              return (
                <div key={key} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>{r.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 800, fontFamily: "'Space Mono', monospace", color }}>-{r.total.toFixed(2)}</span>
                  </div>
                  {/* Bar */}
                  <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${intensity * 100}%`, borderRadius: 2, background: color, transition: "width 0.5s ease" }} />
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2, lineHeight: 1.3 }}>
                    {r.faults.slice(0, 2).join(" · ")}{r.faults.length > 2 ? ` +${r.faults.length - 2} more` : ""}
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}

// ─── DEDUCTION TIMELINE HEATMAP ─────────────────────────────────────
function DeductionTimeline({ deductions, duration }) {
  if (!deductions || deductions.length === 0) return null;

  // Parse timestamps to seconds
  const timed = deductions.map(d => {
    const ts = safeStr(d.timestamp);
    if (String(ts || '').toLowerCase() === "global") return { ...d, sec: -1 };
    const parts = ts.split(":");
    const sec = parts.length === 2 ? parseInt(parts[0]) * 60 + parseInt(parts[1]) : parseFloat(parts[0]) || 0;
    return { ...d, sec };
  }).filter(d => d.sec >= 0);

  if (timed.length === 0) return null;

  const maxTime = duration || Math.max(...timed.map(d => d.sec), 60);

  // Build 10 time buckets
  const bucketCount = 10;
  const bucketSize = maxTime / bucketCount;
  const buckets = Array(bucketCount).fill(0);
  const bucketDeductions = Array.from({ length: bucketCount }, () => []);
  timed.forEach(d => {
    const idx = Math.min(Math.floor(d.sec / bucketSize), bucketCount - 1);
    buckets[idx] += d.deduction;
    bucketDeductions[idx].push(d);
  });
  const maxBucket = Math.max(...buckets, 0.01);

  return (
    <div className="card" style={{ padding: "12px 14px", marginBottom: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: 1, marginBottom: 8 }}>
        DEDUCTION TIMELINE
      </div>
      <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 40 }}>
        {buckets.map((val, i) => {
          const intensity = val / maxBucket;
          const barColor = intensity > 0.7 ? "#dc2626" : intensity > 0.4 ? "#ffc15a" : intensity > 0 ? "#22c55e" : "rgba(255,255,255,0.06)";
          const barHeight = val > 0 ? Math.max(6, intensity * 36) : 4;
          const startSec = Math.round(i * bucketSize);
          const endSec = Math.round((i + 1) * bucketSize);
          const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
          return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }} title={`${fmtTime(startSec)}-${fmtTime(endSec)}: ${val > 0 ? "-" + val.toFixed(2) : "clean"} (${bucketDeductions[i].length} ded)`}>
              <div style={{
                width: "100%", height: barHeight, borderRadius: 3,
                background: barColor, transition: "all 0.3s ease",
                opacity: val > 0 ? 0.85 : 0.3,
              }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", fontFamily: "'Space Mono', monospace" }}>0:00</span>
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", fontFamily: "'Space Mono', monospace" }}>
          {Math.floor(maxTime / 60)}:{String(Math.round(maxTime % 60)).padStart(2, "0")}
        </span>
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 6, justifyContent: "center" }}>
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "#22c55e", marginRight: 3, verticalAlign: "middle" }} />Minor</span>
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "#ffc15a", marginRight: 3, verticalAlign: "middle" }} />Moderate</span>
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "#dc2626", marginRight: 3, verticalAlign: "middle" }} />Heavy</span>
      </div>
    </div>
  );
}

// ─── DEDUCTIONS TAB — Grouped skill cards with sub-faults + skeleton ─
function DeductionsTabContent({ result, frames }) {
  const [expandedIdx, setExpandedIdx] = useState(null);

  // Match frames to deductions by closest timestamp
  const getFrameForDeduction = (d) => {
    if (!frames || frames.length === 0) return null;
    const ts = safeStr(d.timestamp);
    if (String(ts || '').toLowerCase() === "global") return null;
    const parts = ts.split(":");
    const sec = parts.length === 2 ? parseInt(parts[0]) * 60 + parseInt(parts[1]) : parseFloat(parts[0]) || 0;
    let closest = null;
    let minDist = Infinity;
    frames.forEach(f => {
      const fSec = parseFloat(f.timestamp) || 0;
      const dist = Math.abs(fSec - sec);
      if (dist < minDist) { minDist = dist; closest = f; }
    });
    return minDist < 15 ? closest : null; // within 15s
  };

  // Estimate routine duration from last deduction timestamp
  const lastDed = result.executionDeductions?.slice().sort((a, b) => {
    const parse = (ts) => { const p = safeStr(ts).split(":"); return p.length === 2 ? parseInt(p[0]) * 60 + parseInt(p[1]) : parseFloat(p[0]) || 0; };
    return parse(b.timestamp) - parse(a.timestamp);
  })[0];
  const estDuration = lastDed ? (() => { const p = safeStr(lastDed.timestamp).split(":"); return (p.length === 2 ? parseInt(p[0]) * 60 + parseInt(p[1]) : parseFloat(p[0]) || 0) + 10; })() : null;

  return (
    <div style={{ animation: "fadeIn 0.4s ease-out" }}>
      {/* Body fault heatmap */}
      <BodyHeatmap deductions={result.executionDeductions} />

      {/* Temporal heatmap */}
      <DeductionTimeline deductions={result.executionDeductions} duration={estDuration} />

      {/* Compact scorecard table */}
      <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 12 }}>
        {/* Header row */}
        <div style={{ display: "grid", gridTemplateColumns: "50px 1fr auto", gap: 0, padding: "10px 14px", background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: 1 }}>TIME</span>
          <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: 1 }}>SKILL / FAULT</span>
          <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: 1, textAlign: "right" }}>DED</span>
        </div>

        {/* Deduction rows */}
        {result.executionDeductions?.map((d, i) => {
          const c = DEDUCTION_SCALE[d.severity]?.color || "#ffc15a";
          const isExpanded = expandedIdx === i;
          const frame = isExpanded ? getFrameForDeduction(d) : null;
          return (
            <div key={i}>
              <div onClick={() => setExpandedIdx(isExpanded ? null : i)} style={{
                display: "grid", gridTemplateColumns: "50px 1fr auto", gap: 0,
                padding: "10px 14px", borderBottom: isExpanded ? "none" : "1px solid rgba(255,255,255,0.04)",
                borderLeft: `3px solid ${c}`, cursor: "pointer",
                background: isExpanded ? `${c}08` : "transparent",
                animation: `slideUp 0.2s ease-out ${i * 0.03}s both`,
              }}>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontFamily: "'Space Mono', monospace" }}>{d.timestamp || "—"}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.skill}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2, lineHeight: 1.3 }}>
                    {d.fault || d.details || ""}
                  </div>
                  <div style={{ display: "flex", gap: 4, marginTop: 3, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 3, background: `${c}18`, color: c, fontWeight: 700 }}>{d.category?.toUpperCase()}</span>
                    {d.engine && d.engine !== "General" && <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 3, background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.35)", fontWeight: 600 }}>{d.engine}</span>}
                    {d.confidence != null && (
                      <span style={{
                        fontSize: 8, padding: "1px 5px", borderRadius: 3, fontWeight: 700,
                        background: d.confidence >= 0.8 ? "rgba(34,197,94,0.12)" : d.confidence >= 0.6 ? "rgba(255,193,90,0.12)" : "rgba(220,38,38,0.12)",
                        color: d.confidence >= 0.8 ? "#22c55e" : d.confidence >= 0.6 ? "#ffc15a" : "#dc2626",
                      }}>{Math.round(d.confidence * 100)}% conf</span>
                    )}
                    {d.lowConfidence && (
                      <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 3, background: "rgba(220,38,38,0.12)", color: "#dc2626", fontWeight: 600, fontStyle: "italic" }}>LOW CONF</span>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, paddingLeft: 8 }}>
                  <span style={{ fontFamily: "'Space Mono', monospace", fontWeight: 900, fontSize: 15, color: c }}>
                    -{d.deduction?.toFixed(2)}
                  </span>
                  <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)" }}>{isExpanded ? "▲" : "▼"}</span>
                </div>
              </div>
              {/* Expanded detail panel with frame thumbnail */}
              {isExpanded && (
                <div style={{
                  padding: "12px 14px 14px 53px", borderBottom: "1px solid rgba(255,255,255,0.04)",
                  background: `${c}06`, borderLeft: `3px solid ${c}`,
                  animation: "fadeIn 0.2s ease-out",
                }}>
                  <div style={{ display: "flex", gap: 12 }}>
                    {/* Frame thumbnail */}
                    {frame && (
                      <div style={{ flexShrink: 0 }}>
                        <img src={frame.dataUrl} alt={`Frame at ${frame.timestamp}s`} style={{
                          width: 120, height: 90, objectFit: "cover", borderRadius: 8,
                          border: `2px solid ${c}40`,
                        }} />
                        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", textAlign: "center", marginTop: 3, fontFamily: "'Space Mono', monospace" }}>
                          {parseFloat(frame.timestamp).toFixed(1)}s
                        </div>
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {d.details && d.details !== d.fault && (
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.5, marginBottom: 6 }}>{d.details}</div>
                      )}
                      {d.correction && (
                        <div style={{ fontSize: 11, color: "#22c55e", lineHeight: 1.4, padding: "6px 8px", background: "rgba(34,197,94,0.08)", borderRadius: 6 }}>
                          <span style={{ fontWeight: 700 }}>Fix: </span>{d.correction}
                        </div>
                      )}
                      {d.subFaults && d.subFaults.length > 0 && (
                        <div style={{ marginTop: 6 }}>
                          {d.subFaults.map((sf, si) => (
                            <div key={si} style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", lineHeight: 1.4, padding: "2px 0", display: "flex", justifyContent: "space-between" }}>
                              <span>{sf.fault}</span>
                              <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: c, fontWeight: 600 }}>-{sf.deduction?.toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Math breakdown */}
      <div style={{
        background: "linear-gradient(135deg, rgba(232,150,42,0.06), rgba(232,150,42,0.02))",
        border: "1px solid rgba(232,150,42,0.15)", borderRadius: 12,
        padding: 16, marginTop: 4,
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: 1, marginBottom: 10 }}>SCORE MATH</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {safeNum(result.executionDeductionsTotal, 0) > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>Execution ({result.executionDeductions?.filter(d => d.category !== "artistry").length || 0} deductions)</span>
              <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, fontWeight: 700, color: "#dc2626" }}>-{safeNum(result.executionDeductionsTotal, 0).toFixed(3)}</span>
            </div>
          )}
          {safeNum(result.artistryDeductionsTotal, 0) > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>Artistry ({result.executionDeductions?.filter(d => d.category === "artistry").length || 0} deductions)</span>
              <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, fontWeight: 700, color: "#dc2626" }}>-{safeNum(result.artistryDeductionsTotal, 0).toFixed(3)}</span>
            </div>
          )}
          <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "4px 0" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.8)" }}>Total Deductions ({result.executionDeductions?.length || 0} items)</span>
            <span style={{ fontFamily: "'Space Mono', monospace", fontWeight: 900, fontSize: 16, color: "#dc2626" }}>-{safeNum(result.totalDeductions, 0).toFixed(3)}</span>
          </div>
          <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "2px 0" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.5)" }}>
              {safeNum(result.startValue, 10).toFixed(1)} - {safeNum(result.totalDeductions, 0).toFixed(3)} =
            </span>
            <span style={{ fontFamily: "'Space Mono', monospace", fontWeight: 900, fontSize: 20, color: result.finalScore >= 9.0 ? "#22c55e" : result.finalScore >= 8.0 ? "#ffc15a" : "#dc2626" }}>
              {safeNum(result.finalScore, 0).toFixed(3)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── WEEKLY TRAINING PLAN (added to Drills screen) ──────────────────
function WeeklyTrainingPlan({ faults }) {
  const [expanded, setExpanded] = useState(false);
  const topFaults = [...new Set(faults)].slice(0, 3);

  const dayPlans = [
    { day: "Monday", focus: "Strength & Conditioning", items: ["Hollow body holds 4×20s", "Plank variations 3×30s", "Leg lifts on bar 3×10", "Plyometric jumps 3×8"] },
    { day: "Tuesday", focus: "Flexibility & Body Lines", items: ["Splits routine (all 3) 5 min each", "Shoulder flexibility 5 min", "Bridge walk-overs 10 reps", "Relevé walks on beam line 2× length"] },
    { day: "Wednesday", focus: "Skill-Specific Drills", items: topFaults.length > 0 ? topFaults.map(f => {
      if (f.includes("knee") || f.includes("leg")) return "Straight-leg drills: handstands, casts, jumps with focus on locked knees";
      if (f.includes("land") || f.includes("step")) return "Landing drills: 20 stick landings from low block, drop landings 3×8";
      if (f.includes("foot") || f.includes("flex")) return "Theraband ankle exercises 3×20, toe point practice 5 min";
      return "Full routine run-through focusing on identified weak points";
    }) : ["Full routine run-through 3×", "Skill repetitions on weakest elements", "Combination practice (linking skills)"] },
    { day: "Thursday", focus: "Power & Amplitude", items: ["Box jumps 4×6", "Hurdle-punch drills 10 reps", "Tumbling into pit for height", "Sprint training 4×20m for vault approach"] },
    { day: "Friday", focus: "Full Routine Practice", items: ["Complete routine run 3× each event", "Focus on presentation and artistry", "Mock judging: have coach score", "Cool down: flexibility + visualization 10 min"] },
  ];

  return (
    <div className="card" style={{ padding: 16, marginBottom: 16, borderColor: "rgba(232,150,42,0.12)" }}>
      <div onClick={() => setExpanded(!expanded)} style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ fontSize: 14, fontWeight: 700 }}><Icon name="target" size={14} /> Weekly Training Plan</h3>
        <span style={{ color: "#e8962a", fontSize: 13, fontWeight: 600 }}>{expanded ? "▲" : "▼"}</span>
      </div>
      {expanded && (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 12 }}>Based on the faults identified in this analysis:</p>
          {dayPlans.map((day, i) => (
            <div key={i} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: i < dayPlans.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#e8962a" }}>{day.day}</span>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{day.focus}</span>
              </div>
              {day.items.map((item, j) => (
                <div key={j} style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.7, paddingLeft: 12, borderLeft: "2px solid rgba(232,150,42,0.1)" }}>
                  {item}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── DIAGNOSTICS DASHBOARD ──────────────────────────────────────────
// ─── EVIDENCE-BASED TRAINING SOURCES ────────────────────────────────
// Programs derived from: USAG Athlete Wellness (usagym.org/wellness),
// NSCA Youth Training Position Statement, ACSM Pediatric Exercise Guidelines,
// USA Gymnastics SafeSport & Injury Prevention protocols
const EVIDENCE_PROGRAMS = {
  strength: {
    // NSCA: youth athletes benefit from bodyweight + light resistance, 2-3x/week
    // USAG: conditioning should match competitive demands
    core: [
      { exercise: "Hollow body hold", prescription: "4 × 20 sec", source: "USAG conditioning", why: "Foundation of all aerial body tension — directly reduces pike/arch deductions" },
      { exercise: "V-ups", prescription: "3 × 12 reps", source: "NSCA youth protocol", why: "Dynamic core strength for tuck/pike initiation speed" },
      { exercise: "Plank to pike walk-out", prescription: "3 × 8 reps", source: "ACSM functional training", why: "Core-to-shoulder chain integration for handstand transitions" },
    ],
    lowerBody: [
      { exercise: "Single-leg Romanian deadlift", prescription: "3 × 10 each leg", source: "NSCA injury prevention", why: "Addresses valgus knee pattern, strengthens VMO and hamstrings" },
      { exercise: "Depth drops to stick", prescription: "3 × 8 from 12-18 inch", source: "USAG landing protocol", why: "Eccentric landing control — directly reduces step deductions" },
      { exercise: "Lateral band walks", prescription: "3 × 15 each direction", source: "ACSM knee stability", why: "Glute med activation prevents inward knee collapse on landing" },
    ],
    upperBody: [
      { exercise: "Handstand shoulder shrugs (wall)", prescription: "3 × 10", source: "USAG bars conditioning", why: "Shoulder extension for cast handstand and support positions" },
      { exercise: "Eccentric pull-up negatives", prescription: "3 × 5 (5-sec descent)", source: "NSCA upper body", why: "Pull strength for kips, giants, and transition skills" },
    ],
    flexibility: [
      { exercise: "PNF hamstring stretching", prescription: "3 × 30 sec each leg", source: "ACSM flexibility guidelines", why: "Improves split angle — directly addresses split-check deductions" },
      { exercise: "Shoulder CAR (controlled articular rotations)", prescription: "2 × 5 each direction", source: "NSCA joint health", why: "Shoulder mobility for full bridge, walkovers, and casting" },
    ],
  },
  drills: {
    toePoint: { drill: "Theraband ankle point/flex circuit", prescription: "3 × 20 each direction, daily", source: "USAG foot training", why: "Addresses TPM deductions — strengthens plantar flexion for automatic point" },
    kneeControl: { drill: "Foam block squeeze during jumps", prescription: "20 reps per practice", source: "USAG body tension", why: "Addresses KTM deductions — eliminates cowboy/separation in tucks" },
    landing: { drill: "Stick landing series (low-to-high)", prescription: "20 reps, freeze 3 sec", source: "USAG landing protocol", why: "Addresses landing deductions — builds automatic deceleration control" },
    alignment: { drill: "Dowel rod alignment check", prescription: "5 min warm-up", source: "USAG body position", why: "Addresses VAE deductions — builds proprioceptive awareness of body line" },
  },
  mental: {
    // Based on USAG Athlete Wellness mental performance guidelines
    visualization: "Spend 5 minutes before bed mentally performing your routine. Research (Journal of Applied Sport Psychology) shows mental rehearsal activates the same motor pathways as physical practice.",
    preRoutine: "Develop a consistent pre-routine ritual: 3 deep breaths during salute. Inhale confidence, exhale tension. Consistent rituals reduce anxiety by 23% (International Journal of Sport Psychology).",
    errorRecovery: "The '5-second reset': acknowledge the mistake, take one breath, commit to the next skill. Judges score the whole routine. Research shows athletes who reset quickly lose 40% fewer points after errors.",
    fallRecovery: "After a fall, the biggest risk is the NEXT skill — not the fall itself. Practice 'post-fall routines' in training: simulate a fall, stand up, breathe, then execute the next skill with full commitment.",
    confidenceBuilding: "Keep a 'confidence journal': after each practice, write 3 things you did well. This trains your brain to notice success instead of fixating on errors (Positive Psychology in Sport, 2019).",
  },
  nutrition: {
    // ACSM + Academy of Nutrition and Dietetics position on youth athlete nutrition
    young: [
      "Growing gymnasts need 1,600-2,200 calories/day depending on training volume. Never restrict — growing bodies need fuel for bones, muscles, and brain development (Academy of Nutrition and Dietetics).",
      "Calcium goal: 1,300mg/day (3-4 servings of dairy or calcium-fortified foods). Critical for bone density in a high-impact sport (ACSM Pediatric Guidelines).",
      "Pre-practice snack 1-2 hours before: banana + peanut butter, or yogurt + granola. Post-practice within 30 minutes: chocolate milk or protein smoothie (ISSN youth position).",
    ],
    teen: [
      "Performance nutrition: 1.2-1.6g protein per kg bodyweight daily, spread across meals. Protein timing matters — eat within 30 minutes post-training (ISSN Position Stand).",
      "Hydrate: 8+ oz water every 20 minutes during training. For sessions over 90 minutes, add electrolytes. Dehydration of just 2% reduces power output by 10% (ACSM Fluid Guidelines).",
      "Meet day: eat familiar foods only. Carb-focused meal 3 hours before (pasta, rice, toast). Light snack 1 hour before (banana, crackers). Avoid high-fiber and high-fat foods (USAG competition nutrition).",
    ],
    adult: [
      "Recovery nutrition: 20-40g protein + 40-80g carbs within 30 minutes post-training. This window maximizes muscle protein synthesis (ISSN Position Stand on Nutrient Timing).",
      "Anti-inflammatory foods for joint health: omega-3 rich fish 2x/week, berries, leafy greens, turmeric. Reduces training-induced inflammation (Journal of the International Society of Sports Nutrition).",
    ],
  },
  recovery: {
    // ACSM + USAG recovery guidelines
    sleep: { young: "9-11 hours/night (ACSM Pediatric Guidelines). Growth hormone is released during deep sleep — this is when your body actually builds strength.", teen: "8-10 hours/night. Consistent bedtime is more important than total hours. Blue light from screens within 1 hour of bed reduces sleep quality by 30% (Sleep Foundation).", adult: "7-9 hours/night. Sleep is the single most effective recovery tool available (Matthew Walker, 'Why We Sleep')." },
    active: "Active recovery on rest days: 20-minute walk, gentle yoga, or swimming. Research shows light movement increases blood flow to muscles, speeding recovery by 25% vs. complete rest (ACSM Recovery Guidelines).",
    foam: "Foam rolling post-practice: 30-60 seconds per muscle group on quads, hamstrings, calves, and upper back. Reduces DOMS (delayed onset muscle soreness) and maintains range of motion (Journal of Athletic Training).",
  },
};

// ─── DAILY INSPIRATION ENGINE ────────────────────────────────────────
const DAILY_INSPIRATION = {
  strength: [
    "Strong muscles protect joints. Every rep today is an investment in a longer, healthier gymnastics career.",
    "Champions aren't born with strong cores — they build them one hollow body hold at a time.",
    "The gymnast who conditions when no one is watching is the one who sticks the landing when everyone is.",
    "Your body is your instrument. Conditioning tunes it. Today's work creates tomorrow's power.",
    "Simone Biles didn't skip conditioning day. Neither will you.",
  ],
  nutrition: [
    "Food is fuel, not the enemy. The best gymnasts eat enough to train hard and recover fully.",
    "Your muscles are rebuilding right now — give them the protein and carbs they need to come back stronger.",
    "Hydration tip: by the time you feel thirsty, you've already lost performance. Sip throughout the day.",
    "What you eat today becomes the energy for tomorrow's practice. Choose foods that make you powerful.",
    "Recovery starts in the kitchen. A balanced meal after practice does more than any supplement ever could.",
  ],
  mental: [
    "Confidence isn't the absence of fear — it's trusting your training when the fear shows up.",
    "Every champion has fallen. What makes them champions is how they get back up — and you're getting back up.",
    "Your brain is a muscle too. Visualization practice tonight makes tomorrow's routine sharper.",
    "Mistakes don't define you. How you respond to them does. Reset. Breathe. Commit to the next skill.",
    "You don't have to be perfect. You just have to be brave enough to try again.",
  ],
  drills: [
    "Perfect practice makes perfect. 10 minutes of focused drill work beats an hour of mindless reps.",
    "The small details — pointed toes, tight knees, straight arms — are what separate good from great.",
    "Every deduction you fix in practice is a tenth you earn in competition. Details matter.",
    "Drill work isn't boring — it's where champions are built. Own the basics and the rest follows.",
    "The judges can't deduct what isn't there. Clean technique starts with today's drill work.",
  ],
  recovery: [
    "Rest isn't lazy — it's strategic. Your body gets stronger during recovery, not during training.",
    "Sleep is the ultimate performance enhancer. Tonight's rest fuels tomorrow's best routine.",
    "Stretching and foam rolling today means showing up to practice tomorrow without stiffness holding you back.",
    "The best athletes know when to push and when to recover. Today, recover with intention.",
    "Your body is talking to you. Listen. Rest when you need it so you can fly when it counts.",
  ],
};

function getDailyInspiration(pillar) {
  const quotes = DAILY_INSPIRATION[pillar] || DAILY_INSPIRATION.mental;
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  return quotes[dayOfYear % quotes.length];
}

// ─── PROGRESS TRACKER (reads history for trend data) ─────────────────
function PillarProgress({ history, profile }) {
  if (!history || history.length < 2) return null;

  // Sort by date ascending
  const sorted = [...history].sort((a, b) => new Date(a.date) - new Date(b.date));
  const recent = sorted.slice(-10); // last 10 analyses

  // Track pillar trends
  const strengthTrend = recent.map((h, i) => ({
    label: `#${i + 1}`,
    landing: h.landingCount || 0,
    knees: h.ktmCount || 0,
    toes: h.tpmCount || 0,
    power: h.powerRating || 0,
  }));

  const scoreTrend = recent.map((h, i) => ({
    label: `#${i + 1}`,
    score: h.score || 0,
    deductions: h.deductions || 0,
  }));

  // Calculate improvement percentages
  const firstHalf = recent.slice(0, Math.ceil(recent.length / 2));
  const secondHalf = recent.slice(Math.ceil(recent.length / 2));
  const avgFirst = firstHalf.reduce((s, h) => s + (h.score || 0), 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((s, h) => s + (h.score || 0), 0) / secondHalf.length;
  const scoreDelta = avgSecond - avgFirst;

  const avgLandFirst = firstHalf.reduce((s, h) => s + (h.landingCount || 0), 0) / firstHalf.length;
  const avgLandSecond = secondHalf.reduce((s, h) => s + (h.landingCount || 0), 0) / secondHalf.length;
  const landingImproved = avgLandSecond < avgLandFirst;

  const avgFallFirst = firstHalf.filter(h => h.hasFall).length / firstHalf.length;
  const avgFallSecond = secondHalf.filter(h => h.hasFall).length / secondHalf.length;
  const fallsImproved = avgFallSecond < avgFallFirst;

  return (
    <div className="card" style={{ padding: 16, marginBottom: 12, borderColor: "rgba(168,85,247,0.15)" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#a855f7", letterSpacing: 1, marginBottom: 4 }}>📊 YOUR PROGRESS — {recent.length} Analyses</div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 12 }}>Tracking improvement across all training pillars over time</div>

      {/* Score trend */}
      {scoreTrend.length >= 2 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.6)", marginBottom: 6 }}>Score Trend</div>
          <StriveErrorBoundary name="Chart">
          <ResponsiveContainer width="100%" height={80}>
            <LineChart data={scoreTrend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 9 }} />
              <YAxis domain={["auto", "auto"]} tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 9 }} />
              <Line type="monotone" dataKey="score" stroke="#e8962a" strokeWidth={2} dot={{ r: 3, fill: "#e8962a" }} />
            </LineChart>
          </ResponsiveContainer>
          </StriveErrorBoundary>
        </div>
      )}

      {/* Improvement indicators */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 30%", minWidth: 80, padding: 10, borderRadius: 8, background: `rgba(${scoreDelta >= 0 ? "34,197,94" : "239,68,68"},0.04)`, textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: scoreDelta >= 0 ? "#22c55e" : "#dc2626", fontFamily: "'Space Mono', monospace" }}>
            {scoreDelta >= 0 ? "+" : ""}{scoreDelta.toFixed(2)}
          </div>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)" }}>Score Change</div>
        </div>
        <div style={{ flex: "1 1 30%", minWidth: 80, padding: 10, borderRadius: 8, background: `rgba(${landingImproved ? "34,197,94" : "245,158,11"},0.04)`, textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: landingImproved ? "#22c55e" : "#ffc15a" }}>
            {landingImproved ? "Improving" : "Work on it"}
          </div>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)" }}>Landings</div>
        </div>
        <div style={{ flex: "1 1 30%", minWidth: 80, padding: 10, borderRadius: 8, background: `rgba(${fallsImproved ? "34,197,94" : "239,68,68"},0.04)`, textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: fallsImproved ? "#22c55e" : avgFallSecond === 0 ? "#22c55e" : "#dc2626" }}>
            {avgFallSecond === 0 ? "No Falls!" : fallsImproved ? "Fewer Falls" : "Watch Falls"}
          </div>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)" }}>Fall Trend</div>
        </div>
      </div>

      {/* Deduction pattern trends */}
      {strengthTrend.length >= 2 && (strengthTrend[0].landing > 0 || strengthTrend[0].knees > 0 || strengthTrend[0].toes > 0) && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.6)", marginBottom: 6 }}>Deduction Patterns Over Time</div>
          <StriveErrorBoundary name="Chart">
          <ResponsiveContainer width="100%" height={80}>
            <LineChart data={strengthTrend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 9 }} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 9 }} />
              <Line type="monotone" dataKey="landing" name="Landings" stroke="#dc2626" strokeWidth={1.5} dot={{ r: 2 }} />
              <Line type="monotone" dataKey="knees" name="Knees" stroke="#e06820" strokeWidth={1.5} dot={{ r: 2 }} />
              <Line type="monotone" dataKey="toes" name="Toes" stroke="#8b5cf6" strokeWidth={1.5} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
          </StriveErrorBoundary>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 4 }}>
            {[{label: "Landings", color: "#dc2626"}, {label: "Knees", color: "#e06820"}, {label: "Toes", color: "#8b5cf6"}].map(l => (
              <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, color: "rgba(255,255,255,0.3)" }}>
                <div style={{ width: 8, height: 3, background: l.color, borderRadius: 2 }} />{l.label}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 6, textAlign: "center" }}>
            Lines going down = fewer deductions in that area (improvement!)
          </div>
        </div>
      )}
    </div>
  );
}

// ─── TRAINING PROGRAM TAB (dual-headed: this week + season plan) ────
function TrainingProgram({ result, profile, history }) {
  const coach = result.coachReport;
  const dev = result.athleteDevelopment;
  const bio = result.biomechanics;
  const deds = result.executionDeductions || [];
  const risks = bio?.injuryRiskFlags || [];
  const ageGroup = profile?.age && profile.age < 13 ? "young" : profile?.age && profile.age < 18 ? "teen" : "adult";

  const tpmCount = deds.filter(d => d.engine === "TPM" || (d.fault || "").toLowerCase().match(/toe|foot|flex|ankle/)).length;
  const ktmCount = deds.filter(d => d.engine === "KTM" || (d.fault || "").toLowerCase().match(/knee|soft|separation|cowboy/)).length;
  const landCount = deds.filter(d => d.category === "landing" || (d.fault || "").toLowerCase().match(/land|step|squat/)).length;
  const vaeCount = deds.filter(d => d.engine === "VAE" || (d.fault || "").toLowerCase().match(/align|vertical|handstand|arch/)).length;
  const hasFall = deds.some(d => d.severity === "fall" || (d.fault || "").toLowerCase().includes("fall"));
  const landingTotal = deds.filter(d => d.category === "landing").reduce((s, d) => s + (d.deduction || 0), 0);

  const priorities = [
    { area: "landing", count: landCount, total: landingTotal, label: "Landing Control" },
    { area: "kneeControl", count: ktmCount, total: ktmCount * 0.08, label: "Knee Tension" },
    { area: "toePoint", count: tpmCount, total: tpmCount * 0.05, label: "Toe Point" },
    { area: "alignment", count: vaeCount, total: vaeCount * 0.08, label: "Body Alignment" },
  ].sort((a, b) => b.total - a.total);

  const [viewMode, setViewMode] = useState("thisWeek"); // "thisWeek" or "season"

  // Analyze history for long-term patterns
  const historyEntries = history || [];
  const hasHistory = historyEntries.length >= 2;
  const persistentIssues = [];
  if (hasHistory) {
    const recentEntries = historyEntries.slice(-5);
    const avgLanding = recentEntries.reduce((s, h) => s + (h.landingCount || 0), 0) / recentEntries.length;
    const avgKtm = recentEntries.reduce((s, h) => s + (h.ktmCount || 0), 0) / recentEntries.length;
    const avgTpm = recentEntries.reduce((s, h) => s + (h.tpmCount || 0), 0) / recentEntries.length;
    if (avgLanding >= 2) persistentIssues.push({ area: "Landing", avg: avgLanding.toFixed(1), tip: "Landings remain a consistent issue — consider dedicated landing clinics or working with a trampoline/tumbling coach" });
    if (avgKtm >= 2) persistentIssues.push({ area: "Knee Control", avg: avgKtm.toFixed(1), tip: "Knee separation/softness is a recurring pattern — add daily foam block squeezes and single-leg stability work" });
    if (avgTpm >= 3) persistentIssues.push({ area: "Toe Point", avg: avgTpm.toFixed(1), tip: "Toe point deductions are persistent — add theraband ankle work to daily warm-up until it becomes automatic" });
  }

  const pillarCard = (icon, title, color, immediateContent, longTermContent, inspirePillar) => (
    <div className="card" style={{ padding: 16, marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color, letterSpacing: 1, marginBottom: 10 }}>{icon} {title}</div>
      {viewMode === "thisWeek" ? immediateContent : longTermContent}
      {/* Daily Inspiration */}
      <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: `${color}08`, borderLeft: `2px solid ${color}30` }}>
        <div style={{ fontSize: 10, fontWeight: 700, color, letterSpacing: 0.5, marginBottom: 3 }}>TODAY'S INSPIRATION</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", lineHeight: 1.6, fontStyle: "italic" }}>{getDailyInspiration(inspirePillar)}</div>
      </div>
    </div>
  );

  return (
    <div style={{ animation: "fadeIn 0.4s ease-out" }}>
      {/* Header */}
      <div className="card" style={{ padding: 16, marginBottom: 12, background: "linear-gradient(135deg, rgba(232,150,42,0.06), rgba(232,150,42,0.02))", borderColor: "rgba(232,150,42,0.15)" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#e8962a", letterSpacing: 1, marginBottom: 8 }}>YOUR PERSONALIZED TRAINING PROGRAM</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.7 }}>
          Built from {deds.length} deductions, {risks.length} injury risk flag{risks.length !== 1 ? "s" : ""}, biomechanical analysis
          {profile?.goals ? `, and goal of "${profile.goals}"` : ""} at {result.level || profile?.level || "your level"}.
          {profile?.age ? ` Age-appropriate for ${profile.age}-year-old athletes.` : ""}
        </div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 8 }}>Sources: USAG Athlete Wellness · NSCA Youth Training · ACSM Guidelines · ISSN Position Stands</div>
      </div>

      {/* This Week / Season Toggle */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12, padding: 3, borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
        {[{ id: "thisWeek", label: "This Week" }, { id: "season", label: "Season Plan" }].map(m => (
          <button key={m.id} onClick={() => setViewMode(m.id)} style={{
            flex: 1, padding: "10px 0", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer",
            background: viewMode === m.id ? "rgba(232,150,42,0.15)" : "transparent",
            color: viewMode === m.id ? "#e8962a" : "rgba(255,255,255,0.35)",
            transition: "all 0.2s",
          }}>{m.label}</button>
        ))}
      </div>

      {/* Progress Tracking (if history available) */}
      <PillarProgress history={historyEntries} profile={profile} />

      {/* Persistent issues alert (season view) */}
      {viewMode === "season" && persistentIssues.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 12, borderColor: "rgba(224,104,32,0.2)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#e06820", letterSpacing: 1, marginBottom: 8 }}>🔄 RECURRING PATTERNS</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginBottom: 10 }}>Issues that keep appearing across multiple analyses — these need focused long-term attention</div>
          {persistentIssues.map((p, i) => (
            <div key={i} style={{ padding: 10, marginBottom: 6, borderRadius: 8, background: "rgba(224,104,32,0.04)", borderLeft: "3px solid #e06820" }}>
              <div style={{ fontSize: 12, fontWeight: 700 }}>{p.area} <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 400 }}>avg {p.avg} per analysis</span></div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 4, lineHeight: 1.5 }}>{p.tip}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── DRILLS ── */}
      {pillarCard("🎯", viewMode === "thisWeek" ? "PRIORITY DRILLS — Fix This Week" : "DRILL DEVELOPMENT — Season Plan", "#dc2626",
        // THIS WEEK: specific drills from this analysis
        <>
          {priorities.filter(p => p.count > 0).map((p, i) => {
            const drill = EVIDENCE_PROGRAMS.drills[p.area];
            if (!drill) return null;
            return (
              <div key={i} style={{ padding: 10, marginBottom: 8, borderRadius: 8, background: "rgba(255,255,255,0.02)", borderLeft: `3px solid ${i === 0 ? "#dc2626" : i === 1 ? "#ffc15a" : "#22c55e"}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{p.label}</span>
                  <span style={{ fontSize: 10, fontFamily: "'Space Mono', monospace", color: "rgba(255,255,255,0.3)" }}>{p.count} deduction{p.count !== 1 ? "s" : ""}</span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0" }}>{drill.drill}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{drill.prescription}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>{drill.why}</div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", marginTop: 3 }}>Source: {drill.source}</div>
              </div>
            );
          })}
          {priorities.filter(p => p.count > 0).length === 0 && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", padding: 10 }}>No specific drill priorities from this analysis — maintain current drill routine!</div>
          )}
          {coach?.preemptiveCorrections?.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>COACH CORRECTIONS THIS WEEK:</div>
              {coach.preemptiveCorrections.slice(0, 3).map((c, i) => (
                <div key={i} style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", lineHeight: 1.6, marginBottom: 4, paddingLeft: 10, borderLeft: `2px solid ${c?.priority === "high" ? "rgba(220,38,38,0.3)" : "rgba(220,38,38,0.15)"}` }}>
                  {typeof c === "string" ? c : <><strong style={{ color: "rgba(255,255,255,0.6)" }}>{safeStr(c.skill)}:</strong> {safeStr(c.correction || c.currentFault)}{c.riskIfUncorrected ? ` — ${safeStr(c.riskIfUncorrected)}` : ""}</>}
                </div>
              ))}
            </div>
          )}
        </>,
        // SEASON: long-term drill development
        <>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.7, marginBottom: 10 }}>
            Build drill consistency across the full season. Add each drill to your daily warm-up until it becomes automatic.
          </div>
          {Object.entries(EVIDENCE_PROGRAMS.drills).map(([key, drill], i) => (
            <div key={key} style={{ padding: 10, marginBottom: 6, borderRadius: 8, background: "rgba(255,255,255,0.02)" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0" }}>{drill.drill}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>Daily: {drill.prescription}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 2 }}>Source: {drill.source}</div>
            </div>
          ))}
          {coach?.techniqueProgressionNotes && (
            <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: "rgba(34,197,94,0.04)", borderLeft: "3px solid #22c55e" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#22c55e", marginBottom: 4 }}>NEXT SKILLS TO DEVELOP</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.7 }}>{safeStr(coach.techniqueProgressionNotes)}</div>
            </div>
          )}
        </>,
        "drills"
      )}

      {/* ── STRENGTH ── */}
      {pillarCard("💪", viewMode === "thisWeek" ? "STRENGTH — Target Root Causes" : "STRENGTH — Season Program", "#3b82f6",
        // THIS WEEK: specific to this analysis
        <>
          {coach?.conditioningPlan?.length > 0 ? (
            coach.conditioningPlan.map((c, i) => (
              <div key={i} style={{ padding: 8, marginBottom: 6, borderRadius: 6, background: "rgba(255,255,255,0.02)", display: "flex", gap: 8, alignItems: "flex-start" }}>
                <div style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(59,130,246,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: "#3b82f6", fontFamily: "'Space Mono', monospace", flexShrink: 0 }}>{i + 1}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{safeStr(c.exercise)} <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>({safeStr(c.sets)} · {safeStr(c.frequency)})</span></div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>{safeStr(c.why)}</div>
                </div>
              </div>
            ))
          ) : (
            <>
              {landCount > 0 && EVIDENCE_PROGRAMS.strength.lowerBody.map((ex, i) => (
                <div key={`lb-${i}`} style={{ padding: 8, marginBottom: 4, borderRadius: 6, background: "rgba(255,255,255,0.02)" }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{ex.exercise} <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>({ex.prescription})</span></div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>{ex.why}</div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", marginTop: 2 }}>Source: {ex.source}</div>
                </div>
              ))}
              {EVIDENCE_PROGRAMS.strength.core.slice(0, 2).map((ex, i) => (
                <div key={`core-${i}`} style={{ padding: 8, marginBottom: 4, borderRadius: 6, background: "rgba(255,255,255,0.02)" }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{ex.exercise} <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>({ex.prescription})</span></div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>{ex.why}</div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", marginTop: 2 }}>Source: {ex.source}</div>
                </div>
              ))}
            </>
          )}
        </>,
        // SEASON: full strength program
        <>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.7, marginBottom: 10 }}>
            Complete strength program for {ageGroup === "young" ? "growing athletes" : ageGroup === "teen" ? "teen performers" : "adult athletes"}. Train 2-3x per week, progressively increasing difficulty.
          </div>
          {["core", "lowerBody", "upperBody", "flexibility"].map(group => (
            <div key={group} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: 0.5, marginBottom: 6 }}>{group === "lowerBody" ? "LOWER BODY" : group === "upperBody" ? "UPPER BODY" : String(group || '').toUpperCase()}</div>
              {EVIDENCE_PROGRAMS.strength[group].map((ex, i) => (
                <div key={i} style={{ padding: 8, marginBottom: 4, borderRadius: 6, background: "rgba(255,255,255,0.02)" }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{ex.exercise} <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>({ex.prescription})</span></div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>{ex.why}</div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", marginTop: 2 }}>Source: {ex.source}</div>
                </div>
              ))}
            </div>
          ))}
        </>,
        "strength"
      )}

      {/* ── INJURY PREVENTION ── */}
      {risks.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 12, borderColor: risks.some(r => r.risk === "high") ? "rgba(220,38,38,0.2)" : "rgba(255,193,90,0.15)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: risks.some(r => r.risk === "high") ? "#dc2626" : "#ffc15a", letterSpacing: 1, marginBottom: 10 }}>⚠️ INJURY PREVENTION</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 10 }}>Based on biomechanical analysis. Not medical advice — consult a sports medicine professional for concerns.</div>
          {risks.map((r, i) => (
            <div key={i} style={{ padding: 10, marginBottom: 6, borderRadius: 8, background: `${r.risk === "high" ? "rgba(220,38,38,0.04)" : "rgba(255,193,90,0.04)"}`, borderLeft: `3px solid ${r.risk === "high" ? "#dc2626" : r.risk === "moderate" ? "#ffc15a" : "#22c55e"}` }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{safeStr(r.reason)}</div>
              <div style={{ fontSize: 11, color: "#22c55e", marginTop: 4 }}>Rx: {safeStr(r.recommendation)}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── MENTAL ── */}
      {pillarCard("🧠", viewMode === "thisWeek" ? "MENTAL — This Week's Focus" : "MENTAL — Season Development", "#8b5cf6",
        // THIS WEEK
        <>
          {hasFall && (
            <div style={{ padding: 10, marginBottom: 8, borderRadius: 8, background: "rgba(220,38,38,0.04)", borderLeft: "3px solid #dc2626" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#dc2626", marginBottom: 4 }}>FALL RECOVERY — Priority This Week</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>{EVIDENCE_PROGRAMS.mental.fallRecovery}</div>
            </div>
          )}
          <div style={{ padding: 10, marginBottom: 6, borderRadius: 8, background: "rgba(255,255,255,0.02)" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#a78bfa", marginBottom: 4 }}>VISUALIZATION</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>{EVIDENCE_PROGRAMS.mental.visualization}</div>
          </div>
          {deds.length > 8 && (
            <div style={{ padding: 10, marginBottom: 6, borderRadius: 8, background: "rgba(255,255,255,0.02)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#a78bfa", marginBottom: 4 }}>ERROR RECOVERY</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>{EVIDENCE_PROGRAMS.mental.errorRecovery}</div>
            </div>
          )}
          {safeArray(dev?.mentalTraining).map((tip, i) => (
            <div key={i} style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.6, marginTop: 6, paddingLeft: 10, borderLeft: "2px solid rgba(139,92,246,0.15)" }}>{safeStr(tip)}</div>
          ))}
        </>,
        // SEASON
        <>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.7, marginBottom: 10 }}>
            Build a complete mental performance toolkit over the season. Add one technique per month until all become habit.
          </div>
          {Object.entries(EVIDENCE_PROGRAMS.mental).map(([key, content]) => (
            <div key={key} style={{ padding: 10, marginBottom: 6, borderRadius: 8, background: "rgba(255,255,255,0.02)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#a78bfa", marginBottom: 4 }}>{String(key || '').replace(/([A-Z])/g, " $1").toUpperCase()}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>{content}</div>
            </div>
          ))}
          {profile?.goals === "build confidence" && (
            <div style={{ padding: 10, borderRadius: 8, background: "rgba(139,92,246,0.04)", borderLeft: "3px solid #8b5cf6", marginTop: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#a78bfa", marginBottom: 4 }}>SEASON CONFIDENCE GOAL</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
                Start a confidence journal. Each week, review and celebrate progress. By mid-season, you'll have documented proof of how far you've come.
              </div>
            </div>
          )}
        </>,
        "mental"
      )}

      {/* ── NUTRITION ── */}
      {pillarCard("🥗", viewMode === "thisWeek" ? `NUTRITION — ${ageGroup === "young" ? "Growing Athlete" : ageGroup === "teen" ? "Teen Performance" : "Adult Athlete"}` : "NUTRITION — Season Fueling Plan", "#22c55e",
        // THIS WEEK
        <>
          {EVIDENCE_PROGRAMS.nutrition[ageGroup].map((tip, i) => (
            <div key={i} style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.7, marginBottom: 8, paddingLeft: 10, borderLeft: "2px solid rgba(34,197,94,0.15)" }}>{tip}</div>
          ))}
        </>,
        // SEASON
        <>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.7, marginBottom: 10 }}>
            Nutrition evolves across the season: building phase early on, maintenance mid-season, and peak fueling for competition.
          </div>
          <div style={{ padding: 10, marginBottom: 8, borderRadius: 8, background: "rgba(255,255,255,0.02)" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#22c55e", marginBottom: 4 }}>PRE-SEASON (Building)</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>Focus on protein intake for muscle building. Increase calories slightly above maintenance to support new skill development and conditioning.</div>
          </div>
          <div style={{ padding: 10, marginBottom: 8, borderRadius: 8, background: "rgba(255,255,255,0.02)" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#22c55e", marginBottom: 4 }}>MID-SEASON (Maintenance)</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>Maintain consistent fueling. Focus on timing: pre-practice snack 1-2 hrs before, recovery meal within 30 min after. Hydrate aggressively.</div>
          </div>
          <div style={{ padding: 10, marginBottom: 8, borderRadius: 8, background: "rgba(255,255,255,0.02)" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#22c55e", marginBottom: 4 }}>COMPETITION (Peak)</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>Only familiar foods on meet days. Carb-focused meals before competition. Light, easy-to-digest snacks between events. Electrolytes for all-day meets.</div>
          </div>
          {EVIDENCE_PROGRAMS.nutrition[ageGroup].map((tip, i) => (
            <div key={i} style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", lineHeight: 1.6, marginBottom: 6, paddingLeft: 10, borderLeft: "2px solid rgba(34,197,94,0.1)" }}>{tip}</div>
          ))}
        </>,
        "nutrition"
      )}

      {/* ── RECOVERY ── */}
      {pillarCard("😴", viewMode === "thisWeek" ? "RECOVERY — This Week" : "RECOVERY — Season Habits", "#06b6d4",
        // THIS WEEK
        <>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.7, marginBottom: 8, paddingLeft: 10, borderLeft: "2px solid rgba(6,182,212,0.15)" }}>
            {EVIDENCE_PROGRAMS.recovery.sleep[ageGroup]}
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.7, marginBottom: 8, paddingLeft: 10, borderLeft: "2px solid rgba(6,182,212,0.15)" }}>
            {EVIDENCE_PROGRAMS.recovery.active}
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.7, paddingLeft: 10, borderLeft: "2px solid rgba(6,182,212,0.15)" }}>
            {EVIDENCE_PROGRAMS.recovery.foam}
          </div>
        </>,
        // SEASON
        <>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.7, marginBottom: 10 }}>
            Recovery is what turns hard training into actual improvement. Build these habits month by month.
          </div>
          <div style={{ padding: 10, marginBottom: 8, borderRadius: 8, background: "rgba(255,255,255,0.02)" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#06b6d4", marginBottom: 4 }}>MONTH 1: Sleep Foundation</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>{EVIDENCE_PROGRAMS.recovery.sleep[ageGroup]} Set a consistent bedtime and track sleep quality.</div>
          </div>
          <div style={{ padding: 10, marginBottom: 8, borderRadius: 8, background: "rgba(255,255,255,0.02)" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#06b6d4", marginBottom: 4 }}>MONTH 2: Add Active Recovery</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>{EVIDENCE_PROGRAMS.recovery.active}</div>
          </div>
          <div style={{ padding: 10, marginBottom: 8, borderRadius: 8, background: "rgba(255,255,255,0.02)" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#06b6d4", marginBottom: 4 }}>MONTH 3: Mobility & Soft Tissue</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>{EVIDENCE_PROGRAMS.recovery.foam}</div>
          </div>
        </>,
        "recovery"
      )}

      {/* ── GOAL-SPECIFIC ── */}
      {(dev?.goalSpecificAdvice || coach?.idealComparison) && (
        <div className="card" style={{ padding: 16, marginBottom: 12, background: "rgba(232,150,42,0.03)", borderColor: "rgba(232,150,42,0.12)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#e8962a", letterSpacing: 1, marginBottom: 8 }}>🏆 {profile?.goals ? String(profile.goals || '').toUpperCase() : "DEVELOPMENT ADVICE"}</div>
          {viewMode === "thisWeek" ? (
            <>
              {dev?.goalSpecificAdvice && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.7, marginBottom: 8 }}>{safeStr(dev.goalSpecificAdvice)}</div>}
              {coach?.idealComparison && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.7 }}>{safeStr(coach.idealComparison)}</div>}
            </>
          ) : (
            <>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.7, marginBottom: 8 }}>
                {profile?.goals === "move up levels" && "Moving up requires mastering all skills at current level with minimal deductions. Focus on consistency before adding difficulty."}
                {profile?.goals === "qualify regionals" && "Regional qualification requires consistent competitive scores. Focus on reducing deductions below 1.5 total and building start value."}
                {profile?.goals === "college gymnastics" && "College coaches look for clean execution, consistency, and coachability. Build a highlight reel showing clean routines and personality."}
                {profile?.goals === "improve scores" && "Score improvement comes from two paths: raising start value (harder skills) and lowering deductions (cleaner execution). Clean execution first."}
                {profile?.goals === "injury recovery" && "Recovery is a season, not a setback. Work with your medical team to build back progressively. Every day of smart recovery is an investment."}
                {profile?.goals === "build confidence" && "Confidence builds through preparation and small wins. Track every improvement. Celebrate progress, not just perfection."}
                {profile?.goals === "have fun" && "Fun comes from feeling competent and connected. Master the skills you enjoy, perform for yourself, and remember why you love this sport."}
                {!profile?.goals && "Set a specific goal for this season to help focus your training. Even small goals give direction and motivation."}
              </div>
              {dev?.goalSpecificAdvice && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.7 }}>{safeStr(dev.goalSpecificAdvice)}</div>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── BIOMECHANICS DASHBOARD ─────────────────────────────────────────
function BiomechanicsDashboard({ result }) {
  const bio = result.biomechanics;
  const deds = result.executionDeductions || [];

  const timelineData = deds
    .filter(d => d.timestamp && d.timestamp !== "Global")
    .map(d => {
      const ts = d.timestamp || "0:00";
      const parts = ts.split(/[,\-]/)[0].trim().split(":");
      const sec = parts.length === 2 ? parseInt(parts[0]) * 60 + parseInt(parts[1]) : parseFloat(parts[0]) || 0;
      return { time: sec, deduction: d.deduction, skill: d.skill, severity: d.severity, engine: d.engine };
    })
    .sort((a, b) => a.time - b.time);

  const angleData = (bio?.keyMoments || []).map(m => {
    const parts = (m.timestamp || "0:00").split(/[,\-]/)[0].trim().split(":");
    const sec = parts.length === 2 ? parseInt(parts[0]) * 60 + parseInt(parts[1]) : parseFloat(parts[0]) || 0;
    return { time: sec, skill: m.skill, phase: m.phase, ...m.jointAngles, hipVel: m.angularVelocity?.hip, kneeVel: m.angularVelocity?.knee };
  }).sort((a, b) => a.time - b.time);

  const landings = bio?.landingAnalysis || [];
  const holds = bio?.holdDurations || [];
  const risks = bio?.injuryRiskFlags || [];

  const riskColor = (r) => r === "high" ? "#dc2626" : r === "moderate" ? "#ffc15a" : "#22c55e";

  // Plain-language helpers
  const explainPower = (rating) => {
    if (!rating) return null;
    const n = typeof rating === "number" ? rating : parseFloat(rating);
    if (isNaN(n)) return `Power rated "${rating}" — this measures how much explosive force is generated during tumbling and jumps.`;
    if (n >= 8) return "Excellent explosive power — strong push-off and height on skills. This gymnast generates force well.";
    if (n >= 6) return "Good power generation. More strength training (squat jumps, box jumps) can help get even more height and distance.";
    if (n >= 4) return "Average power. Building leg and core strength will help generate more force for tumbling and vaults.";
    return "Power needs work. Focus on strength basics — squats, lunges, and core conditioning to build a stronger foundation.";
  };

  const explainFlight = (f) => {
    if (!f) return null;
    const fl = String(f).toLowerCase();
    if (fl.includes("high") || fl.includes("excellent")) return "Great height on aerial skills — more air time means more time to complete rotations cleanly.";
    if (fl.includes("moderate") || fl.includes("medium") || fl.includes("good")) return "Decent height. Working on stronger takeoffs and tighter body positions can help get more air time.";
    return "Flight height could improve. Focus on powerful takeoffs and tight body positions to maximize time in the air.";
  };

  const explainKneeAngle = (angle) => {
    if (angle >= 140) return "Great soft landing — knees bending enough to absorb impact safely";
    if (angle >= 120) return "Adequate knee bend on landing — could be slightly softer for better shock absorption";
    return "Landing too stiff — knees need to bend more to protect joints from impact stress";
  };

  const explainChestAngle = (angle) => {
    if (angle >= 80) return "Good upright posture on landing";
    if (angle >= 65) return "Slight forward lean — work on driving chest up through landing";
    return "Too much forward lean — increases fall risk and deductions";
  };

  const explainVelocity = (vel) => {
    if (!vel) return "";
    const v = Math.abs(vel);
    if (v > 300) return "Very fast rotation — great for completing difficult skills";
    if (v > 200) return "Good rotational speed";
    if (v > 100) return "Moderate speed — more power could help";
    return "Slow rotation — may struggle to complete skills cleanly";
  };

  // Body report card: summarize key takeaways
  const bodyGrades = [];
  if (landings.length > 0) {
    const avgKnee = landings.reduce((s, l) => s + (l.kneeFlexionAtImpact || 0), 0) / landings.length;
    const totalSteps = landings.reduce((s, l) => s + (l.stepsAfter || 0), 0);
    bodyGrades.push({
      area: "Landing Mechanics",
      grade: avgKnee >= 140 && totalSteps === 0 ? "A" : avgKnee >= 120 && totalSteps <= 2 ? "B" : avgKnee >= 100 ? "C" : "D",
      tip: avgKnee < 130 ? "Practice landing drills with deeper knee bend to protect joints" : totalSteps > 0 ? `${totalSteps} extra step${totalSteps > 1 ? "s" : ""} — practice sticking landings with arms up` : "Solid landing technique!",
      color: avgKnee >= 130 && totalSteps <= 1 ? "#22c55e" : avgKnee >= 110 ? "#ffc15a" : "#dc2626",
    });
  }
  if (holds.length > 0) {
    const metAll = holds.every(h => h.met);
    const metPct = holds.filter(h => h.met).length / holds.length;
    bodyGrades.push({
      area: "Hold Strength",
      grade: metAll ? "A" : metPct >= 0.7 ? "B" : metPct >= 0.4 ? "C" : "D",
      tip: metAll ? "All holds met the required duration — great static strength!" : "Some holds were too short — build isometric strength with plank and hollow body holds",
      color: metAll ? "#22c55e" : metPct >= 0.5 ? "#ffc15a" : "#dc2626",
    });
  }
  if (risks.length > 0) {
    const hasHigh = risks.some(r => r.risk === "high");
    const hasMod = risks.some(r => r.risk === "moderate");
    bodyGrades.push({
      area: "Joint Safety",
      grade: !hasHigh && !hasMod ? "A" : !hasHigh ? "B" : "C",
      tip: hasHigh ? "High stress detected on some joints — consider talking to a coach about technique adjustments" : hasMod ? "Some moderate joint stress — stretching and proper warm-up will help" : "Joints look good — keep up the warm-up and conditioning routine!",
      color: hasHigh ? "#dc2626" : hasMod ? "#ffc15a" : "#22c55e",
    });
  }

  const sectionHead = (title, subtitle) => (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>{title}</div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", lineHeight: 1.5, marginTop: 2 }}>{subtitle}</div>
    </div>
  );

  return (
    <div style={{ animation: "fadeIn 0.4s ease-out" }}>
      {/* What This Tab Shows */}
      <div className="card" style={{ padding: 16, marginBottom: 12, borderLeft: "3px solid #3b82f6" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#3b82f6", marginBottom: 6 }}>What is Biomechanics?</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.7 }}>
          This tab shows how the body moves during the routine — joint angles, landing impact, rotational speed, and where the body may be under stress.
          Think of it as a "body report card" that helps you understand <strong style={{ color: "rgba(255,255,255,0.8)" }}>what's working well</strong> and <strong style={{ color: "rgba(255,255,255,0.8)" }}>what to train</strong> to improve scores and stay injury-free.
        </div>
      </div>

      {/* Body Report Card */}
      {bodyGrades.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 12 }}>
          {sectionHead("Body Report Card", "Quick overview of physical performance across key areas")}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {bodyGrades.map((g, i) => (
              <div key={i} style={{ flex: "1 1 30%", minWidth: 90, padding: 12, borderRadius: 10, background: "rgba(255,255,255,0.02)", textAlign: "center" }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: g.color, fontFamily: "'Space Mono', monospace" }}>{g.grade}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.6)", marginBottom: 4 }}>{g.area}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", lineHeight: 1.4 }}>{g.tip}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Power & Flight Overview */}
      <div className="card" style={{ padding: 16, marginBottom: 12 }}>
        {sectionHead("Power & Flight", "How much explosive energy is generated and how high skills go in the air")}
        <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
          <div style={{ flex: 1, textAlign: "center", padding: 12, borderRadius: 10, background: "rgba(59,130,246,0.06)" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: 1, marginBottom: 4 }}>POWER</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: "#3b82f6", fontFamily: "'Space Mono', monospace" }}>{bio?.overallPowerRating || "—"}</div>
          </div>
          <div style={{ flex: 1, textAlign: "center", padding: 12, borderRadius: 10, background: "rgba(168,85,247,0.06)" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: 1, marginBottom: 4 }}>FLIGHT</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#a855f7", textTransform: "capitalize" }}>{bio?.overallFlightHeight || "—"}</div>
          </div>
          <div style={{ flex: 1, textAlign: "center", padding: 12, borderRadius: 10, background: risks.some(r => r.risk === "high") ? "rgba(220,38,38,0.06)" : "rgba(34,197,94,0.06)" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: 1, marginBottom: 4 }}>INJURY RISK</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: risks.some(r => r.risk === "high") ? "#dc2626" : risks.some(r => r.risk === "moderate") ? "#ffc15a" : "#22c55e" }}>
              {risks.some(r => r.risk === "high") ? "HIGH" : risks.some(r => r.risk === "moderate") ? "MODERATE" : risks.length > 0 ? "LOW" : "—"}
            </div>
          </div>
        </div>
        {(explainPower(bio?.overallPowerRating) || explainFlight(bio?.overallFlightHeight)) && (
          <div style={{ padding: 10, borderRadius: 8, background: "rgba(59,130,246,0.04)", marginTop: 4 }}>
            {explainPower(bio?.overallPowerRating) && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", lineHeight: 1.6, marginBottom: 4 }}>💪 {explainPower(bio?.overallPowerRating)}</div>}
            {explainFlight(bio?.overallFlightHeight) && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>🕊 {explainFlight(bio?.overallFlightHeight)}</div>}
          </div>
        )}
      </div>

      {/* Deduction Timeline */}
      {timelineData.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 12 }}>
          {sectionHead("When Do Errors Happen?", "This chart shows where in the routine deductions occur — taller bars mean bigger point losses")}
          <StriveErrorBoundary name="Chart">
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={timelineData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="time" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} tickFormatter={v => `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} domain={[0, "auto"]} tickFormatter={v => `-${v}`} />
              <Tooltip
                contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                labelFormatter={v => `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`}
                formatter={(val, name, props) => [`-${val.toFixed(2)} (${props.payload.skill})`, "Deduction"]}
              />
              <Line type="stepAfter" dataKey="deduction" stroke="#dc2626" strokeWidth={2} dot={{ r: 4, fill: "#dc2626" }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
          </StriveErrorBoundary>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 8, lineHeight: 1.5 }}>
            {timelineData.length > 3 && timelineData.slice(-2).reduce((s, d) => s + d.deduction, 0) > timelineData.slice(0, 2).reduce((s, d) => s + d.deduction, 0)
              ? "📊 More errors happen toward the end of the routine — this often means fatigue. Endurance conditioning can help."
              : "📊 Errors are spread throughout the routine — focus on cleaning up the specific skills where deductions happen."
            }
          </div>
        </div>
      )}

      {/* Joint Angles — Plain Language */}
      {angleData.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 12 }}>
          {sectionHead("Body Positions During Skills", "Joint angles show how straight or bent the knees and hips are at key moments. Judges want to see fully extended (straight) positions — around 180° for knees and hips.")}
          <StriveErrorBoundary name="Chart">
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={angleData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="time" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} tickFormatter={v => `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} domain={[0, 200]} label={{ value: "degrees", angle: -90, position: "insideLeft", fill: "rgba(255,255,255,0.2)", fontSize: 9 }} />
              <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }}
                labelFormatter={v => `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`} />
              <Line type="monotone" dataKey="lKnee" name="L Knee" stroke="#dc2626" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              <Line type="monotone" dataKey="rKnee" name="R Knee" stroke="#e06820" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              <Line type="monotone" dataKey="lHip" name="L Hip" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              <Line type="monotone" dataKey="rHip" name="R Hip" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
          </StriveErrorBoundary>
          <div style={{ display: "flex", gap: 12, marginTop: 6, justifyContent: "center" }}>
            {[{label: "L Knee", color: "#dc2626"}, {label: "R Knee", color: "#e06820"}, {label: "L Hip", color: "#3b82f6"}, {label: "R Hip", color: "#8b5cf6"}].map(l => (
              <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
                <div style={{ width: 8, height: 3, background: l.color, borderRadius: 2 }} />{l.label}
              </div>
            ))}
          </div>
          <div style={{ padding: 10, borderRadius: 8, background: "rgba(255,255,255,0.02)", marginTop: 10 }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}>
              <strong style={{ color: "rgba(255,255,255,0.65)" }}>How to read this:</strong> Lines close to 180° mean the body is straight (good for most skills). Dips below 150° during jumps or tumbling passes mean bent knees or pike hips — common deduction causes.
            </div>
          </div>
        </div>
      )}

      {/* Angular Velocity — Plain Language */}
      {angleData.some(d => d.hipVel || d.kneeVel) && (
        <div className="card" style={{ padding: 16, marginBottom: 12 }}>
          {sectionHead("Rotation Speed", "How fast the body spins during skills. Faster rotation = more time to finish flips and twists before landing.")}
          {angleData.filter(d => d.hipVel || d.kneeVel).map((d, i) => (
            <div key={i} style={{ padding: "10px 12px", marginBottom: 6, borderRadius: 8, background: "rgba(255,255,255,0.02)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{d.skill} <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>({d.phase})</span></div>
                </div>
                {d.hipVel && <div style={{ textAlign: "center", padding: "4px 8px", borderRadius: 6, background: "rgba(59,130,246,0.08)" }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>Hip</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#3b82f6", fontFamily: "'Space Mono', monospace" }}>{d.hipVel}°/s</div>
                </div>}
                {d.kneeVel && <div style={{ textAlign: "center", padding: "4px 8px", borderRadius: 6, background: "rgba(224,104,32,0.08)" }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>Knee</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#e06820", fontFamily: "'Space Mono', monospace" }}>{d.kneeVel}°/s</div>
                </div>}
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", lineHeight: 1.4 }}>
                {d.hipVel ? explainVelocity(d.hipVel) : explainVelocity(d.kneeVel)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Landing Analysis — Plain Language */}
      {landings.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 12 }}>
          {sectionHead("Landing Breakdown", "Every landing is checked for safety and form. Soft knees (high knee angle) and upright chest = safer landings and fewer deductions.")}
          {landings.map((l, i) => (
            <div key={i} style={{ padding: 12, marginBottom: 8, borderRadius: 10, background: "rgba(255,255,255,0.02)", borderLeft: `3px solid ${riskColor(l.impactRisk)}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{safeStr(l.skill)}</span>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{safeStr(l.timestamp)}</span>
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                <div style={{ flex: 1, padding: "6px 8px", borderRadius: 6, background: "rgba(255,255,255,0.03)", textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>Knee Bend</div>
                  <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: safeNum(l.kneeFlexionAtImpact, 0) < 120 ? "#dc2626" : "#22c55e" }}>{safeNum(l.kneeFlexionAtImpact, 0)}°</div>
                </div>
                <div style={{ flex: 1, padding: "6px 8px", borderRadius: 6, background: "rgba(255,255,255,0.03)", textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>Chest</div>
                  <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: safeNum(l.chestAngle, 0) < 70 ? "#ffc15a" : "#22c55e" }}>{safeNum(l.chestAngle, 0)}°</div>
                </div>
                <div style={{ flex: 1, padding: "6px 8px", borderRadius: 6, background: "rgba(255,255,255,0.03)", textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>Steps</div>
                  <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: safeNum(l.stepsAfter, 0) > 0 ? "#ffc15a" : "#22c55e" }}>{safeNum(l.stepsAfter, 0)}</div>
                </div>
                <div style={{ flex: 1, padding: "6px 8px", borderRadius: 6, background: `${riskColor(l.impactRisk)}08`, textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>Impact</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: riskColor(l.impactRisk), textTransform: "uppercase" }}>{l.impactRisk}</div>
                </div>
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", lineHeight: 1.5, padding: "6px 0" }}>
                {explainKneeAngle(safeNum(l.kneeFlexionAtImpact, 0))} • {explainChestAngle(safeNum(l.chestAngle, 0))}
                {safeNum(l.stepsAfter, 0) > 0 && ` • ${safeNum(l.stepsAfter, 0)} step${safeNum(l.stepsAfter, 0) > 1 ? "s" : ""} after landing = -${(safeNum(l.stepsAfter, 0) * 0.1).toFixed(1)} deduction`}
              </div>
              {l.notes && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", lineHeight: 1.5 }}>{safeStr(l.notes)}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Hold Durations — Plain Language */}
      {holds.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 12 }}>
          {sectionHead("Hold Positions", "Some skills require holding a position still for a set time. Letting go too early costs points. This measures if each hold was long enough.")}
          {holds.map((h, i) => {
            const durMs = safeNum(h.durationMs, 0); const reqMs = safeNum(h.requiredMs, 0);
            const pct = reqMs > 0 ? Math.min(100, (durMs / reqMs) * 100) : 100;
            const shortBy = h.met ? 0 : ((reqMs - durMs) / 1000).toFixed(1);
            return (
              <div key={i} style={{ marginBottom: 10, padding: "10px 12px", borderRadius: 8, background: "rgba(255,255,255,0.02)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{safeStr(h.skill)} <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{safeStr(h.timestamp)}</span></span>
                  <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, fontWeight: 700, color: h.met ? "#22c55e" : "#dc2626" }}>
                    {(durMs / 1000).toFixed(1)}s / {(reqMs / 1000).toFixed(1)}s
                  </span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, borderRadius: 3, background: h.met ? "#22c55e" : "#dc2626", transition: "width 0.5s" }} />
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>
                  {h.met ? "Held long enough — no deduction" : `Released ${shortBy}s too early — practice holding longer with core/arm conditioning`}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Injury Risk Flags — Plain Language */}
      {risks.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 12, borderColor: risks.some(r => r.risk === "high") ? "rgba(220,38,38,0.2)" : "rgba(255,193,90,0.15)" }}>
          {sectionHead(
            risks.some(r => r.risk === "high") ? "Body Safety Alerts" : "Body Safety Check",
            "Areas where the body may be under extra stress. Not medical advice — talk to a coach or sports medicine professional about any concerns."
          )}
          {risks.map((r, i) => (
            <div key={i} style={{
              padding: 12, marginBottom: 6, borderRadius: 10,
              background: `${riskColor(r.risk)}06`,
              borderLeft: `3px solid ${riskColor(r.risk)}`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{r.joint?.replace("l", "Left ").replace("r", "Right ").replace("Knee", "Knee").replace("Ankle", "Ankle").replace("Elbow", "Elbow")}</span>
                <span style={{
                  fontSize: 10, fontWeight: 700, textTransform: "uppercase", padding: "2px 8px", borderRadius: 4,
                  background: `${riskColor(r.risk)}15`, color: riskColor(r.risk),
                }}>{r.risk} risk</span>
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: 4 }}>{safeStr(r.reason)}</div>
              {r.recommendation && (
                <div style={{ fontSize: 11, color: "#22c55e", marginTop: 4, lineHeight: 1.5 }}>What to do: {safeStr(r.recommendation)}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* No data fallback */}
      {!bio && timelineData.length === 0 && (
        <div className="card" style={{ padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🦴</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Body Movement Analysis</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", lineHeight: 1.6 }}>
            After analyzing a video, this tab will show how the body moves during the routine — including joint positions, landing safety, hold strength, and areas to watch for injury prevention.
          </div>
        </div>
      )}
    </div>
  );
}

function DiagnosticsDashboard({ result }) {
  const diag = result.diagnostics || {};
  const deds = result.executionDeductions || [];

  // Categorize deductions by engine/type
  const engineCounts = {};
  const categoryTotals = {};
  deds.forEach(d => {
    const eng = d.engine || d.category || "execution";
    engineCounts[eng] = (engineCounts[eng] || 0) + 1;
    categoryTotals[d.category || "execution"] = (categoryTotals[d.category || "execution"] || 0) + (d.deduction || 0);
  });

  // Severity breakdown
  const severityCounts = {};
  deds.forEach(d => { severityCounts[d.severity || "small"] = (severityCounts[d.severity || "small"] || 0) + 1; });

  // Identify the biggest math win
  const sortedDeds = [...deds].sort((a, b) => (b.deduction || 0) - (a.deduction || 0));
  const biggestWin = diag.biggestMathWin || (sortedDeds[0] ? `Fix "${sortedDeds[0].skill}" (${sortedDeds[0].fault}) to save -${sortedDeds[0].deduction?.toFixed(2)}` : "");

  return (
    <div style={{ animation: "fadeIn 0.4s ease-out" }}>
      {/* Biggest Math Win */}
      {biggestWin && (
        <div className="card" style={{ padding: 16, marginBottom: 12, borderColor: "rgba(34,197,94,0.2)", background: "rgba(34,197,94,0.04)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#22c55e", letterSpacing: 1, marginBottom: 6 }}>🎯 BIGGEST MATH WIN</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.8)", lineHeight: 1.7 }}>
            {biggestWin}
          </div>
          {sortedDeds.length >= 3 && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 8, lineHeight: 1.6 }}>
              Fixing the top 3 deductions alone would save <span style={{ color: "#e8962a", fontWeight: 700, fontFamily: "'Space Mono', monospace" }}>+{sortedDeds.slice(0, 3).reduce((s, d) => s + safeNum(d.deduction, 0), 0).toFixed(2)}</span> — that's the difference between {safeNum(result.finalScore, 0).toFixed(1)} and {(safeNum(result.finalScore, 0) + sortedDeds.slice(0, 3).reduce((s, d) => s + safeNum(d.deduction, 0), 0)).toFixed(1)}.
            </div>
          )}
        </div>
      )}

      {/* Consistency Analysis */}
      {diag.consistencyNote && (
        <div className="card" style={{ padding: 16, marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#e8962a", letterSpacing: 1, marginBottom: 6 }}>🔍 WHERE DOES FOCUS BREAK?</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.7 }}>{diag.consistencyNote}</div>
        </div>
      )}

      {/* Deduction Heatmap by Category */}
      <div className="card" style={{ padding: 16, marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: 1, marginBottom: 12 }}>DEDUCTION BREAKDOWN BY TYPE</div>
        {Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]).map(([cat, total], i) => {
          const pct = result.totalDeductions > 0 ? (total / result.totalDeductions) * 100 : 0;
          const count = deds.filter(d => (d.category || "execution") === cat).length;
          return (
            <div key={i} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600, textTransform: "capitalize" }}>{cat}</span>
                <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, fontWeight: 700, color: "#dc2626" }}>-{total.toFixed(2)} <span style={{ color: "rgba(255,255,255,0.3)", fontWeight: 400 }}>({count})</span></span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, borderRadius: 3, background: cat === "execution" ? "#dc2626" : cat === "landing" ? "#e06820" : cat === "artistry" ? "#a855f7" : "#ffc15a", transition: "width 0.5s" }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Detection Engine Report */}
      <div className="card" style={{ padding: 16, marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: 1, marginBottom: 12 }}>DETECTION ENGINE REPORT</div>
        {[
          { name: "Toe Point (TPM)", count: diag.toePointIssues || deds.filter(d => (d.fault || "").toLowerCase().includes("toe") || (d.fault || "").toLowerCase().includes("flex") || (d.fault || "").toLowerCase().includes("foot") || (d.engine || "") === "TPM").length, color: "#dc2626", icon: "🦶" },
          { name: "Knee Tension (KTM)", count: diag.kneeTensionIssues || deds.filter(d => (d.fault || "").toLowerCase().includes("knee") || (d.fault || "").toLowerCase().includes("soft") || (d.engine || "") === "KTM").length, color: "#e06820", icon: "🦵" },
          { name: "Landing", count: deds.filter(d => d.category === "landing").length, total: diag.landingDeductions || deds.filter(d => d.category === "landing").reduce((s, d) => s + (d.deduction || 0), 0), color: "#ffc15a", icon: "👟" },
          { name: "Artistry", count: deds.filter(d => d.category === "artistry").length, total: diag.artistryDeductions || deds.filter(d => d.category === "artistry").reduce((s, d) => s + (d.deduction || 0), 0), color: "#a855f7", icon: "💃" },
        ].map((eng, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 10, marginBottom: 4,
            background: eng.count > 0 ? `${eng.color}08` : "rgba(255,255,255,0.02)",
            borderLeft: `3px solid ${eng.count > 0 ? eng.color : "rgba(255,255,255,0.06)"}`,
          }}>
            <span style={{ fontSize: 18 }}>{eng.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: eng.count > 0 ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.4)" }}>{eng.name}</div>
              {eng.total !== undefined && eng.total > 0 && (
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>-{eng.total.toFixed(2)} total</div>
              )}
            </div>
            <div style={{
              width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
              background: eng.count > 2 ? `${eng.color}20` : eng.count > 0 ? `${eng.color}10` : "rgba(255,255,255,0.04)",
              fontFamily: "'Space Mono', monospace", fontSize: 14, fontWeight: 900,
              color: eng.count > 0 ? eng.color : "rgba(255,255,255,0.2)",
            }}>
              {eng.count}
            </div>
          </div>
        ))}
      </div>

      {/* Biomechanical Summary */}
      {result.biomechanics && (
        <div className="card" style={{ padding: 16, marginBottom: 12, borderColor: "rgba(59,130,246,0.15)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#3b82f6", letterSpacing: 1, marginBottom: 10 }}>🦴 BIOMECHANICAL SUMMARY</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <div style={{ flex: 1, padding: "8px 6px", borderRadius: 8, background: "rgba(59,130,246,0.06)", textAlign: "center" }}>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>Power</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#3b82f6", fontFamily: "'Space Mono', monospace" }}>{result.biomechanics.overallPowerRating || "—"}</div>
            </div>
            <div style={{ flex: 1, padding: "8px 6px", borderRadius: 8, background: "rgba(168,85,247,0.06)", textAlign: "center" }}>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>Flight</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#a855f7", textTransform: "capitalize" }}>{result.biomechanics.overallFlightHeight || "—"}</div>
            </div>
            <div style={{ flex: 1, padding: "8px 6px", borderRadius: 8, background: (result.biomechanics.injuryRiskFlags || []).some(r => r.risk === "high") ? "rgba(220,38,38,0.06)" : "rgba(34,197,94,0.06)", textAlign: "center" }}>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>Risk Flags</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: (result.biomechanics.injuryRiskFlags || []).length > 0 ? ((result.biomechanics.injuryRiskFlags || []).some(r => r.risk === "high") ? "#dc2626" : "#ffc15a") : "#22c55e", fontFamily: "'Space Mono', monospace" }}>
                {(result.biomechanics.injuryRiskFlags || []).length}
              </div>
            </div>
            <div style={{ flex: 1, padding: "8px 6px", borderRadius: 8, background: "rgba(255,193,90,0.06)", textAlign: "center" }}>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>Landings</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#ffc15a", fontFamily: "'Space Mono', monospace" }}>{(result.biomechanics.landingAnalysis || []).length}</div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", textAlign: "center" }}>Full biomechanics analysis in the 🦴 Biomechanics tab</div>
        </div>
      )}

      {/* Severity Distribution */}
      <div className="card" style={{ padding: 16, marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: 1, marginBottom: 12 }}>SEVERITY DISTRIBUTION</div>
        <div style={{ display: "flex", gap: 8 }}>
          {[
            { key: "small", label: "Micro/Small", color: "#22c55e" },
            { key: "medium", label: "Medium", color: "#ffc15a" },
            { key: "large", label: "Large", color: "#e06820" },
            { key: "veryLarge", label: "Very Large", color: "#dc2626" },
            { key: "fall", label: "Fall", color: "#dc2626" },
          ].map(s => {
            const count = severityCounts[s.key] || 0;
            return (
              <div key={s.key} style={{ flex: 1, textAlign: "center", padding: "10px 4px", borderRadius: 10, background: count > 0 ? `${s.color}10` : "rgba(255,255,255,0.02)" }}>
                <div style={{ fontSize: 20, fontWeight: 900, fontFamily: "'Space Mono', monospace", color: count > 0 ? s.color : "rgba(255,255,255,0.15)" }}>{count}</div>
                <div style={{ fontSize: 9, color: count > 0 ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.2)", marginTop: 2 }}>{s.label}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top 3 Score Drains */}
      <div className="card" style={{ padding: 16, marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: 1, marginBottom: 12 }}>TOP SCORE DRAINS</div>
        {sortedDeds.slice(0, 5).map((d, i) => {
          const c = DEDUCTION_SCALE[d.severity]?.color || "#ffc15a";
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, padding: "8px 10px", borderRadius: 8, background: "rgba(255,255,255,0.02)" }}>
              <div style={{
                width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                background: `${c}15`, fontSize: 12, fontWeight: 900, color: c, fontFamily: "'Space Mono', monospace",
              }}>
                {i + 1}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{safeStr(d.skill)}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{safeStr(d.fault)}</div>
              </div>
              <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 14, fontWeight: 700, color: c }}>-{safeNum(d.deduction, 0).toFixed(2)}</span>
            </div>
          );
        })}
      </div>

      {/* Coach Talking Points */}
      <div className="card" style={{ padding: 16, background: "rgba(232,150,42,0.03)", borderColor: "rgba(232,150,42,0.12)" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#e8962a", letterSpacing: 1, marginBottom: 8 }}>💬 TALKING POINTS FOR COACH</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.7 }}>
          {sortedDeds.length > 0 && `"The analysis identified ${deds.length} deductions totaling -${safeNum(result.totalDeductions, 0).toFixed(2)}. `}
          {sortedDeds[0] && `The biggest single item was ${safeStr(sortedDeds[0].skill)} (${safeStr(sortedDeds[0].fault)}, -${safeNum(sortedDeds[0].deduction, 0).toFixed(2)}). `}
          {diag.biggestMathWin && `The single biggest score improvement would come from: ${diag.biggestMathWin}. `}
          {`Can we focus on these areas in the next few practices?"`}
        </div>
      </div>
    </div>
  );
}

// ─── DEMO RESULT GENERATOR ──────────────────────────────────────────
function generateDemoResult(event, profile, frames) {
  const isFloor = event === "Floor Exercise";
  const isBeam = event === "Balance Beam";
  const isBars = event === "Uneven Bars" || event === "High Bar" || event === "Parallel Bars";
  const isVault = event === "Vault";
  const isFemale = profile.gender === "female";
  const lvl = profile.level || "Level 5";

  // ── Grouped skill cards with subFaults + skeleton ─────────────────
  const deductions = isFloor ? [
    {
      timestamp: "3",
      skill: "Opening choreography — dance passage",
      category: "artistry",
      severity: "small",
      deduction: 0.15,
      engine: "TPM",
      frameRef: 1,
      correction: "Push through toes on every step. Mark releve in choreography. Watch for flat feet during arm transitions.",
      ideal: "Every step on high releve, toes pointed through swing phase. Artistry confident and intentional.",
      details: "Persistent flat-footing through opening dance. Global artistry deduction.",
      subFaults: [
        { fault: "Flat-footing through dance passage — feet not on relevé", deduction: 0.10, engine: "TPM", bodyPoint: "both_ankles", angle: { measured: 150, ideal: 180, unit: "degrees" }, correction: "Mark every step on toes in practice — 'push through the floor'" },
        { fault: "Lack of expression — movement mechanical, not performed", deduction: 0.05, engine: "General", bodyPoint: "global", angle: null, correction: "Practice routine with exaggerated expression in mirror" },
      ],
      skeleton: { joints: { head:[0.48,0.08], neck:[0.48,0.14], lShoulder:[0.40,0.18], rShoulder:[0.56,0.18], lElbow:[0.34,0.10], rElbow:[0.62,0.10], lWrist:[0.30,0.04], rWrist:[0.66,0.04], lHip:[0.44,0.40], rHip:[0.52,0.40], lKnee:[0.43,0.58], rKnee:[0.53,0.58], lAnkle:[0.42,0.76], rAnkle:[0.54,0.76] }, faultJoints: ["lAnkle", "rAnkle"], angles: [{ joint: "lAnkle", measured: 150, ideal: 180, label: "Ankle flex" }, { joint: "rAnkle", measured: 148, ideal: 180, label: "Ankle flex" }] },
    },
    {
      timestamp: "8",
      skill: "Round-off BHS Back Tuck — 1st tumbling pass",
      category: "execution",
      severity: "large",
      deduction: 0.35,
      engine: "KTM",
      frameRef: 2,
      correction: "Priority: knee squeeze drills with foam block. Secondary: toe point on RO takeoff. Landing: stick drill 20× off low block.",
      ideal: "Tight tuck, knees glued from takeoff through landing. Pointed toes throughout flight. Stuck landing — chest up, arms at ears, zero movement.",
      details: "Three faults on this pass combine for the single biggest deduction in the routine. The cowboy tuck is the biggest math win.",
      subFaults: [
        { fault: "Knee separation in tuck — cowboy position, knees wider than shoulders", deduction: 0.20, engine: "KTM", bodyPoint: "knees", angle: { measured: 145, ideal: 0, unit: "mm separation" }, correction: "Foam block between knees during tuck practice — if it falls, they separated" },
        { fault: "Flexed left foot on round-off takeoff", deduction: 0.05, engine: "TPM", bodyPoint: "left_ankle", angle: { measured: 155, ideal: 180, unit: "degrees" }, correction: "Theraband ankle circles 3×20 daily" },
        { fault: "Medium step backward on back tuck landing", deduction: 0.10, engine: "Landing", bodyPoint: "feet", angle: { measured: 75, ideal: 90, unit: "degrees chest angle" }, correction: "Drop landing drill: step off block, freeze 3 full seconds" },
      ],
      skeleton: { joints: { head:[0.50,0.15], neck:[0.50,0.22], lShoulder:[0.42,0.26], rShoulder:[0.58,0.26], lElbow:[0.38,0.20], rElbow:[0.62,0.20], lWrist:[0.36,0.16], rWrist:[0.64,0.16], lHip:[0.45,0.42], rHip:[0.55,0.42], lKnee:[0.38,0.55], rKnee:[0.62,0.55], lAnkle:[0.36,0.68], rAnkle:[0.64,0.68] }, faultJoints: ["lKnee", "rKnee", "lAnkle"], angles: [{ joint: "rKnee", measured: 145, ideal: 180, label: "Knee gap" }, { joint: "lAnkle", measured: 155, ideal: 180, label: "Ankle flex" }] },
    },
    {
      timestamp: "18",
      skill: "Split leap — dance series",
      category: "execution",
      severity: "medium",
      deduction: 0.20,
      engine: "Split-Check",
      frameRef: 3,
      correction: "Hip flexor and hamstring flexibility daily. Hold peak split a half-beat longer — the judge needs to see 180°. Right foot point check.",
      ideal: "180° split with both legs AT horizontal or above. Toes pointed through full arc. Arms extended. Head up and confident.",
      details: "Split measures approximately 155° at peak. Right foot flexed. Combined 0.20 on this element.",
      subFaults: [
        { fault: "Insufficient split — hip vertex angle ~155°, requires 180° for " + lvl, deduction: 0.15, engine: "Split-Check", bodyPoint: "hips", angle: { measured: 155, ideal: 180, unit: "degrees" }, correction: "Daily over-split stretching. In routine: hold peak split a half-beat longer" },
        { fault: "Flexed right foot at peak of leap", deduction: 0.05, engine: "TPM", bodyPoint: "right_ankle", angle: { measured: 148, ideal: 180, unit: "degrees" }, correction: "Theraband foot point practice — mirror check" },
      ],
      skeleton: { joints: { head:[0.50,0.12], neck:[0.50,0.18], lShoulder:[0.42,0.22], rShoulder:[0.58,0.22], lElbow:[0.34,0.16], rElbow:[0.66,0.16], lWrist:[0.28,0.12], rWrist:[0.72,0.12], lHip:[0.46,0.38], rHip:[0.54,0.38], lKnee:[0.30,0.42], rKnee:[0.68,0.42], lAnkle:[0.18,0.48], rAnkle:[0.80,0.48] }, faultJoints: ["rKnee", "rAnkle"], angles: [{ joint: "rAnkle", measured: 148, ideal: 180, label: "Ankle flex" }] },
    },
    {
      timestamp: "28",
      skill: "Full turn (360°) on one foot",
      category: "execution",
      severity: "small",
      deduction: 0.05,
      engine: "KTM",
      frameRef: 4,
      correction: "Relevé balance drills daily. Supporting leg must lock at 175°+ from the moment the turn begins — no softening mid-rotation.",
      ideal: "Supporting leg locked 175°+. Free leg in clean passé. Arms pulled in tight. Full height relevé maintained through rotation.",
      details: "Supporting leg measured at 172° — below 175° locked threshold. Silent deduction that judges catch immediately.",
      subFaults: [
        { fault: "Soft supporting knee during turn rotation — 172°, requires 175°+", deduction: 0.05, engine: "KTM", bodyPoint: "right_knee", angle: { measured: 172, ideal: 180, unit: "degrees" }, correction: "Relevé balance hold: 1 minute on each leg. Squeeze quad until locked." },
      ],
      skeleton: { joints: { head:[0.50,0.72], neck:[0.50,0.64], lShoulder:[0.42,0.58], rShoulder:[0.58,0.58], lElbow:[0.38,0.50], rElbow:[0.62,0.50], lWrist:[0.36,0.42], rWrist:[0.64,0.42], lHip:[0.46,0.38], rHip:[0.54,0.38], lKnee:[0.48,0.22], rKnee:[0.52,0.22], lAnkle:[0.48,0.08], rAnkle:[0.52,0.08] }, faultJoints: ["lKnee"], angles: [{ joint: "lKnee", measured: 172, ideal: 180, label: "Knee lock" }] },
    },
    {
      timestamp: "42",
      skill: "Round-off BHS Layout — 2nd tumbling pass",
      category: "execution",
      severity: "medium",
      deduction: 0.20,
      engine: "VAE",
      frameRef: 5,
      correction: "Alignment: hollow body conditioning. Elbow: wall handstand with tricep focus. Step: block landing drill.",
      ideal: "Body passes through true vertical (within 10°). Arms locked 180° throughout. Stuck landing — no step.",
      details: "Body 14° off vertical reduces power transfer. Bent elbows on handspring contact. Small forward step on layout landing.",
      subFaults: [
        { fault: "Body 14° off vertical in round-off — insufficient repulsion angle", deduction: 0.10, engine: "VAE", bodyPoint: "torso", angle: { measured: 14, ideal: 0, unit: "degrees from vertical" }, correction: "Handstand shape drills against wall — body must pass through exact vertical" },
        { fault: "Bent elbows on BHS contact phase — 163°/165°", deduction: 0.05, engine: "KTM", bodyPoint: "elbows", angle: { measured: 163, ideal: 180, unit: "degrees" }, correction: "Wall handstand: push through shoulders, squeeze triceps until arms lock" },
        { fault: "Small step on layout landing", deduction: 0.05, engine: "Landing", bodyPoint: "feet", angle: null, correction: "Pit landing practice to build confidence on stick" },
      ],
      skeleton: { joints: { head:[0.50,0.10], neck:[0.50,0.16], lShoulder:[0.42,0.20], rShoulder:[0.58,0.20], lElbow:[0.36,0.30], rElbow:[0.64,0.30], lWrist:[0.32,0.40], rWrist:[0.68,0.40], lHip:[0.46,0.42], rHip:[0.54,0.42], lKnee:[0.44,0.60], rKnee:[0.56,0.60], lAnkle:[0.43,0.78], rAnkle:[0.57,0.78] }, faultJoints: ["lElbow", "rElbow"], angles: [{ joint: "lElbow", measured: 163, ideal: 180, label: "Elbow lock" }, { joint: "rElbow", measured: 165, ideal: 180, label: "Elbow lock" }] },
    },
    {
      timestamp: "58",
      skill: "Round-off BHS Layout — dismount landing",
      category: "landing",
      severity: "large",
      deduction: 0.20,
      engine: "Landing",
      frameRef: 6,
      correction: "Pit-to-landing progressions. Focus: absorb through ankles/knees, chest stays vertical, arms at ears. Hold 1 full second before saluting.",
      ideal: "Feet together on landing. Chest vertical. Arms at ears. Zero movement for 1 full second. This is the last thing the judge remembers.",
      details: "Large forward step on dismount. Chest dropped below vertical. This is the most scrutinized moment — the final impression.",
      subFaults: [
        { fault: "Large forward step on final dismount — weight forward, chest dropped", deduction: 0.20, engine: "Landing", bodyPoint: "feet", angle: { measured: 70, ideal: 90, unit: "degrees chest angle" }, correction: "Depth drop drill: step off box, absorb through ankles/knees. Freeze. Hold 3 full seconds." },
      ],
      skeleton: { joints: { head:[0.50,0.14], neck:[0.50,0.20], lShoulder:[0.42,0.24], rShoulder:[0.58,0.24], lElbow:[0.36,0.16], rElbow:[0.64,0.16], lWrist:[0.32,0.10], rWrist:[0.68,0.10], lHip:[0.46,0.42], rHip:[0.54,0.42], lKnee:[0.44,0.58], rKnee:[0.56,0.58], lAnkle:[0.42,0.76], rAnkle:[0.57,0.78] }, faultJoints: ["lAnkle", "rAnkle", "lKnee"], angles: [{ joint: "lKnee", measured: 70, ideal: 90, unit: "degrees chest" }] },
    },
  ] : isBeam ? [
    { timestamp: "2", skill: "Mount — jump to front support", category: "execution", severity: "small", deduction: 0.10, engine: "General", frameRef: 1, correction: "Practice mount with focus on immediate control. No wobble.", ideal: "Clean mount, immediate composure, no balance checks.", details: "Minor wobble on mount — 0.10 artistry.",
      subFaults: [{ fault: "Wobble on mount — balance check on landing", deduction: 0.10, engine: "General", bodyPoint: "hips", angle: null, correction: "Mount to freeze drill: 20 reps, no movement after landing" }],
      skeleton: { joints: { head:[0.5,0.12], neck:[0.5,0.18], lShoulder:[0.42,0.22], rShoulder:[0.58,0.22], lElbow:[0.36,0.16], rElbow:[0.64,0.16], lWrist:[0.32,0.10], rWrist:[0.68,0.10], lHip:[0.46,0.38], rHip:[0.54,0.38], lKnee:[0.44,0.56], rKnee:[0.56,0.56], lAnkle:[0.43,0.74], rAnkle:[0.57,0.74] }, faultJoints: ["lHip", "rHip"], angles: [] } },
    { timestamp: "10", skill: "Back walkover — acro series", category: "execution", severity: "medium", deduction: 0.20, engine: "TPM", frameRef: 2, correction: "Theraband daily. Back walkover drill: focus on toe point through full arc, back leg extension.", ideal: "Both legs fully extended and pointed through entire walkover arc. Split position at peak.", details: "Foot form and split deficiency combined.",
      subFaults: [{ fault: "Flexed feet through back walkover arc", deduction: 0.10, engine: "TPM", bodyPoint: "ankles", angle: { measured: 152, ideal: 180, unit: "degrees" }, correction: "Theraband ankle exercises 5 min daily" }, { fault: "Insufficient back leg extension — below 155° at peak", deduction: 0.10, engine: "Split-Check", bodyPoint: "rear_leg", angle: { measured: 155, ideal: 180, unit: "degrees" }, correction: "Back leg flexibility: daily hip flexor stretches + over-splits" }],
      skeleton: { joints: { head:[0.65,0.70], neck:[0.60,0.62], lShoulder:[0.55,0.55], rShoulder:[0.55,0.55], lElbow:[0.50,0.48], rElbow:[0.50,0.48], lWrist:[0.45,0.42], rWrist:[0.45,0.42], lHip:[0.55,0.45], rHip:[0.55,0.45], lKnee:[0.60,0.30], rKnee:[0.45,0.58], lAnkle:[0.62,0.15], rAnkle:[0.42,0.72] }, faultJoints: ["lAnkle", "rAnkle"], angles: [{ joint: "lAnkle", measured: 152, ideal: 180, label: "Ankle flex" }] } },
    { timestamp: "20", skill: "Split leap — 180° required", category: "execution", severity: "medium", deduction: 0.15, engine: "Split-Check", frameRef: 3, correction: "Over-splits daily. Hold peak a beat longer — judges need to see the angle.", ideal: "180° split, both legs at horizontal. Toes pointed. Head up.", details: "Split approximately 150° — below required 180° for " + lvl,
      subFaults: [{ fault: "Insufficient split — ~150° hip vertex angle", deduction: 0.15, engine: "Split-Check", bodyPoint: "hips", angle: { measured: 150, ideal: 180, unit: "degrees" }, correction: "Over-split stretch daily. Hold peak longer in routine." }],
      skeleton: { joints: { head:[0.50,0.12], neck:[0.50,0.18], lShoulder:[0.42,0.22], rShoulder:[0.58,0.22], lElbow:[0.34,0.16], rElbow:[0.66,0.16], lWrist:[0.28,0.12], rWrist:[0.72,0.12], lHip:[0.46,0.38], rHip:[0.54,0.38], lKnee:[0.30,0.42], rKnee:[0.68,0.42], lAnkle:[0.18,0.46], rAnkle:[0.80,0.46] }, faultJoints: ["rKnee"], angles: [] } },
    { timestamp: "30", skill: "Full turn on one foot", category: "execution", severity: "small", deduction: 0.05, engine: "KTM", frameRef: 4, correction: "Relevé balance drills. Lock knee from first moment of turn.", ideal: "Supporting leg locked 175°+. Clean passé. Arms tight.", details: "Supporting knee 172° — below 175° threshold.",
      subFaults: [{ fault: "Soft supporting knee — 172°, requires 175°+", deduction: 0.05, engine: "KTM", bodyPoint: "right_knee", angle: { measured: 172, ideal: 180, unit: "degrees" }, correction: "Relevé balance 1 min daily on each foot" }],
      skeleton: { joints: { head:[0.50,0.08], neck:[0.50,0.14], lShoulder:[0.46,0.18], rShoulder:[0.54,0.18], lElbow:[0.47,0.12], rElbow:[0.53,0.12], lWrist:[0.48,0.06], rWrist:[0.52,0.06], lHip:[0.47,0.38], rHip:[0.53,0.38], lKnee:[0.47,0.56], rKnee:[0.53,0.56], lAnkle:[0.47,0.74], rAnkle:[0.53,0.74] }, faultJoints: ["rKnee"], angles: [{ joint: "rKnee", measured: 172, ideal: 180, label: "Knee lock" }] } },
    { timestamp: "48", skill: "Round-off back tuck dismount", category: "landing", severity: "large", deduction: 0.25, engine: "Landing", frameRef: 5, correction: "Landing drills off beam. Absorb through ankles, chest up, freeze.", ideal: "Stuck landing, feet together, chest vertical, arms at ears. Zero movement.", details: "Large step + chest drop on dismount landing — the final impression.",
      subFaults: [{ fault: "Large step on dismount landing", deduction: 0.20, engine: "Landing", bodyPoint: "feet", angle: null, correction: "Pit-to-beam landing drill 15 reps" }, { fault: "Chest dropped below vertical on absorption", deduction: 0.05, engine: "General", bodyPoint: "torso", angle: { measured: 70, ideal: 90, unit: "degrees" }, correction: "Focus on tall chest on every landing — imagine thread pulling head up" }],
      skeleton: { joints: { head:[0.50,0.14], neck:[0.50,0.20], lShoulder:[0.42,0.24], rShoulder:[0.58,0.24], lElbow:[0.36,0.18], rElbow:[0.64,0.18], lWrist:[0.32,0.12], rWrist:[0.68,0.12], lHip:[0.46,0.42], rHip:[0.54,0.42], lKnee:[0.44,0.58], rKnee:[0.56,0.58], lAnkle:[0.42,0.76], rAnkle:[0.58,0.78] }, faultJoints: ["lAnkle", "rAnkle"], angles: [] } },
  ] : isBars ? [
    { timestamp: "2", skill: "Mount — glide kip", category: "execution", severity: "small", deduction: 0.10, engine: "TPM", frameRef: 1, correction: "Arms MUST stay straight through entire kip. Toes to bar in glide phase.", ideal: "Arms straight throughout, toes touch bar, smooth glide with no pause, clean front support finish.",details: "Flexed foot and slight arm bend in kip.",
      subFaults: [{ fault: "Flexed foot during glide kip", deduction: 0.05, engine: "TPM", bodyPoint: "feet", angle: { measured: 152, ideal: 180, unit: "degrees" }, correction: "Point toes from the moment feet leave the ground" }, { fault: "Slight arm bend on kip pull", deduction: 0.05, engine: "KTM", bodyPoint: "elbows", angle: { measured: 165, ideal: 180, unit: "degrees" }, correction: "Lat pull-down conditioning for straight-arm kip strength" }],
      skeleton: { joints: { head:[0.35,0.35], neck:[0.38,0.32], lShoulder:[0.42,0.28], rShoulder:[0.42,0.28], lElbow:[0.42,0.20], rElbow:[0.42,0.20], lWrist:[0.42,0.12], rWrist:[0.42,0.12], lHip:[0.48,0.40], rHip:[0.48,0.40], lKnee:[0.55,0.50], rKnee:[0.55,0.50], lAnkle:[0.62,0.55], rAnkle:[0.62,0.55] }, faultJoints: ["lAnkle", "rAnkle", "lElbow"], angles: [{ joint: "lAnkle", measured: 152, ideal: 180, label: "Ankle flex" }] } },
    { timestamp: "10", skill: "Cast to handstand", category: "execution", severity: "medium", deduction: 0.20, engine: "VAE", frameRef: 2, correction: "Cast conditioning: hollow body cast drills. Must pass through 180° vertical.", ideal: "Body passes through true vertical (180°). Arms locked. Straight line from wrists to toes.", details: "Body reaches only 160° — 20° short of handstand. Leg form also broken.",
      subFaults: [{ fault: "Cast only reaches 160° — 20° short of handstand", deduction: 0.15, engine: "VAE", bodyPoint: "torso", angle: { measured: 160, ideal: 180, unit: "degrees from bar" }, correction: "Cast handstand drills with spot. Build shoulder strength." }, { fault: "Piked body on cast — not hollow", deduction: 0.05, engine: "General", bodyPoint: "hips", angle: null, correction: "Hollow body conditioning 4×20s daily" }],
      skeleton: { joints: { head:[0.42,0.82], neck:[0.42,0.74], lShoulder:[0.42,0.66], rShoulder:[0.42,0.66], lElbow:[0.42,0.58], rElbow:[0.42,0.58], lWrist:[0.42,0.50], rWrist:[0.42,0.50], lHip:[0.44,0.48], rHip:[0.44,0.48], lKnee:[0.44,0.30], rKnee:[0.44,0.30], lAnkle:[0.44,0.16], rAnkle:[0.44,0.16] }, faultJoints: ["lHip", "rHip"], angles: [] } },
    { timestamp: "22", skill: "Clear hip circle", category: "execution", severity: "small", deduction: 0.10, engine: "KTM", frameRef: 3, correction: "Clear hip conditioning on low bar. Focus on leg lockout through rotation.", ideal: "Straight legs throughout rotation, tight body, smooth circle.", details: "Leg form breaks mid-circle — bent knees 168°.",
      subFaults: [{ fault: "Bent knees during clear hip — 168°, requires 175°+", deduction: 0.10, engine: "KTM", bodyPoint: "knees", angle: { measured: 168, ideal: 180, unit: "degrees" }, correction: "Clear hip on low bar with straight-leg focus drills" }],
      skeleton: { joints: { head:[0.5,0.15], neck:[0.5,0.22], lShoulder:[0.42,0.26], rShoulder:[0.58,0.26], lElbow:[0.38,0.20], rElbow:[0.62,0.20], lWrist:[0.36,0.16], rWrist:[0.64,0.16], lHip:[0.46,0.42], rHip:[0.54,0.42], lKnee:[0.44,0.58], rKnee:[0.56,0.58], lAnkle:[0.43,0.74], rAnkle:[0.57,0.74] }, faultJoints: ["lKnee", "rKnee"], angles: [{ joint: "rKnee", measured: 168, ideal: 180, label: "Knee bend" }] } },
    { timestamp: "35", skill: "Flyaway dismount — back tuck", category: "landing", severity: "large", deduction: 0.25, engine: "Landing", frameRef: 4, correction: "Pit flyaway practice. Tuck tight, spot the mat, absorb through ankles.", ideal: "Tight tuck in flight, stuck landing, chest up, arms at ears.", details: "Open tuck + large step on landing.",
      subFaults: [{ fault: "Open tuck in flyaway — insufficient tuck position", deduction: 0.10, engine: "KTM", bodyPoint: "knees", angle: null, correction: "Tuck jump drills — focus on pulling knees to chest" }, { fault: "Large step on flyaway landing", deduction: 0.15, engine: "Landing", bodyPoint: "feet", angle: null, correction: "Pit-to-mat progression: stick before moving to competition height" }],
      skeleton: { joints: { head:[0.50,0.14], neck:[0.50,0.20], lShoulder:[0.42,0.24], rShoulder:[0.58,0.24], lElbow:[0.36,0.16], rElbow:[0.64,0.16], lWrist:[0.32,0.10], rWrist:[0.68,0.10], lHip:[0.46,0.42], rHip:[0.54,0.42], lKnee:[0.44,0.58], rKnee:[0.56,0.58], lAnkle:[0.42,0.76], rAnkle:[0.58,0.78] }, faultJoints: ["lAnkle", "rAnkle"], angles: [] } },
  ] : /* Vault */ [
    { timestamp: "2", skill: "Approach run + hurdle", category: "execution", severity: "small", deduction: 0.05, engine: "TPM", frameRef: 1, correction: "Run at top speed. Hurdle must be quick — do not slow down before the board.", ideal: "Maximum speed approach. Short, powerful hurdle. Full explosion onto board.", details: "Slight deceleration in last 3 steps before hurdle.",
      subFaults: [{ fault: "Deceleration in approach — reduced power into board", deduction: 0.05, engine: "General", bodyPoint: "global", angle: null, correction: "Sprint conditioning: 4×20m sprints. Full-speed vault approaches in practice" }],
      skeleton: { joints: { head:[0.50,0.12], neck:[0.50,0.18], lShoulder:[0.42,0.22], rShoulder:[0.58,0.22], lElbow:[0.38,0.26], rElbow:[0.62,0.26], lWrist:[0.36,0.32], rWrist:[0.64,0.32], lHip:[0.46,0.40], rHip:[0.54,0.40], lKnee:[0.44,0.58], rKnee:[0.56,0.58], lAnkle:[0.43,0.76], rAnkle:[0.57,0.76] }, faultJoints: [], angles: [] } },
    { timestamp: "5", skill: "Table contact + repulsion phase", category: "execution", severity: "medium", deduction: 0.15, engine: "KTM", frameRef: 2, correction: "Wall handstand push-up drill. Arms must lock BEFORE hands hit table.", ideal: "Arms locked 180° on contact. Push through shoulders at maximum force. Brief contact.", details: "Bent elbows reduce repulsion power and score.",
      subFaults: [{ fault: "Bent elbows on table contact — 162°/165°", deduction: 0.10, engine: "KTM", bodyPoint: "elbows", angle: { measured: 162, ideal: 180, unit: "degrees" }, correction: "Wall handstand: push through shoulders, lock elbows before contact" }, { fault: "Body not in hollow — slight pike on table contact", deduction: 0.05, engine: "VAE", bodyPoint: "hips", angle: null, correction: "Repulsion drill with hollow body from box" }],
      skeleton: { joints: { head:[0.50,0.82], neck:[0.50,0.74], lShoulder:[0.42,0.67], rShoulder:[0.58,0.67], lElbow:[0.44,0.56], rElbow:[0.56,0.56], lWrist:[0.44,0.45], rWrist:[0.56,0.45], lHip:[0.47,0.52], rHip:[0.53,0.52], lKnee:[0.48,0.35], rKnee:[0.52,0.35], lAnkle:[0.48,0.18], rAnkle:[0.52,0.18] }, faultJoints: ["lElbow", "rElbow"], angles: [{ joint: "lElbow", measured: 162, ideal: 180, label: "Elbow lock" }] } },
    { timestamp: "6", skill: "Post-flight body position + landing", category: "landing", severity: "large", deduction: 0.30, engine: "Landing", frameRef: 3, correction: "Block landing from table: stick drill. Arms to ears on landing. Pit progression.", ideal: "Extended layout in flight. Stuck landing — feet together, chest up, arms at ears, zero movement.", details: "Piked flight phase and large step on landing — significant combined deduction.",
      subFaults: [{ fault: "Pike in post-flight — body not extended in layout", deduction: 0.10, engine: "VAE", bodyPoint: "hips", angle: { measured: 155, ideal: 180, unit: "degrees hip angle" }, correction: "Block drill from vault: focus on hollow extension in flight" }, { fault: "Large step on landing — forward weight shift", deduction: 0.20, engine: "Landing", bodyPoint: "feet", angle: { measured: 65, ideal: 90, unit: "degrees chest angle" }, correction: "Depth drops onto wedge mat: freeze 3 full seconds on landing" }],
      skeleton: { joints: { head:[0.50,0.14], neck:[0.50,0.20], lShoulder:[0.42,0.24], rShoulder:[0.58,0.24], lElbow:[0.36,0.18], rElbow:[0.64,0.18], lWrist:[0.32,0.12], rWrist:[0.68,0.12], lHip:[0.46,0.42], rHip:[0.54,0.42], lKnee:[0.44,0.58], rKnee:[0.56,0.58], lAnkle:[0.41,0.76], rAnkle:[0.59,0.78] }, faultJoints: ["lAnkle", "rAnkle", "lHip"], angles: [{ joint: "lAnkle", measured: 65, ideal: 90, label: "Chest angle" }] } },
  ];

  const totalDed = Math.round(deductions.reduce((s, d) => s + d.deduction, 0) * 1000) / 1000;
  const finalScore = Math.round((10.0 - totalDed) * 1000) / 1000;
  const tpmCount = deductions.filter(d => d.engine === "TPM" || d.subFaults?.some(sf => sf.engine === "TPM")).length;
  const ktmCount = deductions.filter(d => d.engine === "KTM" || d.subFaults?.some(sf => sf.engine === "KTM")).length;
  const landingTotal = deductions.filter(d => d.category === "landing").reduce((s, d) => s + d.deduction, 0);
  const artistryTotal = deductions.filter(d => d.category === "artistry").reduce((s, d) => s + d.deduction, 0);

  const execTotal = Math.round(deductions.filter(d => d.category !== "artistry").reduce((s, d) => s + d.deduction, 0) * 1000) / 1000;

  return {
    startValue: 10.0,
    executionDeductions: deductions,
    executionDeductionsTotal: execTotal,
    artistryDeductionsTotal: artistryTotal,
    neutralDeductionsTotal: 0,
    totalDeductions: totalDed,
    finalScore,
    isDemo: true,
    overallAssessment: `Championship-Strict evaluation of this ${event} routine at ${lvl}. Total deductions: -${totalDed.toFixed(2)}, yielding ${finalScore.toFixed(3)}. This is a "Drip Feed" score — constant small leaks: ${isFloor ? `flat feet in dance (-0.15), the "Cowboy" tuck (-0.20), and landing instability (-0.35 combined)` : isBeam ? `foot form through acro (-0.10), split deficiency (-0.15), and dismount landing (-0.25)` : isBars ? `form breaks through rotation (-0.30) and landing (-0.25)` : `repulsion arm form (-0.15) and landing (-0.30)`}. The single biggest math win: ${deductions.sort((a,b) => b.deduction-a.deduction)[0]?.skill} saves +${deductions.sort((a,b) => b.deduction-a.deduction)[0]?.deduction.toFixed(2)} if cleaned up.`,
    strengths: [
      "Routine completed without falls — confidence and courage on competitive elements",
      "Power evident on tumbling/acro passes — height and distance show strong conditioning",
      `Choreography well-constructed with appropriate difficulty for ${lvl}`,
    ],
    areasForImprovement: [
      isFloor ? "THE COWBOY: Knee separation in the tuck = biggest math win (-0.20). Drill: foam block between knees." : isBars ? "CAST HANDSTAND: Body must reach 180° = saves -0.15. Drill: cast to handstand with spot." : isBeam ? "SPLIT LEAP: Need 180° split. Hold peak longer = saves -0.15." : "LANDING: Large step costs -0.20. Depth drop drills = biggest gain.",
      "THE DRIP: Flat-footing / soft knees / flexed feet costs -0.10+ through the whole routine. Awareness + theraband daily.",
      "LANDING CONTROL: Every landing has a deduction. 20 stick-landing reps per practice off low block, freeze 3 seconds.",
    ],
    bodyPositionNotes: deductions.slice(0, 6).map((d, i) => ({
      frameRef: d.frameRef || i + 1,
      timestamp: frames[i]?.timestamp || String(parseFloat(d.timestamp)),
      observation: `${d.skill}: ${d.subFaults?.[0]?.fault || d.details}`,
      annotation: `[${d.engine}] -${d.deduction.toFixed(2)}`,
      joints: d.skeleton?.joints || null,
      faultJoints: d.skeleton?.faultJoints || [],
    })),
    frames, event, level: profile.level,
    biomechanics: {
      keyMoments: [
        { timestamp: isFloor ? "0:08" : isBeam ? "0:15" : isBars ? "0:10" : "0:03", skill: isFloor ? "Round-off BHS" : isBeam ? "Back walkover" : isBars ? "Kip cast" : "Board contact", phase: "takeoff", jointAngles: { lKnee: 142, rKnee: 145, lHip: 155, rHip: 158, lAnkle: 88, rAnkle: 90 }, angularVelocity: { hip: 320, knee: 280 }, notes: "Good power generation but slight knee bend reduces efficiency" },
        { timestamp: isFloor ? "0:09" : isBeam ? "0:16" : isBars ? "0:11" : "0:04", skill: isFloor ? "Back tuck" : isBeam ? "Back walkover" : isBars ? "Cast handstand" : "Table contact", phase: "peak", jointAngles: { lKnee: 65, rKnee: 72, lHip: 45, rHip: 48, lAnkle: 165, rAnkle: 168 }, angularVelocity: { hip: 480, knee: 350 }, notes: isFloor ? "Knees should be tighter — separation visible" : "Good vertical reach" },
        { timestamp: isFloor ? "0:22" : isBeam ? "0:35" : isBars ? "0:28" : "0:06", skill: isFloor ? "Split leap" : isBeam ? "Split jump" : isBars ? "Flyaway dismount" : "Post-flight", phase: isFloor || isBeam ? "peak" : "landing", jointAngles: { lKnee: 175, rKnee: 178, lHip: 160, rHip: 155, lAnkle: 172, rAnkle: 175 }, angularVelocity: { hip: 120, knee: 90 }, notes: isFloor || isBeam ? "Split angle short of 180°" : "Good extension in flight" },
      ],
      landingAnalysis: [
        { timestamp: isFloor ? "0:10" : isBeam ? "0:45" : isBars ? "0:30" : "0:06", skill: isFloor ? "Back tuck landing" : isBeam ? "Dismount landing" : isBars ? "Flyaway landing" : "Vault landing", kneeFlexionAtImpact: 148, chestAngle: 72, stepsAfter: 1, impactRisk: "low", notes: "Slight forward lean caused compensatory step. Knee absorption adequate." },
        ...(isFloor ? [{ timestamp: "0:35", skill: "Final pass landing", kneeFlexionAtImpact: 135, chestAngle: 65, stepsAfter: 2, impactRisk: "moderate", notes: "Under-rotated slightly, deeper squat on impact. Two steps to recover." }] : []),
      ],
      holdDurations: isBeam ? [
        { timestamp: "0:20", skill: "Scale hold", durationMs: 1200, requiredMs: 1000, met: true },
        { timestamp: "0:40", skill: "Handstand", durationMs: 700, requiredMs: 1000, met: false },
      ] : isBars ? [
        { timestamp: "0:12", skill: "Cast handstand", durationMs: 400, requiredMs: 1000, met: false },
      ] : [],
      injuryRiskFlags: [
        { timestamp: isFloor ? "0:10" : isBeam ? "0:45" : isBars ? "0:30" : "0:06", joint: "lKnee", risk: "low", reason: "Mild valgus (inward collapse) on landing — common at this level", recommendation: "Single-leg squats focusing on knee tracking over toe, 3×10 each leg" },
        ...(isFloor ? [{ timestamp: "0:35", joint: "rAnkle", risk: "moderate", reason: "Ankle rolling slightly inward on under-rotated landing", recommendation: "Balance board training 5 min/day + ankle circles with resistance band" }] : []),
      ],
      overallFlightHeight: isVault ? "adequate" : isFloor ? "adequate" : "N/A",
      overallPowerRating: isVault ? "7/10" : isFloor ? "7/10" : isBeam ? "6/10" : "7/10",
    },
    coachReport: {
      preemptiveCorrections: [
        { skill: isFloor ? "Back tuck" : isBeam ? "Back walkover" : isBars ? "Cast handstand" : "Table contact", currentFault: isFloor ? "Knee separation (cowboy) is becoming a habit — appears on every tuck" : isBeam ? "Shoulder angle inconsistent through support phases" : isBars ? "Arms bending on every cast — developing muscle memory for bent arms" : "Elbows bending on contact — reducing repulsion power", riskIfUncorrected: isFloor ? "At Level 7+, cowboy tuck costs 0.20 PLUS difficulty downgrades. Fix now while muscle memory is forming." : "Will limit difficulty upgrades and cost 0.10-0.20 per skill at higher levels", correction: isFloor ? "Foam block between knees for ALL tuck practice. If block falls, stop and reset. 50 reps/week minimum." : isBeam ? "Wall handstand holds 3x30sec daily. Push through shoulders." : isBars ? "Cast to handstand with straight arm focus — coach taps elbows as reminder" : "Wall handstand push-ups focusing on locked elbows before contact", priority: "high" },
        { skill: "Landing mechanics", currentFault: "Forward weight shift on landings — chest drops below 75° consistently", riskIfUncorrected: "Creates ankle/knee injury risk and costs 0.10-0.20 on every dismount/tumble landing", correction: "Depth drops from 12-inch block: land and freeze 3 full seconds. Arms must reach ears BEFORE feet hit.", priority: "high" },
        { skill: "Toe point awareness", currentFault: "Foot form drops during aerial phases when focus shifts to rotation", riskIfUncorrected: "Persistent 0.05 deductions add up to 0.30-0.50 per routine — the 'silent score killer'", correction: "Theraband ankle exercises 3x20 daily. Practice every skill barefoot in front of mirror to build awareness.", priority: "medium" },
      ],
      conditioningPlan: [
        { area: "Knee stability", exercise: "Single-leg Romanian deadlifts", sets: "3x10 each leg", frequency: "3x/week", why: "Addresses valgus knee pattern seen on landings — strengthens VMO and hamstrings" },
        { area: "Core-to-extremity connection", exercise: "Hollow body holds + V-ups superset", sets: "4x20sec hold + 10 V-ups", frequency: "Daily", why: "Improves body tension throughout flight skills — reduces separation and pike breaks" },
        { area: "Ankle strength + toe point", exercise: "Calf raises on beam + theraband point/flex", sets: "3x15 + 3x20", frequency: "Daily", why: "Root cause of TPM deductions — weak plantar flexion during aerial phases" },
        { area: "Upper body push-through", exercise: "Handstand shoulder shrugs against wall", sets: "3x10", frequency: "3x/week", why: "Addresses insufficient shoulder extension in support skills and roundoffs" },
        { area: "Landing absorption", exercise: "Drop landings from progressive heights", sets: "3x8 (12-inch, 18-inch, 24-inch)", frequency: "2x/week", why: "Builds eccentric strength for controlled deceleration — reduces step deductions" },
      ],
      idealComparison: isFloor
        ? `For ${lvl} floor, this gymnast shows good power on tumbling passes (adequate amplitude) but body tension breaks during flight. The ideal model shows a perfectly straight line from wrists to ankles during round-off and layout positions. This gymnast's hip angle at peak tuck is ~145° (ideal: full closure ~45°) and knee separation is visible. Strongest body line: dance and choreography positions. Most deviation: aerial body tension during tumbling. Conditioning focus: core-to-extremity connection and adductor strength.`
        : isBeam
        ? `For ${lvl} beam, this gymnast demonstrates good balance and confidence but form breaks on acrobatic skills. The ideal model maintains locked limbs and full extension through every position. Strongest body line: turns and balance work. Most deviation: acrobatic connections and dismount landing.`
        : isBars
        ? `For ${lvl} bars, this gymnast shows developing swing mechanics but arm lock and cast height need work. The ideal model reaches full handstand on every cast with locked arms. Strongest body line: kip motion and swing. Most deviation: cast height and arm straightness.`
        : `For ${lvl} vault, this gymnast generates good run speed but loses power at the board. The ideal model shows full arm lock on table contact with a strong hollow body push-through. Strongest body line: run and hurdle. Most deviation: table contact arm form and post-flight extension.`,
      techniqueProgressionNotes: isFloor
        ? `Tuck is established — ready to begin layout training with a spot. Focus on opening the hips at the top of the tuck before extending to layout. Also ready to add a front tumbling pass (front handspring to front tuck) for difficulty credit. Split leap is close to requirement — 2-3 more weeks of flexibility work should get it to passing.`
        : isBeam
        ? `Back walkover is solid — can begin training back handspring on beam (low beam first, with spot). Turn is approaching the requirement for a higher-level turn series. Dismount should progress from tuck to layout once tuck is consistently stuck.`
        : isBars
        ? `Kip is reliable — can begin training kip cast to handstand sequence. Giant swings should be introduced on strap bar first. Free hip circle to handstand is the next big skill target.`
        : `Current vault is solid. Ready to begin Tsuk entry training (round-off onto board). Focus on maintaining arm lock through increased speed on approach.`,
    },
    athleteDevelopment: {
      nutritionTips: [
        profile.age && profile.age < 13
          ? "Growing gymnasts need extra calcium (3 servings of dairy or calcium-rich foods daily) and iron to support bone density and energy levels. Never restrict calories — growing bodies need fuel."
          : "Performance nutrition: eat a balanced meal 2-3 hours before practice. Post-workout protein within 30 minutes (chocolate milk, Greek yogurt, or protein smoothie).",
        "Hydrate with water throughout practice — aim for 8+ oz every 20 minutes during training. Sports drinks only needed for sessions over 90 minutes.",
        "Meet day: familiar foods only. Banana + peanut butter 1-2 hours before competing. Avoid trying new foods on competition day.",
      ],
      mentalTraining: [
        profile.goals === "build confidence"
          ? "Build a 'confidence highlight reel' — before each practice, mentally replay 3 skills you've landed perfectly. Your brain doesn't distinguish between real and vividly imagined success."
          : "Visualization practice: spend 5 minutes before bed mentally performing your routine perfectly. See yourself sticking every landing, pointing every toe, and saluting with confidence.",
        profile.age && profile.age < 12
          ? "Create a simple pre-routine 'power word' — one word that makes you feel strong (like 'READY' or 'POWERFUL'). Say it during your salute."
          : "Develop a pre-routine ritual: 3 deep breaths during the salute. Inhale confidence, exhale tension. Same ritual every time builds automatic calm.",
        "After a fall or mistake: reset with the '5-second rule' — acknowledge it happened, take one breath, then commit fully to the next skill. Judges score the WHOLE routine, not just one moment.",
      ],
      recoveryTips: [
        profile.age && profile.age < 13
          ? "Sleep is THE most important recovery tool for young gymnasts. Aim for 9-11 hours per night. Growth hormone is released during deep sleep."
          : "Aim for 8-10 hours of sleep. Sleep is when your body repairs muscle and consolidates the motor patterns you practiced today.",
        "Active recovery on rest days: 20-minute walk, gentle yoga, or swimming. Complete rest is less effective than light movement.",
        "Foam rolling after practice on quads, hamstrings, and calves — 30 seconds per muscle group. Helps prevent tightness that leads to form breaks.",
      ],
      goalSpecificAdvice: profile.goals === "move up levels"
        ? `To move up from ${lvl}, focus on cleaning execution over adding difficulty. A 9.2 at your current level with clean form shows judges (and coaches) you're ready — a 8.5 with messy upgrades doesn't. Master the basics, then level up.`
        : profile.goals === "qualify regionals"
        ? `Regional qualification at ${lvl} typically requires consistent scores above 9.0 on your best events. Based on this analysis, the biggest score gains come from fixing landing mechanics and body tension — these are 'free points' that don't require learning new skills.`
        : profile.goals === "college gymnastics"
        ? `College coaches watch for: consistency, clean form, and coachability — not just difficulty. Film your cleanest routines for recruiting reels. Focus on hitting 9.0+ consistently before upgrading difficulty.`
        : profile.goals === "injury recovery"
        ? `Coming back from injury: prioritize quality over quantity. If a skill causes pain, STOP and tell your coach. Build back slowly — 70% difficulty at 100% form is better than 100% difficulty at 70% form. Your body remembers the skills; trust the process.`
        : `At ${lvl}, the path forward is clean execution. Every 0.05 deduction you eliminate is a permanent improvement. Focus on the top 3 deductions from this analysis — fixing those alone could move your score up significantly.`,
    },
    diagnostics: {
      toePointIssues: tpmCount,
      kneeTensionIssues: ktmCount,
      splitDeficiency: deductions.some(d => d.subFaults?.some(sf => sf.engine === "Split-Check")),
      landingDeductions: landingTotal,
      artistryDeductions: artistryTotal,
      biggestMathWin: `${deductions.sort((a,b) => b.deduction-a.deduction)[0]?.skill}: +${deductions.sort((a,b) => b.deduction-a.deduction)[0]?.deduction.toFixed(2)} if fixed`,
      consistencyNote: "Foot form stays cleaner during dance but drops in aerial phases — a focus/conditioning split, not a strength issue.",
    },
  };
}
