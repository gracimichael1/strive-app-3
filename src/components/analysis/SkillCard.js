import React from 'react';

const SEV_COLOR = {
  small:     '#22c55e',
  medium:    '#f59e0b',
  large:     '#e06820',
  veryLarge: '#dc2626',
  fall:      '#dc2626',
};

const SEV_LABEL = {
  small:     '−0.05–0.10',
  medium:    '−0.10–0.15',
  large:     '−0.20–0.30',
  veryLarge: '−0.30–0.50',
  fall:      '−0.50',
};

function AngleMeter({ label, value, ideal = 160 }) {
  if (value === null || value === undefined) return null;
  const pct   = Math.max(0, Math.min(100, (value / 180) * 100));
  const good  = value >= ideal - 10;
  const color = good ? '#22c55e' : value >= ideal - 30 ? '#f59e0b' : '#dc2626';

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 4,
      }}>
        <span style={{ fontSize: 12, color: '#8890AB', fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color, fontFamily: "'Space Mono', monospace" }}>
          {Math.round(value)}°
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={180}
        aria-label={`${label} angle: ${Math.round(value)} degrees`}
        style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}
      >
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: `linear-gradient(90deg, ${color}88, ${color})`,
          borderRadius: 3,
          transition: 'width 0.6s cubic-bezier(0.16,1,0.3,1)',
        }} />
      </div>
    </div>
  );
}

function formatTime(secs) {
  const m = Math.floor(secs / 60);
  const s = secs.toFixed(1).padStart(4, '0');
  return `${m}:${s}`;
}

/**
 * @param {Object} props
 * @param {Object}   props.skill         – skillAnalysis entry
 * @param {boolean}  props.expanded
 * @param {function} props.onToggle
 * @param {function} props.onSeek        – seek video to timestamp
 */
export default function SkillCard({ skill, expanded, onToggle, onSeek }) {
  if (!skill) return null;

  const { biomechanics: bio, deductionHints = [], estimatedDed } = skill;
  const peak = bio?.peak;

  const totalDed = Math.round(estimatedDed * 100) / 100;

  return (
    <div
      style={{
        background: '#0d1422',
        border: expanded
          ? '1px solid rgba(232,150,42,0.3)'
          : '1px solid rgba(232, 150, 42, 0.12)',
        borderRadius: 14,
        overflow: 'hidden',
        transition: 'all 0.2s',
        marginBottom: 10,
      }}
    >
      {/* Header */}
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={`skill-content-${skill.index}`}
        style={{
          width: '100%', textAlign: 'left', padding: '14px 16px',
          background: 'transparent', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 12,
        }}
      >
        {/* Skill index badge */}
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: 'rgba(232,150,42,0.12)',
          color: '#e8962a',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 800, flexShrink: 0,
        }}>
          {skill.index}
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#E2E8F0', marginBottom: 2, fontFamily: "'Outfit', sans-serif" }}>
            {skill.skillName}
          </div>
          <div style={{ fontSize: 11, color: '#8A90AA', fontFamily: "'Space Mono', monospace" }}>
            {formatTime(skill.start)} → {formatTime(skill.end)} · {skill.duration}s
          </div>
        </div>

        {/* Deduction estimate */}
        {totalDed > 0 && (
          <div style={{
            padding: '3px 10px', borderRadius: 20,
            background: 'rgba(220,38,38,0.12)',
            color: '#dc2626',
            fontSize: 12, fontWeight: 700, fontFamily: "'Space Mono', monospace",
            flexShrink: 0,
          }}>
            −{totalDed.toFixed(2)}
          </div>
        )}

        {/* Chevron */}
        <svg
          width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.8"
          style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}
        >
          <path d="M2 5l5 4 5-4" />
        </svg>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div id={`skill-content-${skill.index}`} style={{ padding: '0 16px 16px' }}>
          {/* Seek button */}
          <button
            onClick={() => onSeek && onSeek(skill.peakTimestamp)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 8, marginBottom: 16,
              background: 'rgba(232,150,42,0.1)',
              border: '1px solid rgba(232,150,42,0.2)',
              color: '#e8962a', fontSize: 12, fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M3 2l7 4-7 4V2z"/>
            </svg>
            Jump to peak
          </button>

          {/* Biomechanics */}
          {peak && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#8A90AA', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>
                Peak Position Angles
              </div>
              <AngleMeter label="Knee"     value={peak.kneeAngle}     ideal={160} />
              <AngleMeter label="Hip"      value={peak.hipAngle}      ideal={160} />
              <AngleMeter label="Shoulder" value={peak.shoulderAngle} ideal={170} />
              {bio.worstKneeAngle !== null && bio.worstKneeAngle < peak.kneeAngle - 5 && (
                <AngleMeter label="Worst Knee (flight)" value={bio.worstKneeAngle} ideal={160} />
              )}
            </div>
          )}

          {/* Deduction hints */}
          {deductionHints.length > 0 ? (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#8A90AA', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>
                Detected Faults
              </div>
              {deductionHints.map((hint, i) => (
                <div key={i} style={{
                  display: 'flex', gap: 10, marginBottom: 8,
                  padding: '10px 12px',
                  background: 'rgba(255,255,255,0.02)',
                  borderRadius: 10,
                  borderLeft: `3px solid ${SEV_COLOR[hint.severity] || '#e8962a'}`,
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#E2E8F0', marginBottom: 2 }}>
                      {hint.fault}
                    </div>
                    <div style={{ fontSize: 11, color: '#8890AB', lineHeight: 1.5 }}>
                      {hint.detail}
                    </div>
                  </div>
                  <div style={{
                    fontFamily: "'Space Mono', monospace",
                    fontSize: 12, fontWeight: 700,
                    color: SEV_COLOR[hint.severity],
                    whiteSpace: 'nowrap',
                    alignSelf: 'flex-start',
                  }}>
                    {SEV_LABEL[hint.severity]}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{
              padding: '10px 12px', borderRadius: 10,
              background: 'rgba(34,197,94,0.06)',
              border: '1px solid rgba(34,197,94,0.15)',
              display: 'flex', gap: 8, alignItems: 'center',
            }}>
              <span style={{ fontSize: 16 }}>✓</span>
              <span style={{ fontSize: 13, color: '#22c55e' }}>No major biomechanical faults detected</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
