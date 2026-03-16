import React, { useState, useRef, useCallback, useEffect } from 'react';
import { analyzeVideo } from '../../analysis/analysisPipeline';
import { drawSkeleton, drawAngles, drawTimestamp } from '../../overlay/skeletonOverlay';
import SkillTimeline from '../timeline/SkillTimeline';
import SkillCard from '../analysis/SkillCard';

// ─── Upload Zone ──────────────────────────────────────────────────────────────

function UploadZone({ onFile, disabled }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef();

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('video/')) onFile(file);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      style={{
        border: `2px dashed ${dragging ? 'rgba(196,152,42,0.6)' : 'rgba(255,255,255,0.1)'}`,
        borderRadius: 16,
        padding: '48px 32px',
        textAlign: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.25s',
        background: dragging ? 'rgba(196,152,42,0.04)' : 'rgba(255,255,255,0.02)',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files[0]; if (f) onFile(f); }}
      />

      {/* Icon */}
      <div style={{ marginBottom: 16 }}>
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style={{ margin: '0 auto' }}>
          <circle cx="24" cy="24" r="22" fill="rgba(196,152,42,0.08)" stroke="rgba(196,152,42,0.2)" strokeWidth="1.5" />
          <path d="M18 30V22l6-4 6 4v8H18z" stroke="#C4982A" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
          <path d="M30 22l4-3v10l-4-3" stroke="#C4982A" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
          <circle cx="24" cy="20" r="1.5" fill="#C4982A" />
        </svg>
      </div>

      <div style={{ fontSize: 16, fontWeight: 600, color: '#E2E8F0', marginBottom: 8 }}>
        Drop a gymnastics video here
      </div>
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', marginBottom: 20 }}>
        MP4, MOV, WebM · Filmed from the side for best results
      </div>
      <button
        className="btn-gold"
        style={{ padding: '10px 24px', fontSize: 14 }}
        onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
        disabled={disabled}
      >
        Select Video
      </button>
    </div>
  );
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({ pct, label }) {
  return (
    <div style={{ padding: '24px 0' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10,
      }}>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>{label}</span>
        <span style={{
          fontSize: 12, fontFamily: "'Space Mono', monospace",
          color: '#C4982A', fontWeight: 700,
        }}>{pct}%</span>
      </div>
      <div style={{
        height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: 'linear-gradient(90deg, #9E7C1F, #E8C35A)',
          borderRadius: 3,
          transition: 'width 0.4s ease',
        }} />
      </div>

      {/* Stage dots */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', marginTop: 12,
      }}>
        {['Model', 'Frames', 'Poses', 'Skills', 'Done'].map((s, i) => {
          const stagePct = i * 25;
          const done     = pct >= stagePct + 5;
          return (
            <div key={s} style={{ textAlign: 'center' }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%', margin: '0 auto 4px',
                background: done ? '#C4982A' : 'rgba(255,255,255,0.1)',
                transition: 'background 0.3s',
              }} />
              <div style={{ fontSize: 10, color: done ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.15)' }}>{s}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Skeleton Canvas Overlay ───────────────────────────────────────────────────

function SkeletonCanvas({ videoRef, poseFrame, width, height, showAngles, bio }) {
  const canvasRef = useRef();

  useEffect(() => {
    if (!canvasRef.current || !poseFrame) return;
    const ctx = canvasRef.current.getContext('2d');
    ctx.clearRect(0, 0, width, height);
    drawSkeleton(ctx, poseFrame.joints, width, height);
    if (showAngles && bio?.peak) {
      drawAngles(ctx, poseFrame.joints, bio.peak, width, height);
    }
    drawTimestamp(ctx, poseFrame.timestamp, width, height);
  }, [poseFrame, width, height, showAngles, bio]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        position: 'absolute', top: 0, left: 0,
        width: '100%', height: '100%',
        pointerEvents: 'none',
      }}
    />
  );
}

// ─── Main VideoAnalyzer ───────────────────────────────────────────────────────

export default function VideoAnalyzer({ onBack }) {
  const videoRef    = useRef();
  const [file,         setFile]         = useState(null);
  const [videoURL,     setVideoURL]     = useState(null);
  const [analyzing,    setAnalyzing]    = useState(false);
  const [progress,     setProgress]     = useState({ pct: 0, label: '' });
  const [result,       setResult]       = useState(null);
  const [error,        setError]        = useState(null);
  const [selectedSkill, setSelectedSkill] = useState(null);
  const [expandedCard,  setExpandedCard]  = useState(0);
  const [currentTime,  setCurrentTime]  = useState(0);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [showAngles,   setShowAngles]   = useState(true);

  // Nearest pose frame to current time
  const nearestPoseFrame = useCallback(() => {
    if (!result?.poseFrames) return null;
    return result.poseFrames.reduce((best, f) =>
      Math.abs(f.timestamp - currentTime) < Math.abs(best.timestamp - currentTime) ? f : best
    , result.poseFrames[0]);
  }, [result, currentTime]);

  const handleFile = useCallback((f) => {
    setFile(f);
    setVideoURL(URL.createObjectURL(f));
    setResult(null);
    setError(null);
    setSelectedSkill(null);
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!videoRef.current) return;
    setAnalyzing(true);
    setError(null);
    setResult(null);

    try {
      const r = await analyzeVideo(videoRef.current, (p) => setProgress(p));
      setResult(r);
      setSelectedSkill(0);
      setExpandedCard(0);
    } catch (e) {
      setError(e.message || 'Analysis failed. Please try again.');
    } finally {
      setAnalyzing(false);
    }
  }, []);

  const handleSeek = useCallback((timestamp) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = timestamp;
    videoRef.current.pause();
    setCurrentTime(timestamp);
  }, []);

  const handleSkillSelect = useCallback((idx) => {
    setSelectedSkill(idx);
    setExpandedCard(idx);
    if (result?.skillAnalysis?.[idx]) {
      handleSeek(result.skillAnalysis[idx].peakTimestamp);
    }
  }, [result, handleSeek]);

  const selectedBio = result?.skillAnalysis?.[selectedSkill]?.biomechanics ?? null;
  const poseFrame   = nearestPoseFrame();

  // Track video time
  const handleTimeUpdate = () => {
    if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--strive-midnight)',
      paddingBottom: 100,
      fontFamily: "'Outfit', sans-serif",
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px 0',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        {onBack && (
          <button
            onClick={onBack}
            style={{
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10, width: 36, height: 36,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.8">
              <path d="M10 3L5 8l5 5" />
            </svg>
          </button>
        )}
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#E2E8F0', margin: 0 }}>
            Motion Analysis
          </h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', margin: 0 }}>
            AI-powered pose detection & biomechanics
          </p>
        </div>
      </div>

      <div style={{ padding: '16px 20px' }}>

        {/* Upload */}
        {!videoURL && (
          <UploadZone onFile={handleFile} disabled={analyzing} />
        )}

        {/* Video + Overlay */}
        {videoURL && (
          <div style={{ marginBottom: 16 }}>
            <div style={{
              position: 'relative',
              background: '#000',
              borderRadius: 14,
              overflow: 'hidden',
              aspectRatio: '16/9',
            }}>
              <video
                ref={videoRef}
                src={videoURL}
                controls={!analyzing}
                playsInline
                onTimeUpdate={handleTimeUpdate}
                style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
              />
              {/* Skeleton overlay */}
              {showSkeleton && result && poseFrame && (
                <SkeletonCanvas
                  videoRef={videoRef}
                  poseFrame={poseFrame}
                  width={result.frameWidth}
                  height={result.frameHeight}
                  showAngles={showAngles}
                  bio={selectedBio}
                />
              )}
            </div>

            {/* Overlay toggles */}
            {result && (
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <ToggleChip label="Skeleton" active={showSkeleton} onClick={() => setShowSkeleton(v => !v)} />
                <ToggleChip label="Angles"   active={showAngles}   onClick={() => setShowAngles(v => !v)} />
              </div>
            )}
          </div>
        )}

        {/* Analyze button */}
        {videoURL && !result && !analyzing && (
          <button
            className="btn-gold"
            style={{ width: '100%', marginBottom: 16 }}
            onClick={handleAnalyze}
          >
            ⚡ Analyze Routine
          </button>
        )}

        {/* Progress */}
        {analyzing && (
          <div style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 14, padding: '8px 20px 16px',
            marginBottom: 16,
          }}>
            <ProgressBar pct={progress.pct || 0} label={progress.label || 'Starting…'} />
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            padding: '14px 16px', borderRadius: 12, marginBottom: 16,
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.2)',
            color: '#EF4444', fontSize: 14,
          }}>
            ⚠ {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <>
            {/* Summary row */}
            <div style={{
              display: 'flex', gap: 10, marginBottom: 16,
            }}>
              <StatPill label="Duration"   value={`${result.duration?.toFixed(1)}s`} />
              <StatPill label="Skills"     value={result.skillAnalysis.length} />
              <StatPill label="Frames"     value={result.totalFrames} />
            </div>

            {/* Timeline */}
            <div style={{ marginBottom: 16 }}>
              <SectionLabel>Skill Timeline</SectionLabel>
              <SkillTimeline
                skills={result.skillAnalysis}
                duration={result.duration}
                selected={selectedSkill}
                onSelect={handleSkillSelect}
                currentTime={currentTime}
              />
            </div>

            {/* Skill cards */}
            {result.skillAnalysis.length > 0 ? (
              <div>
                <SectionLabel>Skill Breakdown</SectionLabel>
                {result.skillAnalysis.map((skill, idx) => (
                  <SkillCard
                    key={skill.id}
                    skill={skill}
                    expanded={expandedCard === idx}
                    onToggle={() => setExpandedCard(expandedCard === idx ? null : idx)}
                    onSeek={handleSeek}
                  />
                ))}
              </div>
            ) : (
              <div style={{
                padding: '20px', textAlign: 'center',
                background: 'rgba(255,255,255,0.02)',
                borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)',
              }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🤸</div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>
                  No distinct skills detected. Try a clip where the gymnast is clearly visible from the side.
                </div>
              </div>
            )}

            {/* Re-analyze */}
            <button
              className="btn-outline"
              style={{ width: '100%', marginTop: 16 }}
              onClick={() => { setResult(null); setFile(null); setVideoURL(null); }}
            >
              Analyze Another Video
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function ToggleChip({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
        border: `1px solid ${active ? 'rgba(196,152,42,0.4)' : 'rgba(255,255,255,0.08)'}`,
        background: active ? 'rgba(196,152,42,0.1)' : 'transparent',
        color: active ? '#C4982A' : 'rgba(255,255,255,0.35)',
        cursor: 'pointer', transition: 'all 0.2s',
        fontFamily: "'Outfit', sans-serif",
      }}
    >
      {label}
    </button>
  );
}

function StatPill({ label, value }) {
  return (
    <div style={{
      flex: 1, textAlign: 'center', padding: '10px 8px',
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 12,
    }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: '#C4982A', fontFamily: "'Space Mono', monospace" }}>
        {value}
      </div>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
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
