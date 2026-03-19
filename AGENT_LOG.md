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

---

## Phase 2 — Agent Beta: Video + Skeleton

### Alpha Compatibility Check (2026-03-18)
Alpha changed the response parser from JSON to pipe-delimited format. The parsed skill objects still produce the same `processedSkills` shape with `timestampSec`, `skill`, `fault`, `gradeDeduction`, `grade`, `strength`, `type` fields. GradedSkillCard props are unchanged. No conflict with video rendering.

### Implementation Results

**FIX 1 — VIDEO PROP FLOW**: DONE.
- Chain: Upload (File) -> `videoFileRef.current` (line 1052) -> `ResultsScreen` prop `videoFile={videoFileRef.current}` (line 1075) -> `GradedSkillsView` prop `videoFile` (line 5453) -> `GradedSkillCard` prop `videoFile` (line 5071)
- Inside GradedSkillCard: blob URL created from File on expand via `URL.createObjectURL(videoFile)`, revoked on collapse via `URL.revokeObjectURL()`.
- Memory-safe: each card creates/destroys its own blob URL independently.

**FIX 2 — TIMESTAMP SEEKING**: DONE.
- On expand: `video.currentTime = skill.timestampSec`, then `video.play()` (muted for iOS autoplay).
- Playback speed buttons: 0.25x, 0.5x, 1x — updates `video.playbackRate`.
- On collapse: `video.pause()` + blob URL revoked.

**FIX 3 — MEDIAPIPE CDN**: DONE.
- Added 3 script tags to `public/index.html` `<head>`: `@mediapipe/pose@0.5/pose.js`, `camera_utils.js`, `drawing_utils.js`. All with `crossorigin="anonymous"` and `defer`.

**FIX 4 — SKELETON OVERLAY**: DONE.
- `<canvas>` with `position: absolute; top: 0; left: 0; width: 100%; height: 100%` overlays the `<video>`.
- "Skeleton" toggle button: ON initializes MediaPipe Pose (lazy, only on first toggle), starts `requestAnimationFrame` detection loop; OFF sets canvas opacity to 0 and cancels animation frame.
- Pose config: `modelComplexity: 1, smoothLandmarks: true, minDetectionConfidence: 0.7`.
- Joint color coding: within 5 degrees of ideal = green (#22c55e), 6-15 degrees = yellow (#ffc15a), 16+ degrees = red (#dc2626).
- Key joints tracked: knee (23-25-27), elbow (11-13-15), hip (11-23-25) — all with ideal 180 degrees.

**FIX 5 — FAULT TIMELINE STRIP**: DONE.
- Horizontal bar at bottom of in-card video player.
- Green baseline with orange/red dots for fault moments.
- Dots spaced proportionally across a 3-second estimated skill window.
- Tapping a dot seeks the video to that approximate timestamp.

### Self-Test Results

| Test | Description | Result |
|---|---|---|
| Test 1 | Video Prop Flow — upload -> ref -> prop -> video element | PASS (chain: videoFileRef.current -> ResultsScreen.videoFile -> GradedSkillsView.videoFile -> GradedSkillCard.videoFile -> cardVideoUrl -> `<video src>`) |
| Test 2 | Video Element Audit — 5 `<video>` elements found, all have src + playsInline + muted | PASS |
| Test 3 | MediaPipe CDN Check — 3 script tags in public/index.html lines 26-28 | PASS |
| Test 4 | Skeleton Toggle — showSkel state -> useEffect starts pose loop (requestAnimationFrame) / cancels on OFF | PASS |
| Test 5 | Canvas Positioning — position:absolute, top:0, left:0, width:100%, height:100%, pointerEvents:none | PASS |

### Build Status
- `npx react-scripts build` — Compiled successfully

### Files Modified
- `src/LegacyApp.js` — GradedSkillCard: added videoFile prop, in-card video player with blob URL lifecycle, skeleton overlay (MediaPipe Pose), playback speed controls, fault timeline strip. GradedSkillsView + ResultsScreen: prop threading for videoFile.
- `public/index.html` — Added 3 MediaPipe CDN script tags.
