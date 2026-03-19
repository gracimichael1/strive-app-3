import React, { createContext, useContext, useState, useEffect } from 'react';
import storage from '../utils/storage';

const TierContext = createContext();

export const TIERS = {
  FREE: 'free',
  COMPETITIVE: 'competitive',
  ELITE: 'elite',
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
    showDailyAffirmations: true,     // All tiers get daily encouragement
    showSeasonGoals: false,
    showVideoReview: true,           // Basic video review
    showSkeletonOverlay: false,
    maxDrillsShown: 1,               // Only #1 fix
    showProgressTracking: false,
  },
  [TIERS.COMPETITIVE]: {
    maxAnalysesPerMonth: Infinity,
    showFullDeductions: true,
    showBiomechanics: true,
    showTrainingProgram: true,
    showMentalTraining: true,
    showCoachReport: false,          // Elite only
    showWhatIf: true,
    showDailyAffirmations: true,
    showSeasonGoals: true,
    showVideoReview: true,
    showSkeletonOverlay: true,
    maxDrillsShown: Infinity,
    showProgressTracking: true,
  },
  [TIERS.ELITE]: {
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
        if (stored) {
          // Normalize legacy "pro" tier to "competitive"
          const val = stored.value === 'pro' ? TIERS.COMPETITIVE : stored.value;
          setTier(val);
        }
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

  const upgradeToCompetitive = async () => {
    setTier(TIERS.COMPETITIVE);
    await storage.set('strive-tier', TIERS.COMPETITIVE);
  };

  const upgradeToElite = async () => {
    setTier(TIERS.ELITE);
    await storage.set('strive-tier', TIERS.ELITE);
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

  const features = TIER_FEATURES[tier] || TIER_FEATURES[TIERS.FREE];
  const isPaid = tier === TIERS.COMPETITIVE || tier === TIERS.ELITE;
  const canAnalyze = isPaid || analysesThisMonth < features.maxAnalysesPerMonth;
  const analysesRemaining = isPaid ? Infinity : Math.max(0, features.maxAnalysesPerMonth - analysesThisMonth);

  return (
    <TierContext.Provider value={{
      tier,
      features,
      canAnalyze,
      analysesRemaining,
      analysesThisMonth,
      upgradeToCompetitive,
      upgradeToElite,
      incrementAnalyses,
      isPaid,
      isCompetitive: tier === TIERS.COMPETITIVE || tier === TIERS.ELITE,
      isElite: tier === TIERS.ELITE,
      // Legacy compatibility — maps to isPaid
      isPro: isPaid,
      upgradeToPro: upgradeToCompetitive,
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

// Tier gate component — wraps content that requires Competitive or Elite tier
export function TierGate({ children, feature, fallback }) {
  const { features, isPaid } = useTier();

  if (isPaid || (feature && features[feature])) {
    return children;
  }

  return fallback || <UpgradePrompt />;
}

// Legacy alias
export const ProGate = TierGate;

export function UpgradePrompt({ compact = false }) {
  const { upgradeToCompetitive } = useTier();

  if (compact) {
    return (
      <button
        onClick={upgradeToCompetitive}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(139,92,246,0.05))',
          border: '1px solid rgba(139,92,246,0.3)',
          borderRadius: 8, padding: '6px 14px', cursor: 'pointer',
          color: '#A78BFA', fontSize: 12, fontWeight: 600,
          fontFamily: 'inherit',
        }}
      >
        <span style={{ fontSize: 10 }}>🔒</span> Unlock with Competitive
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
          onClick={upgradeToCompetitive}
          style={{
            background: 'linear-gradient(135deg, #8B5CF6, #A78BFA)',
            color: '#FFF', border: 'none', padding: '12px 32px',
            borderRadius: 12, fontWeight: 700, fontSize: 15,
            cursor: 'pointer', fontFamily: 'inherit', letterSpacing: 0.3,
          }}
        >
          Upgrade to STRIVE Competitive
        </button>
      </div>
    </div>
  );
}

// Legacy alias
export const ProUpgradePrompt = UpgradePrompt;

export default TierContext;
