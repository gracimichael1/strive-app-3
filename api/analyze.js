/**
 * api/analyze.js
 * Vercel serverless function — BHPA judging engine.
 * Accepts extracted video frames from the client.
 * Sends frames + BHPA system instruction to Gemini with responseSchema.
 * Returns structured JSON scorecard.
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

function buildBHPAPrompt(athleteProfile, event) {
  const level        = athleteProfile?.level    || 'Level 6';
  const rawGender    = athleteProfile?.gender   || 'female';
  const levelCat     = athleteProfile?.levelCategory || 'optional';
  const athleteName  = athleteProfile?.name     || 'the gymnast';

  const gender       = rawGender === 'female' ? "Women's" : "Men's";
  const levelDisplay = levelCat === 'xcel'
    ? level
    : `${levelCat === 'compulsory' ? 'Compulsory' : 'Optional'} ${level}`;

  return `The BHPA Master System Instruction
Role: Act as a Brevet-level USAG ${gender} ${levelDisplay} Lead Judge and High-Performance Technical Coach. Your goal is to provide a "Zero-Lenience" score followed by a "Physics-Based" training roadmap.

ATHLETE: ${athleteName} | ${gender} ${levelDisplay}
EVENT: ${event || 'Gymnastics Routine'}

I. Operational Protocol: The Professional Audit
1. Double-Pass Scrub:
   * Pass 1 (The Skills): Analyze primary flight elements, handstands, and saltos.
   * Pass 2 (Connective Tissue): Scrub the 1.5s between skills (Kips, Squat-ons, Taps).
2. Frame-by-Frame Apex Scrub: Manually identify and analyze the "Apex Frame" of every flight element and the "Contact Frame" of every landing or bar transition. Document any form breaks (TPM/KTM) that exist even for a single frame.
3. The "Monitors": Activate Toe Point Monitor (TPM) and Knee Tension Monitor (KTM) for every frame.
4. Zero Lenience: Strictly forbidden from giving "benefit of the doubt." If a toe isn't pointed or a knee isn't locked, it is a deduction (0.05 - 0.10).
5. The "Zero-Variance" Audit Upgrade:
   * The 30-Degree Penalty: Any cast failing to reach the required horizontal/vertical line (based on the specified level) is an automatic 0.30 deduction. No "marginal" passes.
   * The "Compounder" Rule: If a form break (KTM/TPM) occurs during a technical error (e.g., bent arms during a Kip), the deduction is doubled. (0.10 for form + 0.10 for technique).
   * The 1.5-Second Rhythm Clock: Any pause, hesitation, or "adjustment" of hands on the bar lasting longer than 1.5 seconds is an automatic 0.10 rhythm break.
   * The "Early Pike" Logic: Any salto (dismount) that begins to pike/tuck before reaching the apex of flight loses 0.20 for "Poor Body Position in Flight."
   * The "Heavy Bar" Audit: Any "stumble" or "clunky" foot contact during a Squat-on or transition is a 0.10 deduction for lack of control.

II. Scorecard Rules
* Timestamped Deduction Table: List every skill AND transition. Identify micro-deductions (0.05, 0.1, 0.2).
* The "Missed Transition" Check: Explicitly confirm if "cowboy knees," "staggered feet," or "flexed feet" occurred during transitions.
* Final Justified Score: Calculated from a 10.0 Start Value.
* IMPORTANT: The deductions array must contain ONE entry per distinct skill or transition — do NOT list the same element multiple times. Maximum 10 entries total. Group minor form breaks (flexed feet, soft knees) INTO the skill they occurred on as a combined deduction rather than separate entries. Only log elements that actually received a deduction > 0.

III. Biomechanical Overlay & Kinetic Audit
1. The "Swing/Flight Radius" Analysis: Deconstruct the Hollow-Arch-Hollow sequence. Identify the exact frame of the "Toe Beat." State if the momentum generation is Early, Late, or Optimal.
2. The "Width of Mass" Audit: Measure lateral deviation (e.g., Cowboy Knees). Explain the Conservation of Angular Momentum impact on Angular Velocity.
3. The Landing Vector: Provide a Torso-to-Vertical angle measurement at impact. Determine if the Center of Mass (CoM) was Leading, Trailing, or Stacked over the base of support.

IV. Level-Up Analysis
1. Requirement Shift: Identify which skills would fail Special Requirements or Value Parts of the next level up.
2. The "Angle" Tax: Recalculate the score using the next level's angle requirements.
3. Transition Score: Projected Score — what this exact performance would earn judged at the higher level today.

OUTPUT: Analyze the provided video frames showing this routine. Return ONLY valid JSON matching the required schema. No markdown, no text outside the JSON.`;
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    scorecard: {
      type: 'object',
      properties: {
        finalScore:      { type: 'number' },
        totalDeductions: { type: 'number' },
        deductions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              timestamp: { type: 'string' },
              element:   { type: 'string' },
              deduction: { type: 'number' },
              notes:     { type: 'string' },
            },
            required: ['timestamp', 'element', 'deduction', 'notes'],
          },
        },
        missedTransitions: { type: 'array', items: { type: 'string' } },
      },
      required: ['finalScore', 'totalDeductions', 'deductions'],
    },
    biomechanicalAudit: {
      type: 'object',
      properties: {
        swingFlightRadius: { type: 'string' },
        widthOfMass:       { type: 'string' },
        landingVector:     { type: 'string' },
      },
    },
    levelUpAnalysis: {
      type: 'object',
      properties: {
        requirementShift: { type: 'array', items: { type: 'string' } },
        angleTax:         { type: 'string' },
        projectedScore:   { type: 'number' },
      },
    },
    trainingRoadmap: {
      type: 'object',
      properties: {
        technicalAnchor: { type: 'string' },
        drill:           { type: 'string' },
      },
    },
    detectedEvent: { type: 'string' },
  },
  required: ['scorecard'],
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

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

  const { athleteProfile, frames, event } = req.body || {};

  if (!frames || frames.length === 0) {
    return res.status(400).json({ error: 'No video frames provided' });
  }

  const prompt = buildBHPAPrompt(athleteProfile, event);

  // Build content parts: each frame as an inlineData image + the prompt text
  const imageParts = frames.map(f => ({
    inline_data: {
      mime_type: f.mimeType || 'image/jpeg',
      data: f.base64,
    },
  }));

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: prompt }],
          },
          contents: [{
            parts: [
              ...imageParts,
              { text: 'Analyze the routine shown across these video frames. Apply the BHPA judging system. Return the full scorecard JSON.' },
            ],
          }],
          generationConfig: {
            temperature:      0.1,
            topP:             1,
            topK:             1,
            seed:             42,
            maxOutputTokens:  16384,
            responseMimeType: 'application/json',
            responseSchema:   RESPONSE_SCHEMA,
            thinkingConfig:   { thinkingBudget: 8000 },
          },
        }),
      }
    );

    const data = await geminiRes.json();

    if (!geminiRes.ok) {
      console.error('Gemini error', data);
      return res.status(502).json({ error: 'Analysis service error', detail: data });
    }

    const parts     = data.candidates?.[0]?.content?.parts || [];
    const rawText   = parts.filter(p => p.text && !p.thought).map(p => p.text).join('\n')
      || parts.map(p => p.text || '').join('\n');
    const clean     = rawText.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      return res.status(500).json({ error: 'Could not parse analysis response', rawText });
    }

    return res.status(200).json(parsed);

  } catch (e) {
    console.error('analyze handler error', e);
    return res.status(500).json({ error: e.message });
  }
}
