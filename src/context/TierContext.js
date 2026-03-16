import React, { createContext, useContext, useState, useEffect } from 'react';
import storage from '../utils/storage';

const TierContext = createContext();

export const TIERS = {
  FREE: 'free',
  PRO: 'pro',
};

// Define what each tier can access
export const TIER_FEATURES = {
  [TIERS.FREE]: {
    maxAnalysesPerMonth: 3,
    showFullDeductions: false,       // Only top 3
    showBiomechanics: false,
    showTrainingProgram: false,
    showMentalTraining: false,
    showCoachReport: false,
    showWhatIf: false,
    showDailyAffirmations: false,
    showSeasonGoals: false,
    showVideoReview: true,           // Basic video review
    showSkeletonOverlay: false,
    maxDrillsShown: 1,               // Only #1 fix
    showProgressTracking: false,
  },
  [TIERS.PRO]: {
    maxAnalysesPerMonth: Infinity,
    showFullDeductions: true,
    showBiomechanics: true,
    showTrainingProgram: true,
    showMentalTraining: true,
    showCoachReport: true,
    showWhatIf: true,
    showDailyAffirmations: true,
    showSeasonGoals: true,
    showVideoReview: true,
    showSkeletonOverlay: true,
    maxDrillsShown: Infinity,
    showProgressTracking: true,
  },
};

export function TierProvider({ children }) {
  const [tier, setTier] = useState(TIERS.FREE);
  const [analysesThisMonth, setAnalysesThisMonth] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const stored = await storage.get('strive-tier');
        if (stored) setTier(stored.value);
        const count = await storage.get('strive-analyses-month');
        if (count) {
          const data = JSON.parse(count.value);
          const now = new Date();
          // Reset count if month changed
          if (data.month === now.getMonth() && data.year === now.getFullYear()) {
            setAnalysesThisMonth(data.count);
          }
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  const upgradeToPro = async () => {
    setTier(TIERS.PRO);
    await storage.set('strive-tier', TIERS.PRO);
  };

  const incrementAnalyses = async () => {
    const now = new Date();
    const newCount = analysesThisMonth + 1;
    setAnalysesThisMonth(newCount);
    await storage.set('strive-analyses-month', JSON.stringify({
      count: newCount,
      month: now.getMonth(),
      year: now.getFullYear(),
    }));
  };

  const features = TIER_FEATURES[tier];
  const canAnalyze = tier === TIERS.PRO || analysesThisMonth < features.maxAnalysesPerMonth;
  const analysesRemaining = tier === TIERS.PRO ? Infinity : Math.max(0, features.maxAnalysesPerMonth - analysesThisMonth);

  return (
    <TierContext.Provider value={{
      tier,
      features,
      canAnalyze,
      analysesRemaining,
      analysesThisMonth,
      upgradeToPro,
      incrementAnalyses,
      isPro: tier === TIERS.PRO,
      loading,
    }}>
      {children}
    </TierContext.Provider>
  );
}

export function useTier() {
  const ctx = useContext(TierContext);
  if (!ctx) throw new Error('useTier must be used within TierProvider');
  return ctx;
}

// Pro gate component — wraps content that requires Pro tier
export function ProGate({ children, feature, fallback }) {
  const { features, isPro } = useTier();
  
  if (isPro || (feature && features[feature])) {
    return children;
  }
  
  return fallback || <ProUpgradePrompt />;
}

export function ProUpgradePrompt({ compact = false }) {
  const { upgradeToPro } = useTier();
  
  if (compact) {
    return (
      <button
        onClick={upgradeToPro}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(139,92,246,0.05))',
          border: '1px solid rgba(139,92,246,0.3)',
          borderRadius: 8, padding: '6px 14px', cursor: 'pointer',
          color: '#A78BFA', fontSize: 12, fontWeight: 600,
          fontFamily: 'inherit',
        }}
      >
        <span style={{ fontSize: 10 }}>🔒</span> Unlock with Pro
      </button>
    );
  }

  return (
    <div style={{
      border: '1.5px solid rgba(139,92,246,0.25)',
      borderRadius: 16, padding: 24, textAlign: 'center',
      background: 'rgba(139,92,246,0.04)',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ fontSize: 22, marginBottom: 8 }}>🔒</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#E2E8F0', marginBottom: 6 }}>
          Unlock full analysis
        </div>
        <div style={{
          fontSize: 13, color: '#8890AB', lineHeight: 1.6,
          maxWidth: 280, margin: '0 auto 16px',
        }}>
          Skill-by-skill breakdown, biomechanics dashboard, personalized training program, video review with skeleton overlay, and more.
        </div>
        <button
          onClick={upgradeToPro}
          style={{
            background: 'linear-gradient(135deg, #8B5CF6, #A78BFA)',
            color: '#FFF', border: 'none', padding: '12px 32px',
            borderRadius: 12, fontWeight: 700, fontSize: 15,
            cursor: 'pointer', fontFamily: 'inherit', letterSpacing: 0.3,
          }}
        >
          Upgrade to STRIVE Pro
        </button>
      </div>
    </div>
  );
}

export default TierContext;
