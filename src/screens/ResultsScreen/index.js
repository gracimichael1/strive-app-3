import React from 'react';
import Layer1Free from './Layer1Free';
import Layer2Competitive from './Layer2Competitive';
import Layer3Elite from './Layer3Elite';

/**
 * ResultsScreen orchestrator — renders the appropriate tier layer.
 *
 * @param {Object} props
 * @param {Object} props.result          - Analysis result object
 * @param {Object} props.profile         - Athlete profile { name, gender, level, ... }
 * @param {string} props.tier            - 'free' | 'competitive' | 'elite'
 * @param {Object} props.previousResult  - Previous analysis result (for score delta)
 * @param {Array}  props.history         - Array of past analysis summaries
 * @param {function} props.onUpgrade     - Called when user taps upgrade CTA
 * @param {function} props.onSeek        - Called when user taps a video timestamp
 */
function ResultsScreen({ result, profile, tier, previousResult, history, onUpgrade, onSeek, onBack }) {
  if (!result) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 32,
          maxWidth: 540,
          margin: '0 auto',
        }}
        role="main"
        aria-label="No analysis available"
      >
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: 'rgba(255,255,255,0.5)',
            marginBottom: 12,
            fontFamily: "'Outfit', sans-serif",
          }}
        >
          No analysis available
        </div>
        <div
          style={{
            fontSize: 13,
            color: 'rgba(255,255,255,0.3)',
            marginBottom: 24,
            textAlign: 'center',
            maxWidth: 280,
            fontFamily: "'Outfit', sans-serif",
          }}
        >
          Upload a video to get your first analysis.
        </div>
      </div>
    );
  }

  const normalizedTier = (tier || 'free').toLowerCase();

  const backButton = onBack ? (
    <div style={{ maxWidth: 540, margin: '0 auto', padding: '16px 20px 0' }}>
      <button
        onClick={onBack}
        aria-label="Back to dashboard"
        style={{
          background: 'rgba(232, 150, 42, 0.08)',
          border: '1px solid rgba(232, 150, 42, 0.12)',
          borderRadius: 10,
          color: '#E2E8F0',
          fontSize: 14,
          fontFamily: "'Outfit', sans-serif",
          fontWeight: 600,
          padding: '10px 18px',
          cursor: 'pointer',
          minHeight: 44,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        ← Back to Dashboard
      </button>
    </div>
  ) : null;

  if (normalizedTier === 'elite') {
    return (
      <>
        {backButton}
        <Layer3Elite
          result={result}
          profile={profile}
          previousResult={previousResult}
          history={history}
          onSeek={onSeek}
        />
      </>
    );
  }

  if (normalizedTier === 'competitive') {
    return (
      <>
        {backButton}
        <Layer2Competitive
          result={result}
          profile={profile}
          previousResult={previousResult}
          onSeek={onSeek}
        />
      </>
    );
  }

  return (
    <>
      {backButton}
      <Layer1Free
        result={result}
        profile={profile}
        previousResult={previousResult}
        onUpgrade={onUpgrade}
      />
    </>
  );
}

export default React.memo(ResultsScreen);
