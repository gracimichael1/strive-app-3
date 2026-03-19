# AGENT_LOG.md — Strive Orchestrator Decision Log

## Phase 0 — Reconnaissance (Complete)

### 0A — Recon Agent
- Read all 8,693 lines of LegacyApp.js + every project file
- Key findings: massive monolith, extensive dead code (12 files never imported), two competing tier systems, CORS * on API key endpoint, no real Claude fallback, MediaPipe re-downloaded on every click
- Output: RECON_REPORT.md

### 0B — Market Agent
- Researched competitors: Dartfish, Hudl Technique, OnForm, CoachNow
- Key finding: NO direct competitor does automated AI scoring with USAG deduction detection
- Pricing gap: $5-8/mo for slow-mo players, $30+/mo for coach tools, $10-15/mo AI parent tier is empty
- Output: MARKET_REPORT.md

### 0C — Vision Agent
- Mapped user journey: skeptical download → revelation moment → habit formation → evangelism
- Retention metric: 3 analyses/month is the magic number
- Coach relationship: Strive should amplify the coach, not compete
- Output: VISION_REPORT.md

---

## Phase 1 — Agent Alpha: Accuracy Engine

### Verification Results (2026-03-18)

**FIX 1 — GEMINI PROMPT**: Already correct. Contains athlete name, gender, level, event in first line. Calibration statement present at end. Pipe-delimited output format instructed (not JSON). No changes needed.

**FIX 2 — RESPONSE PARSER**: Already correct. Pipe-first parsing (splits by newline, filters " | " lines, maps to skill objects). JSON fallback exists for backward compatibility. Deduction validated 0-0.50. No changes needed.

**FIX 3 — SKILL GROUPING**: Already correct. Adjacent skills within 2 seconds matching combo patterns (back handspring, round-off, BHS, front handspring, front walkover) merge into one card. Merged deduction capped at 0.50. First skill's timestamp preserved. No changes needed.

**FIX 4 — SCORE CACHING**: FIXED. Cache key now includes file size to prevent collisions when different videos share the same filename. Changed from `btoa(fileName + "_" + level + "_" + event)` to `btoa(fileName + "_" + fileSize + "_" + level + "_" + event)`. 24hr TTL and cached result return were already correct.

**FIX 5 — DEDUCTION VALIDATION**: FIXED. Expanded deduction caps:
- Added granular landing step caps: small=0.05, medium=0.10, large=0.20, fall=0.50
- Added granular beam wobble caps: small=0.10, medium=0.20, large=0.30
- Added split angle validation by level: Bronze=no min, Silver=90, Gold=120, Platinum=150, Diamond/Sapphire=180. If observed split angle meets level minimum, deduction is removed.
- Existing caps verified correct: bent arms=0.30, bent knees=0.30, flexed foot=0.05, leg separation=0.20.

### Self-Test Results

| Test | Description | Result |
|---|---|---|
| Test 1 | Prompt Integrity — athlete/gender/level/event + calibration | PASS |
| Test 2 | Parser Validation — 7 skills extracted from mock pipe response | PASS |
| Test 3 | Skill Grouping — RO + BHS + Back Tuck merge into 1 card (ded=0.45) | PASS |
| Test 4 | Deduction Clamping — bent arms 0.50->0.30, wobble 0.40->0.30, flexed foot 0.20->0.05 | PASS |
| Test 5 | Score Math — sum 0.95, final 9.05 | PASS |

### Build Status
- `npx react-scripts build` — Compiled successfully

### Files Modified
- `src/LegacyApp.js` — Cache key fix (line ~3355) + expanded deduction validation (lines ~3457-3510)
- `src/scoring-engine.test.js` — New test file with 5 scoring engine tests
