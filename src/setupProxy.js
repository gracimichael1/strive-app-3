/**
 * CRA development proxy — serves /api/* routes locally during `npm start`.
 * In production, Vercel serves these as serverless functions.
 *
 * This file is auto-detected by CRA's dev server (react-scripts).
 */

const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
  // Proxy Google upload URLs through local server to avoid CORS
  // This is needed in BOTH modes (local key and production proxy)
  app.use('/goog-upload', createProxyMiddleware({
    target: 'https://generativelanguage.googleapis.com',
    changeOrigin: true,
    pathRewrite: { '^/goog-upload': '' },
    logLevel: 'warn',
  }));

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  console.log('[setupProxy] GEMINI_API_KEY present:', !!GEMINI_API_KEY, GEMINI_API_KEY ? `(${GEMINI_API_KEY.substring(0, 8)}...)` : '');

  if (!GEMINI_API_KEY) {
    console.warn('[setupProxy] No GEMINI_API_KEY env var — proxying /api to production Vercel.');
    // Proxy to production when no local key
    app.use('/api', createProxyMiddleware({
      target: 'https://strive-app-amber.vercel.app',
      changeOrigin: true,
      secure: true,
      logLevel: 'warn',
    }));
    return; // Skip local handler
  }

  app.post('/api/gemini', async (req, res) => {
    console.log('[setupProxy] GEMINI ROUTE HIT, key present:', !!GEMINI_API_KEY);
    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server' });
    }

    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const parsed = JSON.parse(body);
        const { action } = parsed;

        if (action === 'initUpload') {
          const { displayName, fileSize, mimeType } = parsed;
          const startRes = await fetch(
            `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_API_KEY}`,
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
            return res.status(502).json({ error: `Upload init failed (${startRes.status}): ${errText}` });
          }
          const uploadUrl = startRes.headers.get('X-Goog-Upload-URL') || startRes.headers.get('x-goog-upload-url');
          if (!uploadUrl) return res.status(502).json({ error: 'No upload URL returned' });
          return res.json({ uploadUrl });

        } else if (action === 'pollFile') {
          const { fileName } = parsed;
          if (!fileName) return res.status(400).json({ error: 'fileName required' });
          const check = await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${GEMINI_API_KEY}`);
          if (!check.ok) return res.json({ state: 'UNKNOWN' });
          const data = await check.json();
          return res.json({ state: data.state, fileUri: data.uri || null });

        } else if (action === 'generate') {
          const { fileUri, mimeType, systemPrompt, userPrompt, config } = parsed;
          if (!fileUri || !userPrompt) return res.status(400).json({ error: 'fileUri and userPrompt required' });

          // Separate thinkingConfig from generationConfig (same as api/gemini.js)
          const { thinkingConfig: tc, ...genConfig } = config || {};
          const reqBody = {
            contents: [{
              parts: [
                { file_data: { file_uri: fileUri, mime_type: mimeType || 'video/mp4' } },
                { text: userPrompt },
              ],
            }],
            generationConfig: genConfig,
          };
          if (tc) reqBody.thinkingConfig = tc;
          if (systemPrompt) {
            reqBody.systemInstruction = { parts: [{ text: systemPrompt }] };
          }

          const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
          let genRes = await fetch(geminiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reqBody) });

          // Graceful fallback: if thinkingConfig causes 400, retry without
          if (!genRes.ok && reqBody.thinkingConfig) {
            const errText = await genRes.text().catch(() => '');
            if (genRes.status === 400 && (errText.includes('thinkingConfig') || errText.includes('Unknown name'))) {
              console.warn('[setupProxy] thinkingConfig not supported, retrying without');
              delete reqBody.thinkingConfig;
              genRes = await fetch(geminiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reqBody) });
            } else {
              return res.status(502).json({ error: `Gemini failed (${genRes.status}): ${errText.substring(0, 300)}` });
            }
          }

          if (!genRes.ok) {
            const errText = await genRes.text().catch(() => '');
            return res.status(502).json({ error: `Gemini failed (${genRes.status}): ${errText.substring(0, 300)}` });
          }
          const data = await genRes.json();
          const parts = data.candidates?.[0]?.content?.parts || [];
          const text = parts.filter(p => p.text && !p.thought).map(p => p.text).join('\n')
            || parts.map(p => p.text || '').join('\n');
          return res.json({ text });

        } else if (action === 'deleteFile') {
          const { fileName } = parsed;
          if (fileName) {
            try { await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${GEMINI_API_KEY}`, { method: 'DELETE' }); } catch {}
          }
          return res.json({ ok: true });

        } else {
          return res.status(400).json({ error: `Unknown action: ${action}` });
        }
      } catch (e) {
        console.error('[setupProxy] /api/gemini error:', e.message);
        return res.status(500).json({ error: e.message });
      }
    });
  });

  // ── Training data collection endpoint ──────────────────────────────────
  const fs = require('fs');
  const logPath = require('path');
  const LOG_DIR = logPath.join(process.cwd(), 'logs');
  const LOG_FILE = logPath.join(LOG_DIR, 'training-data.jsonl');

  app.post('/api/scores', (req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const record = {
          videoId: data.videoId || 'unknown',
          event: data.event || '',
          level: data.level || '',
          aiScore: data.aiScore ?? null,
          judgeScore: data.judgeScore ?? null,
          videoQualityRating: data.videoQualityRating ?? null,
          timestamp: new Date().toISOString(),
          promptVersion: data.promptVersion || null,
          calibrationFactor: data.calibrationFactor || null,
          rawExecution: data.rawExecution || null,
          scaledExecution: data.scaledExecution || null,
          skillCount: data.skillCount || null,
        };
        if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
        fs.appendFileSync(LOG_FILE, JSON.stringify(record) + '\n', 'utf-8');
        console.log(`[scores] Recorded: ${record.event} | AI: ${record.aiScore} | Judge: ${record.judgeScore}`);
        res.json({ ok: true, record });
      } catch (e) {
        res.status(400).json({ error: e.message });
      }
    });
  });

  app.get('/api/scores', (req, res) => {
    try {
      if (!fs.existsSync(LOG_FILE)) return res.json({ records: [], count: 0 });
      const raw = fs.readFileSync(LOG_FILE, 'utf-8');
      const records = raw.split('\n').filter(l => l.trim()).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      res.json({ records, count: records.length });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── COPPA consent endpoints ──────────────────────────────────────────
  const crypto = require('crypto');
  const CONSENT_LOG = logPath.join(LOG_DIR, 'coppa-consent.jsonl');
  const RESEND_KEY = process.env.RESEND_API_KEY;

  function sha256(str) { return crypto.createHash('sha256').update(str).digest('hex'); }
  function getConsentSecret() { return process.env.STRIVE_CONSENT_SECRET || sha256(RESEND_KEY || 'strive-fallback-secret'); }

  app.post('/api/consent/send', async (req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', async () => {
      try {
        const { parentEmail, athleteNickname } = JSON.parse(body);
        if (!parentEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail)) {
          return res.status(400).json({ error: 'Valid parentEmail required' });
        }
        if (!RESEND_KEY) return res.status(500).json({ error: 'RESEND_API_KEY not configured' });

        // Generate HMAC-signed token
        const payload = JSON.stringify({ email_hash: sha256(parentEmail.toLowerCase().trim()), exp: Date.now() + 48*60*60*1000, v: '1.0', nonce: crypto.randomUUID() });
        const payloadB64 = Buffer.from(payload).toString('base64url');
        const sig = crypto.createHmac('sha256', getConsentSecret()).update(payloadB64).digest('base64url');
        const token = `${payloadB64}.${sig}`;
        const confirmUrl = `http://localhost:3000/api/consent/confirm?token=${encodeURIComponent(token)}`;
        const displayName = athleteNickname || 'your child';

        // Log pending consent
        if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
        fs.appendFileSync(CONSENT_LOG, JSON.stringify({ timestamp: new Date().toISOString(), parent_email_hash: sha256(parentEmail.toLowerCase().trim()), token_hash: sha256(token), consent_version: '1.0', status: 'pending', ip_hash: sha256(req.ip || 'unknown') }) + '\n');

        // Send via Resend
        const sendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'STRIVE Gymnastics <onboarding@resend.dev>',
            to: [parentEmail.trim()],
            subject: "Action required: Approve your child's STRIVE account",
            html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#333"><h1 style="color:#e8962a">STRIVE Gymnastics</h1><h2>Parental Consent Required</h2><p>Someone created a STRIVE account for ${displayName} and listed you as parent/guardian.</p><h3 style="color:#e8962a">What we collect</h3><ul><li>Gymnastics level and division</li><li>Performance scores and analysis history</li><li>Training notes</li></ul><h3 style="color:#e8962a">Third-party services</h3><ul><li><b>Videos → Google Gemini</b> — deleted within 48hrs</li><li><b>Scores → Supabase</b> (SOC 2 Type 2)</li><li><b>Payments → Stripe</b> (PCI DSS Level 1)</li></ul><h3 style="color:#e8962a">Your rights</h3><ul><li>Review all data about your child</li><li>Delete all data permanently</li><li>Revoke consent anytime (Settings → Account)</li></ul><p>Reply to this email or visit /account to exercise these rights.</p><div style="text-align:center;margin:32px 0"><a href="${confirmUrl}" style="display:inline-block;background:#e8962a;color:#fff;text-decoration:none;padding:16px 40px;border-radius:12px;font-size:16px;font-weight:700">I Approve — Activate Account</a></div><p style="color:#888;font-size:13px">Link expires in 48 hours. If you did not request this, ignore this email.</p></div>`,
          }),
        });
        if (!sendRes.ok) { const e = await sendRes.text(); return res.status(502).json({ error: 'Resend failed: ' + e }); }
        const sendData = await sendRes.json();
        res.json({ ok: true, emailId: sendData.id });
      } catch (e) { res.status(500).json({ error: e.message }); }
    });
  });

  app.get('/api/consent/confirm', (req, res) => {
    const { token } = req.query;
    if (!token || !token.includes('.')) return res.status(400).send('Invalid token');
    const [payloadB64, sig] = token.split('.');
    const expectedSig = crypto.createHmac('sha256', getConsentSecret()).update(payloadB64).digest('base64url');
    if (sig !== expectedSig) return res.status(400).send('Invalid token signature');
    try {
      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
      if (!payload.exp || Date.now() > payload.exp) return res.status(400).send('Token expired');
      // Log confirmed
      if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
      fs.appendFileSync(CONSENT_LOG, JSON.stringify({ timestamp: new Date().toISOString(), parent_email_hash: payload.email_hash, token_hash: sha256(token), consent_version: payload.v || '1.0', status: 'confirmed', confirmed_at: new Date().toISOString(), ip_hash: sha256(req.ip || 'unknown') }) + '\n');
      res.redirect('/?consent=confirmed');
    } catch { res.status(400).send('Invalid token'); }
  });

  // Deprecate old endpoint
  app.get('/api/gemini-key', (req, res) => {
    res.status(410).json({ error: 'Retired. Use /api/gemini proxy.', available: false });
  });
};
