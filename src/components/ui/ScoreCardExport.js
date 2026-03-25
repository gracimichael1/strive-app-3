import React, { useRef, useCallback } from 'react';

/**
 * ScoreCardExport — renders a hidden score card and exports as PNG via html2canvas.
 * Uses Web Share API on mobile, falls back to download.
 */
export default function ScoreCardExport({ result, athleteName, tier }) {
  const cardRef = useRef(null);

  const safeNum = (v, d = 0) => {
    const n = Number(v);
    return isNaN(n) ? d : n;
  };

  const score = safeNum(result?.finalScore, 0);
  const event = result?.event || result?.summary?.event || 'Event';
  const level = result?.level || result?.summary?.level || 'Level';
  const rangeLow = safeNum(result?.confidenceRange?.[0] || result?.summary?.confidence_range?.[0], score - 0.2);
  const rangeHigh = safeNum(result?.confidenceRange?.[1] || result?.summary?.confidence_range?.[1], score + 0.2);
  const confidence = result?.confidence || result?.summary?.confidence || 'Medium';
  const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  // Top 3 deductions
  const deds = (result?.executionDeductions || result?.deductions || [])
    .slice()
    .sort((a, b) => safeNum(b.deduction, 0) - safeNum(a.deduction, 0))
    .slice(0, 3);

  const handleExport = useCallback(async () => {
    if (!cardRef.current) return;
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#070c16',
        scale: 2,
        useCORS: true,
      });
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) return;

      const safeName = (athleteName || 'athlete').toLowerCase().replace(/[^a-z0-9]/g, '-');
      const safeEvent = event.toLowerCase().replace(/[^a-z0-9]/g, '-');
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `strive-${safeName}-${safeEvent}-${dateStr}.png`;

      // Try native share first (mobile)
      if (navigator.share && navigator.canShare) {
        const file = new File([blob], filename, { type: 'image/png' });
        const shareData = { files: [file], title: `STRIVE — ${event} ${score.toFixed(3)}` };
        if (navigator.canShare(shareData)) {
          await navigator.share(shareData);
          return;
        }
      }

      // Fallback: download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.warn('ScoreCardExport failed:', err);
    }
  }, [result, athleteName, event, score]);

  return (
    <>
      {/* Hidden score card for export */}
      <div style={{ position: 'absolute', left: -9999, opacity: 0, pointerEvents: 'none' }}>
        <div ref={cardRef} style={{
          width: 375,
          height: 280,
          background: '#070c16',
          padding: '20px 24px',
          fontFamily: "'Outfit', sans-serif",
          color: '#e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          boxSizing: 'border-box',
        }}>
          {/* Header */}
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#e8962a', letterSpacing: 1, marginBottom: 2 }}>STRIVE</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: "'Outfit', sans-serif" }}>
              {event} · {level}
            </div>
          </div>

          {/* Score */}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, fontWeight: 700, color: '#e8962a', fontFamily: "'Space Mono', monospace", lineHeight: 1 }}>
              {score.toFixed(3)}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontFamily: "'Space Mono', monospace", marginTop: 4 }}>
              Range {rangeLow.toFixed(2)}–{rangeHigh.toFixed(2)} · {confidence}
            </div>
          </div>

          {/* Top 3 deductions */}
          <div>
            {deds.map((d, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', fontSize: 11,
                color: 'rgba(255,255,255,0.6)', fontFamily: "'Outfit', sans-serif",
                marginBottom: 2,
              }}>
                <span>{d.skill || d.fault || `Deduction ${i + 1}`}</span>
                <span style={{ fontFamily: "'Space Mono', monospace", color: '#ef4444' }}>
                  -{safeNum(d.deduction, 0).toFixed(2)}
                </span>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontFamily: "'Outfit', sans-serif" }}>
              Scored by STRIVE · strive-app-amber.vercel.app
            </div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontFamily: "'Outfit', sans-serif" }}>
              {date}
            </div>
          </div>
        </div>
      </div>

      {/* Export button */}
      <button
        onClick={handleExport}
        style={{
          width: '100%',
          minHeight: 44,
          padding: '12px 16px',
          marginTop: 10,
          borderRadius: 10,
          border: 'none',
          background: '#e8962a',
          color: '#070c16',
          fontSize: 14,
          fontWeight: 700,
          fontFamily: "'Outfit', sans-serif",
          cursor: 'pointer',
          transition: 'opacity 0.15s',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        📸 Save Score Card
      </button>
    </>
  );
}
