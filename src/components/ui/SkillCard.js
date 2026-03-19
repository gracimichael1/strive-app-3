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

const GRADE_CONFIG = {
  'A+': { bg: 'linear-gradient(135deg, #22c55e, #22c55e)', color: '#000' },
  'A':  { bg: 'linear-gradient(135deg, #22c55e, #22c55e)', color: '#000' },
  'A-': { bg: 'linear-gradient(135deg, #22c55e, #22c55e)', color: '#000' },
  'B+': { bg: 'linear-gradient(135deg, #22c55e, #22c55e)', color: '#000' },
  'B':  { bg: 'linear-gradient(135deg, #22c55e, #22c55e)', color: '#000' },
  'B-': { bg: 'linear-gradient(135deg, #22c55e, #22c55e)', color: '#000' },
  'C+': { bg: 'linear-gradient(135deg, #ffc15a, #e8962a)', color: '#000' },
  'C':  { bg: 'linear-gradient(135deg, #ffc15a, #e8962a)', color: '#000' },
  'C-': { bg: 'linear-gradient(135deg, #ffc15a, #e8962a)', color: '#000' },
  'D+': { bg: 'linear-gradient(135deg, #e06820, #e06820)', color: '#000' },
  'D':  { bg: 'linear-gradient(135deg, #e06820, #e06820)', color: '#000' },
  'D-': { bg: 'linear-gradient(135deg, #e06820, #e06820)', color: '#000' },
  'F':  { bg: 'linear-gradient(135deg, #dc2626, #dc2626)', color: '#fff' },
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

function formatTimestamp(ts) {
  if (!ts && ts !== 0) return '';
  if (typeof ts === 'string') {
    const parts = ts.split(':');
    if (parts.length === 2) return ts;
    return ts;
  }
  const mins = Math.floor(ts / 60);
  const secs = (ts % 60).toFixed(0).padStart(2, '0');
  return `${mins}:${secs}`;
}

function getQualityScoreColor(score) {
  if (score >= 9.5) return COLORS.green;
  if (score >= 9.0) return COLORS.gold;
  if (score >= 8.5) return COLORS.orange;
  return COLORS.red;
}

/**
 * Reusable SkillCard for analysis results.
 *
 * @param {Object}   props.skill       - Skill data from gradedSkills array
 * @param {number}   props.index       - 1-based skill number
 * @param {function} props.onSeek      - Seek video callback (timestamp)
 * @param {boolean}  props.defaultExpanded
 */
function SkillCard({ skill, index, onSeek, defaultExpanded }) {
  const [expanded, setExpanded] = useState(defaultExpanded || false);
  const [mechanicsOpen, setMechanicsOpen] = useState(false);

  if (!skill) return null;

  const skillName = safeStr(skill.skill || skill.skillName || skill.name, 'Unknown Skill');
  const deduction = typeof skill.deduction === 'number' ? skill.deduction : 0;
  const grade = skill.grade || getGrade(deduction);
  const gradeConfig = GRADE_CONFIG[grade] || GRADE_CONFIG['B'];
  const timestamp = skill.timestamp || skill.time || '';
  const faults = safeArray(skill.subFaults || skill.faults || skill.deductionHints);
  const correction = safeStr(skill.correction || skill.fix, '');
  const drill = safeStr(skill.drill || skill.drillRecommendation, '');
  const hasInjuryRisk = !!(skill.injuryRisk || skill.physicalRisk);
  const injuryText = safeStr(skill.injuryRisk || skill.injuryNote || skill.physicalRisk, 'This skill has physical risk factors. Ensure proper conditioning before progression.');
  const drillRec = safeStr(skill.drillRecommendation || skill.drill, '');
  const strengthNote = safeStr(skill.strengthNote, '');
  const qualityScore = typeof skill.qualityScore === 'number' ? skill.qualityScore : null;
  const bodyMechanics = skill.bodyMechanics || null;

  return (
    <div
      style={{
        margin: '0 20px 12px',
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 16,
        overflow: 'hidden',
        transition: 'all 0.2s',
      }}
      role="region"
      aria-label={`Skill ${index}: ${skillName}, grade ${grade}`}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-controls={`skill-detail-${index}`}
        style={{
          width: '100%',
          textAlign: 'left',
          padding: 16,
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        {/* Grade badge */}
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: "'Space Mono', monospace",
            fontSize: 16,
            fontWeight: 700,
            color: gradeConfig.color,
            background: gradeConfig.bg,
            flexShrink: 0,
          }}
          aria-label={`Grade ${grade}`}
        >
          {grade}
        </div>

        {/* Skill info */}
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 15,
              fontWeight: 600,
              marginBottom: 2,
              color: COLORS.text,
              fontFamily: "'Outfit', sans-serif",
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {skillName}
            {/* Quality Score inline */}
            {qualityScore != null && (
              <span
                style={{
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 12,
                  fontWeight: 700,
                  color: getQualityScoreColor(qualityScore),
                }}
                aria-label={`Quality score ${qualityScore.toFixed(2)} out of 10`}
              >
                {qualityScore.toFixed(2)}/10.0
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: 12,
              color: COLORS.textSecondary,
              fontFamily: "'Outfit', sans-serif",
            }}
          >
            {timestamp && formatTimestamp(timestamp)}
            {hasInjuryRisk && (
              <span
                style={{
                  marginLeft: 8,
                  color: COLORS.red,
                  fontWeight: 600,
                  fontSize: 11,
                }}
              >
                Injury Risk
              </span>
            )}
          </div>
        </div>

        {/* Deduction */}
        {deduction > 0 && (
          <div
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 14,
              fontWeight: 700,
              color: COLORS.orange,
              flexShrink: 0,
            }}
          >
            -{deduction.toFixed(2)}
          </div>
        )}

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

      {/* Expanded detail */}
      {expanded && (
        <div
          id={`skill-detail-${index}`}
          style={{
            padding: '0 16px 16px',
            borderTop: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          {/* Seek button */}
          {timestamp && onSeek && (
            <button
              onClick={() => onSeek(timestamp)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 14px',
                borderRadius: 8,
                marginTop: 12,
                marginBottom: 12,
                background: 'rgba(232,150,42,0.1)',
                border: '1px solid rgba(232,150,42,0.2)',
                color: COLORS.gold,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: "'Outfit', sans-serif",
              }}
              aria-label={`Jump to ${formatTimestamp(timestamp)} in video`}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                <path d="M3 2l7 4-7 4V2z" />
              </svg>
              Jump to skill
            </button>
          )}

          {/* Strength note */}
          {strengthNote && (
            <div
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                background: 'rgba(34,197,94,0.06)',
                border: '1px solid rgba(34,197,94,0.15)',
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start',
                marginBottom: 12,
                marginTop: timestamp ? 0 : 12,
              }}
            >
              <span style={{ fontSize: 14, color: COLORS.green, flexShrink: 0 }} aria-hidden="true">&#10003;</span>
              <span style={{ fontSize: 12, color: COLORS.green, fontFamily: "'Outfit', sans-serif", lineHeight: 1.4 }}>
                {strengthNote}
              </span>
            </div>
          )}

          {/* Injury Awareness */}
          {hasInjuryRisk && (
            <div
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                background: 'rgba(220,38,38,0.08)',
                borderLeft: `3px solid ${COLORS.orange}`,
                border: '1px solid rgba(220,38,38,0.2)',
                borderLeftWidth: 3,
                borderLeftColor: COLORS.orange,
                marginBottom: 12,
                marginTop: timestamp && !strengthNote ? 0 : strengthNote ? 0 : 12,
              }}
              role="alert"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 14 }} aria-hidden="true">&#9888;&#65039;</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.orange, fontFamily: "'Outfit', sans-serif", textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Injury Awareness
                </span>
              </div>
              <span style={{ fontSize: 12, color: COLORS.text, fontFamily: "'Outfit', sans-serif", lineHeight: 1.5 }}>
                {injuryText}
              </span>
            </div>
          )}

          {/* Faults list */}
          {faults.length > 0 ? (
            <div style={{ marginTop: faults.length > 0 && !timestamp && !strengthNote && !hasInjuryRisk ? 12 : 0 }}>
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
                      alignItems: 'flex-start',
                      gap: 10,
                      padding: '10px 0',
                      borderBottom: i < faults.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
                    }}
                  >
                    {/* Severity bar */}
                    <div
                      style={{
                        width: 4,
                        height: 32,
                        borderRadius: 2,
                        flexShrink: 0,
                        marginTop: 2,
                        background: sevColor,
                      }}
                      aria-label={`${severity} severity`}
                    />

                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: COLORS.text,
                          fontFamily: "'Outfit', sans-serif",
                        }}
                      >
                        {faultName}
                      </div>
                      {faultFix && (
                        <div
                          style={{
                            fontSize: 12,
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

                    {/* Points */}
                    {faultDed != null && faultDed > 0 && (
                      <div
                        style={{
                          fontFamily: "'Space Mono', monospace",
                          fontSize: 12,
                          color: COLORS.orange,
                          fontWeight: 700,
                          whiteSpace: 'nowrap',
                          alignSelf: 'flex-start',
                        }}
                      >
                        -{faultDed.toFixed(2)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                background: 'rgba(34,197,94,0.06)',
                border: '1px solid rgba(34,197,94,0.15)',
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                marginTop: 12,
              }}
            >
              <span style={{ fontSize: 14, color: COLORS.green }} aria-hidden="true">&#10003;</span>
              <span style={{ fontSize: 13, color: COLORS.green, fontFamily: "'Outfit', sans-serif" }}>
                Clean execution — no major faults detected
              </span>
            </div>
          )}

          {/* Overall correction for the skill */}
          {correction && faults.length === 0 && (
            <div
              style={{
                marginTop: 12,
                fontSize: 13,
                color: COLORS.textSecondary,
                lineHeight: 1.5,
                fontFamily: "'Outfit', sans-serif",
              }}
            >
              {correction}
            </div>
          )}

          {/* Body Mechanics Section */}
          {bodyMechanics && (bodyMechanics.kneeAngle || bodyMechanics.hipAlignment || bodyMechanics.shoulderPosition || bodyMechanics.toePoint) && (
            <div style={{ marginTop: 12 }}>
              <button
                onClick={() => setMechanicsOpen(!mechanicsOpen)}
                aria-expanded={mechanicsOpen}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: COLORS.surface2,
                  border: `1px solid ${COLORS.border}`,
                  cursor: 'pointer',
                  color: COLORS.text,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600, fontFamily: "'Outfit', sans-serif" }}>
                  Body Mechanics
                </span>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 14 14"
                  fill="none"
                  stroke="rgba(255,255,255,0.4)"
                  strokeWidth="2"
                  style={{
                    transform: mechanicsOpen ? 'rotate(180deg)' : 'none',
                    transition: 'transform 0.2s',
                  }}
                  aria-hidden="true"
                >
                  <path d="M2 5l5 4 5-4" />
                </svg>
              </button>
              {mechanicsOpen && (
                <div
                  style={{
                    padding: '8px 0 0',
                  }}
                >
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
                        borderBottom: i < 3 ? '1px solid rgba(255,255,255,0.03)' : 'none',
                      }}
                    >
                      <span style={{ fontSize: 14, flexShrink: 0 }} aria-hidden="true">{row.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: "'Outfit', sans-serif", marginBottom: 2 }}>
                          {row.label}
                        </div>
                        <div style={{ fontSize: 13, color: COLORS.text, fontFamily: "'Outfit', sans-serif", lineHeight: 1.4 }}>
                          {safeStr(row.value, '')}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Drill Recommendation */}
          {drillRec && (
            <div
              style={{
                marginTop: 12,
                padding: '10px 12px',
                borderRadius: 10,
                background: 'rgba(34,197,94,0.06)',
                borderLeft: `3px solid ${COLORS.green}`,
                border: '1px solid rgba(34,197,94,0.15)',
                borderLeftWidth: 3,
                borderLeftColor: COLORS.green,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.green, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, fontFamily: "'Outfit', sans-serif" }}>
                Recommended Drill
              </div>
              <div style={{ fontSize: 13, color: COLORS.text, fontFamily: "'Outfit', sans-serif", lineHeight: 1.5 }}>
                {drillRec}
              </div>
            </div>
          )}

          {/* Legacy: Skill-level drill when no faults and no drillRecommendation */}
          {!drillRec && drill && faults.length === 0 && (
            <div
              style={{
                marginTop: 8,
                fontSize: 12,
                color: COLORS.gold,
                fontWeight: 500,
                fontFamily: "'Outfit', sans-serif",
              }}
            >
              Drill: {drill}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default React.memo(SkillCard);
