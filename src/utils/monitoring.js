/**
 * monitoring.js — Sentry error tracking + PostHog analytics.
 *
 * Initializes on import. No-ops silently if env vars are missing.
 * All user identification uses hashed IDs only — no PII.
 *
 * Env vars:
 *   REACT_APP_SENTRY_DSN    — Sentry project DSN
 *   REACT_APP_POSTHOG_KEY   — PostHog project API key
 */

import * as Sentry from '@sentry/react';

let posthogInstance = null;

// ── Sentry ──────────────────────────────────────────────────────────────────

const SENTRY_DSN = process.env.REACT_APP_SENTRY_DSN;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV || 'production',
    tracesSampleRate: 0.1,
    // Don't send PII
    beforeSend(event) {
      if (event.user) {
        delete event.user.email;
        delete event.user.username;
        delete event.user.ip_address;
      }
      return event;
    },
  });
  console.log('[monitoring] Sentry initialized');
} else if (process.env.NODE_ENV === 'development') {
  console.log('[monitoring] Sentry DSN not set — error tracking disabled');
}

// ── PostHog ─────────────────────────────────────────────────────────────────

const POSTHOG_KEY = process.env.REACT_APP_POSTHOG_KEY;

if (POSTHOG_KEY && typeof window !== 'undefined') {
  import('posthog-js').then(({ default: posthog }) => {
    posthog.init(POSTHOG_KEY, {
      api_host: 'https://us.i.posthog.com',
      autocapture: false, // Only track explicit events
      capture_pageview: false,
      persistence: 'sessionStorage', // No localStorage PII
      disable_session_recording: true,
      // Strip PII from all properties
      sanitize_properties: (props) => {
        delete props.$current_url;
        delete props.$referrer;
        return props;
      },
    });
    posthogInstance = posthog;
    console.log('[monitoring] PostHog initialized');
  }).catch(() => {});
} else if (process.env.NODE_ENV === 'development') {
  console.log('[monitoring] PostHog key not set — analytics disabled');
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Track an analytics event. No-ops if PostHog is not initialized.
 * NEVER include PII in properties — use hashed IDs only.
 */
export function trackEvent(eventName, properties = {}) {
  if (posthogInstance) {
    posthogInstance.capture(eventName, properties);
  }
}

/**
 * Identify a user by hashed ID. No PII.
 */
export function identifyUser(hashedId) {
  if (posthogInstance && hashedId) {
    posthogInstance.identify(hashedId);
  }
}

/**
 * Capture an error in Sentry. No-ops if Sentry is not initialized.
 */
export function captureError(error, context = {}) {
  if (SENTRY_DSN) {
    Sentry.captureException(error, { extra: context });
  }
  console.error('[monitoring]', error.message || error, context);
}

/**
 * Capture a Gemini API failure.
 */
export function captureGeminiError(error, action, details = {}) {
  captureError(error, { source: 'gemini_api', action, ...details });
  trackEvent('gemini_api_error', { action, error_type: error.message?.substring(0, 50) });
}

export { Sentry };
