/**
 * tierGates.js — Single source of truth for all tier access control.
 * Every component imports from here — never hardcode tier checks.
 *
 * Tier values: 'free' | 'competitive' | 'elite'
 * Default for new users: 'free'
 */

const TIER_RANK = { free: 0, competitive: 1, elite: 2 };

function atLeast(tier, required) {
  return (TIER_RANK[tier] ?? 0) >= (TIER_RANK[required] ?? 99);
}

// Analysis cap
export function getMonthlyAnalysisCap(tier) {
  return tier === 'free' ? 3 : Infinity;
}

export function hasReachedAnalysisCap(tier, countThisMonth) {
  return countThisMonth >= getMonthlyAnalysisCap(tier);
}

// Results screen — full skill cards
export function canSeeFullSkillCards(tier) { return atLeast(tier, 'competitive'); }

// Deduction blur threshold
export function getDeductionBlurThreshold(tier) {
  return tier === 'free' ? 3 : Infinity;
}

// Drills + Today's Fix
export function canSeeDrills(tier) { return atLeast(tier, 'competitive'); }

// Biomechanics (Body Angles tab)
export function canSeeBiomechanics(tier) { return atLeast(tier, 'competitive'); }

// Injury awareness
export function canSeeInjuryAwareness(tier) { return atLeast(tier, 'competitive'); }

// 3-level judge narrative
export function canSeeJudgeNarrative(tier) { return atLeast(tier, 'competitive'); }

// Skeleton overlay + slow motion
export function canSeeSkeletonOverlay(tier) { return atLeast(tier, 'competitive'); }
export function canUseSlowMotion(tier) { return atLeast(tier, 'competitive'); }

// Level Up Advisor
export function canSeeLevelUp(tier) { return atLeast(tier, 'competitive'); }

// Mastermind Module — elite only, competitive gets preview
export function canSeeMastermind(tier) { return atLeast(tier, 'elite'); }
export function seesMastermindPreview(tier) { return tier === 'competitive'; }

// Goal tracking + roadmap — elite only
export function canSeeGoalTracking(tier) { return atLeast(tier, 'elite'); }

// What-If score simulator — elite only
export function canSeeWhatIf(tier) { return atLeast(tier, 'elite'); }

// Session diagnostics — elite only
export function canSeeSessionDiagnostics(tier) { return atLeast(tier, 'elite'); }

// Coach notes — elite only
export function canSeeCoachNotes(tier) { return atLeast(tier, 'elite'); }

// Share with Coach — ALL tiers (B2B funnel)
export function canShareWithCoach() { return true; }

// Score card export — ALL tiers (viral loop)
export function canExportScoreCard() { return true; }

// Upgrade CTA copy per feature per tier
export function getUpgradeCTA(feature, tier) {
  const ctas = {
    skeleton: { free: 'Unlock skeleton overlay + slow motion — Competitive $9.99/mo' },
    levelUp: { free: 'See what she needs for the next level — Competitive $9.99/mo' },
    mastermind: { free: 'Unlock the full AI training program — Elite $19.99/mo', competitive: 'Your goals are set. Unlock your full training program — Elite $19.99/mo' },
    drills: { free: 'See targeted drills for every deduction — Competitive $9.99/mo' },
    whatIf: { free: 'Simulate your score with fixes — Elite $19.99/mo', competitive: 'Simulate your score with fixes — Elite $19.99/mo' },
    diagnostics: { free: 'Unlock session diagnostics — Elite $19.99/mo', competitive: 'Unlock session diagnostics — Elite $19.99/mo' },
    fullSkillCards: { free: 'Upgrade to see the full breakdown — Competitive $9.99/mo' },
    biomechanics: { free: 'See joint angles and body position data — Competitive $9.99/mo' },
    injury: { free: 'See injury risk signals — Competitive $9.99/mo' },
    narrative: { free: 'See the full judge analysis — Competitive $9.99/mo' },
  };
  return ctas[feature]?.[tier] ?? 'Upgrade to unlock this feature';
}
