import React, { useState, useRef, useEffect } from 'react';
import { safeStr, safeArray } from '../../utils/helpers';
import { loadPoseDetector, detectPose } from '../../analysis/poseDetector';

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

// ── GRADE CIRCLE ──
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

// ── SECTION HEADER ──
function SectionHeader({ color, children }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 700,
        color,
        letterSpacing: 1,
        textTransform: 'uppercase',
        marginBottom: 6,
        fontFamily: "'Outfit', sans-serif",
      }}
    >
      {children}
    </div>
  );
}

// ── SECTION BOX ──
function SectionBox({ borderColor, bgColor, children, style }) {
  return (
    <div
      style={{
        marginBottom: 10,
        padding: '10px 12px',
        borderRadius: 10,
        background: bgColor || 'rgba(255,255,255,0.02)',
        border: `1px solid ${borderColor || 'rgba(255,255,255,0.06)'}`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/**
 * SkillCard — collapsed shows grade circle + skill name + deduction.
 * Expanded shows tabbed data: Overview, Biomechanics, Injury, Drills.
 */
function SkillCard({ skill, index, defaultExpanded, videoFile }) {
  const [expanded, setExpanded] = useState(defaultExpanded || false);
  const [cardTab, setCardTab] = useState('overview');
  const [playbackRate, setPlaybackRate] = useState(1);
  const skillVideoRef = useRef(null);
  const [skillVideoUrl, setSkillVideoUrl] = useState(null);
  const [skelFrame, setSkelFrame] = useState(null); // { dataUrl, joints }
  const skelAttemptedRef = useRef(false);

  // Create/cleanup blob URL for per-skill video
  useEffect(() => {
    if (expanded && videoFile && !skillVideoUrl) {
      const url = URL.createObjectURL(videoFile);
      setSkillVideoUrl(url);
    }
    return () => {
      // Don't revoke on every render — only on unmount
    };
  }, [expanded, videoFile]);

  // Seek to skill timestamp when video loads
  useEffect(() => {
    const v = skillVideoRef.current;
    if (v && expanded && skillVideoUrl) {
      const seekTo = skill.timestampSec || skill.timestampStart || 0;
      const handleLoaded = () => {
        v.currentTime = Math.max(0, seekTo - 0.3);
        v.playbackRate = playbackRate;
      };
      v.addEventListener('loadedmetadata', handleLoaded);
      // If already loaded
      if (v.readyState >= 1) {
        v.currentTime = Math.max(0, seekTo - 0.3);
        v.playbackRate = playbackRate;
      }
      return () => v.removeEventListener('loadedmetadata', handleLoaded);
    }
  }, [skillVideoUrl, expanded]);

  // Extract skeleton frame after video seeks to skill timestamp
  useEffect(() => {
    if (!expanded || !skillVideoUrl || skelAttemptedRef.current) return;
    const v = skillVideoRef.current;
    if (!v) return;

    const extractFrame = async () => {
      skelAttemptedRef.current = true;
      try {
        const canvas = document.createElement('canvas');
        const vw = v.videoWidth || 640;
        const vh = v.videoHeight || 480;
        canvas.width = Math.min(vw, 640);
        canvas.height = Math.round(canvas.width * (vh / vw));
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

        // Check not blank
        const px = ctx.getImageData(canvas.width >> 1, canvas.height >> 1, 1, 1).data;
        if (px[0] < 5 && px[1] < 5 && px[2] < 5) {
          setSkelFrame({ dataUrl, joints: null });
          return;
        }

        setSkelFrame({ dataUrl, joints: null });

        // Run pose detection (async, non-blocking)
        try {
          await loadPoseDetector();
          const result = await detectPose(canvas);
          if (result?.joints) {
            setSkelFrame(prev => prev ? { ...prev, joints: result.joints } : null);
          }
        } catch (e) {
          console.error('[SkillCard] MediaPipe detection failed:', e);
        }
      } catch (e) {
        console.error('[SkillCard] Frame extraction failed:', e);
      }
    };

    // Wait for video to be seeked and ready
    const onSeeked = () => {
      v.removeEventListener('seeked', onSeeked);
      setTimeout(extractFrame, 100); // small delay to ensure frame is rendered
    };
    if (v.readyState >= 2) {
      setTimeout(extractFrame, 200);
    } else {
      v.addEventListener('seeked', onSeeked, { once: true });
      // Fallback if seeked never fires
      const timeout = setTimeout(() => {
        v.removeEventListener('seeked', onSeeked);
        if (v.readyState >= 2) extractFrame();
      }, 3000);
      return () => { clearTimeout(timeout); v.removeEventListener('seeked', onSeeked); };
    }
  }, [expanded, skillVideoUrl]);

  if (!skill) return null;

  const skillName = safeStr(skill.skill || skill.skillName || skill.name, 'Unknown Skill');
  const deduction = typeof skill.deduction === 'number' ? skill.deduction : (typeof skill.gradeDeduction === 'number' ? skill.gradeDeduction : 0);
  const grade = skill.grade || getGrade(deduction);
  const gradeColor = GRADE_COLOR[grade] || '#e8962a';
  const gradeLabel = GRADE_LABEL_MAP[grade] || '';
  const timestamp = skill.timestamp || skill.time || '';
  const faults = safeArray(skill.subFaults || skill.faults || skill.deductionHints);
  const hasInjuryRisk = !!(skill.injuryRisk || skill.physicalRisk);
  const injuryText = safeStr(skill.injuryRisk || skill.injuryNote || skill.physicalRisk, '');
  const drillRec = safeStr(skill.drillRecommendation || skill.drill, '');
  const strengthNote = safeStr(skill.strengthNote || skill.strength, '');
  const meaningfulFaults = faults.filter(f => (typeof f === 'string' ? f : (f.fault || f.name || '')).trim().length > 0);
  const isClean = meaningfulFaults.length === 0 && deduction === 0;
  const correctForm = safeStr(skill.correctForm || skill.correct_form, '');
  const gainIfFixed = typeof skill.gainIfFixed === 'number' ? skill.gainIfFixed : 0;
  const ruleRef = safeStr(skill.ruleReference || skill.rule_reference, '');
  const category = safeStr(skill.category, '');
  const fallDetected = !!skill.fallDetected;
  const narrativeText = safeStr(skill.narrative, '');
  const rawInjurySignal = safeStr(skill.injurySignal, '');
  const injurySignal = (() => {
    if (!rawInjurySignal) return '';
    const clean = rawInjurySignal.toLowerCase().trim();
    if (clean === '' || clean === 'none' || clean === 'n/a' || clean === 'no injury signal' ||
        clean === 'no injury signals detected' || clean === 'normal') return '';
    return rawInjurySignal;
  })();
  const [showFlagSheet, setShowFlagSheet] = useState(false);
  const [flagText, setFlagText] = useState('');
  const [flagSubmitted, setFlagSubmitted] = useState(false);

  // Left border color based on grade
  const gradeGroup = (grade || '').charAt(0);
  const borderLeftColor = gradeGroup === 'A' ? '#22c55e' : gradeGroup === 'B' ? '#e8962a' : gradeGroup === 'C' ? '#e06820' : '#dc2626';

  // Biomechanics: use real data from Gemini
  const bioAngles = skill.biomechanics && Array.isArray(skill.biomechanics) && skill.biomechanics.length > 0
    ? skill.biomechanics
    : [];

  // Parse fault text into deduction line items if no structured faults
  const deductionLines = (() => {
    if (faults.length > 0) return null;
    const faultText = safeStr(skill.fault || skill.reason, '');
    if (!faultText || deduction === 0) return [];
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

  // Parse drill recommendation into list
  const drillList = drillRec
    ? drillRec.split(/;\s*/).filter(d => d.length > 2)
    : [];

  // Tab config (Drills = next phase)
  const cardTabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'bio', label: 'Bio' },
    { id: 'injury', label: 'Injury' },
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
      {/* ── Header (always visible) ── */}
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
            {/* Grade label badge */}
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '1px 8px',
                borderRadius: 10,
                background: `${gradeColor}18`,
                color: gradeColor,
                border: `1px solid ${gradeColor}30`,
              }}
            >
              {gradeLabel}
            </span>
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
            {category && (
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
                {category}
              </span>
            )}
            {fallDetected && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: 'rgba(220,38,38,0.15)', color: COLORS.red }}>
                FALL
              </span>
            )}
            {hasInjuryRisk && (
              <span style={{ fontSize: 10, fontWeight: 600, color: COLORS.red }}>
                Injury Risk
              </span>
            )}
          </div>
          {/* Preview fault text when collapsed */}
          {!expanded && (skill.fault || meaningfulFaults.length > 0) && deduction > 0 && (
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

      {/* ── Expanded dropdown with tabs ── */}
      {expanded && (
        <div
          id={`skill-detail-${index}`}
          style={{ padding: '0 16px 16px' }}
        >
          {/* ── Tab selector ── */}
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

          {/* ── Skeleton Frame (extracted from video at skill timestamp) ── */}
          {skelFrame?.dataUrl && (
            <div style={{
              position: 'relative',
              marginBottom: 12,
              borderRadius: 10,
              overflow: 'hidden',
              border: '1px solid rgba(232,150,42,0.15)',
              background: '#000',
            }}>
              <img
                src={skelFrame.dataUrl}
                alt={`Frame at ${formatTimestamp(timestamp)}`}
                style={{ width: '100%', display: 'block' }}
              />
              {skelFrame.joints && (
                <svg
                  viewBox="0 0 1 1"
                  preserveAspectRatio="none"
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
                >
                  {SKELETON_CONNECTIONS.map(([a, b]) => {
                    // Map from SkillCard naming to MediaPipe naming
                    const MAP = { lShoulder: 'leftShoulder', rShoulder: 'rightShoulder', lElbow: 'leftElbow', rElbow: 'rightElbow', lWrist: 'leftWrist', rWrist: 'rightWrist', lHip: 'leftHip', rHip: 'rightHip', lKnee: 'leftKnee', rKnee: 'rightKnee', lAnkle: 'leftAnkle', rAnkle: 'rightAnkle', head: 'nose', neck: 'shoulder' };
                    const p1 = skelFrame.joints[MAP[a] || a];
                    const p2 = skelFrame.joints[MAP[b] || b];
                    if (!p1 || !p2) return null;
                    return <line key={`${a}-${b}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="rgba(232,150,42,0.85)" strokeWidth="0.008" strokeLinecap="round" />;
                  })}
                  {Object.entries(skelFrame.joints).filter(([n]) => n.startsWith('left') || n.startsWith('right')).map(([name, j]) => (
                    <g key={name}>
                      <circle cx={j.x} cy={j.y} r="0.012" fill={name.includes('Shoulder') ? '#e8962a' : name.includes('Hip') ? '#3B82F6' : name.includes('Knee') ? '#60A5FA' : name.includes('Ankle') ? '#93C5FD' : '#ffc15a'} />
                      <circle cx={j.x} cy={j.y} r="0.004" fill="rgba(255,255,255,0.9)" />
                    </g>
                  ))}
                </svg>
              )}
              <div style={{ position: 'absolute', top: 6, left: 6, background: 'rgba(0,0,0,0.7)', padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 700, color: '#e8962a', fontFamily: "'Space Mono', monospace" }}>
                {formatTimestamp(timestamp)}
              </div>
            </div>
          )}

          {/* ═══ TAB: OVERVIEW ═══ */}
          {cardTab === 'overview' && (
            <>
              {/* What Happened — 3-sentence narrative */}
              {narrativeText && (
                <SectionBox borderColor="rgba(232,150,42,0.15)" bgColor="rgba(232,150,42,0.04)">
                  <SectionHeader color={COLORS.gold}>What Happened</SectionHeader>
                  <div style={{ fontSize: 13, color: COLORS.text, lineHeight: 1.7, fontFamily: "'Outfit', sans-serif" }}>
                    {narrativeText}
                  </div>
                </SectionBox>
              )}

              {/* Fault Observed */}
              {skill.fault && deduction > 0 && (
                <SectionBox borderColor="rgba(224,104,32,0.15)" bgColor="rgba(224,104,32,0.04)">
                  <SectionHeader color={COLORS.orange}>Fault Observed</SectionHeader>
                  <div style={{ fontSize: 13, color: COLORS.text, lineHeight: 1.6, fontFamily: "'Outfit', sans-serif" }}>
                    {safeStr(skill.fault, '')}
                  </div>
                  {ruleRef && (
                    <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 4, fontStyle: 'italic', fontFamily: "'Outfit', sans-serif" }}>
                      Rule: {ruleRef}
                    </div>
                  )}
                </SectionBox>
              )}

              {/* Deduction Line Items */}
              {faults.length > 0 && faults.some(f => (typeof f === 'string' ? f : (f.fault || f.name || '')).trim().length > 0) ? (
                <SectionBox borderColor="rgba(224,104,32,0.15)" bgColor="rgba(224,104,32,0.04)">
                  <SectionHeader color={COLORS.orange}>Deductions Found</SectionHeader>
                  {faults.map((fault, i) => {
                    const faultName = safeStr(fault.fault || fault.name || fault, '');
                    const severity = fault.severity || 'medium';
                    const sevColor = SEV_COLORS[severity] || SEV_COLORS[severity?.replace(/\s+/g, '')] || COLORS.gold;
                    const faultDed = typeof fault.deduction === 'number' ? fault.deduction : null;
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'stretch', gap: 10, marginBottom: 6, padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ width: 3, borderRadius: 2, background: sevColor, flexShrink: 0 }} aria-label={`${severity} severity`} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, color: COLORS.text, lineHeight: 1.5, fontFamily: "'Outfit', sans-serif" }}>{faultName}</div>
                        </div>
                        {faultDed != null && faultDed > 0 && (
                          <div style={{ fontSize: 13, fontWeight: 800, color: sevColor, fontFamily: "'Space Mono', monospace", flexShrink: 0, alignSelf: 'center' }}>
                            -{faultDed.toFixed(2)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </SectionBox>
              ) : deductionLines && deductionLines.length > 0 && deduction > 0 ? (
                <SectionBox borderColor="rgba(224,104,32,0.15)" bgColor="rgba(224,104,32,0.04)">
                  <SectionHeader color={COLORS.orange}>Deductions Found</SectionHeader>
                  {deductionLines.map((sf, i) => {
                    const sColor = dedColor(sf.amount);
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'stretch', gap: 10, marginBottom: 6, padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ width: 3, borderRadius: 2, background: sColor, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, color: COLORS.text, lineHeight: 1.5 }}>{sf.text}</div>
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: sColor, fontFamily: "'Space Mono', monospace", flexShrink: 0, alignSelf: 'center' }}>
                          -{sf.amount.toFixed(2)}
                        </div>
                      </div>
                    );
                  })}
                </SectionBox>
              ) : isClean ? (
                <SectionBox borderColor="rgba(34,197,94,0.15)" bgColor="rgba(34,197,94,0.06)" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 14, color: COLORS.green }} aria-hidden="true">&#10003;</span>
                  <span style={{ fontSize: 13, color: COLORS.green, fontFamily: "'Outfit', sans-serif" }}>
                    Clean execution &mdash; no major faults detected
                  </span>
                </SectionBox>
              ) : null}

              {/* Strength */}
              {(strengthNote || isClean) && (
                <SectionBox borderColor="rgba(232,150,42,0.15)" bgColor="rgba(232,150,42,0.04)">
                  <SectionHeader color={COLORS.gold}>Strength</SectionHeader>
                  <div style={{ fontSize: 12, color: COLORS.text, lineHeight: 1.6, fontFamily: "'Outfit', sans-serif" }}>
                    {strengthNote || 'Clean execution \u2014 no deduction taken.'}
                  </div>
                </SectionBox>
              )}

              {/* Correct Form */}
              {correctForm && (
                <SectionBox borderColor="rgba(34,197,94,0.15)" bgColor="rgba(34,197,94,0.04)">
                  <SectionHeader color={COLORS.green}>Correct Form</SectionHeader>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6, fontFamily: "'Outfit', sans-serif" }}>
                    {correctForm}
                  </div>
                </SectionBox>
              )}

              {/* Gain If Fixed */}
              {gainIfFixed > 0 && (
                <SectionBox borderColor="rgba(232,150,42,0.12)">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <SectionHeader color={COLORS.gold}>Gain If Fixed</SectionHeader>
                    <span style={{ fontSize: 14, fontWeight: 900, color: COLORS.gold, fontFamily: "'Space Mono', monospace" }}>
                      +{gainIfFixed.toFixed(2)}
                    </span>
                  </div>
                  <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.min(100, (gainIfFixed / 0.50) * 100)}%`,
                        background: `linear-gradient(90deg, ${COLORS.gold}, ${COLORS.goldLight})`,
                        borderRadius: 4,
                        transition: 'width 0.6s ease',
                      }}
                    />
                  </div>
                  <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 4, fontFamily: "'Outfit', sans-serif" }}>
                    Fixing this fault could add {gainIfFixed.toFixed(2)} to the final score
                  </div>
                </SectionBox>
              )}
            </>
          )}

          {/* ═══ TAB: BIOMECHANICS ═══ */}
          {cardTab === 'bio' && (
            <div>
              {bioAngles.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {bioAngles.map((a, i) => {
                    const actual = typeof a.actual === 'number' ? a.actual : (typeof a.actual_degrees === 'number' ? a.actual_degrees : parseInt(String(a.actual || a.actual_degrees).replace(/[^\d]/g, ''), 10) || 0);
                    const ideal = typeof a.ideal === 'number' ? a.ideal : (typeof a.ideal_degrees === 'number' ? a.ideal_degrees : parseInt(String(a.ideal || a.ideal_degrees).replace(/[^\d]/g, ''), 10) || 180);
                    const diff = Math.abs(actual - ideal);
                    const aColor = diff > 15 ? '#dc2626' : diff > 10 ? '#ffc15a' : '#22c55e';
                    const pct = ideal > 0 ? Math.min(100, (actual / ideal) * 100) : 100;
                    const status = a.status || (diff <= 5 ? 'excellent' : diff <= 10 ? 'good' : diff <= 20 ? 'needs_work' : 'significant_gap');
                    const statusLabel = status === 'excellent' ? 'Excellent' : status === 'good' ? 'Good' : status === 'needs_work' ? 'Needs Work' : 'Significant Gap';

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
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, fontFamily: "'Outfit', sans-serif" }}>
                          {a.label}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
                          <span style={{ fontSize: 18, fontWeight: 900, color: aColor, fontFamily: "'Space Mono', monospace" }}>
                            {actual}&deg;
                          </span>
                          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>/</span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.4)', fontFamily: "'Space Mono', monospace" }}>
                            {ideal}&deg;
                          </span>
                        </div>
                        <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden', marginBottom: 4 }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: aColor, borderRadius: 2, transition: 'width 0.6s ease' }} />
                        </div>
                        <div style={{ fontSize: 9, color: aColor, fontWeight: 600 }}>{statusLabel}</div>
                      </div>
                    );
                  })}
                </div>
              ) : skill.biomechanics_measured ? (
                <div style={{ padding: 12 }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 8, letterSpacing: 1.2, textTransform: 'uppercase' }}>
                    Measured by Motion Analysis
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {skill.biomechanics_measured.worstKneeAngle != null && (
                      <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px 10px' }}>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>Knee Angle</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: skill.biomechanics_measured.worstKneeAngle >= 160 ? '#22c55e' : skill.biomechanics_measured.worstKneeAngle >= 150 ? '#f59e0b' : '#dc2626', fontFamily: "'Space Mono', monospace" }}>
                          {skill.biomechanics_measured.worstKneeAngle}&deg;
                          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginLeft: 4 }}>/160&deg;</span>
                        </div>
                      </div>
                    )}
                    {skill.biomechanics_measured.avgHipAngle != null && (
                      <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px 10px' }}>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>Hip Angle</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: skill.biomechanics_measured.avgHipAngle >= 160 ? '#22c55e' : skill.biomechanics_measured.avgHipAngle >= 150 ? '#f59e0b' : '#dc2626', fontFamily: "'Space Mono', monospace" }}>
                          {skill.biomechanics_measured.avgHipAngle}&deg;
                          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginLeft: 4 }}>/160&deg;</span>
                        </div>
                      </div>
                    )}
                    {skill.biomechanics_measured.maxTrunkLean != null && (
                      <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px 10px' }}>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>Trunk Lean</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: skill.biomechanics_measured.maxTrunkLean <= 15 ? '#22c55e' : '#f59e0b', fontFamily: "'Space Mono', monospace" }}>
                          {skill.biomechanics_measured.maxTrunkLean}&deg;
                        </div>
                      </div>
                    )}
                    {skill.biomechanics_measured.maxLegSeparation != null && (
                      <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px 10px' }}>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>Leg Separation</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: skill.biomechanics_measured.maxLegSeparation <= 10 ? '#22c55e' : '#f59e0b', fontFamily: "'Space Mono', monospace" }}>
                          {skill.biomechanics_measured.maxLegSeparation}&deg;
                        </div>
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', marginTop: 8 }}>
                    Based on {skill.biomechanics_measured.frames_analyzed} frames analyzed via motion tracking
                  </div>
                </div>
              ) : (
                <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
                  No biomechanics data available for this skill.
                </div>
              )}
            </div>
          )}

          {/* ═══ TAB: INJURY ═══ */}
          {cardTab === 'injury' && (
            <div>
              {/* Measured injury signals from motion analysis (angle-based) */}
              {skill.injury_signals_measured && skill.injury_signals_measured.length > 0 ? (
                <div>
                  {skill.injury_signals_measured.map((sig, si) => (
                    <SectionBox
                      key={si}
                      borderColor={sig.severity === 'high' ? 'rgba(220,38,38,0.2)' : 'rgba(232,150,42,0.15)'}
                      bgColor={sig.severity === 'high' ? 'rgba(220,38,38,0.08)' : 'rgba(232,150,42,0.04)'}
                      style={{ borderLeft: `3px solid ${sig.severity === 'high' ? COLORS.red : COLORS.orange}`, marginBottom: 8 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <SectionHeader color={sig.severity === 'high' ? COLORS.red : COLORS.orange}>
                          {safeStr(sig.signal)}
                        </SectionHeader>
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                          background: sig.severity === 'high' ? 'rgba(220,38,38,0.15)' : 'rgba(232,150,42,0.12)',
                          color: sig.severity === 'high' ? COLORS.red : COLORS.orange,
                          fontFamily: "'Space Mono', monospace", textTransform: 'uppercase',
                        }}>
                          {sig.severity}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: COLORS.text, fontFamily: "'Outfit', sans-serif", lineHeight: 1.5, marginBottom: 6 }}>
                        {safeStr(sig.detail)}
                      </div>
                      {sig.prehab && (
                        <div style={{
                          fontSize: 12, color: COLORS.green, fontFamily: "'Outfit', sans-serif",
                          lineHeight: 1.5, padding: '6px 8px', borderRadius: 6,
                          background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.1)',
                        }}>
                          <span style={{ fontWeight: 600 }}>Prehab: </span>{safeStr(sig.prehab)}
                        </div>
                      )}
                    </SectionBox>
                  ))}
                  <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 4, fontFamily: "'Outfit', sans-serif", fontStyle: 'italic' }}>
                    Measured by Motion Analysis
                  </div>
                </div>
              ) : hasInjuryRisk ? (
                <SectionBox
                  borderColor="rgba(220,38,38,0.2)"
                  bgColor="rgba(220,38,38,0.08)"
                  style={{ borderLeft: `3px solid ${COLORS.orange}` }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <SectionHeader color={COLORS.orange}>Injury Awareness</SectionHeader>
                  </div>
                  <div style={{ fontSize: 13, color: COLORS.text, fontFamily: "'Outfit', sans-serif", lineHeight: 1.6 }}>
                    {injuryText}
                  </div>
                  <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 4, fontFamily: "'Outfit', sans-serif", fontStyle: 'italic' }}>
                    Identified by Video Analysis
                  </div>
                </SectionBox>
              ) : injurySignal ? (
                <SectionBox borderColor="rgba(232,150,42,0.15)" bgColor="rgba(232,150,42,0.04)">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <SectionHeader color={COLORS.gold}>Physical Loading</SectionHeader>
                  </div>
                  <div style={{ fontSize: 13, color: COLORS.text, fontFamily: "'Outfit', sans-serif", lineHeight: 1.6 }}>
                    {injurySignal}
                  </div>
                </SectionBox>
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
                  <div style={{ fontSize: 13, color: COLORS.green, fontFamily: "'Outfit', sans-serif" }}>
                    No specific injury risks flagged for this skill
                  </div>
                  <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 6, fontFamily: "'Outfit', sans-serif" }}>
                    Always warm up properly and listen to your body.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Drills tab — next phase */}

          {/* ── Per-skill video player (below tab content) ── */}
          {skillVideoUrl && (
            <div style={{ marginTop: 14, borderRadius: 12, overflow: 'hidden', background: '#0d1422', border: '1px solid rgba(255,255,255,0.08)' }}>
              <video
                ref={skillVideoRef}
                src={skillVideoUrl}
                controls
                controlsList="nodownload"
                playsInline
                webkit-playsinline=""
                preload="metadata"
                style={{ width: '100%', display: 'block', maxHeight: 200 }}
              />
              <div style={{ display: 'flex', gap: 6, padding: '6px 10px', background: '#121b2d' }}>
                {[0.25, 0.5, 1].map(rate => (
                  <button
                    key={rate}
                    onClick={() => {
                      setPlaybackRate(rate);
                      if (skillVideoRef.current) skillVideoRef.current.playbackRate = rate;
                    }}
                    style={{
                      padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                      fontFamily: "'Space Mono', monospace", cursor: 'pointer',
                      background: playbackRate === rate ? COLORS.gold : 'rgba(255,255,255,0.06)',
                      color: playbackRate === rate ? '#070c16' : 'rgba(255,255,255,0.5)',
                      border: playbackRate === rate ? `1px solid ${COLORS.gold}` : '1px solid rgba(255,255,255,0.1)',
                    }}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* ── Flag Incorrect Skill ── */}
          <div style={{ marginTop: 12, textAlign: 'center' }}>
            {flagSubmitted ? (
              <div style={{ fontSize: 12, color: COLORS.green, fontFamily: "'Outfit', sans-serif" }}>
                Thanks — this helps STRIVE improve.
              </div>
            ) : !showFlagSheet ? (
              <button
                onClick={() => setShowFlagSheet(true)}
                style={{
                  background: 'none', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8, padding: '6px 14px', cursor: 'pointer',
                  fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: "'Outfit', sans-serif",
                }}
              >
                Flag incorrect skill
              </button>
            ) : (
              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ fontSize: 12, color: COLORS.text, marginBottom: 8, fontFamily: "'Outfit', sans-serif" }}>
                  What skill was this actually?
                </div>
                <input
                  type="text"
                  value={flagText}
                  onChange={e => setFlagText(e.target.value)}
                  placeholder="e.g. Back Walkover, not Back Handspring"
                  style={{
                    width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)',
                    background: 'rgba(255,255,255,0.05)', color: COLORS.text, fontSize: 13,
                    fontFamily: "'Outfit', sans-serif", boxSizing: 'border-box',
                  }}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'center' }}>
                  <button
                    onClick={() => setShowFlagSheet(false)}
                    style={{
                      background: 'none', border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 6, padding: '6px 14px', cursor: 'pointer',
                      fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: "'Outfit', sans-serif",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (!flagText.trim()) return;
                      const record = {
                        analysis_id: skill.analysisId || skill.id || 'unknown',
                        timestamp_sec: skill.timestampStart || skill.timestamp_start || 0,
                        skill_name: skillName,
                        suggested_correction: flagText.trim(),
                        video_id: skill.videoId || 'unknown',
                        event: skill.event || '',
                        level: skill.level || '',
                      };
                      // Save to localStorage as backup
                      try {
                        const existing = JSON.parse(localStorage.getItem('strive_skill_corrections') || '[]');
                        existing.push({ ...record, flagged_at: new Date().toISOString() });
                        localStorage.setItem('strive_skill_corrections', JSON.stringify(existing));
                      } catch {}
                      // POST to server for durable storage + training
                      try {
                        fetch('/api/feedback?action=flag', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            'X-Strive-Token': process.env.REACT_APP_STRIVE_TOKEN || '',
                          },
                          body: JSON.stringify(record),
                        }).catch(() => {}); // fire and forget
                        console.log('[SkillCard] Skill flag sent to server:', record);
                      } catch {}
                      setFlagSubmitted(true);
                      setShowFlagSheet(false);
                    }}
                    style={{
                      background: COLORS.gold, border: 'none', borderRadius: 6,
                      padding: '6px 14px', cursor: 'pointer', fontSize: 11,
                      fontWeight: 700, color: '#070c16', fontFamily: "'Outfit', sans-serif",
                    }}
                  >
                    Submit
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default React.memo(SkillCard);
