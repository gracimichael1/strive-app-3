/**
 * api/coach.js — Server-side Claude coaching proxy.
 *
 * Takes Gemini's raw audit JSON and sends it to Claude
 * for coaching refinement: root cause analysis, training
 * protocols, power leak circuits, and 4-week trackers.
 *
 * The ANTHROPIC_API_KEY never leaves the server.
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

// The coaching response schema — Claude fills this from Gemini's audit data
const COACHING_SCHEMA = {
  name: "coaching_refinement",
  description: "Coaching analysis based on technical audit data",
  input_schema: {
    type: "object",
    properties: {
      prescriptiveTraining: {
        type: "object",
        properties: {
          rootCause:        { type: "string", description: "The single biomechanical failure causing the highest cumulative deduction" },
          correctionCue:    { type: "string", description: "A 3-word internal verbal cue (e.g., 'Knees Kiss Block')" },
          metricForSuccess: { type: "string", description: "One visual landmark for the coach to confirm the fix" },
          drillSuite: {
            type: "object",
            properties: {
              stage1: { type: "string", description: "Isolated Floor/Conditioning drill" },
              stage2: { type: "string", description: "Stationary/Lead-up Apparatus drill" },
              stage3: { type: "string", description: "Full-Skill Application with constraint" },
            },
            required: ["stage1", "stage2", "stage3"],
          },
        },
        required: ["rootCause", "correctionCue", "metricForSuccess", "drillSuite"],
      },
      powerLeakCircuit: {
        type: "object",
        properties: {
          isometricAnchor:     { type: "object", properties: { exercise: { type: "string" }, duration: { type: "string" } }, required: ["exercise", "duration"] },
          explosivePrime:      { type: "object", properties: { exercise: { type: "string" }, sets: { type: "string" }, reps: { type: "string" } }, required: ["exercise", "sets", "reps"] },
          technicalConstraint: { type: "object", properties: { exercise: { type: "string" }, prop: { type: "string" } }, required: ["exercise", "prop"] },
          compressionMetric:   { type: "object", properties: { test: { type: "string" }, target: { type: "string" } }, required: ["test", "target"] },
        },
        required: ["isometricAnchor", "explosivePrime", "technicalConstraint", "compressionMetric"],
      },
      fourWeekTracker: {
        type: "object",
        properties: {
          primaryObjective:    { type: "string", description: "Specific point-reduction goal" },
          weeks1_2Focus:       { type: "string", description: "Foundation phase focus" },
          weeks3_4Focus:       { type: "string", description: "Execution phase focus" },
          bossLevelBenchmarks: {
            type: "array",
            items: { type: "string" },
            description: "3 measurable benchmarks to prove the fix",
          },
        },
        required: ["primaryObjective", "weeks1_2Focus", "weeks3_4Focus", "bossLevelBenchmarks"],
      },
      drillRecommendations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            skillName: { type: "string" },
            drill:     { type: "string" },
          },
          required: ["skillName", "drill"],
        },
        description: "Per-skill drill recommendations keyed to skill names from the audit",
      },
    },
    required: ["prescriptiveTraining", "powerLeakCircuit", "fourWeekTracker", "drillRecommendations"],
  },
};

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!isAllowedOrigin(req.headers.origin)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (!validateAppToken(req, res)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on server' });
  }

  const { auditData, athleteLevel, athleteGender } = req.body || {};
  if (!auditData) {
    return res.status(400).json({ error: 'auditData required' });
  }

  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: `You are a Head High-Performance Gymnastics Coach. You receive raw technical audit data from a visual analysis system and transform it into elite coaching intelligence. You do NOT re-score or second-guess the deductions — they are final. Your job is to identify the ROOT CAUSE of the highest-impact faults and build a precise, physics-based training progression to eliminate them. The athlete is ${athleteGender || "female"}, competing at ${athleteLevel || "Level 6"}.`,
        messages: [
          {
            role: 'user',
            content: `Here is the raw technical audit data from the visual analysis:\n\n${JSON.stringify(auditData, null, 2)}\n\nBased on this audit:\n1. Identify the single ROOT CAUSE biomechanical failure causing the highest cumulative deduction.\n2. Generate a 15-minute "Power Leak" correction circuit with isometric anchor, explosive prime, technical constraint, and compression metric.\n3. Create a 4-week BHPA Performance Tracker with biweekly focus blocks and 3 "Boss Level" benchmarks.\n4. Provide a targeted drill recommendation for each skill that had deductions.`,
          },
        ],
        tools: [COACHING_SCHEMA],
        tool_choice: { type: "tool", name: "coaching_refinement" },
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text().catch(() => '');
      throw new Error(`Claude API failed (${claudeRes.status}): ${errText.substring(0, 300)}`);
    }

    const data = await claudeRes.json();

    // Extract the tool use result
    const toolBlock = data.content?.find(b => b.type === 'tool_use');
    if (!toolBlock || !toolBlock.input) {
      throw new Error('Claude did not return coaching data');
    }

    return res.status(200).json(toolBlock.input);
  } catch (e) {
    console.error('[coach] Error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
