import React, { useMemo } from 'react';

const COLORS = {
  bg: '#070c16',
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

const AFFIRMATIONS = [
  "Every practice is progress. You're building something incredible.",
  "Champions are made in the gym, one rep at a time.",
  "Trust your training. You've put in the work.",
  "Small improvements every day lead to big results.",
  "Your dedication today is tomorrow's personal best.",
  "Focus on the process. The scores will follow.",
  "You're stronger than you were yesterday.",
  "Believe in your routine. You've earned this.",
  "Progress isn't always linear, but it's always happening.",
  "The best gymnasts compete against who they were yesterday.",
];

function safeNum(val, fallback) {
  const n = parseFloat(val);
  return isNaN(n) ? (fallback || 0) : n;
}

function safeArray(val) {
  if (Array.isArray(val)) return val;
  if (val == null) return [];
  return [val];
}

/**
 * DashboardScreen — the main home screen.
 *
 * @param {Object}   props.profile        - Athlete profile
 * @param {string}   props.tier           - 'free' | 'competitive' | 'elite'
 * @param {Array}    props.recentAnalyses - Array of recent analysis summaries
 * @param {Object}   props.lastResult     - Most recent full result
 * @param {function} props.onAnalyze      - Start new analysis
 * @param {function} props.onViewResult   - View a specific result
 * @param {function} props.onNavigate     - Navigate to other screens (history, guide, mental, training)
 */
function DashboardScreen({ profile, tier, recentAnalyses, lastResult, onAnalyze, onViewResult, onNavigate }) {
  const name = profile?.name || 'Athlete';
  const analyses = safeArray(recentAnalyses);
  const normalizedTier = (tier || 'free').toLowerCase();
  const isCompetitiveOrHigher = normalizedTier === 'competitive' || normalizedTier === 'elite';

  // Daily affirmation — deterministic by day
  const affirmation = useMemo(() => {
    const dayIndex = Math.floor(Date.now() / 86400000) % AFFIRMATIONS.length;
    return AFFIRMATIONS[dayIndex];
  }, []);

  // Recent scores for sparkline
  const recentScores = analyses.slice(-5).map(a => safeNum(a.finalScore, 0));
  const hasScores = recentScores.length > 0;
  const latestScore = hasScores ? recentScores[recentScores.length - 1] : null;
  const latestEvent = analyses.length > 0 ? (analyses[analyses.length - 1].event || '') : '';

  // Mini sparkline SVG
  const sparklinePath = useMemo(() => {
    if (recentScores.length < 2) return null;
    const min = Math.min(...recentScores) - 0.2;
    const max = Math.max(...recentScores) + 0.2;
    const range = max - min || 1;
    const width = 120;
    const height = 32;
    const points = recentScores.map((score, i) => {
      const x = (i / (recentScores.length - 1)) * width;
      const y = height - ((score - min) / range) * height;
      return `${x},${y}`;
    });
    return `M${points.join(' L')}`;
  }, [recentScores]);

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '16px 20px 100px',
        maxWidth: 540,
        margin: '0 auto',
      }}
      role="main"
      aria-label="Dashboard"
    >
      {/* Greeting */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 14, color: COLORS.textSecondary, fontFamily: "'Outfit', sans-serif" }}>
          Welcome back,
        </div>
        <div style={{ fontSize: 24, fontWeight: 700, color: COLORS.text, fontFamily: "'Outfit', sans-serif" }}>
          {name}
        </div>
      </div>

      {/* Daily encouragement — ALL tiers */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(232,150,42,0.08), rgba(232,150,42,0.03))',
          border: '1px solid rgba(232,150,42,0.15)',
          borderRadius: 16,
          padding: '18px 20px',
          marginBottom: 16,
        }}
        role="region"
        aria-label="Daily encouragement"
      >
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: COLORS.gold, marginBottom: 8, fontFamily: "'Outfit', sans-serif" }}>
          Daily Focus
        </div>
        <div style={{ fontSize: 15, color: COLORS.text, lineHeight: 1.5, fontFamily: "'Outfit', sans-serif" }}>
          {affirmation}
        </div>
      </div>

      {/* Score trend + sparkline */}
      {hasScores && (
        <div
          style={{
            background: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 16,
            padding: '16px 20px',
            marginBottom: 16,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
          role="region"
          aria-label="Recent score trend"
        >
          <div>
            <div style={{ fontSize: 11, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4, fontFamily: "'Outfit', sans-serif" }}>
              Latest Score
            </div>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 28, fontWeight: 700, color: COLORS.gold }}>
              {latestScore.toFixed(3)}
            </div>
            {latestEvent && (
              <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 2, fontFamily: "'Outfit', sans-serif" }}>
                {latestEvent}
              </div>
            )}
          </div>
          {sparklinePath && (
            <svg width="120" height="32" viewBox="0 0 120 32" aria-hidden="true">
              <path d={sparklinePath} fill="none" stroke={COLORS.gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      )}

      {/* Analyze CTA */}
      <button
        onClick={onAnalyze}
        style={{
          width: '100%',
          background: `linear-gradient(135deg, ${COLORS.gold}, ${COLORS.goldLight})`,
          color: '#000',
          border: 'none',
          padding: '18px 32px',
          borderRadius: 16,
          fontFamily: "'Outfit', sans-serif",
          fontSize: 18,
          fontWeight: 700,
          cursor: 'pointer',
          marginBottom: 16,
          minHeight: 56,
          letterSpacing: 0.3,
        }}
        aria-label="Analyze a routine"
      >
        Analyze a Routine
      </button>

      {/* Recent analysis preview */}
      {lastResult && (
        <button
          onClick={() => onViewResult && onViewResult(lastResult)}
          style={{
            width: '100%',
            background: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 16,
            padding: '16px 20px',
            marginBottom: 16,
            cursor: 'pointer',
            textAlign: 'left',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
          aria-label="View most recent analysis"
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: 'rgba(232,150,42,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill={COLORS.gold} aria-hidden="true">
              <path d="M4 3h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2zm0 2v10h12V5H4zm2 2h8v2H6V7zm0 4h5v2H6v-2z" />
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text, fontFamily: "'Outfit', sans-serif" }}>
              Recent Analysis
            </div>
            <div style={{ fontSize: 12, color: COLORS.textSecondary, fontFamily: "'Outfit', sans-serif" }}>
              {lastResult.event || 'Floor'} — {safeNum(lastResult.finalScore, 0).toFixed(3)}
            </div>
          </div>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.8" aria-hidden="true">
            <path d="M5 2.5l5 5-5 5" />
          </svg>
        </button>
      )}

      {/* Training program teaser — Elite only */}
      {normalizedTier === 'elite' && (
      <div
        style={{
          background: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 16,
          padding: '16px 20px',
          marginBottom: 16,
          cursor: 'pointer',
        }}
        onClick={() => onNavigate && onNavigate('training')}
        role="button"
        tabIndex={0}
        aria-label="View training program"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: COLORS.green, fontFamily: "'Outfit', sans-serif" }}>
            Training Program
          </div>
          {!isCompetitiveOrHigher && (
            <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(232,150,42,0.15)', color: COLORS.gold }}>
              COMPETITIVE
            </span>
          )}
        </div>
        <div style={{ fontSize: 14, color: COLORS.text, fontFamily: "'Outfit', sans-serif" }}>
          Your drill plan updated — {analyses.length > 0 ? '3 focus areas this week' : 'analyze a routine to get started'}
        </div>
      </div>
      )}

      {/* Progress snapshot (Competitive/Elite only) */}
      {isCompetitiveOrHigher && analyses.length >= 2 && (
        <div
          style={{
            background: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 16,
            padding: '16px 20px',
            marginBottom: 16,
          }}
          role="region"
          aria-label="Progress snapshot"
        >
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: COLORS.textMuted, marginBottom: 8, fontFamily: "'Outfit', sans-serif" }}>
            Progress
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 12, color: COLORS.textSecondary, fontFamily: "'Outfit', sans-serif" }}>
                {analyses.length} analyses
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 16, fontWeight: 700, color: COLORS.gold }}>
                {latestScore.toFixed(3)}
              </div>
              {analyses.length >= 2 && (() => {
                const prev = safeNum(analyses[analyses.length - 2].finalScore, 0);
                const diff = latestScore - prev;
                if (diff === 0) return null;
                return (
                  <div style={{ fontSize: 11, color: diff > 0 ? COLORS.green : COLORS.red, fontFamily: "'Space Mono', monospace" }}>
                    {diff > 0 ? '+' : ''}{diff.toFixed(3)}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Quick links — Mental Training + Training are Elite tier only */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {[
          { label: 'History', key: 'history', eliteOnly: false, icon: 'M3 3h18v2H3V3zm0 4h18v2H3V7zm0 4h12v2H3v-2z' },
          { label: 'Guide', key: 'guide', eliteOnly: false, icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5' },
          { label: 'Mental Training', key: 'mental', eliteOnly: true, icon: 'M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.4 0-8-3.6-8-8s3.6-8 8-8 8 3.6 8 8-3.6 8-8 8zm-1-13h2v6h-2V7zm0 8h2v2h-2v-2z' },
          { label: 'Training', key: 'training', eliteOnly: true, icon: 'M20.57 14.86L22 13.43 20.57 12 17 15.57 8.43 7 12 3.43 10.57 2 9.14 3.43 7.71 2 5.57 4.14 4.14 2.71 2.71 4.14l1.43 1.43L2 7.71l1.43 1.43L2 10.57 3.43 12 7 8.43 15.57 17 12 20.57 13.43 22l1.43-1.43 1.43 1.43 2.14-2.14 1.43 1.43 1.43-1.43-1.43-1.43L22 16.29z' },
        ].filter(item => !item.eliteOnly || normalizedTier === 'elite').map(item => (
          <button
            key={item.key}
            onClick={() => onNavigate && onNavigate(item.key)}
            style={{
              background: COLORS.surface,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 12,
              padding: '14px 16px',
              cursor: 'pointer',
              textAlign: 'left',
              minHeight: 44,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
            aria-label={item.label}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill={COLORS.textMuted} aria-hidden="true">
              <path d={item.icon} />
            </svg>
            <span style={{ fontSize: 13, fontWeight: 500, color: COLORS.text, fontFamily: "'Outfit', sans-serif" }}>
              {item.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default React.memo(DashboardScreen);
