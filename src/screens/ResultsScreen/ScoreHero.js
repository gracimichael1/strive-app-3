import React, { useState, useEffect } from 'react';

const COLORS = {
  bg: '#070c16',
  surface: '#0d1422',
  surface2: '#121b2d',
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

function useCountUp(target, duration = 1500) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!target || target <= 0) {
      setValue(target || 0);
      return;
    }
    const start = performance.now();
    let raf;
    const step = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(target * eased);
      if (progress < 1) {
        raf = requestAnimationFrame(step);
      } else {
        setValue(target);
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return value;
}

function ScoreHero({ result, profile, previousResult, tier }) {
  const finalScore = result?.finalScore || 0;
  const animatedScore = useCountUp(finalScore);
  const totalDeductions = result?.totalDeductions || 0;
  const startValue = result?.startValue || 10.0;
  const event = result?.event || '';
  const level = profile?.level || '';
  const gender = profile?.gender || 'female';

  const prevScore = previousResult?.finalScore;
  const delta = prevScore != null && prevScore > 0 ? finalScore - prevScore : null;

  const scoreColor = finalScore >= 9.0 ? COLORS.green : finalScore >= 8.0 ? COLORS.goldLight : COLORS.red;

  const genderLabel = gender === 'male' ? "Men's" : "Women's";
  const eventLabel = [genderLabel, level, event].filter(Boolean).join(' — ');

  const tierLabel = tier === 'competitive' ? 'COMPETITIVE' : tier === 'elite' ? 'ELITE' : null;
  const tierBg = tier === 'elite'
    ? 'rgba(168, 85, 247, 0.15)'
    : tier === 'competitive'
      ? 'rgba(232, 150, 42, 0.15)'
      : null;
  const tierColor = tier === 'elite' ? '#a855f7' : COLORS.gold;

  return (
    <div
      style={{
        textAlign: 'center',
        padding: '32px 20px 24px',
        position: 'relative',
      }}
      role="region"
      aria-label={`Score: ${finalScore.toFixed(3)} for ${eventLabel}`}
    >
      {/* Glow */}
      <div
        style={{
          position: 'absolute',
          top: -40,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 300,
          height: 300,
          background: 'radial-gradient(circle, rgba(232,150,42,0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
        aria-hidden="true"
      />

      {/* Event badge */}
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          background: COLORS.surface2,
          border: `1px solid ${COLORS.border}`,
          padding: '6px 14px',
          borderRadius: 20,
          fontSize: 12,
          color: COLORS.textSecondary,
          marginBottom: 20,
          fontWeight: 500,
          fontFamily: "'Outfit', sans-serif",
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: COLORS.gold,
            flexShrink: 0,
          }}
          aria-hidden="true"
        />
        {eventLabel}
        {tierLabel && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '2px 6px',
              borderRadius: 6,
              fontSize: 9,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              background: tierBg,
              color: tierColor,
              marginLeft: 4,
            }}
          >
            {tierLabel}
          </span>
        )}
      </div>

      {/* Score */}
      <div
        style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: 72,
          fontWeight: 700,
          background: `linear-gradient(135deg, ${COLORS.goldLight}, ${COLORS.gold})`,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          lineHeight: 1,
          marginBottom: 8,
        }}
        aria-live="polite"
      >
        {animatedScore.toFixed(3)}
      </div>

      {/* Context */}
      <div
        style={{
          fontSize: 13,
          color: COLORS.textSecondary,
          marginBottom: 4,
          fontFamily: "'Outfit', sans-serif",
        }}
      >
        Start Value {startValue.toFixed(1)} — Deductions {totalDeductions.toFixed(2)}
      </div>

      {/* Scoring disclaimer */}
      <div
        style={{
          fontSize: 10,
          color: 'rgba(255,255,255,0.25)',
          fontFamily: "'Outfit', sans-serif",
          letterSpacing: 0.3,
          marginTop: 2,
        }}
        aria-label="Scoring disclaimer"
      >
        AI score · training reference only · not an official USAG score
      </div>

      {/* Delta */}
      {delta !== null && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontFamily: "'Space Mono', monospace",
            fontSize: 14,
            color: delta >= 0 ? COLORS.green : COLORS.red,
            fontWeight: 700,
            background: delta >= 0
              ? 'rgba(34, 197, 94, 0.1)'
              : 'rgba(220, 38, 38, 0.1)',
            padding: '4px 12px',
            borderRadius: 12,
            marginTop: 8,
          }}
          aria-label={`${delta >= 0 ? 'Up' : 'Down'} ${Math.abs(delta).toFixed(2)} from last analysis`}
        >
          {delta >= 0 ? '\u25B2' : '\u25BC'} {delta >= 0 ? '+' : ''}{delta.toFixed(2)} from last analysis
        </div>
      )}
    </div>
  );
}

export default React.memo(ScoreHero);
