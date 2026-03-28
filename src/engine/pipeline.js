/**
 * pipeline.js — 2-Pass Gemini analysis orchestrator.
 *
 * Pass 1: JUDGING — Certified USAG judge watches video, identifies skills,
 *   grades each one, logs per-skill deductions with body part detail,
 *   timestamps, difficulty values, celebrations, coaching summary.
 *
 * Pass 2: DEEP ANALYSIS — Team of specialists enriches each skill with
 *   biomechanics (joint angles, body line, efficiency), injury risk,
 *   elite comparison, corrective drill, plus routine-level training plan,
 *   mental performance assessment, and nutrition note.
 *
 * Score: Code-computed from Pass 1 deductions (Deliverable 3).
 *   AI identifies faults. Code computes the math. Never trust AI final scores.
 *
 * SECURITY: All Gemini API calls route through /api/gemini server proxy.
 * The API key NEVER reaches the browser.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * Integration: Call runAnalysisPipeline() from AnalyzingScreen.
 * This function replaces analyzeWithAI() — same inputs, richer output.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { buildPass1Prompt, buildPass2Prompt, buildCompactPrompt, PASS1_CONFIG, PASS2_CONFIG, COMPACT_CONFIG, PROMPT_VERSION } from "./prompts";
import { validatePipelineResult, snapToUSAG, gradeFromQuality, parseTimestamp, formatTimestamp, emptyBiomechanics, emptyInjuryRisk, emptyCorrectiveDrill } from "./schema";
import { computeScoreFromScorecard, crossValidateBiomechanics, SCORING_VERSION } from "./scoring";
import { detectInjurySignals } from "./injuryDetection";
import { transformForUI } from "./transform";
import { compressVideo, needsCompression, formatMB } from "./videoCompressor";
import { serializeLandmarksForPrompt } from "./landmarkSerializer";
import { pruneOldAnalyses } from "../utils/helpers";

// ─── Analysis metadata — version traceability for calibration ────────────────
const ANALYSIS_METADATA = {
  prompt_version: PROMPT_VERSION,
  model_name: 'gemini-2.5-flash',
  scoring_version: SCORING_VERSION,
  calibration_dataset: 'nawgj-v1',
  pipeline_version: '2.0',
  timestamp: null, // Set at runtime
};

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
const STRIVE_TOKEN = process.env.REACT_APP_STRIVE_TOKEN || "";

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
    const error = new Error(err.error || `Server error (${res.status})`);
    try { const { captureGeminiError } = require("../utils/monitoring"); captureGeminiError(error, body.action); } catch {}
    throw error;
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
export async function runAnalysisPipeline({ videoFile, profile, event, tier, gymnastSelection = null, onProgress = () => {}, onPass2Complete }) {
  const startTime = Date.now();

  if (!videoFile) throw new Error("No video file provided.");

  // ── Mobile diagnostics ─────────────────────────────────────────────────
  const isMobile = typeof navigator !== 'undefined' && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  console.log('[mobile-diag] userAgent:', typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A');
  console.log('[mobile-diag] video file:', { name: videoFile.name, size: videoFile.size, type: videoFile.type, lastModified: videoFile.lastModified });
  console.log('[mobile-diag] isMobile:', isMobile);
  console.log('[mobile-diag] online:', typeof navigator !== 'undefined' ? navigator.onLine : 'N/A');

  // ── Mobile file size guard — 300MB limit ───────────────────────────────
  if (isMobile && videoFile.size > 300 * 1024 * 1024) {
    throw new Error("This video is too large for mobile analysis. Please trim it to under 3 minutes in your Photos app and try again.");
  }

  // ── File type validation ────────────────────────────────────────────────
  if (videoFile.type && !videoFile.type.startsWith('video/')) {
    throw new Error("Please upload a video file (MP4, MOV, or WebM).");
  }

  // ── Video length gate: reject < 3 seconds or > 5 minutes ─────────────
  try {
    const duration = await getVideoDuration(videoFile);
    if (duration < 3) {
      throw new Error("This video is too short. Routines should be at least 3 seconds long.");
    }
    if (duration > 300) {
      const mins = Math.ceil(duration / 60);
      throw new Error(`This video is ${mins} minutes long. STRIVE works best with routines under 5 minutes. Please trim to just the routine and try again.`);
    }
  } catch (e) {
    if (e.message.includes("minutes long") || e.message.includes("too short")) throw e;
    // Duration check failed (e.g. unsupported format) — proceed anyway
    log.warn("gate", `Could not check video duration: ${e.message}`);
  }

  // ── Session cache — check before re-analyzing same video ──────────────────
  // Uses sessionStorage (cleared on tab close) — no PII persisted across sessions.
  const cacheKey = `strive_session_${videoFile.name}_${videoFile.size}_${profile.level || ''}_${event}`;
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      log.info("cache", "Session cache hit — returning cached result");
      onProgress({ stage: "complete", pct: 100, label: "Analysis complete! (cached)" });
      return parsed;
    }
  } catch { /* cache miss — continue with fresh analysis */ }

  // ── Compress video if needed ──────────────────────────────────────────────
  let fileToUpload = videoFile;
  let compressionStats = null;

  if (needsCompression(videoFile)) {
    onProgress({ stage: "compress", pct: 5, label: "Optimizing video..." });
    try {
      const result = await compressVideo(videoFile, (pct) => {
        // Compression gets 0-10% of the overall progress bar
        onProgress({ stage: "compress", pct: Math.round(pct * 0.10), label: "Optimizing video..." });
      });

      fileToUpload = new File(
        [result.blob],
        `compressed_${videoFile.name.replace(/\.[^.]+$/, '')}.${result.mimeType.includes('mp4') ? 'mp4' : 'webm'}`,
        { type: result.mimeType }
      );

      compressionStats = result;
      log.info("compress", `${result.originalMB.toFixed(1)}MB → ${result.compressedMB.toFixed(1)}MB (${result.reductionPct}% reduction)`);

      onProgress({
        stage: "compress",
        pct: 10,
        label: `Optimized — ${formatMB(videoFile.size)} → ${formatMB(result.blob.size)}`,
      });

      // Brief pause to show the user the result
      await delay(1200);

    } catch (compressionError) {
      if (compressionError.message === 'IOS_TOO_LARGE') {
        throw new Error(
          'This video is too large for quick analysis on iPhone. ' +
          'Please trim it to just the routine (under 2 minutes) ' +
          'and try again. Most routines are 60–90 seconds.'
        );
      }
      // Compression failed — fall back to original file silently
      log.warn("compress", `Compression failed, using original: ${compressionError.message}`);
      fileToUpload = videoFile;
    }
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
  onProgress({ stage: "upload", pct: 12, label: "Uploading video..." });
  const fileRef = await uploadVideo(fileToUpload, (pct) => {
    onProgress({ stage: "upload", pct: 12 + Math.floor(pct * 0.23), label: "Uploading video..." });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // PASS 1: JUDGING — Skills, deductions (per-skill), grades, celebrations
  // ══════════════════════════════════════════════════════════════════════════
  onProgress({ stage: "pass1", pct: 40, label: "Judging routine — identifying skills and deductions..." });
  const { system: sys1, user: usr1 } = buildPass1Prompt(profile, event, gymnastSelection);
  console.log("DIAGNOSTIC: PIPELINE EVENT:", event, "| LEVEL:", profile.level, "| LEVEL_CATEGORY:", profile.levelCategory);
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

  let scorecard;
  let rawGeminiResponse = pass1Raw;

  try {
    scorecard = parseJSON(pass1Raw, "pass1");
  } catch (parseErr) {
    // ── Compact prompt retry — full response may have been truncated ──
    log.warn("pass1", `Full prompt parse failed (${pass1Raw?.length} chars). Retrying with compact prompt...`);
    onProgress({ stage: "pass1", pct: 55, label: "Retrying with optimized prompt..." });

    try {
      const { system: compSys, user: compUsr } = buildCompactPrompt(profile, event, gymnastSelection);
      const compactRaw = await callGemini(fileRef, compSys, compUsr, COMPACT_CONFIG, "pass1-compact");
      scorecard = parseJSON(compactRaw, "pass1-compact");
      rawGeminiResponse = compactRaw;
      log.info("pass1", `Compact retry succeeded: ${scorecard.deduction_log?.length || 0} skills`);
    } catch (retryErr) {
      // Both attempts failed — throw the original parse error
      log.error("pass1", `Compact retry also failed: ${retryErr.message}`);
      throw parseErr;
    }
  }

  log.info("pass1", `Scorecard: ${scorecard.deduction_log?.length || 0} skills, ` +
    `final_score: ${scorecard.final_score}, confidence: ${scorecard.confidence}`);

  if (!scorecard.deduction_log || scorecard.deduction_log.length === 0) {
    throw new Error("Pass 1 found no skills in the video.");
  }

  // ── Validate and sanitize deduction_log ─────────────────────────────────
  scorecard.deduction_log = validateDeductionLog(scorecard.deduction_log);

  onProgress({ stage: "scoring", pct: 70, label: `Found ${scorecard.deduction_log.length} skills — computing score...` });

  // ══════════════════════════════════════════════════════════════════════════
  // SCORE COMPUTATION — Code computes, never trust AI (Deliverable 3)
  // ══════════════════════════════════════════════════════════════════════════
  const isElite = /elite/i.test(profile.level || "");
  const startValue = scorecard.start_value || 10.0;
  const detectedEvent = scorecard.event || event;
  const scoring = computeScoreFromScorecard(scorecard, startValue, { isElite, event: detectedEvent });

  if (scoring.warning) {
    log.warn("score", scoring.warning);
  }

  const finalScore = scoring.final_score;

  log.info("score", `FINAL: ${finalScore} | D: ${scoring.d_score} | E: ${scoring.e_score} | ` +
    `Exec: -${scoring.execution_total} (raw: ${scoring.calibration.raw_execution}, factor: ${scoring.calibration.factor}) | ` +
    `Art: -${scoring.artistry_total} | SR: -${scoring.sr_total} | ` +
    `Skills: ${scorecard.deduction_log.length} | AI said: ${scorecard.final_score} (diff: ${scoring.score_diff})`);

  // ── Resolve tier early — needed for landmark extraction gate + Pass 2 ────
  const effectiveTier = tier || (() => { try { return localStorage.getItem("strive-tier") || "free"; } catch { return "free"; } })();

  // ── MediaPipe landmark extraction (runs in background, ready for Pass 2) ──
  // Uses the compressed/original video file — separate from Gemini File API path.
  // If extraction fails, landmarkData stays null and Pass 2 works without it.
  let landmarkData = null;
  const landmarkPromise = (() => {
    if (effectiveTier === 'free') return Promise.resolve(null);
    return serializeLandmarksForPrompt(fileToUpload, null, gymnastSelection).then(data => {
      landmarkData = data;
      if (data) {
        log.info("landmarks", `Extracted ${data.metadata.valid_frames}/${data.metadata.total_frames_extracted} frames, ` +
          `${data.metadata.frames_in_prompt} in prompt (${data.metadata.extraction_ms}ms)`);
      } else {
        log.warn("landmarks", "No valid landmark frames extracted");
      }
      return data;
    }).catch(e => {
      log.warn("landmarks", `Landmark extraction failed (non-fatal): ${e.message}`);
      return null;
    });
  })();

  // ── Wait for landmark extraction before measuring biomechanics ────────────
  // landmarkPromise runs in parallel with Pass 1. Now that Pass 1 is done,
  // wait for landmarks so we have real angle data for biomechanics + injury detection.
  await landmarkPromise;

  // ── Measure biomechanics per skill from landmark data ─────────────────────
  const measuredBiomechanics = measureSkillBiomechanics(scorecard.deduction_log || [], landmarkData);
  if (measuredBiomechanics.some(b => b !== null)) {
    log.info("biomechanics", `Measured angles for ${measuredBiomechanics.filter(b => b !== null).length}/${measuredBiomechanics.length} skills`);
  }

  // ── Cross-validate Gemini deductions against measured angles ─────────────
  const biomechanicsFlags = crossValidateBiomechanics(scorecard.deduction_log || [], measuredBiomechanics);
  if (biomechanicsFlags.length > 0) {
    log.info("crossval", `${biomechanicsFlags.length} biomechanics cross-validation flags:`, biomechanicsFlags);
  }

  // ── Angle-based injury detection from measured biomechanics ────────────────
  const injurySignals = detectInjurySignals(scorecard.deduction_log || [], measuredBiomechanics);
  if (injurySignals.summary.total_signals > 0) {
    log.info("injury", `${injurySignals.summary.total_signals} injury signals detected:`, injurySignals.summary.areas);
  }

  // ── Build pass1-only result (no biomechanics yet) ────────────────────────
  const pass1Skills = mergeSkills(scorecard, null, measuredBiomechanics, injurySignals.per_skill);

  function buildPipelineResult(skills, pass2Result) {
    return {
      routine_summary: {
        apparatus: detectedEvent,
        duration_seconds: scorecard.duration_seconds || 0,
        d_score: scoring.d_score,
        e_score: scoring.e_score,
        final_score: finalScore,
        total_deductions: scoring.total,
        neutral_deductions: 0,
        level: profile.level || "",
        level_estimated: scorecard.level || "",
        athlete_name: profile.name || "",
        coaching_summary: scorecard.coaching_summary || "",
        celebrations: scorecard.celebrations || [],
        top_3_fixes: scorecard.top_3_fixes || [],
        artistry: scorecard.artistry || null,
        confidence: scorecard.confidence || "MEDIUM",
        score_range: scorecard.score_range || null,
        raw_gemini_response: rawGeminiResponse,
      },
      skills,
      special_requirements: scorecard.special_requirements || [],
      training_plan: pass2Result?.training_plan || [],
      mental_performance: pass2Result?.mental_performance || {
        focus_indicators: "",
        consistency_patterns: "",
        athlete_recommendations: "",
      },
      nutrition_note: pass2Result?.nutrition_note || "",
      injury_signals_measured: injurySignals.summary.total_signals > 0 ? {
        routine_level: injurySignals.routine_level,
        summary: injurySignals.summary,
      } : null,
      levelProgressionAnalysis: scorecard.levelProgressionAnalysis || null,
      primary_athlete_confidence: scorecard.primary_athlete_confidence || "high",
      sv_verified: !!scorecard.sv_verified,
      _meta: {
        prompt_version: PROMPT_VERSION,
        timestamp: Date.now(),
        duration_ms: Date.now() - startTime,
        model: "gemini-2.5-flash",
        pass1_skills: scorecard.deduction_log?.length || 0,
        pass2_success: !!pass2Result,
        landmarks_injected: !!landmarkData,
        landmark_frames: landmarkData?.metadata?.frames_in_prompt || 0,
        score_breakdown: {
          start_value: startValue,
          d_score: scoring.d_score,
          e_score: scoring.e_score,
          execution_deductions: scoring.execution_total,
          artistry_deductions: scoring.artistry_total,
          sr_penalties: scoring.sr_total,
          total_deductions: scoring.total,
          d_score_from_skills: scoring.d_score_from_skills,
          gemini_score: scorecard.final_score,
          code_computed_score: finalScore,
          final_score: finalScore,
          score_diff: scoring.score_diff,
          warning: scoring.warning,
          sanity_warnings: scoring.sanity_warnings || [],
        },
        biomechanics_cross_validation: biomechanicsFlags,
        measured_biomechanics: measuredBiomechanics.filter(b => b !== null).length > 0
          ? measuredBiomechanics : null,
        injury_signals: injurySignals.summary.total_signals > 0 ? injurySignals : null,
      },
      analysis_metadata: {
        ...ANALYSIS_METADATA,
        timestamp: new Date().toISOString(),
        calibration_factors: {
          event: detectedEvent,
          factor: scoring.calibration?.factor,
        },
      },
    };
  }

  // ── Validate + transform pass1 result ─────────────────────────────────────
  const pass1PipelineResult = buildPipelineResult(pass1Skills, null);
  const { result: validated, warnings } = validatePipelineResult(pass1PipelineResult);
  if (warnings.length > 0) {
    log.warn("validate", `${warnings.length} warnings:`, warnings);
  }
  const uiResult = transformForUI(validated);

  // ── Session cache write — fast reload of same video ─────────────────────
  try { sessionStorage.setItem(cacheKey, JSON.stringify(uiResult)); } catch {}

  // ── Prune old analyses if localStorage is getting full ─────────────────
  try { pruneOldAnalyses(); } catch {}

  // ── Log training data (fire and forget) ────────────────────────────────
  try {
    logTrainingData({
      videoId: videoFile.name || "unknown",
      event: detectedEvent,
      level: profile.level || "",
      aiScore: finalScore,
      promptVersion: PROMPT_VERSION,
      calibrationFactor: scoring.calibration?.factor,
      rawExecution: scoring.calibration?.raw_execution,
      scaledExecution: scoring.calibration?.scaled_execution,
      skillCount: scorecard.deduction_log?.length || 0,
      landmarkMetadata: landmarkData?.metadata || null,
      landmarkFrames: landmarkData?.frames || null,
    });
  } catch (e) {
    log.warn("training", `Training data log failed: ${e.message}`);
  }

  onProgress({ stage: "complete", pct: 100, label: "Analysis complete!" });

  // ══════════════════════════════════════════════════════════════════════════
  // PASS 2: DEEP ANALYSIS — runs in BACKGROUND after pass1 results are shown
  // Biomechanics, injury, drills, mental, nutrition
  // Free tier: skip entirely (they can't see biomechanics)
  // ══════════════════════════════════════════════════════════════════════════
  if (effectiveTier !== 'free' && onPass2Complete) {
    // Fire and forget — never blocks the UI
    (async () => {
      try {
        // Wait for landmark extraction to complete before building Pass 2 prompt
        await landmarkPromise;
        log.info("pass2", `Starting background pass2 enrichment...${landmarkData ? ` (${landmarkData.metadata.frames_in_prompt} landmark frames)` : ' (no landmarks)'}`);
        const { system: sys2, user: usr2 } = buildPass2Prompt(scorecard, profile, event, landmarkData);
        const pass2Raw = await callGemini(fileRef, sys2, usr2, PASS2_CONFIG, "pass2");
        const pass2Result = parseJSON(pass2Raw, "pass2");
        log.info("pass2", `Enriched ${(pass2Result.skill_details || []).length} skills with biomechanics`);

        // Rebuild with enriched data
        const enrichedSkills = mergeSkills(scorecard, pass2Result, measuredBiomechanics, injurySignals.per_skill);
        const enrichedPipeline = buildPipelineResult(enrichedSkills, pass2Result);
        const { result: enrichedValidated } = validatePipelineResult(enrichedPipeline);
        const enrichedUI = transformForUI(enrichedValidated);

        // Update session cache with enriched result
        try { sessionStorage.setItem(cacheKey, JSON.stringify(enrichedUI)); } catch {}

        onPass2Complete(enrichedUI);
      } catch (e) {
        // Pass 2 failure is completely silent — pass1 results already displayed
        log.warn("pass2", `Background enrichment failed (non-fatal): ${e.message}`);
      } finally {
        // Cleanup uploaded file after pass2 completes (or fails)
        try { geminiProxy({ action: "deleteFile", fileName: fileRef.fileName }); } catch {}
      }
    })();
  } else {
    // Free tier or no pass2 callback — cleanup uploaded file now
    if (effectiveTier === 'free') {
      log.info("pass2", "Skipping pass2 — free tier");
    }
    try { geminiProxy({ action: "deleteFile", fileName: fileRef.fileName }); } catch {}
  }

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
  // Post-compression files are 10-25MB vs 150-800MB original — processing is much faster.
  // Poll until ACTIVE — mobile needs more time on cellular networks
  const isMobilePoll = typeof navigator !== 'undefined' && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  const maxPolls = isMobilePoll ? 45 : 30; // 90s mobile, 60s desktop
  for (let i = 0; i < maxPolls; i++) {
    await delay(2000);
    try {
      const { state } = await geminiProxy({ action: "pollFile", fileName });
      if (state === "ACTIVE") break;
      if (state === "FAILED") throw new Error("Video processing failed on server");
    } catch (e) {
      if (e.message.includes("failed")) throw e;
    }
    onProgress(Math.min(1, (i + 1) / 25));
    if (i === maxPolls - 1) throw new Error(`Video processing timed out (${isMobilePoll ? '90' : '60'}s). Try trimming your video to just the routine.`);
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

  // Debug storage — dev only, never in production
  if (process.env.NODE_ENV === 'development') {
    try { localStorage.setItem(`debug-gemini-${label}`, text); } catch {}
  }

  return text;
}


// ─── Merge Pass 1 (Scorecard) + Pass 2 (Deep Analysis) ─────────────────────

function mergeSkills(scorecard, pass2Result, measuredBio = null, injuryPerSkill = null) {
  const skillDetails = pass2Result?.skill_details || [];

  const norm = (s) => (s || "").trim().toLowerCase();

  return (scorecard.deduction_log || []).map((entry, i) => {
    // Find matching Pass 2 enrichment by skill name (case-insensitive) or timestamp
    const enrichment = skillDetails.find(sd =>
      norm(sd.skill_name) === norm(entry.skill_name) ||
      norm(sd.skill_name) === norm(entry.skill) ||
      (typeof sd.timestamp_start === "number" && sd.timestamp_start === entry.timestamp_start)
    ) || {};

    // Per-skill deductions array (new canonical shape)
    const deductions = Array.isArray(entry.deductions) ? entry.deductions.map(d => ({
      type: d.type || "execution",
      body_part: d.body_part || "",
      description: d.description || "",
      point_value: snapToUSAG(Math.abs(d.point_value || 0)),
    })) : [];

    const totalDeduction = deductions.length > 0
      ? deductions.reduce((sum, d) => sum + d.point_value, 0)
      : snapToUSAG(Math.abs(entry.total_deduction || entry.deduction_value || 0));

    const qualityGrade = typeof entry.quality_grade === "number"
      ? entry.quality_grade
      : (10.0 - totalDeduction);

    const gradeInfo = gradeFromQuality(qualityGrade);

    return {
      id: `skill_${i + 1}`,
      skill_name: entry.skill_name || entry.skill || "Unknown",
      skill_order: entry.skill_order || i + 1,
      timestamp: formatTimestamp(entry.timestamp_start) || entry.timestamp || "0:00",
      timestamp_start: entry.timestamp_start || parseTimestamp(entry.timestamp) || 0,
      timestamp_end: entry.timestamp_end || 0,
      executed_successfully: entry.fall_detected ? false : entry.executed_successfully !== false,
      fall_detected: !!entry.fall_detected,
      difficulty_value: entry.difficulty_value || 0.10,
      deduction_value: totalDeduction,
      deductions,
      narrative: entry.narrative || "",
      injury_signal: entry.injury_signal || "",
      skill_confidence: entry.skill_confidence || "high",
      quality_grade: qualityGrade,
      reason: entry.reason || "",
      rule_reference: entry.rule_reference || "",
      is_celebration: !!entry.is_celebration,
      strength_note: entry.strength_note || "",
      // Grade (computed from quality_grade)
      grade_letter: gradeInfo.grade,
      grade_label: gradeInfo.label,
      grade_color: gradeInfo.color,
      // Category from Pass 2 or inferred
      category: enrichment.category || inferCategory(entry.skill_name || entry.skill),
      // Pass 2 enrichment — canonical shapes
      biomechanics: enrichment.biomechanics || emptyBiomechanics(),
      injury_risk: enrichment.injury_risk || emptyInjuryRisk(),
      elite_comparison: enrichment.elite_comparison || "",
      corrective_drill: enrichment.corrective_drill || emptyCorrectiveDrill(),
      // Legacy compat fields
      fault_observed: deductions.length > 0 ? deductions.map(d => d.description).join("; ") : (entry.reason || null),
      strength: entry.strength_note || (entry.is_celebration ? "Clean, well-executed skill" : null),
      correct_form: enrichment.correct_form || null,
      injury_awareness: enrichment.injury_risk?.description
        ? [enrichment.injury_risk.description + (enrichment.injury_risk.prevention_note ? ` (${enrichment.injury_risk.prevention_note})` : "")]
        : [],
      targeted_drills: enrichment.corrective_drill?.name
        ? [`${enrichment.corrective_drill.name}: ${enrichment.corrective_drill.description} (${enrichment.corrective_drill.sets_reps})`]
        : [],
      gain_if_fixed: totalDeduction > 0 ? totalDeduction : 0,
      // Measured biomechanics from client-side MediaPipe (real angle data)
      biomechanics_measured: (measuredBio && measuredBio[i]) || null,
      // Angle-based injury signals from measured biomechanics
      injury_signals_measured: (injuryPerSkill && injuryPerSkill[i]) || [],
    };
  });
}


// ─── Biomechanics measurement: match landmark frames to skill windows ───────

/**
 * For each skill in the deduction log, find landmark frames that fall within
 * the skill's timestamp window and compute aggregate biomechanics.
 *
 * @param {Array} deductionLog - Skills with timestamp_start/timestamp_end
 * @param {Object|null} landmarkData - From serializeLandmarksForPrompt()
 * @returns {Array} Per-skill measured biomechanics (same order as deductionLog)
 */
function measureSkillBiomechanics(deductionLog, landmarkData) {
  if (!landmarkData || !landmarkData.frames || landmarkData.frames.length === 0) {
    return deductionLog.map(() => null);
  }

  const frames = landmarkData.frames;

  return deductionLog.map(skill => {
    const start = skill.timestamp_start || 0;
    const end = skill.timestamp_end || (start + 3); // default 3-second window

    // Find frames within the skill window
    const skillFrames = frames.filter(f =>
      f.timestamp_seconds >= start && f.timestamp_seconds <= end
    );

    if (skillFrames.length === 0) return null;

    // Compute aggregate angle stats across the skill window
    const kneeAngles = skillFrames
      .flatMap(f => [f.angles?.left_knee, f.angles?.right_knee])
      .filter(a => a != null);
    const hipAngles = skillFrames
      .flatMap(f => [f.angles?.left_hip, f.angles?.right_hip])
      .filter(a => a != null);
    const shoulderAngles = skillFrames
      .flatMap(f => [f.angles?.left_shoulder, f.angles?.right_shoulder])
      .filter(a => a != null);
    const trunkLeans = skillFrames
      .map(f => f.angles?.trunk_lean_from_vertical)
      .filter(a => a != null);
    const legSeps = skillFrames
      .map(f => f.angles?.leg_separation)
      .filter(a => a != null);

    const avg = arr => arr.length > 0 ? Math.round(arr.reduce((s, a) => s + a, 0) / arr.length * 10) / 10 : null;
    const min = arr => arr.length > 0 ? Math.round(Math.min(...arr) * 10) / 10 : null;
    const max = arr => arr.length > 0 ? Math.round(Math.max(...arr) * 10) / 10 : null;

    return {
      frames_analyzed: skillFrames.length,
      worstKneeAngle: min(kneeAngles),
      avgKneeAngle: avg(kneeAngles),
      avgHipAngle: avg(hipAngles),
      worstHipAngle: min(hipAngles),
      avgShoulderAngle: avg(shoulderAngles),
      maxTrunkLean: max(trunkLeans),
      avgLegSeparation: avg(legSeps),
      maxLegSeparation: max(legSeps),
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


// ─── Training data logging ──────────────────────────────────────────────────

function logTrainingData(data) {
  fetch("/api/scores", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Strive-Token": STRIVE_TOKEN,
    },
    body: JSON.stringify(data),
  }).catch(() => {}); // Fire and forget
}


// ─── Helpers ────────────────────────────────────────────────────────────────

function getVideoDuration(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    const url = URL.createObjectURL(file);
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video.duration || 0);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read video metadata"));
    };
    video.src = url;
  });
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function parseJSON(raw, label) {
  const result = extractJSON(raw);
  if (!result) {
    log.error("parse", `[${label}] JSON parse failed. Raw (first 500 chars): ${(raw || "").substring(0, 500)}`);
    throw new Error('ANALYSIS_PARSE_FAILED');
  }
  return result;
}

/**
 * Hardened JSON extractor — handles all Gemini response formats:
 *   1. Raw JSON object
 *   2. Wrapped in ```json ... ``` markdown fences
 *   3. Wrapped in ``` ... ``` fences (no language tag)
 *   4. JSON embedded in prose text
 *   5. Truncated response — extract what's there
 *   6. Multiple JSON objects — take the largest
 */
function extractJSON(raw) {
  if (!raw || typeof raw !== 'string') return null;

  // ── Pass 1: Direct parse ─────────────────────────────
  try {
    const trimmed = raw.trim();
    if (trimmed.startsWith('{')) {
      return JSON.parse(trimmed);
    }
  } catch { /* continue */ }

  // ── Pass 2: Strip markdown fences ────────────────────
  try {
    // Handles ```json ... ``` and ``` ... ```
    const fenceMatch = raw.match(
      /```(?:json)?\s*\n?([\s\S]*?)\n?```/
    );
    if (fenceMatch?.[1]) {
      return JSON.parse(fenceMatch[1].trim());
    }
  } catch { /* continue */ }

  // ── Pass 3: Find first { ... } block ─────────────────
  try {
    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const candidate = raw.slice(firstBrace, lastBrace + 1);
      return JSON.parse(candidate);
    }
  } catch { /* continue */ }

  // ── Pass 4: Largest JSON block in response ────────────
  // Gemini sometimes wraps multiple blocks — find the biggest
  try {
    const blocks = [];
    let depth = 0;
    let start = -1;
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] === '{') {
        if (depth === 0) start = i;
        depth++;
      } else if (raw[i] === '}') {
        depth--;
        if (depth === 0 && start !== -1) {
          blocks.push(raw.slice(start, i + 1));
          start = -1;
        }
      }
    }
    // Sort by length — largest block is most likely the full response
    blocks.sort((a, b) => b.length - a.length);
    for (const block of blocks) {
      try { return JSON.parse(block); } catch { /* try next */ }
    }
  } catch { /* continue */ }

  // ── Pass 5: Truncated JSON — attempt repair ───────────
  // If response was cut off, try closing open structures
  try {
    const firstBrace = raw.indexOf('{');
    if (firstBrace !== -1) {
      let partial = raw.slice(firstBrace);
      // Count unclosed braces and brackets
      let braces = 0, brackets = 0;
      let inString = false, escape = false;
      for (const ch of partial) {
        if (escape) { escape = false; continue; }
        if (ch === '\\') { escape = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === '{') braces++;
        if (ch === '}') braces--;
        if (ch === '[') brackets++;
        if (ch === ']') brackets--;
      }
      // Close open structures
      // Remove trailing incomplete key-value pair
      partial = partial.replace(/,\s*"[^"]*"\s*:\s*[^,}\]]*$/, '');
      partial = partial.replace(/,\s*"[^"]*"\s*$/, '');
      // Close brackets and braces
      partial += ']'.repeat(Math.max(0, brackets));
      partial += '}'.repeat(Math.max(0, braces));
      return JSON.parse(partial);
    }
  } catch { /* pass 5 failed */ }

  // ── Pass 6: Schema-aware truncation recovery (Pass 2 responses) ──
  // Pass 2 schema: { skill_details: [...], training_plan: [...], mental_performance: {...}, nutrition_note: "..." }
  // When Gemini truncates mid-string inside skill_details, find last complete skill object and stub the rest.
  try {
    const firstBrace = raw.indexOf('{');
    if (firstBrace !== -1 && raw.includes('skill_details')) {
      let partial = raw.slice(firstBrace);
      // Find the last complete object boundary inside skill_details: }, or },\n
      const lastCompleteObj = partial.lastIndexOf('},');
      if (lastCompleteObj > 0) {
        let repaired = partial.slice(0, lastCompleteObj + 1); // up to and including the }
        repaired += ']'; // close skill_details array
        // Stub remaining top-level fields with safe defaults
        repaired += ', "training_plan": [], "mental_performance": {}, "nutrition_note": ""';
        repaired += '}'; // close outer object
        const result = JSON.parse(repaired);
        console.log('[extractJSON] Pass 6 truncation recovery succeeded —', (result.skill_details?.length || 0), 'skills recovered');
        return result;
      }
    }
  } catch { /* pass 6 failed */ }

  // ── All passes failed ─────────────────────────────────
  console.error('[extractJSON] All 6 passes failed. Raw preview:',
    raw.slice(0, 200));
  return null;
}


// ═══════════════════════════════════════════════════════════════════════════════
// DEDUCTION LOG VALIDATION — reject aggregates, enforce per-skill structure
// ═══════════════════════════════════════════════════════════════════════════════

const VALID_DEDUCTION_AMOUNTS = new Set([0.05, 0.10, 0.20, 0.30, 0.50]);
const AGGREGATE_NAMES = /^(execution|composition|artistry|dynamics|form|musicality|footwork|total|neutral|penalties|deductions?)$/i;

function snapDeductionAmount(val) {
  // Convert string ranges like "0.05-0.10" to midpoint, then snap
  if (typeof val === 'string') {
    if (val.includes('-')) {
      const parts = val.split('-').map(p => parseFloat(p.trim()));
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        val = (parts[0] + parts[1]) / 2;
      } else {
        val = parseFloat(val);
      }
    } else {
      val = parseFloat(val);
    }
  }
  if (typeof val !== 'number' || isNaN(val)) return 0.10; // default
  val = Math.abs(val);
  // Snap to nearest valid amount
  let best = 0.10;
  let bestDist = Infinity;
  for (const v of VALID_DEDUCTION_AMOUNTS) {
    const dist = Math.abs(val - v);
    if (dist < bestDist) { bestDist = dist; best = v; }
  }
  return best;
}

function validateDeductionLog(deductionLog) {
  const MAX_DEDUCTIONS_PER_SKILL = 3;
  const validated = [];
  let rejectedCount = 0;

  for (const entry of deductionLog) {
    const name = entry.skill_name || entry.skill || '';

    // Reject aggregate entries (no real skill name)
    if (AGGREGATE_NAMES.test(name.trim())) {
      console.warn(`[validateDeductionLog] REJECTED aggregate entry: "${name}" (total_deduction: ${entry.total_deduction || entry.deduction_value || '?'})`);
      rejectedCount++;
      continue;
    }

    // Validate and cap per-skill deductions array
    if (Array.isArray(entry.deductions) && entry.deductions.length > 0) {
      // Snap all amounts to valid values
      for (const d of entry.deductions) {
        d.point_value = snapDeductionAmount(d.point_value);
      }

      // Cap at MAX_DEDUCTIONS_PER_SKILL — keep largest
      if (entry.deductions.length > MAX_DEDUCTIONS_PER_SKILL) {
        console.warn(`[validateDeductionLog] Capped "${name}" from ${entry.deductions.length} to ${MAX_DEDUCTIONS_PER_SKILL} deductions`);
        entry.deductions.sort((a, b) => (b.point_value || 0) - (a.point_value || 0));
        entry.deductions = entry.deductions.slice(0, MAX_DEDUCTIONS_PER_SKILL);
      }

      // Recompute total_deduction from validated deductions
      entry.total_deduction = entry.deductions.reduce((sum, d) => sum + (d.point_value || 0), 0);
    } else if (entry.total_deduction || entry.deduction_value) {
      // Has a total but no per-skill array — snap the total
      const rawTotal = Math.abs(entry.total_deduction || entry.deduction_value || 0);
      entry.total_deduction = snapDeductionAmount(rawTotal);
    }

    validated.push(entry);
  }

  if (rejectedCount > 0) {
    console.warn(`[validateDeductionLog] Rejected ${rejectedCount} aggregate entries, kept ${validated.length} per-skill entries`);
  }

  return validated;
}
