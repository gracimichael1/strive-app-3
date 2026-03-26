import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useTier } from '../../context/TierContext';
import { canSeeJudgeNarrative, canSeeDrills, canSeeBiomechanics, canSeeInjuryAwareness, canSeeSkeletonOverlay, canUseSlowMotion, canSeeLevelUp, getDeductionBlurThreshold } from '../../engine/tierGates';
import LockedFeature from '../LockedFeature';
import ScoreCardExport from '../ui/ScoreCardExport';
import ScoringCaveatBanner from '../ui/ScoringCaveatBanner';
import JudgeScoreInput from '../ui/JudgeScoreInput';

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

export default function ResultsScreen({ result, profile, previousResult, onBack, onUpgrade, onTraining, onJumpToTimestamp, videoUrl }) {
  const { tier, features } = useTier();
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [resultsTab, setResultsTab] = useState('analysis');
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

      {/* ═══ PRIMARY ATHLETE BANNER ═══ */}
      <PrimaryAthleteBanner confidence={result?.primaryAthleteConfidence} />

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

        {/* ═══ JUDGE'S OVERALL READ (Competitive+) ═══ */}
        {(result.overallAssessment || result.whyThisScore) && !canSeeJudgeNarrative(tier) && (
          <div style={{ margin: '14px 16px 0', padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.03)' }}>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', fontFamily: T.sans, lineHeight: 1.6 }}>
              {(result.overallAssessment || result.whyThisScore || '').split('.').slice(0, 2).join('.') + '.'}
            </div>
          </div>
        )}
        {(result.overallAssessment || result.whyThisScore) && canSeeJudgeNarrative(tier) && (
          <div style={{
            margin: '14px 16px 0', padding: '13px 14px 13px 16px', borderRadius: 10,
            background: 'rgba(255,255,255,0.03)', borderLeft: '3px solid rgba(232,150,42,0.5)',
          }}>
            <div style={{
              fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
              color: 'rgba(232,150,42,0.6)', marginBottom: 7, fontFamily: T.sans,
            }}>
              Judge's overall read
            </div>
            <div style={{
              fontSize: 13.5, color: 'rgba(255,255,255,0.72)', lineHeight: 1.75,
              fontStyle: 'italic', fontFamily: T.sans,
            }}>
              "{result.overallAssessment || result.whyThisScore}"
            </div>
          </div>
        )}

        {/* ═══ YOUR TRAINING CTA (elite only) ═══ */}
        {onTraining && tier === 'elite' && (
          <button onClick={onTraining} style={{
            margin: '12px 16px 0', width: 'calc(100% - 32px)', padding: '11px 16px', borderRadius: 10,
            background: 'rgba(45,212,191,0.06)', border: '1px solid rgba(45,212,191,0.2)',
            color: '#2dd4bf', fontSize: 13, fontWeight: 600, fontFamily: T.sans,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            &#10024; Your Training Program &rarr;
          </button>
        )}

        {/* ═══ 2. TODAY'S FIX (Competitive+) ═══ */}
        {todaysFix && !canSeeDrills(tier) && (
          <LockedFeature feature="drills" tier={tier} onUpgrade={onUpgrade}>
            <div style={{ margin: '16px 16px 0', padding: 16, borderRadius: 14, background: T.goldBg }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.gold }}>TODAY'S FIX</div>
              <div style={{ fontSize: 14, color: T.text, marginTop: 4 }}>{todaysFixName}</div>
            </div>
          </LockedFeature>
        )}
        {todaysFix && canSeeDrills(tier) && (
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

        {/* Scoring Caveat Banner — Beam/Vault/Floor only */}
        <ScoringCaveatBanner event={result?.event || result?.summary?.event} />

        {/* ═══ JUDGE SCORE INPUT — all tiers ═══ */}
        <JudgeScoreInput result={result} profile={profile} />

        {/* ═══ RESULTS TAB BAR (Analysis / Level Up) ═══ */}
        <div style={{ display: 'flex', gap: 0, margin: '14px 16px 0', borderRadius: 10, overflow: 'hidden', border: `1px solid ${T.border}` }}>
          {[{ id: 'analysis', label: 'Analysis' }, { id: 'levelup', label: 'Level Up' }].map(t => (
            <button key={t.id} onClick={() => setResultsTab(t.id)} style={{
              flex: 1, padding: '10px 0', fontSize: 13, fontWeight: 600,
              fontFamily: T.sans, cursor: 'pointer', border: 'none',
              background: resultsTab === t.id ? 'rgba(240,160,48,0.12)' : T.bg,
              color: resultsTab === t.id ? T.gold : T.textMuted,
              transition: 'all 0.15s',
            }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ═══ LEVEL UP TAB CONTENT ═══ */}
        {resultsTab === 'levelup' && (
          canSeeLevelUp(tier)
            ? <LevelUpPanel result={result} isFree={false} onUpgrade={onUpgrade} />
            : <div style={{ margin: '16px 16px 0' }}><LockedFeature feature="levelUp" tier={tier} onUpgrade={onUpgrade}><div style={{ height: 160, background: 'rgba(255,255,255,0.02)', borderRadius: 8 }} /></LockedFeature></div>
        )}

        {/* ═══ ANALYSIS TAB CONTENT ═══ */}
        {resultsTab === 'analysis' && <>

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
              tier={tier}
              freeDeductionLimit={freeLimit}
              globalDeductionIndex={allDeductions.filter(d => skills.indexOf(skills.find(s => s === skills[d.skillIdx])) < idx).length}
              onJumpToTimestamp={onJumpToTimestamp}
              onUpgrade={onUpgrade}
              videoUrl={videoUrl}
              showSkeleton={showSkeleton}
              setShowSkeleton={setShowSkeleton}
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

        </>}

        {/* ═══ BIOMECHANICAL ANALYSIS (Elite only) ═══ */}
        {tier === 'elite' && (
          <div style={{
            margin: '16px 16px 0', padding: 16, borderRadius: 14,
            background: '#0f1623', border: '1px solid rgba(232,150,42,0.12)',
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#e8962a', fontFamily: "'Outfit', sans-serif", marginBottom: 10 }}>
              Biomechanical Analysis
            </div>
            {(() => {
              const bs = result?.biomechanicalSignals;
              const hasFlags = bs && (bs.hyperextension || bs.hard_landing || bs.asymmetry_side || (bs.fall_count && bs.fall_count > 0) || bs.knee_valgus || bs.back_arch);
              if (!hasFlags) {
                return <div style={{ fontSize: 12, color: '#22c55e', fontFamily: "'Space Mono', monospace" }}>✓ No biomechanical flags detected</div>;
              }
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {bs.hyperextension && <div style={{ fontSize: 12, color: '#fbbf24', fontFamily: "'Space Mono', monospace" }}>⚠️ Hyperextension detected</div>}
                  {bs.hard_landing && <div style={{ fontSize: 12, color: '#fbbf24', fontFamily: "'Space Mono', monospace" }}>⚠️ Hard landing detected</div>}
                  {bs.asymmetry_side && <div style={{ fontSize: 12, color: '#fbbf24', fontFamily: "'Space Mono', monospace" }}>⚠️ Movement asymmetry: {bs.asymmetry_side}</div>}
                  {bs.fall_count > 0 && <div style={{ fontSize: 12, color: '#fbbf24', fontFamily: "'Space Mono', monospace" }}>⚠️ Falls recorded: {bs.fall_count}</div>}
                  {bs.knee_valgus && <div style={{ fontSize: 12, color: '#fbbf24', fontFamily: "'Space Mono', monospace" }}>⚠️ Knee valgus detected</div>}
                  {bs.back_arch && <div style={{ fontSize: 12, color: '#fbbf24', fontFamily: "'Space Mono', monospace" }}>⚠️ Back arch detected</div>}
                </div>
              );
            })()}
            {result?.biomechanics_raw ? (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(230,237,243,0.5)', fontFamily: "'Outfit', sans-serif", marginBottom: 6 }}>Raw Measurements</div>
                {result.biomechanics_raw.map((m, i) => (
                  <div key={i} style={{ fontSize: 11, color: '#e2e8f0', fontFamily: "'Space Mono', monospace", lineHeight: 1.8 }}>
                    {m.skill_name}: knee {m.knee_angle_left != null ? `${m.knee_angle_left}°/${m.knee_angle_right}°` : 'Pending'} · hip {m.hip_angle_left != null ? `${m.hip_angle_left}°/${m.hip_angle_right}°` : 'Pending'} · spine {m.spine_angle != null ? `${m.spine_angle}°` : 'Pending'}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 11, color: 'rgba(230,237,243,0.35)', fontFamily: "'Space Mono', monospace" }}>Raw measurements: Pending video analysis</div>
              </div>
            )}
            <div style={{ fontSize: 10, color: 'rgba(230,237,243,0.25)', fontFamily: "'Outfit', sans-serif", marginTop: 8 }}>
              Biomechanical data is used for personalized training recommendations and long-term athletic development tracking.
            </div>
          </div>
        )}

        {/* ═══ SCORE CARD EXPORT + JUDGING BADGE (moved from header) ═══ */}
        <div style={{ margin: '20px 16px 0' }}>
          <ScoreCardExport result={result} athleteName={profile?.name || 'Athlete'} tier={tier} />
          <div style={{
            display: 'flex', justifyContent: 'center', marginTop: 10,
          }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '3px 9px', borderRadius: 99,
              background: 'rgba(232,150,42,0.08)', border: '1px solid rgba(232,150,42,0.18)',
              fontSize: 10.5, fontWeight: 600, color: 'rgba(232,150,42,0.8)',
              letterSpacing: 0.3, fontFamily: T.sans,
            }}>
              ⚖️ Scored at State Championship competitive standard
            </span>
          </div>
        </div>

        {/* ═══ 6. COMPLIANCE DISCLAIMER ═══ */}
        <div style={{
          margin: '24px 16px 0', padding: '12px 0', textAlign: 'center',
          fontSize: 10.5, color: 'rgba(230,237,243,0.28)', fontFamily: T.sans, lineHeight: 1.5,
        }}>
          &#9888; AI scoring estimates are typically within 0.15&ndash;0.25 of judge scores.
          Camera angle and video quality affect accuracy. Results are for training only.
          <br /><br />
          Skill identification is AI-estimated from video and may occasionally mislabel
          similar-looking skills (e.g. tap swing vs kip). Deduction amounts are more
          reliable than skill names. Tap any skill card to review — use 'Flag skill'
          to help improve accuracy.
        </div>

        {/* ═══ DATA EXPORT ═══ */}
        <div style={{ margin: '16px 16px 24px', textAlign: 'center' }}>
          <button
            onClick={() => {
              try {
                const exportData = {
                  exportDate: new Date().toISOString(),
                  athlete: { level: profile?.level || '', events: profile?.primaryEvents || [] },
                  analyses: JSON.parse(localStorage.getItem('strive_recent_analyses') || '[]'),
                  judgeScores: JSON.parse(localStorage.getItem('strive_judge_scores') || '[]'),
                  biomechanics: [],
                  flaggedSkills: JSON.parse(localStorage.getItem('strive_skill_corrections') || '[]'),
                  skillConfirmations: JSON.parse(localStorage.getItem('strive_skill_confirmations') || '[]'),
                };
                const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `strive_export_${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              } catch (e) { console.warn('[export] Failed:', e); }
            }}
            style={{
              background: 'none', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8, padding: '8px 16px', cursor: 'pointer',
              fontSize: 11, color: 'rgba(230,237,243,0.35)', fontFamily: "'Outfit', sans-serif",
            }}
          >
            Export My Data
          </button>
        </div>

      </div>
    </div>
  );
}


// ═════════════════════════════════════════════════════════════════════════════
// SKILL CARD
// ═════════════════════════════════════════════════════════════════════════════

// ═════════════════════════════════════════════════════════════════════════════
// LEVEL UP PANEL
// ═════════════════════════════════════════════════════════════════════════════

function LevelUpPanel({ result, isFree, onUpgrade }) {
  const lpa = result?.levelProgressionAnalysis;
  const [expandedGap, setExpandedGap] = useState(null);

  // State A: no analysis or no progression data
  if (!lpa) {
    const level = result?.level || '';
    const isUpperLevel = /level\s*(8|9|10)/i.test(level) || /elite/i.test(level);
    return (
      <div style={{ margin: '16px 16px 0', padding: 20, borderRadius: 12, background: T.card, textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: T.gold, fontFamily: T.sans }}>
          {isUpperLevel
            ? `Level Up roadmap for ${level} is coming soon.`
            : 'Run your first analysis to see your Level Up roadmap.'}
        </div>
      </div>
    );
  }

  const readinessColors = {
    'Ready now': T.green,
    'Close (2-4 weeks)': '#fbbf24',
    'Working toward (1-2 months)': T.gold,
    'Long term goal': T.blue,
  };
  const readinessColor = readinessColors[lpa.overallReadiness] || T.gold;
  const gaps = lpa.gaps || [];
  const strengths = lpa.strengthsCarryingOver || [];

  return (
    <div style={{ margin: '16px 16px 0' }}>
      {/* 1. READINESS BADGE */}
      <div style={{
        padding: '14px 16px', borderRadius: 12, textAlign: 'center', marginBottom: 12,
        background: `${readinessColor}15`, border: `1.5px solid ${readinessColor}40`,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: readinessColor, letterSpacing: 0.5, textTransform: 'uppercase', fontFamily: T.sans, marginBottom: 4 }}>
          Readiness for {lpa.targetLevel}
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, color: readinessColor, fontFamily: T.sans }}>
          {lpa.overallReadiness}
        </div>
      </div>

      {/* Verification disclaimer for upper levels */}
      {(lpa.targetLevel === 'Level 9' || lpa.targetLevel === 'Level 10' ||
        lpa.targetLevel === 'Xcel Diamond' || lpa.targetLevel === 'Xcel Sapphire') && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 10,
          background: 'rgba(251,191,36,0.06)',
          border: '1px solid rgba(251,191,36,0.2)',
          fontSize: 11, color: 'rgba(230,237,243,0.6)',
          lineHeight: 1.5, fontFamily: "'Outfit', sans-serif",
        }}>
          ⚡ Level Up requirements for this division are being verified against the
          official USAG Code of Points. Discuss with your coach before making
          training decisions based on these projections.
        </div>
      )}

      {/* 2. SCORE PROJECTION */}
      {typeof lpa.projectedScoreAtNextLevel === 'number' && lpa.projectedScoreAtNextLevel > 0 && (
        <div style={{
          padding: '12px 16px', borderRadius: 10, textAlign: 'center', marginBottom: 12,
          background: 'rgba(240,160,48,0.06)', border: `1px solid rgba(240,160,48,0.15)`,
        }}>
          <div style={{ fontSize: 12, color: T.textSec, fontFamily: T.sans, marginBottom: 4 }}>
            Fix your top gaps → estimated score at {lpa.targetLevel}:
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: T.gold, fontFamily: T.mono }}>
            {lpa.projectedScoreAtNextLevel.toFixed(3)}
          </div>
        </div>
      )}

      {/* 3. GAP CARDS */}
      {gaps.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, letterSpacing: 0.5, textTransform: 'uppercase', fontFamily: T.sans, marginBottom: 8 }}>
            Gaps to close ({gaps.length})
          </div>
          {gaps.map((gap, i) => {
            const isExpanded = expandedGap === i;
            const blurred = isFree && i >= 1;
            const priorityColor = gap.priority === 1 ? T.red : gap.priority <= 3 ? '#fbbf24' : T.textMuted;

            return (
              <div key={i} style={{
                marginBottom: 6, borderRadius: 10, overflow: 'hidden',
                border: `1px solid ${isExpanded ? T.borderActive : T.border}`,
                background: T.card,
                filter: blurred ? 'blur(4px)' : 'none',
                pointerEvents: blurred ? 'none' : 'auto',
              }}>
                <button onClick={() => setExpandedGap(isExpanded ? null : i)} style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '12px 14px', background: 'none', border: 'none',
                  borderLeft: `3px solid ${priorityColor}`, cursor: 'pointer', textAlign: 'left',
                }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: priorityColor, fontFamily: T.mono, flexShrink: 0 }}>
                    #{gap.priority}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.text, fontFamily: T.sans }}>{gap.gapName}</div>
                    <div style={{ fontSize: 11, color: T.textMuted, fontFamily: T.sans, marginTop: 2 }}>{gap.impactAtNextLevel}</div>
                  </div>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                    <path d="M2 4l4 3.5L10 4" stroke={T.textMuted} strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
                <div style={{ display: 'grid', gridTemplateRows: isExpanded ? '1fr' : '0fr', transition: 'grid-template-rows 0.25s ease' }}>
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ padding: '0 14px 14px' }}>
                      <div style={{ borderLeft: `3px solid ${T.orange}`, padding: '8px 12px', marginBottom: 8, background: 'rgba(249,115,22,0.04)', borderRadius: '0 8px 8px 0' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: T.orange, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, fontFamily: T.sans }}>Current</div>
                        <div style={{ fontSize: 13, color: T.text, fontFamily: T.sans, lineHeight: 1.5 }}>{gap.currentState}</div>
                      </div>
                      <div style={{ borderLeft: `3px solid ${T.blue}`, padding: '8px 12px', marginBottom: 8, background: 'rgba(96,165,250,0.04)', borderRadius: '0 8px 8px 0' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: T.blue, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, fontFamily: T.sans }}>Required at {lpa.targetLevel}</div>
                        <div style={{ fontSize: 13, color: T.text, fontFamily: T.sans, lineHeight: 1.5 }}>{gap.nextLevelRequirement}</div>
                      </div>
                      {gap.drill && (
                        <div style={{ borderLeft: `3px solid ${T.gold}`, padding: '8px 12px', marginBottom: 8, background: T.goldBg, borderRadius: '0 8px 8px 0' }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: T.gold, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, fontFamily: T.sans }}>Drill</div>
                          <div style={{ fontSize: 13, color: T.text, fontFamily: T.sans, lineHeight: 1.5 }}>{gap.drill}</div>
                        </div>
                      )}
                      {gap.timelineEstimate && (
                        <div style={{ fontSize: 12, color: T.textMuted, fontFamily: T.sans, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span>⏱</span> {gap.timelineEstimate}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Free tier upsell */}
          {isFree && gaps.length > 1 && (
            <div style={{
              padding: '14px 16px', borderRadius: 10, textAlign: 'center', marginTop: 8,
              background: 'rgba(240,160,48,0.06)', border: '1px solid rgba(240,160,48,0.2)',
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.text, fontFamily: T.sans, marginBottom: 6 }}>
                {gaps.length - 1} more gap{gaps.length - 1 > 1 ? 's' : ''} holding back the score
              </div>
              <button onClick={onUpgrade} style={{
                background: `linear-gradient(135deg, ${T.gold}, #ffc040)`, color: '#000',
                border: 'none', borderRadius: 10, padding: '10px 24px', fontSize: 13,
                fontWeight: 700, fontFamily: T.sans, cursor: 'pointer', minHeight: 44,
              }}>
                Unlock Full Level Up Analysis →
              </button>
            </div>
          )}
        </div>
      )}

      {/* 4. STRENGTHS */}
      {strengths.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, letterSpacing: 0.5, textTransform: 'uppercase', fontFamily: T.sans, marginBottom: 8 }}>
            Already meeting {lpa.targetLevel} standard
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {strengths.map((s, i) => (
              <span key={i} style={{
                padding: '5px 12px', borderRadius: 99, fontSize: 12, fontWeight: 600,
                background: 'rgba(34,197,94,0.1)', color: T.green, fontFamily: T.sans,
                border: '1px solid rgba(34,197,94,0.2)',
              }}>
                {s}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


function PrimaryAthleteBanner({ confidence }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || !confidence || confidence === 'high') return null;
  return (
    <div style={{
      margin: '0 16px 0', padding: '12px 16px', borderRadius: 10,
      background: 'rgba(251,191,36,0.1)', border: '1px solid #fbbf24',
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <div style={{ flex: 1, fontSize: 13, color: '#fbbf24', fontFamily: "'Outfit', sans-serif", lineHeight: 1.5 }}>
        ⚠️ Multiple people may be visible in this video. For best accuracy, upload video showing only the competing gymnast.
      </div>
      <button onClick={() => setDismissed(true)} style={{
        background: 'none', border: 'none', color: '#fbbf24', fontSize: 16,
        cursor: 'pointer', padding: '0 4px', flexShrink: 0,
      }}>✕</button>
    </div>
  );
}

function SkillCard({ skill, index, isFree, tier, freeDeductionLimit, globalDeductionIndex, onJumpToTimestamp, onUpgrade, videoUrl, showSkeleton, setShowSkeleton }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('what');
  const [playbackRate, setPlaybackRate] = useState(1);
  const [liveAngles, setLiveAngles] = useState(null); // { lKnee, rKnee, lElbow, rElbow, lHip, rHip }
  const [videoPaused, setVideoPaused] = useState(true);
  const cardVideoRef = useRef(null);
  const cardCanvasRef = useRef(null);
  const poseRef = useRef(null);
  const rafRef = useRef(null);

  // ── Angle + color helpers for skeleton overlay ──
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

  const jointColor = (angle, ideal) => {
    const diff = Math.abs(angle - (ideal || 180));
    if (diff <= 5) return '#22c55e';   // green — on target
    if (diff <= 15) return '#ffc15a';  // amber — slight deviation
    return '#dc2626';                   // red — form break
  };

  // ── MediaPipe skeleton detection loop ──
  useEffect(() => {
    if (!showSkeleton || !open || tab !== 'video') {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      return;
    }
    const canvas = cardCanvasRef.current;
    const video = cardVideoRef.current;
    if (!canvas || !video) return;

    let running = true;
    let lastSendTime = 0;
    console.log('[skeleton] Starting detection loop, video readyState:', video.readyState);

    // Sync canvas size to video display size
    const syncCanvasSize = () => {
      const vRect = video.getBoundingClientRect();
      if (vRect.width > 0 && vRect.height > 0) {
        if (canvas.width !== vRect.width || canvas.height !== vRect.height) {
          canvas.width = vRect.width;
          canvas.height = vRect.height;
        }
        return true;
      }
      return false;
    };

    const loadCDN = () => new Promise((resolve, reject) => {
      if (window.Pose) { console.log('[skeleton] Pose already loaded'); return resolve(); }
      console.log('[skeleton] Loading MediaPipe CDN...');
      // Check if scripts already in DOM
      if (document.querySelector('script[src*="mediapipe/pose"]')) {
        // Scripts exist but may still be loading — poll for window.Pose
        const poll = setInterval(() => {
          if (window.Pose) { clearInterval(poll); resolve(); }
        }, 200);
        setTimeout(() => { clearInterval(poll); reject(new Error('Pose CDN timeout')); }, 15000);
        return;
      }
      const s1 = document.createElement('script');
      s1.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5/pose.js';
      s1.crossOrigin = 'anonymous';
      s1.onerror = () => reject(new Error('Failed to load Pose CDN'));
      s1.onload = () => {
        console.log('[skeleton] pose.js loaded');
        const s2 = document.createElement('script');
        s2.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils@0.3/drawing_utils.js';
        s2.crossOrigin = 'anonymous';
        s2.onerror = () => reject(new Error('Failed to load drawing_utils CDN'));
        s2.onload = () => { console.log('[skeleton] drawing_utils loaded'); resolve(); };
        document.head.appendChild(s2);
      };
      document.head.appendChild(s1);
    });

    const drawResults = (results) => {
      if (!running) return;
      if (!syncCanvasSize()) return;
      const ctx = canvas.getContext('2d');
      const cw = canvas.width;
      const ch = canvas.height;
      ctx.clearRect(0, 0, cw, ch);
      const isPaused = video.paused;

      if (results.poseLandmarks) {
        const lm = results.poseLandmarks;
        // Draw connectors (white lines between joints)
        if (window.drawConnectors && window.POSE_CONNECTIONS) {
          window.drawConnectors(ctx, lm, window.POSE_CONNECTIONS, { color: 'rgba(255,255,255,0.4)', lineWidth: 2 });
        }
        // Key joints with ideal angles
        const keyJoints = {
          25: { a: 23, c: 27, ideal: 180, label: 'L Knee' },
          26: { a: 24, c: 28, ideal: 180, label: 'R Knee' },
          13: { a: 11, c: 15, ideal: 180, label: 'L Elbow' },
          14: { a: 12, c: 16, ideal: 180, label: 'R Elbow' },
          23: { a: 11, c: 25, ideal: 180, label: 'L Hip' },
          24: { a: 12, c: 26, ideal: 180, label: 'R Hip' },
        };
        const angles = {};
        lm.forEach((pt, idx) => {
          if ((pt.visibility || 0) < 0.5) return;
          let color = 'rgba(255,255,255,0.7)';
          const joint = keyJoints[idx];
          let angle = null;
          if (joint && lm[joint.a] && lm[joint.c]) {
            angle = calcAngle(
              { x: lm[joint.a].x * cw, y: lm[joint.a].y * ch },
              { x: pt.x * cw, y: pt.y * ch },
              { x: lm[joint.c].x * cw, y: lm[joint.c].y * ch }
            );
            color = jointColor(angle, joint.ideal);
            angles[joint.label] = angle;
          }
          // Draw joint dot — larger when paused for inspection
          ctx.beginPath();
          ctx.arc(pt.x * cw, pt.y * ch, isPaused ? 7 : 5, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.5)';
          ctx.lineWidth = 1;
          ctx.stroke();
          // Draw angle label when paused (key joints only)
          if (isPaused && joint && angle !== null) {
            ctx.font = 'bold 12px sans-serif';
            ctx.strokeStyle = 'rgba(0,0,0,0.8)';
            ctx.lineWidth = 3;
            const lbl = `${angle}°`;
            ctx.strokeText(lbl, pt.x * cw + 10, pt.y * ch - 8);
            ctx.fillStyle = color;
            ctx.fillText(lbl, pt.x * cw + 10, pt.y * ch - 8);
          }
        });
        setLiveAngles(Object.keys(angles).length > 0 ? angles : null);
      }
    };

    const initPose = async () => {
      await loadCDN();
      if (!poseRef.current && window.Pose) {
        console.log('[skeleton] Initializing Pose...');
        const pose = new window.Pose({ locateFile: (file) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5/${file}`
        });
        pose.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        pose.onResults(drawResults);
        await pose.initialize();
        poseRef.current = pose;
        console.log('[skeleton] Pose initialized successfully');
      }

      // Send one frame immediately (even if paused) so user sees skeleton on toggle
      syncCanvasSize();
      if (poseRef.current && video.readyState >= 2) {
        console.log('[skeleton] Sending initial frame');
        try { await poseRef.current.send({ image: video }); } catch (e) {
          console.warn('[skeleton] Initial frame send failed:', e.message);
        }
      }

      // Detection loop — hard stop on pause, frame-skip when playing
      let frameCount = 0;
      let detectionActive = !video.paused;
      const onPause = () => { detectionActive = false; };
      const onPlay = () => { detectionActive = true; };
      video.addEventListener('pause', onPause);
      video.addEventListener('play', onPlay);

      const detectLoop = async () => {
        if (!running || !poseRef.current) return;
        // Hard stop when paused — zero frames processed
        if (!detectionActive) {
          if (running) rafRef.current = requestAnimationFrame(detectLoop);
          return;
        }
        frameCount++;
        // Frame-skip: only process every 3rd frame to reduce CPU
        if (frameCount % 3 !== 0) {
          if (running) rafRef.current = requestAnimationFrame(detectLoop);
          return;
        }
        const now = Date.now();
        if (now - lastSendTime >= 33 && video.readyState >= 2) {
          syncCanvasSize();
          lastSendTime = now;
          try { await poseRef.current.send({ image: video }); } catch {}
        }
        if (running) rafRef.current = requestAnimationFrame(detectLoop);
      };
      rafRef.current = requestAnimationFrame(detectLoop);
    };

    // Wait for video to have data before starting
    const startWhenReady = () => {
      if (video.readyState >= 2) {
        initPose().catch(e => console.warn('[skeleton] init failed:', e.message));
      } else {
        console.log('[skeleton] Waiting for video data...');
        video.addEventListener('loadeddata', () => {
          initPose().catch(e => console.warn('[skeleton] init failed:', e.message));
        }, { once: true });
      }
    };
    startWhenReady();

    // Also re-send on seek (user scrubs to different time while paused)
    const onSeeked = () => {
      if (poseRef.current && video.readyState >= 2) {
        syncCanvasSize();
        poseRef.current.send({ image: video }).catch(() => {});
      }
    };
    video.addEventListener('seeked', onSeeked);

    return () => {
      running = false;
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('play', onPlay);
    };
  }, [showSkeleton, open, tab, videoUrl]);

  // Level 3 — plain English context for each tab
  function buildTabNarrative(sk, tabId) {
    const n = sk.skillName || sk.skill || 'This skill';
    const d = sk.deduction || 0;
    if (tabId === 'what') {
      if (!sk.reason) return null;
      const fixed = d > 0 ? ` Fixing this adds +${d.toFixed(2)} to the score automatically — judges have no discretion on this.` : '';
      return `Here's what the judge saw on ${n}: ${sk.reason}.${fixed}`;
    }
    if (tabId === 'deds') {
      if (d === 0) return `No deductions on ${n} — clean execution.`;
      const count = (sk.faults || []).length || 1;
      return `${count === 1 ? 'One deduction' : `${count} deductions`} on ${n}, totaling -${d.toFixed(2)}. Each one below is something judges are specifically trained to spot and mark every time it appears.`;
    }
    if (tabId === 'bio') {
      const bio = sk.bodyMechanics;
      if (!bio) return `Body position data wasn't captured for ${n}.`;
      const knee = bio.kneeAngle ? bio.kneeAngle.replace('°', '') : null;
      const kneeNote = knee && parseInt(knee) < 170
        ? `Her knees were at ${bio.kneeAngle} — ideal is 180° fully straight. Judges see this as a form break and deduct for it.`
        : `Knee position was close to ideal on ${n}.`;
      return `${kneeNote} The numbers below show joint angles measured from the video. Green means on target. Orange or red is what caused a deduction.`;
    }
    if (tabId === 'injury') {
      if (!sk.injuryRisk) return `No elevated injury concerns on ${n} at this level.`;
      return `This isn't about something that happened in this routine — it's about what repeated execution of this pattern can cause over time. The note below is what a sports medicine professional would flag.`;
    }
    if (tabId === 'video') {
      return `The video below starts at the moment this skill begins. Toggle the skeleton to see joint positions highlighted in real time — green joints are on target, red shows where the deduction came from.`;
    }
    if (tabId === 'fix') {
      if (!sk.drillRecommendation) return null;
      return `This drill targets exactly what caused the deduction above. It's designed to fix the specific movement pattern judges marked — not general conditioning.`;
    }
    return null;
  }

  const name = skill.skillName || skill.name || skill.skill || 'Skill';
  const skillConf = skill.skillConfidence || skill.skill_confidence || 'high';
  const [confDismissed, setConfDismissed] = useState(false);
  const [confCorrecting, setConfCorrecting] = useState(false);
  const [confInput, setConfInput] = useState('');
  const [confSaved, setConfSaved] = useState(false);
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
            {skillConf === 'medium' && (
              <span title="Skill identification is approximate" style={{ fontSize: 11, cursor: 'help', opacity: 0.6 }}>◐</span>
            )}
            <span style={{
              fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
              background: category === 'DANCE' || category === 'TURN' || category === 'LEAP' ? 'rgba(96,165,250,0.12)' : 'rgba(255,255,255,0.04)',
              color: category === 'DANCE' || category === 'TURN' || category === 'LEAP' ? T.blue : T.textMuted,
              textTransform: 'uppercase', letterSpacing: 0.5,
            }}>{category === 'DANCE' || category === 'TURN' || category === 'LEAP' ? 'DANCE' : category || 'ACRO'}</span>
          </div>
          <div style={{ fontSize: 11, color: T.textMuted, fontFamily: T.sans, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ts && <span style={{ fontFamily: T.mono, marginRight: 6 }}>{ts}</span>}
            {snippet}
          </div>
          {!open && skill.reason && (
            <div style={{
              fontSize: 11.5, color: 'rgba(255,255,255,0.38)', fontStyle: 'italic',
              marginTop: 3, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis',
              whiteSpace: 'nowrap', maxWidth: '85%',
            }}>
              {skill.reason.length > 72 ? skill.reason.substring(0, 72) + '…' : skill.reason}
            </div>
          )}
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

            {/* Low-confidence skill prompt */}
            {skillConf === 'low' && !confDismissed && !confSaved && (
              <div style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid rgba(232,150,42,0.25)`, background: 'rgba(232,150,42,0.06)', marginBottom: 10 }}>
                <div style={{ fontSize: 13, color: T.text, fontFamily: T.sans, marginBottom: 8 }}>
                  We detected what appears to be a <strong>{name}</strong>. Does this look right?
                </div>
                {!confCorrecting ? (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => {
                      try {
                        const records = JSON.parse(localStorage.getItem('strive_skill_confirmations') || '[]');
                        records.push({ skillOrder: skill.skillOrder || index, confirmed: true, originalName: name, timestamp: new Date().toISOString() });
                        localStorage.setItem('strive_skill_confirmations', JSON.stringify(records));
                      } catch {}
                      setConfDismissed(true);
                    }} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.08)', color: T.green, fontSize: 12, fontWeight: 600, fontFamily: T.sans, cursor: 'pointer' }}>
                      ✓ Yes, that's correct
                    </button>
                    <button onClick={() => setConfCorrecting(true)} style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid rgba(232,150,42,0.3)`, background: 'rgba(232,150,42,0.08)', color: '#e8962a', fontSize: 12, fontWeight: 600, fontFamily: T.sans, cursor: 'pointer' }}>
                      ✗ No, fix it
                    </button>
                  </div>
                ) : (
                  <div>
                    <input type="text" value={confInput} onChange={e => setConfInput(e.target.value)} placeholder="What skill was this?" style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: T.text, fontSize: 13, fontFamily: T.sans, boxSizing: 'border-box', marginBottom: 8 }} />
                    <button onClick={() => {
                      if (!confInput.trim()) return;
                      try {
                        const records = JSON.parse(localStorage.getItem('strive_skill_corrections') || '[]');
                        records.push({ skillOrder: skill.skillOrder || index, confirmed: false, originalName: name, correctedName: confInput.trim(), timestamp: new Date().toISOString() });
                        localStorage.setItem('strive_skill_corrections', JSON.stringify(records));
                      } catch {}
                      setConfSaved(true);
                    }} style={{ padding: '6px 14px', borderRadius: 6, background: '#e8962a', border: 'none', color: '#070c16', fontSize: 12, fontWeight: 700, fontFamily: T.sans, cursor: 'pointer' }}>
                      Submit
                    </button>
                  </div>
                )}
              </div>
            )}
            {confSaved && (
              <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(34,197,94,0.06)', marginBottom: 10, fontSize: 13, color: T.green, fontFamily: T.sans }}>
                Thanks — we'll use this to improve.
              </div>
            )}

            {/* Tab bar */}
            <div style={{
              display: 'flex', gap: 0, borderRadius: 10, overflow: 'hidden',
              border: `1px solid ${T.border}`, marginBottom: 12,
            }}>
              {TABS.map((t, i) => (
                <button key={t.id} onClick={() => setTab(t.id)} style={{
                  flex: 1, padding: '8px 2px', fontSize: 10.5, fontWeight: 600,
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
            {/* Tab narrative — plain English context */}
            {(() => {
              const narrative = buildTabNarrative(skill, tab);
              return narrative ? (
                <div style={{
                  padding: '11px 14px', marginBottom: 12, borderRadius: 9,
                  background: 'rgba(255,255,255,0.03)', borderLeft: '3px solid rgba(255,255,255,0.12)',
                  fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, fontFamily: T.sans,
                }}>
                  {narrative}
                </div>
              ) : null;
            })()}

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
                <button
                  onClick={() => {
                    const msg = `Skill flagged: "${name}" may be incorrectly identified. Event: ${skill.category}, Timestamp: ${ts}`;
                    console.log('[feedback]', msg);
                    alert('Thank you — this helps us improve skill detection.');
                  }}
                  style={{
                    marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,0.35)',
                    background: 'none', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
                    fontFamily: T.sans,
                  }}
                >
                  ⚑ Flag incorrect skill
                </button>
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
              !canSeeBiomechanics(tier) ? <LockedFeature feature="biomechanics" tier={tier} onUpgrade={onUpgrade}><div style={{ height: 100 }} /></LockedFeature> :
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
              !canSeeInjuryAwareness(tier) ? <LockedFeature feature="injury" tier={tier} onUpgrade={onUpgrade}><div style={{ height: 80 }} /></LockedFeature> :
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

            {/* TAB: Video (skeleton gated) */}
            {tab === 'video' && !canSeeSkeletonOverlay(tier) && (
              <LockedFeature feature="skeleton" tier={tier} onUpgrade={onUpgrade}>
                <div style={{ height: 120, background: '#000', borderRadius: 10 }} />
              </LockedFeature>
            )}
            {tab === 'video' && canSeeSkeletonOverlay(tier) && (
              <div style={{ padding: '0' }}>
                {/* Video + skeleton canvas overlay */}
                <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', background: '#000', marginBottom: 10 }}>
                  <video
                    ref={cardVideoRef}
                    src={videoUrl || ''}
                    style={{ width: '100%', display: 'block', borderRadius: 10 }}
                    playsInline
                    webkit-playsinline=""
                    muted
                    controls
                    onLoadedMetadata={(e) => {
                      if (ts) {
                        const secs = parseTs(ts);
                        if (secs > 0) e.target.currentTime = secs;
                      }
                      e.target.playbackRate = playbackRate;
                    }}
                    onPlay={() => setVideoPaused(false)}
                    onPause={() => setVideoPaused(true)}
                  />
                  <canvas
                    ref={cardCanvasRef}
                    style={{
                      position: 'absolute', top: 0, left: 0,
                      width: '100%', height: '100%',
                      pointerEvents: 'none',
                      zIndex: 10,
                      opacity: showSkeleton ? 1 : 0,
                      transition: 'opacity 0.3s',
                    }}
                  />
                </div>

                {/* Controls row */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <button onClick={() => setShowSkeleton(s => !s)} style={{
                    flex: 1, padding: '9px 0', borderRadius: 9,
                    background: showSkeleton ? 'rgba(232,150,42,0.15)' : 'rgba(255,255,255,0.06)',
                    border: `1px solid ${showSkeleton ? 'rgba(232,150,42,0.4)' : 'rgba(255,255,255,0.1)'}`,
                    color: showSkeleton ? '#f0a030' : 'rgba(255,255,255,0.5)',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: T.sans,
                  }}>
                    {showSkeleton ? '◉ Skeleton ON' : '○ Skeleton OFF'}
                  </button>
                  <button onClick={() => {
                    const next = playbackRate === 1 ? 0.25 : 1;
                    setPlaybackRate(next);
                    if (cardVideoRef.current) cardVideoRef.current.playbackRate = next;
                  }} style={{
                    flex: 1, padding: '9px 0', borderRadius: 9,
                    background: playbackRate < 1 ? 'rgba(96,165,250,0.12)' : 'rgba(255,255,255,0.06)',
                    border: `1px solid ${playbackRate < 1 ? 'rgba(96,165,250,0.35)' : 'rgba(255,255,255,0.1)'}`,
                    color: playbackRate < 1 ? '#60a5fa' : 'rgba(255,255,255,0.5)',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: T.sans,
                  }}>
                    {playbackRate < 1 ? '◎ 0.25× Slow Mo' : '▶ Normal Speed'}
                  </button>
                </div>

                {/* ═══ JUDGE'S SKELETON ANALYSIS ═══ */}
                {showSkeleton && (
                  <div style={{
                    borderRadius: 10, marginBottom: 10, overflow: 'hidden',
                    border: '1px solid rgba(232,150,42,0.2)',
                    background: 'rgba(232,150,42,0.04)',
                  }}>
                    {/* Header */}
                    <div style={{
                      padding: '10px 12px', background: 'rgba(232,150,42,0.08)',
                      borderBottom: '1px solid rgba(232,150,42,0.12)',
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: T.gold, letterSpacing: 0.5, textTransform: 'uppercase', fontFamily: T.sans }}>
                        ⚖️ Judge's Skeleton Analysis
                      </div>
                    </div>

                    <div style={{ padding: '12px' }}>
                      {/* What you're seeing */}
                      <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.65)', lineHeight: 1.7, fontFamily: T.sans, marginBottom: 12 }}>
                        The colored dots on the video track your gymnast's <strong style={{ color: T.text }}>joint positions in real time</strong> — the same positions judges evaluate from their seat.
                        Pause the video to see exact angle measurements at each joint.
                      </div>

                      {/* Color key */}
                      <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                        {[
                          { color: T.green, label: 'On target', desc: 'Within 5° of ideal — no deduction' },
                          { color: '#ffc15a', label: 'Slight deviation', desc: '5–15° off — possible 0.05' },
                          { color: T.red, label: 'Form break', desc: '15°+ off — this is the deduction' },
                        ].map(c => (
                          <div key={c.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, flex: '1 1 140px' }}>
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: c.color, flexShrink: 0, marginTop: 3 }} />
                            <div>
                              <div style={{ fontSize: 11, fontWeight: 700, color: c.color, fontFamily: T.sans }}>{c.label}</div>
                              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontFamily: T.sans }}>{c.desc}</div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Live angle readings (when available) */}
                      {liveAngles && (
                        <div style={{
                          padding: '10px 12px', borderRadius: 8,
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.06)',
                          marginBottom: 12,
                        }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, fontFamily: T.sans }}>
                            Live Joint Angles {videoPaused ? '(paused — showing exact frame)' : '(updating in real time)'}
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                            {Object.entries(liveAngles).map(([joint, angle]) => {
                              const diff = Math.abs(angle - 180);
                              const c = diff <= 5 ? T.green : diff <= 15 ? '#ffc15a' : T.red;
                              const status = diff <= 5 ? 'Good' : diff <= 15 ? 'Watch' : 'Deduction';
                              return (
                                <div key={joint} style={{ padding: '6px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.02)' }}>
                                  <div style={{ fontSize: 9, color: T.textMuted, fontFamily: T.sans }}>{joint}</div>
                                  <div style={{ fontSize: 16, fontWeight: 800, color: c, fontFamily: T.mono }}>{angle}°</div>
                                  <div style={{ fontSize: 9, color: c, fontWeight: 600, fontFamily: T.sans }}>{status}</div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Findings — connect skeleton to this skill's deductions */}
                      <div style={{
                        padding: '10px 12px', borderRadius: 8,
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.05)',
                        marginBottom: 12,
                      }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.6)', marginBottom: 6, fontFamily: T.sans }}>
                          What this means for {name}
                        </div>
                        <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, fontFamily: T.sans }}>
                          {faults.length === 0 ? (
                            <>All joints tracked within ideal range on this skill. Clean execution — the skeleton confirms what the score shows.</>
                          ) : (
                            <>
                              {faults.slice(0, 2).map((f, i) => {
                                const bodyPart = f.bodyPoint || f.fault?.split(' ')[0] || '';
                                return (
                                  <span key={i}>
                                    {i > 0 ? ' ' : ''}
                                    The <strong style={{ color: T.orange }}>{bodyPart || 'form break'}</strong> deduction
                                    (-{(f.deduction || 0).toFixed(2)}) corresponds to the{' '}
                                    <strong style={{ color: T.red }}>red/orange joint</strong> you see on the skeleton at this moment.
                                    {f.fault ? ` Specifically: ${f.fault}.` : ''}
                                  </span>
                                );
                              })}
                              {' '}Judges see these exact angles from their position at the meet — now you can see them too.
                            </>
                          )}
                        </div>
                      </div>

                      {/* What to do with this info */}
                      <div style={{
                        padding: '10px 12px', borderRadius: 8,
                        background: 'rgba(34,197,94,0.04)',
                        border: '1px solid rgba(34,197,94,0.1)',
                      }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: T.green, marginBottom: 4, fontFamily: T.sans }}>
                          How to use this
                        </div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.65, fontFamily: T.sans }}>
                          {ded > 0 ? (
                            <>
                              <strong style={{ color: 'rgba(255,255,255,0.7)' }}>1.</strong> Play the video in slow motion and watch the red/orange joints.{' '}
                              <strong style={{ color: 'rgba(255,255,255,0.7)' }}>2.</strong> Pause at the moment of the skill — you'll see the exact angle that caused the deduction.{' '}
                              <strong style={{ color: 'rgba(255,255,255,0.7)' }}>3.</strong> Show your coach — this is what needs to change in practice.{' '}
                              The drill in the "Today's Fix" tab targets this exact movement pattern.
                              {gainIfFixed > 0 ? ` Fixing it adds +${gainIfFixed.toFixed(2)} back to the score.` : ''}
                            </>
                          ) : (
                            <>
                              All green! Share this with your gymnast — it's proof of clean execution.
                              Keep doing exactly this in practice and it will hold at the next meet.
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Jump to timestamp button */}
                {ts && onJumpToTimestamp && (
                  <button onClick={() => onJumpToTimestamp(parseTs(ts))} style={{
                    width: '100%', padding: '10px 14px',
                    background: 'rgba(232,150,42,0.08)', border: '1px solid rgba(232,150,42,0.2)',
                    borderRadius: 8, cursor: 'pointer', color: T.gold,
                    fontSize: 13, fontWeight: 600, fontFamily: T.sans,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}>
                    ▶ Jump to {ts} in full video
                  </button>
                )}
              </div>
            )}

            {/* TAB: Today's Fix */}
            {tab === 'fix' && (
              !canSeeDrills(tier) ? <LockedFeature feature="drills" tier={tier} onUpgrade={onUpgrade}><div style={{ height: 80 }} /></LockedFeature> :
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
