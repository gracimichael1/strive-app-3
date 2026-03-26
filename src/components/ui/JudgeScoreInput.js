import React, { useState, useCallback } from 'react';

const COLORS = {
  surface: '#0d1422',
  surface2: '#121b2d',
  gold: '#e8962a',
  goldLight: '#ffc15a',
  green: '#22c55e',
  text: '#E2E8F0',
  textSecondary: '#8890AB',
  border: 'rgba(232, 150, 42, 0.12)',
};

const STRIVE_TOKEN = process.env.REACT_APP_STRIVE_TOKEN || '';

/**
 * JudgeScoreInput — optional "What did the judges give?" input.
 * Appears after analysis completes. Submits to /api/scores for training.
 */
function JudgeScoreInput({ result, profile }) {
  const [score, setScore] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    const parsed = parseFloat(score);
    if (isNaN(parsed) || parsed < 0 || parsed > 10.5) return;

    setSubmitting(true);
    try {
      await fetch('/api/scores', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Strive-Token': STRIVE_TOKEN,
        },
        body: JSON.stringify({
          videoId: result?._meta?.videoId || result?.summary?.videoId || 'unknown',
          event: result?.event || result?.summary?.apparatus || '',
          level: profile?.level || '',
          aiScore: result?.finalScore || 0,
          judgeScore: parsed,
          promptVersion: result?._meta?.prompt_version || null,
          calibrationFactor: result?._meta?.score_breakdown?.calibration?.factor || null,
          rawExecution: result?._meta?.score_breakdown?.execution_deductions || null,
          scaledExecution: result?._meta?.score_breakdown?.calibration?.scaled_execution || null,
          skillCount: result?.gradedSkills?.length || 0,
          analysis_metadata: result?.analysis_metadata || null,
        }),
      });
      setSubmitted(true);
    } catch {
      // Still show success — data logged client-side at minimum
      setSubmitted(true);
    }

    // Persist judgeScore to localStorage alongside recent analyses
    try {
      const recentRaw = localStorage.getItem('strive_recent_analyses');
      if (recentRaw) {
        const recent = JSON.parse(recentRaw);
        if (Array.isArray(recent) && recent.length > 0) {
          // Tag the most recent analysis with the judge score
          recent[0].judgeScore = parsed;
          localStorage.setItem('strive_recent_analyses', JSON.stringify(recent));
        }
      }
      // Also store in a dedicated key for calibration pipeline
      const scores = JSON.parse(localStorage.getItem('strive_judge_scores') || '[]');
      const aiScore = result?.finalScore || 0;
      scores.push({
        judgeScore: parsed,
        aiScore,
        delta: Math.round((parsed - aiScore) * 1000) / 1000,
        event: result?.event || '',
        level: profile?.level || '',
        videoId: result?._meta?.videoId || result?.summary?.videoId || 'unknown',
        timestamp: new Date().toISOString(),
      });
      localStorage.setItem('strive_judge_scores', JSON.stringify(scores));
    } catch (e) {
      console.warn('[JudgeScoreInput] localStorage save failed:', e);
    }

    setSubmitting(false);
  }, [score, result, profile]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') handleSubmit();
  }, [handleSubmit]);

  if (submitted) {
    return (
      <div
        style={{
          margin: '20px 20px 0',
          background: 'rgba(34, 197, 94, 0.06)',
          border: '1px solid rgba(34, 197, 94, 0.2)',
          borderRadius: 16,
          padding: '16px 20px',
          textAlign: 'center',
        }}
        role="status"
        aria-live="polite"
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: COLORS.green,
            fontFamily: "'Outfit', sans-serif",
          }}
        >
          Thanks — this helps STRIVE get more accurate.
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        margin: '20px 20px 0',
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 16,
        padding: '16px 20px',
      }}
      role="region"
      aria-label="Submit official judge score"
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: COLORS.text,
          marginBottom: 4,
          fontFamily: "'Outfit', sans-serif",
        }}
      >
        What did the judges give?
      </div>
      <div
        style={{
          fontSize: 12,
          color: COLORS.textSecondary,
          marginBottom: 12,
          fontFamily: "'Outfit', sans-serif",
        }}
      >
        Optional — helps us improve scoring accuracy
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="number"
          inputMode="decimal"
          step="0.025"
          min="0"
          max="10.5"
          placeholder="e.g. 8.850"
          value={score}
          onChange={(e) => setScore(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label="Official judge score"
          style={{
            flex: 1,
            background: COLORS.surface2,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 10,
            padding: '12px 14px',
            fontSize: 16,
            fontFamily: "'Space Mono', monospace",
            color: COLORS.goldLight,
            outline: 'none',
            minHeight: 44,
          }}
        />
        <button
          onClick={handleSubmit}
          disabled={submitting || !score || isNaN(parseFloat(score))}
          style={{
            background: score && !isNaN(parseFloat(score))
              ? `linear-gradient(135deg, ${COLORS.gold}, ${COLORS.goldLight})`
              : COLORS.surface2,
            color: score && !isNaN(parseFloat(score)) ? '#000' : COLORS.textSecondary,
            border: 'none',
            borderRadius: 10,
            padding: '12px 20px',
            fontSize: 14,
            fontWeight: 700,
            fontFamily: "'Outfit', sans-serif",
            cursor: score ? 'pointer' : 'default',
            minHeight: 44,
            opacity: submitting ? 0.6 : 1,
          }}
        >
          {submitting ? '...' : 'Submit'}
        </button>
      </div>
    </div>
  );
}

export default React.memo(JudgeScoreInput);
