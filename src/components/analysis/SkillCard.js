/**
 * SkillCard.js  — UPDATED
 *
 * Changes from v1:
 *   - Confidence badge on every fault (high/medium/low with color)
 *   - Source label: "AI detected" vs "Pose measured" vs "Merged"
 *   - Single-camera warning banner when Gemini flags angle uncertainty
 *   - Coach note from Gemini displayed prominently
 *   - Difficulty value shown if available from element dictionary
 *   - Landing quality indicator
 *   - Fault confidence filter: faults below 0.45 shown as "unconfirmed"
 */

import React, { useState } from 'react';

// ─── Constants ────────────────────────────────────────────────────────────────

const SEV_COLOR = {
  small:     '#22C55E',
  medium:    '#F59E0B',
  large:     '#F97316',
  veryLarge: '#EF4444',
  fall:      '#DC2626',
};

const SEV_LABEL = {
  small:     '−0.05–0.10',
  medium:    '−0.10–0.15',
  large:     '−0.20–0.30',
  veryLarge: '−0.30–0.50',
  fall:      '−0.50',
};

const CONF_COLOR = {
  high:   '#22C55E',
  medium: '#F59E0B',
  low:    '#EF4444',
};

const CONF_LABEL = {
  high:   'High confidence',
  medium: 'Medium confidence',
  low:    'Low confidence — verify with coach',
};

const LANDING_LABEL = {
  clean:       { text: 'Clean landing',       color: '#22C55E' },
  small_step:  { text: 'Small step',          color: '#F59E0B' },
  large_step:  { text: 'Large step / lunge',  color: '#F97316' },
  fall:        { text: 'Fall',                color: '#DC2626' },
  unknown:     { text: 'Landing not assessed', color: 'rgba(255,255,255,0.3)' },
};

function formatTime(secs) {
  if (secs == null) return '--';
  const m = Math.floor(secs / 60);
  const s = secs.toFixed(1).padStart(4, '0');
  return `${m}:${s}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AngleMeter({ label, value, ideal = 160, inverted = false }) {
  if (value === null || value === undefined) return null;
  const pct   = Math.max(0, Math.min(100, (value / 180) * 100));
  const good  = inverted ? value <= ideal + 10 : value >= ideal - 10;
  const color = good ? '#22C55E' : value >= ideal - 30 ? '#F59E0B' : '#EF4444';

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color, fontFamily: "'Space Mono', monospace" }}>
          {Math.round(value)}°
        </span>
      </div>
      <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg,${color}88,${color})`, borderRadius: 3, transition: 'width 0.6s' }} />
      </div>
    </div>
  );
}

function ConfidenceBadge({ label }) {
  if (!label) return null;
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
      background: `${CONF_COLOR[label]}18`,
      color: CONF_COLOR[label],
      letterSpacing: 0.5, textTransform: 'uppercase',
      fontFamily: "'Space Mono', monospace",
      flexShrink: 0,
    }}>
      {label}
    </span>
  );
}

function SourceBadge({ source }) {
  const labels = { gemini: '🤖 AI', dict: '📐 Pose', merged: '🔀 Merged' };
  const colors = { gemini: '#3B82F6', dict: '#C4982A', merged: '#8B5CF6' };
  const s = source || 'dict';
  return (
    <span style={{
      fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 8,
      background: `${colors[s]}18`,
      color: colors[s],
      letterSpacing: 0.3,
      flexShrink: 0,
    }}>
      {labels[s] || s}
    </span>
  );
}

// ─── Main Card ────────────────────────────────────────────────────────────────

export default function SkillCard({ skill, expanded, onToggle, onSeek }) {
  const [showUnconfirmed, setShowUnconfirmed] = useState(false);

  if (!skill) return null;

  const { biomechanics: bio, deductionHints = [], estimatedDed } = skill;
  const peak = bio?.peak;

  const totalDed      = Math.round((estimatedDed || 0) * 100) / 100;
  const confirmedFaults   = deductionHints.filter(d => (d.confidence || 0.7) >= 0.45);
  const unconfirmedFaults = deductionHints.filter(d => (d.confidence || 0.7) < 0.45);

  const landing = LANDING_LABEL[skill.landingQuality] || LANDING_LABEL.unknown;

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: expanded
        ? '1px solid rgba(196,152,42,0.3)'
        : '1px solid rgba(255,255,255,0.06)',
      borderRadius: 14,
      overflow: 'hidden',
      transition: 'all 0.2s',
      marginBottom: 10,
    }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <button
        onClick={onToggle}
        style={{
          width: '100%', textAlign: 'left', padding: '14px 16px',
          background: 'transparent', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 12,
        }}
      >
        {/* Index badge */}
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: 'rgba(196,152,42,0.12)',
          color: '#C4982A',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 800, flexShrink: 0,
        }}>
          {skill.index}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#E2E8F0' }}>
              {skill.skillName}
            </span>
            <ConfidenceBadge label={skill.confidenceLabel} />
            {skill.difficulty != null && (
              <span style={{ fontSize: 10, color: '#C4982A', fontFamily: "'Space Mono', monospace" }}>
                D:{skill.difficulty.toFixed(1)}
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: "'Space Mono', monospace" }}>
            {formatTime(skill.start)} → {formatTime(skill.end)} · {skill.duration}s
          </div>
        </div>

        {/* Total deduction */}
        {totalDed > 0 && (
          <div style={{
            padding: '3px 10px', borderRadius: 20,
            background: 'rgba(239,68,68,0.12)',
            color: '#EF4444',
            fontSize: 12, fontWeight: 700,
            fontFamily: "'Space Mono', monospace",
            flexShrink: 0,
          }}>
            −{totalDed.toFixed(2)}
          </div>
        )}

        {/* Chevron */}
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
          stroke="rgba(255,255,255,0.3)" strokeWidth="1.8"
          style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>
          <path d="M2 5l5 4 5-4" />
        </svg>
      </button>

      {/* ── Expanded body ───────────────────────────────────────────────── */}
      {expanded && (
        <div style={{ padding: '0 16px 16px' }}>

          {/* Single-camera warning */}
          {skill.singleCameraWarning && (
            <div style={{
              padding: '8px 12px', borderRadius: 8, marginBottom: 12,
              background: 'rgba(245,158,11,0.07)',
              border: '1px solid rgba(245,158,11,0.2)',
              display: 'flex', gap: 8, alignItems: 'flex-start',
            }}>
              <span style={{ fontSize: 14, flexShrink: 0 }}>📷</span>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#F59E0B', marginBottom: 2 }}>
                  Single-Camera Limitation
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
                  {skill.singleCameraWarning}
                </div>
              </div>
            </div>
          )}

          {/* Confidence detail */}
          {skill.confidenceReason && (
            <div style={{
              padding: '8px 12px', borderRadius: 8, marginBottom: 12,
              background: `${CONF_COLOR[skill.confidenceLabel] || '#C4982A'}0A`,
              border: `1px solid ${CONF_COLOR[skill.confidenceLabel] || '#C4982A'}22`,
            }}>
              <div style={{ fontSize: 11, color: CONF_COLOR[skill.confidenceLabel], lineHeight: 1.5 }}>
                <strong>{CONF_LABEL[skill.confidenceLabel]}:</strong> {skill.confidenceReason}
              </div>
            </div>
          )}

          {/* Seek button */}
          <button
            onClick={() => onSeek?.(skill.peakTimestamp)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 8, marginBottom: 16,
              background: 'rgba(196,152,42,0.1)',
              border: '1px solid rgba(196,152,42,0.2)',
              color: '#C4982A', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', fontFamily: "'Outfit', sans-serif",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M3 2l7 4-7 4V2z"/>
            </svg>
            Jump to peak
          </button>

          {/* Landing quality */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <SectionLabel>Landing</SectionLabel>
            <span style={{
              fontSize: 11, fontWeight: 600, color: landing.color, marginBottom: 10,
            }}>
              {landing.text}
            </span>
          </div>

          {/* Biomechanics angles */}
          {peak && (
            <div style={{ marginBottom: 16 }}>
              <SectionLabel>Peak Position Angles</SectionLabel>
              <AngleMeter label="Knee"     value={peak.kneeAngle}     ideal={160} />
              <AngleMeter label="Hip"      value={peak.hipAngle}      ideal={160} />
              <AngleMeter label="Shoulder" value={peak.shoulderAngle} ideal={165} />
              {bio.worstKneeAngle != null && bio.worstKneeAngle < (peak.kneeAngle || 180) - 5 && (
                <AngleMeter label="Worst Knee (flight)" value={bio.worstKneeAngle} ideal={160} />
              )}
            </div>
          )}

          {/* Coach note from Gemini */}
          {skill.coachNote && (
            <div style={{
              padding: '10px 14px', borderRadius: 10, marginBottom: 16,
              background: 'rgba(59,130,246,0.07)',
              border: '1px solid rgba(59,130,246,0.15)',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#3B82F6', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                🤖 AI Coach Note
              </div>
              <div style={{ fontSize: 13, color: '#E2E8F0', lineHeight: 1.6 }}>
                {skill.coachNote}
              </div>
            </div>
          )}

          {/* Fault list */}
          <SectionLabel>Detected Faults</SectionLabel>

          {confirmedFaults.length === 0 && unconfirmedFaults.length === 0 ? (
            <div style={{
              padding: '10px 12px', borderRadius: 10,
              background: 'rgba(34,197,94,0.06)',
              border: '1px solid rgba(34,197,94,0.15)',
              display: 'flex', gap: 8, alignItems: 'center',
            }}>
              <span style={{ fontSize: 16 }}>✓</span>
              <span style={{ fontSize: 13, color: '#22C55E' }}>No faults detected</span>
            </div>
          ) : (
            <>
              {confirmedFaults.map((hint, i) => (
                <FaultRow key={i} hint={hint} />
              ))}

              {/* Unconfirmed faults toggle */}
              {unconfirmedFaults.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <button
                    onClick={() => setShowUnconfirmed(v => !v)}
                    style={{
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      color: 'rgba(255,255,255,0.3)', fontSize: 11, padding: '4px 0',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
                      stroke="currentColor" strokeWidth="1.5"
                      style={{ transform: showUnconfirmed ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                      <path d="M1 3l4 4 4-4" />
                    </svg>
                    {showUnconfirmed ? 'Hide' : `Show ${unconfirmedFaults.length} low-confidence`} fault{unconfirmedFaults.length !== 1 ? 's' : ''}
                  </button>

                  {showUnconfirmed && unconfirmedFaults.map((hint, i) => (
                    <FaultRow key={i} hint={hint} dimmed />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── FaultRow ─────────────────────────────────────────────────────────────────

function FaultRow({ hint, dimmed = false }) {
  const confLabel = (hint.confidence || 0.7) >= 0.75 ? 'high'
                  : (hint.confidence || 0.7) >= 0.5  ? 'medium'
                  : 'low';

  return (
    <div style={{
      display: 'flex', gap: 10, marginBottom: 8,
      padding: '10px 12px',
      background: 'rgba(255,255,255,0.02)',
      borderRadius: 10,
      borderLeft: `3px solid ${dimmed ? 'rgba(255,255,255,0.1)' : (SEV_COLOR[hint.severity] || '#C4982A')}`,
      opacity: dimmed ? 0.55 : 1,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#E2E8F0' }}>
            {hint.fault}
          </span>
          <ConfidenceBadge label={confLabel} />
          <SourceBadge source={hint.source} />
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>
          {hint.detail}
        </div>
        {hint.confidence < 0.5 && (
          <div style={{ fontSize: 10, color: '#F59E0B', marginTop: 3 }}>
            ⚠ Low confidence — verify with coach before acting on this
          </div>
        )}
      </div>
      <div style={{
        fontFamily: "'Space Mono', monospace",
        fontSize: 12, fontWeight: 700,
        color: dimmed ? 'rgba(255,255,255,0.3)' : (SEV_COLOR[hint.severity] || '#C4982A'),
        whiteSpace: 'nowrap', alignSelf: 'flex-start',
      }}>
        {SEV_LABEL[hint.severity] || '−?'}
      </div>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)',
      letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10,
    }}>
      {children}
    </div>
  );
}
