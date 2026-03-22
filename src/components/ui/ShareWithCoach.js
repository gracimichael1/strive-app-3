import React, { useState, useCallback } from 'react';

const COLORS = {
  surface: '#0d1422',
  surface2: '#121b2d',
  gold: '#e8962a',
  goldLight: '#ffc15a',
  green: '#22c55e',
  text: '#E2E8F0',
  textSecondary: '#8890AB',
  border: 'rgba(232, 150, 42, 0.12)',
};

function ShareWithCoach({ analysisId, result }) {
  const [copied, setCopied] = useState(false);

  const handleShare = useCallback(async () => {
    // Generate or retrieve share token
    const storageKey = `strive-share-${analysisId || 'latest'}`;
    let token;
    try {
      token = localStorage.getItem(storageKey);
    } catch {}
    if (!token) {
      token = crypto.randomUUID();
      try { localStorage.setItem(storageKey, token); } catch {}
    }

    const shareUrl = `${window.location.origin}/share/${token}`;

    // Store share data for the public route to read
    try {
      const shareData = {
        token,
        score: result?.finalScore,
        event: result?.event || result?.summary?.apparatus,
        level: result?.summary?.level || '',
        date: new Date().toISOString(),
        skills: (result?.gradedSkills || []).slice(0, 3).map(s => ({
          name: s.skill || s.skillName,
          deduction: s.deduction || s.gradeDeduction || 0,
        })),
      };
      localStorage.setItem(`strive-share-data-${token}`, JSON.stringify(shareData));
    } catch {}

    // Copy to clipboard
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = shareUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }

    // Analytics
    try { const { trackEvent } = require('../../utils/monitoring'); trackEvent('share_coach_clicked'); } catch {}
  }, [analysisId, result]);

  return (
    <div style={{ padding: '0 20px', marginTop: 12 }}>
      <button
        onClick={handleShare}
        style={{
          width: '100%',
          padding: '12px 20px',
          borderRadius: 12,
          border: `1px solid ${COLORS.border}`,
          background: copied ? 'rgba(34, 197, 94, 0.08)' : COLORS.surface,
          color: copied ? COLORS.green : COLORS.text,
          cursor: 'pointer',
          fontFamily: "'Outfit', sans-serif",
          fontSize: 14,
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          minHeight: 44,
          transition: 'all 0.2s',
        }}
        aria-label="Share analysis with coach"
      >
        {copied ? (
          <>&#10003; Link copied — send to your coach</>
        ) : (
          <>Share with Coach</>
        )}
      </button>
    </div>
  );
}

export default React.memo(ShareWithCoach);
