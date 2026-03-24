#!/usr/bin/env node
/**
 * calibrate-from-ground-truth.mjs
 *
 * Reads NAWGJ judge scoring data from the ground-truth directory,
 * computes average per-skill deductions per event, and suggests
 * calibration factors for scoring.js EVENT_CALIBRATION.
 */

import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

const GROUND_TRUTH_DIR = '/Users/mgraci/Desktop/strive-ground-truth/ground-truth/raw';
const CURRENT_FACTORS = { bars: 0.85, beam: 0.70, vault: 1.35, floor: 0.70 };

async function loadRoutines() {
  const files = await readdir(GROUND_TRUTH_DIR);
  const dataFiles = files.filter(f => f.endsWith('.json .txt') || f.endsWith('.json') || f.endsWith('.txt'));
  const routines = [];

  for (const file of dataFiles) {
    try {
      let content = await readFile(join(GROUND_TRUTH_DIR, file), 'utf-8');
      // Handle Unicode Line Separator (U+2028) and Paragraph Separator (U+2029)
      content = content.replace(/\u2028/g, ' ').replace(/\u2029/g, ' ');
      const data = JSON.parse(content);
      const items = Array.isArray(data) ? data : [data];
      routines.push(...items);
      console.log(`Loaded ${items.length} routines from ${file}`);
    } catch (e) {
      console.warn(`Skipping ${file}: ${e.message}`);
    }
  }
  return routines;
}

function computeSkillDeductions(routine) {
  // Judge rows: [score, exec_total, ...skill_deductions]
  // Skill deductions start at index 2 (after score and exec total)
  // Some entries have non-numeric values (text notes, null) — skip those
  const perJudge = routine.judge_rows.map(row => {
    let total = 0;
    // Skip first 2 columns (score, exec total) — sum individual skill deductions
    for (let i = 2; i < row.length; i++) {
      const val = parseFloat(row[i]);
      if (!isNaN(val)) total += val;
    }
    return total;
  });

  // Average across judges
  return perJudge.reduce((sum, d) => sum + d, 0) / perJudge.length;
}

async function run() {
  const routines = await loadRoutines();
  console.log(`\nTotal routines loaded: ${routines.length}\n`);

  const byEvent = {};

  for (const routine of routines) {
    const event = (routine.event || '').toLowerCase().trim();
    if (!event) continue;
    if (!byEvent[event]) byEvent[event] = [];

    const avgSkillDeductions = computeSkillDeductions(routine);
    // Ground truth: 10.0 - average_score = total deductions judges applied
    const groundTruthTotal = 10.0 - routine.average_score;

    byEvent[event].push({
      label: routine.routine_label,
      avgScore: routine.average_score,
      groundTruthDeductions: groundTruthTotal,
      avgSkillDeductions,
      numJudges: routine.num_judges,
    });
  }

  let report = `STRIVE CALIBRATION REPORT\nGenerated: ${new Date().toISOString()}\n`;
  report += `Source: NAWGJ Education Committee scored practice judging videos\n\n`;

  report += `EVENT    | ROUTINES | AVG JUDGE SCORE | AVG DEDUCTIONS (10-score) | CURRENT FACTOR\n`;
  report += `-`.repeat(90) + `\n`;

  for (const [event, data] of Object.entries(byEvent)) {
    const avgScore = data.reduce((s, r) => s + r.avgScore, 0) / data.length;
    const avgDeductions = data.reduce((s, r) => s + r.groundTruthDeductions, 0) / data.length;
    const current = CURRENT_FACTORS[event] || 'N/A';

    report += `${event.padEnd(8)} | ${String(data.length).padEnd(8)} | ${avgScore.toFixed(3).padEnd(15)} | ${avgDeductions.toFixed(3).padEnd(25)} | ${typeof current === 'number' ? current.toFixed(2) : current}\n`;

    console.log(`${event}: ${data.length} routines`);
    console.log(`  Avg judge score: ${avgScore.toFixed(3)}`);
    console.log(`  Avg deductions (10-score): ${avgDeductions.toFixed(3)}`);
    console.log(`  Current calibration factor: ${current}`);

    // Per-routine detail
    report += `\n  Per-routine detail:\n`;
    for (const r of data) {
      report += `    ${r.label.padEnd(25)} | Score: ${r.avgScore.toFixed(2)} | Deductions: ${r.groundTruthDeductions.toFixed(2)} | Skill ded avg: ${r.avgSkillDeductions.toFixed(2)} | Judges: ${r.numJudges}\n`;
      console.log(`    ${r.label}: score=${r.avgScore}, ded=${r.groundTruthDeductions.toFixed(2)}, skill_avg=${r.avgSkillDeductions.toFixed(2)}`);
    }
    report += `\n`;
  }

  report += `\n═══════════════════════════════════════════════════════════════\n`;
  report += `CALIBRATION ANALYSIS\n`;
  report += `═══════════════════════════════════════════════════════════════\n\n`;
  report += `Current factors represent the ratio of AI raw deductions to ground truth.\n`;
  report += `Factor < 1.0 = AI over-deducts (scale down)\n`;
  report += `Factor > 1.0 = AI under-deducts (scale up)\n\n`;
  report += `NOTE: These factors should be updated once Strive has run analyses on\n`;
  report += `these same videos. Compare Strive's raw AI deduction totals against the\n`;
  report += `ground truth deductions above to compute empirical calibration factors.\n`;
  report += `\nCurrent factors (from manual tuning): bars=${CURRENT_FACTORS.bars}, beam=${CURRENT_FACTORS.beam}, vault=${CURRENT_FACTORS.vault}, floor=${CURRENT_FACTORS.floor}\n`;

  await writeFile('scripts/calibration-report.txt', report);
  console.log('\nReport saved to scripts/calibration-report.txt');
}

run().catch(console.error);
