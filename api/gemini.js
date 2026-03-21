/**
 * api/gemini.js — Server-side Gemini proxy.
 *
 * ALL Gemini API calls route through this endpoint.
 * The GEMINI_API_KEY never leaves the server.
 *
 * Actions:
 *   initUpload  — Start resumable video upload, return upload URL
 *   pollFile    — Check if uploaded file is ACTIVE
 *   generate    — Call generateContent with video + prompt
 *   deleteFile  — Clean up uploaded file
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

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Strive-Token');
  res.setHeader('Vary', 'Origin');
}

function validateAppToken(req) {
  const token = req.headers['x-strive-token'];
  const expected = process.env.STRIVE_APP_TOKEN || 'strive-2026-launch';
  return token === expected;
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!isAllowedOrigin(req.headers.origin)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (!validateAppToken(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server' });
  }

  const { action } = req.body || {};

  try {
    switch (action) {
      case 'initUpload':
        return await handleInitUpload(req, res, apiKey);
      case 'pollFile':
        return await handlePollFile(req, res, apiKey);
      case 'generate':
        return await handleGenerate(req, res, apiKey);
      case 'deleteFile':
        return await handleDeleteFile(req, res, apiKey);
      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (e) {
    console.error(`[gemini-proxy] ${action} error:`, e.message);
    return res.status(500).json({ error: e.message });
  }
}

// ── initUpload: Start resumable upload, return the upload URL ──────────────
async function handleInitUpload(req, res, apiKey) {
  const { displayName, fileSize, mimeType } = req.body;

  const startRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(fileSize),
        'X-Goog-Upload-Header-Content-Type': mimeType || 'video/mp4',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file: { display_name: displayName || 'routine_' + Date.now() } }),
    }
  );

  if (!startRes.ok) {
    const errText = await startRes.text().catch(() => '');
    throw new Error(`Upload init failed (${startRes.status}): ${errText}`);
  }

  const uploadUrl = startRes.headers.get('X-Goog-Upload-URL') || startRes.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new Error('No upload URL returned from Gemini');

  return res.status(200).json({ uploadUrl });
}

// ── pollFile: Check file processing status ────────────────────────────────
async function handlePollFile(req, res, apiKey) {
  const { fileName } = req.body;
  if (!fileName) return res.status(400).json({ error: 'fileName required' });

  const check = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`
  );

  if (!check.ok) {
    return res.status(200).json({ state: 'UNKNOWN', error: `Poll failed (${check.status})` });
  }

  const data = await check.json();
  return res.status(200).json({
    state: data.state,
    fileUri: data.uri || null,
  });
}

// ── generate: Call Gemini generateContent with video + prompts ─────────────
async function handleGenerate(req, res, apiKey) {
  const { fileUri, mimeType, systemPrompt, userPrompt, config } = req.body;

  if (!fileUri || !userPrompt) {
    return res.status(400).json({ error: 'fileUri and userPrompt required' });
  }

  // Separate thinkingConfig from generationConfig (Gemini API expects them as siblings)
  const { thinkingConfig, ...generationConfig } = config || {};

  const body = {
    contents: [{
      parts: [
        { file_data: { file_uri: fileUri, mime_type: mimeType || 'video/mp4' } },
        { text: userPrompt },
      ],
    }],
    generationConfig,
  };

  // Add thinking config if provided (Gemini 2.5+ feature)
  if (thinkingConfig) {
    body.generationConfig.thinkingConfig = thinkingConfig;
  }

  // Add system instruction if provided
  if (systemPrompt) {
    body.systemInstruction = { parts: [{ text: systemPrompt }] };
  }

  const genRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  if (!genRes.ok) {
    const errText = await genRes.text().catch(() => '');
    throw new Error(`Gemini generate failed (${genRes.status}): ${errText.substring(0, 300)}`);
  }

  const data = await genRes.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  // Filter out "thought" parts (Gemini internal reasoning)
  const text = parts.filter(p => p.text && !p.thought).map(p => p.text).join('\n')
    || parts.map(p => p.text || '').join('\n');

  return res.status(200).json({ text });
}

// ── deleteFile: Clean up uploaded file ────────────────────────────────────
async function handleDeleteFile(req, res, apiKey) {
  const { fileName } = req.body;
  if (!fileName) return res.status(400).json({ error: 'fileName required' });

  try {
    await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`,
      { method: 'DELETE' }
    );
  } catch {}

  return res.status(200).json({ ok: true });
}
