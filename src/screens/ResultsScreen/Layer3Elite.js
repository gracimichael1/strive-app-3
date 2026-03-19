import React, { useState, useMemo } from 'react';
import ScoreHero from './ScoreHero';
import SkillCard from '../../components/ui/SkillCard';
import { safeStr, safeArray } from '../../utils/helpers';

const COLORS = {
  surface: '#0d1422',
  surface2: '#121b2d',
  surface3: '#1a2540',
  gold: '#e8962a',
  goldLight: '#ffc15a',
  green: '#22c55e',
  orange: '#e06820',
  red: '#dc2626',
  text: '#E2E8F0',
  textSecondary: '#8890AB',
  textMuted: '#8A90AA',
  border: 'rgba(232, 150, 42, 0.12)',
};

function safeNum(val, fallback) {
  const n = parseFloat(val);
  return isNaN(n) ? (fallback || 0) : n;
}

// What-If Simulator sub-component
function WhatIfSimulator({ deductions, finalScore }) {
  const sortedDeds = useMemo(() =>
    [...deductions].sort((a, b) => safeNum(b.deduction, 0) - safeNum(a.deduction, 0)).slice(0, 6),
    [deductions]
  );

  const [toggled, setToggled] = useState(() => {
    const initial = {};
    sortedDeds.forEach((_, i) => { initial[i] = false; });
    return initial;
  });

  const removedTotal = sortedDeds.reduce((sum, d, i) =>
    toggled[i] ? sum + safeNum(d.deduction, 0) : sum, 0);
  const projected = Math.min(10, finalScore + removedTotal);

  return (
    <div
      style={{
        margin: '0 20px 12px',
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 16,
        padding: 20,
      }}
      role="region"
      aria-label="What-If score simulator"
    >
      <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px 0', color: COLORS.text, fontFamily: "'Outfit', sans-serif" }}>
        What-If Simulator
      </h3>
      <p style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 16, fontFamily: "'Outfit', sans-serif" }}>
        Toggle deductions on/off to project your potential score
      </p>

      {sortedDeds.map((d, i) => {
        const label = safeStr(d.fault || d.skill, `Deduction ${i + 1}`);
        const isOn = toggled[i];
        return (
          <div
            key={i}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 0',
              borderBottom: i < sortedDeds.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
            }}
          >
            <span style={{ fontSize: 13, color: COLORS.text, fontFamily: "'Outfit', sans-serif" }}>
              {label} <span style={{ color: COLORS.textMuted, fontFamily: "'Space Mono', monospace", fontSize: 11 }}>(-{safeNum(d.deduction, 0).toFixed(2)})</span>
            </span>
            <button
              onClick={() => setToggled(prev => ({ ...prev, [i]: !prev[i] }))}
              role="switch"
              aria-checked={isOn}
              aria-label={`Remove ${label} deduction`}
              style={{
                width: 40,
                height: 22,
                background: isOn ? COLORS.green : COLORS.surface3,
                borderRadius: 11,
                position: 'relative',
                cursor: 'pointer',
                border: 'none',
                transition: 'background 0.2s',
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 3,
                  left: isOn ? 21 : 3,
                  width: 16,
                  height: 16,
                  background: 'white',
                  borderRadius: '50%',
                  transition: 'left 0.2s',
                }}
              />
            </button>
          </div>
        );
      })}

      <div
        style={{
          textAlign: 'center',
          marginTop: 16,
          paddingTop: 16,
          borderTop: '1px solid rgba(255,255,255,0.05)',
        }}
      >
        <div style={{ fontSize: 11, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 1, fontFamily: "'Outfit', sans-serif" }}>
          Projected Score
        </div>
        <div
          style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 32,
            fontWeight: 700,
            color: removedTotal > 0 ? COLORS.green : COLORS.gold,
          }}
        >
          {projected.toFixed(3)}
        </div>
      </div>
    </div>
  );
}

// Diagnostics sub-component
function SessionDiagnostics({ result }) {
  const skills = safeArray(result?.gradedSkills);
  const deds = safeArray(result?.executionDeductions);
  const confidence = result?.confidence || result?.aiConfidence || null;
  const confDisplay = confidence != null ? `${Math.round(safeNum(confidence, 0) * (confidence <= 1 ? 100 : 1))}%` : 'N/A';

  // Count recurring faults across skills
  const faultCounts = {};
  skills.forEach(s => {
    const faults = safeArray(s.subFaults || s.faults || s.deductionHints);
    faults.forEach(f => {
      const name = safeStr(f.fault || f.name || f, '').toLowerCase();
      if (name) faultCounts[name] = (faultCounts[name] || 0) + 1;
    });
  });
  const recurringCount = Object.values(faultCounts).filter(c => c >= 2).length;

  const cells = [
    { value: confDisplay, label: 'Confidence' },
    { value: String(skills.length), label: 'Skills Detected' },
    { value: String(deds.length), label: 'Total Faults' },
    { value: String(recurringCount), label: 'Recurring Faults' },
  ];

  return (
    <div
      style={{
        margin: '0 20px 12px',
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 16,
        padding: 20,
      }}
      role="region"
      aria-label="Session diagnostics"
    >
      <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px 0', color: COLORS.text, fontFamily: "'Outfit', sans-serif" }}>
        Session Diagnostics
      </h3>
      <p style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 16, fontFamily: "'Outfit', sans-serif" }}>
        Scoring engine confidence and pattern analysis
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {cells.map((cell, i) => (
          <div
            key={i}
            style={{
              background: COLORS.surface2,
              borderRadius: 10,
              padding: 12,
              textAlign: 'center',
            }}
          >
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 20, fontWeight: 700, color: COLORS.gold }}>
              {cell.value}
            </div>
            <div style={{ fontSize: 11, color: COLORS.textSecondary, marginTop: 4, fontFamily: "'Outfit', sans-serif" }}>
              {cell.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Coach Report sub-component
function CoachReport({ result, profile }) {
  const athleteName = profile?.name || 'Athlete';
  const event = result?.event || '';
  const score = safeNum(result?.finalScore, 0);

  return (
    <div
      style={{
        margin: '0 20px 12px',
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 16,
        padding: 20,
      }}
      role="region"
      aria-label="Coach report"
    >
      <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px 0', color: COLORS.text, fontFamily: "'Outfit', sans-serif" }}>
        Coach Report
      </h3>
      <p style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 16, fontFamily: "'Outfit', sans-serif" }}>
        Share with your coach or save for your records
      </p>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => {
            const text = `STRIVE Report: ${athleteName} - ${event} ${score.toFixed(3)}`;
            if (navigator.share) {
              navigator.share({ title: 'STRIVE Report', text }).catch(() => {});
            } else if (navigator.clipboard) {
              navigator.clipboard.writeText(text).catch(() => {});
            }
          }}
          style={{
            flex: 1,
            padding: '12px 16px',
            borderRadius: 12,
            background: 'rgba(232,150,42,0.1)',
            border: '1px solid rgba(232,150,42,0.2)',
            color: COLORS.gold,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: "'Outfit', sans-serif",
            minHeight: 44,
          }}
          aria-label="Share report"
        >
          Share Report
        </button>
        <button
          onClick={() => {
            if (typeof window !== 'undefined' && window.print) {
              window.print();
            }
          }}
          style={{
            flex: 1,
            padding: '12px 16px',
            borderRadius: 12,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.07)',
            color: COLORS.text,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: "'Outfit', sans-serif",
            minHeight: 44,
          }}
          aria-label="Export as PDF"
        >
          Export PDF
        </button>
      </div>
    </div>
  );
}

// Fault Trend sub-component
function FaultTrend({ history }) {
  const analyses = safeArray(history);
  if (analyses.length < 2) return null;

  const recent = analyses.slice(-5);
  const faultsBySession = recent.map(a => ({
    date: a.date ? new Date(a.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '',
    faultCount: a.faultCount || 0,
    score: safeNum(a.finalScore, 0),
  }));

  return (
    <div
      style={{
        margin: '0 20px 12px',
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 16,
        padding: 20,
      }}
      role="region"
      aria-label="Fault trend across sessions"
    >
      <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 12px 0', color: COLORS.text, fontFamily: "'Outfit', sans-serif" }}>
        Fault Trend
      </h3>
      {faultsBySession.map((session, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 0',
            borderBottom: i < faultsBySession.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
          }}
        >
          <span style={{ fontSize: 12, color: COLORS.textSecondary, fontFamily: "'Outfit', sans-serif" }}>
            {session.date}
          </span>
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: COLORS.text }}>
            {session.score.toFixed(3)}
          </span>
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: COLORS.orange }}>
            {session.faultCount} faults
          </span>
        </div>
      ))}
    </div>
  );
}

function Layer3Elite({ result, profile, previousResult, history, onSeek }) {
  const gradedSkills = safeArray(result?.gradedSkills);
  const deductions = safeArray(result?.executionDeductions);
  const finalScore = safeNum(result?.finalScore, 0);

  // Score path (reuse from Layer2 logic)
  const sortedDeds = [...deductions].sort((a, b) => safeNum(b.deduction, 0) - safeNum(a.deduction, 0));
  const topFixes = sortedDeds.slice(0, 2);
  const totalFixGain = topFixes.reduce((s, d) => s + safeNum(d.deduction, 0), 0);
  const projectedScore = Math.min(10, finalScore + totalFixGain);
  const targetScore = Math.ceil(projectedScore * 10) / 10;
  const drillCount = Math.max(2, topFixes.length + 1);

  // Weekly drills
  const topDrills = sortedDeds.slice(0, 3).map((d, i) => ({
    number: i + 1,
    text: safeStr(d.drill || d.fix || d.correction, `Focus drill for ${safeStr(d.fault, 'this area')}`),
  }));

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '0 0 90px',
        maxWidth: 540,
        margin: '0 auto',
      }}
      role="main"
      aria-label="Elite tier analysis results"
    >
      <ScoreHero
        result={result}
        profile={profile}
        previousResult={previousResult}
        tier="elite"
      />

      {/* Score Path */}
      {topFixes.length > 0 && finalScore < 9.8 && (
        <div
          style={{
            margin: '20px 20px 0',
            background: 'linear-gradient(135deg, rgba(34,197,94,0.08), rgba(34,197,94,0.03))',
            border: '1px solid rgba(34,197,94,0.2)',
            borderRadius: 16,
            padding: 20,
            textAlign: 'center',
          }}
          role="region"
          aria-label="Score improvement path"
        >
          <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.green, marginBottom: 12, fontFamily: "'Outfit', sans-serif" }}>
            Your path to {targetScore.toFixed(1)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, margin: '16px 0' }}>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 24, fontWeight: 700, color: COLORS.gold }}>{finalScore.toFixed(3)}</div>
            <div style={{ color: COLORS.textMuted, fontSize: 20 }}>&#10230;</div>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 24, fontWeight: 700, color: COLORS.green }}>{projectedScore.toFixed(3)}</div>
          </div>
          <div style={{ fontSize: 12, color: COLORS.textSecondary, lineHeight: 1.6, fontFamily: "'Outfit', sans-serif" }}>
            Fix {topFixes.map((d, i) => `${safeStr(d.fault || d.skill, 'this fault')} (+${safeNum(d.deduction, 0).toFixed(2)})`).join(' and ')} to gain {totalFixGain.toFixed(2)}.
            <br />That's {drillCount} focused drills away.
          </div>
        </div>
      )}

      {/* Advanced Tools header */}
      <div style={{ padding: '20px 20px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: COLORS.text, fontFamily: "'Outfit', sans-serif", margin: 0 }}>Advanced Tools</h2>
      </div>

      {/* What-If Simulator */}
      {deductions.length > 0 && (
        <WhatIfSimulator deductions={deductions} finalScore={finalScore} />
      )}

      {/* Session Diagnostics */}
      <SessionDiagnostics result={result} />

      {/* Coach Report */}
      <CoachReport result={result} profile={profile} />

      {/* Fault Trend */}
      <FaultTrend history={history} />

      {/* Skills header */}
      <div style={{ padding: '20px 20px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: COLORS.text, fontFamily: "'Outfit', sans-serif", margin: 0 }}>Skills Performed</h2>
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: COLORS.textMuted, background: COLORS.surface2, padding: '4px 10px', borderRadius: 10 }}>
          {gradedSkills.length} skills
        </span>
      </div>

      {/* Skill cards */}
      {gradedSkills.map((skill, i) => (
        <SkillCard key={i} skill={skill} index={i + 1} onSeek={onSeek} />
      ))}

      {/* Biomechanics placeholder */}
      <div
        style={{
          margin: '20px 20px 12px',
          background: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 16,
          padding: 20,
        }}
        role="region"
        aria-label="Biomechanics analysis"
      >
        <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12, fontFamily: "'Outfit', sans-serif" }}>
          Biomechanics
        </div>
        <div style={{ fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.6, fontFamily: "'Outfit', sans-serif" }}>
          Joint angles, body positions, and biomechanical measurements will appear here when pose detection data is available.
        </div>
      </div>

      {/* Weekly Focus Drills */}
      {topDrills.length > 0 && (
        <div
          style={{
            margin: '20px 20px 12px',
            background: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 16,
            padding: 20,
          }}
          role="region"
          aria-label="This week's focus drills"
        >
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 12px 0', color: COLORS.text, fontFamily: "'Outfit', sans-serif" }}>
            This Week's Focus Drills
          </h3>
          {topDrills.map((drill) => (
            <div
              key={drill.number}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 0',
                borderBottom: drill.number < topDrills.length ? '1px solid rgba(255,255,255,0.03)' : 'none',
              }}
            >
              <div
                style={{
                  width: 28, height: 28, borderRadius: 8, background: COLORS.surface3,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: "'Space Mono', monospace", fontSize: 12, fontWeight: 700, color: COLORS.gold, flexShrink: 0,
                }}
              >
                {drill.number}
              </div>
              <div style={{ fontSize: 13, color: COLORS.textSecondary, fontFamily: "'Outfit', sans-serif" }}>
                {drill.text}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default React.memo(Layer3Elite);
