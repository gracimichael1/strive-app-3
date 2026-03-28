/**
 * api/analyze.js
 * Vercel serverless function — BHPA judging engine.
 * Accepts base64-encoded video from the client.
 * Sends it to Gemini using @google/genai SDK with BHPA system instruction + responseSchema.
 * Returns structured JSON scorecard.
 */

import { GoogleGenAI } from "@google/genai";

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
  if (!process.env.STRIVE_APP_TOKEN) return false;
  return req.headers['x-strive-token'] === process.env.STRIVE_APP_TOKEN;
}

// ── Rate Limiting (same as gemini.js) ─────────────────────────
import crypto from 'crypto';

const rateLimitMap = new Map();
const RATE_LIMITS = [
  { window: 60 * 1000, max: 5, label: '1min' },
  { window: 60 * 60 * 1000, max: 20, label: '1hr' },
];

function getRateLimitKey(req) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  return crypto.createHash('sha256').update(ip).digest('hex').substring(0, 16);
}

function checkRateLimit(key) {
  const now = Date.now();
  let hits = rateLimitMap.get(key) || [];
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

const SYSTEM_INSTRUCTION = `Act as a Brevet-level USAG Lead Xcel Gold Judge and High-Performance Technical Coach. Your goal is to provide a Zero-Lenience score followed by a Physics-Based training roadmap. I. Operational Protocol: The Professional Audit 1. Double-Pass Scrub: - Pass 1 (The Skills): Analyze primary flight elements, handstands, and saltos. - Pass 2 (Connective Tissue): Scrub the 1.5s between skills (Kips, Squat-ons, Taps). 2. Frame-by-Frame Apex Scrub: Identify the Apex Frame of every flight element and Contact Frame of every landing. Document form breaks (TPM/KTM) even for a single frame. 3. Monitors: Activate Toe Point Monitor (TPM) and Knee Tension Monitor (KTM) for every frame. 4. Zero Lenience: If a toe isn't pointed or a knee isn't locked, it is a deduction (0.05-0.10). 5. Zero-Variance Audit: - 30-Degree Penalty: Cast failing required angle = automatic 0.30 deduction. - Compounder Rule: Form break during technical error = deduction doubled. - 1.5-Second Rhythm Clock: Pause over 1.5s = 0.10 rhythm break. - Early Pike Logic: Salto piking before apex = 0.20 deduction. - Heavy Bar Audit: Clunky foot contact = 0.10 deduction.`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    scorecard: {
      type: "object",
      properties: {
        startValue: { type: "number" },
        finalScore: { type: "number" },
        deductions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              timestamp: { type: "string" },
              skill: { type: "string" },
              deduction: { type: "number" },
              reason: { type: "string" },
            },
          },
        },
        missedTransitions: { type: "array", items: { type: "string" } },
      },
    },
    biomechanicalAudit: {
      type: "object",
      properties: {
        swingFlightRadius: { type: "string" },
        widthOfMass: { type: "string" },
        landingVector: { type: "string" },
      },
    },
    levelUpAnalysis: {
      type: "object",
      properties: {
        requirementShift: { type: "array", items: { type: "string" } },
        angleTax: { type: "string" },
        projectedScore: { type: "number" },
      },
    },
    trainingRoadmap: {
      type: "object",
      properties: {
        technicalAnchor: { type: "string" },
        drill: { type: "string" },
      },
    },
  },
};

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();

  const origin = req.headers.origin;
  if (!isAllowedOrigin(origin)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (!validateAppToken(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Rate limit
  const rlKey = getRateLimitKey(req);
  const rl = checkRateLimit(rlKey);
  if (rl.limited) {
    return res.status(429).json({ error: 'rate_limit', retryAfter: rl.retryAfter, message: `Maximum analyses per ${rl.window} reached.` });
  }
  recordHit(rlKey);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

  const { videoBase64, mimeType, level } = req.body || {};

  // Size validation — 50MB max
  if (videoBase64 && videoBase64.length > 50 * 1024 * 1024) {
    return res.status(413).json({ error: 'Video payload too large. Maximum 50MB.' });
  }

  if (!videoBase64) {
    return res.status(400).json({ error: 'No video data provided' });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-04-17",
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0,
        thinkingConfig: { thinkingBudget: 8000 },
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: mimeType || "video/mp4",
                data: videoBase64,
              },
            },
            {
              text: `Analyze this ${level || "Xcel Gold"} gymnastics routine. Apply the BHPA judging system. Return the full scorecard JSON.`,
            },
          ],
        },
      ],
    });

    const text = result.text;
    const clean = text.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      return res.status(500).json({ error: 'Could not parse analysis response' });
    }

    return res.status(200).json(parsed);

  } catch (e) {
    console.error('analyze handler error', e);
    return res.status(500).json({ error: 'Analysis failed. Please try again.' });
  }
}
