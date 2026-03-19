import React, { useState, useEffect } from 'react';
import StriveLogo from '../shared/StriveLogo';

// Inline SVG icon helper for splash (no dependency on LegacyApp Icon)
const SplashIcon = ({ name, size = 18 }) => {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "#e8962a", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", style: { display: "inline-block", verticalAlign: "middle", flexShrink: 0 } };
  switch (name) {
    case "target": return <svg {...p}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="#e8962a"/></svg>;
    case "progress": return <svg {...p}><path d="M3 20l5-6 4 4 9-12"/></svg>;
    case "mental": return <svg {...p}><path d="M12 2a7 7 0 00-5 12l2 3v3h6v-3l2-3a7 7 0 00-5-12z"/><path d="M9 20h6"/><path d="M10 23h4"/></svg>;
    default: return <svg {...p}><circle cx="12" cy="12" r="4" fill="#e8962a"/></svg>;
  }
};

export default function SplashScreen({ onStart }) {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 100);
    const t2 = setTimeout(() => setPhase(2), 700);
    const t3 = setTimeout(() => setPhase(3), 1200);
    const t4 = setTimeout(() => setPhase(4), 1700);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, []);

  const show = (n) => phase >= n;

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center',
      position: 'relative', overflow: 'hidden',
      background: 'var(--strive-midnight)', maxWidth: 540, margin: '0 auto',
    }}>
      {/* Background grid */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none',
        backgroundImage: `
          linear-gradient(rgba(232,150,42,0.02) 1px, transparent 1px),
          linear-gradient(90deg, rgba(232,150,42,0.02) 1px, transparent 1px)
        `,
        backgroundSize: '60px 60px', opacity: 0.5,
      }} />

      {/* Gold radial glow — cinematic */}
      <div style={{
        position: 'absolute', top: '15%', left: '50%', transform: 'translateX(-50%)',
        width: 600, height: 600, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(232,150,42,0.08) 0%, rgba(232,150,42,0.02) 40%, transparent 70%)',
        pointerEvents: 'none', opacity: show(1) ? 1 : 0, transition: 'opacity 2s ease-out',
      }} />

      {/* Logo — scales in */}
      <div style={{
        opacity: show(1) ? 1 : 0, transform: show(1) ? 'scale(1)' : 'scale(0.6)',
        transition: 'all 1.2s cubic-bezier(0.16, 1, 0.3, 1)',
      }}>
        <StriveLogo size={120} animate={show(1)} />
      </div>

      {/* Description */}
      <div style={{
        opacity: show(2) ? 1 : 0, transform: show(2) ? 'translateY(0)' : 'translateY(20px)',
        transition: 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
        marginTop: 36, marginBottom: 48,
      }}>
        <p style={{
          color: 'rgba(255,255,255,0.35)', fontSize: 15, maxWidth: 340,
          margin: '0 auto', lineHeight: 1.8, fontWeight: 400,
        }}>
          AI-powered video analysis using official USA Gymnastics and Xcel scoring criteria.
          Detailed deduction breakdowns and a clear path to your best score.
        </p>
      </div>

      {/* CTA */}
      <div style={{
        opacity: show(4) ? 1 : 0, transform: show(4) ? 'translateY(0)' : 'translateY(20px)',
        transition: 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
      }}>
        <button className="btn-gold" onClick={onStart} style={{
          fontSize: 16, padding: '16px 56px', letterSpacing: 1, borderRadius: 14,
          boxShadow: '0 4px 24px rgba(232,150,42,0.3)',
        }}>
          Get Started
        </button>
      </div>

      {/* Value props — staggered fadeIn */}
      <div style={{
        opacity: show(3) ? 1 : 0,
        transition: 'opacity 0.8s 0.2s',
        marginTop: 48, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 320,
      }}>
        {[
          { icon: 'target', text: 'Understand exactly why your score is what it is' },
          { icon: 'progress', text: 'Get a personalized plan to improve every tenth' },
          { icon: 'mental', text: 'Mental training and recovery guidance' },
        ].map((item, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 16px', borderRadius: 12,
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.04)',
            opacity: show(3) ? 1 : 0, transform: show(3) ? 'translateY(0)' : 'translateY(8px)',
            transition: `all 0.5s cubic-bezier(0.16,1,0.3,1) ${0.3 + i * 0.12}s`,
          }}>
            <SplashIcon name={item.icon} size={18} />
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>
              {item.text}
            </span>
          </div>
        ))}
      </div>

      {/* Credential badges at bottom */}
      <div style={{
        position: 'absolute', bottom: 28, left: 0, right: 0,
        display: 'flex', justifyContent: 'center', gap: 20,
        opacity: show(4) ? 1 : 0, transition: 'opacity 1s 0.3s',
      }}>
        {['USAG Levels 1-10', 'Xcel Bronze-Sapphire', 'MAG & WAG'].map((badge, i) => (
          <span key={i} style={{
            fontSize: 9, fontWeight: 600, letterSpacing: 1.5,
            color: 'rgba(232,150,42,0.3)', textTransform: 'uppercase',
          }}>
            {badge}
          </span>
        ))}
      </div>
    </div>
  );
}
