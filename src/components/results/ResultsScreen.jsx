import React, { useState, useCallback, useMemo } from 'react';
import { useTier } from '../../context/TierContext';

// ── Design Tokens ───────────────────────────────────────────────────────────
const T = {
  bg:          '#0d1117',
  card:        '#161b22',
  cardInner:   '#1c2230',
  border:      'rgba(255,255,255,0.07)',
  borderActive:'rgba(255,255,255,0.16)',
  gold:        '#f0a030',
  goldBg:      'rgba(240,160,48,0.08)',
  green:       '#22c55e',
  orange:      '#f97316',
  red:         '#ef4444',
  purple:      '#a855f7',
  blue:        '#60a5fa',
  text:        '#e6edf3',
  textSec:     'rgba(230,237,243,0.6)',
  textMuted:   'rgba(230,237,243,0.35)',
  mono:        "'SF Mono', 'Fira Mono', monospace",
  sans:        "'Outfit', sans-serif",
};

const GRADE_COLORS = {
  'A+': T.green, 'A': T.green, 'A-': '#4ade80',
  'B+': '#4ade80', 'B': T.blue, 'B-': T.blue,
  'C+': T.orange, 'C': T.orange, 'C-': T.orange,
  'D+': '#fb923c', 'D': T.red, 'F': T.purple,
};

const GRADE_LABELS = {
  'A+': 'Perfect', 'A': 'Excellent', 'A-': 'Great',
  'B+': 'Good+', 'B': 'Good', 'B-': 'OK',
  'C+': 'Fair+', 'C': 'Fair', 'C-': 'Needs work',
  'D+': 'Rough', 'D': 'Rough', 'F': 'Fall',
};

const EVENT_OPENERS = {
  Vault:            "Great vault — here's what the judges saw:",
  'Uneven Bars':    "Solid bars — here's what the judges saw:",
  'Balance Beam':   "She stayed on — here's the full picture:",
  'Floor Exercise': "Strong routine — here's what the judges saw:",
};

const DEG = '°';

function parseTs(ts) {
  if (typeof ts === 'number') return ts;
  if (!ts || typeof ts !== 'string') return 0;
  const parts = ts.split(':').map(Number);
  return parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0] || 0;
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════

export default function ResultsScreen({ result, profile, previousResult, onBack, onUpgrade, onJumpToTimestamp }) {
  const { tier, features } = useTier();
  const isFree = tier === 'free';

  if (!result) return <div style={{ minHeight: '100vh', background: T.bg }} />;

  // Diagnostic — remove after confirming field names
  console.log('[ResultsScreen] result:', result);

  const skills = result.gradedSkills ?? result.skills ?? result.skillBreakdown ?? [];
  const event = result.event || '';
  const finalScore = result.finalScore || 0;
  const startValue = result.startValue || 10.0;
  const totalDed = result.totalDeductions || 0;
  const prevScore = previousResult?.finalScore;
  const scoreDelta = prevScore != null && prevScore > 0 ? finalScore - prevScore : null;

  // Confidence
  const scoreDiff = result.diagnostics?.scoreBreakdown?.scoreDiff ?? 0;
  const scoreSource = result.diagnostics?.scoreBreakdown?.warning?.includes('OVERRIDE') ? 'code_override' : 'ai_holistic';
  let confidence = 'Medium';
  if (scoreSource === 'code_override') confidence = 'Lower';
  else if (scoreDiff < 0.15) confidence = 'High';

  const rangeLow = (Math.round((finalScore - 0.25) * 20) / 20).toFixed(2);
  const rangeHigh = (Math.round((finalScore + 0.25) * 20) / 20).toFixed(2);

  // Stats
  const cleanCount = skills.filter(s => (s.deduction || s.gradeDeduction || 0) === 0).length;
  const faultCount = skills.length - cleanCount;
  const bestGrade = skills.reduce((best, s) => {
    const rank = { 'A+':12,'A':11,'A-':10,'B+':9,'B':8,'B-':7,'C+':6,'C':5,'C-':4,'D+':3,'D':2,'F':1 };
    return (rank[s.grade] || 0) > (rank[best] || 0) ? s.grade : best;
  }, 'F');

  // Today's fix — highest deduction skill's drill
  const sorted = [...skills].filter(s => (s.deduction || 0) > 0).sort((a, b) => (b.deduction || 0) - (a.deduction || 0));
  const topSkill = sorted[0];
  const todaysFix = topSkill?.drillRecommendation || topSkill?.drill || null;
  const todaysFixName = topSkill?.drill || topSkill?.skillName || '';

  // Free tier deduction count
  const allDeductions = skills.flatMap(s => (s.faults || s.subFaults || []).map((f, fi) => ({ ...f, skillIdx: skills.indexOf(s), faultIdx: fi })));
  const freeLimit = 3;

  // Share handler
  const [copied, setCopied] = useState(false);
  const handleShare = useCallback(async () => {
    const token = crypto.randomUUID();
    try {
      localStorage.setItem(`strive-share-${token}`, JSON.stringify({
        score: finalScore, event, level: result.level,
        date: new Date().toISOString(),
        skills: skills.slice(0, 3).map(s => ({ name: s.skillName || s.name, deduction: s.deduction || 0 })),
      }));
      await navigator.clipboard.writeText(`${window.location.origin}/share/${token}`);
    } catch { /* fallback handled by existing ShareWithCoach */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
    try { const { trackEvent } = require('../../utils/monitoring'); trackEvent('share_coach_clicked'); } catch {}
  }, [finalScore, event, result.level, skills]);

  return (
    <div style={{ minHeight: '100vh', background: T.bg, paddingBottom: 80 }}>

      {/* ═══ 1. SCORE HEADER (sticky) ═══ */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: T.card, borderBottom: `1px solid ${T.border}`,
        padding: '16px 20px 14px',
      }}>
        {/* Back button */}
        {onBack && (
          <button onClick={onBack} style={{
            background: 'none', border: 'none', color: T.textSec, fontSize: 13,
            fontFamily: T.sans, cursor: 'pointer', padding: 0, marginBottom: 8,
          }}>&larr; Back</button>
        )}

        {/* Emotional opener */}
        <div style={{ fontSize: 14, color: T.textSec, fontFamily: T.sans, marginBottom: 6 }}>
          {EVENT_OPENERS[event] || "Here's what the judges saw:"}
        </div>

        {/* Score row */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 64, fontWeight: 700, color: '#fff', letterSpacing: -2, fontFamily: T.mono, lineHeight: 1 }}>
            {finalScore.toFixed(3)}
          </div>
          <button onClick={handleShare} style={{
            background: copied ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${copied ? 'rgba(34,197,94,0.3)' : T.border}`,
            borderRadius: 10, padding: '8px 14px', cursor: 'pointer',
            color: copied ? T.green : T.text, fontSize: 12, fontWeight: 600,
            fontFamily: T.sans, minHeight: 36,
          }}>
            {copied ? '✓ Copied' : 'Share with Coach'}
          </button>
        </div>

        {/* Confidence range — MANDATORY */}
        <div style={{ fontSize: 13, color: 'rgba(230,237,243,0.7)', fontFamily: T.sans, marginTop: 4 }}>
          range {rangeLow}–{rangeHigh} · {confidence} confidence
        </div>

        {/* Judging standard badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 5,
          padding: '3px 9px', borderRadius: 99,
          background: 'rgba(232,150,42,0.08)', border: '1px solid rgba(232,150,42,0.18)',
          fontSize: 10.5, fontWeight: 600, color: 'rgba(232,150,42,0.8)',
          letterSpacing: 0.3, fontFamily: T.sans,
        }}>
          ⚖️ Scored at State Championship competitive standard
        </div>

        {/* Stat bar */}
        <div style={{ display: 'flex', gap: 12, marginTop: 10, fontSize: 12, color: T.textSec, fontFamily: T.mono }}>
          <span>SV {startValue.toFixed(1)}</span>
          <span>Ded -{totalDed.toFixed(2)}</span>
          {scoreDelta !== null && Math.abs(scoreDelta) > 0.001 && (
            <span style={{ color: scoreDelta >= 0 ? T.green : T.red }}>
              {scoreDelta >= 0 ? '▲' : '▼'}{Math.abs(scoreDelta).toFixed(2)} vs last
            </span>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 540, margin: '0 auto' }}>

        {/* ═══ 2. TODAY'S FIX ═══ */}
        {todaysFix && (
          <div style={{
            margin: '16px 16px 0', padding: 16, borderRadius: 14,
            background: T.goldBg, border: '1px solid rgba(240,160,48,0.18)',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.gold, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6, fontFamily: T.sans }}>
              ⭐ TODAY'S FIX
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text, fontFamily: T.sans, marginBottom: 4 }}>
              {todaysFixName}
            </div>
            <div style={{ fontSize: 13, color: T.textSec, fontFamily: T.sans, lineHeight: 1.5 }}>
              {todaysFix}
            </div>
          </div>
        )}

        {/* ═══ 3. SKILL SUMMARY BAR ═══ */}
        <div style={{
          display: 'flex', margin: '12px 16px 0',
          background: T.bg, borderRadius: 12,
          border: `1px solid ${T.border}`, overflow: 'hidden',
        }}>
          {[
            { label: 'Skills', val: skills.length, color: T.gold },
            { label: 'Clean', val: cleanCount, color: T.green },
            { label: 'Faults', val: faultCount, color: T.orange },
            { label: 'Best', val: bestGrade, color: GRADE_COLORS[bestGrade] || T.gold },
          ].map((s, i) => (
            <div key={s.label} style={{
              flex: 1, padding: '10px 4px', textAlign: 'center',
              borderRight: i < 3 ? `1px solid ${T.border}` : 'none',
            }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: s.color, fontFamily: T.mono }}>{s.val}</div>
              <div style={{ fontSize: 9, color: T.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: T.sans }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* ═══ 4. SKILL LIST ═══ */}
        <div style={{ margin: '12px 16px 0' }}>
          {skills.map((skill, idx) => (
            <SkillCard
              key={skill.id || idx}
              skill={skill}
              index={idx}
              isFree={isFree}
              freeDeductionLimit={freeLimit}
              globalDeductionIndex={allDeductions.filter(d => skills.indexOf(skills.find(s => s === skills[d.skillIdx])) < idx).length}
              onJumpToTimestamp={onJumpToTimestamp}
              onUpgrade={onUpgrade}
            />
          ))}
        </div>

        {/* ═══ 5. FREE TIER UPSELL (if deductions hidden) ═══ */}
        {isFree && allDeductions.length > freeLimit && (
          <div style={{
            margin: '16px 16px 0', padding: 20, borderRadius: 14,
            background: 'rgba(240,160,48,0.06)', border: '1px solid rgba(240,160,48,0.2)',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.text, fontFamily: T.sans, marginBottom: 6 }}>
              {allDeductions.length - freeLimit} more deductions found
            </div>
            <div style={{ fontSize: 13, color: T.textSec, fontFamily: T.sans, marginBottom: 14 }}>
              Upgrade to see what's holding back the score
            </div>
            <button onClick={onUpgrade} style={{
              background: `linear-gradient(135deg, ${T.gold}, #ffc040)`,
              color: '#000', border: 'none', borderRadius: 12,
              padding: '12px 28px', fontSize: 14, fontWeight: 700,
              fontFamily: T.sans, cursor: 'pointer', minHeight: 44,
            }}>
              Unlock Full Analysis &rarr;
            </button>
          </div>
        )}

        {/* ═══ 6. COMPLIANCE DISCLAIMER ═══ */}
        <div style={{
          margin: '24px 16px 0', padding: '12px 0', textAlign: 'center',
          fontSize: 10.5, color: 'rgba(230,237,243,0.28)', fontFamily: T.sans, lineHeight: 1.5,
        }}>
          &#9888; AI scoring estimates are typically within 0.15&ndash;0.25 of judge scores.
          Camera angle and video quality affect accuracy. Results are for training only.
        </div>

      </div>
    </div>
  );
}


// ═════════════════════════════════════════════════════════════════════════════
// SKILL CARD
// ═════════════════════════════════════════════════════════════════════════════

function SkillCard({ skill, index, isFree, freeDeductionLimit, globalDeductionIndex, onJumpToTimestamp, onUpgrade }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('what');

  const name = skill.skillName || skill.name || skill.skill || 'Skill';
  const grade = skill.grade || 'B';
  const gradeColor = GRADE_COLORS[grade] || T.blue;
  const gradeLabel = GRADE_LABELS[grade] || '';
  const ts = skill.timestamp || skill.time || '';
  const category = (skill.category || skill.type || 'acro').toUpperCase();
  const ded = skill.deduction || skill.gradeDeduction || 0;
  const isClean = ded === 0;
  const faults = skill.faults || skill.subFaults || [];
  const snippet = skill.fault || skill.reason || (isClean ? (skill.strength || 'Clean execution') : '');

  // Bio angles
  const bio = skill.bodyMechanics || {};
  const bioRaw = skill.biomechanics?.peak_joint_angles || {};

  // Injury
  const injury = skill.injuryRisk || skill.physicalRisk || null;
  const injuryLevel = skill.injuryLevel || 'low';

  // Drill
  const drill = skill.drillRecommendation || skill.drill || null;
  const drillReps = skill.drillSetsReps || '';

  // Strength / fault / correct form
  const strength = skill.strength || skill.strengthNote || null;
  const faultText = skill.fault || skill.reason || null;
  const correctForm = skill.correctForm || null;
  const gainIfFixed = skill.gainIfFixed || ded;

  const TABS = [
    { id: 'what', label: 'What Happened' },
    { id: 'deds', label: 'Deductions' },
    { id: 'bio', label: 'Body Angles' },
    { id: 'injury', label: 'Injury' },
    { id: 'video', label: 'Video' },
    { id: 'fix', label: "Today's Fix" },
  ];

  return (
    <div style={{
      background: T.card, borderRadius: 14,
      border: `1px solid ${open ? T.borderActive : T.border}`,
      marginBottom: 8, overflow: 'hidden',
      transition: 'border-color 0.15s',
    }}>
      {/* Collapsed row */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 14px', background: 'none', border: 'none',
          cursor: 'pointer', textAlign: 'left',
        }}
        aria-expanded={open}
      >
        {/* Grade circle */}
        <div style={{
          width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
          border: `2.5px solid ${gradeColor}`,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: gradeColor, lineHeight: 1, fontFamily: T.mono }}>{grade}</span>
          <span style={{ fontSize: 7, color: gradeColor, opacity: 0.7, lineHeight: 1, fontFamily: T.sans }}>{gradeLabel}</span>
        </div>

        {/* Name + meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: T.text, fontFamily: T.sans, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {name}
            </span>
            <span style={{
              fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
              background: category === 'DANCE' || category === 'TURN' || category === 'LEAP' ? 'rgba(96,165,250,0.12)' : 'rgba(255,255,255,0.04)',
              color: category === 'DANCE' || category === 'TURN' || category === 'LEAP' ? T.blue : T.textMuted,
              textTransform: 'uppercase', letterSpacing: 0.5,
            }}>{category === 'DANCE' || category === 'TURN' || category === 'LEAP' ? 'DANCE' : 'ACRO'}</span>
          </div>
          <div style={{ fontSize: 11, color: T.textMuted, fontFamily: T.sans, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ts && <span style={{ fontFamily: T.mono, marginRight: 6 }}>{ts}</span>}
            {snippet}
          </div>
        </div>

        {/* Deduction or clean pill */}
        {isClean ? (
          <span style={{
            fontSize: 11, fontWeight: 700, color: T.green, background: 'rgba(34,197,94,0.1)',
            padding: '4px 10px', borderRadius: 8, fontFamily: T.sans, flexShrink: 0,
          }}>&check; Clean</span>
        ) : (
          <span style={{
            fontSize: 14, fontWeight: 700, fontFamily: T.mono, flexShrink: 0,
            color: ded >= 0.30 ? T.red : ded >= 0.10 ? T.orange : '#fbbf24',
          }}>-{ded.toFixed(2)}</span>
        )}

        {/* Chevron */}
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{
          flexShrink: 0, transition: 'transform 0.2s',
          transform: open ? 'rotate(180deg)' : 'rotate(0)',
        }}>
          <path d="M2 4l4 3.5L10 4" stroke={T.textMuted} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      {/* Expandable body — CSS grid trick for smooth animation */}
      <div style={{
        display: 'grid',
        gridTemplateRows: open ? '1fr' : '0fr',
        transition: 'grid-template-rows 0.25s ease',
      }}>
        <div style={{ overflow: 'hidden' }}>
          <div style={{ padding: '0 14px 14px' }}>

            {/* Tab bar */}
            <div style={{
              display: 'flex', gap: 0, borderRadius: 10, overflow: 'hidden',
              border: `1px solid ${T.border}`, marginBottom: 12,
            }}>
              {TABS.map((t, i) => (
                <button key={t.id} onClick={() => setTab(t.id)} style={{
                  flex: 1, padding: '8px 2px', fontSize: 9.5, fontWeight: 600,
                  fontFamily: T.sans, cursor: 'pointer', border: 'none', minHeight: 44,
                  background: tab === t.id ? 'rgba(240,160,48,0.1)' : 'transparent',
                  color: tab === t.id ? T.gold : T.textMuted,
                  borderRight: i < TABS.length - 1 ? `1px solid ${T.border}` : 'none',
                }}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* TAB: What Happened */}
            {tab === 'what' && (
              <div>
                {faultText && (
                  <div style={{ borderLeft: `3px solid ${T.orange}`, padding: '8px 12px', marginBottom: 8, background: 'rgba(249,115,22,0.04)', borderRadius: '0 8px 8px 0' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: T.orange, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, fontFamily: T.sans }}>Fault</div>
                    <div style={{ fontSize: 13, color: T.text, fontFamily: T.sans, lineHeight: 1.5 }}>{faultText}</div>
                  </div>
                )}
                {strength && (
                  <div style={{ borderLeft: `3px solid ${T.green}`, padding: '8px 12px', marginBottom: 8, background: 'rgba(34,197,94,0.04)', borderRadius: '0 8px 8px 0' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: T.green, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, fontFamily: T.sans }}>Strength</div>
                    <div style={{ fontSize: 13, color: T.text, fontFamily: T.sans, lineHeight: 1.5 }}>{strength}</div>
                  </div>
                )}
                {correctForm && (
                  <div style={{ borderLeft: `3px solid ${T.blue}`, padding: '8px 12px', marginBottom: 8, background: 'rgba(96,165,250,0.04)', borderRadius: '0 8px 8px 0' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: T.blue, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, fontFamily: T.sans }}>Correct Form</div>
                    <div style={{ fontSize: 13, color: T.text, fontFamily: T.sans, lineHeight: 1.5 }}>{correctForm}</div>
                  </div>
                )}
                {gainIfFixed > 0 && (
                  <div style={{ marginTop: 8, padding: '10px 12px', background: 'rgba(34,197,94,0.06)', borderRadius: 10 }}>
                    <div style={{ fontSize: 12, color: T.green, fontWeight: 600, fontFamily: T.sans, marginBottom: 4 }}>
                      Fix this skill and gain +{gainIfFixed.toFixed(2)}
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(100, (gainIfFixed / 0.50) * 100)}%`, background: T.green, borderRadius: 3 }} />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB: Deductions */}
            {tab === 'deds' && (
              <div>
                {faults.length === 0 ? (
                  <div style={{ fontSize: 13, color: T.green, fontFamily: T.sans, padding: 8 }}>No deductions &mdash; clean skill!</div>
                ) : faults.map((f, fi) => {
                  const dedVal = f.deduction || f.pointValue || 0;
                  const dotColor = dedVal >= 0.30 ? T.red : dedVal >= 0.10 ? T.orange : '#fbbf24';
                  const blurred = isFree && (globalDeductionIndex + fi) >= freeDeductionLimit;
                  return (
                    <div key={fi} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0',
                      borderBottom: fi < faults.length - 1 ? `1px solid ${T.border}` : 'none',
                      filter: blurred ? 'blur(4px)' : 'none',
                      pointerEvents: blurred ? 'none' : 'auto',
                    }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                      <div style={{ flex: 1, fontSize: 13, color: T.text, fontFamily: T.sans }}>{f.fault || f.description || ''}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: dotColor, fontFamily: T.mono, flexShrink: 0 }}>-{dedVal.toFixed(2)}</div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* TAB: Body Angles */}
            {tab === 'bio' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  { joint: 'Hips', actual: bioRaw.hips || bio.hipAlignment, ideal: '180' },
                  { joint: 'Knees', actual: bioRaw.knees || bio.kneeAngle, ideal: '180' },
                  { joint: 'Shoulders', actual: bioRaw.shoulders || bio.shoulderPosition, ideal: '180' },
                ].map(a => {
                  const val = typeof a.actual === 'number' ? a.actual : parseInt(String(a.actual), 10);
                  const ok = !isNaN(val) && Math.abs(val - parseInt(a.ideal, 10)) < 15;
                  return (
                    <div key={a.joint} style={{ padding: 10, background: T.cardInner, borderRadius: 10 }}>
                      <div style={{ fontSize: 10, color: T.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: T.sans, marginBottom: 4 }}>{a.joint}</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: ok ? T.green : T.orange, fontFamily: T.mono }}>
                        {!isNaN(val) ? `${val}${DEG}` : '—'}
                      </div>
                      <div style={{ fontSize: 10, color: T.textMuted, fontFamily: T.sans }}>Ideal: {a.ideal}{DEG}</div>
                      <div style={{ fontSize: 10, color: ok ? T.green : T.orange, fontWeight: 600, fontFamily: T.sans, marginTop: 2 }}>
                        {!isNaN(val) ? (ok ? 'On target' : 'Needs work') : '—'}
                      </div>
                    </div>
                  );
                })}
                {bio.bodyLineScore != null && (
                  <div style={{ padding: 10, background: T.cardInner, borderRadius: 10 }}>
                    <div style={{ fontSize: 10, color: T.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: T.sans, marginBottom: 4 }}>Body Line</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: T.text, fontFamily: T.mono }}>{bio.bodyLineScore}/10</div>
                    <div style={{ fontSize: 10, color: T.textMuted, fontFamily: T.sans }}>Efficiency: {bio.efficiency || '—'}/10</div>
                  </div>
                )}
              </div>
            )}

            {/* TAB: Injury */}
            {tab === 'injury' && (
              <div>
                {injury ? (
                  <div style={{ padding: 12, background: 'rgba(249,115,22,0.06)', borderRadius: 10, border: '1px solid rgba(249,115,22,0.12)' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: T.orange, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, fontFamily: T.sans }}>
                      {injuryLevel} risk {skill.injuryBodyPart ? `— ${skill.injuryBodyPart}` : ''}
                    </div>
                    <div style={{ fontSize: 13, color: T.text, fontFamily: T.sans, lineHeight: 1.5 }}>{injury}</div>
                    {skill.injuryNote && (
                      <div style={{ fontSize: 12, color: T.textSec, fontFamily: T.sans, marginTop: 6 }}>Prevention: {skill.injuryNote}</div>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: T.green, fontFamily: T.sans, padding: 8 }}>No injury concerns on this skill.</div>
                )}
              </div>
            )}

            {/* TAB: Video */}
            {tab === 'video' && (
              <div style={{ textAlign: 'center', padding: 12 }}>
                <div style={{
                  width: '100%', height: 120, borderRadius: 10, background: T.cardInner,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10,
                }}>
                  <span style={{ fontSize: 32, opacity: 0.3 }}>&#9654;</span>
                </div>
                <button onClick={() => onJumpToTimestamp?.(parseTs(ts))} style={{
                  background: T.goldBg, border: `1px solid rgba(240,160,48,0.2)`,
                  borderRadius: 10, padding: '10px 20px', cursor: 'pointer',
                  color: T.gold, fontSize: 13, fontWeight: 600, fontFamily: T.sans, minHeight: 44,
                }}>
                  Jump to {ts || '0:00'}
                </button>
              </div>
            )}

            {/* TAB: Today's Fix */}
            {tab === 'fix' && (
              <div>
                {drill ? (
                  <div style={{ padding: 12, background: T.goldBg, borderRadius: 10, border: '1px solid rgba(240,160,48,0.12)' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T.gold, fontFamily: T.sans, marginBottom: 4 }}>
                      {skill.drill || name}
                    </div>
                    <div style={{ fontSize: 13, color: T.text, fontFamily: T.sans, lineHeight: 1.5 }}>{drill}</div>
                    {drillReps && <div style={{ fontSize: 12, color: T.textSec, fontFamily: T.sans, marginTop: 6 }}>{drillReps}</div>}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: T.textMuted, fontFamily: T.sans, padding: 8 }}>No specific drill for this skill.</div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
