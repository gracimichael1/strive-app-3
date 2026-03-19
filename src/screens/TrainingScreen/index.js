import React, { useState } from 'react';
import { safeStr, safeArray } from '../../utils/helpers';

const COLORS = {
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

function CollapsibleSection({ title, icon, color, defaultOpen, children }) {
  const [open, setOpen] = useState(defaultOpen || false);

  return (
    <div
      style={{
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 16,
        overflow: 'hidden',
        marginBottom: 12,
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '16px 20px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: `${color}15`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            fontSize: 18,
          }}
          aria-hidden="true"
        >
          {icon}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.text, fontFamily: "'Outfit', sans-serif" }}>
            {title}
          </div>
        </div>
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="rgba(255,255,255,0.3)"
          strokeWidth="1.8"
          style={{
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s',
            flexShrink: 0,
          }}
          aria-hidden="true"
        >
          <path d="M2 5l5 4 5-4" />
        </svg>
      </button>
      {open && (
        <div style={{ padding: '0 20px 20px' }}>
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * TrainingScreen — dedicated training tab.
 *
 * @param {Object}   props.profile    - Athlete profile
 * @param {string}   props.tier       - 'free' | 'competitive' | 'elite'
 * @param {Array}    props.drills     - Drill recommendations from fault intelligence
 * @param {Array}    props.strengths  - Strength program items
 * @param {Array}    props.mentalTips - Mental training items
 * @param {Array}    props.nutrition  - Nutrition guidance items
 * @param {Object}   props.result     - Analysis result (drills/training extracted if direct props not provided)
 * @param {function} props.onBack     - Navigate back to dashboard
 */
function TrainingScreen({ profile, tier, drills, strengths, mentalTips, nutrition, result, onBack }) {
  const normalizedTier = (tier || 'free').toLowerCase();
  // Extract training data from result if direct props not provided
  const drillList = safeArray(drills || result?.trainingProgram?.drills || result?.drills);
  const strengthList = safeArray(strengths || result?.trainingProgram?.strength || result?.strength);
  const mentalList = safeArray(mentalTips || result?.trainingProgram?.mental || result?.mentalTraining);
  const nutritionList = safeArray(nutrition || result?.trainingProgram?.nutrition || result?.nutrition);

  // Default content when no data provided
  const defaultDrills = drillList.length > 0 ? drillList : [
    { name: 'Stick-It Landings', reps: '10 reps x 3 sets', focus: 'Landing control and stability' },
    { name: 'Wall Handstand Holds', reps: '30 sec x 4 sets', focus: 'Arm and shoulder alignment' },
    { name: 'Relevé Balance on Beam', reps: '15 sec each foot x 4', focus: 'Balance and ankle strength' },
  ];

  const defaultStrength = strengthList.length > 0 ? strengthList : [
    { name: 'Hollow Body Holds', reps: '30 sec x 4', focus: 'Core compression' },
    { name: 'Pistol Squats', reps: '8 each leg x 3', focus: 'Landing leg strength' },
    { name: 'Pull-ups', reps: '5-8 reps x 3', focus: 'Upper body power' },
    { name: 'Box Jumps', reps: '10 reps x 3', focus: 'Explosive power' },
  ];

  const defaultMental = mentalList.length > 0 ? mentalList : [
    { name: 'Routine Visualization', duration: '5 minutes', tip: 'Close your eyes and walk through your routine mentally, feeling each skill.' },
    { name: 'Breathing Resets', duration: '2 minutes', tip: 'Box breathing: 4 counts in, 4 hold, 4 out, 4 hold. Use before competing.' },
    { name: 'Positive Self-Talk', duration: 'Ongoing', tip: 'Replace "don\'t fall" with "stick it strong." Focus on what you want, not what you fear.' },
  ];

  const defaultNutrition = nutritionList.length > 0 ? nutritionList : [
    { name: 'Pre-Practice Fuel', tip: 'Eat a balanced snack 60-90 minutes before practice. Banana + peanut butter, or oatmeal with berries.' },
    { name: 'Recovery Window', tip: 'Eat protein + carbs within 30 minutes after practice. Chocolate milk, Greek yogurt, or a smoothie.' },
    { name: 'Hydration', tip: 'Drink half your body weight in ounces of water daily. Sip throughout practice, not just when thirsty.' },
  ];

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '16px 20px 100px',
        maxWidth: 540,
        margin: '0 auto',
      }}
      role="main"
      aria-label="Training program"
    >
      {onBack && (
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            color: COLORS.gold,
            cursor: 'pointer',
            fontFamily: "'Outfit', sans-serif",
            fontSize: 15,
            fontWeight: 600,
            marginBottom: 16,
            padding: '8px 0',
            minHeight: 44,
          }}
          aria-label="Back to dashboard"
        >
          ← Dashboard
        </button>
      )}
      <h1
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: COLORS.text,
          fontFamily: "'Outfit', sans-serif",
          margin: '0 0 4px 0',
        }}
      >
        Training
      </h1>
      <div
        style={{
          fontSize: 13,
          color: COLORS.textSecondary,
          marginBottom: 24,
          fontFamily: "'Outfit', sans-serif",
        }}
      >
        Your personalized program based on analysis data
      </div>

      {/* Drills */}
      <CollapsibleSection
        title="Drills"
        icon={"\u2699"}
        color={COLORS.gold}
        defaultOpen={true}
      >
        {defaultDrills.map((drill, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              gap: 12,
              padding: '12px 0',
              borderBottom: i < defaultDrills.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: COLORS.surface3,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: "'Space Mono', monospace",
                fontSize: 12,
                fontWeight: 700,
                color: COLORS.gold,
                flexShrink: 0,
              }}
            >
              {i + 1}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text, fontFamily: "'Outfit', sans-serif" }}>
                {safeStr(drill.name, drill)}
              </div>
              {drill.reps && (
                <div style={{ fontSize: 12, color: COLORS.gold, fontFamily: "'Space Mono', monospace", marginTop: 2 }}>
                  {drill.reps}
                </div>
              )}
              {drill.focus && (
                <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 2, fontFamily: "'Outfit', sans-serif" }}>
                  {drill.focus}
                </div>
              )}
            </div>
          </div>
        ))}
      </CollapsibleSection>

      {/* Strength */}
      <CollapsibleSection
        title="Strength Program"
        icon={"\u2B50"}
        color={COLORS.green}
      >
        {defaultStrength.map((item, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 0',
              borderBottom: i < defaultStrength.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: COLORS.text, fontFamily: "'Outfit', sans-serif" }}>
                {safeStr(item.name, item)}
              </div>
              {item.focus && (
                <div style={{ fontSize: 11, color: COLORS.textSecondary, marginTop: 2, fontFamily: "'Outfit', sans-serif" }}>
                  {item.focus}
                </div>
              )}
            </div>
            {item.reps && (
              <div style={{ fontSize: 12, color: COLORS.textMuted, fontFamily: "'Space Mono', monospace", flexShrink: 0, marginLeft: 12 }}>
                {item.reps}
              </div>
            )}
          </div>
        ))}
      </CollapsibleSection>

      {/* Mental Training */}
      <CollapsibleSection
        title="Mental Training"
        icon={"\u2728"}
        color="#8B5CF6"
      >
        {defaultMental.map((item, i) => (
          <div
            key={i}
            style={{
              padding: '12px 0',
              borderBottom: i < defaultMental.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text, fontFamily: "'Outfit', sans-serif" }}>
                {safeStr(item.name, item)}
              </div>
              {item.duration && (
                <div style={{ fontSize: 11, color: COLORS.textMuted, fontFamily: "'Space Mono', monospace" }}>
                  {item.duration}
                </div>
              )}
            </div>
            {item.tip && (
              <div style={{ fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.5, fontFamily: "'Outfit', sans-serif" }}>
                {item.tip}
              </div>
            )}
          </div>
        ))}
      </CollapsibleSection>

      {/* Nutrition */}
      <CollapsibleSection
        title="Nutrition Guidance"
        icon={"\u2615"}
        color={COLORS.orange}
      >
        {defaultNutrition.map((item, i) => (
          <div
            key={i}
            style={{
              padding: '12px 0',
              borderBottom: i < defaultNutrition.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text, marginBottom: 4, fontFamily: "'Outfit', sans-serif" }}>
              {safeStr(item.name, item)}
            </div>
            {item.tip && (
              <div style={{ fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.5, fontFamily: "'Outfit', sans-serif" }}>
                {item.tip}
              </div>
            )}
          </div>
        ))}
      </CollapsibleSection>

      {/* Tier gate for free users */}
      {normalizedTier === 'free' && (
        <div
          style={{
            background: 'rgba(232,150,42,0.05)',
            border: '1px solid rgba(232,150,42,0.2)',
            borderRadius: 16,
            padding: 20,
            textAlign: 'center',
            marginTop: 8,
          }}
          role="region"
          aria-label="Upgrade for full training program"
        >
          <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text, marginBottom: 6, fontFamily: "'Outfit', sans-serif" }}>
            Unlock your full training program
          </div>
          <div style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 12, fontFamily: "'Outfit', sans-serif" }}>
            Competitive and Elite members get personalized drills based on their actual analysis data.
          </div>
        </div>
      )}
    </div>
  );
}

export default React.memo(TrainingScreen);
