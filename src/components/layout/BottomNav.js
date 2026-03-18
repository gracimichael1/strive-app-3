import React, { useState, useEffect } from 'react';

const TABS = [
  {
    id: 'home',
    label: 'Home',
    icon: (active) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12l9-8 9 8" />
        <path d="M5 10v10h14V10" />
        <rect x="9" y="14" width="6" height="6" />
      </svg>
    ),
  },
  {
    id: 'analyze',
    label: 'Analyze',
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="5" width="20" height="15" rx="2"/>
        <circle cx="12" cy="13" r="4"/>
        <path d="M8 5l1-2h6l1 2"/>
      </svg>
    ),
    primary: true,
  },
  {
    id: 'results',
    label: 'Results',
    icon: (active) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="2" width="16" height="20" rx="2"/>
        <path d="M8 6h8M8 10h6M8 14h4"/>
      </svg>
    ),
  },
  {
    id: 'progress',
    label: 'Progress',
    icon: (active) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 20l5-6 4 4 9-12" />
      </svg>
    ),
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: (active) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M12 1v3M12 20v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M1 12h3M20 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>
      </svg>
    ),
  },
];

export default function BottomNav({ profile }) {
  const [activeTab, setActiveTab] = useState('home');

  // Listen for external nav events
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.tab) setActiveTab(e.detail.tab);
    };
    window.addEventListener('strive-nav', handler);
    return () => window.removeEventListener('strive-nav', handler);
  }, []);

  const handleTabClick = (tabId) => {
    setActiveTab(tabId);
    window.dispatchEvent(new CustomEvent('strive-nav', { detail: { tab: tabId } }));
  };

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
      background: 'linear-gradient(180deg, transparent 0%, var(--strive-midnight) 20%)',
      padding: '0 8px',
      paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around',
      height: 88,
    }}>
      {TABS.map(tab => {
        const isActive = activeTab === tab.id;
        const color = tab.primary
          ? 'var(--strive-gold-500)'
          : isActive
            ? 'var(--strive-gold-300)'
            : 'var(--strive-text-faint)';
        return (
          <button
            key={tab.id}
            onClick={() => handleTabClick(tab.id)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
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
              color,
              transition: 'all 0.2s',
              WebkitTapHighlightColor: 'transparent',
              position: 'relative',
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
            {/* Gold dot indicator for active tab */}
            {isActive && !tab.primary && (
              <div style={{
                position: 'absolute', bottom: 2,
                width: 4, height: 4, borderRadius: '50%',
                background: 'var(--strive-gold-500)',
              }} />
            )}
          </button>
        );
      })}
    </nav>
  );
}
