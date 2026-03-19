import React from 'react';

export default function StriveLogo({ size = 100, showText = true, animate = false }) {
  const s = size;
  const textSize = s * 0.25;
  const tagSize = s * 0.08;
  
  return (
    <div style={{ textAlign: 'center', display: 'inline-block' }}>
      <svg viewBox="0 0 120 120" width={s} height={s} style={{
        filter: 'drop-shadow(0 0 24px rgba(232,150,42,0.25))',
        ...(animate ? { animation: 'scaleIn 1s cubic-bezier(0.16, 1, 0.3, 1)' } : {}),
      }}>
        <defs>
          <linearGradient id="striveGold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#e8962a" />
            <stop offset="50%" stopColor="#ffc15a" />
            <stop offset="100%" stopColor="#e8962a" />
          </linearGradient>
        </defs>
        {/* Outer ring */}
        <circle cx="60" cy="60" r="56" fill="none" stroke="url(#striveGold)" strokeWidth="1.5" opacity="0.35" />
        <circle cx="60" cy="60" r="52" fill="none" stroke="url(#striveGold)" strokeWidth="0.5" opacity="0.15" />
        
        {/* Dynamic arc mark — athlete in flight */}
        <g transform="translate(60,62)">
          {/* Main arc (flight trajectory) */}
          <path d="M-30 22 Q-10 -32, 20 -20 Q35 -12, 28 22" 
            fill="none" stroke="url(#striveGold)" strokeWidth="3.5" strokeLinecap="round" />
          {/* Inner momentum trail */}
          <path d="M-20 16 Q-4 -18, 18 -12" 
            fill="none" stroke="#ffc15a" strokeWidth="1.5" strokeLinecap="round" opacity="0.45" />
          {/* Peak spark */}
          <circle cx="22" cy="-22" r="3" fill="#ffc15a" opacity="0.85" />
          <circle cx="22" cy="-22" r="6" fill="#ffc15a" opacity="0.12" />
        </g>
        
        {/* Subtle 10.0 at bottom */}
        <text x="60" y="106" textAnchor="middle" fill="url(#striveGold)" 
          fontFamily="'Space Mono', monospace" fontSize="8" fontWeight="700" opacity="0.2">
          10.000
        </text>
      </svg>
      
      {showText && (
        <div style={{ marginTop: size * 0.12 }}>
          <div style={{
            fontFamily: "'Georgia', 'Times New Roman', serif",
            fontSize: textSize,
            fontWeight: 500,
            letterSpacing: textSize * 0.2,
            lineHeight: 1,
          }}>
            <span style={{
              background: 'linear-gradient(135deg, #e8962a, #ffc15a, #e8962a)',
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              color: 'transparent',
            }}>STRIVE</span>
          </div>
          <div style={{
            fontSize: tagSize,
            fontWeight: 600,
            letterSpacing: tagSize * 0.4,
            color: 'rgba(255,255,255,0.25)',
            marginTop: size * 0.06,
            textTransform: 'uppercase',
            fontFamily: "'Outfit', sans-serif",
          }}>
            See Your Score. Own Your Growth.
          </div>
        </div>
      )}
    </div>
  );
}

// Compact logo for headers/nav
export function StriveLogoCompact({ size = 28 }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size}>
      <defs>
        <linearGradient id="sgc" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#e8962a" />
          <stop offset="50%" stopColor="#ffc15a" />
          <stop offset="100%" stopColor="#e8962a" />
        </linearGradient>
      </defs>
      <g transform="translate(60,58)">
        <path d="M-35 26 Q-12 -38, 24 -24 Q42 -14, 34 26" 
          fill="none" stroke="url(#sgc)" strokeWidth="6" strokeLinecap="round" />
        <circle cx="26" cy="-26" r="5" fill="#ffc15a" opacity="0.85" />
      </g>
    </svg>
  );
}
