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

// ── GRADE CONFIG ──
const GRADE_COLOR = {
  'A+': '#22c55e', 'A': '#22c55e', 'A-': '#4ade80',
  'B+': '#4ade80', 'B': '#ffc15a', 'B-': '#ffc15a',
  'C+': '#e06820', 'C': '#e06820', 'C-': '#dc2626',
  'D+': '#dc2626', 'D': '#dc2626', 'F': '#8b72d4',
};

const GRADE_LABEL_MAP = {
  'A+': 'Perfect', 'A': 'Excellent', 'A-': 'Very Good',
  'B+': 'Good+', 'B': 'Good', 'B-': 'Good\u2212',
  'C+': 'Average+', 'C': 'Average', 'C-': 'Below Avg',
  'D+': 'Needs Work', 'D': 'Poor', 'F': 'Fall',
};

const SEV_COLORS = {
  small: '#22c55e',
  medium: '#f59e0b',
  large: '#e06820',
  veryLarge: '#dc2626',
  'very large': '#dc2626',
  fall: '#dc2626',
};

function getGrade(deduction) {
  if (deduction == null) return 'B';
  if (deduction <= 0.05) return 'A+';
  if (deduction <= 0.10) return 'A';
  if (deduction <= 0.15) return 'A-';
  if (deduction <= 0.20) return 'B+';
  if (deduction <= 0.25) return 'B';
  if (deduction <= 0.30) return 'B-';
  if (deduction <= 0.35) return 'C+';
  if (deduction <= 0.40) return 'C';
  if (deduction <= 0.50) return 'C-';
  if (deduction <= 0.60) return 'D+';
  if (deduction <= 0.75) return 'D';
  if (deduction <= 0.90) return 'D-';
  return 'F';
}

function dedColor(amt) {
  if (amt <= 0.05) return '#22c55e';
  if (amt <= 0.10) return '#ffc15a';
  if (amt <= 0.20) return '#e06820';
  return '#dc2626';
}

function formatTimestamp(ts) {
  if (!ts && ts !== 0) return '';
  if (typeof ts === 'string') return ts;
  const mins = Math.floor(ts / 60);
  const secs = (ts % 60).toFixed(0).padStart(2, '0');
  return `${mins}:${secs}`;
}

// ── GRADE CIRCLE — matches old ResultsScreen style ──
function GradeCircle({ grade, size = 48 }) {
  const color = GRADE_COLOR[grade] || '#e8962a';
  const label = GRADE_LABEL_MAP[grade] || '';
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        flexShrink: 0,
        border: `2.5px solid ${color}`,
        background: `${color}14`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      aria-label={`Grade ${grade}: ${label}`}
    >
      <div
        style={{
          fontSize: size * 0.30,
          fontWeight: 900,
          color,
          fontFamily: "'Space Mono', monospace",
          lineHeight: 1,
        }}
      >
        {grade}
      </div>
      <div
        style={{
          fontSize: size * 0.13,
          color: `${color}AA`,
          fontWeight: 600,
          marginTop: 1,
          fontFamily: "'Outfit', sans-serif",
        }}
      >
        {label}
      </div>
    </div>
  );
}

// ── BIOMECHANICS ESTIMATION ── derive plausible measured vs ideal angles from fault text
function estimateBiomechanics(skill) {
  const faultText = safeStr(skill?.fault || '', '').toLowerCase();
  const faults = safeArray(skill?.subFaults || skill?.faults || skill?.deductionHints);
  const allFaultText = faults.map(f => safeStr(f?.fault || f?.name || f, '')).join(' ').toLowerCase() + ' ' + faultText;
  const angles = [];
  if (allFaultText.includes('knee') || allFaultText.includes('leg') || allFaultText.includes('bent'))
    angles.push({ label: 'Knee', measured: 155, ideal: 180 });
  if (allFaultText.includes('arm') || allFaultText.includes('elbow'))
    angles.push({ label: 'Elbow', measured: 160, ideal: 180 });
  if (allFaultText.includes('split') || allFaultText.includes('leap'))
    angles.push({ label: 'Split', measured: 110, ideal: 150 });
  if (allFaultText.includes('pike') || allFaultText.includes('arch') || allFaultText.includes('body') || allFaultText.includes('hip'))
    angles.push({ label: 'Hip', measured: 165, ideal: 180 });
  if (allFaultText.includes('shoulder') || allFaultText.includes('cast'))
    angles.push({ label: 'Shoulder', measured: 160, ideal: 180 });
  if (allFaultText.includes('landing') || allFaultText.includes('squat') || allFaultText.includes('step'))
    angles.push({ label: 'Knee (landing)', measured: 140, ideal: 170 });
  return angles.slice(0, 4);
}

// ── CORRECT FORM DESCRIPTIONS ──
function getCorrectForm(skill) {
  const name = safeStr(skill?.skill || skill?.skillName || skill?.name, '').toLowerCase();
  if (name.includes('round-off') || name.includes('roundoff'))
    return 'Arms locked straight through support phase. Legs snapped together at vertical. Powerful snap-down with chest up, landing in hollow body position. No arch through back.';
  if (name.includes('back handspring') || name.includes('bhs'))
    return 'Sit-back with arms driving overhead. Hands reach floor with locked elbows. Body passes through tight arch, then snaps to hollow. Legs together, toes pointed throughout.';
  if (name.includes('back tuck') || name.includes('backflip'))
    return 'Strong vertical takeoff with arm lift. Tight tuck position \u2014 knees together, chin neutral. Quick rotation with early spot of landing. Stick with chest up, knees slightly bent to absorb.';
  if (name.includes('back layout') || name.includes('back pike'))
    return 'Maximum height off takeoff. Body fully extended (layout) or tight pike angle. Arms by ears or sides. Complete rotation with early opening to spot landing. Controlled stick.';
  if (name.includes('split leap') || name.includes('switch leap'))
    return 'Strong takeoff from one foot. Maximum split angle at peak height. Hips square, chest lifted. Toes pointed, legs fully extended. Controlled landing in demi-plié.';
  if (name.includes('full turn') || name.includes('turn'))
    return 'Rise to full relevé on supporting leg. Free leg in clean passé, turned out. Arms tight, core engaged. Complete 360° rotation without wobble. Finish in controlled position.';
  if (name.includes('cartwheel'))
    return 'Hand-hand-foot-foot rhythm in a straight line. Legs fully split through vertical. Arms locked. Pass through handstand with body in one plane. Controlled finish.';
  if (name.includes('walkover'))
    return 'Controlled reach back with legs splitting through vertical. Shoulders stacked over hands. Full split visible at top. Smooth weight transfer to feet, finish standing tall.';
  if (name.includes('landing') || name.includes('dismount'))
    return 'Land with feet together, slight knee bend to absorb. Chest up, arms forward then lifted to salute. No steps, hops, or extra movement. Hold finish position for 1-2 seconds.';
  if (name.includes('pose') || name.includes('salute'))
    return 'Strong, confident start position. Eye contact with judges. Arms in controlled position. Core engaged, standing tall. Clean presentation.';
  return 'Full extension through every position. Pointed toes, locked knees where required. Clean body lines with no unnecessary movement. Controlled throughout.';
}

/**
 * Rich SkillCard — matches the old LegacyApp GradedSkillCard UI with:
 * - Grade circle with label
 * - Sub-tabs: Overview, Bio, Injury, Drills
 * - Biomechanics angle grid with measured/ideal and progress bars
 * - Correct form descriptions
 * - Strength callouts
 * - Targeted drills per skill
 * - Injury awareness
 */
function SkillCard({ skill, index, onSeek, defaultExpanded }) {
  const [expanded, setExpanded] = useState(defaultExpanded || false);
  const [cardTab, setCardTab] = useState('overview');

  if (!skill) return null;

  const skillName = safeStr(skill.skill || skill.skillName || skill.name, 'Unknown Skill');
  const deduction = typeof skill.deduction === 'number' ? skill.deduction : (typeof skill.gradeDeduction === 'number' ? skill.gradeDeduction : 0);
  const grade = skill.grade || getGrade(deduction);
  const gradeColor = GRADE_COLOR[grade] || '#e8962a';
  const timestamp = skill.timestamp || skill.time || '';
  const faults = safeArray(skill.subFaults || skill.faults || skill.deductionHints);
  const hasInjuryRisk = !!(skill.injuryRisk || skill.physicalRisk);
  const injuryText = safeStr(skill.injuryRisk || skill.injuryNote || skill.physicalRisk, 'This skill has physical risk factors. Ensure proper conditioning before progression.');
  const drillRec = safeStr(skill.drillRecommendation || skill.drill, '');
  const strengthNote = safeStr(skill.strengthNote || skill.strength, '');
  const isClean = faults.length === 0 && deduction === 0;
  const bodyMechanics = skill.bodyMechanics || null;

  // Left border color based on grade
  const gradeGroup = (grade || '').charAt(0);
  const borderLeftColor = gradeGroup === 'A' ? '#22c55e' : gradeGroup === 'B' ? '#e8962a' : gradeGroup === 'C' ? '#e06820' : '#dc2626';

  // Biomechanics: angle estimation from fault text
  const bioAngles = skill.biomechanics && Array.isArray(skill.biomechanics) ? skill.biomechanics : estimateBiomechanics(skill);

  // Parse sub-faults for detailed breakdown
  const subFaults = (() => {
    if (faults.length > 0) return null; // use structured faults instead
    const faultText = safeStr(skill.fault || skill.reason, '');
    if (!faultText) return [];
    const parts = faultText
      .split(/;\s*|(?<!\d)\.(?!\d)(?![^(]*\))\s+/)
      .map(s => s.trim().replace(/\.$/, ''))
      .filter(s => s.length > 3);
    if (parts.length <= 1) return [{ text: faultText, amount: deduction }];
    const each = Math.round((deduction / parts.length) * 100) / 100;
    return parts.map((text, i) => ({
      text,
      amount: i === parts.length - 1
        ? Math.round((deduction - each * (parts.length - 1)) * 100) / 100
        : each,
    }));
  })();

  // Correct form description
  const correctForm = getCorrectForm(skill);

  // Card tabs
  const cardTabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'bio', label: 'Bio' },
    { id: 'injury', label: 'Injury' },
    { id: 'drills', label: 'Drills' },
  ];

  return (
    <div
      style={{
        margin: '0 20px 10px',
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${expanded ? gradeColor + '40' : 'rgba(255,255,255,0.07)'}`,
        borderLeft: `3px solid ${borderLeftColor}`,
        borderRadius: 14,
        overflow: 'hidden',
        transition: 'border-color 0.2s',
      }}
      role="region"
      aria-label={`Skill ${index}: ${skillName}, grade ${grade}`}
    >
      {/* ── Header ── */}
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-controls={`skill-detail-${index}`}
        style={{
          width: '100%',
          textAlign: 'left',
          padding: '14px 16px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}
      >
        {/* Grade Circle */}
        <GradeCircle grade={grade} size={48} />

        {/* Skill info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: COLORS.text,
              marginBottom: 3,
              fontFamily: "'Outfit', sans-serif",
            }}
          >
            {skillName}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {timestamp && (
              <span
                style={{
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.35)',
                  fontFamily: "'Space Mono', monospace",
                }}
              >
                {formatTimestamp(timestamp)}
              </span>
            )}
            {skill.type && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: '1px 8px',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.05)',
                  color: 'rgba(255,255,255,0.35)',
                  textTransform: 'uppercase',
                }}
              >
                {skill.type}
              </span>
            )}
            {hasInjuryRisk && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: COLORS.red,
                }}
              >
                Injury Risk
              </span>
            )}
          </div>
          {/* Preview fault text when collapsed */}
          {!expanded && (skill.fault || faults.length > 0) && deduction > 0 && (
            <div
              style={{
                fontSize: 12,
                color: 'rgba(255,255,255,0.4)',
                marginTop: 4,
                lineHeight: 1.4,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {safeStr(skill.fault || (faults[0] && (faults[0].fault || faults[0].name)), '')}
            </div>
          )}
        </div>

        {/* Deduction or clean badge */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          {isClean ? (
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: '#22c55e',
                padding: '4px 10px',
                borderRadius: 20,
                background: 'rgba(34,197,94,0.1)',
                border: '1px solid rgba(34,197,94,0.2)',
              }}
            >
              Clean
            </div>
          ) : (
            <div
              style={{
                fontSize: 18,
                fontWeight: 800,
                color: gradeColor,
                fontFamily: "'Space Mono', monospace",
              }}
            >
              -{deduction.toFixed(2)}
            </div>
          )}
        </div>

        {/* Chevron */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="rgba(255,255,255,0.3)"
          strokeWidth="1.8"
          style={{
            transform: expanded ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s',
            flexShrink: 0,
          }}
          aria-hidden="true"
        >
          <path d="M2 5l5 4 5-4" />
        </svg>
      </button>

      {/* ── Expanded detail ── */}
      {expanded && (
        <div
          id={`skill-detail-${index}`}
          style={{ padding: '0 16px 16px' }}
        >
          {/* Seek button + timestamp */}
          {timestamp && onSeek && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <button
                onClick={() => onSeek(skill.timestampSec || timestamp)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '5px 10px',
                  borderRadius: 6,
                  background: 'rgba(232,150,42,0.1)',
                  border: '1px solid rgba(232,150,42,0.2)',
                  color: COLORS.gold,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: "'Space Mono', monospace",
                }}
                aria-label={`Jump to ${formatTimestamp(timestamp)} in video`}
              >
                <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                  <path d="M3 2l7 4-7 4V2z" />
                </svg>
                Jump to {formatTimestamp(timestamp)}
              </button>
            </div>
          )}

          {/* Sub-tab selector */}
          <div
            style={{
              display: 'flex',
              gap: 2,
              marginBottom: 14,
              background: 'rgba(255,255,255,0.02)',
              borderRadius: 10,
              padding: 2,
            }}
          >
            {cardTabs.map(t => (
              <button
                key={t.id}
                onClick={() => setCardTab(t.id)}
                style={{
                  flex: 1,
                  padding: '6px 4px',
                  borderRadius: 8,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 10,
                  fontWeight: 600,
                  fontFamily: "'Outfit', sans-serif",
                  background: cardTab === t.id ? COLORS.gold : 'transparent',
                  color: cardTab === t.id ? '#070c16' : 'rgba(255,255,255,0.4)',
                  transition: 'all 0.15s',
                  minHeight: 28,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* ═══ TAB: OVERVIEW ═══ */}
          {cardTab === 'overview' && (
            <>
              {/* Deductions found */}
              {faults.length > 0 ? (
                <div
                  style={{
                    marginBottom: 12,
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: 'rgba(224,104,32,0.04)',
                    border: '1px solid rgba(224,104,32,0.15)',
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: COLORS.orange,
                      letterSpacing: 1,
                      textTransform: 'uppercase',
                      marginBottom: 8,
                    }}
                  >
                    Deductions Found
                  </div>
                  {faults.map((fault, i) => {
                    const faultName = safeStr(fault.fault || fault.name || fault, '');
                    const faultFix = safeStr(fault.correction || fault.fix || fault.detail, '');
                    const faultDrill = safeStr(fault.drill || fault.drillRecommendation, '');
                    const severity = fault.severity || 'medium';
                    const sevColor = SEV_COLORS[severity] || SEV_COLORS[severity?.replace(/\s+/g, '')] || COLORS.gold;
                    const faultDed = typeof fault.deduction === 'number' ? fault.deduction : null;

                    return (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          alignItems: 'stretch',
                          gap: 10,
                          marginBottom: 6,
                          padding: '6px 10px',
                          borderRadius: 8,
                          background: 'rgba(255,255,255,0.02)',
                          border: '1px solid rgba(255,255,255,0.05)',
                        }}
                      >
                        {/* Severity bar */}
                        <div
                          style={{
                            width: 3,
                            borderRadius: 2,
                            background: sevColor,
                            flexShrink: 0,
                          }}
                          aria-label={`${severity} severity`}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 12,
                              color: COLORS.text,
                              lineHeight: 1.5,
                              fontFamily: "'Outfit', sans-serif",
                            }}
                          >
                            {faultName}
                          </div>
                          {faultFix && (
                            <div
                              style={{
                                fontSize: 11,
                                color: COLORS.textSecondary,
                                marginTop: 2,
                                lineHeight: 1.4,
                                fontFamily: "'Outfit', sans-serif",
                              }}
                            >
                              {faultFix}
                            </div>
                          )}
                          {faultDrill && (
                            <div
                              style={{
                                fontSize: 11,
                                color: COLORS.gold,
                                marginTop: 4,
                                fontWeight: 500,
                                fontFamily: "'Outfit', sans-serif",
                              }}
                            >
                              Drill: {faultDrill}
                            </div>
                          )}
                        </div>
                        {faultDed != null && faultDed > 0 && (
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 800,
                              color: sevColor,
                              fontFamily: "'Space Mono', monospace",
                              flexShrink: 0,
                              alignSelf: 'center',
                            }}
                          >
                            -{faultDed.toFixed(2)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : subFaults && subFaults.length > 0 && deduction > 0 ? (
                <div
                  style={{
                    marginBottom: 12,
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: 'rgba(224,104,32,0.04)',
                    border: '1px solid rgba(224,104,32,0.15)',
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: COLORS.orange,
                      letterSpacing: 1,
                      textTransform: 'uppercase',
                      marginBottom: 8,
                    }}
                  >
                    Deductions Found
                  </div>
                  {subFaults.map((sf, i) => {
                    const sColor = dedColor(sf.amount);
                    return (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          alignItems: 'stretch',
                          gap: 10,
                          marginBottom: 6,
                          padding: '6px 10px',
                          borderRadius: 8,
                          background: 'rgba(255,255,255,0.02)',
                          border: '1px solid rgba(255,255,255,0.05)',
                        }}
                      >
                        <div
                          style={{
                            width: 3,
                            borderRadius: 2,
                            background: sColor,
                            flexShrink: 0,
                          }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, color: COLORS.text, lineHeight: 1.5 }}>{sf.text}</div>
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 800,
                            color: sColor,
                            fontFamily: "'Space Mono', monospace",
                            flexShrink: 0,
                            alignSelf: 'center',
                          }}
                        >
                          -{sf.amount.toFixed(2)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : isClean ? (
                <div
                  style={{
                    marginBottom: 12,
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: 'rgba(34,197,94,0.06)',
                    border: '1px solid rgba(34,197,94,0.15)',
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontSize: 14, color: COLORS.green }} aria-hidden="true">&#10003;</span>
                  <span style={{ fontSize: 13, color: COLORS.green, fontFamily: "'Outfit', sans-serif" }}>
                    Clean execution \u2014 no major faults detected
                  </span>
                </div>
              ) : null}

              {/* Correct Form */}
              <div
                style={{
                  marginBottom: 12,
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: 'rgba(34,197,94,0.04)',
                  border: '1px solid rgba(34,197,94,0.15)',
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: COLORS.green,
                    letterSpacing: 1,
                    textTransform: 'uppercase',
                    marginBottom: 4,
                    fontFamily: "'Outfit', sans-serif",
                  }}
                >
                  Correct Form
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'rgba(255,255,255,0.65)',
                    lineHeight: 1.6,
                    fontFamily: "'Outfit', sans-serif",
                  }}
                >
                  {correctForm}
                </div>
              </div>

              {/* Strength */}
              {(strengthNote || isClean) && (
                <div
                  style={{
                    marginBottom: 12,
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: 'rgba(232,150,42,0.04)',
                    border: '1px solid rgba(232,150,42,0.15)',
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: COLORS.gold,
                      letterSpacing: 1,
                      textTransform: 'uppercase',
                      marginBottom: 4,
                      fontFamily: "'Outfit', sans-serif",
                    }}
                  >
                    Strength
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: COLORS.text,
                      lineHeight: 1.6,
                      fontFamily: "'Outfit', sans-serif",
                    }}
                  >
                    {strengthNote || 'Clean execution \u2014 no deduction taken.'}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ═══ TAB: BIOMECHANICS ═══ */}
          {cardTab === 'bio' && (
            <div>
              {/* Angle grid */}
              {bioAngles.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {bioAngles.map((a, i) => {
                    const diff = Math.abs(a.measured - a.ideal);
                    const aColor = diff > 15 ? '#dc2626' : diff > 10 ? '#ffc15a' : '#22c55e';
                    const pct = Math.min(100, (a.measured / a.ideal) * 100);
                    const statusLabel = diff <= 5 ? 'Excellent' : diff <= 10 ? 'Good' : diff <= 20 ? 'Needs work' : 'Significant gap';
                    return (
                      <div
                        key={i}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 10,
                          background: 'rgba(255,255,255,0.02)',
                          border: `1px solid ${aColor}20`,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: 'rgba(255,255,255,0.4)',
                            textTransform: 'uppercase',
                            letterSpacing: 0.5,
                            marginBottom: 4,
                            fontFamily: "'Outfit', sans-serif",
                          }}
                        >
                          {a.label}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
                          <span
                            style={{
                              fontSize: 18,
                              fontWeight: 900,
                              color: aColor,
                              fontFamily: "'Space Mono', monospace",
                            }}
                          >
                            {typeof a.measured === 'number' ? a.measured : parseInt(String(a.measured).replace(/[^\d]/g, ''), 10) || a.measured}°
                          </span>
                          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>/</span>
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: 'rgba(255,255,255,0.4)',
                              fontFamily: "'Space Mono', monospace",
                            }}
                          >
                            {typeof a.ideal === 'number' ? a.ideal : parseInt(String(a.ideal).replace(/[^\d]/g, ''), 10) || a.ideal}°
                          </span>
                        </div>
                        <div
                          style={{
                            height: 4,
                            background: 'rgba(255,255,255,0.06)',
                            borderRadius: 2,
                            overflow: 'hidden',
                            marginBottom: 4,
                          }}
                        >
                          <div
                            style={{
                              height: '100%',
                              width: `${pct}%`,
                              background: aColor,
                              borderRadius: 2,
                              transition: 'width 0.6s ease',
                            }}
                          />
                        </div>
                        <div style={{ fontSize: 9, color: aColor, fontWeight: 600 }}>{statusLabel}</div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Fallback to text-based body mechanics if no angle data */
                bodyMechanics && (bodyMechanics.kneeAngle || bodyMechanics.hipAlignment || bodyMechanics.shoulderPosition || bodyMechanics.toePoint) ? (
                  <div>
                    {[
                      { icon: '\uD83E\uDDB5', label: 'Knee Angle', value: bodyMechanics.kneeAngle },
                      { icon: '\uD83C\uDFCB\uFE0F', label: 'Hip Alignment', value: bodyMechanics.hipAlignment },
                      { icon: '\uD83D\uDCAA', label: 'Shoulder Position', value: bodyMechanics.shoulderPosition },
                      { icon: '\uD83E\uDDB6', label: 'Toe Point', value: bodyMechanics.toePoint },
                    ].filter(row => row.value).map((row, i) => (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 8,
                          padding: '8px 12px',
                          borderBottom: '1px solid rgba(255,255,255,0.03)',
                        }}
                      >
                        <span style={{ fontSize: 14, flexShrink: 0 }} aria-hidden="true">{row.icon}</span>
                        <div style={{ flex: 1 }}>
                          <div
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              color: COLORS.textMuted,
                              textTransform: 'uppercase',
                              letterSpacing: 0.5,
                              fontFamily: "'Outfit', sans-serif",
                              marginBottom: 2,
                            }}
                          >
                            {row.label}
                          </div>
                          <div
                            style={{
                              fontSize: 13,
                              color: COLORS.text,
                              fontFamily: "'Outfit', sans-serif",
                              lineHeight: 1.4,
                            }}
                          >
                            {safeStr(row.value, '')}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    style={{
                      padding: '20px 0',
                      textAlign: 'center',
                      fontSize: 12,
                      color: 'rgba(255,255,255,0.35)',
                    }}
                  >
                    No biomechanics data available for this skill.
                  </div>
                )
              )}
            </div>
          )}

          {/* ═══ TAB: INJURY ═══ */}
          {cardTab === 'injury' && (
            <div>
              {hasInjuryRisk ? (
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 10,
                    background: 'rgba(220,38,38,0.08)',
                    border: '1px solid rgba(220,38,38,0.2)',
                    borderLeft: `3px solid ${COLORS.orange}`,
                  }}
                  role="alert"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <span style={{ fontSize: 16 }} aria-hidden="true">&#9888;&#65039;</span>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: COLORS.orange,
                        fontFamily: "'Outfit', sans-serif",
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                      }}
                    >
                      Injury Awareness
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: COLORS.text,
                      fontFamily: "'Outfit', sans-serif",
                      lineHeight: 1.6,
                    }}
                  >
                    {injuryText}
                  </div>
                  {/* Landing-specific advice */}
                  {(skillName.toLowerCase().includes('landing') || skillName.toLowerCase().includes('tuck') || skillName.toLowerCase().includes('layout') || skillName.toLowerCase().includes('dismount')) && (
                    <div
                      style={{
                        marginTop: 10,
                        padding: '8px 10px',
                        borderRadius: 8,
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.06)',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          color: COLORS.textSecondary,
                          lineHeight: 1.5,
                          fontFamily: "'Outfit', sans-serif",
                        }}
                      >
                        <strong style={{ color: COLORS.orange }}>Landing forces:</strong> Repetitive impact can stress ankles and knees. Ensure proper conditioning and consider landing mats during training.
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div
                  style={{
                    padding: '20px 14px',
                    textAlign: 'center',
                    borderRadius: 10,
                    background: 'rgba(34,197,94,0.04)',
                    border: '1px solid rgba(34,197,94,0.12)',
                  }}
                >
                  <div style={{ fontSize: 14, color: COLORS.green, marginBottom: 4 }}>&#10003;</div>
                  <div
                    style={{
                      fontSize: 13,
                      color: COLORS.green,
                      fontFamily: "'Outfit', sans-serif",
                    }}
                  >
                    No specific injury risks flagged for this skill
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: COLORS.textMuted,
                      marginTop: 6,
                      fontFamily: "'Outfit', sans-serif",
                    }}
                  >
                    Always warm up properly and listen to your body.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══ TAB: DRILLS ═══ */}
          {cardTab === 'drills' && (
            <div>
              {drillRec ? (
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 10,
                    background: 'rgba(34,197,94,0.06)',
                    border: '1px solid rgba(34,197,94,0.15)',
                    borderLeft: `3px solid ${COLORS.green}`,
                    marginBottom: 12,
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: COLORS.green,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      marginBottom: 6,
                      fontFamily: "'Outfit', sans-serif",
                    }}
                  >
                    Targeted Drill
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: COLORS.text,
                      fontFamily: "'Outfit', sans-serif",
                      lineHeight: 1.6,
                    }}
                  >
                    {drillRec}
                  </div>
                </div>
              ) : null}

              {/* Per-fault drills */}
              {faults.filter(f => f.drill || f.drillRecommendation).length > 0 && (
                <div>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: COLORS.gold,
                      letterSpacing: 1,
                      textTransform: 'uppercase',
                      marginBottom: 8,
                      fontFamily: "'Outfit', sans-serif",
                    }}
                  >
                    Drills by Fault
                  </div>
                  {faults.filter(f => f.drill || f.drillRecommendation).map((f, i) => (
                    <div
                      key={i}
                      style={{
                        padding: '8px 10px',
                        marginBottom: 6,
                        borderRadius: 8,
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.05)',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: COLORS.textMuted,
                          marginBottom: 4,
                          fontFamily: "'Outfit', sans-serif",
                        }}
                      >
                        For: {safeStr(f.fault || f.name, 'This fault')}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: COLORS.green,
                          fontFamily: "'Outfit', sans-serif",
                          lineHeight: 1.5,
                        }}
                      >
                        {safeStr(f.drill || f.drillRecommendation, '')}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!drillRec && faults.filter(f => f.drill || f.drillRecommendation).length === 0 && (
                <div
                  style={{
                    padding: '20px 14px',
                    textAlign: 'center',
                    borderRadius: 10,
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      color: COLORS.textMuted,
                      fontFamily: "'Outfit', sans-serif",
                    }}
                  >
                    {isClean ? 'Clean skill \u2014 maintain with regular practice.' : 'No specific drills recommended. Focus on general form work.'}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default React.memo(SkillCard);
