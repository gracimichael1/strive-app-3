/**
 * api/mastermind.js — Claude API for Mastermind mental + nutrition panels.
 * Uses Claude Sonnet 4 via raw fetch (same pattern as api/coach.js).
 * ANTHROPIC_API_KEY must be set in Vercel env vars.
 */

const ALLOWED_ORIGINS = [
  'https://strive-app-amber.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001',
];

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (origin.match(/^https:\/\/strive-app.*\.vercel\.app$/)) return true;
  return false;
}

module.exports = async function handler(req, res) {
  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Strive-Token');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Token validation — soft check (client does not yet send token for mastermind)
  if (process.env.STRIVE_APP_TOKEN && req.headers['x-strive-token']) {
    if (req.headers['x-strive-token'] !== process.env.STRIVE_APP_TOKEN) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // No API key configured — return graceful fallbacks instead of 503
    if (type === 'mental') {
      const name = athleteProfile?.name || 'She';
      return res.status(200).json({ morningAffirmation: `${name} is putting in the work — trust the process.`, focusWord: 'STRONG', preMeetNote: null, postSlumpNote: null });
    }
    if (type === 'nutrition') {
      return res.status(200).json({ dailyTip: 'Start training days with a balanced meal 2 hours before practice.', weeklyFocus: 'Consistent hydration throughout every practice.', preMeetProtocol: null, disclaimer: 'General guidance for active young athletes. Consult a registered dietitian for personalized advice.' });
    }
    return res.status(200).json({ error: 'Mastermind not configured' });
  }

  const { type, athleteProfile, recentScores, upcomingMeet, topFaults, event, level } = req.body || {};

  // Input validation
  const VALID_TYPES = ['mental', 'nutrition'];
  if (!type || !VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: `Invalid type — must be one of: ${VALID_TYPES.join(', ')}` });
  }

  // Sanitize athlete name — trim, limit 50 chars, strip non-alphanumeric (allow spaces/hyphens/apostrophes)
  if (athleteProfile?.name) {
    athleteProfile.name = (athleteProfile.name || '').trim().slice(0, 50).replace(/[^a-zA-Z0-9 \-']/g, '');
  }

  try {
    if (type === 'mental') {
      const { name, age, goal, topStrength } = athleteProfile || {};
      const scoreTrend = recentScores?.length >= 2
        ? recentScores[recentScores.length - 1] - recentScores[0] : 0;
      const trendLabel = scoreTrend > 0.1 ? 'improving' : scoreTrend < -0.1 ? 'declining' : 'steady';
      const daysUntilMeet = upcomingMeet
        ? Math.ceil((new Date(upcomingMeet) - new Date()) / 86400000) : null;
      const isSlump = recentScores?.length >= 2 &&
        recentScores.slice(-2).every((s, i, a) => i === 0 || s < a[i - 1] - 0.3);

      const userPrompt = [
        `Gymnast: ${name || 'this athlete'}, age ${age || 'unknown'}, ${level || 'level unknown'}, primary event: ${event || 'not specified'}.`,
        `Goal: ${goal || 'not set'}.`,
        `Score trend: ${trendLabel} (last ${recentScores?.length ?? 0} analyses).`,
        topStrength ? `Top strength this month: ${topStrength}.` : '',
        topFaults?.length > 0 ? `Top recurring faults: ${topFaults.join(', ')}. Reference these in your affirmation — acknowledge the work being done on them.` : '',
        daysUntilMeet ? `Meet in ${daysUntilMeet} days.` : 'No upcoming meet logged.',
        isSlump ? 'NOTE: Scores have dropped 0.3+ two sessions in a row.' : '',
        '', 'Generate:', '1. morningAffirmation (2 sentences max — reference something specific above)',
        '2. focusWord (1 word — from a real strength)',
        '3. preMeetNote (1 sentence — only if meet within 7 days, else null)',
        '4. postSlumpNote (1 sentence — only if slump detected, else null)',
        '', 'Return ONLY valid JSON. No markdown fences.',
        '{ "morningAffirmation": string, "focusWord": string, "preMeetNote": string|null, "postSlumpNote": string|null }'
      ].filter(Boolean).join('\n');

      const raw = await callClaude(apiKey,
        'You are a youth sports psychology coach specializing in gymnastics. Generate specific, earned affirmations that reference the athlete\'s actual data — never generic quotes. Warm, confident tone. Under-12: extra gentle. Ages 15+: direct. Return only valid JSON.',
        userPrompt
      );

      let parsed;
      try { parsed = JSON.parse(raw); } catch {
        parsed = { morningAffirmation: `${name || 'She'} is putting in the work — trust the process.`, focusWord: 'STRONG', preMeetNote: null, postSlumpNote: null };
      }
      return res.status(200).json(parsed);
    }

    if (type === 'nutrition') {
      const { age, events, goal } = athleteProfile || {};
      const ageNum = parseInt(age) || 12;
      const daysUntilMeet = upcomingMeet
        ? Math.ceil((new Date(upcomingMeet) - new Date()) / 86400000) : null;

      const userPrompt = [
        `Youth gymnast, age ${ageNum}, ${level || 'level unknown'}.`,
        `Primary events: ${(events || []).join(', ') || event || 'not specified'}.`,
        `Goal: ${goal || 'not set'}.`,
        topFaults?.length > 0 ? `Top recurring faults: ${topFaults.join(', ')}. Tailor nutrition to the physical demands that cause these faults.` : '',
        daysUntilMeet ? `Meet in ${daysUntilMeet} days.` : 'No upcoming meet.',
        '',
        ageNum < 13 ? 'IMPORTANT: Athlete is under 13. NO calorie counts or portion sizes. Food quality and timing only.' : '',
        '', 'Generate:', '1. dailyTip (1 sentence)', '2. weeklyFocus (1 sentence)',
        '3. preMeetProtocol (object with dayBefore and dayOf — only if meet within 3 days, else null)',
        '',
        'NEVER mention: weight loss, cutting, body fat, caloric deficit, restriction, skinny, diet, body composition.',
        ageNum < 18 ? 'Append disclaimer: "General guidance for active young athletes. Consult a registered dietitian for personalized advice."' : '',
        '', 'Return ONLY valid JSON. No markdown fences.',
        '{ "dailyTip": string, "weeklyFocus": string, "preMeetProtocol": { "dayBefore": string, "dayOf": string }|null, "disclaimer": string|null }'
      ].filter(Boolean).join('\n');

      const raw = await callClaude(apiKey,
        'You are a sports nutrition specialist for youth gymnasts. Performance fueling only. Never mention weight loss, restriction, or body composition. Parent-friendly language. Return only valid JSON.',
        userPrompt
      );

      let parsed;
      try { parsed = JSON.parse(raw); } catch {
        parsed = { dailyTip: 'Start training days with a balanced meal 2 hours before practice.', weeklyFocus: 'Consistent hydration throughout every practice.', preMeetProtocol: null, disclaimer: ageNum < 18 ? 'General guidance for active young athletes. Consult a registered dietitian for personalized advice.' : null };
      }

      // Guardrail — hard-coded, no exceptions
      const banned = ['lose weight', 'cut ', 'body fat', 'caloric deficit', 'restrict', 'skinny', 'diet ', 'dieting', 'calories'];
      let output = JSON.stringify(parsed);
      banned.forEach(w => { output = output.replace(new RegExp(w, 'gi'), '[removed]'); });
      try { parsed = JSON.parse(output); } catch {}

      return res.status(200).json(parsed);
    }

    return res.status(400).json({ error: 'Invalid type — must be mental or nutrition' });
  } catch (e) {
    console.error('[mastermind]', type, e.message);
    // Return graceful fallbacks instead of 500 — mastermind is non-critical
    if (type === 'mental') {
      const name = athleteProfile?.name || 'She';
      return res.status(200).json({ morningAffirmation: `${name} is putting in the work — trust the process.`, focusWord: 'STRONG', preMeetNote: null, postSlumpNote: null });
    }
    if (type === 'nutrition') {
      return res.status(200).json({ dailyTip: 'Start training days with a balanced meal 2 hours before practice.', weeklyFocus: 'Consistent hydration throughout every practice.', preMeetProtocol: null, disclaimer: 'General guidance for active young athletes. Consult a registered dietitian for personalized advice.' });
    }
    return res.status(200).json({ error: e.message });
  }
};

async function callClaude(apiKey, system, userContent) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      system,
      messages: [{ role: 'user', content: userContent }],
    }),
  });
  if (!resp.ok) {
    const err = await resp.text().catch(() => '');
    throw new Error(`Claude API failed (${resp.status}): ${err.substring(0, 200)}`);
  }
  const data = await resp.json();
  return data.content?.[0]?.text ?? '{}';
}
