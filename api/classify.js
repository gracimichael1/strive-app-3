/**
 * api/classify.js
 *
 * Gemini 1.5 Pro skill classification endpoint.
 * Receives a skill video clip + biomechanics + full athlete profile.
 * Returns structured skill identification with level-specific deduction rules.
 *
 * LEVEL AWARENESS:
 *   The prompt sends Gemini:
 *   - The specific level (e.g. "Level 5 Women JO")
 *   - What skills are expected at that level (from LEVEL_REQUIREMENTS)
 *   - The split angle minimum for that level
 *   - Whether it's compulsory or optional
 *   - The scoring system (USA Gymnastics JO / Xcel / FIG)
 *   This is the key accuracy improvement over generic classification.
 */

// Level context lookup — duplicated here so this file is self-contained server-side
const LEVEL_CONTEXT = {
  'Level 1':       { type: 'compulsory', splitMin: 90,  system: 'USAG JO', typicalSkills: 'forward roll, backward roll, cartwheel, basic jumps' },
  'Level 2':       { type: 'compulsory', splitMin: 90,  system: 'USAG JO', typicalSkills: 'handstand, bridge, round-off, cartwheel, arabesque' },
  'Level 3':       { type: 'compulsory', splitMin: 90,  system: 'USAG JO', typicalSkills: 'round-off, back walkover, front walkover, cartwheel, handstand forward roll' },
  'Level 4':       { type: 'compulsory', splitMin: 90,  system: 'USAG JO', typicalSkills: 'round-off back handspring, front limber, cartwheel on beam, full turn' },
  'Level 5':       { type: 'compulsory', splitMin: 120, system: 'USAG JO', typicalSkills: 'round-off BHS back tuck, front handspring, back walkover, split leap ≥120°, full turn' },
  'Level 6':       { type: 'optional',   splitMin: 150, system: 'USAG JO', typicalSkills: 'round-off BHS back tuck/layout, back walkover, split leap ≥150°, B acro skills' },
  'Level 7':       { type: 'optional',   splitMin: 150, system: 'USAG JO', typicalSkills: 'two tumbling passes, back layout or higher, split leap ≥150°, acro series on beam, 1.5 turn' },
  'Level 8':       { type: 'optional',   splitMin: 180, system: 'USAG JO', typicalSkills: 'C tumbling, 180° split leap, Yurchenko/Tsukahara vault, C dismounts' },
  'Level 9':       { type: 'optional',   splitMin: 180, system: 'USAG JO', typicalSkills: 'D tumbling pass, 180° split leap series, high-difficulty connections' },
  'Level 10':      { type: 'optional',   splitMin: 180, system: 'USAG JO', typicalSkills: 'D+ tumbling, E connections, 3 saltos, Yurchenko full+ vault' },
  'Elite':         { type: 'elite',      splitMin: 180, system: 'FIG COP', typicalSkills: 'Elite-level FIG skills, D-score + E-score, all apparatus' },
  'Xcel Bronze':   { type: 'xcel',       splitMin: 90,  system: 'USAG Xcel', typicalSkills: 'forward roll, cartwheel, bridge, stretch jump, basic acro' },
  'Xcel Silver':   { type: 'xcel',       splitMin: 90,  system: 'USAG Xcel', typicalSkills: 'round-off, handstand, back walkover, leap, basic acro series' },
  'Xcel Gold':     { type: 'xcel',       splitMin: 120, system: 'USAG Xcel', typicalSkills: 'round-off BHS, back walkover series, split leap ≥120°, B acro' },
  'Xcel Platinum': { type: 'xcel',       splitMin: 150, system: 'USAG Xcel', typicalSkills: 'B tumbling passes, split leap ≥150°, near Level 6–7 difficulty' },
  'Xcel Diamond':  { type: 'xcel',       splitMin: 180, system: 'USAG Xcel', typicalSkills: 'C skills, 180° split, near Level 8 difficulty, front aerial' },
  'Xcel Sapphire': { type: 'xcel',       splitMin: 180, system: 'USAG Xcel', typicalSkills: 'D skills, near Level 9–10 difficulty' },
};

const EVENT_DISPLAY = {
  floor:         'Floor Exercise',
  beam:          'Balance Beam',
  bars:          'Uneven Bars',
  vault:         'Vault',
  pommel:        'Pommel Horse',
  rings:         'Still Rings',
  parallel_bars: 'Parallel Bars',
  horizontal_bar:'High Bar / Horizontal Bar',
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

  const {
    clipBase64,
    mimeType        = 'video/webm',
    biomechanics,
    athleteProfile  = {},
    candidateSkills = [],
  } = req.body || {};

  const prompt = buildLevelAwarePrompt(biomechanics, athleteProfile, candidateSkills);

  const parts = [];
  if (clipBase64) {
    parts.push({ inlineData: { mimeType, data: clipBase64 } });
  }
  parts.push({ text: prompt });

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            temperature:      0.1,
            maxOutputTokens:  1200,
            responseMimeType: 'application/json',
          },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          ],
        }),
      }
    );

    const data = await geminiRes.json();

    if (!geminiRes.ok) {
      console.error('[classify] Gemini error:', JSON.stringify(data));
      return res.status(502).json({ error: 'Gemini API error', detail: data });
    }

    const raw   = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const clean = raw.replace(/```json|```/g, '').trim();

    let parsed;
    try { parsed = JSON.parse(clean); }
    catch { return res.status(500).json({ error: 'JSON parse failed', raw: raw.slice(0, 500) }); }

    return res.status(200).json({ ...normalize(parsed), geminiRaw: raw });

  } catch (e) {
    console.error('[classify] fetch error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}

// ─── LEVEL-AWARE PROMPT ───────────────────────────────────────────────────────

function buildLevelAwarePrompt(bio, profile, candidateSkills) {
  const level     = profile.level     || 'unknown level';
  const eventKey  = profile.event     || 'floor';
  const gender    = profile.gender    || 'women';
  const eventName = EVENT_DISPLAY[eventKey] || eventKey;
  const ctx       = LEVEL_CONTEXT[level] || { type: 'optional', splitMin: 150, system: 'USAG JO', typicalSkills: 'standard gymnastics skills' };

  // Biomechanics summary
  const peakK  = bio?.peak?.kneeAngle     != null ? `${Math.round(bio.peak.kneeAngle)}°`     : 'unknown';
  const peakH  = bio?.peak?.hipAngle      != null ? `${Math.round(bio.peak.hipAngle)}°`      : 'unknown';
  const peakSh = bio?.peak?.shoulderAngle != null ? `${Math.round(bio.peak.shoulderAngle)}°` : 'unknown';
  const peakEl = bio?.peak?.elbowAngle    != null ? `${Math.round(bio.peak.elbowAngle)}°`    : 'unknown';
  const wKnee  = bio?.worstKneeAngle      != null ? `${Math.round(bio.worstKneeAngle)}°`     : 'unknown';
  const landK  = bio?.landing?.kneeAngle  != null ? `${Math.round(bio.landing.kneeAngle)}°`  : 'unknown';
  const wristUp = bio?.peak?.wristAboveHip ? 'YES — inverted position confirmed' : 'No';

  const candidateList = candidateSkills.length > 0
    ? `\nLikely skills at this level:\n${candidateSkills.map(s => `  • ${s}`).join('\n')}`
    : '';

  return `You are a certified USA Gymnastics and FIG judge.

═══════════════════════════════════════════════════
ATHLETE CONTEXT — USE THIS TO CALIBRATE YOUR ANALYSIS
═══════════════════════════════════════════════════
Level:          ${level} (${ctx.type})
Event:          ${eventName}
Gender:         ${gender}
Scoring system: ${ctx.system}
Split angle minimum at this level: ≥${ctx.splitMin}°
Typical skills at ${level}: ${ctx.typicalSkills}
${candidateList}

IMPORTANT LEVEL-SPECIFIC RULES:
${ctx.type === 'compulsory'
  ? `• This is a COMPULSORY level. Every gymnast performs the same required routine.
• Deductions apply for any deviation from the prescribed choreography.
• Skills NOT on the required list for ${level} may be an error or optional connection.`
  : ctx.type === 'xcel'
  ? `• This is XCEL program. Athletes choose their own skills within level parameters.
• Split leap / jump minimum is ${ctx.splitMin}° — anything less is a deduction.
• Scoring is execution-based (same 10.0 system as JO optional).`
  : ctx.type === 'elite'
  ? `• This is ELITE / FIG level. Score = D-score + E-score.
• All deductions are per the current FIG Code of Points.
• Execution judging is from 10.0; start value (D-score) is separate.`
  : `• This is an OPTIONAL level (${level}). Athletes select their own skills.
• Split leap minimum: ${ctx.splitMin}°. Anything below this is a deduction.
• Difficulty requirements: ${ctx.typicalSkills}`
}

═══════════════════════════════════════════════════
BIOMECHANICS (MediaPipe single-camera, ±10–15° margin)
═══════════════════════════════════════════════════
Knee angle (peak):         ${peakK}
Hip angle (peak):          ${peakH}
Shoulder angle (peak):     ${peakSh}
Elbow angle (peak):        ${peakEl}
Worst knee angle (flight): ${wKnee}
Landing knee angle:        ${landK}
Wrists above hips:         ${wristUp}

═══════════════════════════════════════════════════
YOUR TASK
═══════════════════════════════════════════════════
1. Identify the specific skill shown (use video if provided; use biomechanics as supporting data)
2. Apply ${ctx.system} deduction rules for ${level} ${eventName}
3. Check split angle against the ${ctx.splitMin}° minimum for ${level}
4. Rate confidence in your skill identification
5. Note any single-camera limitations (e.g. rotation count, twist completion)

DEDUCTION RULES — USE ONLY THESE EXACT VALUES:
  • 0.05 = small fault (slight bend, minor alignment)
  • 0.10 = medium fault (noticeable bend, visible step)
  • 0.20 = large fault (significant bend, lunge)
  • 0.30 = very large fault (severe bend, deep squat)
  • 0.50 = fall

Do NOT invent faults. If you cannot confirm a fault from the video or biomechanics, omit it or flag low confidence.

Respond with ONLY this JSON (no markdown):
{
  "skillName": "<exact skill name>",
  "skillId": "<snake_case, e.g. back_handspring>",
  "levelContext": "${level} ${eventName}",
  "confidence": <0.0–1.0>,
  "confidenceLabel": "<high|medium|low>",
  "confidenceReason": "<one sentence>",
  "faultObservations": [
    {
      "fault": "<USA Gymnastics fault name>",
      "deduction": <0.05|0.10|0.20|0.30|0.50>,
      "severity": "<small|medium|large|veryLarge|fall>",
      "detail": "<specific measurement or observation>",
      "confidence": <0.0–1.0>,
      "category": "<execution|landing|artistry>"
    }
  ],
  "splitAngleAssessment": {
    "estimated": <angle or null>,
    "required": ${ctx.splitMin},
    "meetsRequirement": <true|false|null>,
    "deduction": <0.0–0.30 or null>
  },
  "landingQuality": "<clean|small_step|large_step|fall|unknown>",
  "coachNote": "<1–2 sentences of specific, actionable coaching feedback calibrated for ${level}>",
  "singleCameraWarning": "<note any angles/counts that single camera cannot confirm, or null>"
}`;
}

// ─── NORMALIZER ───────────────────────────────────────────────────────────────

function normalize(p) {
  const conf = clamp(p.confidence ?? 0.5, 0, 1);
  return {
    skillName:       p.skillName         || 'Unidentified Skill',
    skillId:         p.skillId           || 'unknown',
    levelContext:    p.levelContext       || '',
    confidence:      conf,
    confidenceLabel: conf >= 0.75 ? 'high' : conf >= 0.50 ? 'medium' : 'low',
    confidenceReason: p.confidenceReason || '',
    faultObservations: (p.faultObservations || []).map(f => ({
      fault:      String(f.fault     || ''),
      deduction:  clamp(Number(f.deduction || 0), 0, 0.50),
      severity:   ['small','medium','large','veryLarge','fall'].includes(f.severity) ? f.severity : 'small',
      detail:     String(f.detail    || ''),
      confidence: clamp(Number(f.confidence || 0.7), 0, 1),
      category:   ['execution','landing','artistry'].includes(f.category) ? f.category : 'execution',
    })).filter(f => f.deduction > 0 && f.confidence >= 0.4),
    splitAngleAssessment: p.splitAngleAssessment || null,
    landingQuality:      p.landingQuality      || 'unknown',
    coachNote:           p.coachNote           || '',
    singleCameraWarning: p.singleCameraWarning || null,
  };
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
