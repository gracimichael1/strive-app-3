import React from 'react';

const styles = {
  container: {
    minHeight: '100vh',
    background: '#070c16',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 16px',
    fontFamily: 'Outfit, sans-serif',
  },
  card: {
    width: '100%',
    maxWidth: 540,
    background: '#0d1422',
    borderRadius: 16,
    border: '1px solid rgba(232, 150, 42, 0.12)',
    padding: '32px 24px',
  },
  title: {
    fontFamily: 'Outfit, sans-serif',
    fontSize: 22,
    fontWeight: 700,
    color: '#E2E8F0',
    textAlign: 'center',
    margin: '0 0 8px 0',
  },
  subtitle: {
    fontFamily: 'Outfit, sans-serif',
    fontSize: 14,
    color: '#8890AB',
    textAlign: 'center',
    margin: '0 0 28px 0',
    lineHeight: 1.5,
  },
  section: {
    marginBottom: 24,
  },
  sectionIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  sectionTitle: {
    fontFamily: 'Outfit, sans-serif',
    fontSize: 15,
    fontWeight: 600,
    color: '#e8962a',
    margin: '0 0 8px 0',
    display: 'flex',
    alignItems: 'center',
  },
  text: {
    fontFamily: 'Outfit, sans-serif',
    fontSize: 14,
    color: '#8890AB',
    lineHeight: 1.6,
    margin: 0,
  },
  list: {
    margin: '6px 0 0 0',
    paddingLeft: 20,
  },
  listItem: {
    fontFamily: 'Outfit, sans-serif',
    fontSize: 14,
    color: '#8890AB',
    lineHeight: 1.6,
    marginBottom: 2,
  },
  divider: {
    border: 'none',
    borderTop: '1px solid rgba(232, 150, 42, 0.12)',
    margin: '4px 0 24px 0',
  },
  links: {
    display: 'flex',
    justifyContent: 'center',
    gap: 24,
    marginBottom: 24,
  },
  link: {
    fontFamily: 'Outfit, sans-serif',
    fontSize: 13,
    fontWeight: 500,
    color: '#e8962a',
    textDecoration: 'underline',
    textUnderlineOffset: 3,
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    padding: 0,
    minHeight: 44,
    display: 'flex',
    alignItems: 'center',
  },
  button: {
    fontFamily: 'Outfit, sans-serif',
    fontSize: 16,
    fontWeight: 600,
    color: '#070c16',
    background: 'linear-gradient(135deg, #e8962a, #ffc15a)',
    border: 'none',
    borderRadius: 12,
    padding: '14px 24px',
    width: '100%',
    minHeight: 48,
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  },
  backButton: {
    fontFamily: 'Outfit, sans-serif',
    fontSize: 14,
    fontWeight: 500,
    color: '#8890AB',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '12px 24px',
    minHeight: 44,
    marginTop: 12,
    width: '100%',
    textAlign: 'center',
  },
};

const PrivacyNotice = React.memo(function PrivacyNotice({ onAcknowledge, onBack }) {
  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Your Privacy Matters</h1>
        <p style={styles.subtitle}>
          Here's a quick summary of how Strive handles your data.
        </p>

        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>What We Collect</h3>
          <ul style={styles.list}>
            <li style={styles.listItem}>Athlete profile info (name, level, events)</li>
            <li style={styles.listItem}>Gymnastics videos you upload</li>
            <li style={styles.listItem}>Performance scores and analysis results</li>
          </ul>
        </div>

        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>How We Use It</h3>
          <ul style={styles.list}>
            <li style={styles.listItem}>Generate skill-by-skill scoring analysis</li>
            <li style={styles.listItem}>Track your progress over time</li>
            <li style={styles.listItem}>Recommend training drills and exercises</li>
          </ul>
        </div>

        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Who Sees It</h3>
          <p style={styles.text}>
            Only you — and anyone you choose to share it with. We never sell your
            data or share it with advertisers.
          </p>
        </div>

        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Your Rights</h3>
          <ul style={styles.list}>
            <li style={styles.listItem}>Delete your data at any time</li>
            <li style={styles.listItem}>Export your analysis history</li>
            <li style={styles.listItem}>Opt out of any data collection</li>
          </ul>
        </div>

        <hr style={styles.divider} />

        <div style={styles.links}>
          <a
            style={styles.link}
            href="/legal/privacy-policy.html"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Read full Privacy Policy"
          >
            Privacy Policy
          </a>
          <a
            style={styles.link}
            href="/legal/terms-of-service.html"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Read Terms of Service"
          >
            Terms of Service
          </a>
        </div>

        <button
          style={styles.button}
          onClick={onAcknowledge}
          aria-label="I understand, continue"
        >
          I Understand
        </button>

        {onBack && (
          <button
            style={styles.backButton}
            onClick={onBack}
            aria-label="Go back"
          >
            Back
          </button>
        )}
      </div>
    </div>
  );
});

export default PrivacyNotice;
