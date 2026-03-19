import React from 'react';

const SEVERITY_COLORS = {
  small:     '#22c55e',
  medium:    '#ffc15a',
  large:     '#e06820',
  veryLarge: '#dc2626',
};

const SEVERITY_LABELS = {
  small:     'Minor',
  medium:    'Medium',
  large:     'Large',
  veryLarge: 'Very Large',
  fall:      'Fall',
};

function formatTime(secs) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function severityForSkill(skill) {
  if (!skill.deductionHints || skill.deductionHints.length === 0) return 'small';
  const worst = skill.deductionHints.reduce((w, d) => {
    const rank = { small: 0, medium: 1, large: 2, veryLarge: 3, fall: 4 };
    return rank[d.severity] > rank[w] ? d.severity : w;
  }, 'small');
  return worst;
}

/**
 * @param {Object} props
 * @param {Array}   props.skills        – skillAnalysis array
 * @param {number}  props.duration      – video duration in seconds
 * @param {number|null} props.selected  – selected skill index (0-based)
 * @param {function} props.onSelect     – called with skill index
 * @param {number}  props.currentTime   – current playback time for needle
 */
export default function SkillTimeline({ skills = [], duration = 1, selected, onSelect, currentTime = 0 }) {
  const pct = (t) => `${Math.min(100, (t / duration) * 100).toFixed(2)}%`;

  return (
    <div style={{
      position: 'relative',
      height: 64,
      background: 'rgba(255,255,255,0.03)',
      borderRadius: 10,
      border: '1px solid rgba(255,255,255,0.06)',
      padding: '0 12px',
      display: 'flex',
      alignItems: 'center',
      overflow: 'hidden',
    }}>
      {/* Track line */}
      <div style={{
        position: 'absolute', left: 12, right: 12, top: '50%',
        height: 2,
        background: 'rgba(255,255,255,0.08)',
        borderRadius: 1,
        transform: 'translateY(-50%)',
      }} />

      {/* Skill segments */}
      {skills.map((skill, i) => {
        const left  = pct(skill.start);
        const width = pct(skill.duration);
        const color = SEVERITY_COLORS[severityForSkill(skill)] || '#e8962a';
        const isSelected = selected === i;

        const severity = severityForSkill(skill);
        const sevLabel = SEVERITY_LABELS[severity] || 'Unknown';

        return (
          <button
            key={skill.id}
            onClick={() => onSelect(i)}
            title={`${skill.skillName} @ ${formatTime(skill.start)} — ${sevLabel}`}
            aria-label={`${skill.skillName}, severity: ${sevLabel}, at ${formatTime(skill.start)}`}
            style={{
              position: 'absolute',
              left,
              width,
              minWidth: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              height: isSelected ? 28 : 20,
              background: color,
              opacity: isSelected ? 1 : 0.6,
              borderRadius: 4,
              border: isSelected ? `2px solid ${color}` : '2px solid transparent',
              cursor: 'pointer',
              padding: 0,
              transition: 'all 0.2s',
              boxShadow: isSelected ? `0 0 10px ${color}55` : 'none',
              zIndex: isSelected ? 2 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, fontWeight: 700, color: '#fff',
              overflow: 'hidden',
            }}
          >
            <span aria-hidden="true" style={{ opacity: isSelected ? 0.9 : 0, transition: 'opacity 0.2s' }}>
              {sevLabel[0]}
            </span>
          </button>
        );
      })}

      {/* Skill labels (below segments) */}
      {skills.map((skill, i) => {
        const left = pct(skill.start);
        const isSelected = selected === i;
        if (!isSelected) return null;

        return (
          <div
            key={`label-${skill.id}`}
            style={{
              position: 'absolute',
              left,
              bottom: 4,
              fontSize: 10,
              fontWeight: 700,
              color: '#e8962a',
              whiteSpace: 'nowrap',
              fontFamily: "'Space Mono', monospace",
              zIndex: 3,
              pointerEvents: 'none',
            }}
          >
            {formatTime(skill.start)}
          </div>
        );
      })}

      {/* Playhead needle */}
      <div style={{
        position: 'absolute',
        left: pct(currentTime),
        top: 0,
        bottom: 0,
        width: 2,
        background: 'rgba(232,150,42,0.7)',
        borderRadius: 1,
        pointerEvents: 'none',
        zIndex: 4,
        transition: 'left 0.1s linear',
      }} />

      {/* Timestamps */}
      <span style={{
        position: 'absolute', left: 12, bottom: 4,
        fontSize: 9, color: 'rgba(255,255,255,0.3)',
        fontFamily: "'Space Mono', monospace",
      }}>0:00</span>
      <span style={{
        position: 'absolute', right: 12, bottom: 4,
        fontSize: 9, color: 'rgba(255,255,255,0.3)',
        fontFamily: "'Space Mono', monospace",
      }}>{formatTime(duration)}</span>
    </div>
  );
}
