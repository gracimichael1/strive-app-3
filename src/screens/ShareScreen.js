import React, { useState, useEffect } from 'react';

const COLORS = {
  bg: '#070c16',
  surface: '#0d1422',
  surface2: '#121b2d',
  gold: '#e8962a',
  goldLight: '#ffc15a',
  green: '#22c55e',
  orange: '#e06820',
  text: '#E2E8F0',
  textSecondary: '#8890AB',
  border: 'rgba(232, 150, 42, 0.12)',
};

/**
 * ShareScreen — Public view of a shared analysis.
 * No auth required. Shows score, event, top 3 skills.
 */
function ShareScreen({ token }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!token) return;
    try {
      const raw = localStorage.getItem(`strive-share-data-${token}`);
      if (raw) setData(JSON.parse(raw));
    } catch {}
    // Track view
    try { const { trackEvent } = require('../utils/monitoring'); trackEvent('share_link_opened'); } catch {}
  }, [token]);

  if (!data) {
    return (
      <div style={{ minHeight: '100vh', background: COLORS.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.text, fontFamily: "'Outfit', sans-serif", marginBottom: 8 }}>
            Analysis Not Found
          </div>
          <div style={{ fontSize: 14, color: COLORS.textSecondary, fontFamily: "'Outfit', sans-serif" }}>
            This share link may have expired or the analysis was deleted.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, padding: '24px 16px 80px' }}>
      <div style={{ maxWidth: 540, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            fontSize: 12, color: COLORS.gold, fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: 1, fontFamily: "'Outfit', sans-serif", marginBottom: 8,
          }}>
            STRIVE Analysis
          </div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: COLORS.surface2, border: `1px solid ${COLORS.border}`,
            padding: '6px 14px', borderRadius: 20, fontSize: 12,
            color: COLORS.textSecondary, fontWeight: 500, fontFamily: "'Outfit', sans-serif",
          }}>
            {[data.level, data.event].filter(Boolean).join(' — ')}
          </div>
        </div>

        {/* Score */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            fontFamily: "'Space Mono', monospace", fontSize: 56, fontWeight: 700,
            background: `linear-gradient(135deg, ${COLORS.goldLight}, ${COLORS.gold})`,
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            lineHeight: 1,
          }}>
            {(data.score || 0).toFixed(3)}
          </div>
          <div style={{
            fontSize: 10, color: 'rgba(255,255,255,0.25)', fontFamily: "'Outfit', sans-serif",
            marginTop: 4,
          }}>
            AI score · training reference only · not an official USAG score
          </div>
          <div style={{
            fontSize: 12, color: COLORS.textSecondary, fontFamily: "'Outfit', sans-serif",
            marginTop: 8,
          }}>
            {data.date ? new Date(data.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : ''}
          </div>
        </div>

        {/* Top Skills */}
        {data.skills?.length > 0 && (
          <div style={{
            background: COLORS.surface, border: `1px solid ${COLORS.border}`,
            borderRadius: 16, padding: 20, marginBottom: 20,
          }}>
            <div style={{
              fontSize: 11, fontWeight: 700, color: COLORS.gold, letterSpacing: 1,
              textTransform: 'uppercase', marginBottom: 12, fontFamily: "'Outfit', sans-serif",
            }}>
              Top Skills
            </div>
            {data.skills.map((s, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 0',
                borderBottom: i < data.skills.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
              }}>
                <span style={{ fontSize: 14, color: COLORS.text, fontFamily: "'Outfit', sans-serif" }}>
                  {s.name || 'Skill'}
                </span>
                <span style={{
                  fontFamily: "'Space Mono', monospace", fontSize: 12, fontWeight: 700,
                  color: s.deduction > 0 ? COLORS.orange : COLORS.green,
                }}>
                  {s.deduction > 0 ? `-${s.deduction.toFixed(2)}` : 'Clean'}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Coach CTA */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(232,150,42,0.1), rgba(232,150,42,0.05))',
          border: '1px solid rgba(232,150,42,0.3)', borderRadius: 16,
          padding: '24px 20px', textAlign: 'center',
        }}>
          <div style={{
            fontSize: 14, fontWeight: 600, color: COLORS.text, marginBottom: 6,
            fontFamily: "'Outfit', sans-serif",
          }}>
            Analyzed by STRIVE
          </div>
          <div style={{
            fontSize: 13, color: COLORS.textSecondary, marginBottom: 16,
            fontFamily: "'Outfit', sans-serif",
          }}>
            AI-powered gymnastics scoring for coaches and parents
          </div>
          <a
            href="/signup?role=coach"
            onClick={() => { try { const { trackEvent } = require('../utils/monitoring'); trackEvent('coach_signup_from_share'); } catch {} }}
            style={{
              display: 'inline-block',
              background: `linear-gradient(135deg, ${COLORS.gold}, ${COLORS.goldLight})`,
              color: '#000', textDecoration: 'none', padding: '12px 28px',
              borderRadius: 12, fontFamily: "'Outfit', sans-serif",
              fontSize: 14, fontWeight: 700, minHeight: 44,
            }}
          >
            Free Coach Account →
          </a>
        </div>
      </div>
    </div>
  );
}

export default React.memo(ShareScreen);
