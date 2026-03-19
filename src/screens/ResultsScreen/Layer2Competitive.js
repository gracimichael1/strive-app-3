import React from 'react';
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

function Layer2Competitive({ result, profile, previousResult, onSeek }) {
  const gradedSkills = safeArray(result?.gradedSkills);
  const deductions = safeArray(result?.executionDeductions);
  const finalScore = safeNum(result?.finalScore, 0);

  // Score Path: top 2 deductions to fix
  const sortedDeds = [...deductions].sort((a, b) => safeNum(b.deduction, 0) - safeNum(a.deduction, 0));
  const topFixes = sortedDeds.slice(0, 2);
  const totalFixGain = topFixes.reduce((s, d) => s + safeNum(d.deduction, 0), 0);
  const projectedScore = Math.min(10, finalScore + totalFixGain);
  const targetScore = Math.ceil(projectedScore * 10) / 10;
  const drillCount = Math.max(2, topFixes.length + 1);

  // Weekly focus drills — derive from top faults
  const topDrills = sortedDeds.slice(0, 3).map((d, i) => {
    const drillText = safeStr(d.drill || d.fix || d.correction, `Focus drill for ${safeStr(d.fault, 'this area')}`);
    return { number: i + 1, text: drillText };
  });

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '0 0 90px',
        maxWidth: 540,
        margin: '0 auto',
      }}
      role="main"
      aria-label="Competitive tier analysis results"
    >
      <ScoreHero
        result={result}
        profile={profile}
        previousResult={previousResult}
        tier="competitive"
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
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: COLORS.green,
              marginBottom: 12,
              fontFamily: "'Outfit', sans-serif",
            }}
          >
            Your path to {targetScore.toFixed(1)}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              margin: '16px 0',
            }}
          >
            <div
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 24,
                fontWeight: 700,
                color: COLORS.gold,
              }}
            >
              {finalScore.toFixed(3)}
            </div>
            <div style={{ color: COLORS.textMuted, fontSize: 20 }}>&#10230;</div>
            <div
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 24,
                fontWeight: 700,
                color: COLORS.green,
              }}
            >
              {projectedScore.toFixed(3)}
            </div>
          </div>

          <div
            style={{
              fontSize: 12,
              color: COLORS.textSecondary,
              lineHeight: 1.6,
              fontFamily: "'Outfit', sans-serif",
            }}
          >
            Fix {topFixes.map((d, i) => {
              const name = safeStr(d.fault || d.skill, 'this fault');
              const gain = safeNum(d.deduction, 0);
              return `${name} (+${gain.toFixed(2)})`;
            }).join(' and ')} to gain {totalFixGain.toFixed(2)}.
            <br />
            That's {drillCount} focused drills away.
          </div>
        </div>
      )}

      {/* Skills section header */}
      <div
        style={{
          padding: '20px 20px 12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <h2
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: COLORS.text,
            fontFamily: "'Outfit', sans-serif",
            margin: 0,
          }}
        >
          Skills Performed
        </h2>
        <span
          style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 12,
            color: COLORS.textMuted,
            background: COLORS.surface2,
            padding: '4px 10px',
            borderRadius: 10,
          }}
        >
          {gradedSkills.length} skills
        </span>
      </div>

      {/* Skill cards */}
      {gradedSkills.map((skill, i) => (
        <SkillCard
          key={i}
          skill={skill}
          index={i + 1}
          onSeek={onSeek}
        />
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
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: COLORS.textMuted,
            letterSpacing: 1,
            textTransform: 'uppercase',
            marginBottom: 12,
            fontFamily: "'Outfit', sans-serif",
          }}
        >
          Biomechanics
        </div>
        <div
          style={{
            fontSize: 13,
            color: COLORS.textSecondary,
            lineHeight: 1.6,
            fontFamily: "'Outfit', sans-serif",
          }}
        >
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
          <h3
            style={{
              fontSize: 15,
              fontWeight: 700,
              marginBottom: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: COLORS.text,
              fontFamily: "'Outfit', sans-serif",
              margin: '0 0 12px 0',
            }}
          >
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
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: COLORS.surface3,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 12,
                  fontWeight: 700,
                  color: COLORS.gold,
                  flexShrink: 0,
                }}
              >
                {drill.number}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: COLORS.textSecondary,
                  fontFamily: "'Outfit', sans-serif",
                }}
              >
                {drill.text}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default React.memo(Layer2Competitive);
