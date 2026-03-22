import React from 'react';
import ScoreHero from './ScoreHero';
import JudgeScoreInput from '../../components/ui/JudgeScoreInput';
import YourDataCard from '../../components/ui/YourDataCard';
import { safeStr, safeArray } from '../../utils/helpers';

const COLORS = {
  surface: '#0d1422',
  surface2: '#121b2d',
  surface3: '#1a2540',
  gold: '#e8962a',
  goldLight: '#ffc15a',
  green: '#22c55e',
  orange: '#e06820',
  text: '#E2E8F0',
  textSecondary: '#8890AB',
  border: 'rgba(232, 150, 42, 0.12)',
};

function Layer1Free({ result, profile, previousResult, onUpgrade }) {
  const gradedSkills = safeArray(result?.gradedSkills);
  const skillCount = gradedSkills.length;

  // New summary data — prefer new structure, fall back to legacy
  const summary = result?.summary || null;
  const celebrations = safeArray(summary?.celebrations);
  const topImprovements = safeArray(summary?.topImprovements);

  // Legacy fallbacks
  const legacyCelebrations = safeArray(result?.celebrations);
  const legacyStrengths = safeArray(result?.strengths);
  const legacyDeductions = safeArray(result?.executionDeductions);

  // Build positive text — ONE sentence from celebrations[0]
  let positiveText;
  if (celebrations.length > 0) {
    positiveText = safeStr(celebrations[0], '');
  } else if (legacyCelebrations.length > 0) {
    positiveText = safeStr(legacyCelebrations[0]?.note || legacyCelebrations[0], '');
  } else if (legacyStrengths.length > 0) {
    positiveText = safeStr(legacyStrengths[0], '');
  } else {
    positiveText = 'Good effort with visible strengths in this routine.';
  }

  // Build negative text — ONE sentence from topImprovements[0].fix
  let negativeText;
  if (topImprovements.length > 0) {
    negativeText = safeStr(topImprovements[0]?.fix, 'A few areas showed room for improvement with targeted practice.');
  } else if (legacyDeductions.length > 0) {
    const sorted = [...legacyDeductions].sort((a, b) => (b.deduction || 0) - (a.deduction || 0));
    const topFault = safeStr(sorted[0]?.fault || sorted[0]?.skill, '');
    negativeText = topFault
      ? `${topFault} was the area with the most room for improvement.`
      : 'A few areas showed room for improvement with targeted practice.';
  } else {
    negativeText = 'A few areas showed room for improvement with targeted practice.';
  }

  // Count total faults across all skills
  const totalFaults = gradedSkills.reduce((count, skill) => {
    const faults = safeArray(skill?.faults || skill?.subFaults || skill?.deductionHints);
    return count + (faults.length > 0 ? faults.length : (skill?.deduction > 0 ? 1 : 0));
  }, 0);

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '0 0 90px',
        maxWidth: 540,
        margin: '0 auto',
      }}
      role="main"
      aria-label="Free tier analysis results"
    >
      <ScoreHero
        result={result}
        profile={profile}
        previousResult={previousResult}
        tier="free"
      />

      <JudgeScoreInput result={result} profile={profile} />
      <YourDataCard athleteNickname={profile?.name} />

      {/* Summary cards */}
      <div style={{ padding: '0 20px', marginTop: 20 }}>
        {/* What went right */}
        <div
          style={{
            background: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderLeft: `3px solid ${COLORS.green}`,
            borderRadius: 16,
            padding: 20,
            marginBottom: 12,
          }}
          role="region"
          aria-label="What went right"
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: 1,
              marginBottom: 8,
              color: COLORS.green,
              fontFamily: "'Outfit', sans-serif",
            }}
          >
            What went right
          </div>
          <div
            style={{
              fontSize: 15,
              lineHeight: 1.5,
              color: COLORS.text,
              fontWeight: 400,
              fontFamily: "'Outfit', sans-serif",
            }}
          >
            {positiveText}
          </div>
        </div>

        {/* What to work on */}
        <div
          style={{
            background: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderLeft: `3px solid ${COLORS.orange}`,
            borderRadius: 16,
            padding: 20,
            marginBottom: 12,
          }}
          role="region"
          aria-label="What to work on"
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: 1,
              marginBottom: 8,
              color: COLORS.orange,
              fontFamily: "'Outfit', sans-serif",
            }}
          >
            What to work on
          </div>
          <div
            style={{
              fontSize: 15,
              lineHeight: 1.5,
              color: COLORS.text,
              fontWeight: 400,
              fontFamily: "'Outfit', sans-serif",
            }}
          >
            {negativeText}
          </div>
        </div>
      </div>

      {/* Teaser stats */}
      {(skillCount > 0 || totalFaults > 0) && (
        <div
          style={{
            margin: '8px 20px 0',
            display: 'flex',
            gap: 8,
          }}
        >
          {skillCount > 0 && (
            <div
              style={{
                flex: 1,
                background: COLORS.surface,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 12,
                padding: '12px 16px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 20, fontWeight: 700, color: COLORS.gold }}>
                {skillCount}
              </div>
              <div style={{ fontSize: 11, color: COLORS.textSecondary, fontFamily: "'Outfit', sans-serif", marginTop: 2 }}>
                skills analyzed
              </div>
            </div>
          )}
          {totalFaults > 0 && (
            <div
              style={{
                flex: 1,
                background: COLORS.surface,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 12,
                padding: '12px 16px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 20, fontWeight: 700, color: COLORS.orange }}>
                {totalFaults}
              </div>
              <div style={{ fontSize: 11, color: COLORS.textSecondary, fontFamily: "'Outfit', sans-serif", marginTop: 2 }}>
                faults found
              </div>
            </div>
          )}
        </div>
      )}

      {/* Upgrade CTA */}
      <div
        style={{
          margin: '24px 20px',
          background: 'linear-gradient(135deg, rgba(232,150,42,0.1), rgba(232,150,42,0.05))',
          border: '1px solid rgba(232,150,42,0.3)',
          borderRadius: 16,
          padding: '24px 20px',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
        role="region"
        aria-label="Upgrade to see full analysis"
      >
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              marginBottom: 6,
              color: COLORS.text,
              fontFamily: "'Outfit', sans-serif",
            }}
          >
            We found more for your gymnast
          </div>
          <div
            style={{
              fontSize: 13,
              color: COLORS.textSecondary,
              marginBottom: 16,
              lineHeight: 1.5,
              fontFamily: "'Outfit', sans-serif",
            }}
          >
            See the grade and detailed corrections for every skill, plus a personalized drill plan to gain back those points.
          </div>
          <button
            onClick={onUpgrade}
            style={{
              background: `linear-gradient(135deg, ${COLORS.gold}, ${COLORS.goldLight})`,
              color: '#000',
              border: 'none',
              padding: '14px 32px',
              borderRadius: 12,
              fontFamily: "'Outfit', sans-serif",
              fontSize: 15,
              fontWeight: 700,
              cursor: 'pointer',
              minHeight: 48,
            }}
            aria-label="Unlock Full Analysis - Competitive $9.99 per month"
          >
            Unlock Full Analysis — Competitive $9.99/mo
          </button>
        </div>
      </div>

      {/* Blurred preview */}
      <div
        style={{
          margin: '0 20px 20px',
          position: 'relative',
          borderRadius: 16,
          overflow: 'hidden',
        }}
        aria-hidden="true"
      >
        <div
          style={{
            filter: 'blur(6px)',
            opacity: 0.4,
            pointerEvents: 'none',
            padding: 16,
            background: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 16,
          }}
        >
          {[COLORS.green, COLORS.goldLight, COLORS.green].map((color, i) => (
            <div
              key={i}
              style={{
                background: COLORS.surface2,
                borderRadius: 12,
                padding: 14,
                marginBottom: i < 2 ? 8 : 0,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  background: COLORS.surface3,
                  width: 140,
                  height: 16,
                  borderRadius: 4,
                }}
              />
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: `linear-gradient(135deg, ${color}, ${color}cc)`,
                }}
              />
            </div>
          ))}
        </div>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(7,12,22,0.3)',
          }}
        >
          <span
            style={{
              background: COLORS.surface2,
              border: `1px solid ${COLORS.border}`,
              padding: '10px 20px',
              borderRadius: 24,
              fontSize: 13,
              fontWeight: 600,
              color: COLORS.gold,
              fontFamily: "'Outfit', sans-serif",
            }}
          >
            Competitive — Skill-by-skill breakdown
          </span>
        </div>
      </div>
    </div>
  );
}

export default React.memo(Layer1Free);
