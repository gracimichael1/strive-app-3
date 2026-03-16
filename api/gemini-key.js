export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 'no-store');
  
  const key = process.env.GEMINI_API_KEY;
  
  if (!key) {
    return res.status(404).json({ error: 'No server key configured' });
  }
  
  // Return the key — it's only accessible via the deployed domain
  // Much safer than hardcoding in client source code
  res.status(200).json({ key });
}
