const { kv } = require('@vercel/kv');

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

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Strive-Token');
  res.setHeader('Vary', 'Origin');
}

module.exports = async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const token = req.headers['x-strive-token'];
  const validToken = process.env.STRIVE_APP_TOKEN || 'strive-2026-launch';
  if (token !== validToken) return res.status(401).json({ error: 'Unauthorized' });

  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'Email required' });

  try {
    const record = await kv.get(`sub:${email}`);
    if (!record) {
      return res.json({ tier: 'free', status: 'none' });
    }
    const parsed = typeof record === 'string' ? JSON.parse(record) : record;
    return res.json({
      tier: parsed.tier || 'free',
      status: parsed.status || 'none',
      current_period_end: parsed.current_period_end || null
    });
  } catch (err) {
    console.error('STRIVE subscription lookup error:', err);
    return res.status(500).json({ tier: 'free', status: 'error' });
  }
};
