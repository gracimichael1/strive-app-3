import React, { useState, useEffect, useCallback } from 'react';
import { generateMastermindPlan } from '../../engine/mastermind';

const T = {
  bg: '#0d1117', card: '#161b22', cardInner: '#1c2230',
  gold: '#f0a030', goldBg: 'rgba(240,160,48,0.08)',
  green: '#22c55e', orange: '#f97316', red: '#ef4444',
  blue: '#60a5fa', purple: '#a855f7', teal: '#2dd4bf',
  text: '#e6edf3', textSec: 'rgba(230,237,243,0.6)',
  textMuted: 'rgba(230,237,243,0.35)', border: 'rgba(255,255,255,0.07)',
  mono: "'SF Mono', 'Fira Mono', monospace", sans: "'Outfit', sans-serif",
};

const GOAL_LABELS = {
  states: 'States / Nationals', scholarship: 'College scholarship',
  level10: 'Reach Level 10', fun: 'Love the sport + stay healthy', unset: 'Not set',
};

const PANELS = [
  { id: 'conditioning', icon: '\uD83D\uDCAA', label: 'Strength + Conditioning', color: T.orange },
  { id: 'mental', icon: '\uD83E\uDDE0', label: 'Mental Game', color: T.gold },
  { id: 'nutrition', icon: '\uD83E\uDD57', label: 'Nutrition + Fueling', color: T.green },
  { id: 'injury', icon: '\uD83E\uDE79', label: 'Injury Prevention', color: T.red },
  { id: 'skills', icon: '\uD83C\uDFAF', label: 'Skill Development', color: T.blue },
  { id: 'goals', icon: '\uD83C\uDFC6', label: 'Goals + Progress', color: T.purple },
];

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function MastermindScreen({ athleteProfile, recentAnalyses, upcomingMeet, tier, onBack, onUpgrade, onChangeGoal }) {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openPanel, setOpenPanel] = useState(null);
  const [completedDays, setCompletedDays] = useState(() => {
    try { return JSON.parse(localStorage.getItem('strive_conditioning_done') || '{}'); } catch { return {}; }
  });

  const loadPlan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = await generateMastermindPlan(athleteProfile, recentAnalyses || [], upcomingMeet);
      setPlan(p);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, [athleteProfile, recentAnalyses, upcomingMeet]);

  useEffect(() => { loadPlan(); }, [loadPlan]);

  const toggleDay = (day) => {
    const key = `${new Date().toISOString().split('T')[0]}_${day}`;
    const next = { ...completedDays, [key]: !completedDays[key] };
    setCompletedDays(next);
    try { localStorage.setItem('strive_conditioning_done', JSON.stringify(next)); } catch {}
  };

  // Elite gate
  if (tier !== 'elite') {
    return (
      <div style={{ minHeight: '100vh', background: T.bg, padding: '24px 16px' }}>
        <div style={{ maxWidth: 430, margin: '0 auto', textAlign: 'center' }}>
          {onBack && <button onClick={onBack} style={{ background: 'none', border: 'none', color: T.textSec, fontSize: 13, fontFamily: T.sans, cursor: 'pointer', marginBottom: 16 }}>&larr; Back</button>}
          <div style={{ fontSize: 22, fontWeight: 700, color: T.text, fontFamily: T.sans, marginBottom: 8 }}>Training Program</div>
          <div style={{ fontSize: 14, color: T.textSec, fontFamily: T.sans, marginBottom: 24 }}>6 intelligent panels that update after every analysis.</div>
          {PANELS.map(p => (
            <div key={p.id} style={{ padding: '14px 16px', borderRadius: 12, background: T.card, border: `1px solid ${T.border}`, marginBottom: 8, filter: 'blur(3px)', pointerEvents: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>{p.icon}</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: T.text, fontFamily: T.sans }}>{p.label}</span>
            </div>
          ))}
          <button onClick={onUpgrade} style={{
            marginTop: 16, width: '100%', padding: '14px 0', borderRadius: 12,
            background: `linear-gradient(135deg, ${T.gold}, #ffc040)`, color: '#000',
            border: 'none', fontSize: 15, fontWeight: 700, fontFamily: T.sans, cursor: 'pointer', minHeight: 48,
          }}>
            Unlock with Elite — $19.99/mo
          </button>
        </div>
      </div>
    );
  }

  const today = DAY_NAMES[new Date().getDay()];
  const goalLabel = athleteProfile?.goal?.startsWith('skill:')
    ? `Master: ${athleteProfile.goal.replace('skill:', '')}`
    : GOAL_LABELS[athleteProfile?.goal] || 'Not set';
  const athleteName = athleteProfile?.name || 'Your athlete';
  const todaySession = plan?.conditioning?.weeklyPlan?.find(d => d.day === today || d.day === 'Monday');

  return (
    <div style={{ minHeight: '100vh', background: T.bg, padding: '16px 16px 80px' }}>
      <div style={{ maxWidth: 430, margin: '0 auto' }}>
        {/* Header */}
        {onBack && <button onClick={onBack} style={{ background: 'none', border: 'none', color: T.textSec, fontSize: 13, fontFamily: T.sans, cursor: 'pointer', marginBottom: 8 }}>&larr; Back</button>}
        <div style={{ fontSize: 22, fontWeight: 700, color: T.text, fontFamily: T.sans }}>{athleteName}'s Training Program</div>
        <div style={{ fontSize: 12, color: T.textMuted, fontFamily: T.sans, marginTop: 4, marginBottom: 4 }}>
          Updated from {plan?.conditioning?.updatedFrom || 'latest'} analysis
        </div>
        <button onClick={onChangeGoal} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 99,
          background: T.goldBg, border: `1px solid rgba(240,160,48,0.2)`,
          color: T.gold, fontSize: 11, fontWeight: 600, fontFamily: T.sans, cursor: 'pointer', marginBottom: 16,
        }}>
          {athleteProfile?.goal?.startsWith('skill:') ? '\u2728' : '\uD83C\uDFC6'} Goal: {goalLabel}
        </button>

        {/* Loading / Error */}
        {loading && <div style={{ textAlign: 'center', padding: 40, color: T.textSec, fontFamily: T.sans }}>Building your program...</div>}
        {error && (
          <div style={{ textAlign: 'center', padding: 20 }}>
            <div style={{ color: T.red, fontSize: 14, fontFamily: T.sans, marginBottom: 12 }}>Could not load training program.</div>
            <button onClick={loadPlan} style={{ padding: '8px 20px', borderRadius: 8, background: T.card, border: `1px solid ${T.border}`, color: T.text, fontSize: 13, fontFamily: T.sans, cursor: 'pointer' }}>Try again</button>
          </div>
        )}

        {plan && !loading && <>
          {/* TODAY CARD */}
          <div style={{
            padding: 16, borderRadius: 14, marginBottom: 12,
            background: T.goldBg, border: `1.5px solid rgba(240,160,48,0.25)`,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.gold, letterSpacing: 0.5, textTransform: 'uppercase', fontFamily: T.sans, marginBottom: 6 }}>
              Today is {today}
            </div>
            {todaySession && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.text, fontFamily: T.sans }}>{todaySession.exercise.exercise}</div>
                <div style={{ fontSize: 12, color: T.textSec, fontFamily: T.sans, marginTop: 2 }}>{todaySession.exercise.sets} — {todaySession.exercise.cue}</div>
              </div>
            )}
            {plan.mental?.morningAffirmation && (
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', fontStyle: 'italic', fontFamily: T.sans, lineHeight: 1.6 }}>
                "{plan.mental.morningAffirmation}"
              </div>
            )}
          </div>

          {/* PANELS */}
          {PANELS.map(panel => {
            const isOpen = openPanel === panel.id;
            return (
              <div key={panel.id} style={{ marginBottom: 8, borderRadius: 12, overflow: 'hidden', border: `1px solid ${isOpen ? 'rgba(255,255,255,0.12)' : T.border}`, background: T.card }}>
                <button onClick={() => setOpenPanel(isOpen ? null : panel.id)} style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '14px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', minHeight: 52,
                }}>
                  <span style={{ fontSize: 18 }}>{panel.icon}</span>
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: T.text, fontFamily: T.sans }}>{panel.label}</span>
                  <span style={{ fontSize: 10, color: T.textMuted, fontFamily: T.sans }}>
                    {panelPreview(plan, panel.id, athleteProfile)}
                  </span>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                    <path d="M2 4l4 3.5L10 4" stroke={T.textMuted} strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
                <div style={{ display: 'grid', gridTemplateRows: isOpen ? '1fr' : '0fr', transition: 'grid-template-rows 0.25s ease' }}>
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ padding: '0 14px 14px' }}>
                      {panel.id === 'conditioning' && <ConditioningPanel plan={plan} completedDays={completedDays} toggleDay={toggleDay} />}
                      {panel.id === 'mental' && <MentalPanel plan={plan} />}
                      {panel.id === 'nutrition' && <NutritionPanel plan={plan} />}
                      {panel.id === 'injury' && <InjuryPanel plan={plan} />}
                      {panel.id === 'skills' && <SkillsPanel plan={plan} />}
                      {panel.id === 'goals' && <GoalsPanel plan={plan} profile={athleteProfile} />}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Storage note */}
          <div style={{ textAlign: 'center', marginTop: 16, fontSize: 10.5, color: T.textMuted, fontFamily: T.sans }}>
            Your training program is saved on this device. Account sync across devices coming soon.
          </div>
        </>}
      </div>
    </div>
  );
}

// Panel preview text
function panelPreview(plan, id, profile) {
  if (id === 'conditioning') return `${plan?.conditioning?.topDeductions?.length || 0} focus areas`;
  if (id === 'mental') return plan?.mental?.focusWord || '';
  if (id === 'nutrition') return (plan?.nutrition?.dailyTip || '').substring(0, 30) + '...';
  if (id === 'injury') { const n = plan?.injury?.flags?.length || 0; return n === 0 ? 'All clear' : `${n} signal${n > 1 ? 's' : ''}`; }
  if (id === 'skills') return plan?.skills?.focusSkills?.[0]?.name || '';
  if (id === 'goals') { const s = plan?.goals?.streakWeeks || 0; return s >= 4 ? `${s}w streak` : ''; }
  return '';
}

// ── CONDITIONING PANEL ──
function ConditioningPanel({ plan, completedDays, toggleDay }) {
  const wp = plan?.conditioning?.weeklyPlan || [];
  return (
    <div>
      {wp[0]?.isTaper && <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', fontSize: 12, color: '#fbbf24', fontFamily: T.sans, marginBottom: 10 }}>Meet this week — light sessions only</div>}
      {wp.map((d, i) => {
        const key = `${new Date().toISOString().split('T')[0]}_${d.day}`;
        const done = !!completedDays[key];
        return (
          <div key={i} style={{ padding: '10px 12px', borderRadius: 10, background: done ? 'rgba(34,197,94,0.06)' : T.cardInner, border: `1px solid ${done ? 'rgba(34,197,94,0.15)' : 'transparent'}`, marginBottom: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.textSec, fontFamily: T.sans }}>{d.day}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.text, fontFamily: T.sans, marginTop: 2 }}>{d.exercise.exercise}</div>
                <div style={{ fontSize: 11, color: T.textMuted, fontFamily: T.sans, marginTop: 2 }}>{d.exercise.sets}</div>
              </div>
              <button onClick={() => toggleDay(d.day)} style={{
                width: 32, height: 32, borderRadius: 8, border: `1.5px solid ${done ? T.green : T.border}`,
                background: done ? 'rgba(34,197,94,0.15)' : 'transparent', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: done ? T.green : T.textMuted, fontSize: 14,
              }}>{done ? '\u2713' : ''}</button>
            </div>
            <div style={{ fontSize: 11, fontStyle: 'italic', color: T.teal, fontFamily: T.sans, marginTop: 4 }}>Cue: {d.exercise.cue}</div>
            <div style={{ fontSize: 10.5, color: T.textMuted, fontFamily: T.sans, marginTop: 2 }}>Why: {d.exercise.why}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── MENTAL PANEL ──
function MentalPanel({ plan }) {
  const m = plan?.mental;
  if (!m) return <div style={{ color: T.textMuted, fontSize: 13, fontFamily: T.sans }}>Mental coaching unavailable.</div>;
  return (
    <div>
      <div style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.7)', fontStyle: 'italic', fontFamily: T.sans, lineHeight: 1.7, marginBottom: 12 }}>"{m.morningAffirmation}"</div>
      <div style={{ textAlign: 'center', padding: '12px 0', marginBottom: 10 }}>
        <div style={{ fontSize: 10, color: T.textMuted, textTransform: 'uppercase', letterSpacing: 1, fontFamily: T.sans }}>Your word this week</div>
        <div style={{ fontSize: 32, fontWeight: 800, color: T.gold, fontFamily: T.sans }}>{m.focusWord}</div>
      </div>
      {m.preMeetNote && <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)', fontSize: 13, color: '#fbbf24', fontFamily: T.sans }}>Meet prep: {m.preMeetNote}</div>}
      {m.postSlumpNote && <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.15)', fontSize: 13, color: T.blue, fontFamily: T.sans, marginTop: 8 }}>{m.postSlumpNote}</div>}
    </div>
  );
}

// ── NUTRITION PANEL ──
function NutritionPanel({ plan }) {
  const n = plan?.nutrition;
  if (!n) return <div style={{ color: T.textMuted, fontSize: 13, fontFamily: T.sans }}>Nutrition guidance unavailable.</div>;
  return (
    <div>
      <div style={{ fontSize: 13, color: T.text, fontFamily: T.sans, lineHeight: 1.6, marginBottom: 8 }}>{n.dailyTip}</div>
      <div style={{ fontSize: 12, color: T.textSec, fontFamily: T.sans, marginBottom: 10 }}>This week: {n.weeklyFocus}</div>
      {n.preMeetProtocol && (
        <div style={{ padding: '10px 12px', borderRadius: 8, background: T.goldBg, border: `1px solid rgba(240,160,48,0.15)`, marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.gold, fontFamily: T.sans, marginBottom: 4 }}>Meet Fuel Plan</div>
          <div style={{ fontSize: 12, color: T.text, fontFamily: T.sans }}>Day before: {n.preMeetProtocol.dayBefore}</div>
          <div style={{ fontSize: 12, color: T.text, fontFamily: T.sans, marginTop: 4 }}>Day of: {n.preMeetProtocol.dayOf}</div>
        </div>
      )}
      {n.disclaimer && <div style={{ fontSize: 10.5, fontStyle: 'italic', color: T.textMuted, fontFamily: T.sans }}>{n.disclaimer}</div>}
    </div>
  );
}

// ── INJURY PANEL ──
function InjuryPanel({ plan }) {
  const inj = plan?.injury;
  const flags = inj?.flags || [];
  return (
    <div>
      {inj?.underAgeNote && <div style={{ fontSize: 11, color: T.blue, fontFamily: T.sans, marginBottom: 8 }}>{inj.underAgeNote}</div>}
      {flags.length === 0 ? (
        <div style={{ fontSize: 13, color: T.green, fontFamily: T.sans }}>No injury signals this week. Keep it up.</div>
      ) : flags.map((f, i) => (
        <div key={i} style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(249,115,22,0.04)', border: '1px solid rgba(249,115,22,0.12)', marginBottom: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: f.flag === 'amber' ? T.orange : '#fbbf24', fontFamily: T.sans }}>{f.flag === 'amber' ? '\uD83D\uDD36' : '\u26A0'} {f.area.charAt(0).toUpperCase() + f.area.slice(1)}</div>
          {f.note && <div style={{ fontSize: 12, color: T.textSec, fontFamily: T.sans, marginTop: 4 }}>{f.note}</div>}
          <div style={{ fontSize: 12, color: T.text, fontFamily: T.sans, marginTop: 4 }}>Prehab: {f.prehab}</div>
          <div style={{ fontSize: 10, fontStyle: 'italic', color: T.textMuted, fontFamily: T.sans, marginTop: 6 }}>{f.disclaimer}</div>
        </div>
      ))}
    </div>
  );
}

// ── SKILLS PANEL ──
function SkillsPanel({ plan }) {
  const skills = plan?.skills?.focusSkills || [];
  return (
    <div>
      {skills.length === 0 ? (
        <div style={{ fontSize: 13, color: T.textMuted, fontFamily: T.sans }}>Upload an analysis to see skill focus areas.</div>
      ) : skills.map((s, i) => (
        <div key={i} style={{ padding: '10px 12px', borderRadius: 10, background: T.cardInner, marginBottom: 6, borderLeft: `3px solid ${i === 0 ? T.red : i === 1 ? T.orange : T.textMuted}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.text, fontFamily: T.sans }}>{s.name}</div>
            <span style={{ fontSize: 12, fontWeight: 700, color: T.red, fontFamily: T.mono }}>-{s.deductionTotal.toFixed(2)}</span>
          </div>
          <div style={{ fontSize: 12, color: T.textSec, fontFamily: T.sans, marginTop: 4 }}>Drill: {s.drill}</div>
          <div style={{ fontSize: 11, color: T.textMuted, fontFamily: T.sans, marginTop: 2 }}>{s.why}</div>
        </div>
      ))}
    </div>
  );
}

// ── GOALS PANEL ──
function GoalsPanel({ plan, profile }) {
  const g = plan?.goals;
  const scores = g?.scores || [];
  const streak = g?.streakWeeks || 0;
  const goalLabel = profile?.goal?.startsWith('skill:')
    ? `Master: ${profile.goal.replace('skill:', '')}`
    : GOAL_LABELS[profile?.goal] || 'Not set';

  // Simple sparkline SVG
  const svgW = 280, svgH = 50;
  const minS = Math.min(...scores.map(s => s.score), 10);
  const maxS = Math.max(...scores.map(s => s.score), 0);
  const range = maxS - minS || 1;
  const points = scores.map((s, i) => `${(i / Math.max(scores.length - 1, 1)) * svgW},${svgH - ((s.score - minS) / range) * svgH}`).join(' ');

  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 600, color: T.text, fontFamily: T.sans, marginBottom: 8 }}>{goalLabel}</div>
      {g?.levelUpReadiness && <div style={{ fontSize: 12, color: T.gold, fontFamily: T.sans, marginBottom: 8 }}>Level Up: {g.levelUpReadiness}</div>}
      {scores.length >= 2 && (
        <div style={{ marginBottom: 10 }}>
          <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: '100%', height: 50 }}>
            <polyline points={points} fill="none" stroke={T.gold} strokeWidth="2" strokeLinejoin="round" />
            {scores.map((s, i) => (
              <circle key={i} cx={(i / Math.max(scores.length - 1, 1)) * svgW} cy={svgH - ((s.score - minS) / range) * svgH} r="3" fill={T.gold} />
            ))}
          </svg>
        </div>
      )}
      <div style={{ fontSize: 13, color: T.textSec, fontFamily: T.sans }}>
        {streak} consecutive week{streak !== 1 ? 's' : ''} uploading{streak >= 4 ? ' — keep it going!' : '.'}
      </div>
      {streak >= 4 && <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(240,160,48,0.08)', fontSize: 13, color: T.gold, fontFamily: T.sans, textAlign: 'center' }}>\uD83D\uDD25 {streak} week streak!</div>}
    </div>
  );
}
