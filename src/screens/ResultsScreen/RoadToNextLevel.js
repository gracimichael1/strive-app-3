import React from 'react';
import { LEVELS, LEVEL_SKILLS } from '../../data/constants';

const COLORS = {
  surface: '#0d1422',
  surface2: '#121b2d',
  gold: '#e8962a',
  goldLight: '#ffc15a',
  green: '#22c55e',
  text: '#E2E8F0',
  textSecondary: '#8890AB',
  textMuted: '#8A90AA',
  border: 'rgba(232, 150, 42, 0.12)',
};

// Map event names to LEVEL_SKILLS keys
function eventToKey(event) {
  if (!event) return null;
  const e = event.toLowerCase();
  if (e.includes('vault')) return 'vault';
  if (e.includes('bar') || e.includes('uneven')) return 'bars';
  if (e.includes('beam')) return 'beam';
  if (e.includes('floor')) return 'floor';
  if (e.includes('pommel')) return 'bars'; // fallback
  if (e.includes('ring')) return 'bars';   // fallback
  if (e.includes('parallel')) return 'bars';
  if (e.includes('high bar')) return 'bars';
  return null;
}

// Find the next level for a given current level
function getNextLevel(currentLevel) {
  if (!currentLevel) return null;

  // Combine all tracks (women + men) into searchable arrays
  const allTracks = [
    ...Object.values(LEVELS.women),
    ...Object.values(LEVELS.men),
  ].filter(arr => arr.length > 0);

  for (const track of allTracks) {
    const idx = track.indexOf(currentLevel);
    if (idx !== -1) {
      if (idx < track.length - 1) {
        return track[idx + 1];
      }
      return null; // Already at highest level in this track
    }
  }
  return null;
}

// Parse skill string into individual skills for comparison
function parseSkills(skillStr) {
  if (!skillStr) return [];
  return skillStr.split(',').map(s => s.trim()).filter(Boolean);
}

function RoadToNextLevel({ profile, result }) {
  const currentLevel = profile?.level;
  const event = result?.event;

  if (!currentLevel) return null;

  const nextLevel = getNextLevel(currentLevel);
  const eventKey = eventToKey(event);

  // At the top of their track
  if (!nextLevel) {
    return (
      <div
        style={{
          margin: '12px 20px 0',
          background: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 16,
          padding: 20,
        }}
        role="region"
        aria-label="Level progression"
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: COLORS.gold,
            letterSpacing: 1,
            textTransform: 'uppercase',
            marginBottom: 12,
            fontFamily: "'Outfit', sans-serif",
          }}
        >
          Level Progression
        </div>
        <div
          style={{
            textAlign: 'center',
            padding: '12px 0',
          }}
        >
          <div
            style={{
              fontSize: 24,
              marginBottom: 8,
            }}
            aria-hidden="true"
          >
            &#9733;
          </div>
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: COLORS.gold,
              fontFamily: "'Outfit', sans-serif",
              marginBottom: 8,
            }}
          >
            You've reached the top!
          </div>
          <div
            style={{
              fontSize: 13,
              color: COLORS.textSecondary,
              fontFamily: "'Outfit', sans-serif",
              lineHeight: 1.6,
            }}
          >
            You're competing at {currentLevel} — the highest level in your track.
            Keep refining your skills and chasing those perfect scores.
          </div>
        </div>
      </div>
    );
  }

  // Get skills for current and next level
  const currentSkillData = LEVEL_SKILLS[currentLevel];
  const nextSkillData = LEVEL_SKILLS[nextLevel];

  if (!nextSkillData || !eventKey) return null;

  const nextSkillsStr = nextSkillData[eventKey];
  if (!nextSkillsStr) return null;

  const currentSkillsStr = currentSkillData ? (currentSkillData[eventKey] || '') : '';
  const currentSkills = parseSkills(currentSkillsStr);
  const nextSkills = parseSkills(nextSkillsStr);

  // Determine which skills are new vs. already known
  // A skill is "already known" if it appears (case-insensitive substring match) in the current level
  const currentLower = currentSkills.map(s => s.toLowerCase());

  const skillItems = nextSkills.map(skill => {
    const skillLower = skill.toLowerCase();
    const alreadyHas = currentLower.some(cs =>
      skillLower.includes(cs) || cs.includes(skillLower)
    );
    return { name: skill, isNew: !alreadyHas };
  });

  const newCount = skillItems.filter(s => s.isNew).length;

  return (
    <div
      style={{
        margin: '12px 20px 0',
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 16,
        padding: 20,
      }}
      role="region"
      aria-label={`Road to ${nextLevel}`}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: COLORS.gold,
          letterSpacing: 1,
          textTransform: 'uppercase',
          marginBottom: 4,
          fontFamily: "'Outfit', sans-serif",
        }}
      >
        Road to the Next Level
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: COLORS.text,
          fontFamily: "'Outfit', sans-serif",
          marginBottom: 4,
        }}
      >
        Your Road to {nextLevel}
      </div>
      <div
        style={{
          fontSize: 13,
          color: COLORS.textSecondary,
          fontFamily: "'Outfit', sans-serif",
          marginBottom: 16,
          lineHeight: 1.5,
        }}
      >
        Here's what you're working toward on {event || 'this event'}.
        {newCount > 0 && ` ${newCount} new skill${newCount > 1 ? 's' : ''} to master.`}
      </div>

      {skillItems.map((item, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            padding: '8px 0',
            borderBottom: i < skillItems.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
          }}
        >
          <span
            style={{
              fontSize: 14,
              flexShrink: 0,
              lineHeight: 1.5,
              color: item.isNew ? COLORS.gold : COLORS.green,
              width: 20,
              textAlign: 'center',
            }}
            aria-label={item.isNew ? 'New skill to learn' : 'Skill already mastered'}
          >
            {item.isNew ? '\u2605' : '\u2713'}
          </span>
          <div style={{ flex: 1 }}>
            <span
              style={{
                fontSize: 13,
                color: COLORS.text,
                fontFamily: "'Outfit', sans-serif",
                lineHeight: 1.5,
              }}
            >
              {item.name}
            </span>
            {item.isNew && (
              <span
                style={{
                  display: 'inline-block',
                  marginLeft: 8,
                  fontSize: 10,
                  fontWeight: 700,
                  color: COLORS.gold,
                  background: 'rgba(232, 150, 42, 0.1)',
                  border: '1px solid rgba(232, 150, 42, 0.2)',
                  borderRadius: 6,
                  padding: '2px 6px',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  fontFamily: "'Outfit', sans-serif",
                  verticalAlign: 'middle',
                }}
              >
                New
              </span>
            )}
          </div>
        </div>
      ))}

      <div
        style={{
          marginTop: 16,
          paddingTop: 12,
          borderTop: '1px solid rgba(255,255,255,0.05)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              fontSize: 12,
              color: COLORS.green,
              fontFamily: "'Space Mono', monospace",
              fontWeight: 700,
            }}
          >
            {skillItems.filter(s => !s.isNew).length}/{skillItems.length}
          </span>
          <span
            style={{
              fontSize: 12,
              color: COLORS.textMuted,
              fontFamily: "'Outfit', sans-serif",
            }}
          >
            skills ready
          </span>
        </div>
        <div
          style={{
            flex: 1,
            maxWidth: 120,
            height: 6,
            background: COLORS.surface2,
            borderRadius: 3,
            marginLeft: 12,
            overflow: 'hidden',
          }}
          role="progressbar"
          aria-valuenow={skillItems.filter(s => !s.isNew).length}
          aria-valuemin={0}
          aria-valuemax={skillItems.length}
        >
          <div
            style={{
              height: '100%',
              width: `${skillItems.length > 0 ? (skillItems.filter(s => !s.isNew).length / skillItems.length) * 100 : 0}%`,
              background: `linear-gradient(90deg, ${COLORS.green}, ${COLORS.gold})`,
              borderRadius: 3,
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default React.memo(RoadToNextLevel);
