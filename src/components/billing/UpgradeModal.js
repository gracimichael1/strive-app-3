import React, { useState, useCallback } from 'react';

const TIERS = [
  {
    id: 'competitive',
    name: 'Competitive',
    monthlyPrice: 9.99,
    yearlyPrice: 99,
    features: [
      'Unlimited video analyses',
      'Detailed deduction breakdowns',
      'Progress tracking',
    ],
  },
  {
    id: 'elite',
    name: 'Elite',
    monthlyPrice: 19.99,
    yearlyPrice: 199,
    popular: true,
    features: [
      'Everything in Competitive',
      'Advanced analytics',
      'Drill recommendations',
      'Priority processing',
    ],
  },
  {
    id: 'coach',
    name: 'Coach',
    monthlyPrice: 49.99,
    yearlyPrice: 499,
    features: [
      'Everything in Elite',
      'Multi-athlete management',
      'Team analytics',
      'Comparative reporting',
    ],
  },
  {
    id: 'gym',
    name: 'Gym',
    monthlyPrice: 149,
    yearlyPrice: 1499,
    features: [
      'Everything in Coach',
      'Unlimited athletes',
      'Facility-wide access',
      'Dedicated support',
    ],
  },
];

function savingsPercent(monthly, yearly) {
  const fullYear = monthly * 12;
  return Math.round(((fullYear - yearly) / fullYear) * 100);
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: 16,
  },
  modal: {
    backgroundColor: '#070c16',
    border: '1px solid rgba(232, 150, 42, 0.2)',
    borderRadius: 16,
    maxWidth: 540,
    width: '100%',
    maxHeight: '90vh',
    overflowY: 'auto',
    padding: 24,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontFamily: 'Outfit, sans-serif',
    fontSize: 22,
    fontWeight: 700,
    color: '#E2E8F0',
    margin: 0,
  },
  closeButton: {
    background: 'none',
    border: 'none',
    color: '#E2E8F0',
    fontSize: 24,
    cursor: 'pointer',
    padding: 8,
    minWidth: 44,
    minHeight: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggle: {
    display: 'flex',
    justifyContent: 'center',
    gap: 0,
    marginBottom: 24,
    backgroundColor: '#0d1422',
    borderRadius: 8,
    padding: 4,
  },
  toggleButton: (active) => ({
    fontFamily: 'Outfit, sans-serif',
    fontSize: 14,
    fontWeight: 600,
    padding: '8px 20px',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    minHeight: 44,
    transition: 'background-color 0.2s, color 0.2s',
    backgroundColor: active ? '#e8962a' : 'transparent',
    color: active ? '#070c16' : '#E2E8F0',
  }),
  saveBadge: {
    fontFamily: 'Outfit, sans-serif',
    fontSize: 11,
    fontWeight: 700,
    color: '#22c55e',
    marginLeft: 6,
  },
  card: (isCurrent, isPopular) => ({
    backgroundColor: '#0d1422',
    border: `1px solid ${isPopular ? '#e8962a' : 'rgba(232, 150, 42, 0.12)'}`,
    borderRadius: 12,
    padding: 20,
    marginBottom: 12,
    position: 'relative',
    opacity: isCurrent ? 0.6 : 1,
  }),
  popularBadge: {
    position: 'absolute',
    top: -10,
    right: 16,
    backgroundColor: '#e8962a',
    color: '#070c16',
    fontFamily: 'Outfit, sans-serif',
    fontSize: 11,
    fontWeight: 700,
    padding: '3px 10px',
    borderRadius: 4,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  tierName: {
    fontFamily: 'Outfit, sans-serif',
    fontSize: 18,
    fontWeight: 700,
    color: '#E2E8F0',
    margin: '0 0 4px 0',
  },
  price: {
    fontFamily: 'Space Mono, monospace',
    fontSize: 28,
    fontWeight: 700,
    color: '#e8962a',
    margin: '0 0 4px 0',
  },
  interval: {
    fontFamily: 'Space Mono, monospace',
    fontSize: 13,
    color: '#8A90AA',
  },
  featureList: {
    listStyle: 'none',
    padding: 0,
    margin: '12px 0 16px 0',
  },
  featureItem: {
    fontFamily: 'Outfit, sans-serif',
    fontSize: 13,
    color: '#8890AB',
    padding: '3px 0',
  },
  subscribeButton: (isCurrent, loading) => ({
    width: '100%',
    padding: '12px 16px',
    borderRadius: 8,
    border: 'none',
    fontFamily: 'Outfit, sans-serif',
    fontSize: 15,
    fontWeight: 700,
    cursor: isCurrent || loading ? 'default' : 'pointer',
    minHeight: 44,
    transition: 'background-color 0.2s',
    backgroundColor: isCurrent ? '#121b2d' : '#e8962a',
    color: isCurrent ? 'rgba(255, 255, 255, 0.4)' : '#070c16',
  }),
  error: {
    fontFamily: 'Outfit, sans-serif',
    fontSize: 13,
    color: '#dc2626',
    textAlign: 'center',
    marginTop: 8,
  },
};

const UpgradeModal = React.memo(function UpgradeModal({ currentTier, onClose }) {
  const [interval, setInterval] = useState('month');
  const [loadingTier, setLoadingTier] = useState(null);
  const [error, setError] = useState(null);
  const isAnnual = interval === 'year';

  const handleSubscribe = useCallback(async (tierId) => {
    setLoadingTier(tierId);
    setError(null);

    try {
      const res = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Strive-Token': process.env.REACT_APP_STRIVE_TOKEN || '' },
        body: JSON.stringify({ tier: tierId, interval }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to start checkout');
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      setError(err.message);
      setLoadingTier(null);
    }
  }, [interval]);

  const handleOverlayClick = useCallback((e) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  return (
    <div
      style={styles.overlay}
      onClick={handleOverlayClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="Upgrade your plan"
    >
      <div style={styles.modal}>
        <div style={styles.header}>
          <h2 style={styles.title}>Upgrade Your Plan</h2>
          <button
            style={styles.closeButton}
            onClick={onClose}
            aria-label="Close upgrade modal"
          >
            &times;
          </button>
        </div>

        <div style={styles.toggle} role="radiogroup" aria-label="Billing interval">
          <button
            style={styles.toggleButton(!isAnnual)}
            onClick={() => setInterval('month')}
            role="radio"
            aria-checked={!isAnnual}
          >
            Monthly
          </button>
          <button
            style={styles.toggleButton(isAnnual)}
            onClick={() => setInterval('year')}
            role="radio"
            aria-checked={isAnnual}
          >
            Annual
            <span style={styles.saveBadge}>Save up to 17%</span>
          </button>
        </div>

        {TIERS.map((tier) => {
          const isCurrent = currentTier === tier.id;
          const price = isAnnual ? tier.yearlyPrice : tier.monthlyPrice;
          const savings = savingsPercent(tier.monthlyPrice, tier.yearlyPrice);
          const isLoading = loadingTier === tier.id;

          return (
            <div key={tier.id} style={styles.card(isCurrent, tier.popular)}>
              {tier.popular && <span style={styles.popularBadge}>Most Popular</span>}
              <h3 style={styles.tierName}>{tier.name}</h3>
              <p style={styles.price}>
                ${isAnnual ? price : price.toFixed(2)}
                <span style={styles.interval}>
                  /{isAnnual ? 'year' : 'mo'}
                </span>
              </p>
              {isAnnual && (
                <span style={{ ...styles.saveBadge, marginLeft: 0 }}>
                  Save {savings}%
                </span>
              )}
              <ul style={styles.featureList}>
                {tier.features.map((feature) => (
                  <li key={feature} style={styles.featureItem}>
                    {feature}
                  </li>
                ))}
              </ul>
              <button
                style={styles.subscribeButton(isCurrent, isLoading)}
                onClick={() => !isCurrent && !isLoading && handleSubscribe(tier.id)}
                disabled={isCurrent || isLoading}
                aria-label={isCurrent ? `Current plan: ${tier.name}` : `Subscribe to ${tier.name}`}
              >
                {isCurrent ? 'Current Plan' : isLoading ? 'Loading...' : 'Subscribe'}
              </button>
            </div>
          );
        })}

        {error && <p style={styles.error}>{error}</p>}
      </div>
    </div>
  );
});

export default UpgradeModal;
