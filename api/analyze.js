/**
 * api/analyze.js
 *
 * Full routine judging report — called after all skills are classified.
 * Sends the complete skill analysis to Gemini and gets back a coaching
 * report calibrated to the athlete's specific level and event.
 *
 * LEVEL AWARENESS:
 *   - Tells Gemini exactly what scoring system applies
 *   - Provides the split angle minimum for the level
 *   - States whether required skills (compulsory) are present
 *   - Asks for benchmark comparison (e.g. "typical 9.0 at Level 6")
 */

const LEVEL_CONTEXT = {
  'Level 1': { type:'compulsory', splitMin:90,  system:'USAG JO', bench:'7.5–9.5', scoreCap:10 },
  'Level 2': { type:'compulsory', splitMin:90,  system:'USAG JO', bench:'7.5–9.5', scoreCap:10 },
  'Level 3': { type:'compulsory', splitMin:90,  system:'USAG JO', bench:'7.0–9.5', scoreCap:10 },
  'Level 4': { type:'compulsory', splitMin:90,  system:'USAG JO', bench:'7.0–9.7', scoreCap:10 },
  'Level 5': { type:'compulsory', splitMin:120, system:'USAG JO', bench:'7.0–9.8', scoreCap:10 },
  'Level 6': { type:'optional',   splitMin:150, system:'USAG JO', bench:'7.5–9.6', scoreCap:10 },
  'Level 7': { type:'optional',   splitMin:150, system:'USAG JO', bench:'7.5–9.7', scoreCap:10 },
  'Level 8': { type:'optional',   splitMin:180, system:'USAG JO', bench:'7.5–9.7', scoreCap:10 },
  'Level 9': { type:'optional',   splitMin:180, system:'USAG JO', bench:'7.5–9.8', scoreCap:10 },
  'Level 10':{ type:'optional',   splitMin:180, system:'USAG JO', bench:'7.5–9.9', scoreCap:10 },
  'Elite':   { type:'elite',      splitMin:180, system:'FIG COP', bench:'12.0–16.0', scoreCap:20 },
  'Xcel Bronze':   { type:'xcel', splitMin:90,  system:'USAG Xcel', bench:'7.0–9.5', scoreCap:10 },
  'Xcel Silver':   { type:'xcel', splitMin:90,  system:'USAG Xcel', bench:'7.5–9.5', scoreCap:10 },
  'Xcel Gold':     { type:'xcel', splitMin:120, system:'USAG Xcel', bench:'7.5–9.6', scoreCap:10 },
  'Xcel Platinum': { type:'xcel', splitMin:150, system:'USAG Xcel', bench:'7.5–9.7', scoreCap:10 },
  'Xcel Diamond':  { type:'xcel', splitMin:180, system:'USAG Xcel', bench:'7.5–9.7', scoreCap:10 },
  'Xcel Sapphire': { type:'xcel', splitMin:180, system:'USAG Xcel', bench:'7.5–9.8', scoreCap:10 },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'POST only' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

  const { athleteProfile = {}, skillAnalysis = [], event } = req.body || {};

  if (!skillAnalysis.length) return res.status(400).json({ error: 'No skill data provided' });

  const prompt = buildJudgingPrompt(athleteProfile, skillAnalysis, event);

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 2048, responseMimeType: 'application/json' },
        }),
      }
    );

    const data = await geminiRes.json();
    if (!geminiRes.ok) return res.status(502).json({ error: 'Gemini error', detail: data });

    const raw   = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const clean = raw.replace(/```json|```/g, '').trim();

    let parsed;
    try { parsed = JSON.parse(clean); } catch { return res.status(500).json({ error: 'JSON parse failed', raw: raw.slice(0,400) }); }

    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

function buildJudgingPrompt(profile, skillAnalysis, event) {
  const level     = profile.level || 'unknown';
  const name      = profile.name  || 'Athlete';
  const eventName = event || profile.eventLabel || 'Floor Exercise';
  const ctx       = LEVEL_CONTEXT[level] || { type:'optional', splitMin:150, system:'USAG JO', bench:'7.5–9.7', scoreCap:10 };

  const skillLines = skillAnalysis.map((s, i) => {
    const deds = (s.deductionHints || [])
      .map(d => `${d.fault} (~−${d.deduction.toFixed(2)})`)
      .join(', ') || 'None detected';
    return `  Skill ${i+1}: ${s.skillName} @ ${s.start?.toFixed(1)}s
    Knee(peak): ${s.biomechanics?.peak?.kneeAngle?.toFixed(0) ?? 'N/A'}°  |  Hip(peak): ${s.biomechanics?.peak?.hipAngle?.toFixed(0) ?? 'N/A'}°  |  Worst knee: ${s.biomechanics?.worstKneeAngle?.toFixed(0) ?? 'N/A'}°
    Landing: ${s.landingQuality || 'unknown'}  |  Coach note: ${s.coachNote || 'none'}
    Detected faults: ${deds}`;
  }).join('\n');

  return `You are a head judge and coaching director certified in USA Gymnastics (${ctx.system}).

ATHLETE: ${name}
LEVEL:   ${level} (${ctx.type === 'compulsory' ? 'COMPULSORY — required routine' : ctx.type === 'xcel' ? 'XCEL program' : ctx.type === 'elite' ? 'ELITE / FIG' : 'optional'})
EVENT:   ${eventName}
SCORING: ${ctx.system} | Score range: ${ctx.bench} | Max: ${ctx.scoreCap}
SPLIT ANGLE REQUIRED AT ${level.toUpperCase()}: ≥${ctx.splitMin}°
${ctx.type === 'compulsory' ? '\nNOTE: This is a compulsory level. Deduct for deviation from required choreography in addition to execution faults.' : ''}
${ctx.type === 'elite' ? '\nNOTE: Elite scoring = D-score + E-score. Report execution errors from the 10.0 base.' : ''}

SKILL DATA FROM ANALYSIS:
${skillLines}

Generate a coaching report as this exact JSON (no markdown):
{
  "levelContext": "${level} ${eventName}",
  "estimatedScore": <number within ${ctx.bench} range>,
  "executionDeductionsTotal": <number>,
  "totalDeductions": <number>,
  "finalScore": <number 0–${ctx.scoreCap}>,
  "scoreBenchmark": "${ctx.bench}",
  "skills": [
    {
      "skillName": "<string>",
      "timestamp": "<0:00 format>",
      "primaryFault": "<main fault>",
      "deduction": <0.05|0.10|0.20|0.30|0.50>,
      "levelNote": "<any level-specific rule that applies, e.g. split angle at Level 5 must be ≥120°>"
    }
  ],
  "topFixes": ["<most impactful fix for ${level}>", "<second fix>", "<third fix>"],
  "strengths": ["<genuine strength>"],
  "levelAppropriateGoal": "<one specific, measurable goal appropriate for ${level}, e.g. 'Achieve consistent 120° split leap'>",
  "overallNote": "<2–3 sentences of coaching feedback calibrated to ${level} expectations and typical score range ${ctx.bench}>",
  "trainingDrills": [
    { "name": "<drill>", "purpose": "<what fault it addresses>", "reps": "<e.g. 3x10>", "levelNote": "<why this drill is appropriate for ${level}>" }
  ]
}`;
}
