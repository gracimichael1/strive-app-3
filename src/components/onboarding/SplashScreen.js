import React, { useState, useEffect } from 'react';
import StriveLogo from '../shared/StriveLogo';

export default function SplashScreen({ onStart }) {
  const [entered, setEntered] = useState(false);
  useEffect(() => { setTimeout(() => setEntered(true), 100); }, []);

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center',
      position: 'relative', overflow: 'hidden',
      background: 'var(--strive-midnight)',
    }}>
      {/* Background grid */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none',
        backgroundImage: `
          linear-gradient(rgba(196,152,42,0.02) 1px, transparent 1px),
          linear-gradient(90deg, rgba(196,152,42,0.02) 1px, transparent 1px)
        `,
        backgroundSize: '60px 60px', opacity: 0.5,
      }} />

      {/* Ambient glow */}
      <div style={{
        position: 'absolute', top: '10%', left: '50%', transform: 'translateX(-50%)',
        width: 500, height: 500,
        background: 'radial-gradient(circle, rgba(196,152,42,0.06) 0%, transparent 60%)',
        pointerEvents: 'none',
      }} />

      {/* Logo */}
      <div style={{
        opacity: entered ? 1 : 0, transform: entered ? 'scale(1)' : 'scale(0.8)',
        transition: 'all 1s cubic-bezier(0.16, 1, 0.3, 1)',
      }}>
        <StriveLogo size={120} animate={entered} />
      </div>

      {/* Description */}
      <div style={{
        opacity: entered ? 1 : 0, transform: entered ? 'translateY(0)' : 'translateY(20px)',
        transition: 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.6s',
        marginTop: 36, marginBottom: 48,
      }}>
        <p style={{
          color: 'rgba(255,255,255,0.35)', fontSize: 15, maxWidth: 340,
          margin: '0 auto', lineHeight: 1.8, fontWeight: 400,
        }}>
          AI-powered video analysis using official USA Gymnastics & Xcel scoring criteria. 
          Detailed deduction breakdowns, personalized training programs, and a clear path to your best score.
        </p>
      </div>

      {/* CTA */}
      <div style={{
        opacity: entered ? 1 : 0, transform: entered ? 'translateY(0)' : 'translateY(20px)',
        transition: 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.9s',
      }}>
        <button className="btn-gold" onClick={onStart} style={{
          fontSize: 16, padding: '16px 56px', letterSpacing: 1, borderRadius: 14,
        }}>
          Get Started
        </button>
      </div>

      {/* Value props */}
      <div style={{
        opacity: entered ? 1 : 0,
        transition: 'opacity 1s 1.2s',
        marginTop: 48, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 320,
      }}>
        {[
          { icon: '🎯', text: 'Understand exactly why your score is what it is' },
          { icon: '📈', text: 'Get a personalized plan to improve every tenth' },
          { icon: '🧠', text: 'Mental training, nutrition, and recovery guidance' },
        ].map((item, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 16px', borderRadius: 12,
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.04)',
          }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>{item.icon}</span>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>
              {item.text}
            </span>
          </div>
        ))}
      </div>

      {/* Bottom badges */}
      <div style={{
        position: 'absolute', bottom: 28, left: 0, right: 0,
        display: 'flex', justifyContent: 'center', gap: 20,
        opacity: entered ? 1 : 0, transition: 'opacity 1s 1.4s',
      }}>
        {['USAG Levels 1–10', 'Xcel Bronze–Sapphire', 'MAG & WAG'].map((badge, i) => (
          <span key={i} style={{
            fontSize: 9, fontWeight: 600, letterSpacing: 1.5,
            color: 'rgba(196,152,42,0.3)', textTransform: 'uppercase',
          }}>
            {badge}
          </span>
        ))}
      </div>
    </div>
  );
}
