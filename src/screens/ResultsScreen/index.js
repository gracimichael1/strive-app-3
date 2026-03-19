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
function ResultsScreen({ result, profile, tier, previousResult, history, onUpgrade, onSeek }) {
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

  if (normalizedTier === 'elite') {
    return (
      <Layer3Elite
        result={result}
        profile={profile}
        previousResult={previousResult}
        history={history}
        onSeek={onSeek}
      />
    );
  }

  if (normalizedTier === 'competitive') {
    return (
      <Layer2Competitive
        result={result}
        profile={profile}
        previousResult={previousResult}
        onSeek={onSeek}
      />
    );
  }

  return (
    <Layer1Free
      result={result}
      profile={profile}
      previousResult={previousResult}
      onUpgrade={onUpgrade}
    />
  );
}

export default React.memo(ResultsScreen);
