# AUDIT REPORT — Strive Forensic Assessment
> Forensic Auditor | March 20, 2026

---

## Table of Contents
1. [Full Feature Inventory](#1-full-feature-inventory)
2. [Known Bugs](#2-known-bugs)
3. [Dead Code Map](#3-dead-code-map)
4. [Performance Bottlenecks](#4-performance-bottlenecks-top-5-re-render-triggers)
5. [Security Audit](#5-security-audit)
6. [Dual Tier System Problem](#6-the-dual-tier-system-problem)
7. [localStorage Usage & 5MB Limit Risk](#7-localstorage-usage--5mb-limit-risk)
8. [Gemini Pipeline Trace](#8-the-gemini-pipeline-full-trace)

---

## 1. Full Feature Inventory

### Working
| Feature | Location | Status |
|---------|----------|--------|
| Onboarding flow (role, name, gender, level, goals) | `LegacyApp.js:2160-2463` | Working |
| AgeGate (DOB, under-13 detection) | `components/legal/AgeGate.js` | Working |
| Parental Consent (COPPA) | `components/legal/ParentalConsent.js` | Working — UI only, **not wired to backend** |
| Privacy Notice | `components/legal/PrivacyNotice.js` | Working |
| Legal Disclaimer (pre-analysis) | `components/legal/LegalDisclaimer.js` | Working |
| Video upload & format detection | `LegacyApp.js:3275-3914` (UploadScreen) | Working |
| Frame extraction (3 strategies: seek, play, single) | `LegacyApp.js:3962-4215` | Working |
| Gemini File API upload (resumable) | `LegacyApp.js:4225-4285` | Working |
| Gemini 2.5 Flash judging prompt | `LegacyApp.js:4353-4632` | Working |
| JSON response parsing (rich format) | `LegacyApp.js:4759-4825` | Working |
| Pipe-delimited fallback parsing (legacy) | `LegacyApp.js:4828-4856` | Working |
| Score computation (code, not AI) | `LegacyApp.js:4957-5046` | Working |
| Deduction clamping (USAG caps) | `LegacyApp.js:4862-4892` | Working |
| Split angle validation by level | `LegacyApp.js:4894-4925` | Working |
| Combination pass merging (2s window) | `LegacyApp.js:4928-4953` | Working |
| Score caching (24h, fingerprinted) | `LegacyApp.js:4655-4681` | Working |
| 3-layer results (Free/Competitive/Elite) | `screens/ResultsScreen/` | Working |
| Score Hero animation (count-up) | `screens/ResultsScreen/ScoreHero.js` | Working |
| Skill cards with grade/faults/drills | `components/ui/SkillCard.js` | Working |
| VideoReviewPlayer (slow-mo, skeleton, frame capture) | `components/video/VideoReviewPlayer.js` | Working |
| Dashboard (old) | `LegacyApp.js:2467-2999` | Working (bypassed in favor of new) |
| Dashboard (new) | `screens/DashboardScreen/index.js` | Working |
| Score benchmark (percentile bar) | `LegacyApp.js:1276-1337` | Working |
| Daily affirmations (role-aware, deterministic) | `LegacyApp.js:2481-2519`, `data/affirmations.js` | Working |
| Meet Day Checklist | `LegacyApp.js:1433-1490` | Working |
| Glossary (parent education) | `LegacyApp.js:1393-1431` | Working |
| Skills Required by Level card | `LegacyApp.js:1359-1391` | Working |
| Bottom navigation (5 tabs) | `LegacyApp.js:1941-1981` | Working |
| Offline detection banner | `LegacyApp.js:1134-1148` | Working |
| Error boundaries (per-section) | `LegacyApp.js:1081-1104` | Working |
| Shimmer loading placeholders | `LegacyApp.js:1107-1132` | Working |
| Athlete Intelligence Layer (fault tracking) | `LegacyApp.js:88-466` | Working |
| Fault normalization (15 categories) | `LegacyApp.js:186-204` | Working |
| Weekly drill plan generation | `LegacyApp.js:369-408` | Working |
| Improvement curves (score + fault trends) | `LegacyApp.js:411-466` | Working |
| Goal tracking (points/week, projection) | `LegacyApp.js:469-543` | Working |
| Share STRIVE (native share API) | `LegacyApp.js:2986-3050` | Working |
| Training Screen | `screens/TrainingScreen/index.js` | Working |
| Upgrade Modal (tier comparison) | `components/billing/UpgradeModal.js` | Working |
| Settings (tier switcher, profile edit, reset) | `LegacyApp.js:8144-8570` | Working |
| Splash screen (animated) | `LegacyApp.js:2020-2158`, `components/onboarding/SplashScreen.js` | Working (duplicated) |

### Partially Working
| Feature | Issue |
|---------|-------|
| COPPA parental consent | UI collects data but **never persists to backend**. No server-side verification. **BLOCKING for launch.** |
| Stripe checkout | `api/create-checkout.js` works, but `api/webhook.js` only logs — **doesn't persist subscription state to any DB**. Tier stays in localStorage. |
| Free tier analysis cap (3/month) | **Dual counter bug**: LegacyApp uses `strive-analysis-count`, TierContext uses `strive-analyses-month`. They never sync. TierContext's counter is never read by LegacyApp. |
| Auto-detect event | Prompt includes auto-detect logic but `detectedEvent` from Gemini is only used for labeling, **never fed back to the dashboard or history**. |
| Road to Next Level | `screens/ResultsScreen/RoadToNextLevel.js` works but only maps to the next numeric level — **breaks for Xcel tiers** (no "next" mapping for Xcel Sapphire). |
| Progress screen (free tier) | Shows upgrade CTA but the **tier check at line 1830 reads localStorage directly**, bypassing TierContext entirely. |

### Broken / Not Working
| Feature | Issue |
|---------|-------|
| `useTier()` hook | **Never called anywhere in LegacyApp.js.** TierContext wraps the app but LegacyApp reads `localStorage.getItem("strive-tier")` directly ~9 times. The entire TierContext/TierProvider system is dead weight. |
| `api/analyze.js` server-side fallback | Uses `gemini-1.5-pro` model (line 66) while client uses `gemini-2.5-flash`. Different models produce different response formats. The server prompt (line 105-151) requests a completely different JSON schema than the client prompt. **If server fallback fires, the response will not parse.** |
| `normalizedTier` logic | Line 1516: `const normalizedTier = userTier === "competitive" ? "competitive" : userTier;` — This is a no-op identity transform that normalizes nothing. It was meant to map `"pro"` to `"competitive"` but the check is wrong. Should be `userTier === "pro" ? "competitive" : userTier`. |
| Offline analysis cache | Recent analyses cached at line 1607-1612, read at line 6626, but **`ResultsScreen` (new) never reads this cache**. The new results screen gets data via props. Offline users see nothing. |
| `src/scoring-engine.test.js` | Test file references pipe-delimited format that the current Gemini prompt no longer produces. Tests will fail against current system. |

---

## 2. Known Bugs

### Priority 1: Degree Symbol (°) — Rendering Audit

The degree symbol `°` (U+00B0) appears in **117 locations** across the codebase. After auditing every instance:

**Rendering correctly (native UTF-8 `°`):**
- `src/LegacyApp.js:1255` — Skeleton overlay angle badge: `{m}°` (SVG text element)
- `src/LegacyApp.js:1257` — Skeleton overlay ideal angle: `/{ideal}°` (SVG text element)
- `src/LegacyApp.js:6354` — Biomechanics angle display: `{...}°` (HTML span)
- `src/LegacyApp.js:6356` — Ideal angle display: `{...}°` (HTML span)
- `src/components/ui/SkillCard.js:773` — Measured angle: `{...}°`
- `src/components/ui/SkillCard.js:784` — Ideal angle: `{...}°`
- `src/components/analysis/SkillCard.js:33` — `{Math.round(value)}°`
- `src/overlay/skeletonOverlay.js:137` — Canvas text: `${Math.round(value)}°`
- All `src/data/constants.js` references (string literals in data)

**No unicode escape issues found.** All degree symbols are native UTF-8 `°` characters, not escaped sequences like `\u00B0`. The file encoding is UTF-8 throughout. **This bug is not present in the current codebase** — it was likely fixed in a prior session or was a display issue on a specific platform.

### Priority 2: Other Bugs

| Bug | File:Line | Severity |
|-----|-----------|----------|
| **Dual analysis counter** — LegacyApp uses `strive-analysis-count`, TierContext uses `strive-analyses-month`. They never sync. Free users get 3+3=6 analyses instead of 3. | `LegacyApp.js:1617` vs `TierContext.js:75` | HIGH |
| **normalizedTier identity no-op** — `userTier === "competitive" ? "competitive" : userTier` normalizes nothing. Legacy "pro" users would keep "pro" tier string. | `LegacyApp.js:1516` | MEDIUM |
| **Dashboard reads localStorage in render** — 6 inline `localStorage.getItem("strive-tier")` calls inside render functions (lines 1830, 1868, 1902, 2560, 2807, 6664). Synchronous IO in render path. | `LegacyApp.js` | MEDIUM |
| **`setShowUpgradeModal` referenced in DashboardScreen (old) but undefined** — `setShowUpgradeModal` is used at line 2590 inside the old DashboardScreen render, but it's a state variable from the parent `LegacyApp`. Closure captures it, but it's confusing and fragile. | `LegacyApp.js:2590` | LOW |
| **Recharts imported but RadarChart/Radar/PolarGrid/PolarAngleAxis may be unused** — Massive import at line 2 pulls in charting libraries that may not render on current screens. Bundle bloat. | `LegacyApp.js:2` | LOW |
| **CORS regex too permissive** — `origin.match(/^https:\/\/strive-app.*\.vercel\.app$/)` matches `strive-app-ANYTHING.vercel.app` including attacker-deployed apps on Vercel. | `api/gemini-key.js:11` | MEDIUM |
| **Hardcoded app token** — `'strive-2026-launch'` is the default token if env var not set. Committed to source. | `api/gemini-key.js:28` | HIGH |
| **`api/analyze.js` uses wrong Gemini model** — Calls `gemini-1.5-pro` (line 66) while client uses `gemini-2.5-flash`. | `api/analyze.js:66` | HIGH |
| **Gemini API key exposed to client** — `/api/gemini-key` returns the raw API key to the browser (`res.json({ available: true, key })`). Anyone who can pass the trivial token check gets the key. | `api/gemini-key.js:54` | CRITICAL |
| **Debug data stored in localStorage** — `localStorage.setItem(\`debug-gemini-${label}\`, rawText)` stores full Gemini responses (~16KB each). Never cleaned up. | `LegacyApp.js:4323` | MEDIUM |
| **`compressVideo` function referenced in CLAUDE.md but does not exist** — Listed as a critical function but never appears in LegacyApp.js. | CLAUDE.md | LOW (doc only) |
| **Operator precedence bug in `normalizeFaultType`** — `f.includes("hop") && f.includes("land")` has lower precedence than the `||` before it. Line 193: `if (f.includes("step") || f.includes("hop") && f.includes("land"))` evaluates as `step || (hop && land)` not `(step || hop) && land`. | `LegacyApp.js:193` | LOW |

---

## 3. Dead Code Map

### Files in `src/` NOT imported by LegacyApp.js

| File | Imported By | Status |
|------|------------|--------|
| `src/utils/storage.js` | `TierContext.js` only | **PARTIALLY DEAD** — TierContext wraps it, but LegacyApp duplicates the same storage wrapper inline (lines 22-42). Two identical implementations. |
| `src/utils/helpers.js` | `TrainingScreen`, `Layer1Free`, `Layer2Competitive`, `Layer3Elite`, `SkillCard`, `VideoReviewPlayer` | ALIVE (used by extracted components) |
| `src/utils/validation.js` | Nothing | **DEAD** — Duplicates `validateResult` from LegacyApp.js. Never imported anywhere. |
| `src/analysis/analysisPipeline.js` | `VideoAnalyzer.js` only | **DEAD** — VideoAnalyzer is never imported by LegacyApp.js. Entire local analysis pipeline is orphaned. |
| `src/analysis/frameExtractor.js` | `analysisPipeline.js` only | **DEAD** — Part of orphaned pipeline. LegacyApp has its own frame extraction inline. |
| `src/analysis/poseDetector.js` | `analysisPipeline.js` only | **DEAD** — Part of orphaned pipeline. |
| `src/analysis/skillSegmentation.js` | `analysisPipeline.js` only | **DEAD** — Part of orphaned pipeline. |
| `src/analysis/biomechanics.js` | `analysisPipeline.js` only | **DEAD** — Part of orphaned pipeline. |
| `src/overlay/skeletonOverlay.js` | `VideoAnalyzer.js` only | **DEAD** — Part of orphaned pipeline. LegacyApp has SkeletonOverlay inline. |
| `src/components/video/VideoAnalyzer.js` | Nothing | **DEAD** — Never imported. Legacy local analysis component. |
| `src/components/analysis/SkillCard.js` | `VideoAnalyzer.js` only | **DEAD** — Only used by dead VideoAnalyzer. |
| `src/components/timeline/SkillTimeline.js` | `VideoAnalyzer.js` only | **DEAD** — Only used by dead VideoAnalyzer. |
| `src/components/onboarding/SplashScreen.js` | Nothing in LegacyApp.js | **DEAD** — LegacyApp has its own `SplashScreen` inline at line 2020. This extracted version (which imports StriveLogo) is never used. |
| `src/components/shared/StriveLogo.js` | `SplashScreen.js` (dead) only | **DEAD** — Only imported by dead SplashScreen. |
| `src/data/affirmations.js` | Nothing | **DEAD** — LegacyApp has its own affirmation arrays inline. This extracted version is never imported. |
| `src/scoring-engine.test.js` | Test runner only | ALIVE (test file, but tests are stale) |

**Summary: 14 dead files in `src/`** containing ~2,500 lines of orphaned code. The entire `src/analysis/` directory (5 files) is dead — LegacyApp does everything inline or via Gemini.

### Duplicated Code (LegacyApp.js inline vs. extracted files)

| Concept | LegacyApp.js Location | Extracted File | Notes |
|---------|----------------------|----------------|-------|
| Storage wrapper | Lines 22-42 | `utils/storage.js` | Identical implementation |
| `safeStr/safeArray/safeNum` | Lines 61-86, 647-651 | `utils/helpers.js` | Identical |
| `validateResult` | Lines 661-727 | `utils/validation.js` | Identical |
| `SplashScreen` | Lines 2020-2158 | `components/onboarding/SplashScreen.js` | Different implementations |
| Affirmations | Lines 2481-2519 | `data/affirmations.js` | Different implementations |
| `WOMEN_EVENTS/MEN_EVENTS/LEVELS/etc.` | Lines 845-963 | `data/constants.js` | Duplicated data |
| `CORRECT_FORM_DB` | Lines 974-985 | `VideoReviewPlayer.js:22-35` | Duplicated |

---

## 4. Performance Bottlenecks — Top 5 Re-render Triggers

### 1. Inline `localStorage.getItem()` in Render (6 occurrences)
**Lines:** 1830, 1868, 1902, 2560, 2807, 6664
Every render of the affected screen reads localStorage synchronously. These are inside arrow functions that execute during JSX evaluation:
```js
let tier = "free"; try { tier = localStorage.getItem("strive-tier") || "free"; } catch {}
```
**Impact:** Synchronous I/O on every render. On slow devices, this causes visible jank. Should use React state or context.

### 2. `setScreen()` Triggers Full Monolith Re-render
**Line 1494:** The entire 11,579-line component re-renders on every screen change because `screen` is state at the top level. Every screen's JSX is conditionally evaluated (not truly code-split despite `lazy()` imports) because the conditional logic is inline.

**Impact:** Every screen transition re-evaluates ~2,000 lines of JSX conditionals, closures, and inline function definitions.

### 3. `useMemo` Not Used for Expensive Computations
**Lines 2469-2478 (old Dashboard):** `avgScore` and `recentScores` use `useMemo`, but the SVG sparkline computation at lines 2762-2803 is not memoized — recalculates on every render.

**Lines 3052-3275 (PreMeetFocusScreen):** Multiple `useMemo` opportunities missed for fault categorization, drill lookups, and coach note rendering.

### 4. Inline Style Objects Created Every Render
**Pervasive throughout LegacyApp.js.** Every JSX element with `style={{ ... }}` creates a new object on every render. In an 11,579-line file with ~3,000+ inline style objects, this is significant GC pressure. Example: the bottom nav (lines 1942-1981) creates ~20 style objects per render.

### 5. Recharts Heavy Import (Unused Components)
**Line 2:** `import { LineChart, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Line, ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, Cell, ReferenceLine } from "recharts"`

`RadarChart`, `Radar`, `PolarGrid`, `PolarAngleAxis` appear to only be used in the old ResultsScreen (line 6617+). If the new ResultsScreen is active (`useNewResults = true`), these are loaded but never rendered. Recharts is ~200KB gzipped — every unused component still increases parse time.

---

## 5. Security Audit

### CRITICAL: API Key Exposure
**File:** `api/gemini-key.js:54`
```js
res.status(200).json({ available: true, key });
```
The Gemini API key is returned in plaintext to the browser. The "protection" is:
1. An origin check that allows any `strive-app*.vercel.app` domain
2. A hardcoded token `'strive-2026-launch'` (committed to source)

**Any user who opens DevTools can see the API key in the network tab.** Any script on a matching origin can extract it. The key should NEVER leave the server — all Gemini calls should proxy through a server-side endpoint.

### HIGH: Hardcoded Default Token
**Files:** `api/gemini-key.js:28`, `api/analyze.js:34`
```js
const expected = process.env.STRIVE_APP_TOKEN || 'strive-2026-launch';
```
If `STRIVE_APP_TOKEN` env var is not set, the fallback is a string committed to the public repo. The client also hardcodes this token at `LegacyApp.js:4644`:
```js
headers: { "X-Strive-Token": "strive-2026-launch" }
```

### MEDIUM: CORS Regex Too Broad
**Files:** `api/gemini-key.js:11`, `api/analyze.js:17`
```js
if (origin.match(/^https:\/\/strive-app.*\.vercel\.app$/)) return true;
```
This matches `strive-app-evil-phishing-page.vercel.app`. An attacker could deploy a Vercel app with a matching name to exfiltrate the API key.

**Fix:** Use exact match or a tighter pattern like `strive-app-3*.vercel.app`.

### MEDIUM: No Rate Limiting
Neither `/api/gemini-key` nor `/api/analyze` implement rate limiting. An attacker with the token could make unlimited Gemini API calls, running up the bill.

### LOW: Client-Side Tier Enforcement
Tier gating is entirely client-side via localStorage. A user can run `localStorage.setItem("strive-tier", "elite")` in the console and access all features. This is acceptable for MVP but must be server-enforced before monetization.

### LOW: Debug Data in localStorage
`LegacyApp.js:4323` stores full Gemini responses in localStorage keys like `debug-gemini-judge-Level 6-attempt1`. These are never cleaned up and contain the full AI response. Not a direct security risk but leaks implementation details.

---

## 6. The Dual Tier System Problem

### Architecture Conflict

There are **two independent tier management systems** that never communicate:

#### System A: TierContext (React Context)
- **File:** `src/context/TierContext.js`
- **Read from:** `storage.get('strive-tier')` (async, via `src/utils/storage.js`)
- **Analysis counter key:** `strive-analyses-month`
- **Provides:** `useTier()` hook, `TierGate` component, `canAnalyze`, `analysesRemaining`
- **Used by:** `App.js` wraps `LegacyApp` in `<TierProvider>` — but **NOBODY calls `useTier()`**

#### System B: Direct localStorage (LegacyApp.js)
- **Read from:** `localStorage.getItem("strive-tier")` — 9 separate inline calls
- **Analysis counter key:** `strive-analysis-count`
- **Provides:** Nothing reusable — each call site has its own inline logic
- **Used by:** LegacyApp.js exclusively

### Impact
1. **Analysis count never enforced properly.** TierContext tracks `strive-analyses-month`, LegacyApp tracks `strive-analysis-count`. They use different keys. Neither reads the other. In theory a user gets 3 free analyses from LegacyApp's check AND 3 from TierContext's check (if TierContext were ever queried, which it isn't).

2. **`normalizedTier` is broken.** Line 1516: `const normalizedTier = userTier === "competitive" ? "competitive" : userTier` is an identity no-op. It should normalize `"pro"` to `"competitive"` but the condition checks for `"competitive"` which is already correct. Legacy `"pro"` users would pass through unchanged, breaking tier gates that check for `"competitive"`.

3. **TierContext's features (canAnalyze, TierGate, etc.) are wasted.** The entire feature-flag system in TierContext (showing/hiding biomechanics, coach reports, what-if, etc.) is never used. LegacyApp makes all these decisions inline.

### Where LegacyApp Reads Tier (Direct localStorage)
| Line | Context | Issue |
|------|---------|-------|
| 1513 | useState initializer | Runs once on mount |
| 1814 | Settings `onTierChange` | Writes AND updates state |
| 1830 | Progress screen gating | **In render** — synchronous IO |
| 1868 | Mental training gating | **In render** — synchronous IO |
| 1902 | Season goals gating | **In render** — synchronous IO |
| 2560 | Dashboard upload CTA | **In render** — synchronous IO |
| 2807 | Dashboard quick actions | **In render** — synchronous IO |
| 6664 | Old ResultsScreen | **In render** — synchronous IO |
| 8389 | Settings display | **In render** — synchronous IO |

---

## 7. localStorage Usage & 5MB Limit Risk

### Current Keys Written

| Key | Content | Estimated Size | Growth Rate |
|-----|---------|---------------|-------------|
| `strive-profile` | JSON profile (name, level, gender, goals, DOB, consent) | ~500 bytes | Static |
| `strive-history` | Array of last 50 analysis summaries | ~15 KB (50 entries × 300 bytes) | +300 bytes/analysis |
| `strive-saved-results` | Full analysis results keyed by ID (frames stripped) | **~400 KB** (50 analyses × ~8 KB each) | **+8 KB/analysis** |
| `strive_recent_analyses` | Last 5 full analyses for offline | **~40 KB** (5 × ~8 KB) | Capped at 5 |
| `strive-tier` | Tier string | ~15 bytes | Static |
| `strive-analysis-count` | Counter JSON | ~50 bytes | Static |
| `strive-legal-accepted` | "true" | 4 bytes | Static |
| `strive-coach-meet-note` | Free text | ~200 bytes | Static |
| `strive_athlete_*` | Per-athlete record (100 analyses + 500 faults) | **~50 KB per athlete** | +500 bytes/analysis |
| `strive_cache_*` | Cached Gemini results (24h TTL) | **~15 KB per cache entry** | Accumulates (never cleaned) |
| `debug-gemini-*` | Full Gemini raw responses | **~16 KB per debug entry** | **Accumulates (NEVER cleaned)** |

### Projection

**After 50 analyses (moderate user):**
- `strive-saved-results`: ~400 KB
- `strive_athlete_*`: ~50 KB
- `strive_cache_*`: ~750 KB (50 × 15 KB, no cleanup)
- `debug-gemini-*`: ~800 KB (50 × 16 KB, no cleanup)
- Other: ~60 KB
- **Total: ~2.06 MB**

**After 100 analyses (active user, one season):**
- `strive-saved-results`: ~800 KB (capped at 50 but cache keys are not)
- `strive_cache_*`: ~1.5 MB (never cleaned)
- `debug-gemini-*`: ~1.6 MB (never cleaned)
- **Total: ~4.0 MB — dangerously close to 5MB limit**

**After 150 analyses:**
- **Total: ~5.5 MB — WILL HIT 5MB LIMIT**
- `localStorage.setItem()` will throw, silently caught by try/catch wrappers
- Analysis caching breaks, offline cache breaks, athlete records may fail to save
- **User sees no error message — data just silently stops persisting**

### Critical Issue: No Cleanup
- `strive_cache_*` keys have a 24h TTL check on READ but are **never proactively deleted**. Old cache entries accumulate forever.
- `debug-gemini-*` keys are **never deleted**. Every Gemini call adds ~16 KB permanently.
- No `localStorage` usage monitoring or quota warning exists.

---

## 8. The Gemini Pipeline — Full Trace

### End-to-End Flow

```
User taps "Analyze" on UploadScreen
    │
    ▼
LegacyApp.js:1711 — Legal disclaimer check (strive-legal-accepted in localStorage)
    │
    ▼
LegacyApp.js:1734 — AnalyzingScreen mounted
    │
    ▼
LegacyApp.js:5156 — useEffect fires, calls extractFrames()
    │
    ├── Strategy 1: Seek-based (line 3963) — 0.4s intervals, max 24 frames, 1280px JPEG @85%
    ├── Strategy 2: Play-based (line 4022) — playbackRate 2-4x, 0.8s tolerance window
    └── Strategy 3: Single frame (line 4094) — last resort, one frame at 0.5s
    │
    ▼
LegacyApp.js:4636 — analyzeWithAI(extractedFrames)
    │
    ├── Fetch API key from /api/gemini-key (line 4643-4646)
    │   └── ⚠️ KEY RETURNED TO BROWSER IN PLAINTEXT
    │
    ├── Check score cache (line 4668-4681)
    │   └── Fingerprint: prompt_version + filename + size + lastModified + name + level + event
    │   └── 24h TTL
    │
    ▼
LegacyApp.js:4225 — uploadVideoToGemini()
    │
    ├── Resumable upload to Gemini File API
    ├── Poll until file state = "ACTIVE" (up to 80 seconds)
    │
    ▼
LegacyApp.js:4288 — geminiGenerate()
    │
    ├── Model: gemini-2.5-flash
    ├── Temperature: 0.1, topP: 1, topK: 1, seed: 42
    ├── maxOutputTokens: 16,384
    ├── Prompt: buildJudgingPrompt() (~4,000-6,000 chars depending on event rules)
    ├── Up to 2 retry attempts
    │
    ▼
PROMPT STRUCTURE (line 4514-4632):
    ├── Role: "Brevet-certified USA Gymnastics judge at State Championship"
    ├── Athlete context: name, gender, level, event
    ├── Program context: compulsory/optional/xcel/elite
    ├── Event-specific rules (from EVENT_JUDGING_RULES in constants.js):
    │   ├── Strictness bias (1.0-1.3x)
    │   ├── Compound deduction rules
    │   ├── Hidden deduction checklist
    │   ├── Perspective bias warnings
    │   ├── Rhythm/flow judging criteria
    │   ├── Special requirements per level
    │   └── Typical deduction range
    ├── Execution standards (USAG code)
    ├── Landing standards
    ├── Artistry standards
    ├── Split leap standards (level-specific angle minimums)
    ├── Calibration guidance (target deduction range)
    └── JSON schema (example with Round-off + BHS)
    │
    ▼
RESPONSE PARSING (line 4758-4856):
    │
    ├── Primary: JSON parse — regex extracts {...} from response
    │   ├── Parse `skills[]` array → parsedSkills
    │   ├── Parse `artistry` section → parsedArtistry
    │   ├── Parse `composition` section → parsedComposition
    │   └── Parse `summary` section → celebrations, topImprovements, whyThisScore
    │
    └── Fallback: Pipe-delimited table parse (legacy format)
        └── Split by "|", extract timestamp/skill/deduction/faults
    │
    ▼
POST-PROCESSING (line 4862-5046):
    │
    ├── Deduction capping (bent arms ≤ 0.30, flexed foot = 0.05, etc.)
    ├── Split angle validation (remove deductions if angle meets level minimum)
    ├── Combination pass merging (skills within 2s → single entry)
    ├── USAG 0.025 rounding (round total to nearest 0.025)
    ├── Score computation: finalScore = 10.0 - totalDeductions
    ├── Grade assignment: A/A-/B/C/D+/F based on deduction amount
    └── Sanity check: individual sum vs. computed total (warn if diff > 0.01)
    │
    ▼
RESULT OBJECT (line 5064-5134):
    │
    ├── Core: finalScore, totalDeductions, execution/artistry/composition totals
    ├── gradedSkills[]: full skill list with grade, faults, bodyMechanics, drills
    ├── executionDeductions[]: filtered deduction-only view
    ├── Artistry/composition breakdowns
    ├── celebrations[], topImprovements[], strengths[]
    ├── diagnostics: levelJudged, eventJudged, splitMinRequired, averageGrade
    ├── frames: extracted video frames (base64)
    └── rawResponse: full Gemini text (stored for debugging)
    │
    ▼
LegacyApp.js:5138 — Cache result in localStorage
    │
    ▼
LegacyApp.js:5188 — onComplete(result) → handleAnalysisComplete (line 1573)
    │
    ├── Save to athlete intelligence layer (line 1577)
    ├── Add to history array (line 1597)
    ├── Save full result to savedResults (line 1601)
    ├── Cache for offline (line 1607)
    ├── Increment analysis counter (line 1615)
    └── setScreen("results")
    │
    ▼
RENDERING: screens/ResultsScreen/index.js
    │
    ├── tier === "free"        → Layer1Free (score + 2 sentences + blurred upgrade CTA)
    ├── tier === "competitive" → Layer2Competitive (full breakdown, VideoReviewPlayer, drills)
    └── tier === "elite"       → Layer3Elite (everything + what-if simulator, coach report)
```

### Where Data Gets Dropped or Truncated

1. **Frame extraction cap** — Max 24 frames. For a 90-second beam routine, that's 1 frame every 3.75 seconds. Fast skills (back tuck = 0.5s) may have zero frames captured. Gemini sees the full video though, so this only affects the frame thumbnail UI.

2. **Pipe-delimited fallback loses all rich data** — If JSON parsing fails and pipe-delimited kicks in (line 4828), the response loses: faults array, bodyMechanics, injuryRisk, drillRecommendation, artistry section, composition section, celebrations, topImprovements. The user sees a bare deduction list.

3. **Combination pass merging caps at 0.50** — Line 4945: `prev.deduction = Math.min(0.50, ...)`. A pass with 0.60 in total faults gets clamped to 0.50. This is intentional (USAG fall cap) but means some legitimate multi-fault scenarios get under-reported.

4. **`api/analyze.js` schema mismatch** — The server-side fallback expects `{ overallScore, skills[], topFixes[] }` (line 127-151) but the client expects `{ skills[], artistry{}, composition{}, summary{} }`. If the server path fires, the response will parse but produce empty artistry/composition/celebrations data.

5. **`rawResponse` stored in result AND localStorage** — The full Gemini response (~8-16 KB) is saved to: (a) `strive-saved-results` via `savedResults`, (b) `strive_cache_*` via score cache, (c) `debug-gemini-*` via debug storage. **Triple storage of the same data.**

6. **`artistry.totalDeduction` may not match summed details** — The prompt asks Gemini to provide both a `totalDeduction` and individual `details[]` for artistry. If Gemini's total doesn't match the sum of details, the code uses `totalDeduction` (line 5022-5024), not the sum. This means individual artistry fault deductions shown in the UI may not add up to the displayed total.

---

## Summary of Critical Actions

| Priority | Action | Effort |
|----------|--------|--------|
| P0 | **Stop exposing Gemini API key to browser.** All Gemini calls must proxy through server. | 4-8 hours |
| P0 | **Set `STRIVE_APP_TOKEN` env var on Vercel** and remove hardcoded fallback from source. | 15 min |
| P0 | **Wire COPPA consent to persistent backend storage.** Currently UI-only. | 8-16 hours |
| P1 | **Unify tier system.** Either use TierContext everywhere or delete it. Currently wasted code + dual counters. | 4 hours |
| P1 | **Fix `normalizedTier`** — change to `userTier === "pro" ? "competitive" : userTier`. | 5 min |
| P1 | **Add localStorage cleanup** — purge `debug-gemini-*` and expired `strive_cache_*` on app boot. | 1 hour |
| P1 | **Fix `api/analyze.js`** — update to `gemini-2.5-flash` and match client prompt schema. | 2 hours |
| P2 | **Delete 14 dead files** in src/ (~2,500 lines). Reduces bundle, confusion, maintenance surface. | 1 hour |
| P2 | **Tighten CORS regex** to exact match or narrower pattern. | 15 min |
| P2 | **Wire Stripe webhook** to persist subscription state (currently just logs). | 4-8 hours |
| P3 | **Extract inline localStorage reads from render functions** into React state or context. | 2 hours |
| P3 | **Memoize expensive computations** in Dashboard and PreMeetFocusScreen. | 1 hour |
| P3 | **Remove unused Recharts imports** (RadarChart, Radar, PolarGrid, PolarAngleAxis). | 15 min |
