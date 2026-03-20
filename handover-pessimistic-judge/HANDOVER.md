# Pessimistic Judge — Scoring Accuracy Handover

## Problem Solved
Gemini scored floor within 0.10 of actual but missed bars by 1.0 point.
Root cause: bars have 3D orbital physics, compound deductions, rhythm penalties,
and occlusion issues that the generic prompt didn't account for.

## Goal
All events score within 0.150 of actual. Always err STRICT (not lenient).

---

## Files In This Package

### New Files (drop into project)
| File | Drop Location | Purpose |
|------|--------------|---------|
| `eventDeductions.js` | `src/data/` | Event-specific deduction rules + strictness overrides + MediaPipe-to-prompt formatter |
| `codeOfPoints.js` | `src/data/` | Full USAG Code of Points database — all levels, genders, events, special requirements |

### Patch Files (diffs to apply)
| File | Target | Purpose |
|------|--------|---------|
| `LegacyApp.patch` | `src/LegacyApp.js` | Rewrites `buildJudgingPrompt()` + wires MediaPipe into `analyzeWithAI()` |
| `biomechanics.patch` | `src/analysis/biomechanics.js` | Stricter thresholds + new deduction types (elbow, leg separation) |

---

## What Changed (Summary)

### 1. eventDeductions.js — Event-Specific "Pessimistic Judge" Rules
- **BARS_DEDUCTIONS**: Cast checks, kip deductions, rhythm/flow penalties (the hidden 0.30-0.50 AI misses), compound rules (low cast -> flag next skill), grip adjustments
- **BEAM_DEDUCTIONS**: Balance check counting (2-5 per routine typical), wobble tiers, turn completion, beam-specific composition
- **FLOOR_DEDUCTIONS**: Tumbling pass deductions, OOB, artistry/performance specifics
- **VAULT_DEDUCTIONS**: 4-phase scoring (pre-flight, table, post-flight, landing)
- **MAG events**: Pommel horse, rings, parallel bars, high bar
- **Helper functions**: `getEventDeductions(event)`, `getEventStrictnessGuidance(event)`, `formatBiomechanicsForPrompt(skillAnalysis)`

### 2. codeOfPoints.js — USAG Deduction Database (82KB)
- Split requirements by level tier
- Score ranges with state-meet calibration
- Universal execution + landing deductions
- Apparatus-specific deductions with compound rules (6 for bars alone)
- Special requirements for ALL levels (WAG L1-10, Elite, Xcel Bronze-Sapphire; MAG L1-10, Elite)
- Helper functions: `getDeductionsForEvent()`, `getSpecialRequirements()`, `getCompoundRules()`, `buildDeductionPromptBlock()`

### 3. buildJudgingPrompt() Rewrite (in LegacyApp.patch)
- Now accepts `biomechanicsData` param — MediaPipe joint angles injected into prompt
- Event-specific deduction rules appended per apparatus
- Strictness overrides per event (bars: 1.00-1.60 target, floor: 0.80-1.40)
- "Hunt for deductions" philosophy baked into system prompt
- Second-pass instruction: re-watch for feet/pauses/rhythm after initial assessment
- Event-specific calibration targets (not one-size-fits-all)
- Cache version bumped to `v6_pessimistic_judge`

### 4. analyzeWithAI() Pipeline Change (in LegacyApp.patch)
- MediaPipe runs FIRST (before Gemini call)
- Creates temp video element, runs pose detection pipeline
- Extracts skeletal joint angles per detected skill
- Passes biomechanics data INTO buildJudgingPrompt()
- Gemini gets BOTH video AND mathematical angles
- Non-blocking: if MediaPipe fails, Gemini judges from video only
- MediaPipe result stored in output for VideoReviewPlayer skeleton overlay

### 5. biomechanics.js Enhancements (in biomechanics.patch)
- Stricter angle thresholds (knee: 165 not 160, hip: 160 not 155)
- New: elbow angle detection (bent arms)
- New: leg separation detection
- 3-tier landing squat (deep/moderate/slight instead of just deep)
- More granular body alignment deviation

---

## How to Apply

### Option A: Manual integration
1. Copy `eventDeductions.js` and `codeOfPoints.js` to `src/data/`
2. Add import to LegacyApp.js:
   ```js
   import { getEventDeductions, getEventStrictnessGuidance, formatBiomechanicsForPrompt } from "./data/eventDeductions";
   import { analyzeVideo as runMediaPipePipeline } from "./analysis/analysisPipeline";
   ```
3. Apply the logic from `LegacyApp.patch` to `buildJudgingPrompt()` and `analyzeWithAI()`
4. Apply `biomechanics.patch` to `src/analysis/biomechanics.js`

### Option B: Git patch
```bash
cd /path/to/StriveGymnastics
cp handover-pessimistic-judge/eventDeductions.js src/data/
cp handover-pessimistic-judge/codeOfPoints.js src/data/
git apply handover-pessimistic-judge/LegacyApp.patch
git apply handover-pessimistic-judge/biomechanics.patch
```

---

## Key Architecture Decisions

1. **MediaPipe is a BONUS, not a blocker** — if pose detection fails, Gemini still judges from video alone. The biomechanics data just makes it more accurate.

2. **Code computes the final score, not Gemini** — Gemini identifies faults and deductions. JavaScript sums them. This prevents hallucinated scores.

3. **Event-specific calibration targets** — Bars expects 1.00-1.60 total deductions (higher than floor's 0.80-1.40) because bars routinely has more deductible moments.

4. **Compound rules are in the prompt, not code** — We tell Gemini about compound deduction logic (e.g., "bent arm kip -> likely low cast -> verify both") rather than trying to detect it in code. Gemini can see the video; code can't.

5. **Strictness bias** — "When in doubt, take the HIGHER deduction" is baked into the system prompt. The calibration targets are set so Gemini aims for the strict end of realistic.

---

## Testing Recommendations

1. **A/B test**: Run same bars video with old prompt (v5) vs new prompt (v6). Compare to actual score.
2. **Cross-event consistency**: Run floor, bars, beam, vault videos from same gymnast. All should be within 0.150 of actual.
3. **Repeat consistency**: Same video twice should score within 0.10 (cache handles this, but verify with cache cleared).
4. **Level accuracy**: Test across Xcel Gold, Level 6, Level 8 — calibration targets differ.
