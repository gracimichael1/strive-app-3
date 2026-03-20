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
      if (pass1Raw && pass1Raw.length > 100 && pass1Raw.includes('"skills"')) break;
      log.warn("pass1", `Attempt ${attempt}: short or missing skills (${pass1Raw?.length} chars)`);
      if (attempt < 2) await delay(2000);
    } catch (e) {
      log.warn("pass1", `Attempt ${attempt} failed: ${e.message}`);
      if (attempt === 2) throw e;
      await delay(2000);
    }
  }

  if (!pass1Raw) throw new Error("Pass 1 returned empty response.");

  const pass1Parsed = parseJSON(pass1Raw, "pass1");
  if (!pass1Parsed.skills || pass1Parsed.skills.length === 0) {
    throw new Error("Pass 1 found no skills in the video.");
  }

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
  const uploadRes = await fetch(uploadUrl, {
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

function countDeductions(pass1) {
  let count = 0;
  for (const s of (pass1.skills || [])) count += (s.deductions || []).length;
  count += (pass1.artistry?.deductions || []).length;
  count += (pass1.composition?.deductions || []).length;
  return count;
}
