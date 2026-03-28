/**
 * GymnastSelector.js
 * "Tap your gymnast" — multi-person detection on a video frame.
 * User taps the correct athlete; selection flows to pipeline + prompt.
 *
 * Shows automatically when multiple people are detected.
 * If only one person is detected, auto-selects and skips.
 *
 * Returns: { x, y } normalized center (0-1) of the selected person's torso.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

// ─── Constants ─────────────────────────────────────────────────────────────

/** How far into the video to grab the selection frame (seconds) */
const SAMPLE_TIME = 2.0;

/** Max people to detect */
const MAX_PEOPLE = 6;

/** Minimum landmark visibility to consider a person "real" */
const MIN_VISIBILITY_AVG = 0.4;

/** Joints used to compute bounding box and center */
const BODY_INDICES = {
  nose: 0,
  leftShoulder: 11, rightShoulder: 12,
  leftHip: 23, rightHip: 24,
  leftKnee: 25, rightKnee: 26,
  leftAnkle: 27, rightAnkle: 28,
};

// ─── Component ─────────────────────────────────────────────────────────────

export default function GymnastSelector({ videoFile, onSelect, onSkip }) {
  const [status, setStatus] = useState('loading'); // loading | selecting | error
  const [people, setPeople] = useState([]);        // Array of { landmarks, center, bbox }
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [frameDataUrl, setFrameDataUrl] = useState(null);
  const [frameDims, setFrameDims] = useState({ w: 0, h: 0 });
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  // ── Extract frame and detect all people ──────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      let blobUrl = null;
      try {
        setStatus('loading');

        // Create video element
        const video = document.createElement('video');
        video.preload = 'auto';
        video.muted = true;
        video.playsInline = true;
        blobUrl = URL.createObjectURL(videoFile);
        video.src = blobUrl;

        // Wait for metadata
        await new Promise((resolve, reject) => {
          video.onloadeddata = resolve;
          video.onerror = () => reject(new Error('Could not load video'));
          setTimeout(() => reject(new Error('Video load timeout')), 8000);
        });

        // Seek to sample time (or 25% in if video is short)
        const seekTo = Math.min(SAMPLE_TIME, video.duration * 0.25);
        video.currentTime = seekTo;
        await new Promise(r => { video.onseeked = r; });

        // Draw frame to canvas
        const w = video.videoWidth || 640;
        const h = video.videoHeight || 480;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(video, 0, 0, w, h);

        if (cancelled) { URL.revokeObjectURL(blobUrl); return; }

        setFrameDataUrl(canvas.toDataURL('image/jpeg', 0.85));
        setFrameDims({ w, h });

        // Load multi-person detector
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );

        const detector = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
            delegate: 'GPU',
          },
          runningMode: 'IMAGE',
          numPoses: MAX_PEOPLE,
        });

        const result = detector.detect(canvas);
        URL.revokeObjectURL(blobUrl);

        if (cancelled) return;

        if (!result.landmarks || result.landmarks.length === 0) {
          // No people detected — skip selector
          onSkip();
          return;
        }

        // Filter to "real" people (sufficient visibility)
        const validPeople = result.landmarks
          .map((lms, idx) => {
            const bodyLms = Object.values(BODY_INDICES).map(i => lms[i]).filter(Boolean);
            const avgVis = bodyLms.reduce((s, l) => s + (l.visibility || 0), 0) / (bodyLms.length || 1);
            if (avgVis < MIN_VISIBILITY_AVG) return null;

            // Compute bounding box and center from body landmarks
            const xs = bodyLms.map(l => l.x);
            const ys = bodyLms.map(l => l.y);
            const minX = Math.min(...xs);
            const maxX = Math.max(...xs);
            const minY = Math.min(...ys);
            const maxY = Math.max(...ys);

            // Center = torso midpoint (shoulders + hips average)
            const sh = [lms[11], lms[12]].filter(Boolean);
            const hp = [lms[23], lms[24]].filter(Boolean);
            const torsoPoints = [...sh, ...hp];
            const cx = torsoPoints.reduce((s, l) => s + l.x, 0) / (torsoPoints.length || 1);
            const cy = torsoPoints.reduce((s, l) => s + l.y, 0) / (torsoPoints.length || 1);

            return {
              idx,
              landmarks: lms,
              center: { x: cx, y: cy },
              bbox: {
                x: Math.max(0, minX - 0.02),
                y: Math.max(0, minY - 0.02),
                w: Math.min(1, maxX - minX + 0.04),
                h: Math.min(1, maxY - minY + 0.04),
              },
              avgVisibility: avgVis,
            };
          })
          .filter(Boolean);

        if (validPeople.length === 0) {
          onSkip();
          return;
        }

        if (validPeople.length === 1) {
          // Only one person — auto-select
          onSelect({
            center: validPeople[0].center,
            bbox: validPeople[0].bbox,
          });
          return;
        }

        // Multiple people — user needs to choose
        setPeople(validPeople);
        setStatus('selecting');

      } catch (err) {
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        console.warn('[GymnastSelector] Detection failed:', err.message);
        if (!cancelled) onSkip(); // Fail gracefully — skip selector
      }
    })();

    return () => { cancelled = true; };
  }, [videoFile, onSelect, onSkip]);

  // ── Handle tap ───────────────────────────────────────────────────────────
  const handleTap = useCallback((e) => {
    if (!containerRef.current || people.length === 0) return;

    const rect = containerRef.current.getBoundingClientRect();
    const tapX = (e.clientX - rect.left) / rect.width;  // 0-1
    const tapY = (e.clientY - rect.top) / rect.height;   // 0-1

    // Find closest person to tap
    let closest = 0;
    let closestDist = Infinity;
    people.forEach((p, i) => {
      const dx = p.center.x - tapX;
      const dy = p.center.y - tapY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < closestDist) {
        closestDist = dist;
        closest = i;
      }
    });

    setSelectedIdx(closest);
  }, [people]);

  // ── Confirm selection ────────────────────────────────────────────────────
  const handleConfirm = useCallback(() => {
    if (selectedIdx == null || !people[selectedIdx]) return;
    onSelect({
      center: people[selectedIdx].center,
      bbox: people[selectedIdx].bbox,
    });
  }, [selectedIdx, people, onSelect]);

  // ── Render ───────────────────────────────────────────────────────────────

  if (status === 'loading') {
    return (
      <div style={{
        padding: '24px 16px', textAlign: 'center',
        background: 'rgba(232,150,42,0.04)', borderRadius: 12,
        border: '1px solid rgba(232,150,42,0.15)', marginBottom: 16,
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: '50%', margin: '0 auto 12px',
          border: '3px solid rgba(232,150,42,0.3)', borderTopColor: '#e8962a',
          animation: 'rotate 1s linear infinite',
        }} />
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', fontFamily: "'Outfit', sans-serif" }}>
          Detecting people in video...
        </div>
      </div>
    );
  }

  if (status !== 'selecting' || people.length === 0) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginBottom: 10,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          background: 'rgba(232,150,42,0.15)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', fontSize: 14,
        }}>
          👆
        </div>
        <div>
          <div style={{
            fontSize: 14, fontWeight: 700, color: '#e8962a',
            fontFamily: "'Outfit', sans-serif",
          }}>
            Tap Your Gymnast
          </div>
          <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.45)' }}>
            {people.length} people detected — select who to analyze
          </div>
        </div>
      </div>

      {/* Frame with person overlays */}
      <div
        ref={containerRef}
        onClick={handleTap}
        style={{
          position: 'relative', borderRadius: 12, overflow: 'hidden',
          border: selectedIdx != null
            ? '2px solid #22c55e'
            : '2px solid rgba(232,150,42,0.4)',
          cursor: 'pointer', transition: 'border-color 0.3s',
        }}
      >
        {/* Background frame */}
        {frameDataUrl && (
          <img
            src={frameDataUrl}
            alt="Video frame"
            style={{ width: '100%', display: 'block' }}
          />
        )}

        {/* Person bounding boxes + skeletons */}
        <svg
          viewBox={`0 0 ${frameDims.w} ${frameDims.h}`}
          style={{
            position: 'absolute', top: 0, left: 0,
            width: '100%', height: '100%',
            pointerEvents: 'none',
          }}
        >
          {people.map((p, i) => {
            const isSelected = i === selectedIdx;
            const color = isSelected ? '#22c55e' : 'rgba(232,150,42,0.7)';
            const bx = p.bbox.x * frameDims.w;
            const by = p.bbox.y * frameDims.h;
            const bw = p.bbox.w * frameDims.w;
            const bh = p.bbox.h * frameDims.h;

            // Draw skeleton connections
            const connections = [
              [11, 12], // shoulders
              [11, 13], [13, 15], // left arm
              [12, 14], [14, 16], // right arm
              [11, 23], [12, 24], // torso
              [23, 24], // hips
              [23, 25], [25, 27], // left leg
              [24, 26], [26, 28], // right leg
            ];

            return (
              <g key={i}>
                {/* Bounding box */}
                <rect
                  x={bx} y={by} width={bw} height={bh}
                  fill={isSelected ? 'rgba(34,197,94,0.12)' : 'rgba(232,150,42,0.08)'}
                  stroke={color}
                  strokeWidth={isSelected ? 3 : 2}
                  strokeDasharray={isSelected ? '' : '6 3'}
                  rx={6}
                />

                {/* Skeleton lines */}
                {connections.map(([a, b], ci) => {
                  const la = p.landmarks[a];
                  const lb = p.landmarks[b];
                  if (!la || !lb || (la.visibility || 0) < 0.3 || (lb.visibility || 0) < 0.3) return null;
                  return (
                    <line
                      key={ci}
                      x1={la.x * frameDims.w} y1={la.y * frameDims.h}
                      x2={lb.x * frameDims.w} y2={lb.y * frameDims.h}
                      stroke={color}
                      strokeWidth={isSelected ? 2.5 : 1.5}
                      strokeLinecap="round"
                      opacity={isSelected ? 0.9 : 0.5}
                    />
                  );
                })}

                {/* Label */}
                <rect
                  x={bx} y={by - 22} width={isSelected ? 70 : 60} height={20}
                  rx={4}
                  fill={isSelected ? '#22c55e' : 'rgba(0,0,0,0.7)'}
                />
                <text
                  x={bx + 6} y={by - 8}
                  fill="white" fontSize={11} fontWeight={700}
                  fontFamily="'Outfit', sans-serif"
                >
                  {isSelected ? '✓ Selected' : `Person ${i + 1}`}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Confirm / Skip buttons */}
      <div style={{
        display: 'flex', gap: 10, marginTop: 10,
      }}>
        {selectedIdx != null ? (
          <button
            onClick={handleConfirm}
            style={{
              flex: 1, padding: '12px 16px', borderRadius: 10,
              background: 'linear-gradient(135deg, #22c55e, #16a34a)',
              border: 'none', color: 'white', fontSize: 14, fontWeight: 700,
              cursor: 'pointer', fontFamily: "'Outfit', sans-serif",
              minHeight: 44,
            }}
          >
            ✓ Analyze This Gymnast
          </button>
        ) : (
          <div style={{
            flex: 1, padding: '12px 16px', borderRadius: 10,
            background: 'rgba(255,255,255,0.04)', textAlign: 'center',
            fontSize: 13, color: 'rgba(255,255,255,0.4)',
            fontFamily: "'Outfit', sans-serif", minHeight: 44,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            Tap a person in the frame above
          </div>
        )}
        <button
          onClick={onSkip}
          style={{
            padding: '12px 16px', borderRadius: 10,
            background: 'rgba(255,255,255,0.06)', border: 'none',
            color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', fontFamily: "'Outfit', sans-serif",
            minHeight: 44,
          }}
        >
          Skip
        </button>
      </div>
    </div>
  );
}
