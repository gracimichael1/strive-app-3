import React, { useState, useCallback } from 'react';

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
    margin: '0 0 24px 0',
    lineHeight: 1.5,
  },
  sectionTitle: {
    fontFamily: 'Outfit, sans-serif',
    fontSize: 15,
    fontWeight: 600,
    color: '#e8962a',
    margin: '20px 0 10px 0',
  },
  text: {
    fontFamily: 'Outfit, sans-serif',
    fontSize: 14,
    color: '#8890AB',
    lineHeight: 1.6,
    margin: '0 0 8px 0',
  },
  list: {
    margin: '0 0 16px 0',
    paddingLeft: 20,
  },
  listItem: {
    fontFamily: 'Outfit, sans-serif',
    fontSize: 14,
    color: '#8890AB',
    lineHeight: 1.6,
    marginBottom: 4,
  },
  divider: {
    border: 'none',
    borderTop: '1px solid rgba(232, 150, 42, 0.12)',
    margin: '20px 0',
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontFamily: 'Outfit, sans-serif',
    fontSize: 13,
    fontWeight: 600,
    color: '#8A90AA',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: 8,
    display: 'block',
  },
  input: {
    fontFamily: 'Outfit, sans-serif',
    fontSize: 16,
    color: '#E2E8F0',
    background: '#121b2d',
    border: '1px solid rgba(232, 150, 42, 0.12)',
    borderRadius: 10,
    padding: '12px 14px',
    width: '100%',
    minHeight: 44,
    outline: 'none',
    boxSizing: 'border-box',
  },
  checkboxRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
    cursor: 'pointer',
  },
  checkbox: {
    width: 22,
    height: 22,
    minWidth: 22,
    minHeight: 22,
    borderRadius: 6,
    border: '2px solid rgba(232, 150, 42, 0.3)',
    background: '#121b2d',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    cursor: 'pointer',
    flexShrink: 0,
  },
  checkboxChecked: {
    background: '#e8962a',
    borderColor: '#e8962a',
  },
  checkmark: {
    color: '#070c16',
    fontSize: 14,
    fontWeight: 700,
    lineHeight: 1,
  },
  checkboxLabel: {
    fontFamily: 'Outfit, sans-serif',
    fontSize: 14,
    color: '#E2E8F0',
    lineHeight: 1.5,
    cursor: 'pointer',
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
    marginTop: 8,
    transition: 'opacity 0.2s',
  },
  buttonDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  declineButton: {
    fontFamily: 'Outfit, sans-serif',
    fontSize: 14,
    fontWeight: 500,
    color: '#8890AB',
    background: 'none',
    border: '1px solid rgba(232, 150, 42, 0.12)',
    borderRadius: 12,
    padding: '12px 24px',
    width: '100%',
    minHeight: 44,
    cursor: 'pointer',
    marginTop: 12,
    textAlign: 'center',
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
    marginTop: 8,
    width: '100%',
    textAlign: 'center',
  },
  declinedCard: {
    width: '100%',
    maxWidth: 540,
    background: '#0d1422',
    borderRadius: 16,
    border: '1px solid rgba(232, 150, 42, 0.12)',
    padding: '40px 24px',
    textAlign: 'center',
  },
  declinedTitle: {
    fontFamily: 'Outfit, sans-serif',
    fontSize: 20,
    fontWeight: 700,
    color: '#E2E8F0',
    margin: '0 0 12px 0',
  },
  declinedText: {
    fontFamily: 'Outfit, sans-serif',
    fontSize: 14,
    color: '#8890AB',
    lineHeight: 1.6,
    margin: '0 0 24px 0',
  },
};

const ParentalConsent = React.memo(function ParentalConsent({
  athleteName,
  accountEmail,
  onConsent,
  onDecline,
  onBack,
}) {
  const [parentEmail, setParentEmail] = useState('');
  const [isGuardian, setIsGuardian] = useState(false);
  const [thirdPartyConsent, setThirdPartyConsent] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const displayName = athleteName || 'your child';

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail);
  const emailMatchesAccount = accountEmail && parentEmail.trim().toLowerCase() === accountEmail.trim().toLowerCase();
  const isFormValid = isEmailValid && !emailMatchesAccount && isGuardian && thirdPartyConsent;

  const handleSubmit = useCallback(async () => {
    if (!isFormValid) return;

    if (emailMatchesAccount) {
      setError('Parent email must be different from the account email.');
      return;
    }

    setError('');
    setSending(true);

    try {
      const res = await fetch('/api/consent/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentEmail: parentEmail.trim(),
          athleteNickname: displayName,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to send consent email');
      }

      setSent(true);
      // Set consent status to pending
      try { sessionStorage.setItem('strive-consent-status', 'pending'); } catch {}

      onConsent({
        parentEmail: parentEmail.trim(),
        consentTimestamp: new Date().toISOString(),
        status: 'pending',
      });
    } catch (e) {
      setError(e.message || 'Failed to send email. Please try again.');
    }
    setSending(false);
  }, [isFormValid, emailMatchesAccount, parentEmail, displayName, onConsent]);

  const handleDecline = useCallback(() => {
    setDeclined(true);
    if (onDecline) onDecline();
  }, [onDecline]);

  if (declined) {
    return (
      <div style={styles.container}>
        <div style={styles.declinedCard}>
          <h1 style={styles.declinedTitle}>Consent Required</h1>
          <p style={styles.declinedText}>
            Strive requires parental consent for athletes under 13 to comply with
            children's privacy laws. Without consent, we're unable to process video
            analysis for {displayName}.
          </p>
          {onBack && (
            <button
              style={{ ...styles.button, maxWidth: 240, margin: '0 auto' }}
              onClick={onBack}
              aria-label="Go back"
            >
              Go Back
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Parental Consent Required</h1>
        <p style={styles.subtitle}>
          A parent or guardian must approve {displayName}'s account before any data is collected.
        </p>

        <div style={{ background: '#121b2d', borderRadius: 12, padding: '16px 20px', marginBottom: 20, border: '1px solid rgba(232, 150, 42, 0.08)' }}>
          <p style={{ ...styles.text, color: '#E2E8F0', fontWeight: 600, marginBottom: 12 }}>
            Videos you submit are analyzed by Google Gemini (Google's AI service). STRIVE does not store your videos. Google deletes uploaded content within 48 hours. We collect: your child's gymnastics level, performance scores, and training notes.
          </p>
        </div>

        <h3 style={styles.sectionTitle}>What We Collect</h3>
        <ul style={styles.list}>
          <li style={styles.listItem}>Your child's gymnastics level and competitive division</li>
          <li style={styles.listItem}>Performance scores and analysis history</li>
          <li style={styles.listItem}>Training notes added by you or your child</li>
        </ul>

        <h3 style={styles.sectionTitle}>Third-Party Services</h3>
        <ul style={styles.list}>
          <li style={styles.listItem}><strong>Videos</strong> → Google Gemini for scoring analysis, deleted within 48 hours</li>
          <li style={styles.listItem}><strong>Scores</strong> → Supabase (SOC 2 Type 2 certified) for secure storage</li>
          <li style={styles.listItem}><strong>Payments</strong> → Stripe (PCI DSS Level 1) for billing</li>
        </ul>

        <h3 style={styles.sectionTitle}>Your Rights</h3>
        <ul style={styles.list}>
          <li style={styles.listItem}>Review all data collected about your child at any time</li>
          <li style={styles.listItem}>Delete all of your child's data permanently</li>
          <li style={styles.listItem}>Revoke consent at any time (Settings → Account)</li>
        </ul>

        <hr style={styles.divider} />

        {error && <p style={{ ...styles.text, color: '#dc2626' }} role="alert">{error}</p>}
        {emailMatchesAccount && parentEmail && (
          <p style={{ ...styles.text, color: '#dc2626' }} role="alert">
            Parent email must be different from the account email.
          </p>
        )}

        <div style={styles.inputGroup}>
          <label style={styles.label} htmlFor="parent-email">Parent / Guardian Email</label>
          <input
            id="parent-email"
            type="email"
            aria-label="Parent or guardian email address"
            placeholder="Email address"
            style={styles.input}
            value={parentEmail}
            onChange={(e) => setParentEmail(e.target.value)}
            autoComplete="email"
          />
          <p style={{ fontSize: 12, color: '#8890AB', marginTop: 6 }}>
            We'll send a confirmation link to this address. The parent must click it to activate the account.
          </p>
        </div>

        <hr style={styles.divider} />

        <div
          style={styles.checkboxRow}
          onClick={() => setIsGuardian((v) => !v)}
          role="checkbox"
          aria-checked={isGuardian}
          aria-label="I am the parent or legal guardian of this athlete"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setIsGuardian((v) => !v); } }}
        >
          <div style={{ ...styles.checkbox, ...(isGuardian ? styles.checkboxChecked : {}) }}>
            {isGuardian && <span style={styles.checkmark}>&#10003;</span>}
          </div>
          <span style={styles.checkboxLabel}>
            I am the parent or legal guardian of {displayName}
          </span>
        </div>

        <div
          style={styles.checkboxRow}
          onClick={() => setThirdPartyConsent((v) => !v)}
          role="checkbox"
          aria-checked={thirdPartyConsent}
          aria-label="I consent to videos being sent to an external analysis service for scoring"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setThirdPartyConsent((v) => !v); } }}
        >
          <div style={{ ...styles.checkbox, ...(thirdPartyConsent ? styles.checkboxChecked : {}) }}>
            {thirdPartyConsent && <span style={styles.checkmark}>&#10003;</span>}
          </div>
          <span style={styles.checkboxLabel}>
            I consent to {displayName}'s videos being sent to a third-party analysis
            service for the purpose of generating performance scores and feedback
          </span>
        </div>

        <button
          style={{
            ...styles.button,
            ...((isFormValid && !sending) ? {} : styles.buttonDisabled),
          }}
          onClick={handleSubmit}
          disabled={!isFormValid || sending}
          aria-label="Send consent email"
        >
          {sending ? 'Sending...' : 'Send Consent Email to Parent'}
        </button>

        <button
          style={styles.declineButton}
          onClick={handleDecline}
          aria-label="Decline consent"
        >
          I Do Not Consent
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

export default ParentalConsent;
