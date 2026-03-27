#!/usr/bin/env node
/**
 * calibrate-from-ground-truth.mjs (v2)
 * Reads from pipeline-a/output/json/ (new format from extract.mjs v2).
 * Computes judge score distributions and panel spread per event.
 */

import { readdir, readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const JSON_DIR = join(__dirname, '..', 'pipeline-a', 'output', 'json');

const CURRENT_FACTORS = { vault: 0.75, bars: 0.85, beam: 0.91, floor: 0.92 };

function stdDev(arr) {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((s, x) => s + (x - mean) ** 2, 0) / arr.length);
}

function normalizeEvent(event) {
  if (!event) return null;
  const e = String(event).toLowerCase().trim();
  if (e.includes('bar')) return 'bars';
  if (e.includes('beam')) return 'beam';
  if (e.includes('vault') || e === 'vt') return 'vault';
  if (e.includes('floor') || e === 'fx') return 'floor';
  return null;
}

async function loadRoutines() {
  let files;
  try { files = await readdir(JSON_DIR); } catch {
    console.error(`ERROR: Cannot read ${JSON_DIR}`);
    console.error('Run pipeline-a/extract.mjs first.');
    process.exit(1);
  }
  const jsonFiles = files.filter(f => f.endsWith('.json'));
  console.log(`Found ${jsonFiles.length} JSON files in pipeline-a/output/json/`);
  const routines = [];
  for (const file of jsonFiles) {
    try {
      const d = JSON.parse(await readFile(join(JSON_DIR, file), 'utf-8'));
      routines.push({ ...d, _file: file });
    } catch (e) { console.warn(`  Skip ${file}: ${e.message}`); }
  }
  return routines;
}

async function run() {
  const allRoutines = await loadRoutines();
  const scored = allRoutines.filter(r => typeof r.final_score === 'number' && r.final_score > 0 && r.final_score <= 10.5);
  console.log(`\nTotal files: ${allRoutines.length} | Scored: ${scored.length} | Skipped: ${allRoutines.length - scored.length}`);

  const byEvent = { floor: [], bars: [], beam: [], vault: [] };
  for (const r of scored) {
    const ev = normalizeEvent(r.event);
    if (ev && byEvent[ev]) byEvent[ev].push(r);
  }

  const EVENTS = ['floor', 'bars', 'beam', 'vault'];
  let report = `STRIVE CALIBRATION REPORT — JUDGE SCORE DISTRIBUTIONS\nGenerated: ${new Date().toISOString()}\nSource: pipeline-a/output/json/ (${allRoutines.length} files, ${scored.length} scored)\n\n`;

  console.log('\n' + '='.repeat(110));
  console.log('JUDGE SCORE DISTRIBUTIONS BY EVENT');
  console.log('='.repeat(110));
  const hdr = 'EVENT    | N    | W/ROWS   | AVG SCORE   | STD DEV   | RANGE            | CONFIDENCE   | CUR FACTOR';
  console.log(hdr);
  console.log('-'.repeat(110));
  report += hdr + '\n' + '-'.repeat(110) + '\n';

  for (const event of EVENTS) {
    const routines = byEvent[event];
    if (routines.length === 0) {
      const row = `${event.padEnd(8)} | 0    | —        | NO DATA`;
      console.log(row); report += row + '\n'; continue;
    }
    const scores = routines.map(r => r.final_score);
    const withRows = routines.filter(r => Array.isArray(r.judge_rows) && r.judge_rows.length > 0);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const sd = stdDev(scores);
    const conf = routines.length >= 20 ? 'HIGH' : routines.length >= 10 ? 'MEDIUM' : routines.length >= 5 ? 'LOW' : 'INSUFFICIENT';
    const row = `${event.padEnd(8)} | ${String(routines.length).padEnd(4)} | ${String(withRows.length).padEnd(8)} | ${avg.toFixed(3).padEnd(11)} | ${sd.toFixed(3).padEnd(9)} | ${(Math.min(...scores).toFixed(2) + '-' + Math.max(...scores).toFixed(2)).padEnd(16)} | ${conf.padEnd(12)} | ${CURRENT_FACTORS[event]}`;
    console.log(row); report += row + '\n';
  }

  // Per-level breakdown
  console.log('\n' + '='.repeat(80));
  console.log('PER-LEVEL SCORE BREAKDOWN');
  console.log('='.repeat(80));
  report += '\n\nPER-LEVEL SCORE BREAKDOWN\n' + '='.repeat(80) + '\n';

  for (const event of EVENTS) {
    const routines = byEvent[event];
    if (routines.length === 0) continue;
    console.log(`\n${event.toUpperCase()}:`);
    report += `\n${event.toUpperCase()}:\n`;
    const byLevel = {};
    for (const r of routines) {
      const lvl = r.level || r.declared_level || 'Unknown';
      if (!byLevel[lvl]) byLevel[lvl] = [];
      byLevel[lvl].push(r.final_score);
    }
    for (const [lvl, scores] of Object.entries(byLevel).sort()) {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      const line = `  ${lvl.padEnd(22)} N=${String(scores.length).padEnd(3)} avg=${avg.toFixed(2)}  range ${Math.min(...scores).toFixed(2)}-${Math.max(...scores).toFixed(2)}`;
      console.log(line); report += line + '\n';
    }
  }

  // Panel spread
  console.log('\n' + '='.repeat(80));
  console.log('JUDGE PANEL SPREAD');
  console.log('='.repeat(80));
  report += '\n\nJUDGE PANEL SPREAD\n' + '='.repeat(80) + '\n';

  for (const event of EVENTS) {
    const spreadRoutines = byEvent[event].filter(r => Array.isArray(r.judge_scores) && r.judge_scores.filter(s => typeof s === 'number' && s > 0).length >= 3);
    if (spreadRoutines.length === 0) {
      console.log(`${event.toUpperCase().padEnd(8)}: no judge_scores data`);
      report += `${event.toUpperCase().padEnd(8)}: no judge_scores data\n`;
      continue;
    }
    const spreads = spreadRoutines.map(r => {
      const valid = r.judge_scores.filter(s => typeof s === 'number' && s > 0);
      return Math.max(...valid) - Math.min(...valid);
    });
    const avgSpread = spreads.reduce((a, b) => a + b, 0) / spreads.length;
    const line = `${event.toUpperCase().padEnd(8)}: avg spread=${avgSpread.toFixed(3)} (±${(avgSpread / 2).toFixed(3)})  max=${Math.max(...spreads).toFixed(3)}  N=${spreadRoutines.length}`;
    console.log(line); report += line + '\n';
  }

  report += '\nDO NOT change scoring.js factors until AI vs judge comparison is done.\n';
  await writeFile(join(__dirname, 'calibration-report.txt'), report);
  console.log('\nReport saved: scripts/calibration-report.txt');
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
