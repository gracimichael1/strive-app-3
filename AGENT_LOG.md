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

---

## Phase 3 — Agent Gamma: Design System + UI

### Alpha/Beta Compatibility Check (2026-03-19)
Alpha and Beta did not introduce UI design system issues. Their changes were functional (scoring logic, video/skeleton). However, all code from Alpha/Beta used the OLD color palette (C4982A, E8C35A, F59E0B, etc.) which needed migration to the locked design system. No layout breakage found.

### Test 1 — Color Audit

**Full codebase color migration to locked design system.**

Replacements in `src/LegacyApp.js`:
| Old Color | New Color | Count | Context |
|---|---|---|---|
| #0a0e27 | #070c16 | 1 | Background |
| #0B1024 | #070c16 | 16 | Dark background / text-on-gold |
| #111631 | #0d1422 | 2 | Surface / tooltip bg |
| #C4982A | #e8962a | 117+ | Gold (primary brand) |
| #E8C35A | #ffc15a | 20+ | Gold light |
| #F59E0B / #f59e0b | #ffc15a | 40+ | Warning / amber |
| #F97316 / #f97316 | #e06820 | 15+ | Orange |
| #EF4444 / #ef4444 | #dc2626 | 60+ | Red / error |
| #FB923C | #e06820 | 1 | Orange (grade C+) |
| #86EFAC | #4ade80 | 1 | Green light (grade B+) |
| #7C3AED | #8b72d4 | 1 | Purple (grade F) |
| #22C55E | #22c55e | 15+ | Case normalization |
| #4ADE80 | #4ade80 | 1 | Case normalization |
| rgba(196,152,42,...) | rgba(232,150,42,...) | 117 | Gold rgba |
| rgba(245,158,11,...) | rgba(255,193,90,...) | 14 | Amber rgba |
| rgba(239,68,68,...) | rgba(220,38,38,...) | 25 | Red rgba |
| rgba(249,115,22,...) | rgba(224,104,32,...) | 5 | Orange rgba |

Replacements in `src/styles/global.css`:
- --strive-midnight: #0B1024 -> #070c16
- --strive-navy-800: #111631 -> #0d1422
- --strive-navy-600: #1E2444 -> #121b2d
- --strive-gold-500: #C4982A -> #e8962a
- --strive-gold-300: #E8C35A -> #ffc15a
- --strive-success: #22C55E -> #22c55e
- --strive-warning: #F59E0B -> #ffc15a
- --strive-danger: #EF4444 -> #dc2626
- Border opacity: 0.06 -> 0.07, 0.12 -> 0.13
- All rgba(196,152,42) -> rgba(232,150,42)

Replacements in component files (all dead code but updated for consistency):
- `src/components/shared/StriveLogo.js` — gold palette
- `src/components/onboarding/SplashScreen.js` — gold palette
- `src/components/timeline/SkillTimeline.js` — severity colors + gold
- `src/components/analysis/SkillCard.js` — severity + gold + red rgba
- `src/components/video/VideoAnalyzer.js` — gold + red + amber

**Result: PASS** — Zero off-system colors remain in codebase.

### Test 2 — Font Audit

Verified font usage across codebase:
- **Space Mono**: Used correctly for scores, timestamps, deduction amounts, grade letters, percentages, data labels throughout LegacyApp.js (e.g., line 4654 timestamp, 4677 deduction amount, 4360 grade letter in GradeCircle, 5024 summary stats, 5174 main score, etc.)
- **Outfit**: Used correctly for body text, skill names, button labels, headers, descriptions throughout (e.g., line 4703 button fontFamily, 4745 skeleton toggle, tab buttons at 5370, etc.)
- No violations found — both fonts correctly applied per design system rules.

**Result: PASS**

### Test 3 — Overview Tab (8 sections)

Built or verified all 8 sections:

| # | Section | Status | Implementation |
|---|---|---|---|
| 1 | Hero Score Ring | **BUILT** | Animated SVG ring (140px, stroke-dashoffset transition 1.2s). Center: score in Space Mono 28px bold + grade label. Right: trend indicator (up/down arrow with delta). Below: D-Score / E-Score / Neutral 3-column grid. |
| 2 | Context Strip | **BUILT** | 4 horizontal scroll cards: vs last meet, season goal %, vs division average, points to goal. Each card: Surface 2 (#121b2d) background, gold accent number in Space Mono. |
| 3 | Judge's Perspective | **REBUILT** | Gold left border card. "Brevet-level evaluation" italic label. Judge quote in italics. Execution/Artistry/Neutral 3-column breakdown. |
| 4 | Artistry Breakdown | **REBUILT** | Purple (#8b72d4) theme. Horizontal gauge bars per artistry field: Confidence, Eye Contact, Musicality, Use of Space, Expression, Footwork. Each: animated fill, score /10 right-aligned in Space Mono. |
| 5 | Areas for Improvement | **REBUILT** | Red/orange theme. Ranked list 1-6 by deduction impact. Each row: rank number in colored badge, skill name, fault note (truncated), deduction amount (color-coded by severity). |
| 6 | Path to 9.0+ | **BUILT** | Green theme. Current -> Target visual with arrow. Fix rows: points gained, skill to fix. Coach path-to-goal note at bottom. Only shows if score < 9.0. |
| 7 | Improvement Potential | **REBUILT** | Stacked math: current score -> fix 1 -> fix 2 -> fix 3 -> projected final. Each step shows cumulative score. Final box: "Projected: X.XXX" in green Space Mono. |
| 8 | Season Goal Tracker | **BUILT** | Header with weeks remaining. Current -> Target progress bar (gold gradient). Footer with estimated practices needed. |

Also preserved: Body Heatmap, Deduction Timeline, Celebrations, Strengths fallback, Parent Summary.

**Result: PASS**

### Test 4 — Skills Tab

GradedSkillsView enhancements:
- **Filter pills**: All | Acro | Dance | Clean | Faults — active pill has gold (#e8962a) background, inactive has border-only. Smooth transition.
- **All cards render**: No "show more" button. Every skill in `result.gradedSkills` renders.
- **Empty filter state**: Shows "No {filter} skills found" message.

GradedSkillCard enhancements:
- **Left border color**: Green (#22c55e) for A grades, Gold (#e8962a) for B, Orange (#e06820) for C, Red (#dc2626) for D/F.
- **5-tab system**: Overview | Bio | Motion | Injury | Drills — gold active tab, transparent inactive.
- **Clip bar**: Consolidated timestamp button, speed buttons, skeleton toggle in one row.

Tab contents:
| Tab | Content |
|---|---|
| Overview | Deduction box (orange) + Correct Form box (green) + Strength box (gold) + Coach Note (blue, if present) |
| Bio | 2-column grid of joint cards — joint name, actual degrees (colored Space Mono), ideal degrees, gauge bar, status label |
| Motion | Frame thumbnail from captured frame data, or placeholder message |
| Injury | Risk descriptions with prevention protocols, or "all clear" message |
| Drills | 3 drill cards per skill — numbered badge, drill name, sets/reps (Space Mono), coaching cue. Context-aware: BHS drills for handspring skills, leap drills for dance, etc. |

**Result: PASS**

### Test 5 — Mobile Responsiveness

- All screens use `maxWidth: 540px` with `margin: 0 auto`
- Side padding: 18px (gives 339px content width on 375px devices)
- No fixed pixel widths exceeding 375px found
- Horizontal scroll only on intentional scroll containers (context strip cards, filter pills, results tabs) with `overflowX: auto` and `WebkitOverflowScrolling: touch`
- Flex-wrap used on clip bar for narrow screens

**Result: PASS**

### Build Status
- `npx react-scripts build` — Compiled successfully (259.28 kB gzipped JS, +2.72 kB from new UI)

### Files Modified
- `src/LegacyApp.js` — Full color migration (400+ replacements), Overview tab rebuilt with 8 premium sections, Skills tab filter pills + 5-tab card system, left border grade colors
- `src/styles/global.css` — CSS custom properties updated to locked design system
- `src/components/shared/StriveLogo.js` — Color migration
- `src/components/onboarding/SplashScreen.js` — Color migration
- `src/components/timeline/SkillTimeline.js` — Color migration
- `src/components/analysis/SkillCard.js` — Color migration
- `src/components/video/VideoAnalyzer.js` — Color migration
