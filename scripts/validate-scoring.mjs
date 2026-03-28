#!/usr/bin/env node
/**
 * validate-scoring.mjs — Scoring Validation Harness
 *
 * Validates Strive scoring accuracy against known judge scores.
 * Reads from pipeline-a/output/json/ (ground truth data) and compares
 * against our code-computed scores.
 *
 * Usage:
 *   node scripts/validate-scoring.mjs                     # Run full validation
 *   node scripts/validate-scoring.mjs --event floor       # Filter by event
 *   node scripts/validate-scoring.mjs --threshold 0.30    # Custom delta threshold
 *   node scripts/validate-scoring.mjs --verbose           # Show per-routine details
 *
 * Output:
 *   - Per-video delta (Strive score vs judge score)
 *   - Per-event aggregate stats (mean delta, std dev, correlation)
 *   - Overall accuracy metrics
 *   - Flags any video with delta > threshold (default 0.30)
 *   - Biomechanics cross-validation summary (if available)
 *
 * Inputs:
 *   - pipeline-a/output/json/*.json — ground truth with judge scores
 *   - Each file: { event, level, final_score, deduction_log, ... }
 *
 * Calibration integration:
 *   - Reads current EVENT_CALIBRATION from scoring.js
 *   - When --calibration-csv is provided, compares against new empirical factors
 */

import { readdir, readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const JSON_DIR = join(__dirname, '..', 'pipeline-a', 'output', 'json');
const REPORT_DIR = join(__dirname);

// ── Parse CLI args ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function getArg(name, defaultVal) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return defaultVal;
  return args[idx + 1] || defaultVal;
}
const filterEvent = getArg('event', null);
const deltaThreshold = parseFloat(getArg('threshold', '0.30'));
const verbose = args.includes('--verbose');
const calibrationCsv = getArg('calibration-csv', null);

// ── Current calibration factors (must match scoring.js) ───────────────────

const CURRENT_FACTORS = {
  vault: 1.34,
  bars: 0.50,
  beam: 0.68,
  floor: 0.82,
};

// ── Normalize event names ──────────────────────────────────────────────────

function normalizeEvent(event) {
  if (!event) return null;
  const e = String(event).toLowerCase().trim();
  if (e.includes('bar') || e === 'ub') return 'bars';
  if (e.includes('beam') || e === 'bb') return 'beam';
  if (e.includes('vault') || e === 'vt') return 'vault';
  if (e.includes('floor') || e === 'fx') return 'floor';
  return null;
}

// ── Load ground truth routines ─────────────────────────────────────────────

async function loadRoutines() {
  let files;
  try {
    files = await readdir(JSON_DIR);
  } catch {
    console.error(`ERROR: Cannot read ${JSON_DIR}`);
    console.error('Run pipeline-a/extract.mjs first to generate ground truth data.');
    console.error('Or provide ground truth JSON files in pipeline-a/output/json/');
    process.exit(1);
  }

  const jsonFiles = files.filter(f => f.endsWith('.json'));
  console.log(`Found ${jsonFiles.length} ground truth files`);

  const routines = [];
  for (const file of jsonFiles) {
    try {
      const data = JSON.parse(await readFile(join(JSON_DIR, file), 'utf-8'));
      if (typeof data.final_score !== 'number' || data.final_score <= 0) {
        if (verbose) console.log(`  Skip ${file}: no valid final_score`);
        continue;
      }
      routines.push({ ...data, _file: file });
    } catch (e) {
      console.warn(`  Skip ${file}: ${e.message}`);
    }
  }

  return routines;
}

// ── Simulate code-computed score from deduction log ────────────────────────

function simulateScore(routine) {
  const deductionLog = routine.deduction_log || routine.deductions || [];
  const event = normalizeEvent(routine.event);
  const startValue = routine.start_value || 10.0;
  const isElite = /elite/i.test(routine.level || '');

  // Sum execution deductions
  let executionTotal = 0;
  for (const skill of deductionLog) {
    if (Array.isArray(skill.deductions)) {
      for (const d of skill.deductions) {
        executionTotal += Math.abs(d.point_value || 0);
      }
    } else {
      executionTotal += Math.abs(skill.total_deduction || skill.deduction_value || 0);
    }
  }

  // Apply calibration factor
  const factor = (event && CURRENT_FACTORS[event]) || 0.90;
  const calibratedExecution = Math.round(executionTotal * factor * 1000) / 1000;

  // Two-sided bounds
  const execFloor = Math.round(executionTotal * 0.80 * 1000) / 1000;
  const execCeiling = Math.round(executionTotal * 1.50 * 1000) / 1000;
  const bounded = Math.max(execFloor, Math.min(execCeiling, calibratedExecution));

  // Artistry (capped at 0.50)
  const rawArtistry = Math.abs(routine.artistry?.deduction || 0);
  const artistry = Math.min(rawArtistry, 0.50);

  // D-score
  const dScore = isElite
    ? (routine.d_score || deductionLog.reduce((s, sk) => s + (sk.difficulty_value || 0), 0))
    : 0;

  const eScore = startValue - bounded - artistry;
  const finalScore = Math.round(Math.max(0, dScore + eScore) * 1000) / 1000;

  return {
    computed_score: finalScore,
    execution_total: executionTotal,
    calibrated_execution: bounded,
    calibration_factor: factor,
    artistry_deduction: artistry,
    skill_count: deductionLog.length,
    bounds_applied: bounded !== calibratedExecution,
  };
}

// ── Statistics helpers ─────────────────────────────────────────────────────

function mean(arr) {
  return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function stdDev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / arr.length);
}

function median(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function correlation(xs, ys) {
  if (xs.length < 2) return 0;
  const mx = mean(xs), my = mean(ys);
  const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
  const dx = Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0));
  const dy = Math.sqrt(ys.reduce((s, y) => s + (y - my) ** 2, 0));
  return dx > 0 && dy > 0 ? num / (dx * dy) : 0;
}

// ── Load calibration CSV (if provided) ─────────────────────────────────────

async function loadCalibrationFactors() {
  if (!calibrationCsv) return null;
  try {
    const raw = await readFile(calibrationCsv, 'utf-8');
    const lines = raw.trim().split('\n').slice(1); // skip header
    const factors = {};
    for (const line of lines) {
      const [event, factor] = line.split(',').map(s => s.trim());
      if (event && factor) {
        factors[event.toLowerCase()] = parseFloat(factor);
      }
    }
    return factors;
  } catch (e) {
    console.warn(`Could not load calibration CSV: ${e.message}`);
    return null;
  }
}

// ── Main validation run ────────────────────────────────────────────────────

async function run() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  STRIVE Scoring Validation Harness');
  console.log('═══════════════════════════════════════════════════════════\n');

  const routines = await loadRoutines();

  // Filter by event if requested
  const filtered = filterEvent
    ? routines.filter(r => normalizeEvent(r.event) === filterEvent)
    : routines;

  console.log(`Validating ${filtered.length} routines${filterEvent ? ` (${filterEvent} only)` : ''}\n`);

  if (filtered.length === 0) {
    console.log('No routines to validate. Ensure pipeline-a/output/json/ has ground truth data.');
    process.exit(0);
  }

  // ── Per-routine validation ────────────────────────────────────────────
  const results = [];
  const flagged = [];
  const byEvent = {};

  for (const routine of filtered) {
    const judgeScore = routine.final_score;
    const sim = simulateScore(routine);
    const delta = Math.round(Math.abs(sim.computed_score - judgeScore) * 1000) / 1000;
    const signed = Math.round((sim.computed_score - judgeScore) * 1000) / 1000;

    const event = normalizeEvent(routine.event) || 'unknown';
    if (!byEvent[event]) byEvent[event] = [];

    const entry = {
      file: routine._file,
      event,
      level: routine.level || 'unknown',
      judge_score: judgeScore,
      computed_score: sim.computed_score,
      delta,
      signed_delta: signed,
      skill_count: sim.skill_count,
      execution_total: sim.execution_total,
      calibration_factor: sim.calibration_factor,
      bounds_applied: sim.bounds_applied,
    };

    results.push(entry);
    byEvent[event].push(entry);

    if (delta > deltaThreshold) {
      flagged.push(entry);
    }

    if (verbose) {
      const flag = delta > deltaThreshold ? ' *** FLAGGED' : '';
      console.log(`  ${routine._file}: judge=${judgeScore.toFixed(3)} strive=${sim.computed_score.toFixed(3)} delta=${signed >= 0 ? '+' : ''}${signed.toFixed(3)} (${sim.skill_count} skills)${flag}`);
    }
  }

  // ── Per-event summary ─────────────────────────────────────────────────
  console.log('\n── Per-Event Results ──────────────────────────────────────\n');

  const eventSummaries = {};

  for (const [event, entries] of Object.entries(byEvent).sort()) {
    const deltas = entries.map(e => e.delta);
    const signedDeltas = entries.map(e => e.signed_delta);
    const judgeScores = entries.map(e => e.judge_score);
    const computedScores = entries.map(e => e.computed_score);

    const summary = {
      count: entries.length,
      mean_delta: Math.round(mean(deltas) * 1000) / 1000,
      median_delta: Math.round(median(deltas) * 1000) / 1000,
      std_dev: Math.round(stdDev(deltas) * 1000) / 1000,
      mean_signed: Math.round(mean(signedDeltas) * 1000) / 1000,
      correlation: Math.round(correlation(judgeScores, computedScores) * 1000) / 1000,
      within_010: entries.filter(e => e.delta <= 0.10).length,
      within_020: entries.filter(e => e.delta <= 0.20).length,
      within_030: entries.filter(e => e.delta <= 0.30).length,
      flagged: entries.filter(e => e.delta > deltaThreshold).length,
      calibration_factor: CURRENT_FACTORS[event] || 'N/A',
    };

    eventSummaries[event] = summary;

    console.log(`  ${event.toUpperCase().padEnd(8)} | n=${summary.count} | mean delta: ${summary.mean_delta.toFixed(3)} | median: ${summary.median_delta.toFixed(3)} | std: ${summary.std_dev.toFixed(3)} | r=${summary.correlation.toFixed(3)}`);
    console.log(`           | within 0.10: ${summary.within_010}/${summary.count} (${Math.round(summary.within_010 / summary.count * 100)}%) | within 0.20: ${summary.within_020}/${summary.count} (${Math.round(summary.within_020 / summary.count * 100)}%) | within 0.30: ${summary.within_030}/${summary.count} (${Math.round(summary.within_030 / summary.count * 100)}%)`);
    console.log(`           | bias: ${summary.mean_signed >= 0 ? '+' : ''}${summary.mean_signed.toFixed(3)} (${summary.mean_signed > 0 ? 'scoring high' : summary.mean_signed < 0 ? 'scoring low' : 'neutral'}) | factor: ${summary.calibration_factor}`);
    console.log();
  }

  // ── Overall summary ───────────────────────────────────────────────────
  const allDeltas = results.map(r => r.delta);
  const allSigned = results.map(r => r.signed_delta);
  const allJudge = results.map(r => r.judge_score);
  const allComputed = results.map(r => r.computed_score);

  console.log('── Overall Results ───────────────────────────────────────\n');
  console.log(`  Total routines:     ${results.length}`);
  console.log(`  Mean abs delta:     ${mean(allDeltas).toFixed(3)}`);
  console.log(`  Median abs delta:   ${median(allDeltas).toFixed(3)}`);
  console.log(`  Std deviation:      ${stdDev(allDeltas).toFixed(3)}`);
  console.log(`  Mean signed delta:  ${mean(allSigned) >= 0 ? '+' : ''}${mean(allSigned).toFixed(3)}`);
  console.log(`  Correlation (r):    ${correlation(allJudge, allComputed).toFixed(3)}`);
  console.log(`  Within 0.10:        ${results.filter(r => r.delta <= 0.10).length}/${results.length} (${Math.round(results.filter(r => r.delta <= 0.10).length / results.length * 100)}%)`);
  console.log(`  Within 0.20:        ${results.filter(r => r.delta <= 0.20).length}/${results.length} (${Math.round(results.filter(r => r.delta <= 0.20).length / results.length * 100)}%)`);
  console.log(`  Within 0.30:        ${results.filter(r => r.delta <= 0.30).length}/${results.length} (${Math.round(results.filter(r => r.delta <= 0.30).length / results.length * 100)}%)`);
  console.log(`  Flagged (>${deltaThreshold.toFixed(2)}):  ${flagged.length}/${results.length}`);

  // ── Flagged routines ──────────────────────────────────────────────────
  if (flagged.length > 0) {
    console.log(`\n── Flagged Routines (delta > ${deltaThreshold.toFixed(2)}) ────────────────────\n`);
    for (const f of flagged.sort((a, b) => b.delta - a.delta)) {
      console.log(`  ${f.file}: judge=${f.judge_score.toFixed(3)} strive=${f.computed_score.toFixed(3)} delta=${f.signed_delta >= 0 ? '+' : ''}${f.signed_delta.toFixed(3)} (${f.event}, ${f.level}, ${f.skill_count} skills)`);
    }
  }

  // ── Calibration comparison (if provided) ──────────────────────────────
  const newFactors = await loadCalibrationFactors();
  if (newFactors) {
    console.log('\n── Calibration Factor Comparison ──────────────────────────\n');
    console.log('  Event    | Current | Empirical | Change  | Recommendation');
    console.log('  ---------+---------+-----------+---------+------------------');
    for (const event of ['vault', 'bars', 'beam', 'floor']) {
      const current = CURRENT_FACTORS[event];
      const empirical = newFactors[event];
      if (empirical != null) {
        const change = empirical - current;
        const rec = Math.abs(change) < 0.03 ? 'Keep current' :
          change > 0 ? 'Consider raising' : 'Consider lowering';
        console.log(`  ${event.padEnd(9)}| ${current.toFixed(2).padEnd(8)}| ${empirical.toFixed(3).padEnd(10)}| ${change >= 0 ? '+' : ''}${change.toFixed(3).padEnd(8)}| ${rec}`);
      } else {
        console.log(`  ${event.padEnd(9)}| ${current.toFixed(2).padEnd(8)}| N/A       |         |`);
      }
    }
  }

  // ── Write report ──────────────────────────────────────────────────────
  const report = {
    generated_at: new Date().toISOString(),
    scoring_version: '3.0',
    calibration_factors: CURRENT_FACTORS,
    threshold: deltaThreshold,
    total_routines: results.length,
    overall: {
      mean_delta: Math.round(mean(allDeltas) * 1000) / 1000,
      median_delta: Math.round(median(allDeltas) * 1000) / 1000,
      std_dev: Math.round(stdDev(allDeltas) * 1000) / 1000,
      mean_signed: Math.round(mean(allSigned) * 1000) / 1000,
      correlation: Math.round(correlation(allJudge, allComputed) * 1000) / 1000,
      within_010_pct: Math.round(results.filter(r => r.delta <= 0.10).length / results.length * 100),
      within_020_pct: Math.round(results.filter(r => r.delta <= 0.20).length / results.length * 100),
      within_030_pct: Math.round(results.filter(r => r.delta <= 0.30).length / results.length * 100),
    },
    by_event: eventSummaries,
    flagged: flagged.map(f => ({
      file: f.file, event: f.event, level: f.level,
      judge_score: f.judge_score, computed_score: f.computed_score,
      delta: f.delta, signed_delta: f.signed_delta,
    })),
    new_calibration_factors: newFactors || null,
  };

  const reportPath = join(REPORT_DIR, 'validation-report.json');
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nReport written to ${reportPath}`);

  // ── Exit code ─────────────────────────────────────────────────────────
  const passRate = results.filter(r => r.delta <= deltaThreshold).length / results.length;
  if (passRate < 0.80) {
    console.log(`\nWARNING: Only ${Math.round(passRate * 100)}% of routines within threshold — calibration tuning needed.`);
    process.exit(1);
  } else {
    console.log(`\nPASS: ${Math.round(passRate * 100)}% of routines within ${deltaThreshold.toFixed(2)} threshold.`);
    process.exit(0);
  }
}

run().catch(e => {
  console.error('Validation failed:', e.message);
  process.exit(1);
});
