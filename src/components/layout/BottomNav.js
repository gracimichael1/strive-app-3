import React, { useState } from 'react';

const TABS = [
  {
    id: 'home',
    label: 'Home',
    icon: (active) => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill={active ? 'currentColor' : 'none'} stroke={active ? 'none' : 'currentColor'} strokeWidth="1.5">
        <path d="M10 2l8 7h-3v9H5v-9H2l8-7z" />
      </svg>
    ),
  },
  {
    id: 'train',
    label: 'Train',
    icon: (active) => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M3 15l4-5 3 3 7-9" />
      </svg>
    ),
  },
  {
    id: 'analyze',
    label: 'Analyze',
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <circle cx="11" cy="11" r="9" />
        <path d="M11 5v6l4 2" />
      </svg>
    ),
    primary: true,
  },
  {
    id: 'mind',
    label: 'Mind',
    icon: (active) => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <circle cx="10" cy="6" r="3.5" />
        <path d="M4 17c0-3.3 2.7-6 6-6s6 2.7 6 6" />
        <path d="M6.5 8.5l3.5-2 3.5 2" />
      </svg>
    ),
  },
  {
    id: 'goals',
    label: 'Goals',
    icon: (active) => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <circle cx="10" cy="10" r="7.5" />
        <path d="M7 10l2 2 4-4" />
      </svg>
    ),
  },
];

export default function BottomNav({ profile }) {
  const [activeTab, setActiveTab] = useState('home');

  const handleTabClick = (tabId) => {
    setActiveTab(tabId);
    // Bridge to legacy app — dispatch custom events that LegacyApp listens for
    window.dispatchEvent(new CustomEvent('strive-nav', { detail: { tab: tabId } }));
  };

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
      background: 'linear-gradient(180deg, transparent 0%, var(--strive-midnight) 20%)',
      padding: '0 8px 20px',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around',
      height: 88,
      // Safe area for iPhone notch
      paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
    }}>
      {TABS.map(tab => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => handleTabClick(tab.id)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              padding: tab.primary ? '8px 16px' : '8px 14px',
              borderRadius: 14,
              border: 'none',
              cursor: 'pointer',
              fontFamily: "'Outfit', sans-serif",
              fontSize: 10,
              fontWeight: 600,
              background: isActive
                ? 'rgba(196,152,42,0.08)'
                : tab.primary
                  ? 'rgba(196,152,42,0.06)'
                  : 'transparent',
              color: isActive
                ? 'var(--strive-gold-300)'
                : 'var(--strive-text-faint)',
              transition: 'all 0.2s',
              WebkitTapHighlightColor: 'transparent',
              ...(tab.primary && !isActive ? {
                color: 'var(--strive-gold-500)',
                background: 'rgba(196,152,42,0.08)',
                border: '1px solid rgba(196,152,42,0.15)',
              } : {}),
            }}
          >
            <div style={{
              transition: 'transform 0.2s',
              transform: isActive ? 'scale(1.1)' : 'scale(1)',
            }}>
              {tab.icon(isActive)}
            </div>
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
