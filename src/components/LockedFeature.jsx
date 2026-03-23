import React from 'react';
import { getUpgradeCTA } from '../engine/tierGates';

export default function LockedFeature({ feature, tier, children, onUpgrade }) {
  return (
    <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', minHeight: 80 }}>
      <div style={{ filter: 'blur(4px)', opacity: 0.4, pointerEvents: 'none', userSelect: 'none' }}>
        {children || <div style={{ height: 80, background: 'rgba(255,255,255,0.03)', borderRadius: 8 }} />}
      </div>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', background: 'rgba(6,6,15,0.75)',
        backdropFilter: 'blur(2px)', padding: '16px 20px', textAlign: 'center', gap: 10,
      }}>
        <div style={{ fontSize: 20 }}>&#x1F512;</div>
        <div style={{ fontSize: 12, color: 'rgba(221,224,237,0.8)', lineHeight: 1.5, maxWidth: 260, fontFamily: "'Outfit', sans-serif" }}>
          {getUpgradeCTA(feature, tier)}
        </div>
        <button onClick={() => {
          try { const { trackEvent } = require('../utils/monitoring'); trackEvent('upgrade_cta_tapped', { feature, tier }); } catch {}
          if (onUpgrade) onUpgrade();
        }} style={{
          background: 'rgba(212,168,67,0.15)', border: '1px solid rgba(212,168,67,0.5)',
          borderRadius: 8, padding: '8px 18px', fontSize: 12, fontWeight: 700,
          color: '#f0c85a', cursor: 'pointer', minHeight: 44, fontFamily: "'Outfit', sans-serif",
        }}>
          Upgrade &rarr;
        </button>
      </div>
    </div>
  );
}
