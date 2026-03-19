/**
 * api/analyze.js
 * Vercel serverless function.
 * Receives biomechanics + skill data from the client and returns
 * a structured AI judging report via Gemini 1.5 Pro.
 */

const ALLOWED_ORIGINS = [
  'https://strive-app-amber.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001',
];

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (origin.match(/^https:\/\/strive-app.*\.vercel\.app$/)) return true;
  return false;
}

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();

  const origin = req.headers.origin;
  if (!isAllowedOrigin(origin)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

  const { athleteProfile, skillAnalysis, event } = req.body || {};

  if (!skillAnalysis || skillAnalysis.length === 0) {
    return res.status(400).json({ error: 'No skill analysis data provided' });
  }

  const prompt = buildJudgingPrompt(athleteProfile, skillAnalysis, event);

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature:     0.2,
            maxOutputTokens: 2048,
            responseMimeType: 'application/json',
          },
        }),
      }
    );

    const data = await geminiRes.json();

    if (!geminiRes.ok) {
      console.error('Gemini error', data);
      return res.status(502).json({ error: 'Analysis service error', detail: data });
    }

    const raw  = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const clean = raw.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      return res.status(500).json({ error: 'Could not parse analysis response', raw });
    }

    return res.status(200).json(parsed);

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

function buildJudgingPrompt(profile, skillAnalysis, event) {
  const eventName = event || 'Gymnastics Routine';
  const level     = profile?.level || 'Unknown Level';
  const name      = profile?.name  || 'Athlete';

  const skillLines = skillAnalysis.map((s, i) =>
    `  Skill ${i + 1}: ${s.skillName} @ ${s.start?.toFixed(1)}s
     - Knee angle (peak): ${s.biomechanics?.peak?.kneeAngle ?? 'N/A'}°
     - Hip angle (peak):  ${s.biomechanics?.peak?.hipAngle  ?? 'N/A'}°
     - Worst knee in flight: ${s.biomechanics?.worstKneeAngle ?? 'N/A'}°
     - Detected faults: ${s.deductionHints?.map(d => `${d.fault} (~−${d.deduction})`).join(', ') || 'None'}`
  ).join('\n');

  return `You are an expert USA Gymnastics and FIG certified judge.

Athlete: ${name}
Event: ${eventName}
Level: ${level}

Biomechanics data from pose analysis:
${skillLines}

Respond with ONLY a JSON object in this exact format:
{
  "overallScore": <number 0-10>,
  "executionDeductionsTotal": <number>,
  "totalDeductions": <number>,
  "finalScore": <number 0-10>,
  "skills": [
    {
      "skillName": "<string>",
      "timestamp": "<string like 0:05>",
      "fault": "<primary fault>",
      "deduction": <number 0-1>,
      "severity": "<small|medium|large|veryLarge|fall>",
      "coachNote": "<1-2 sentence actionable correction>"
    }
  ],
  "topFixes": ["<fix 1>", "<fix 2>", "<fix 3>"],
  "strengths": ["<strength 1>"],
  "overallNote": "<2-3 sentence coach summary>",
  "trainingDrills": [
    { "name": "<drill name>", "purpose": "<what it fixes>", "reps": "<e.g. 3x10>" }
  ]
}

Be specific, accurate, and consistent with official USA Gymnastics code of points deduction scales. Only output the JSON object.`;
}
