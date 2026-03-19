import React, { useState, useCallback, useMemo } from 'react';

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
    fontSize: 24,
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
    margin: '0 0 32px 0',
    lineHeight: 1.5,
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
  selectRow: {
    display: 'flex',
    gap: 12,
    marginBottom: 24,
  },
  selectWrapper: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  select: {
    fontFamily: 'Space Mono, monospace',
    fontSize: 16,
    color: '#E2E8F0',
    background: '#121b2d',
    border: '1px solid rgba(232, 150, 42, 0.12)',
    borderRadius: 10,
    padding: '12px 14px',
    minHeight: 44,
    outline: 'none',
    cursor: 'pointer',
    appearance: 'none',
    WebkitAppearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%238890AB' stroke-width='2' fill='none'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 14px center',
    paddingRight: 36,
  },
  selectFocused: {
    borderColor: '#e8962a',
    boxShadow: '0 0 0 2px rgba(232, 150, 42, 0.2)',
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
  error: {
    fontFamily: 'Outfit, sans-serif',
    fontSize: 13,
    color: '#dc2626',
    textAlign: 'center',
    margin: '0 0 16px 0',
  },
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 80 }, (_, i) => currentYear - i);

function getDaysInMonth(month, year) {
  if (!month || !year) return 31;
  return new Date(year, month, 0).getDate();
}

const AgeGate = React.memo(function AgeGate({ onComplete, onBack }) {
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [year, setYear] = useState('');
  const [error, setError] = useState('');

  const daysInMonth = useMemo(
    () => getDaysInMonth(Number(month), Number(year)),
    [month, year]
  );

  const days = useMemo(
    () => Array.from({ length: daysInMonth }, (_, i) => i + 1),
    [daysInMonth]
  );

  const isComplete = month && day && year;

  const handleContinue = useCallback(() => {
    if (!isComplete) return;

    const dob = new Date(Number(year), Number(month) - 1, Number(day));
    const now = new Date();

    // Validate date
    if (dob > now) {
      setError('Please enter a valid date of birth.');
      return;
    }

    // Calculate age
    let age = now.getFullYear() - dob.getFullYear();
    const monthDiff = now.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
      age--;
    }

    if (age < 0 || age > 100) {
      setError('Please enter a valid date of birth.');
      return;
    }

    setError('');

    const dateOfBirth = `${Number(year)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    onComplete({
      dateOfBirth,
      requiresParentalConsent: age < 13,
      isMinor: age < 18,
      age,
    });
  }, [month, day, year, isComplete, onComplete]);

  // Reset day if it exceeds days in selected month
  React.useEffect(() => {
    if (day && Number(day) > daysInMonth) {
      setDay('');
    }
  }, [daysInMonth, day]);

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>When is the athlete's birthday?</h1>
        <p style={styles.subtitle}>
          We need this to personalize the experience and ensure compliance with privacy regulations.
        </p>

        {error && <p style={styles.error} role="alert">{error}</p>}

        <div style={styles.selectRow}>
          <div style={styles.selectWrapper}>
            <label style={styles.label} htmlFor="age-gate-month">Month</label>
            <select
              id="age-gate-month"
              aria-label="Birth month"
              style={styles.select}
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            >
              <option value="" disabled>Month</option>
              {MONTHS.map((name, i) => (
                <option key={name} value={i + 1}>{name}</option>
              ))}
            </select>
          </div>

          <div style={{ ...styles.selectWrapper, flex: 0.6 }}>
            <label style={styles.label} htmlFor="age-gate-day">Day</label>
            <select
              id="age-gate-day"
              aria-label="Birth day"
              style={styles.select}
              value={day}
              onChange={(e) => setDay(e.target.value)}
            >
              <option value="" disabled>Day</option>
              {days.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <div style={{ ...styles.selectWrapper, flex: 0.8 }}>
            <label style={styles.label} htmlFor="age-gate-year">Year</label>
            <select
              id="age-gate-year"
              aria-label="Birth year"
              style={styles.select}
              value={year}
              onChange={(e) => setYear(e.target.value)}
            >
              <option value="" disabled>Year</option>
              {YEARS.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        <button
          style={{
            ...styles.button,
            ...(isComplete ? {} : styles.buttonDisabled),
          }}
          onClick={handleContinue}
          disabled={!isComplete}
          aria-label="Continue"
        >
          Continue
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

export default AgeGate;
