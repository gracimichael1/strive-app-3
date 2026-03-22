import React, { useState, useEffect } from 'react';

const COLORS = {
  surface: '#0d1422',
  gold: '#e8962a',
  green: '#22c55e',
  text: '#E2E8F0',
  textSecondary: '#8890AB',
  border: 'rgba(232, 150, 42, 0.12)',
};

/**
 * YourDataCard — One-time dismissible card shown after first analysis.
 * Tells the user what STRIVE keeps. No PII in the card itself.
 */
function YourDataCard({ athleteNickname }) {
  const [dismissed, setDismissed] = useState(true); // default hidden

  useEffect(() => {
    try {
      const shown = localStorage.getItem('strive-data-screen-shown');
      if (shown !== 'true') setDismissed(false);
    } catch {}
  }, []);

  if (dismissed) return null;

  const displayName = athleteNickname || 'your athlete';

  const handleDismiss = () => {
    setDismissed(true);
    try { localStorage.setItem('strive-data-screen-shown', 'true'); } catch {}
  };

  return (
    <div
      style={{
        margin: '20px 20px 0',
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 16,
        padding: '20px',
        position: 'relative',
      }}
      role="region"
      aria-label="Your data information"
    >
      <button
        onClick={handleDismiss}
        aria-label="Dismiss"
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          background: 'none',
          border: 'none',
          color: COLORS.textSecondary,
          fontSize: 18,
          cursor: 'pointer',
          padding: 4,
          lineHeight: 1,
        }}
      >
        &#10005;
      </button>

      <div style={{
        fontSize: 15,
        fontWeight: 700,
        color: COLORS.text,
        marginBottom: 12,
        fontFamily: "'Outfit', sans-serif",
      }}>
        Here's what STRIVE keeps about {displayName}
      </div>

      {[
        'Gymnastics level and scores',
        'Training notes you add',
        'Analysis history',
      ].map((item, i) => (
        <div key={i} style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '4px 0',
        }}>
          <span style={{ color: COLORS.green, fontSize: 14 }}>&#10003;</span>
          <span style={{
            fontSize: 14,
            color: COLORS.text,
            fontFamily: "'Outfit', sans-serif",
          }}>
            {item}
          </span>
        </div>
      ))}

      <div style={{
        fontSize: 13,
        color: COLORS.textSecondary,
        marginTop: 12,
        lineHeight: 1.5,
        fontFamily: "'Outfit', sans-serif",
      }}>
        We never sell your data. Delete everything anytime: Settings → Delete Account.
      </div>
    </div>
  );
}

export default React.memo(YourDataCard);
