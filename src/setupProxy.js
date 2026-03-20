/**
 * CRA development proxy — serves /api/* routes locally during `npm start`.
 * In production, Vercel serves these as serverless functions.
 *
 * This file is auto-detected by CRA's dev server (react-scripts).
 */

const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
  // If vercel dev is running on 3001, proxy to it
  // Otherwise, handle /api/gemini inline for local development
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  if (!GEMINI_API_KEY) {
    console.warn('[setupProxy] No GEMINI_API_KEY env var — proxying /api to production Vercel.');
    // Proxy to production when no local key
    app.use('/api', createProxyMiddleware({
      target: 'https://strive-app-3.vercel.app',
      changeOrigin: true,
      secure: true,
      logLevel: 'warn',
    }));
    return; // Skip local handler
  }

  app.post('/api/gemini', async (req, res) => {
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

          const reqBody = {
            contents: [{
              parts: [
                { file_data: { file_uri: fileUri, mime_type: mimeType || 'video/mp4' } },
                { text: userPrompt },
              ],
            }],
            generationConfig: config || {},
          };
          if (systemPrompt) {
            reqBody.systemInstruction = { parts: [{ text: systemPrompt }] };
          }

          const genRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reqBody) }
          );
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

  // Deprecate old endpoint
  app.get('/api/gemini-key', (req, res) => {
    res.status(410).json({ error: 'Retired. Use /api/gemini proxy.', available: false });
  });
};
