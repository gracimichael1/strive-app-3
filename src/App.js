import React, { useState, useEffect } from 'react';
import { TierProvider } from './context/TierContext';
import storage from './utils/storage';
import './styles/global.css';

// Legacy bridge: original app runs fully inside the STRIVE brand shell.
// Phase 1 = rebrand + new splash + tier context + decomposed data modules.
// Phase 2 = progressively replace legacy screens with new components.
import LegacyApp from './LegacyApp';
import SplashScreen from './components/onboarding/SplashScreen';

function AppShell() {
  const [hasProfile, setHasProfile] = useState(null);
  const [showStriveSplash, setShowStriveSplash] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const stored = await storage.get('strive-profile');
        if (stored) {
          setHasProfile(true);
          setShowStriveSplash(false);
        } else {
          setHasProfile(false);
        }
      } catch {
        setHasProfile(false);
      }
    })();
  }, []);

  if (hasProfile === null) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--strive-midnight)',
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          border: '3px solid rgba(196,152,42,0.2)',
          borderTopColor: 'var(--strive-gold-500)',
          animation: 'rotate 1s linear infinite',
        }} />
      </div>
    );
  }

  if (!hasProfile && showStriveSplash) {
    return <SplashScreen onStart={() => setShowStriveSplash(false)} />;
  }

  return <LegacyApp />;
}

export default function App() {
  return (
    <TierProvider>
      <AppShell />
    </TierProvider>
  );
}
