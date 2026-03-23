import React, { useState } from 'react';

const GOALS = [
  { id: 'states', emoji: '🥇', label: 'Compete at States or Nationals' },
  { id: 'scholarship', emoji: '🎓', label: 'Earn a college scholarship' },
  { id: 'level10', emoji: '⭐', label: 'Reach Level 10' },
  { id: 'skill', emoji: '✨', label: 'Master a specific skill' },
  { id: 'fun', emoji: '💛', label: 'Love the sport and stay healthy' },
];

function GoalSelector({ athleteProfile, onGoalSet }) {
  const currentGoal = athleteProfile?.goal || null;
  const [selected, setSelected] = useState(currentGoal?.startsWith('skill:') ? 'skill' : currentGoal);
  const [skillText, setSkillText] = useState(
    currentGoal?.startsWith('skill:') ? currentGoal.replace('skill:', '') : ''
  );
  const [saved, setSaved] = useState(false);

  const handleSelect = (id) => {
    setSelected(id);
    setSaved(false);
    if (id !== 'skill') {
      onGoalSet(id);
      setSaved(true);
    }
  };

  const handleSkillConfirm = () => {
    const goal = `skill:${skillText.trim() || 'unspecified'}`;
    onGoalSet(goal);
    setSaved(true);
  };

  return (
    <div>
      {GOALS.map(g => (
        <button key={g.id} onClick={() => handleSelect(g.id)} style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 12px', marginBottom: 6, borderRadius: 8,
          background: selected === g.id ? 'rgba(212,168,67,.1)' : 'rgba(255,255,255,0.03)',
          border: `1px solid ${selected === g.id ? 'rgba(212,168,67,.4)' : 'rgba(255,255,255,0.06)'}`,
          cursor: 'pointer', textAlign: 'left', minHeight: 44,
        }}>
          <span style={{ fontSize: 16 }}>{g.emoji}</span>
          <span style={{ fontSize: 12, fontWeight: 600,
            color: selected === g.id ? '#f0c85a' : 'rgba(221,224,237,.7)',
            fontFamily: "'Outfit', sans-serif" }}>
            {g.label}
          </span>
          {selected === g.id && (
            <span style={{ marginLeft: 'auto', color: '#f0c85a', fontSize: 14 }}>&#10003;</span>
          )}
        </button>
      ))}
      {selected === 'skill' && (
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          <input
            value={skillText}
            onChange={e => { setSkillText(e.target.value); setSaved(false); }}
            placeholder="e.g. back handspring on beam"
            style={{
              flex: 1, padding: '8px 10px', borderRadius: 6, fontSize: 12,
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
              color: '#e6edf3', fontFamily: "'Outfit', sans-serif", outline: 'none',
            }}
          />
          <button onClick={handleSkillConfirm} style={{
            padding: '8px 14px', borderRadius: 6, background: 'rgba(212,168,67,.15)',
            border: '1px solid rgba(212,168,67,.4)', color: '#f0c85a',
            fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Outfit', sans-serif",
          }}>Save</button>
        </div>
      )}
      {saved && (
        <div style={{ fontSize: 11, color: 'rgba(34,197,94,.7)', marginTop: 6 }}>
          &#10003; Goal saved
        </div>
      )}
    </div>
  );
}

export default function MastermindPreview({ tier, athleteProfile, onUpgrade }) {
  return (
    <div style={{ padding: '0 0 80px' }}>

      {/* Header */}
      <div style={{ padding: '20px 20px 12px' }}>
        <div style={{ fontFamily: "var(--serif, 'Outfit', sans-serif)", fontSize: 20,
          fontWeight: 700, marginBottom: 4, color: '#e6edf3' }}>
          Your Training Program
        </div>
        <div style={{ fontSize: 12, color: 'rgba(221,224,237,.5)' }}>
          Set your goal to unlock the full program
        </div>
      </div>

      {/* Goals panel — FULLY FUNCTIONAL for competitive */}
      <div style={{ margin: '0 16px 12px',
        border: '1px solid rgba(212,168,67,.3)',
        borderRadius: 9, padding: 16,
        background: 'rgba(212,168,67,.04)' }}>
        <div style={{ fontWeight: 700, fontSize: 14,
          marginBottom: 10, display: 'flex', gap: 8, color: '#e6edf3',
          fontFamily: "'Outfit', sans-serif" }}>
          &#127942; Your Goal
        </div>
        <GoalSelector
          athleteProfile={athleteProfile}
          onGoalSet={(goal) => {
            // Save goal even for competitive tier
            try {
              const profile = JSON.parse(
                localStorage.getItem('strive-profile') || '{}'
              );
              profile.goal = goal;
              localStorage.setItem('strive-profile',
                JSON.stringify(profile));
            } catch {}
          }}
        />
        <div style={{ fontSize: 11, color: 'rgba(221,224,237,.4)',
          marginTop: 8, fontStyle: 'italic' }}>
          Your goal is saved. Upgrade to Elite to activate
          your full training program.
        </div>
      </div>

      {/* Static preview panels — not blurred, but placeholder data */}
      {['\uD83D\uDCAA Strength + Conditioning', '\uD83E\uDDE0 Mental Game',
        '\uD83E\uDD57 Nutrition', '\uD83E\uDE79 Injury Prevention',
        '\uD83C\uDFAF Skill Development'].map((label, i) => (
        <div key={i} style={{ margin: '0 16px 8px',
          border: '1px solid rgba(255,255,255,.06)',
          borderRadius: 9, padding: '12px 16px',
          opacity: 0.6 }}>
          <div style={{ fontWeight: 700, fontSize: 13,
            marginBottom: 6, display: 'flex',
            justifyContent: 'space-between', alignItems: 'center',
            fontFamily: "'Outfit', sans-serif", color: '#e6edf3' }}>
            <span>{label}</span>
            <span style={{ fontSize: 10,
              color: 'rgba(139,111,212,.8)',
              fontFamily: "'SF Mono', 'Fira Mono', monospace",
              background: 'rgba(139,111,212,.1)',
              border: '1px solid rgba(139,111,212,.2)',
              borderRadius: 4, padding: '1px 7px' }}>
              ELITE
            </span>
          </div>
          <div style={{ fontSize: 11,
            color: 'rgba(221,224,237,.4)',
            fontStyle: 'italic' }}>
            Your personalized plan will appear here,
            updated after every analysis.
          </div>
        </div>
      ))}

      {/* Upgrade CTA */}
      <div style={{ margin: '16px 16px 0',
        background: 'rgba(139,111,212,.08)',
        border: '1px solid rgba(139,111,212,.35)',
        borderRadius: 9, padding: '16px 18px',
        textAlign: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 700,
          color: '#b09ef0', marginBottom: 6 }}>
          Your goals are set.
        </div>
        <div style={{ fontSize: 12,
          color: 'rgba(221,224,237,.6)',
          lineHeight: 1.55, marginBottom: 14 }}>
          Unlock your full AI training program &mdash; daily
          conditioning, mental prep, nutrition, and
          injury prevention &mdash; all built from your videos.
        </div>
        <button
          onClick={onUpgrade}
          style={{ background: 'rgba(139,111,212,.2)',
            border: '1px solid rgba(139,111,212,.5)',
            borderRadius: 8, padding: '10px 24px',
            fontSize: 13, fontWeight: 700,
            color: '#b09ef0', cursor: 'pointer',
            minHeight: 44, width: '100%',
            fontFamily: "'Outfit', sans-serif" }}>
          Unlock Mastermind &mdash; Elite $19.99/mo
        </button>
        <div style={{ fontSize: 11,
          color: 'rgba(221,224,237,.3)', marginTop: 8 }}>
          $199/yr &middot; save 17% &middot; full season training partner
        </div>
      </div>

    </div>
  );
}
