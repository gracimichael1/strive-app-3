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
        // DEV OVERRIDE — manual tier override for QA testing
        if (process.env.NODE_ENV === 'development') {
          const override = localStorage.getItem('strive-tier-override');
          if (override) {
            setTier(override);
            setLoading(false);
            return;
          }
        }

        // Load cached tier from storage first (instant)
        const stored = await storage.get('strive-tier');
        if (stored) {
          const val = stored.value === 'pro' ? TIERS.COMPETITIVE : stored.value;
          setTier(val);
        }

        // Load analysis count
        const count = await storage.get('strive-analyses-month');
        if (count) {
          const data = JSON.parse(count.value);
          const now = new Date();
          if (data.month === now.getMonth() && data.year === now.getFullYear()) {
            setAnalysesThisMonth(data.count);
          }
        }

        // Hydrate from backend — source of truth for paid tiers
        const profile = JSON.parse(localStorage.getItem('strive-athlete-profile') || '{}');
        const email = profile.email || profile.parentEmail;
        if (email) {
          try {
            const token = process.env.REACT_APP_STRIVE_TOKEN || 'strive-2026-launch';
            const res = await fetch(`/api/account?action=subscription&email=${encodeURIComponent(email)}`, {
              headers: { 'X-Strive-Token': token }
            });
            if (!res.ok) throw new Error('API error');
            const data = await res.json();
            if (data.tier && data.tier !== 'free' && data.status === 'active') {
              setTier(data.tier);
              await storage.set('strive-tier', data.tier);
            } else if (data.status === 'canceled') {
              // Only downgrade on explicit cancellation — not 'none'.
              // 'none' means no Stripe subscription exists, which is normal
              // for manually-set tiers (Settings switcher, dev testing).
              setTier(TIERS.FREE);
              await storage.delete('strive-tier');
            }
            // status === 'none' → keep cached tier from localStorage (line 80)
          } catch (err) {
            // Network failure — keep cached tier, don't lock users out
            console.warn('STRIVE: tier hydration failed, using cache', err.message);
          }
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  const changeTier = async (newTier) => {
    setTier(newTier);
    if (newTier === TIERS.FREE) {
      await storage.delete('strive-tier');
    } else {
      await storage.set('strive-tier', newTier);
    }
  };

  const upgradeToCompetitive = async () => changeTier(TIERS.COMPETITIVE);
  const upgradeToElite = async () => changeTier(TIERS.ELITE);

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
      changeTier,
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
