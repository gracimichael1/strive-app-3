/**
 * api/gemini.js — Server-side Gemini proxy.
 *
 * ALL Gemini API calls route through this endpoint.
 * The GEMINI_API_KEY never leaves the server.
 * Rate limited: 5 req/min and 20 req/hr per user (in-memory, Redis at Phase 3-A).
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

function validateAppToken(req, res) {
  if (!process.env.STRIVE_APP_TOKEN) {
    res.status(500).json({ error: 'Server misconfigured' });
    return false;
  }
  return req.headers['x-strive-token'] === process.env.STRIVE_APP_TOKEN;
}

// ── Rate Limiting ──────────────────────────────────────────────────────────
// WARNING: In-memory Map resets on every Vercel cold start (serverless = stateless).
// This provides minimal protection against rapid-fire abuse within a single
// function instance, but does NOT persist across deployments or cold starts.
// TODO Phase 3-A: Migrate to Vercel KV or Upstash Redis for durable rate limiting.
import crypto from 'crypto';

const rateLimitMap = new Map(); // In-memory only — resets on cold start
const RATE_LIMITS = [
  { window: 60 * 1000, max: 5, label: '1min' },    // 5 per minute
  { window: 60 * 60 * 1000, max: 20, label: '1hr' }, // 20 per hour
];

function getRateLimitKey(req) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  return crypto.createHash('sha256').update(ip).digest('hex').substring(0, 16);
}

function checkRateLimit(key) {
  const now = Date.now();
  let hits = rateLimitMap.get(key) || [];
  // Prune old entries (older than largest window)
  hits = hits.filter(t => now - t < 60 * 60 * 1000);
  rateLimitMap.set(key, hits);

  for (const rule of RATE_LIMITS) {
    const windowHits = hits.filter(t => now - t < rule.window);
    if (windowHits.length >= rule.max) {
      return { limited: true, retryAfter: Math.ceil(rule.window / 1000), window: rule.label };
    }
  }
  return { limited: false };
}

function recordHit(key) {
  const hits = rateLimitMap.get(key) || [];
  hits.push(Date.now());
  rateLimitMap.set(key, hits);
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!isAllowedOrigin(req.headers.origin)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (!validateAppToken(req, res)) {
    if (!res.headersSent) return res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limit on 'generate' action only (actual analysis calls)
  const { action } = req.body || {};
  if (action === 'generate') {
    const rlKey = getRateLimitKey(req);
    const rl = checkRateLimit(rlKey);
    if (rl.limited) {
      console.warn(`[gemini-proxy] Rate limited: ${rlKey} (${rl.window})`);
      return res.status(429).json({
        error: 'rate_limit',
        retryAfter: rl.retryAfter,
        message: `Maximum analyses per ${rl.window === '1min' ? 'minute' : 'hour'} reached. Please wait.`,
      });
    }
    recordHit(rlKey);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server' });
  }

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
    return res.status(500).json({ error: 'Analysis service error. Please try again.' });
  }
}

// ── initUpload: Start resumable upload, return the upload URL ──────────────
async function handleInitUpload(req, res, apiKey) {
  const { displayName, fileSize, mimeType } = req.body;

  const startRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${encodeURIComponent(apiKey)}`,
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
    `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${encodeURIComponent(apiKey)}`
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

  // Add thinking config as a TOP-LEVEL sibling (NOT nested inside generationConfig)
  if (thinkingConfig) {
    body.thinkingConfig = thinkingConfig;
  }

  // Add system instruction if provided
  if (systemPrompt) {
    body.systemInstruction = { parts: [{ text: systemPrompt }] };
  }

  // ── DEBUG: Log full payload for diagnostic verification ──
  console.log('[gemini-proxy] FULL PAYLOAD:', JSON.stringify({
    model: 'gemini-2.5-flash',
    hasSystemInstruction: !!body.systemInstruction,
    systemInstructionLength: body.systemInstruction?.parts?.[0]?.text?.length || 0,
    userPromptLength: body.contents?.[0]?.parts?.[1]?.text?.length || 0,
    generationConfig: body.generationConfig,
    thinkingConfig: body.thinkingConfig || 'NONE',
    hasFileData: !!body.contents?.[0]?.parts?.[0]?.file_data,
    fileUri: body.contents?.[0]?.parts?.[0]?.file_data?.file_uri || 'NONE',
  }, null, 2));

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;

  let genRes = await fetch(geminiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  // Graceful fallback: if thinkingConfig causes 400, retry without it
  if (!genRes.ok && body.thinkingConfig) {
    const errText = await genRes.text().catch(() => '');
    if (genRes.status === 400 && (errText.includes('thinkingConfig') || errText.includes('Unknown name'))) {
      console.warn('[gemini-proxy] thinkingConfig not supported, retrying without');
      const bodyWithout = { ...body };
      delete bodyWithout.thinkingConfig;
      genRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyWithout),
      });
      console.log('[gemini] thinkingConfig supported:', false);
    } else {
      throw new Error(`Gemini generate failed (${genRes.status}): ${errText.substring(0, 300)}`);
    }
  } else {
    console.log('[gemini] thinkingConfig supported:', !!body.thinkingConfig);
  }

  if (!genRes.ok) {
    const errText = await genRes.text().catch(() => '');
    throw new Error(`Gemini generate failed (${genRes.status}): ${errText.substring(0, 300)}`);
  }

  const data = await genRes.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  // Filter out "thought" parts (Gemini internal reasoning)
  const nonThought = parts.filter(p => p.text && !p.thought).map(p => p.text).join('\n');
  // Fallback: if filtered result is empty or doesn't look like JSON, try all parts
  let text = nonThought;
  if (!text || (!text.trim().startsWith('{') && !text.trim().startsWith('['))) {
    const allText = parts.map(p => p.text || '').join('\n');
    // Extract JSON from mixed thought+output: find first { to last }
    const firstBrace = allText.indexOf('{');
    const lastBrace = allText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      text = allText.slice(firstBrace, lastBrace + 1);
      console.log('[gemini] Extracted JSON from mixed thought+output:', text.length, 'chars');
    } else {
      text = allText;
    }
  }

  // ── Truncation detection logging ──
  const finishReason = data.candidates?.[0]?.finishReason;
  console.log(`[gemini] Response: ${text.length} chars | finishReason: ${finishReason}`);
  if (text.length > 0) {
    console.log(`[gemini] Last 80 chars: ...${text.slice(-80)}`);
    console.log(`[gemini] Ends with }: ${text.trimEnd().endsWith('}')}`);
  }
  if (finishReason === 'MAX_TOKENS') {
    console.error('[gemini] TRUNCATED — hit maxOutputTokens limit');
  }
  if (!text.trimEnd().endsWith('}') && !text.trimEnd().endsWith(']')) {
    console.warn('[gemini] Response may be truncated — does not end with } or ]');
  }

  return res.status(200).json({ text });
}

// ── deleteFile: Clean up uploaded file ────────────────────────────────────
async function handleDeleteFile(req, res, apiKey) {
  const { fileName } = req.body;
  if (!fileName) return res.status(400).json({ error: 'fileName required' });

  try {
    await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${encodeURIComponent(apiKey)}`,
      { method: 'DELETE' }
    );
  } catch {}

  return res.status(200).json({ ok: true });
}
