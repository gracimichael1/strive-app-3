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

  if (!skill) return null;

  const skillName = safeStr(skill.skill || skill.skillName, 'Unknown Skill');
  const deduction = typeof skill.deduction === 'number' ? skill.deduction : 0;
  const grade = skill.grade || getGrade(deduction);
  const gradeConfig = GRADE_CONFIG[grade] || GRADE_CONFIG['B'];
  const timestamp = skill.timestamp || skill.time || '';
  const faults = safeArray(skill.subFaults || skill.faults || skill.deductionHints);
  const correction = safeStr(skill.correction || skill.fix, '');
  const drill = safeStr(skill.drill || skill.drillRecommendation, '');
  const hasInjuryRisk = skill.injuryRisk || skill.physicalRisk || false;

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
            }}
          >
            {skillName}
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
                role="alert"
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

          {/* Injury warning */}
          {hasInjuryRisk && (
            <div
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                background: 'rgba(220,38,38,0.08)',
                border: '1px solid rgba(220,38,38,0.2)',
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                marginBottom: 12,
                marginTop: timestamp ? 0 : 12,
              }}
              role="alert"
            >
              <span style={{ fontSize: 16 }} aria-hidden="true">&#9888;</span>
              <span style={{ fontSize: 12, color: COLORS.red, fontWeight: 600, fontFamily: "'Outfit', sans-serif" }}>
                {safeStr(skill.injuryNote, 'This skill has physical risk factors. Ensure proper conditioning before progression.')}
              </span>
            </div>
          )}

          {/* Faults list */}
          {faults.length > 0 ? (
            <div style={{ marginTop: faults.length > 0 && !timestamp ? 12 : 0 }}>
              {faults.map((fault, i) => {
                const faultName = safeStr(fault.fault || fault.name || fault, '');
                const faultFix = safeStr(fault.correction || fault.fix || fault.detail, '');
                const faultDrill = safeStr(fault.drill || fault.drillRecommendation, '');
                const severity = fault.severity || 'medium';
                const sevColor = SEV_COLORS[severity] || COLORS.gold;
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

          {/* Skill-level drill */}
          {drill && faults.length === 0 && (
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
