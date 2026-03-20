# STRIVE TECHNICAL AUDIT — March 20, 2026

> **Auditor:** Senior Full-Stack Engineer (Claude Opus 4.6)
> **Scope:** Complete codebase read — zero changes made
> **Verdict:** Core AI pipeline works. App is NOT launchable. 8 P0 blockers.

---

## STEP 1: FILE INVENTORY

### Source Code (Application)

| File | Lines | Purpose |
|------|------:|---------|
| `src/LegacyApp.js` | 11,610 | **Monolith** — all screens, AI pipeline, scoring logic, state management, UI rendering |
| `src/App.js` | 15 | Thin wrapper — adds TierProvider context around LegacyApp |
| `src/index.js` | ~10 | CRA entry point |
| `src/context/TierContext.js` | 216 | Tier state management (Free/Competitive/Elite), feature flags, analysis cap counter |
| `src/screens/ResultsScreen/index.js` | 134 | Tier router — delegates to Layer1/2/3 |
| `src/screens/ResultsScreen/Layer1Free.js` | 355 | Free tier results — score + 2 sentences + upgrade CTA |
| `src/screens/ResultsScreen/Layer2Competitive.js` | 628 | Competitive results — full skill breakdown + VideoReviewPlayer |
| `src/screens/ResultsScreen/Layer3Elite.js` | 903 | Elite results — what-if simulator, diagnostics, coach report |
| `src/screens/ResultsScreen/ScoreHero.js` | 201 | Animated score display with delta from previous |
| `src/screens/ResultsScreen/RoadToNextLevel.js` | 334 | Level progression comparison |
| `src/screens/DashboardScreen/index.js` | 347 | Dashboard with daily encouragement |
| `src/screens/TrainingScreen/index.js` | 368 | Drills, strength, mental, nutrition tabs |
| `src/components/ui/SkillCard.js` | 1,096 | Expandable per-skill card (faults, body mechanics, injury, drills) |
| `src/components/analysis/SkillCard.js` | 228 | **DEAD CODE** — older SkillCard, only used by dead VideoAnalyzer |
| `src/components/video/VideoReviewPlayer.js` | 569 | Slow-mo, seek-to-skill, skeleton overlay, frame capture, perfect form |
| `src/components/video/VideoAnalyzer.js` | 478 | **DEAD CODE** — upload + analysis via MediaPipe pipeline, never imported by LegacyApp |
| `src/components/billing/UpgradeModal.js` | 338 | Stripe checkout modal (all 4 tiers + interval toggle) |
| `src/components/legal/AgeGate.js` | 282 | Date-of-birth collector, age calculation, minor detection |
| `src/components/legal/ParentalConsent.js` | 402 | COPPA consent form — parent name, email, checkboxes |
| `src/components/legal/LegalDisclaimer.js` | 237 | AI-generated content disclaimer |
| `src/components/legal/PrivacyNotice.js` | 217 | Privacy notice shown during onboarding |
| `src/components/onboarding/SplashScreen.js` | 146 | Initial app splash screen |
| `src/components/shared/StriveLogo.js` | 97 | SVG logo component |
| `src/components/timeline/SkillTimeline.js` | 164 | Visual timeline of skills in a routine |
| `src/data/constants.js` | 424 | LEVELS, LEVEL_SKILLS, SCORE_BENCHMARKS, EVENT_JUDGING_RULES |
| `src/data/codeOfPoints.js` | 2,107 | Full Code of Points deduction reference, builds prompt blocks |
| `src/data/eventDeductions.js` | 451 | Event-specific deduction tables + strictness guidance |
| `src/data/affirmations.js` | 139 | Daily encouragement messages |
| `src/utils/storage.js` | 24 | Simple localStorage wrapper |
| `src/utils/helpers.js` | 49 | safeStr, safeArray, safeNum utilities |
| `src/utils/validation.js` | 62 | Input validation helpers |
| `src/overlay/skeletonOverlay.js` | 169 | Canvas-based skeleton drawing |
| `src/styles/global.css` | 314 | Global styles and animations |

### Analysis Pipeline (DEAD CODE — never called from main app)

| File | Lines | Purpose |
|------|------:|---------|
| `src/analysis/analysisPipeline.js` | 110 | Orchestrator: frames -> MediaPipe -> segmentation -> biomechanics |
| `src/analysis/poseDetector.js` | 145 | MediaPipe PoseLandmarker wrapper |
| `src/analysis/biomechanics.js` | 197 | Joint angle computation, deduction inference |
| `src/analysis/frameExtractor.js` | 58 | Video -> canvas frame extraction |
| `src/analysis/skillSegmentation.js` | 172 | Velocity-based skill boundary detection |

### API Layer (Vercel Serverless)

| File | Lines | Purpose |
|------|------:|---------|
| `api/gemini-key.js` | 55 | Returns GEMINI_API_KEY to authenticated clients (**SECURITY: returns raw key to browser**) |
| `api/analyze.js` | 155 | Server-side Gemini proxy (text-only, no video upload) |
| `api/create-checkout.js` | 85 | Stripe checkout session creation |
| `api/webhook.js` | 88 | Stripe webhook handler (logs only — TODO: no database write) |

### Config / Infrastructure

| File | Lines | Purpose |
|------|------:|---------|
| `vercel.json` | 27 | Build config, rewrites, security headers, CSP |
| `package.json` | 36 | Dependencies: React 19, recharts 3, @mediapipe/tasks-vision |
| `server.js` | 37 | Local Express dev server |
| `playwright.config.js` | ~30 | E2E test config |
| `STRATEGY.md` | 331 | Governing strategy document |
| `CLAUDE.md` | ~200 | AI assistant instructions |

### Tests

| File | Purpose |
|------|---------|
| `tests/e2e/app-loads.spec.js` | Basic app load test |
| `tests/e2e/demo-analysis.spec.js` | Demo analysis flow |
| `tests/e2e/navigation.spec.js` | Navigation between screens |
| `tests/e2e/onboarding.spec.js` | Onboarding flow |
| `tests/e2e/recharts.spec.js` | Recharts rendering |
| `src/scoring-engine.test.js` | Unit test for scoring |

### Non-Code Files (Reports / Docs)

| File | Purpose |
|------|---------|
| `AUDIT_REPORT.md` | Prior audit |
| `BUG_PRIORITY_LIST.md` | Prior bug list |
| `MARKET_REPORT.md` | Market research |
| `RED_TEAM_AUDIT.md` | Prior security audit |
| `STRATEGIC_REPORT.md` | Strategy notes |
| `VISION_REPORT.md` | Vision doc |
| `RECON_REPORT.md` | Competitor recon |
| `SPRINT_PLAN.md` | Prior sprint plan |
| `BLOCKED.md` | Blocked items |
| `AGENT_LOG.md` | Agent activity log |
| `STRIVE_MASTER_STRATEGY.html` | Strategy (HTML v1) |
| `STRIVE_MASTER_STRATEGY_v2.html` | Strategy (HTML v2) |
| `legal/PRIVACY_POLICY.md` | Privacy policy draft |
| `legal/TERMS_OF_SERVICE.md` | ToS draft |
| `mockup/index.html` | UI mockup |
| `handover-pessimistic-judge/` | Patch files + data for pessimistic judge system (not integrated) |

---

## STEP 2: ARCHITECTURE MAP

### Frontend Framework
- **React 19** via Create React App (CRA)
- Single-page app, **no router library** — screen state managed via `useState("splash" | "dashboard" | "upload" | "analyzing" | "results" | "settings" | ...)`
- Lazy loading for TrainingScreen, ResultsScreen, DashboardScreen, UpgradeModal
- All inline styles — no CSS modules, no Tailwind, no styled-components
- Recharts for charts (LineChart, AreaChart, BarChart, RadarChart)

### State Management
- **All local state** via `useState` in the monolithic LegacyApp component
- **TWO INDEPENDENT TIER SYSTEMS that never talk to each other:**
  1. `TierContext.js` — proper React context with `useTier()` hook, feature flags, analysis counter using key `strive-analyses-month`
  2. `LegacyApp.js` — direct `localStorage.getItem("strive-tier")` reads, own `normalizedTier` logic, counter using key `strive-analysis-count`
- The extracted screen components (ResultsScreen, DashboardScreen) receive tier as a prop from LegacyApp — they do NOT use TierContext either
- TierContext is wrapped around the app via App.js but **nothing consumes it** in the main flow

### Data Persistence
- **localStorage only** — no database, no cloud sync, no user accounts
- Storage keys:
  - `strive-profile` — athlete profile (name, gender, level, DOB, consent)
  - `strive-history` — array of analysis summaries (last 50)
  - `strive-saved-results` — full result objects keyed by timestamp ID
  - `strive-tier` — current tier string ("free" / "competitive" / "elite")
  - `strive-analysis-count` — monthly analysis count (LegacyApp)
  - `strive-analyses-month` — monthly analysis count (TierContext — different key!)
  - `strive-gemini-key` — user-entered Gemini API key
  - `strive_athlete_*` — per-athlete intelligence records (base64 name key)
  - `strive_cache_*` — cached analysis results (24hr TTL, keyed by video fingerprint)
  - `strive_recent_analyses` — last 5 analyses for offline access

### Routing
- No router. Manual `screen` state string drives a large conditional render block in LegacyApp's return statement
- Screens: splash, onboarding, dashboard, upload, analyzing, results, settings, training, progress, mental, goals, meetFocus, deductions, compare

### Backend / API Layer
- **Vercel serverless functions** (4 endpoints):
  - `GET /api/gemini-key` — returns raw GEMINI_API_KEY (origin + token validation)
  - `POST /api/analyze` — server-side Gemini text analysis (biomechanics data only, no video)
  - `POST /api/create-checkout` — Stripe checkout session creation
  - `POST /api/webhook` — Stripe webhook handler (console.log only, 3 TODO comments for DB writes)

### AI Pipeline (actual runtime flow)
```
User uploads video in UploadScreen
  -> Compresses if >100MB via MediaRecorder re-encoding to WebM
  -> Stores File object in ref, creates blob URL

AnalyzingScreen mounts
  -> extractFrames(): seek-based or playback-based canvas extraction (24 frames)
  -> analyzeWithAI(frames):
      1. Fetch API key: GET /api/gemini-key -> returns raw key
         OR fallback: localStorage "strive-gemini-key" (user-entered)
      2. Check localStorage cache (24hr TTL, fingerprinted by video+profile+prompt version)
      3. Upload video to Gemini File API (resumable upload protocol)
      4. Poll file status until ACTIVE (2s intervals, 40 max polls = 80s timeout)
      5. Build prompt: buildJudgingPrompt() — dynamic based on level/event/gender
      6. Call gemini-2.5-flash:generateContent (video + text prompt)
         Config: temp=0.1, topP=1, topK=1, seed=42, maxOutput=16384, JSON mode
      7. Retry once if response is short or missing "skills"
      8. Parse JSON response (fallback: pipe-delimited table parser)
      9. Post-processing:
         - Deduction capping (hardcoded max per fault type)
         - Split angle validation (remove deductions if angle meets level minimum)
         - Combo pass merging (skills within 2 seconds)
         - USAG 0.025 rounding
      10. CODE computes final score: 10.0 - (exec + artistry + composition)
      11. Cache result in localStorage
  -> Falls back to generateDemoResult() on ANY error (hardcoded fake data)

Result rendered via NewResultsScreen -> Layer1Free / Layer2Competitive / Layer3Elite
  based on normalizedTier prop from LegacyApp
```

**What does NOT happen (despite being in the codebase):**
- MediaPipe pose detection (dead code in `src/analysis/`)
- Real biomechanics angle measurement (dead code)
- Skill segmentation (dead code)
- The `src/components/video/VideoAnalyzer.js` component (dead code)
- Claude Sonnet fallback (referenced in CLAUDE.md/STRATEGY.md but `analyzeWithClaude` no longer exists in code)

---

## STEP 3: AI PIPELINE DEEP DIVE

### Pass Structure
**SINGLE PASS.** Despite:
- Comments in code referencing "2-PASS" (line 4340) and "STRIVE DIRECT JUDGING SYSTEM" (line 4351)
- A UI showing "Detect -> Judge -> Verify" progress steps (line 5256-5300)
- STRATEGY.md mentioning "single-pass"

The reality: ONE Gemini API call. The progress UI animates through fake stages based on percentage thresholds, not actual pipeline stages. The "Detect/Judge/Verify" labels are cosmetic.

### Video Upload to Gemini
```javascript
// LegacyApp.js:4234 — uploadVideoToGemini()
// Step 1: Initiate resumable upload
POST https://generativelanguage.googleapis.com/upload/v1beta/files?key={apiKey}
Headers:
  X-Goog-Upload-Protocol: resumable
  X-Goog-Upload-Command: start
  X-Goog-Upload-Header-Content-Length: {videoFile.size}
  X-Goog-Upload-Header-Content-Type: {mimeType}
Body: { file: { display_name: "routine_{timestamp}" } }

// Step 2: Upload video bytes
POST {uploadUrl from step 1}
Headers:
  X-Goog-Upload-Command: upload, finalize
  X-Goog-Upload-Offset: 0
  Content-Length: {videoFile.size}
Body: raw video file

// Step 3: Poll until ACTIVE
GET https://generativelanguage.googleapis.com/v1beta/{fileName}?key={apiKey}
Every 2 seconds, max 40 polls (80 second timeout)
```

No resolution or quality settings are passed. Original video quality is preserved. No frame rate reduction. No pre-processing beyond the optional >100MB compression.

### Model Configuration
```javascript
// LegacyApp.js:4301 — geminiGenerate()
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={apiKey}

{
  contents: [{
    parts: [
      { file_data: { file_uri, mime_type } },   // uploaded video
      { text: prompt }                           // judging prompt
    ]
  }],
  generationConfig: {
    temperature: 0.1,
    topP: 1,
    topK: 1,
    maxOutputTokens: 16384,
    seed: 42,
    responseMimeType: "application/json"
  }
}
```

- **No thinking budget configured** — no `thinkingConfig` in the request body
- `seed: 42` for deterministic output (scoring consistency requirement)
- Response filtering strips `thought` parts: `parts.filter(p => p.text && !p.thought)`
- Raw response stored in `localStorage` for debugging: `debug-gemini-judge-*`

### Judging Prompt (Verbatim Core — LegacyApp.js:4533-4663)

```
You are a Brevet-certified USA Gymnastics judge at a State Championship. You give NO benefit of the doubt. When in doubt, take the HIGHER deduction. Your job is to find EVERY fault so the athlete can improve. You are a PESSIMISTIC judge — you look for reasons to DEDUCT, not reasons to celebrate.

ATHLETE: {name} | {gender} {level} | EVENT: {event}

{programContext — compulsory/optional/xcel/elite specific rules}
{skillsLine — required skills for level+event}
{benchLine — score benchmarks: avg, top 10%, range}

{eventSpecificBlock — from EVENT_JUDGING_RULES:}
  - Strictness directive (e.g., beam requires stricter judging)
  - Perspective bias warning
  - Compound deduction rules
  - Hidden deductions checklist
  - Rhythm/flow rules
  - Special requirements for level
  - Skill counting guidance per apparatus
  - Calibration override (expected deduction range)

{detailedEventDeductions — from eventDeductions.js}
{strictnessGuidance — from eventDeductions.js}
{copBlock — from codeOfPoints.js: full USAG deduction tables}

KEY RULES:
1. INDIVIDUAL ELEMENTS: Break every skill apart... RO + BHS + Back Tuck = THREE entries...
2. MICRO-DEDUCTIONS: Flexed feet, soft knees... 0.05 each, ONLY when clearly visible...
3. LANDINGS: Only FINAL landing gets full deductions...
4. ARTISTRY — THE HIDDEN DEDUCTIONS (typically 0.15-0.35 total for youth)...
5. SPLIT LEAPS: {level} requires {splitMin}°...
6. CALIBRATION — THIS IS CRITICAL:
   - Target range: {min}–{max} for most {level} {event} routines
   - Score of 8.7–9.2 typical at State Championships
   - Below {min} = too LENIENT
   - Above {max} = too HARSH

EXECUTION FAULTS — USA Gymnastics official deduction scale (0.05 increments only):
  Bent arms:        slight=0.05  noticeable=0.10  significant=0.20  severe=0.30
  Bent knees/legs:  slight=0.05  noticeable=0.10  significant=0.20  severe=0.30
  Leg separation:   visible=0.10  wide=0.20
  Flexed feet:      0.05 per occurrence
  {... more standards ...}

LANDING FAULTS:
  Small step: 0.05    Medium step: 0.10    Large step/lunge: 0.20-0.30
  Squat: 0.10-0.20    Deep squat: 0.30     Fall: 0.50

ARTISTRY & COMPOSITION FAULTS — use "Global" timestamp. MANDATORY to evaluate:
  {detailed artistry deduction list}
  NOTE: If you have 0.00 artistry deductions, you are WRONG — re-evaluate.

SPLIT LEAP/JUMP REQUIREMENT at {level}: minimum {splitMin}°
  {deduction scale by angle shortfall}

{Full JSON schema example with skills[], artistry{}, composition{}, summary{}}

JSON RULES:
- Output ONLY the JSON. No markdown, no backticks.
- Every individual element gets its own entry.
- Deduction values: 0.00, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.50 ONLY.
- If total deductions < 0.80, you are too lenient. Re-evaluate.
- If total deductions > 1.50, you are too harsh. Target: 0.90-1.20 total.

SECOND-PASS CHECK (do this AFTER your initial assessment):
Re-watch the routine focusing ONLY on these commonly missed items:
1. Feet — were there flexed feet you missed?
2. Pauses — any hesitations or rhythm breaks?
3. Landings — did you deduct for every step, hop, or squat?
4. Split leaps — is the angle truly at or above {splitMin}°?
5. Arms — any bent arm moments in support or flight?
```

**Prompt length:** Variable, approximately 3,000-5,000 characters depending on level/event. With Code of Points block, can reach 8,000+.

### Response Parsing (LegacyApp.js:4789-4887)

1. **Primary:** Extract JSON via regex `rawResponse.match(/\{[\s\S]*\}/)`, parse with `JSON.parse()`
2. **Fallback:** Pipe-delimited table parser for legacy/cached responses
3. Extracts: `skills[]`, `artistry{}`, `composition{}`, `summary{}`
4. Maps Gemini skill names, timestamps, faults, bodyMechanics to internal structure

### Score Computation (LegacyApp.js:4988-5076)

```javascript
// All deductions clamped to 0.05 increments, max 2.0 per skill
const deduction = Math.round(Math.min(raw, 2.0) / 0.05) * 0.05;

// Sum by category
const execTotal  = roundToUSAG(execSkills.reduce(sum));    // USAG 0.025 rounding
const artTotal   = roundToUSAG(richArtTotal || artSkills.reduce(sum));
const compTotal  = roundToUSAG(compositionTotal);
const totalDed   = execTotal + artTotal + compTotal;

// Final score
const finalScore = Math.max(0, 10.0 - totalDed);
```

### Server-Side Proxy Prompt (api/analyze.js:108-155)

**Completely different and much weaker prompt:**
```
You are an expert USA Gymnastics and FIG certified judge.

Athlete: {name}
Event: {event}
Level: {level}

Biomechanics data from pose analysis:
  Skill 1: {skillName} @ {start}s
   - Knee angle (peak): {kneeAngle}°
   - Hip angle (peak): {hipAngle}°
   ...

Respond with ONLY a JSON object in this exact format:
{ "overallScore", "skills": [...], "topFixes", "strengths", "trainingDrills" }
```

This prompt receives NO video — only angle measurements. It uses a different JSON schema. **Results from this path will be significantly lower quality.** This path is used when the client has no API key for direct upload but the server has GEMINI_API_KEY.

---

## STEP 4: FEATURE INVENTORY

| # | Feature | Working? | Real or Placeholder? | Phase 1 Required? |
|---|---------|----------|---------------------|--------------------|
| 1 | Video upload + compression (>100MB) | YES | Real — MediaRecorder re-encoding | Yes |
| 2 | Gemini video analysis (full video) | YES (with API key) | Real — actual AI analysis | Yes |
| 3 | Score computation (code-side) | YES | Real — 10.0 minus sum of deductions | Yes |
| 4 | 3-layer results (Free/Comp/Elite) | YES | Real — tier-gated rendering | Yes |
| 5 | Skill-by-skill cards with expand/collapse | YES | Real — 1,096-line component | Yes |
| 6 | Per-skill faults with deduction amounts | YES | Real — from Gemini JSON | Yes |
| 7 | VideoReviewPlayer (slow-mo, seek, capture) | YES | Real — native video element | Competitive |
| 8 | Skeleton overlay on frame capture | PARTIAL | **Semi-decorative** — draws skeleton but data source is Gemini text, not MediaPipe measurement | Competitive |
| 9 | Perfect form comparison | YES (UI) | **Reference only** — shows text description, not visual overlay | Competitive |
| 10 | ScoreHero (animated score + delta) | YES | Real | Yes |
| 11 | Road to Next Level | YES | Real — compares current vs next level skills | Yes |
| 12 | Daily encouragement / affirmations | YES | Real — 139 messages in affirmations.js | Yes (all tiers) |
| 13 | AgeGate (date-of-birth) | YES | Real — calculates age, detects minors | Yes (COPPA) |
| 14 | ParentalConsent | YES (UI only) | **NOT ENFORCED** — stored in profile but not verified, no email, bypassable | Yes (COPPA) |
| 15 | LegalDisclaimer | YES | Real — AI content warning | Yes |
| 16 | PrivacyNotice | YES | Real — shown in onboarding | Yes |
| 17 | Onboarding flow (role/name/age/gender/level) | YES | Real | Yes |
| 18 | Tier switcher in Settings | YES | Real — but it's a **debug toggle**, not payment-gated | Yes |
| 19 | Free tier 3/month cap | PARTIAL | **Display-only** — dashboard blocks upload button, but analyzeWithAI() has no check | Yes |
| 20 | UpgradeModal + Stripe checkout | SCAFFOLDED | **NON-FUNCTIONAL** — Stripe not configured, will return 503 | Yes |
| 21 | Stripe webhook -> tier update | SCAFFOLDED | **LOGS ONLY** — 3 TODO comments, no database, no tier change | Yes |
| 22 | Training tab (drills/strength/mental/nutrition) | YES (UI) | **Generic content** — not connected to analysis drill recs | Yes |
| 23 | Athlete intelligence (fault tracking) | YES | Real — per-athlete localStorage records | Nice-to-have |
| 24 | Fault trend analysis | YES | Real — computes from stored history | Elite |
| 25 | Weekly drill plan generation | YES | Real — generated from fault data | Nice-to-have |
| 26 | Goal tracking (target score/meet) | YES | Real — points-per-week projection | Nice-to-have |
| 27 | What-If simulator | YES | Real — in Layer3Elite | Elite |
| 28 | Session diagnostics | YES | Real — in Layer3Elite | Elite |
| 29 | Coach report | YES | Real — in Layer3Elite | Elite |
| 30 | Score caching (24hr, fingerprinted) | YES | Real — prevents re-analysis cost | Yes |
| 31 | Offline detection + cached results | YES | Real — shows banner, serves cached data | Nice-to-have |
| 32 | Compare analyses side-by-side | YES | Real — in settings/history | Nice-to-have |
| 33 | Demo data fallback on error | YES | Real — but not labeled as demo in UI | Yes |
| 34 | MediaPipe pose detection pipeline | **DEAD CODE** | Complete implementation but NEVER CALLED | Phase 4 |
| 35 | VideoAnalyzer component | **DEAD CODE** | Never imported by LegacyApp | No |
| 36 | Pre-meet focus screen | YES | Real | Nice-to-have |
| 37 | Score history charts (Recharts) | YES | Real | Nice-to-have |
| 38 | Body mechanics display | YES (UI) | **Text from Gemini** — not measured angles | Competitive |
| 39 | Injury awareness per skill | YES | Real — from Gemini injuryRisk field | Competitive |
| 40 | Auto-detect event from video | YES | Real — Gemini identifies apparatus | Yes |
| 41 | Event-specific judging rules | YES | Real — constants.js EVENT_JUDGING_RULES | Yes |
| 42 | Code of Points prompt injection | YES | Real — 2,107-line codeOfPoints.js | Yes |
| 43 | Deduction capping (post-processing) | YES | Real — hardcoded caps prevent over-deducting | Yes |
| 44 | Combo pass merging | YES | Real — skills within 2s merged | Yes |
| 45 | Analysis count tracking | YES | Real — but two independent counters | Yes |

---

## STEP 5: GAP ANALYSIS vs PHASE 1 LAUNCH REQUIREMENTS

### 1. End-to-end pipeline verified (video upload -> score displayed)
**STATUS: NOT VERIFIED ON PRODUCTION**

The code path exists and appears functional:
1. `/api/gemini-key` fetches the key
2. Video uploads to Gemini File API
3. Single judging prompt sent
4. JSON response parsed
5. Code computes score
6. Result rendered in tier-appropriate screen

**However:**
- No evidence of a clean-state test (cleared localStorage, fresh Vercel deploy)
- If `GEMINI_API_KEY` is not set in Vercel environment variables, the pipeline silently fails — `/api/gemini-key` returns `{ available: false }` (404), the client catches silently, falls through to localStorage key check, and if that's also empty, throws an error that gets caught and triggers `generateDemoResult()` — user gets **fake data with no indication it's fake**
- The retry logic (2 attempts) doesn't retry on fundamentally broken conditions (missing key, quota exceeded)
- Unknown whether GEMINI_API_KEY is actually configured on Vercel

### 2. COPPA / AgeGate consent flow
**STATUS: UI BUILT, NOT ENFORCED**

What works:
- AgeGate component collects date of birth during onboarding (after step 1: name)
- Calculates age, determines if minor (<13)
- If minor: shows ParentalConsent component (parent name, email, 3 checkboxes)
- Consent record stored in profile object in localStorage

What doesn't work:
- **No server-side record of consent** — localStorage only, lost on cache clear
- **No parent email verification** — anyone can type any email
- **No consent withdrawal mechanism**
- **Bypassable** — clear localStorage, re-onboard, skip or lie about age
- **App doesn't block usage if consent is declined** — ParentalConsent shows a "declined" UI but doesn't prevent further app use if user navigates away
- **No age re-verification** — verified once at onboarding, never again
- COPPA requires "verifiable parental consent" — a checkbox form in localStorage does not meet this standard

### 3. Stripe payment integration (3-tier)
**STATUS: SCAFFOLDED, ENTIRELY NON-FUNCTIONAL**

What exists:
- `api/create-checkout.js` — creates Stripe checkout sessions with lookup keys
- `api/webhook.js` — handles 3 event types (checkout.session.completed, subscription.updated, subscription.deleted)
- `UpgradeModal` — UI for selecting tier + interval, calls `/api/create-checkout`
- Correct tier names and prices (Competitive $9.99/$99, Elite $19.99/$199, Coach $49.99/$499)

What is broken:
- **`STRIPE_SECRET_KEY` not configured** — `create-checkout.js` will return 503 ("Billing is not configured")
- **`STRIPE_WEBHOOK_SECRET` not configured** — webhook rejects all events
- **`stripe` package not in `package.json`** — `require('stripe')` will fail on Vercel
- **Webhook has NO database** — all 3 event handlers just `console.log()` with TODO comments
- **No mechanism to update user's tier after payment** — even if Stripe worked, the webhook can't persist the subscription status anywhere
- **Tier is currently a debug toggle** — Settings screen has a tier switcher that directly writes to localStorage, no payment required
- **Module system mismatch** — `create-checkout.js` and `webhook.js` use `module.exports` (CommonJS), while `analyze.js` and `gemini-key.js` use `export default` (ESM)

### 4. Scoring accuracy within 0.10 of real judges
**STATUS: ONE DATA POINT, NOT VALIDATED**

- One test: 8.850 output vs 8.925 actual = 0.075 delta (within 0.10 target)
- STRATEGY.md requires: "Scoring validation (100 routines) — Test across multiple levels/events vs real judge scores"
- Zero evidence of systematic validation across levels, events, or difficulty ranges
- Prompt version is "v7_full_pessimistic" — clearly iterated, but no validation dataset exists

### 5. Real video player (not frame stitching)
**STATUS: WORKING**

VideoReviewPlayer.js (569 lines) is a real implementation:
- Native `<video>` element with HTML5 controls
- Playback rate: 0.25x, 0.5x, 1x, 2x
- Seek-to-skill via timestamp click
- Frame capture: pauses video, draws to canvas, captures as data URL
- Skeleton overlay: draws MediaPipe-style skeleton on captured frames
- `webkit-playsinline` + `preload="auto"` for iOS compatibility
- Not frame stitching — genuine video playback

### 6. Skill-by-skill breakdown UI with expand/collapse
**STATUS: WORKING**

`src/components/ui/SkillCard.js` (1,096 lines):
- Expand/collapse per skill with animation
- Quality score circle with color-coded grade (A through F)
- Timestamp with seek-to-video link
- Individual faults list with deduction amounts and severity colors
- Body mechanics display (from Gemini text, not measured)
- Injury awareness section (from Gemini injuryRisk field)
- Drill recommendation per skill
- Strength note ("what went right")
- Proper USAG deduction color scale (#22c55e through #dc2626)

### 7. Biomechanics data — real or decorative?
**STATUS: DECORATIVE (Gemini text, not measured)**

What the user sees: "Knee angle: Slight bend at snap-down", "Hip alignment: Good extension"
What's actually happening: These are **Gemini's text descriptions** from the `bodyMechanics` field in its JSON response. They are not measured angles from MediaPipe.

The real MediaPipe biomechanics pipeline exists in `src/analysis/biomechanics.js` (197 lines) with actual angle calculation functions (`angleDeg()`, `computeBiomechanics()`, `inferDeductions()`). But this code is **never called** — `VideoAnalyzer.js` imports it but `VideoAnalyzer.js` is never imported by LegacyApp.

Bottom line: Body mechanics data is AI-generated prose, not numerical measurements. It's plausible and useful for coaching, but it's not "real" biomechanics in the sense of measured joint angles.

### 8. Free tier 3-analysis cap enforced
**STATUS: PARTIALLY ENFORCED — BYPASSABLE**

What works:
- Dashboard checks `strive-analysis-count` in localStorage
- If count >= 3, shows "Monthly limit reached" message and hides upload button
- Counter increments after each analysis (LegacyApp.js:1616-1628)
- Counter resets when month changes

What's broken:
- **Two independent counters:**
  - LegacyApp uses key `strive-analysis-count`
  - TierContext uses key `strive-analyses-month`
  - They are never synchronized
- **`analyzeWithAI()` has NO cap check** — the function itself doesn't verify the user has analyses remaining
- **Cap is UI-only** — if a user bookmarks the upload URL or calls the function directly, nothing stops them
- **Dashboard tier check bug** (line 2563): `const isPro = tier === "competitive"` — doesn't include "elite", so Elite users see the cap UI
- **localStorage is user-editable** — any user can open DevTools and reset the counter

### 9. Athlete profile + localStorage persistence vs DB
**STATUS: WORKING (localStorage only)**

Profile stored in `strive-profile` with: name, gender, level, levelCategory, primaryEvents, role, goals, dateOfBirth, parentalConsent record.

History stored in `strive-history`: array of last 50 analysis summaries.

Full results stored in `strive-saved-results`: keyed by timestamp ID, frames stripped for space.

Per-athlete intelligence in `strive_athlete_{base64name}`: analysis history (100 max), fault history (500 max).

**No cloud persistence whatsoever.** User loses all data on: cache clear, new device, new browser, incognito mode. For a paid product at $9.99-19.99/month, this is a critical gap.

---

## STEP 6: LAUNCH BLOCKER CLASSIFICATION

### P0 — Cannot Launch Without This

| ID | Blocker | Impact | Evidence |
|----|---------|--------|----------|
| **P0-1** | **No working payment system** | Zero revenue. Cannot charge users. | `STRIPE_SECRET_KEY` not in Vercel env. `stripe` not in package.json. Webhook has 3 TODO comments for DB writes that don't exist. No mechanism to update tier after payment. |
| **P0-2** | **COPPA consent not legally enforceable** | Legal liability for collecting data from minors without verifiable parental consent. | Consent stored in localStorage only. No parent email verification. No server-side record. Bypassable by clearing storage. Does not meet COPPA "verifiable parental consent" standard. |
| **P0-3** | **API key exposed to browser** | Anyone can steal GEMINI_API_KEY from DevTools Network tab. Burns quota, generates cost, enables abuse. | `api/gemini-key.js:54`: `res.status(200).json({ available: true, key })` returns raw key. Client uses it directly for Gemini File API uploads. |
| **P0-4** | **Free tier cap bypassable** | Free users get unlimited analyses. Revenue model depends on cap driving upgrades. | `analyzeWithAI()` has no cap check. Dashboard hides button but doesn't block the pipeline. Two independent counters (`strive-analysis-count` vs `strive-analyses-month`) never synchronized. |
| **P0-5** | **Tier management split across two unsynchronized systems** | Users may see wrong tier, wrong features, wrong caps. | LegacyApp reads localStorage directly, never calls `useTier()`. TierContext wraps app but nothing in the main flow consumes it. Different storage keys for analysis counting. |
| **P0-6** | **normalizedTier bug — legacy "pro" mapping is a no-op** | Any user with legacy `pro` tier stored in localStorage gets treated as "free" | Line 1518: `userTier === "competitive" ? "competitive" : userTier` — maps competitive->competitive (identity). Comment says "Map legacy pro to competitive" but code doesn't do that. Should be `userTier === "pro" ? "competitive" : userTier`. |
| **P0-7** | **No production deployment verification** | Unknown if core pipeline works on Vercel. Demo fallback hides failures silently. | No clean-state test evidence. If GEMINI_API_KEY isn't set, user gets fake demo results with no warning. `generateDemoResult()` called on ANY error — user can't distinguish real from fake. |
| **P0-8** | **No database — paid users lose everything on cache clear** | User pays $9.99/month, clears browser cache, loses all history, profile, and subscription status. | All persistence is localStorage. Webhook can't store subscription status. No recovery mechanism. No user accounts. Unacceptable for a paid product. |

### P1 — Should Fix Pre-Launch (Not Hard Blockers)

| ID | Issue | Impact |
|----|-------|--------|
| **P1-1** | Scoring validation incomplete (1 of 100 routines tested) | Risk of inaccurate scores damaging trust and reviews |
| **P1-2** | Training tab not connected to analysis drill recs | Feature gap — training shows generic content, not personalized |
| **P1-3** | Biomechanics is AI-generated text, not measured angles | Marketing risk if claimed as "biomechanics analysis" |
| **P1-4** | Duplicate SkillCard components (ui/ and analysis/) | Maintenance confusion, 228 lines of dead code |
| **P1-5** | Server-side proxy (`api/analyze.js`) has different, weaker prompt | If server path is used, results quality drops significantly |
| **P1-6** | Hardcoded auth token (`strive-2026-launch`) in source code | Anyone reading source can call API endpoints |
| **P1-7** | Module system mismatch in API functions (CommonJS vs ESM) | Potential Vercel deployment failures |
| **P1-8** | Dashboard still shows Competitive/Elite features in Free tier | Strategy doc calls this out as incomplete |
| **P1-9** | Demo results not labeled as demo in UI | User can't tell if they got real AI analysis or hardcoded fake data |
| **P1-10** | `stripe` package missing from package.json | `require('stripe')` will crash on Vercel even if secret key is set |
| **P1-11** | Dashboard tier check excludes "elite" from paid check | Elite users see "Monthly limit reached" UI (line 2563) |
| **P1-12** | UI claims "3-pass analysis engine" but code is single-pass | Misleading, could damage trust if discovered |
| **P1-13** | `.env.local` contains Vercel OIDC JWT token | Security credential committed to git |

### P2 — Phase 2+ Items (Do NOT Build Yet)

| ID | Item | Phase |
|----|------|-------|
| P2-1 | User accounts + cloud sync (Supabase Auth + Postgres) | Phase 2 |
| P2-2 | Push notifications (weekly digest, new analysis) | Phase 2 |
| P2-3 | Drill completion tracking | Phase 2 |
| P2-4 | Coach accounts + "Share with Coach" links | Phase 2 |
| P2-5 | Coach referral program | Phase 2 |
| P2-6 | Real MediaPipe full-video pose detection | Phase 4 |
| P2-7 | D-score / composition analysis | Phase 4 |
| P2-8 | Multi-athlete family accounts | Phase 4 |
| P2-9 | Figure skating / cheer / diving expansion | Phase 4 |
| P2-10 | PDF report export | Phase 3 |
| P2-11 | Gym Club License | Phase 3 |

---

## STEP 7: KNOWN ISSUES LOG

### Security Issues

| Severity | Issue | Location | Detail |
|----------|-------|----------|--------|
| **CRITICAL** | API key leaked to browser | `api/gemini-key.js:54` | `res.json({ available: true, key })` returns raw GEMINI_API_KEY. Visible in DevTools Network tab. Any user can extract and abuse it. |
| **HIGH** | Hardcoded auth token in source | 4 files | `strive-2026-launch` appears in `LegacyApp.js:3298`, `LegacyApp.js:4675`, `api/analyze.js:33`, `api/gemini-key.js:28`. Source is public on GitHub. Zero security value. |
| **HIGH** | OIDC token in `.env.local` | `.env.local:20` | Full Vercel OIDC JWT committed to repo. Contains project IDs, team info. Should be in `.gitignore`. |
| **MEDIUM** | Inconsistent CORS patterns | `api/*.js` | `gemini-key.js` and `analyze.js` use regex `strive-app*.vercel.app` allowing any matching domain. `create-checkout.js` uses strict allowlist. |
| **MEDIUM** | No rate limiting on API endpoints | `api/*.js` | No request throttling. An attacker with the token can spam endpoints. |
| **LOW** | CSP allows `unsafe-inline` and `unsafe-eval` | `vercel.json:17` | Required for CRA but weakens XSS protection. |

### Bugs

| Severity | Bug | Location | Detail |
|----------|-----|----------|--------|
| **HIGH** | normalizedTier is a no-op | `LegacyApp.js:1518` | `userTier === "competitive" ? "competitive" : userTier` — identity function. Should be `userTier === "pro" ? "competitive" : userTier`. Legacy "pro" users get Free tier. |
| **HIGH** | Dual tier counting systems | `LegacyApp.js:1619` vs `TierContext.js:103` | LegacyApp uses `strive-analysis-count`, TierContext uses `strive-analyses-month`. Different keys, never synchronized. |
| **HIGH** | LegacyApp ignores TierContext entirely | `LegacyApp.js` | `useTier()` is never called. TierContext wraps the app but main flow bypasses it completely. |
| **HIGH** | Analysis not blocked by free cap | `LegacyApp.js:4667` | `analyzeWithAI()` has zero cap check. Only dashboard UI is gated. |
| **MEDIUM** | Dashboard isPro excludes Elite | `LegacyApp.js:2563` | `const isPro = tier === "competitive"` — should also check `tier === "elite"`. Elite users see "Monthly limit reached". |
| **MEDIUM** | UI says "3-pass" but code is single-pass | `LegacyApp.js:5256-5300` | "Detect -> Judge -> Verify" progress indicator is cosmetic. One API call. |
| **LOW** | `confidence: 0.92` hardcoded for every skill | `LegacyApp.js:5027` | All skills show 92% confidence regardless of actual analysis quality. |
| **LOW** | Demo results not indicated in UI | `LegacyApp.js:5222` | When AI fails, `generateDemoResult()` produces fake data. `failureReason` is set but not prominently displayed. User may believe it's a real analysis. |

### Dead Code

| Location | Lines | Detail |
|----------|------:|--------|
| `src/analysis/` (5 files) | 682 | Complete MediaPipe pipeline — never imported by LegacyApp |
| `src/components/video/VideoAnalyzer.js` | 478 | Upload + analysis via MediaPipe — never imported |
| `src/components/analysis/SkillCard.js` | 228 | Older SkillCard — only used by dead VideoAnalyzer |
| `handover-pessimistic-judge/` | ~500 | Patch files and duplicated data files |
| `LegacyApp.js` test harness | ~80 | `window.__striveIntelTests` (line 549) — test functions exposed on window |

### Hardcoded Values

| Value | Location | Issue |
|-------|----------|-------|
| `BUILD_VERSION = "1.0.0"` | `LegacyApp.js:18` | Never updated |
| `PROMPT_VERSION = "v7_full_pessimistic"` | `LegacyApp.js:4688` | Must be bumped when prompt changes or cache serves stale results |
| `confidence: 0.92` | `LegacyApp.js:5027` | Fake confidence on every skill |
| `strive-2026-launch` | 4 files | Hardcoded auth token |
| `seed: 42` | `LegacyApp.js:4316` | Deterministic but limits response variety |

### Missing Environment Variables (Vercel)

| Variable | Required For | Status |
|----------|-------------|--------|
| `GEMINI_API_KEY` | Core analysis pipeline | **Unknown if set** — pipeline fails silently without it |
| `STRIPE_SECRET_KEY` | Payment processing | **Not set** — billing returns 503 |
| `STRIPE_WEBHOOK_SECRET` | Webhook verification | **Not set** — webhook rejects all events |
| `STRIVE_APP_TOKEN` | API authentication | Defaults to hardcoded `strive-2026-launch` |

### Dependency Issues

| Issue | Detail |
|-------|--------|
| `stripe` not in package.json | `api/create-checkout.js` and `api/webhook.js` do `require('stripe')` but it's not a dependency. Will crash on Vercel. |
| `@mediapipe/tasks-vision` in dependencies but unused | 682 lines of dead code import this. Adds to bundle size for no reason. |
| React 19 (bleeding edge) | May have compatibility issues; released very recently |
| Mixed module systems in API | `create-checkout.js` and `webhook.js` use CommonJS; `analyze.js` and `gemini-key.js` use ESM |

---

## EXECUTIVE SUMMARY

### What Works
The core value proposition is real: upload a gymnastics video, get a scored analysis with per-skill breakdowns, faults, and coaching recommendations. The Gemini integration is well-engineered with thoughtful prompt design, deduction capping, and score calibration. The UI is polished with a coherent design system. The 3-tier results screens are built and functional.

### What Doesn't Work
Everything surrounding the core pipeline — payment, persistence, security, legal compliance, and tier enforcement — is either scaffolded, broken, or missing. The app is a prototype pretending to be a product.

### The 8 Things That Must Be True Before Launch
1. Users can pay money and get the tier they paid for (Stripe + DB + webhook)
2. Parental consent is legally defensible (server-side, verified)
3. The API key can't be stolen from the browser (proxy all calls)
4. Free users can't get unlimited analyses (enforce cap in pipeline)
5. Tier state is consistent across the entire app (one system, not two)
6. A cache clear doesn't destroy a paying user's account (cloud persistence)
7. Real analysis is distinguishable from demo fallback (clear labeling)
8. The pipeline works on a clean Vercel deployment (verified end-to-end)

### Estimated Effort
Fixing the 8 P0 blockers requires: a database (Supabase), server-side Gemini proxy for video, Stripe wiring, unified tier management, and COPPA compliance work. This is roughly 5 focused build phases, each 1-2 days of engineering work.
