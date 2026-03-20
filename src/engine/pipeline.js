/**
 * pipeline.js — 2-Pass Gemini analysis orchestrator.
 *
 * Replaces the single-pass analyzeWithAI() in LegacyApp.js.
 * Pass 1: Vision (video → skill list + deductions)
 * Pass 2: Analysis (Pass 1 output + video → biomechanics + coaching)
 * Score: Code-computed from Pass 1 deductions (never AI)
 *
 * SECURITY: All Gemini API calls route through /api/gemini server proxy.
 * The API key NEVER reaches the browser.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * Integration: Call runAnalysisPipeline() from AnalyzingScreen.
 * This function replaces analyzeWithAI() — same inputs, richer output.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { buildPass1Prompt, buildPass2Prompt, PASS1_CONFIG, PASS2_CONFIG, PROMPT_VERSION } from "./prompts";
import { validatePipelineResult, snapToUSAG, emptyBiomechanics, emptyInjuryRisk, emptyMentalPerformance, emptyNutritionRecovery } from "./schema";
import { computeScore, gradeSkill } from "./scoring";
import { transformForUI } from "./transform";

// ─── Structured logging (matches LegacyApp pattern) ─────────────────────────

const log = {
  _fmt(level, stage, msg, data) {
    const ts = new Date().toISOString().slice(11, 23);
    const prefix = `[${ts}] [${level}] [engine:${stage}]`;
    if (data !== undefined) console.log(prefix, msg, data);
    else console.log(prefix, msg);
  },
  info(stage, msg, data) { log._fmt("INFO", stage, msg, data); },
  warn(stage, msg, data) { log._fmt("WARN", stage, msg, data); },
  error(stage, msg, data) { log._fmt("ERROR", stage, msg, data); },
};

// ─── Server proxy helper ────────────────────────────────────────────────────

const PROXY_URL = "/api/gemini";
const STRIVE_TOKEN = "strive-2026-launch";

async function geminiProxy(body) {
  const res = await fetch(PROXY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Strive-Token": STRIVE_TOKEN,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `Server error (${res.status})`);
  }

  return res.json();
}

// ─── Main pipeline entry point ──────────────────────────────────────────────

/**
 * Run the full 2-pass analysis pipeline.
 * Returns the UI-ready result (already transformed via transformForUI).
 *
 * @param {Object} params
 * @param {File} params.videoFile - The video file to analyze
 * @param {Object} params.profile - { name, gender, level, levelCategory }
 * @param {string} params.event - Event name or "Auto-detect"
 * @param {function} params.onProgress - Progress callback ({ stage, pct, label })
 * @returns {Promise<Object>} - UI-ready result (transformForUI output)
 */
export async function runAnalysisPipeline({ videoFile, profile, event, onProgress = () => {} }) {
  const startTime = Date.now();

  if (!videoFile) throw new Error("No video file provided.");

  // ── Check cache ───────────────────────────────────────────────────────────
  const cacheKey = buildCacheKey(videoFile, profile, event);
  const cached = readCache(cacheKey);
  if (cached) {
    log.info("cache", `Returning cached result (${cached._meta?.prompt_version})`);
    onProgress({ stage: "complete", pct: 100, label: "Score verified — analyzed previously" });
    // Cached results are already transformed
    return cached;
  }

  // ── Verify server has API key ───────────────────────────────────────────
  // Quick check — if the server doesn't have GEMINI_API_KEY, fail fast
  try {
    await geminiProxy({ action: "pollFile", fileName: "files/__healthcheck__" });
  } catch (e) {
    if (e.message.includes("not configured")) {
      throw new Error("Server API key not configured. Contact the administrator.");
    }
    // Other errors (like file not found) are fine — means server is reachable
  }

  // ── Upload video ──────────────────────────────────────────────────────────
  onProgress({ stage: "upload", pct: 10, label: "Uploading video..." });
  const fileRef = await uploadVideo(videoFile, (pct) => {
    onProgress({ stage: "upload", pct: 10 + Math.floor(pct * 0.25), label: "Uploading video..." });
  });

  // ── Pass 1: Vision ────────────────────────────────────────────────────────
  onProgress({ stage: "pass1", pct: 40, label: "Identifying skills and deductions..." });
  const { system: sys1, user: usr1 } = buildPass1Prompt(profile, event);
  log.info("pass1", `Prompt: ${usr1.length} chars | Level: ${profile.level} | Event: ${event}`);

  let pass1Raw;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      pass1Raw = await callGemini(fileRef, sys1, usr1, PASS1_CONFIG, "pass1");
      // Accept natural language or JSON — just check for reasonable length
      if (pass1Raw && pass1Raw.length > 100) break;
      log.warn("pass1", `Attempt ${attempt}: response too short (${pass1Raw?.length} chars)`);
      if (attempt < 2) await delay(2000);
    } catch (e) {
      log.warn("pass1", `Attempt ${attempt} failed: ${e.message}`);
      if (attempt === 2) throw e;
      await delay(2000);
    }
  }

  if (!pass1Raw) throw new Error("Pass 1 returned empty response.");

  // Try JSON first, fall back to natural language parser
  let pass1Parsed;
  try {
    pass1Parsed = parseJSON(pass1Raw, "pass1");
  } catch (e) {
    log.info("parser", "JSON parse failed — using natural language parser");
    pass1Parsed = parseGeminiNaturalLanguage(pass1Raw, event, profile);
  }

  // Store raw response for UI display
  if (!pass1Parsed.raw_gemini_response) {
    pass1Parsed.raw_gemini_response = pass1Raw;
  }

  if (!pass1Parsed.skills || pass1Parsed.skills.length === 0) {
    throw new Error("Pass 1 found no skills in the video.");
  }

  console.log('[PASS1 RAW DEDUCTIONS]', JSON.stringify({
    skillCount: pass1Parsed.skills?.length,
    totalDeductionsByGemini: (pass1Parsed.skills||[]).reduce((s,sk) =>
      s + (sk.deductions||[]).reduce((ds,d) => ds + (d.point_value||0), 0), 0),
    artistry: (pass1Parsed.artistry?.deductions||[]).reduce((s,d) => s + (d.point_value||0), 0),
    composition: (pass1Parsed.composition?.deductions||[]).reduce((s,d) => s + (d.point_value||0), 0),
    skillNames: pass1Parsed.skills?.map(s => s.skill_name)
  }));
  log.info("pass1", `Found ${pass1Parsed.skills.length} skills, ${countDeductions(pass1Parsed)} deductions`);
  onProgress({ stage: "pass1", pct: 60, label: `Found ${pass1Parsed.skills.length} skills — analyzing biomechanics...` });

  // ── Pass 2: Analysis ──────────────────────────────────────────────────────
  onProgress({ stage: "pass2", pct: 65, label: "Analyzing biomechanics and building training plan..." });
  const { system: sys2, user: usr2 } = buildPass2Prompt(pass1Parsed, profile, event);
  log.info("pass2", `Prompt: ${usr2.length} chars`);

  let pass2Parsed = null;
  try {
    const pass2Raw = await callGemini(fileRef, sys2, usr2, PASS2_CONFIG, "pass2");
    pass2Parsed = parseJSON(pass2Raw, "pass2");
    log.info("pass2", `Analysis complete: ${(pass2Parsed.skills_analysis || []).length} skill analyses, ${(pass2Parsed.training_plan || []).length} drills`);
  } catch (e) {
    // Pass 2 failure is non-fatal — we have scores from Pass 1
    log.warn("pass2", `Failed (non-fatal): ${e.message}. Proceeding with Pass 1 data only.`);
  }

  onProgress({ stage: "scoring", pct: 85, label: "Computing score..." });

  // ── Merge Pass 1 + Pass 2 ────────────────────────────────────────────────
  const mergedSkills = mergeSkills(pass1Parsed, pass2Parsed);

  // ── Compute score (CODE, not AI) ──────────────────────────────────────────
  const detectedEvent = pass1Parsed.apparatus || event;
  const { d_score, e_score, final_score, breakdown } = computeScore(
    mergedSkills,
    pass1Parsed.neutral_deductions || 0,
    profile.level,
    profile.levelCategory || "optional"
  );

  log.info("score", `FINAL: ${final_score} | D: ${d_score} | E: ${e_score} | Deductions: ${breakdown.total_deductions} (exec: ${breakdown.execution_deductions}, art: ${breakdown.artistry_deductions}, comp: ${breakdown.composition_deductions}) | Skills: ${mergedSkills.length}`);

  // ── Assemble pipeline result ────────────────────────────────────────────
  const pipelineResult = {
    routine_summary: {
      apparatus: detectedEvent,
      duration_seconds: pass1Parsed.duration_seconds || 0,
      d_score,
      e_score,
      final_score,
      neutral_deductions: pass1Parsed.neutral_deductions || 0,
      level: profile.level,
      athlete_name: profile.name || "",
      why_this_score: pass1Parsed.why_this_score || "",
      celebrations: pass1Parsed.celebrations || [],
      raw_gemini_response: pass1Parsed.raw_gemini_response || "",
    },
    skills: mergedSkills,
    training_plan: pass2Parsed?.training_plan || [],
    mental_performance: pass2Parsed?.mental_performance || emptyMentalPerformance(),
    nutrition_recovery: pass2Parsed?.nutrition_recovery || emptyNutritionRecovery(),
    _meta: {
      prompt_version: PROMPT_VERSION,
      timestamp: Date.now(),
      duration_ms: Date.now() - startTime,
      model: "gemini-2.5-flash",
      pass1_skills: pass1Parsed.skills?.length || 0,
      pass2_success: !!pass2Parsed,
      score_breakdown: breakdown,
    },
  };

  // ── Validate ──────────────────────────────────────────────────────────────
  const { result: validated, warnings } = validatePipelineResult(pipelineResult);
  if (warnings.length > 0) {
    log.warn("validate", `${warnings.length} warnings:`, warnings);
  }

  // ── Transform for UI ──────────────────────────────────────────────────────
  const uiResult = transformForUI(validated);

  // ── Cache the UI-ready result ─────────────────────────────────────────────
  writeCache(cacheKey, uiResult);

  // ── Cleanup uploaded file (fire and forget) ───────────────────────────────
  try {
    geminiProxy({ action: "deleteFile", fileName: fileRef.fileName });
  } catch {}

  onProgress({ stage: "complete", pct: 100, label: "Analysis complete!" });
  return uiResult;
}


// ─── Video upload via server proxy ──────────────────────────────────────────

async function uploadVideo(videoFile, onProgress) {
  const mimeType = videoFile.type || "video/mp4";

  // Step 1: Ask server to initiate resumable upload (API key stays server-side)
  const { uploadUrl } = await geminiProxy({
    action: "initUpload",
    displayName: "routine_" + Date.now(),
    fileSize: videoFile.size,
    mimeType,
  });

  // Step 2: Upload bytes directly to the resumable URL (no API key needed)
  // In local dev, proxy through /goog-upload to avoid CORS with Google's API
  const isDev = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  const finalUploadUrl = isDev && uploadUrl.includes("generativelanguage.googleapis.com")
    ? uploadUrl.replace("https://generativelanguage.googleapis.com", "/goog-upload")
    : uploadUrl;

  const uploadRes = await fetch(finalUploadUrl, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Command": "upload, finalize",
      "X-Goog-Upload-Offset": "0",
      "Content-Length": String(videoFile.size),
    },
    body: videoFile,
  });

  if (!uploadRes.ok) throw new Error(`Upload failed (${uploadRes.status})`);

  const fileInfo = await uploadRes.json();
  const fileUri = fileInfo.file?.uri;
  const fileName = fileInfo.file?.name;
  if (!fileUri) throw new Error("No file URI returned");

  log.info("upload", `Uploaded: ${fileName} (${(videoFile.size / 1024 / 1024).toFixed(1)}MB)`);

  // Step 3: Poll until ACTIVE (via server proxy)
  for (let i = 0; i < 40; i++) {
    await delay(2000);
    try {
      const { state } = await geminiProxy({ action: "pollFile", fileName });
      if (state === "ACTIVE") break;
      if (state === "FAILED") throw new Error("Video processing failed on server");
    } catch (e) {
      if (e.message.includes("failed")) throw e;
    }
    onProgress(Math.min(1, (i + 1) / 30));
    if (i === 39) throw new Error("Video processing timed out (80s)");
  }

  return { fileUri, fileName, mimeType };
}


// ─── Gemini generate via server proxy ───────────────────────────────────────

async function callGemini(fileRef, systemPrompt, userPrompt, config, label) {
  log.info("gemini", `[${label}] Sending (${userPrompt.length} chars)`);

  const { text } = await geminiProxy({
    action: "generate",
    fileUri: fileRef.fileUri,
    mimeType: fileRef.mimeType,
    systemPrompt,
    userPrompt,
    config,
  });

  log.info("gemini", `[${label}] Response: ${text.length} chars`);

  // Debug storage
  try { localStorage.setItem(`debug-gemini-${label}`, text); } catch {}

  return text;
}


// ─── Merge Pass 1 + Pass 2 ─────────────────────────────────────────────────

function mergeSkills(pass1, pass2) {
  const skills = (pass1.skills || []).map((s, i) => {
    const analysis = pass2?.skills_analysis?.find(a => a.skill_id === s.id) || null;

    const deductions = (s.deductions || []).map(d => ({
      ...d,
      point_value: snapToUSAG(d.point_value),
    }));

    const totalDed = deductions.reduce((sum, d) => sum + d.point_value, 0);
    const { grade, color } = gradeSkill(totalDed);

    return {
      id: s.id || `skill_${i + 1}`,
      skill_name: s.skill_name || "Unknown",
      skill_code: s.skill_code || "A",
      timestamp_start: s.timestamp_start || 0,
      timestamp_end: s.timestamp_end || 0,
      executed_successfully: s.executed_successfully !== false,
      difficulty_value: s.difficulty_value || 0.10,
      deductions,
      biomechanics: analysis?.biomechanics || emptyBiomechanics(),
      injury_risk: analysis?.injury_risk || emptyInjuryRisk(),
      strength_note: s.strength_note || "",
      drill_recommendation: analysis?.drill_recommendation || null,
      _computed: {
        total_deduction: Math.round(totalDed * 100) / 100,
        quality_score: Math.round((10.0 - totalDed) * 100) / 100,
        grade,
        grade_color: color,
      },
    };
  });

  // Add artistry/composition as synthetic skill entries
  if (pass1.artistry?.deductions?.length) {
    const artDeds = (pass1.artistry.deductions || []).map(d => ({
      ...d,
      point_value: snapToUSAG(d.point_value),
      severity: d.severity || "small",
    }));
    const artTotal = artDeds.reduce((s, d) => s + d.point_value, 0);
    skills.push({
      id: "artistry",
      skill_name: "Artistry & Presentation",
      skill_code: "SR",
      timestamp_start: 0, timestamp_end: 0,
      executed_successfully: true,
      difficulty_value: 0,
      deductions: artDeds,
      biomechanics: emptyBiomechanics(),
      injury_risk: emptyInjuryRisk(),
      strength_note: "",
      drill_recommendation: null,
      _computed: { total_deduction: artTotal, quality_score: 10.0 - artTotal, grade: "—", grade_color: "#8890AB" },
    });
  }

  if (pass1.composition?.deductions?.length) {
    const compDeds = (pass1.composition.deductions || []).map(d => ({
      ...d,
      point_value: snapToUSAG(d.point_value),
      severity: d.severity || "small",
    }));
    const compTotal = compDeds.reduce((s, d) => s + d.point_value, 0);
    skills.push({
      id: "composition",
      skill_name: "Composition & Choreography",
      skill_code: "SR",
      timestamp_start: 0, timestamp_end: 0,
      executed_successfully: true,
      difficulty_value: 0,
      deductions: compDeds,
      biomechanics: emptyBiomechanics(),
      injury_risk: emptyInjuryRisk(),
      strength_note: "",
      drill_recommendation: null,
      _computed: { total_deduction: compTotal, quality_score: 10.0 - compTotal, grade: "—", grade_color: "#8890AB" },
    });
  }

  return skills;
}


// ─── Caching ────────────────────────────────────────────────────────────────

function buildCacheKey(videoFile, profile, event) {
  const parts = [
    PROMPT_VERSION,
    videoFile.name || "video",
    String(videoFile.size || 0),
    String(videoFile.lastModified || 0),
    (profile.name || "unknown").toLowerCase().trim(),
    profile.level || "L6",
    event || "floor",
  ].join("_");
  try { return `strive_cache_${btoa(unescape(encodeURIComponent(parts)))}`; }
  catch { return `strive_cache_${parts.replace(/[^a-zA-Z0-9]/g, "_")}`; }
}

function readCache(key) {
  try {
    const cached = localStorage.getItem(key);
    if (!cached) return null;
    const { result, timestamp } = JSON.parse(cached);
    const ageHours = (Date.now() - timestamp) / (1000 * 60 * 60);
    if (ageHours < 24 && result && result.gradedSkills) {
      result._cached = true;
      return result;
    }
  } catch {}
  return null;
}

function writeCache(key, result) {
  try {
    localStorage.setItem(key, JSON.stringify({ result, timestamp: Date.now() }));
    log.info("cache", `Cached under ${key.substring(0, 40)}...`);
  } catch (e) {
    log.warn("cache", `Cache write failed: ${e.message}`);
  }
}


// ─── Helpers ────────────────────────────────────────────────────────────────

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function parseJSON(raw, label) {
  try { return JSON.parse(raw); } catch {}
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch {}
  try {
    const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    return JSON.parse(cleaned);
  } catch (e) {
    log.error("parse", `[${label}] JSON parse failed. Raw (first 500 chars): ${raw.substring(0, 500)}`);
    throw new Error(`${label}: Could not parse JSON response`);
  }
}


// ─── Natural language parser for simple prompt responses ─────────────────────

function parseGeminiNaturalLanguage(rawText, event, profile) {
  const lines = rawText.split('\n');
  const skills = [];
  const artistry = { deductions: [] };
  const composition = { deductions: [] };
  let neutralDeductions = 0;
  const celebrations = [];
  let inCelebrations = false;

  // Debug: log first 50 non-empty lines to understand Gemini's format
  const sampleLines = lines.filter(l => l.trim()).slice(0, 50);
  log.info("parser", "First 50 lines of response:\n" + sampleLines.join('\n'));

  // Strip markdown bold/italic from text
  const clean = (s) => s.replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1').trim();

  // Parse timestamped scorecard lines
  // Flexible: [MM:SS] | Skill | 0.XX | Reason  OR  MM:SS - Skill - 0.XX - Reason  OR  colons
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Track when we enter celebrations section
    if (/^#{0,3}\s*(?:\d+\.\s*)?CELEBRATION/i.test(trimmed)) {
      inCelebrations = true;
      continue;
    }
    // Exit celebrations on next numbered section header
    if (inCelebrations && /^#{0,3}\s*(?:\d+\.\s*)?[A-Z]{3,}/.test(trimmed) && !/CELEBRATION/i.test(trimmed)) {
      inCelebrations = false;
    }

    // Capture celebration items
    if (inCelebrations && /^[-•*\d.)]+\s*.{10,}/.test(trimmed)) {
      celebrations.push(clean(trimmed.replace(/^[-•*\d.)]+\s*/, '')));
      continue;
    }

    // Skip table headers and separator lines
    if (/^\|?\s*Time/i.test(trimmed) || /^\|?\s*---/i.test(trimmed) || /^[-|:\s]+$/.test(trimmed.replace(/\s/g, ''))) continue;

    // Match timestamp lines — flexible regex for pipes, dashes, colons, or mixed separators
    // Handles: | 0:02 | Skill | 0.10 | Reason |  AND  [0:02] | Skill | 0.10 | Reason  AND  0:02 - Skill - 0.10 - Reason
    const tsMatch = trimmed.match(
      /^\|?\s*[\[\(]?(\d{1,2}:\d{2})[\]\)]?\s*[|:\-–—]\s*(.+?)\s*[|:\-–—]\s*(-?[\d.]+)\s*(?:[|:\-–—]\s*(.*))?/
    );

    if (tsMatch) {
      const [, ts, rawSkillName, dedStr, rawReason] = tsMatch;
      const skillName = clean(rawSkillName);
      // Strip trailing pipe from markdown table rows
      const reason = rawReason ? rawReason.replace(/\s*\|\s*$/, '').trim() : '';
      const parts = ts.split(':');
      const seconds = parseInt(parts[0]) * 60 + parseInt(parts[1]);
      const deduction = Math.abs(parseFloat(dedStr)) || 0;

      const isArtistryLine = /artistry|presentation|global|finger|eye contact|musicality|composition|choreograph/i.test(skillName + (reason || ''));

      if (isArtistryLine) {
        const isComp = /composition|choreograph|floor space|transition/i.test(skillName + (reason || ''));
        const target = isComp ? composition : artistry;
        target.deductions.push({
          type: isComp ? 'composition' : 'artistry',
          description: clean(reason || skillName),
          point_value: deduction,
          body_part: 'global'
        });
      } else {
        // Only merge if exact same timestamp (not by name prefix — too fragile)
        const existingSkill = skills.find(s => s.timestamp_start === seconds);

        if (existingSkill) {
          if (deduction > 0) {
            existingSkill.deductions.push({
              type: 'execution',
              description: clean(reason || 'See judge notes'),
              point_value: deduction,
              body_part: 'multiple',
              severity: deduction <= 0.10 ? 'small' : deduction <= 0.20 ? 'medium' : 'large'
            });
          }
        } else {
          skills.push({
            id: `skill_${skills.length + 1}`,
            skill_name: skillName,
            skill_code: 'B',
            timestamp_start: seconds,
            timestamp_end: seconds + 3,
            // Only false for falls (0.50 deduction)
            executed_successfully: deduction < 0.50,
            difficulty_value: 0.20,
            deductions: deduction > 0 ? [{
              type: 'execution',
              description: clean(reason || 'See judge notes'),
              point_value: deduction,
              body_part: 'multiple',
              severity: deduction <= 0.10 ? 'small' : deduction <= 0.20 ? 'medium' : 'large'
            }] : [],
            strength_note: deduction === 0 ? 'Clean execution' : ''
          });
        }
      }
    }
  }

  // Extract why_this_score from Truth Analysis section
  const truthMatch = rawText.match(/TRUTH ANALYSIS[:\s\n]+(.{20,500}?)(?=\n\s*\n|\n\d+\.|$)/is);
  const whyScore = truthMatch ? clean(truthMatch[1]) :
    `${profile.level} routine with typical deduction profile.`;

  // Extract duration if mentioned
  const durMatch = rawText.match(/duration[:\s]+(\d+)\s*(?:seconds|sec|s)/i);
  const duration = durMatch ? parseInt(durMatch[1]) : 90;

  log.info("parser", `NL parsed: ${skills.length} skills, ${artistry.deductions.length} artistry, ${composition.deductions.length} composition, ${celebrations.length} celebrations`);

  return {
    apparatus: event,
    duration_seconds: duration,
    skills,
    artistry,
    composition,
    neutral_deductions: neutralDeductions,
    why_this_score: whyScore,
    celebrations: celebrations.slice(0, 3),
    raw_gemini_response: rawText
  };
}

function countDeductions(pass1) {
  let count = 0;
  for (const s of (pass1.skills || [])) count += (s.deductions || []).length;
  count += (pass1.artistry?.deductions || []).length;
  count += (pass1.composition?.deductions || []).length;
  return count;
}
