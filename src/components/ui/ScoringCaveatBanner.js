import React from 'react';

/**
 * ScoringCaveatBanner — amber banner for Beam, Vault, Floor results.
 * Returns null for Bars/Uneven Bars (at/near accuracy target).
 */
export default function ScoringCaveatBanner({ event }) {
  if (!event) return null;
  const e = event.toLowerCase();
  if (e.includes('bar')) return null;

  // Only show for beam, vault, floor
  const isTarget = e.includes('beam') || e.includes('vault') || e.includes('floor');
  if (!isTarget) return null;

  const eventName = e.includes('beam') ? 'Beam' : e.includes('vault') ? 'Vault' : 'Floor';

  return (
    <div style={{
      margin: '12px 16px 0',
      padding: '12px 14px',
      borderRadius: 12,
      background: 'rgba(232,150,42,0.06)',
      border: '1px solid rgba(232,150,42,0.22)',
      display: 'flex',
      gap: 10,
      alignItems: 'flex-start',
    }}>
      <span style={{ fontSize: 16, flexShrink: 0, lineHeight: 1.3 }}>⚡</span>
      <div>
        <div style={{
          fontSize: 12,
          fontWeight: 600,
          color: 'rgba(232,150,42,0.9)',
          marginBottom: 4,
          fontFamily: "'Outfit', sans-serif",
          lineHeight: 1.5,
        }}>
          STRIVE's {eventName} accuracy improves as more routines are analyzed. Your JudgeScoreInput below helps immediately — every real score you submit makes the AI more accurate for everyone.
        </div>
        <div style={{
          fontSize: 11,
          color: 'rgba(255,255,255,0.4)',
          fontFamily: "'Outfit', sans-serif",
          lineHeight: 1.4,
        }}>
          Scores shown are estimates. Variance is typically ±0.15–0.30 on this event.
        </div>
      </div>
    </div>
  );
}
