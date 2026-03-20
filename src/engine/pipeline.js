/**
 * pipeline.js — 2-Pass Gemini analysis orchestrator.
 *
 * Pass 1: JUDGING — Brevet judge watches video, identifies skills,
 *   grades each one, logs deductions, celebrates excellence.
 * Pass 2: BIOMECHANICS — Enriches each skill with joint angles,
 *   injury awareness, drills, correct form, gain-if-fixed.
 *
 * Score: Code-validated from Pass 1 deductions (corrected if off by >0.10).
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
import { validatePipelineResult, snapToUSAG, gradeFromQuality, parseTimestamp } from "./schema";
import { transformForUI } from "./transform";

// ─── Structured logging ─────────────────────────────────────────────────────

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
    return cached;
  }

  // ── Verify server has API key ───────────────────────────────────────────
  try {
    await geminiProxy({ action: "pollFile", fileName: "files/__healthcheck__" });
  } catch (e) {
    if (e.message.includes("not configured")) {
      throw new Error("Server API key not configured. Contact the administrator.");
    }
  }

  // ── Upload video ──────────────────────────────────────────────────────────
  onProgress({ stage: "upload", pct: 10, label: "Uploading video..." });
  const fileRef = await uploadVideo(videoFile, (pct) => {
    onProgress({ stage: "upload", pct: 10 + Math.floor(pct * 0.25), label: "Uploading video..." });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // PASS 1: JUDGING — Skills, deductions, grades, celebrations, coaching
  // ══════════════════════════════════════════════════════════════════════════
  onProgress({ stage: "pass1", pct: 40, label: "Judging routine — identifying skills and deductions..." });
  const { system: sys1, user: usr1 } = buildPass1Prompt(profile, event);
  log.info("pass1", `Prompt: ${usr1.length} chars | Level: ${profile.level} | Event: ${event}`);

  let pass1Raw;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      pass1Raw = await callGemini(fileRef, sys1, usr1, PASS1_CONFIG, "pass1");
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

  const scorecard = parseJSON(pass1Raw, "pass1");
  log.info("pass1", `Scorecard: ${scorecard.deduction_log?.length || 0} skills, ` +
    `final_score: ${scorecard.final_score}, confidence: ${scorecard.confidence}`);

  // Store raw response for diagnostics
  const rawGeminiResponse = pass1Raw;

  if (!scorecard.deduction_log || scorecard.deduction_log.length === 0) {
    throw new Error("Pass 1 found no skills in the video.");
  }

  onProgress({ stage: "pass1", pct: 60, label: `Found ${scorecard.deduction_log.length} skills — analyzing biomechanics...` });

  // ══════════════════════════════════════════════════════════════════════════
  // PASS 2: BIOMECHANICS — Joint angles, drills, injury, correct form
  // ══════════════════════════════════════════════════════════════════════════
  onProgress({ stage: "pass2", pct: 65, label: "Analyzing biomechanics and building training plan..." });
  const { system: sys2, user: usr2 } = buildPass2Prompt(scorecard, profile, event);
  log.info("pass2", `Prompt: ${usr2.length} chars`);

  let pass2Result = null;
  try {
    const pass2Raw = await callGemini(fileRef, sys2, usr2, PASS2_CONFIG, "pass2");
    pass2Result = parseJSON(pass2Raw, "pass2");
    log.info("pass2", `Enriched ${(pass2Result.skill_details || []).length} skills with biomechanics`);
  } catch (e) {
    // Pass 2 failure is non-fatal — we still have full scores from Pass 1
    log.warn("pass2", `Failed (non-fatal): ${e.message}. Proceeding with Pass 1 data only.`);
  }

  onProgress({ stage: "scoring", pct: 85, label: "Computing score..." });

  // ── Merge Pass 1 + Pass 2 ────────────────────────────────────────────────
  const mergedSkills = mergeSkills(scorecard, pass2Result);

  // ── Validate score (code-computed vs Gemini) ──────────────────────────────
  const executionDeductions = scorecard.deduction_log.reduce(
    (sum, e) => sum + Math.abs(e.deduction_value || 0), 0
  );
  const srPenalties = (scorecard.special_requirements || []).reduce(
    (sum, sr) => sum + Math.abs(sr.penalty || 0), 0
  );
  const artDeductions = Math.abs(scorecard.artistry?.total_artistry_deduction || 0);
  const totalDeductions = executionDeductions + srPenalties + artDeductions;
  const startValue = scorecard.start_value || 10.0;
  const codeComputedScore = Math.max(0, Math.round((startValue - totalDeductions) * 100) / 100);

  let finalScore = scorecard.final_score;
  if (Math.abs(finalScore - codeComputedScore) > 0.10) {
    log.warn("score", `Correcting Gemini score ${finalScore} → ${codeComputedScore} (diff: ${Math.abs(finalScore - codeComputedScore).toFixed(2)})`);
    finalScore = codeComputedScore;
  }

  const detectedEvent = scorecard.event || event;

  log.info("score", `FINAL: ${finalScore} | SV: ${startValue} | Exec: -${executionDeductions.toFixed(2)} | Art: -${artDeductions.toFixed(2)} | SR: -${srPenalties.toFixed(2)} | Skills: ${mergedSkills.length}`);

  // ── Assemble pipeline result ────────────────────────────────────────────
  const pipelineResult = {
    routine_summary: {
      apparatus: detectedEvent,
      duration_seconds: 0,
      d_score: startValue,
      e_score: Math.max(0, 10.0 - totalDeductions),
      final_score: finalScore,
      neutral_deductions: 0,
      level: profile.level || "",
      athlete_name: profile.name || "",
      coaching_summary: scorecard.coaching_summary || "",
      celebrations: scorecard.celebrations || [],
      top_3_fixes: scorecard.top_3_fixes || [],
      artistry: scorecard.artistry || null,
      confidence: scorecard.confidence || "MEDIUM",
      score_range: scorecard.score_range || null,
      raw_gemini_response: rawGeminiResponse,
    },
    skills: mergedSkills,
    special_requirements: scorecard.special_requirements || [],
    training_plan: [],
    mental_performance: { consistency_score: 0, focus_indicators: "", patterns_observed: "", recommendations: "" },
    nutrition_recovery: { training_load_assessment: "", nutrition_note: "", recovery_priority: "" },
    _meta: {
      prompt_version: PROMPT_VERSION,
      timestamp: Date.now(),
      duration_ms: Date.now() - startTime,
      model: "gemini-2.5-flash",
      pass1_skills: scorecard.deduction_log?.length || 0,
      pass2_success: !!pass2Result,
      score_breakdown: {
        start_value: startValue,
        execution_deductions: executionDeductions,
        artistry_deductions: artDeductions,
        sr_penalties: srPenalties,
        total_deductions: totalDeductions,
        gemini_score: scorecard.final_score,
        code_computed_score: codeComputedScore,
        final_score: finalScore,
      },
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

  // Step 1: Ask server to initiate resumable upload
  const { uploadUrl } = await geminiProxy({
    action: "initUpload",
    displayName: "routine_" + Date.now(),
    fileSize: videoFile.size,
    mimeType,
  });

  // Step 2: Upload bytes via /goog-upload proxy to avoid CORS
  // Both dev (setupProxy.js) and production (vercel.json rewrite) handle this proxy
  const finalUploadUrl = uploadUrl.includes("generativelanguage.googleapis.com")
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

  // Step 3: Poll until ACTIVE
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


// ─── Merge Pass 1 (Scorecard) + Pass 2 (Biomechanics) ──────────────────────

function mergeSkills(scorecard, pass2Result) {
  const skillDetails = pass2Result?.skill_details || [];

  return (scorecard.deduction_log || []).map((entry, i) => {
    // Find matching Pass 2 enrichment by skill name or timestamp
    const enrichment = skillDetails.find(sd =>
      sd.skill_name === entry.skill ||
      sd.timestamp === entry.timestamp
    ) || {};

    const deductionValue = snapToUSAG(Math.abs(entry.deduction_value || 0));
    const qualityGrade = typeof entry.quality_grade === "number" ? entry.quality_grade : (10.0 - deductionValue);
    const gradeInfo = gradeFromQuality(qualityGrade);

    return {
      id: `skill_${i + 1}`,
      skill_name: entry.skill || "Unknown",
      timestamp: entry.timestamp || "0:00",
      timestamp_end: enrichment.timestamp_end || null,
      timestamp_seconds: parseTimestamp(entry.timestamp),
      quality_grade: qualityGrade,
      deduction_value: deductionValue,
      reason: entry.reason || "",
      rule_reference: entry.rule_reference || "",
      is_celebration: !!entry.is_celebration,
      // Grade (computed from quality_grade)
      grade_letter: gradeInfo.grade,
      grade_label: gradeInfo.label,
      grade_color: gradeInfo.color,
      // Category from Pass 2 or inferred
      category: enrichment.category || inferCategory(entry.skill),
      // Pass 2 enrichment
      biomechanics: enrichment.biomechanics || [],
      fault_observed: enrichment.fault_observed || (deductionValue > 0 ? entry.reason : null),
      strength: enrichment.strength || (entry.is_celebration ? "Clean, well-executed skill" : null),
      correct_form: enrichment.correct_form || null,
      injury_awareness: enrichment.injury_awareness || [],
      targeted_drills: enrichment.targeted_drills || [],
      gain_if_fixed: enrichment.gain_if_fixed || (deductionValue > 0 ? deductionValue : 0),
    };
  });
}


// ─── Infer skill category from name ─────────────────────────────────────────

function inferCategory(skillName) {
  if (!skillName) return "ACRO";
  const s = skillName.toLowerCase();
  if (/mount|initial|opening|start/i.test(s)) return "MOUNT";
  if (/dismount|flyaway|salto.*off/i.test(s)) return "DISMOUNT";
  if (/turn|pivot|spin/i.test(s)) return "TURN";
  if (/leap|jump|sissonne|split.*jump/i.test(s)) return "LEAP";
  if (/dance|passage|choreograph|floor.*work|pose/i.test(s)) return "DANCE";
  if (/series|connect/i.test(s)) return "SERIES";
  if (/walk|transition/i.test(s)) return "TRANSITION";
  return "ACRO";
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
