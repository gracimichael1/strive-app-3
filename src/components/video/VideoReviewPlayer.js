import React, { useRef, useState, useEffect } from 'react';
import { safeStr, safeNum } from '../../utils/helpers';

// ─── DEDUCTION SCALE ─────────────────────────────────────────────────
const DEDUCTION_SCALE = {
  small: { range: '0.05 – 0.10', color: '#22c55e' },
  medium: { range: '0.10 – 0.15', color: '#ffc15a' },
  large: { range: '0.20 – 0.30', color: '#e06820' },
  veryLarge: { range: '0.30 – 0.50', color: '#dc2626' },
  fall: { range: '0.50 (DP) / 1.00 (FIG)', color: '#dc2626' },
};

// ─── SKELETON CONNECTIONS ────────────────────────────────────────────
const SKELETON_CONNECTIONS = [
  ['head', 'neck'], ['neck', 'lShoulder'], ['neck', 'rShoulder'],
  ['lShoulder', 'lElbow'], ['lElbow', 'lWrist'], ['rShoulder', 'rElbow'], ['rElbow', 'rWrist'],
  ['lShoulder', 'lHip'], ['rShoulder', 'rHip'], ['lHip', 'rHip'],
  ['lHip', 'lKnee'], ['lKnee', 'lAnkle'], ['rHip', 'rKnee'], ['rKnee', 'rAnkle'],
];

// ─── CORRECT FORM DATABASE ──────────────────────────────────────────
const CORRECT_FORM_DB = {
  tuck: { label: 'Back Tuck — Zero Deduction', joints: {head:[.5,.15],neck:[.5,.22],lShoulder:[.42,.26],rShoulder:[.58,.26],lElbow:[.38,.34],rElbow:[.62,.34],lWrist:[.42,.42],rWrist:[.58,.42],lHip:[.46,.42],rHip:[.54,.42],lKnee:[.46,.42],rKnee:[.54,.42],lAnkle:[.44,.34],rAnkle:[.56,.34]}, notes: 'Knees GLUED together. Tight tuck. Chin neutral. Hands grip shins — no daylight between knees.' },
  layout: { label: 'Layout — Zero Deduction', joints: {head:[.5,.15],neck:[.5,.2],lShoulder:[.45,.24],rShoulder:[.55,.24],lElbow:[.43,.16],rElbow:[.57,.16],lWrist:[.42,.1],rWrist:[.58,.1],lHip:[.47,.38],rHip:[.53,.38],lKnee:[.48,.55],rKnee:[.52,.55],lAnkle:[.48,.72],rAnkle:[.52,.72]}, notes: 'Full extension head to toe. Arms by ears. Legs locked 180°. No pike at hips.' },
  handspring: { label: 'Handspring Support — Zero Deduction', joints: {head:[.5,.82],neck:[.5,.74],lShoulder:[.45,.67],rShoulder:[.55,.67],lElbow:[.44,.56],rElbow:[.56,.56],lWrist:[.44,.45],rWrist:[.56,.45],lHip:[.47,.52],rHip:[.53,.52],lKnee:[.48,.35],rKnee:[.52,.35],lAnkle:[.48,.18],rAnkle:[.52,.18]}, notes: 'Arms LOCKED 180°. Push through shoulders. Straight line wrists→shoulders→hips→toes.' },
  split_leap: { label: 'Split Leap — Zero Deduction', joints: {head:[.5,.12],neck:[.5,.18],lShoulder:[.42,.22],rShoulder:[.58,.22],lElbow:[.34,.16],rElbow:[.66,.16],lWrist:[.26,.12],rWrist:[.74,.12],lHip:[.46,.38],rHip:[.54,.38],lKnee:[.28,.38],rKnee:[.72,.38],lAnkle:[.15,.42],rAnkle:[.85,.42]}, notes: '180° split. Both legs AT or ABOVE horizontal. Toes pointed. Arms extended. Head up.' },
  landing: { label: 'Stuck Landing — Zero Deduction', joints: {head:[.5,.12],neck:[.5,.18],lShoulder:[.42,.22],rShoulder:[.58,.22],lElbow:[.40,.14],rElbow:[.60,.14],lWrist:[.39,.08],rWrist:[.61,.08],lHip:[.46,.40],rHip:[.54,.40],lKnee:[.45,.56],rKnee:[.55,.56],lAnkle:[.44,.72],rAnkle:[.56,.72]}, notes: 'Feet together. Knees soft to absorb. Chest UP. Arms at ears. HOLD — zero movement for 1 second.' },
  turn: { label: 'Full Turn — Zero Deduction', joints: {head:[.5,.08],neck:[.5,.14],lShoulder:[.46,.18],rShoulder:[.54,.18],lElbow:[.47,.12],rElbow:[.53,.12],lWrist:[.48,.06],rWrist:[.52,.06],lHip:[.47,.38],rHip:[.53,.38],lKnee:[.47,.56],rKnee:[.53,.56],lAnkle:[.47,.74],rAnkle:[.53,.74]}, notes: 'Supporting leg LOCKED 180°. Free leg in passé. Arms tight. Relevé — full height on toe.' },
  kip: { label: 'Glide Kip — Zero Deduction', joints: {head:[.35,.35],neck:[.38,.32],lShoulder:[.42,.28],rShoulder:[.42,.28],lElbow:[.42,.20],rElbow:[.42,.20],lWrist:[.42,.12],rWrist:[.42,.12],lHip:[.48,.40],rHip:[.48,.40],lKnee:[.55,.50],rKnee:[.55,.50],lAnkle:[.62,.55],rAnkle:[.62,.55]}, notes: 'Arms straight throughout. Toes to bar. Smooth glide — no pause. Finish in front support.' },
  cast: { label: 'Cast to Handstand — Zero Deduction', joints: {head:[.42,.82],neck:[.42,.74],lShoulder:[.42,.66],rShoulder:[.42,.66],lElbow:[.42,.58],rElbow:[.42,.58],lWrist:[.42,.50],rWrist:[.42,.50],lHip:[.42,.48],rHip:[.42,.48],lKnee:[.42,.30],rKnee:[.42,.30],lAnkle:[.42,.12],rAnkle:[.42,.12]}, notes: 'Arms locked. Body passes through vertical. Straight line from wrists to toes. No arch.' },
  walkover: { label: 'Back Walkover — Zero Deduction', joints: {head:[.65,.70],neck:[.60,.62],lShoulder:[.55,.55],rShoulder:[.55,.55],lElbow:[.50,.48],rElbow:[.50,.48],lWrist:[.45,.42],rWrist:[.45,.42],lHip:[.55,.45],rHip:[.55,.45],lKnee:[.60,.30],rKnee:[.45,.58],lAnkle:[.62,.15],rAnkle:[.42,.72]}, notes: 'Split leg position throughout. Shoulders over hands. Push through shoulders on support. Controlled pace.' },
  mount: { label: 'Beam Mount — Zero Deduction', joints: {head:[.5,.10],neck:[.5,.16],lShoulder:[.42,.20],rShoulder:[.58,.20],lElbow:[.36,.14],rElbow:[.64,.14],lWrist:[.32,.08],rWrist:[.68,.08],lHip:[.46,.38],rHip:[.54,.38],lKnee:[.44,.56],rKnee:[.56,.56],lAnkle:[.43,.74],rAnkle:[.57,.74]}, notes: 'Clean jump. Arms up. Land with control. No wobble. Immediate composure.' },
};

function getCorrectFormRef(skill, fault) {
  const s = ((skill || '') + ' ' + (fault || '')).toLowerCase();
  if (s.match(/tuck|cowboy|separation.*salto/)) return CORRECT_FORM_DB.tuck;
  if (s.match(/layout|pike.*body|extension/)) return CORRECT_FORM_DB.layout;
  if (s.match(/handspring|support|round.?off/)) return CORRECT_FORM_DB.handspring;
  if (s.match(/split|leap|jump.*180|sissone|switch/)) return CORRECT_FORM_DB.split_leap;
  if (s.match(/land|step|stick|dismount/)) return CORRECT_FORM_DB.landing;
  if (s.match(/turn|spin|pivot/)) return CORRECT_FORM_DB.turn;
  if (s.match(/kip|glide/)) return CORRECT_FORM_DB.kip;
  if (s.match(/cast|handstand/)) return CORRECT_FORM_DB.cast;
  if (s.match(/walkover|limber/)) return CORRECT_FORM_DB.walkover;
  if (s.match(/mount|approach/)) return CORRECT_FORM_DB.mount;
  return CORRECT_FORM_DB.landing;
}

// ─── Perfect Form SVG ────────────────────────────────────────────────
function PerfectFormSVG({ joints, label }) {
  if (!joints) return null;
  return (
    <svg viewBox="0 0 1 1" preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%', background: 'rgba(34,197,94,0.04)', borderRadius: 8 }}>
      {SKELETON_CONNECTIONS.map(([a, b], i) => {
        const ja = joints[a], jb = joints[b];
        if (!ja || !jb) return null;
        return <line key={i} x1={ja[0]} y1={ja[1]} x2={jb[0]} y2={jb[1]} stroke="#22c55e" strokeWidth={0.012} strokeLinecap="round" opacity={0.9} />;
      })}
      {Object.entries(joints).map(([name, pos]) => pos && (
        <circle key={name} cx={pos[0]} cy={pos[1]} r={0.015} fill="#22c55e" opacity={0.95} />
      ))}
      <text x={0.5} y={0.95} textAnchor="middle" fill="#22c55e" fontSize="0.035" fontWeight="bold" fontFamily="sans-serif">{label || 'Perfect Form'}</text>
    </svg>
  );
}

// ─── Skeleton Canvas Overlay ─────────────────────────────────────────
function SkeletonCanvas({ joints }) {
  if (!joints) return null;

  const CONNECTIONS = [
    ['leftShoulder', 'rightShoulder'],
    ['leftShoulder', 'leftElbow'], ['leftElbow', 'leftWrist'],
    ['rightShoulder', 'rightElbow'], ['rightElbow', 'rightWrist'],
    ['leftShoulder', 'leftHip'], ['rightShoulder', 'rightHip'],
    ['leftHip', 'rightHip'],
    ['leftHip', 'leftKnee'], ['leftKnee', 'leftAnkle'],
    ['rightHip', 'rightKnee'], ['rightKnee', 'rightAnkle'],
  ];

  const JOINT_COLOR = {
    leftShoulder: '#e8962a', rightShoulder: '#e8962a',
    leftElbow: '#ffc15a',    rightElbow: '#ffc15a',
    leftWrist: '#F5E6B8',    rightWrist: '#F5E6B8',
    leftHip: '#3B82F6',      rightHip: '#3B82F6',
    leftKnee: '#60A5FA',     rightKnee: '#60A5FA',
    leftAnkle: '#93C5FD',    rightAnkle: '#93C5FD',
  };

  return (
    <svg
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    >
      {CONNECTIONS.map(([a, b]) => {
        const p1 = joints[a]; const p2 = joints[b];
        if (!p1 || !p2) return null;
        return (
          <line key={`${a}-${b}`}
            x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
            stroke="rgba(232,150,42,0.85)" strokeWidth="0.008" strokeLinecap="round" />
        );
      })}
      {Object.entries(joints).filter(([n]) => JOINT_COLOR[n]).map(([name, j]) => (
        <g key={name}>
          <circle cx={j.x} cy={j.y} r="0.014" fill={JOINT_COLOR[name] || '#fff'} />
          <circle cx={j.x} cy={j.y} r="0.005" fill="rgba(255,255,255,0.9)" />
        </g>
      ))}
    </svg>
  );
}

// ─── COLORS (design system) ──────────────────────────────────────────
const COLORS = {
  surface: '#0d1422',
  surface2: '#121b2d',
  gold: '#e8962a',
  text: '#E2E8F0',
  textSecondary: '#8890AB',
  textMuted: '#8A90AA',
  border: 'rgba(232, 150, 42, 0.12)',
};

/**
 * VideoReviewPlayer — video replay with slow-mo, seek-to-skill,
 * frame capture, MediaPipe skeleton overlay, and perfect form comparison.
 *
 * @param {string} videoUrl - URL of the video to play
 * @param {Object} result   - Full analysis result object
 */
function VideoReviewPlayer({ videoUrl: propUrl, result }) {
  const videoRef = useRef(null);
  const captureCanvasRef = useRef(null);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [showCompare, setShowCompare] = useState(true);
  const [capturedFrame, setCapturedFrame] = useState(null);
  const [capturingFrame, setCapturingFrame] = useState(false);
  const [skelData, setSkelData] = useState(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const videoUrl = propUrl || result?.videoUrl;

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !videoUrl) return;
    v.load();
  }, [videoUrl]);

  const deds = result?.executionDeductions || [];

  // Parse timestamp string to seconds
  const tsToSec = (ts) => {
    if (!ts || typeof ts !== 'string') return NaN;
    const first = ts.split(/[,\-]/)[0].trim();
    if (String(first || '').toLowerCase() === 'global' || !first) return NaN;
    const parts = first.split(':');
    if (parts.length === 2) return parseInt(parts[0]) * 60 + parseInt(parts[1]);
    const n = parseFloat(first);
    return isNaN(n) ? NaN : n;
  };

  const sorted = [...deds].sort((a, b) => (tsToSec(a.timestamp) || 0) - (tsToSec(b.timestamp) || 0));
  const fmt = (t) => !t || !isFinite(t) ? '0:00' : `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, visibility: Math.min(a.visibility || 0, b.visibility || 0) });

  const runSkeletonDetection = async (canvas) => {
    try {
      const { PoseLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );
      const landmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
          delegate: 'GPU',
        },
        runningMode: 'IMAGE',
        numPoses: 1,
      });
      const poseResult = landmarker.detect(canvas);
      const raw = poseResult.landmarks?.[0];
      if (!raw) return null;

      const JOINT_MAP = {
        leftShoulder: 11, rightShoulder: 12, leftElbow: 13, rightElbow: 14,
        leftWrist: 15, rightWrist: 16, leftHip: 23, rightHip: 24,
        leftKnee: 25, rightKnee: 26, leftAnkle: 27, rightAnkle: 28,
      };
      const joints = {};
      for (const [name, idx] of Object.entries(JOINT_MAP)) {
        const lm = raw[idx];
        if (lm && (lm.visibility || 0) > 0.3) {
          joints[name] = { x: lm.x, y: lm.y, visibility: lm.visibility };
        }
      }
      if (joints.leftHip && joints.rightHip) joints.hip = mid(joints.leftHip, joints.rightHip);
      if (joints.leftShoulder && joints.rightShoulder) joints.shoulder = mid(joints.leftShoulder, joints.rightShoulder);
      if (joints.leftKnee && joints.rightKnee) joints.knee = mid(joints.leftKnee, joints.rightKnee);
      if (joints.leftAnkle && joints.rightAnkle) joints.ankle = mid(joints.leftAnkle, joints.rightAnkle);
      if (joints.leftElbow && joints.rightElbow) joints.elbow = mid(joints.leftElbow, joints.rightElbow);
      landmarker.close();
      return joints;
    } catch (e) {
      console.warn('[skeleton]', e.message);
      return null;
    }
  };

  const jumpTo = async (i) => {
    if (i < 0 || i >= sorted.length) return;
    setActiveIdx(i);
    setCapturedFrame(null);
    setSkelData(null);

    const v = videoRef.current;
    if (!v) return;

    const sec = tsToSec(sorted[i].timestamp);
    const seekSec = isFinite(sec) ? Math.max(0, sec - 0.5) : 0;

    v.pause();
    v.currentTime = seekSec;

    setCapturingFrame(true);
    const captureFrame = () => {
      try {
        const canvas = captureCanvasRef.current || document.createElement('canvas');
        const vw = v.videoWidth || 640;
        const vh = v.videoHeight || 480;
        canvas.width = Math.min(vw, 960);
        canvas.height = Math.round(canvas.width * (vh / vw));
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.90);

        const px = ctx.getImageData(canvas.width >> 1, canvas.height >> 1, 1, 1).data;
        const isBlank = px[0] < 5 && px[1] < 5 && px[2] < 5;

        if (!isBlank) {
          setCapturedFrame(dataUrl);
          runSkeletonDetection(canvas).then(j => {
            if (j) setSkelData(j);
          });
        }
      } catch (e) {
        console.warn('[VideoReviewPlayer] frame capture failed:', e.message);
      } finally {
        setCapturingFrame(false);
      }
    };

    const onSeeked = () => { v.removeEventListener('seeked', onSeeked); captureFrame(); };
    const timeout = setTimeout(() => { v.removeEventListener('seeked', onSeeked); captureFrame(); }, 2000);
    v.addEventListener('seeked', onSeeked, { once: true });

    setTimeout(() => {
      clearTimeout(timeout);
      captureFrame();
    }, 1500);
  };

  const slowMoReplay = () => {
    const v = videoRef.current;
    if (!v || activeIdx < 0) return;
    const sec = tsToSec(sorted[activeIdx].timestamp);
    const start = isFinite(sec) ? Math.max(0, sec - 0.5) : 0;
    v.currentTime = start;
    v.playbackRate = 0.25;
    v.play().catch(() => {});
    setTimeout(() => { if (v) { v.pause(); v.playbackRate = 1; } }, 5000);
  };

  const ad = activeIdx >= 0 ? sorted[activeIdx] : null;
  const adColor = ad ? (DEDUCTION_SCALE[ad.severity]?.color || '#ffc15a') : 'transparent';

  const adFrameFromResult = ad ? result?.frames?.find((f, i) => ad.frameRef === i + 1) : null;
  const displayFrame = capturedFrame || adFrameFromResult?.dataUrl || null;

  const adSkeleton = ad?.skeleton || null;
  const adNote = ad ? result?.bodyPositionNotes?.find(n => n.frameRef === ad.frameRef) : null;
  const skelJoints = skelData || adSkeleton?.joints || adNote?.joints || null;
  const correctRef = ad ? getCorrectFormRef(ad.skill, ad.subFaults?.[0]?.fault || ad.fault) : null;

  if (!videoUrl) {
    return null;
  }

  // Button style helper
  const btnStyle = (active, color) => ({
    flex: 1,
    padding: '10px 6px',
    fontSize: 12,
    fontWeight: 700,
    background: 'rgba(255,255,255,0.04)',
    border: `1px solid ${active ? (color || 'rgba(232,150,42,0.4)') : 'rgba(255,255,255,0.08)'}`,
    borderRadius: 8,
    cursor: 'pointer',
    color: active ? (color || '#e8962a') : 'rgba(255,255,255,0.4)',
    fontFamily: "'Outfit', sans-serif",
    minHeight: 44,
  });

  return (
    <div
      style={{
        margin: '20px 20px 0',
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 16,
        overflow: 'hidden',
      }}
      role="region"
      aria-label="Video review player"
    >
      {/* Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        aria-expanded={!isCollapsed}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: COLORS.text,
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 700, fontFamily: "'Outfit', sans-serif", display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>📹</span>
          Video Analysis
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: COLORS.textMuted }}>
            {sorted.length} skills
          </span>
          <svg
            width="12" height="12" viewBox="0 0 14 14"
            fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2"
            style={{ transform: isCollapsed ? 'none' : 'rotate(180deg)', transition: 'transform 0.2s' }}
            aria-hidden="true"
          >
            <path d="M2 5l5 4 5-4" />
          </svg>
        </div>
      </button>

      {!isCollapsed && (
        <div style={{ padding: '0 0 16px' }}>
          {/* Sticky video */}
          <div style={{
            position: 'sticky', top: 0, zIndex: 20,
            borderRadius: 0, overflow: 'hidden', background: '#000',
            borderTop: ad ? `2px solid ${adColor}` : '2px solid rgba(255,255,255,0.08)',
            borderBottom: ad ? 'none' : '2px solid rgba(255,255,255,0.08)',
          }}>
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              controlsList="nodownload"
              playsInline
              preload="auto"
              onLoadedMetadata={() => { if (videoRef.current) videoRef.current.pause(); }}
              style={{ width: '100%', display: 'block', maxHeight: 400 }}
            />
            {ad && (
              <div style={{
                position: 'absolute', bottom: 44, left: 8, right: 8,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: 'rgba(0,0,0,0.85)', borderRadius: 8, padding: '6px 10px',
                pointerEvents: 'none',
              }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>{safeStr(ad.skill)}</span>
                <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 14, fontWeight: 700, color: adColor }}>-{safeNum(ad.deduction, 0).toFixed(2)}</span>
              </div>
            )}
          </div>

          {/* Active skill details */}
          {ad && (
            <div style={{
              background: `${adColor}08`,
              borderLeft: `2px solid ${adColor}30`, borderRight: `2px solid ${adColor}30`, borderBottom: `2px solid ${adColor}30`,
              padding: '12px 14px', margin: '0 0 12px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ background: `${adColor}25`, color: adColor, fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 700, fontFamily: "'Outfit', sans-serif" }}>{ad.severity?.toUpperCase()}</span>
                <span style={{ fontFamily: "'Space Mono', monospace", fontWeight: 700, fontSize: 16, color: adColor }}>-{safeNum(ad.deduction, 0).toFixed(2)}</span>
                <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, marginLeft: 'auto', fontFamily: "'Space Mono', monospace" }}>{activeIdx + 1}/{sorted.length}</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', marginBottom: 4, fontFamily: "'Outfit', sans-serif" }}>{ad.skill}</div>

              {/* Sub-faults */}
              {ad.subFaults?.length > 0 && (
                <div style={{ marginBottom: 6 }}>
                  {ad.subFaults.map((sf, si) => {
                    const sfDed = safeNum(sf.deduction, 0);
                    const sfc = sfDed >= 0.20 ? '#dc2626' : sfDed >= 0.10 ? '#e06820' : '#ffc15a';
                    return (
                      <div key={si} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', flex: 1 }}>· {safeStr(sf.fault)}</span>
                        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: sfc, marginLeft: 8 }}>-{sfDed.toFixed(2)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {!ad.subFaults?.length && ad.fault && (
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5, marginBottom: 4 }}>{ad.fault}</div>
              )}

              {/* Frame compare — ACTUAL + PERFECT FORM side by side */}
              {showCompare && (
                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                  {/* ACTUAL frame */}
                  <div style={{ flex: 1, borderRadius: 10, overflow: 'hidden', position: 'relative', border: `2px solid ${adColor}40`, background: '#000' }}>
                    {capturingFrame ? (
                      <div style={{ width: '100%', aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 6 }}>
                        <div style={{ width: 22, height: 22, borderRadius: '50%', border: '2px solid rgba(232,150,42,0.2)', borderTopColor: '#e8962a', animation: 'rotate 1s linear infinite' }} />
                        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>Capturing...</span>
                      </div>
                    ) : displayFrame ? (
                      <div style={{ position: 'relative' }}>
                        <img src={displayFrame} alt="Deduction frame" style={{ width: '100%', display: 'block' }} />
                        {showSkeleton && skelJoints && <SkeletonCanvas joints={skelJoints} />}
                      </div>
                    ) : (
                      <div style={{ width: '100%', aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 4 }}>
                        <span style={{ fontSize: 16 }}>🎬</span>
                        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '0 6px' }}>
                          Tap skill to capture
                        </span>
                      </div>
                    )}
                    <div style={{ position: 'absolute', top: 4, left: 4, background: 'rgba(220,38,38,0.9)', padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700, color: 'white' }}>ACTUAL</div>
                  </div>
                  {/* PERFECT FORM skeleton */}
                  <div style={{ flex: 1, borderRadius: 10, overflow: 'hidden', position: 'relative', border: '1px solid rgba(34,197,94,0.25)', background: 'rgba(34,197,94,0.03)', aspectRatio: '16/9' }}>
                    <PerfectFormSVG joints={correctRef?.joints} label={correctRef?.label} />
                    <div style={{ position: 'absolute', top: 4, left: 4, background: 'rgba(34,197,94,0.9)', padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700, color: 'white' }}>PERFECT FORM</div>
                  </div>
                </div>
              )}

              {/* How to fix */}
              {ad.correction && (
                <div style={{ marginTop: 6, padding: '6px 10px', borderRadius: 6, background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.1)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#22c55e', marginBottom: 2, fontFamily: "'Outfit', sans-serif" }}>HOW TO FIX</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>{ad.correction}</div>
                </div>
              )}
              {!ad.correction && correctRef?.notes && (
                <div style={{ marginTop: 6, padding: '6px 10px', borderRadius: 6, background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.1)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#22c55e', marginBottom: 2, fontFamily: "'Outfit', sans-serif" }}>ZERO DEDUCTION LOOKS LIKE:</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>{correctRef.notes}</div>
                </div>
              )}

              {/* Reference links — removed for now, revisit later */}

              {/* Controls */}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button onClick={() => setShowCompare(!showCompare)} style={btnStyle(showCompare, 'rgba(232,150,42,0.8)')}>
                  {showCompare ? 'Hide' : 'Show'} Frames
                </button>
                <button onClick={() => setShowSkeleton(!showSkeleton)} style={btnStyle(showSkeleton, '#22c55e')}>
                  Skeleton {showSkeleton ? 'ON' : 'OFF'}
                </button>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={() => jumpTo(activeIdx - 1)} disabled={activeIdx <= 0}
                  style={{ ...btnStyle(true), opacity: activeIdx <= 0 ? 0.3 : 1, fontSize: 13 }}>
                  Prev
                </button>
                <button onClick={slowMoReplay}
                  style={{ ...btnStyle(true, 'rgba(232,150,42,0.5)'), flex: 1.3, color: '#e8962a', fontSize: 13 }}>
                  Slow-Mo 0.25x
                </button>
                <button onClick={() => jumpTo(activeIdx + 1)} disabled={activeIdx >= sorted.length - 1}
                  style={{ ...btnStyle(true), opacity: activeIdx >= sorted.length - 1 ? 0.3 : 1, fontSize: 13 }}>
                  Next
                </button>
              </div>
            </div>
          )}

          {!ad && <div style={{ height: 8 }} />}

          {/* Skill list — tap to jump */}
          <div style={{ padding: '0 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', marginBottom: 10, marginTop: 8, letterSpacing: 0.5, textTransform: 'uppercase', fontFamily: "'Outfit', sans-serif" }}>
              Tap a skill to jump video
            </div>
            {sorted.map((d, i) => {
              const c = DEDUCTION_SCALE[d.severity]?.color || '#ffc15a';
              const isActive = i === activeIdx;
              return (
                <div key={i} onClick={() => jumpTo(i)} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 12,
                  marginBottom: 6, cursor: 'pointer', transition: 'all 0.2s',
                  background: isActive ? `${c}18` : 'rgba(255,255,255,0.03)',
                  borderLeft: `4px solid ${isActive ? c : 'transparent'}`,
                  border: isActive ? `1px solid ${c}30` : '1px solid transparent',
                }}>
                  <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, fontWeight: 700, color: isActive ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.4)', minWidth: 42 }}>
                    {d.timestamp?.toLowerCase() === 'global' ? 'ALL' : fmt(tsToSec(d.timestamp))}
                  </span>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: isActive ? 'white' : 'rgba(255,255,255,0.7)', display: 'block', lineHeight: 1.3 }}>{safeStr(d.skill)}</span>
                    {d.fault && (
                      <span style={{ fontSize: 12, color: isActive ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.3)', display: 'block', marginTop: 3, lineHeight: 1.4 }}>
                        {safeStr(d.fault).length > 80 ? safeStr(d.fault).substring(0, 80) + '...' : safeStr(d.fault)}
                      </span>
                    )}
                  </div>
                  <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 15, fontWeight: 700, color: c }}>-{safeNum(d.deduction, 0).toFixed(2)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Hidden canvas for frame capture */}
      <canvas ref={captureCanvasRef} style={{ display: 'none' }} />
    </div>
  );
}

export default React.memo(VideoReviewPlayer);
