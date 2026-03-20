const ALLOWED_ORIGINS = [
  'https://strive-app-amber.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001',
];

function isAllowedOrigin(origin) {
  if (!origin) return true; // Same-origin requests don't send Origin header — allow them
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Allow all Vercel preview/deployment URLs for this project
  if (origin.match(/^https:\/\/strive-app.*\.vercel\.app$/)) return true;
  return false;
}

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Strive-Token');
  res.setHeader('Vary', 'Origin');
}

// Simple app token to prevent unauthorized access
function validateAppToken(req) {
  const token = req.headers['x-strive-token'];
  const expected = process.env.STRIVE_APP_TOKEN || 'strive-2026-launch';
  return token === expected;
}

export default function handler(req, res) {
  setCorsHeaders(req, res);
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const origin = req.headers.origin;
  if (!isAllowedOrigin(origin)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (!validateAppToken(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const key = process.env.GEMINI_API_KEY;

  if (!key) {
    return res.status(404).json({ available: false });
  }

  // Return key only to authenticated, allowed-origin requests
  res.status(200).json({ available: true, key });
}
