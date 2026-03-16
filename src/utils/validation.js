import { safeStr, safeArray, safeNum } from './helpers';

// ─── RESPONSE VALIDATION (normalizes AI JSON into safe, consistent shape) ──
export function validateResult(parsed) {
  if (!parsed || typeof parsed !== "object") return parsed;

  parsed.executionDeductions = safeArray(parsed.executionDeductions)
    .filter(d => d && typeof d === "object")
    .map(d => ({
      ...d,
      timestamp: safeStr(d.timestamp, "0:00"),
      skill: safeStr(d.skill, "Unknown skill"),
      fault: safeStr(d.fault, d.skill || "Execution error"),
      deduction: safeNum(Math.abs(d.deduction || 0), 0, 0, 2.0),
      confidence: safeNum(d.confidence, 0.7, 0, 1),
      engine: ["TPM", "KTM", "VAE", "Split-Check", "Landing", "General"].includes(d.engine) ? d.engine : "General",
      category: ["execution", "artistry", "landing"].includes(d.category) ? d.category : "execution",
      severity: d.severity || (safeNum(d.deduction, 0) <= 0.10 ? "small" : safeNum(d.deduction, 0) <= 0.15 ? "medium" : safeNum(d.deduction, 0) <= 0.30 ? "large" : safeNum(d.deduction, 0) >= 0.50 ? "fall" : "veryLarge"),
      details: safeStr(d.details, d.fault || d.skill || ""),
      skeleton: d.skeleton && typeof d.skeleton === "object" ? d.skeleton : null,
      lowConfidence: safeNum(d.confidence, 0.7, 0, 1) < 0.6,
    }))
    .filter(d => d.confidence >= 0.4);

  // Always recompute totals from actual deductions
  parsed.executionDeductionsTotal = Math.round(
    parsed.executionDeductions.filter(d => d.category !== "artistry").reduce((s, d) => s + d.deduction, 0) * 1000
  ) / 1000;
  parsed.artistryDeductionsTotal = Math.round(
    parsed.executionDeductions.filter(d => d.category === "artistry").reduce((s, d) => s + d.deduction, 0) * 1000
  ) / 1000;
  parsed.totalDeductions = Math.round((parsed.executionDeductionsTotal + parsed.artistryDeductionsTotal) * 1000) / 1000;
  parsed.finalScore = Math.max(0, Math.round((10 - parsed.totalDeductions) * 1000) / 1000);

  parsed.topFixes = safeArray(parsed.topFixes);
  parsed.strengths = safeArray(parsed.strengths);
  parsed.areasForImprovement = safeArray(parsed.areasForImprovement);
  parsed.truthAnalysis = safeStr(parsed.truthAnalysis);

  if (parsed.biomechanics && typeof parsed.biomechanics === "object") {
    parsed.biomechanics.keyMoments = safeArray(parsed.biomechanics.keyMoments);
    parsed.biomechanics.landingAnalysis = safeArray(parsed.biomechanics.landingAnalysis);
    parsed.biomechanics.holdDurations = safeArray(parsed.biomechanics.holdDurations);
    parsed.biomechanics.injuryRiskFlags = safeArray(parsed.biomechanics.injuryRiskFlags);
    parsed.biomechanics.overallFlightHeight = safeStr(parsed.biomechanics.overallFlightHeight);
    parsed.biomechanics.overallPowerRating = safeStr(parsed.biomechanics.overallPowerRating);
  }

  if (parsed.coachReport && typeof parsed.coachReport === "object") {
    parsed.coachReport.preemptiveCorrections = safeArray(parsed.coachReport.preemptiveCorrections);
    parsed.coachReport.conditioningPlan = safeArray(parsed.coachReport.conditioningPlan);
    parsed.coachReport.idealComparison = safeStr(parsed.coachReport.idealComparison);
    parsed.coachReport.techniqueProgressionNotes = safeStr(parsed.coachReport.techniqueProgressionNotes);
  }

  if (parsed.athleteDevelopment && typeof parsed.athleteDevelopment === "object") {
    parsed.athleteDevelopment.mentalTraining = safeArray(parsed.athleteDevelopment.mentalTraining);
    parsed.athleteDevelopment.goalSpecificAdvice = safeStr(parsed.athleteDevelopment.goalSpecificAdvice);
  }

  return parsed;
}
