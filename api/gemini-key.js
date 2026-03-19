const ALLOWED_ORIGINS = [
  'https://strive-app-amber.vercel.app',
  'http://localhost:3000',
];

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
}

export default function handler(req, res) {
  setCorsHeaders(req, res);
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const origin = req.headers.origin;
  if (!ALLOWED_ORIGINS.includes(origin)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const key = process.env.GEMINI_API_KEY;

  if (!key) {
    return res.status(404).json({ available: false });
  }

  // Return key only to allowed origins (CORS-restricted above)
  res.status(200).json({ available: true, key });
}
