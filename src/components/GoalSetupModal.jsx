import React, { useState } from 'react';

const T = {
  bg: '#0d1117', card: '#161b22', gold: '#f0a030', goldBg: 'rgba(240,160,48,0.08)',
  green: '#22c55e', text: '#e6edf3', textSec: 'rgba(230,237,243,0.6)',
  textMuted: 'rgba(230,237,243,0.35)', border: 'rgba(255,255,255,0.07)',
  sans: "'Outfit', sans-serif",
};

const GOALS = [
  { id: 'states', emoji: '\uD83E\uDD47', label: 'Compete at States or Nationals' },
  { id: 'scholarship', emoji: '\uD83C\uDF93', label: 'Earn a college scholarship' },
  { id: 'level10', emoji: '\u2B50', label: 'Reach Level 10' },
  { id: 'skill', emoji: '\u2728', label: 'Master a specific skill' },
  { id: 'fun', emoji: '\uD83D\uDC9B', label: 'Love the sport and stay healthy' },
];

export default function GoalSetupModal({ athleteName, onConfirm, onSkip }) {
  const [selected, setSelected] = useState(null);
  const [skillText, setSkillText] = useState('');

  const handleConfirm = () => {
    if (!selected) return;
    const goal = selected === 'skill' ? `skill:${skillText.trim() || 'unspecified'}` : selected;
    onConfirm(goal);
    try { const { trackEvent } = require('../utils/monitoring'); trackEvent('mastermind_goal_set', { goal }); } catch {}
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        width: '100%', maxWidth: 420, background: T.bg, borderRadius: 16,
        border: `1px solid ${T.border}`, padding: '28px 20px', maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: T.text, fontFamily: T.sans, marginBottom: 6 }}>
            Before we build {athleteName || 'the'} training program
          </div>
          <div style={{ fontSize: 14, color: T.textSec, fontFamily: T.sans }}>
            What's the ultimate goal in gymnastics?
          </div>
        </div>

        {GOALS.map(g => (
          <button key={g.id} onClick={() => setSelected(g.id)} style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 12,
            padding: '14px 16px', marginBottom: 8, borderRadius: 12,
            background: selected === g.id ? 'rgba(240,160,48,0.1)' : 'rgba(255,255,255,0.03)',
            border: `1.5px solid ${selected === g.id ? 'rgba(240,160,48,0.5)' : T.border}`,
            cursor: 'pointer', textAlign: 'left', minHeight: 64, transition: 'all 0.2s',
          }}>
            <span style={{ fontSize: 22, flexShrink: 0 }}>{g.emoji}</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: selected === g.id ? T.gold : T.text, fontFamily: T.sans }}>
              {g.label}
            </span>
            {selected === g.id && (
              <span style={{ marginLeft: 'auto', color: T.gold, fontSize: 16 }}>&#10003;</span>
            )}
          </button>
        ))}

        {selected === 'skill' && (
          <input
            type="text"
            placeholder="e.g. back tuck on beam"
            value={skillText}
            onChange={e => setSkillText(e.target.value)}
            style={{
              width: '100%', padding: '12px 14px', borderRadius: 10,
              background: T.card, border: `1px solid ${T.border}`,
              color: T.gold, fontSize: 15, fontFamily: T.sans,
              outline: 'none', marginBottom: 8, boxSizing: 'border-box',
            }}
          />
        )}

        <button onClick={handleConfirm} disabled={!selected} style={{
          width: '100%', padding: '14px 0', borderRadius: 12, marginTop: 8,
          background: selected ? `linear-gradient(135deg, ${T.gold}, #ffc040)` : 'rgba(255,255,255,0.05)',
          color: selected ? '#000' : T.textMuted, border: 'none',
          fontSize: 16, fontWeight: 700, fontFamily: T.sans,
          cursor: selected ? 'pointer' : 'default', minHeight: 56,
          opacity: selected ? 1 : 0.4,
        }}>
          Build My Program &rarr;
        </button>

        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <button onClick={() => onSkip ? onSkip() : onConfirm('unset')} style={{
            background: 'none', border: 'none', color: T.textMuted,
            fontSize: 13, fontFamily: T.sans, cursor: 'pointer',
          }}>
            Set later
          </button>
        </div>
      </div>
    </div>
  );
}
