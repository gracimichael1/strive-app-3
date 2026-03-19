# STRIVE Codebase Reconnaissance Report

Generated: 2026-03-18

---

## Feature Inventory (What Exists and Works)

### Core Flow
| Feature | Status | Location | Notes |
|---|---|---|---|
| Splash screen | **Working** | `LegacyApp.js:1240-1378` + `src/components/onboarding/SplashScreen.js` | Two implementations: LegacyApp inline + extracted component. Only the LegacyApp version is actually rendered. |
| Onboarding (5-step) | **Working** | `LegacyApp.js:1381-1614` | Role, name, gender, level, age/goals |
| Profile persistence | **Working** | `LegacyApp.js:860-888` | localStorage via custom `storage` wrapper |
| Dashboard | **Working** | `LegacyApp.js:1617-2179` | Score trends, affirmations, history, quick actions |
| Video upload | **Working** | `LegacyApp.js:2182-2735` | File picker + camera capture, auto-compression >100MB |
| Video compression | **Working** | `LegacyApp.js:2228-2315` | MediaRecorder-based, 3x playback, VP9/VP8 |
| Frame extraction (3-strategy) | **Working** | `LegacyApp.js:2786-3038` | Seek-based, play-based, single-frame fallback |
| Gemini video upload + polling | **Working** | `LegacyApp.js:3048-3108` | Resumable upload, polls for ACTIVE state |
| Gemini single-pass judging | **Working** | `LegacyApp.js:3175-3652` | Pipe-delimited table response, code computes score |
| Score caching | **Working** | `LegacyApp.js:3354-3371` | 24-hour cache by filename+level+event |
| Demo fallback | **Working** | `LegacyApp.js:8406-8693` | Generates realistic fake results when AI fails |
| Results screen (multi-tab) | **Working** | `LegacyApp.js:4772-5563` | Overview, Skills, Video, Deductions, Bio, Coach, Diagnostics, What-If |
| Graded skill cards | **Working** | `LegacyApp.js:4381-4666` | Grade A+-F, sub-faults, biomechanics, injury awareness, correct form |
| Video review player (sticky) | **Working** | `LegacyApp.js:3906-4287` | Jump-to-timestamp, slow-mo, frame capture, skeleton overlay |
| Score benchmark | **Working** | `LegacyApp.js:625-686` | Percentile display vs level averages |
| Actual score input + calibration | **Working** | `LegacyApp.js:4978-5053` | Saves correction data for future calibration |
| Drills screen | **Working** | `LegacyApp.js:5567-5698` | Fault-specific drill recommendations with YouTube links |
| Deduction reference guide | **Working** | `LegacyApp.js:5701-5836` | Category tabs, quick score calculator |
| Settings screen | **Working** | `LegacyApp.js:5839-6090` | Edit profile, API key management, Pro upgrade, reset |
| Meets/history screen | **Working** | `LegacyApp.js:6258-6386` | Grouped by meet, all-around totals |
| Progress screen (Pro) | **Working** | `LegacyApp.js:6154-6256` | Score trend chart, personal bests, event breakdown |
| Mental training (Pro) | **Working** | `LegacyApp.js:6389-6670` | 6 sections: visualization, breathing, confidence, meet day, parents |
| Season goals (Pro) | **Working** | `LegacyApp.js:6673-6793` | Add/remove goals, progress bars |
| What-If simulator (Pro) | **Working** | `LegacyApp.js:6092-6152` | Toggle deductions to see projected score |
| Biomechanics dashboard (Pro) | **Working** | `LegacyApp.js:7866-8218` | Body report card, power/flight, joint angles, landing analysis |
| Training program (Pro) | **Working** | `LegacyApp.js:7504-7863` | 5-pillar: drills, strength, mental, nutrition, recovery |
| Diagnostics dashboard (Pro) | **Working** | `LegacyApp.js:8220-8404` | Engine report, severity distribution, score drains |
| Body heatmap | **Working** | `LegacyApp.js:6796-6993` | SVG body silhouette with deduction glow overlays |
| Deduction timeline | **Working** | `LegacyApp.js:6996-7061` | Time-bucketed bar chart |
| Bottom navigation | **Working** | `LegacyApp.js:1196-1236` | 5 tabs: Home, History, Analyze, Guide, Profile |
| Free/Pro tier gating | **Partial** | `LegacyApp.js:1106-1131, 1139-1169, 1171-1193` + `src/context/TierContext.js` | Two separate tier systems coexist (see bugs) |
| Share with coach | **Working** | `LegacyApp.js:5504-5549` | Native share sheet or clipboard |
| Share STRIVE (virality) | **Working** | `LegacyApp.js:2134-2163` | Web Share API / clipboard |

### Extracted Components (src/components/)
| Component | Status | Notes |
|---|---|---|
| `BottomNav.js` | **Dead code** | Uses `window.dispatchEvent('strive-nav')` but LegacyApp uses its own inline nav. Never imported by App.js or LegacyApp.js. |
| `SplashScreen.js` | **Dead code** | LegacyApp defines its own SplashScreen internally (~line 1240). This extracted version is never used. |
| `StriveLogo.js` | **Partial** | Imported by `SplashScreen.js` (which is dead code). Not used by LegacyApp. |
| `SkillTimeline.js` | **Dead code** | Only imported by `VideoAnalyzer.js`, which is dead code. |
| `SkillCard.js` | **Dead code** | Only imported by `VideoAnalyzer.js`, which is dead code. |
| `VideoAnalyzer.js` | **Dead code** | Complete standalone analysis component using `src/analysis/` pipeline. Never imported by App.js or LegacyApp.js. |

### Analysis Pipeline (src/analysis/)
| Module | Status | Notes |
|---|---|---|
| `analysisPipeline.js` | **Dead code** | Only imported by `VideoAnalyzer.js` (dead). LegacyApp has its own frame extraction + Gemini pipeline. |
| `frameExtractor.js` | **Dead code** | Same - only used by dead pipeline |
| `poseDetector.js` | **Dead code** | Same - only used by dead pipeline |
| `skillSegmentation.js` | **Dead code** | Same - only used by dead pipeline |
| `biomechanics.js` | **Dead code** | Same - only used by dead pipeline |
| `skeletonOverlay.js` | **Dead code** | Only imported by `VideoAnalyzer.js` |

### Utility Modules (src/utils/)
| Module | Status | Notes |
|---|---|---|
| `storage.js` | **Partial** | Imported by `TierContext.js`. Identical copy exists inline in LegacyApp.js (lines 5-25). |
| `helpers.js` | **Dead code** | Exported `log`, `safeStr`, `safeArray`, `safeNum`. Only imported by `validation.js`. LegacyApp redefines all of these inline. |
| `validation.js` | **Dead code** | Exported `validateResult`. LegacyApp has its own copy at line 82. Never imported. |

---

## Bug Inventory (What Is Broken)

### CRITICAL

1. **Two competing tier systems** (`LegacyApp.js` throughout vs `src/context/TierContext.js`)
   - `App.js` wraps LegacyApp in `<TierProvider>`, but LegacyApp **never calls `useTier()`**. Instead, it reads `localStorage.getItem("strive-tier")` directly at lines 1106, 1140, 1172, 1710, 1957, 4792, 6009.
   - `TierContext.js` uses a different storage key (`strive-tier` via `storage.set`) and tracks `strive-analyses-month`.
   - LegacyApp tracks its own analysis count at `strive-analysis-count` (line 926-935), separate from TierContext's `strive-analyses-month`.
   - Result: the `TierProvider` context is loaded but does absolutely nothing. Two separate counters track the same thing under different keys.

2. **Pro upgrade has no payment** - All "Upgrade to Pro" buttons just do `localStorage.setItem("strive-tier", "pro")` and reload the page (lines 1124, 1162, 1187, 1740, 5106, 6027). Anyone can become Pro for free by clicking the button or running `localStorage.setItem("strive-tier", "pro")` in console.

3. **`window.storage` fallback is problematic** (`LegacyApp.js:7-8`, `src/utils/storage.js:4-5`)
   - The storage wrapper checks `window.storage?.get` which is a non-standard API. CLAUDE.md says "Use localStorage, NOT window.storage" but the code explicitly uses `window.storage` as first priority.
   - This was designed for Claude artifacts environment but may collide with browser extensions that define `window.storage`.

4. **Gemini API key exposed in API response** (`api/gemini-key.js:14`)
   - The serverless function returns `{ key }` to any caller. CORS is set to `*` (line 2). Any website can call `/api/gemini-key` and steal the API key.
   - No authentication, no rate limiting, no origin checking.

5. **Score caching uses filename as key** (`LegacyApp.js:3355-3357`)
   - `btoa(unescape(encodeURIComponent(videoFileName + "_" + level + "_" + event)))` - if a user uploads a different video with the same filename (e.g., "IMG_1234.MOV"), they get the cached result from the previous video.

6. **MediaPipe landmarker is re-created on every skill click** (`LegacyApp.js:4002-4038`)
   - `runSkeletonDetection` inside `VideoReviewPlayer` calls `PoseLandmarker.createFromOptions()` every time a skill is clicked. This downloads and initializes the WASM model each time (~5-10MB).
   - The landmarker is `.close()`-d at line 4038, so it can never be reused.
   - Contrast with `src/analysis/poseDetector.js` which properly caches the landmarker in a module-level `let landmarker = null`.

### IMPORTANT

7. **`setScreen` dependency missing from useEffect** (`LegacyApp.js:861-883`)
   - The `useEffect` calls `setScreen("dashboard")` and `setScreen("splash")` but `setScreen` is not in the dependency array. React will use the stale closure. Works because `setScreen` is wrapped in `useCallback` with empty deps, but violates React rules.

8. **`AnalyzingScreen` useEffect has unstable dependencies** (`LegacyApp.js:3657-3700`)
   - Dependencies include `extractFrames`, `analyzeWithAI`, `uploadData`, `profile`, `onComplete`. These are created fresh on every render (especially `onComplete` which is an inline function at line 1066). The `hasStarted.current` ref guard prevents re-execution, but the dependency array is incorrect.

9. **Video blob URL created in UploadScreen leaks** (`LegacyApp.js:2344`)
   - `URL.createObjectURL(processedFile)` is created in `handleFile` (line 2344) but the comment at line 2363 says "Do NOT revoke blob URL on unmount." The top-level `LegacyApp` also creates its own blob URL at line 1053. So every upload creates two blob URLs, only one is revoked.

10. **`dangerouslySetInnerHTML` for SVG icons in bottom nav** (`LegacyApp.js:1229`)
    - `dangerouslySetInnerHTML={{ __html: tab.svg }}` renders raw SVG strings. The SVG content is hardcoded (not user-supplied), so XSS risk is minimal but it's a code smell.

11. **Recharts imports may be unused** (`LegacyApp.js:2`)
    - Imports `AreaChart, Area, BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis, Cell` but these are never used in the file. Only `LineChart, XAxis, YAxis, CartesianGrid, Tooltip, Line, ResponsiveContainer` are used.
    - This increases bundle size unnecessarily.

12. **Font stylesheet loaded twice**
    - `src/styles/global.css:1` and `LegacyApp.js:481-483` both load the Google Fonts import. Double network request.

### MODERATE

13. **localStorage quota risk** (`LegacyApp.js:919-921`)
    - `strive-saved-results` stores full analysis results (minus frames) for every analysis. With 50+ analyses, each containing `rawResponse` (the full Gemini response text), this will exceed the ~5MB localStorage limit.
    - No error handling for quota exceeded - the `try/catch` at line 921 silently swallows it.

14. **`SkeletonCanvas` component defined twice**
    - Once inside `VideoAnalyzer.js:123-149` (dead code) and once inside `LegacyApp.js:3857-3904`. Both are completely different implementations.

15. **`SkeletonOverlay` component never receives real pose data** (`LegacyApp.js:502-622`)
    - Only used via demo data skeletons in `generateDemoResult`. The hardcoded joint positions are artistic approximations, not real pose detection output.

16. **`parseGeminiTable` function is dead code** (`LegacyApp.js:155-263`)
    - Was used in older table-parsing flow. The current `analyzeWithAI` function (line 3337) parses pipe-delimited tables directly (lines 3416-3434) and never calls `parseGeminiTable`.

17. **`validateResult` function is dead code** (`LegacyApp.js:82-148`)
    - Defined but never called. The current flow constructs `analysisResult` directly from parsed skills (line 3576-3635).

18. **Duplicate constants between `LegacyApp.js` and `src/data/constants.js`**
    - `WOMEN_EVENTS`, `MEN_EVENTS`, `LEVELS`, `DEDUCTION_SCALE`, `DEDUCTION_CATEGORIES`, `SCORE_BENCHMARKS`, `LEVEL_SKILLS`, `PARENT_TIPS` are all defined in both files. The `constants.js` versions are never imported by anything that runs.

19. **YouTube search links violate owner rules** (`LegacyApp.js:4213-4226`)
    - CLAUDE.md says "NO external YouTube/Google search links" but `VideoReviewPlayer` generates YouTube and Google Image search links for every deduction.
    - Also present in `DRILLS_DATABASE` (lines 335-383) - every drill has a `yt` property linking to YouTube search results.

20. **Vercel serverless function lacks CORS origin validation** (`api/gemini-key.js:2`)
    - `Access-Control-Allow-Origin: *` allows any domain to request the key. Should be restricted to the app's domain.

---

## Dead Code

### Entire Files (never imported by running code)
- `src/components/layout/BottomNav.js` - LegacyApp has inline nav
- `src/components/onboarding/SplashScreen.js` - LegacyApp has inline splash
- `src/components/shared/StriveLogo.js` - Only imported by dead SplashScreen
- `src/components/timeline/SkillTimeline.js` - Only imported by dead VideoAnalyzer
- `src/components/analysis/SkillCard.js` - Only imported by dead VideoAnalyzer
- `src/components/video/VideoAnalyzer.js` - Never imported by App.js or LegacyApp
- `src/analysis/analysisPipeline.js` - Only imported by dead VideoAnalyzer
- `src/analysis/frameExtractor.js` - Only imported by dead pipeline
- `src/analysis/poseDetector.js` - Only imported by dead pipeline
- `src/analysis/skillSegmentation.js` - Only imported by dead pipeline
- `src/analysis/biomechanics.js` - Only imported by dead pipeline
- `src/overlay/skeletonOverlay.js` - Only imported by dead VideoAnalyzer
- `src/utils/helpers.js` - Only imported by dead validation.js
- `src/utils/validation.js` - Never imported by running code
- `server.js` - Optional Express server, only health endpoint, not used in production

### Dead Functions in LegacyApp.js
| Function | Line | Reason |
|---|---|---|
| `parseGeminiTable()` | 155 | Replaced by inline pipe-delimited parser at 3416-3434 |
| `validateResult()` | 82 | Result is constructed directly, never validated |
| `computeAverageGrade()` | 67 | Only called at line 3626 in diagnostics, but diagnostics.averageGrade is never displayed |
| `parseTimestampToSec()` | 57 | Only called once at line 3477, but there's also an identical `tsToSec` at line 3927 |

### Dead Imports in LegacyApp.js (line 2)
- `AreaChart`, `Area`, `BarChart`, `Bar`, `RadarChart`, `Radar`, `PolarGrid`, `PolarAngleAxis`, `Cell` - all imported from recharts but never used

### Unused CSS Classes
- `.card-elevated` (LegacyApp.js:986-991) - defined in style block but never applied to any element

---

## Missing Features

### Called for in CLAUDE.md / design spec but not built

1. **Claude Sonnet 4 fallback** - CLAUDE.md lists "Fallback: Claude Sonnet 4 (frame-based)" but `analyzeWithClaude` does not exist in the codebase. The only fallback is `generateDemoResult`.

2. **Real MediaPipe pose detection pipeline** - The `src/analysis/` directory contains a complete pose detection + skill segmentation + biomechanics pipeline, but it's never wired into the main app. LegacyApp only uses MediaPipe in a one-off manner in `VideoReviewPlayer` (line 4002) for individual frame skeleton detection.

3. **Horizontal skill timeline** - CLAUDE.md mentions "horizontal skill timeline" but the `SkillTimeline.js` component (which implements this) is dead code. The running app has no skill timeline.

4. **AI-generated content legal disclaimer** - CLAUDE.md rule #6 says "AI-generated content legal disclaimer visible before first analysis" but no such disclaimer exists.

5. **Skeleton overlay that flows with body** - CLAUDE.md bug #6: "MediaPipe skeleton doesn't flow with body." The skeleton overlay in VideoReviewPlayer is single-frame capture only (not real-time tracking during playback).

6. **SVG icons for bottom nav** - CLAUDE.md bug #7: "Emoji icons need SVG." The nav uses inline SVG paths (lines 1205-1209) so this is actually done, but the quick action pills on the dashboard still use emoji (lines 1962-1976).

7. **Stripe/payment integration** - Multiple "Upgrade to Pro" buttons say "Payment integration coming soon" (lines 5120, 6036). No payment system exists.

8. **Supabase integration** - `server.js` comments mention "future features: Supabase proxy, webhooks, Stripe" but none are implemented.

9. **`TierContext` integration** - The `TierProvider` wraps the app but LegacyApp never uses `useTier()`, `ProGate`, or `ProUpgradePrompt`. The context is loaded but inert.

---

## Performance Risks

1. **8,693-line monolith file** (`LegacyApp.js`)
   - Every keystroke in any input causes the entire component tree to re-render. No `React.memo`, no component splitting.
   - Every screen (dashboard, upload, analyzing, results, drills, settings, progress, meets, mental, goals) is defined inside one function and conditionally rendered.
   - The `fonts` CSS string (line 481-483) is injected via `<style>` on every render.

2. **Inline `<style>` blocks re-render** (`LegacyApp.js:950-1012`)
   - ~60 lines of CSS are defined as a string in JSX and injected on every render cycle. This creates and destroys style elements repeatedly.

3. **New MediaPipe model on every skill click** (`LegacyApp.js:4002-4038`)
   - Downloads ~5-10MB WASM + model file from CDN, creates landmarker, runs detection, closes landmarker. This happens on every click of a skill in the video review.

4. **Unbounded frame storage in memory** (`LegacyApp.js:2830-2833`)
   - Frame extraction produces up to 24 JPEG data URLs (base64-encoded). Each frame at 1280px wide is ~100-200KB as base64. Total: 2.4-4.8MB held in state during and after analysis.
   - Frames are stored in the analysis result and passed to `savedResults` in localStorage (line 918, though `frames: undefined` strips them).

5. **`generateDemoResult` creates enormous inline skeleton data** (`LegacyApp.js:8406-8693`)
   - Each demo deduction includes full skeleton joint coordinates, making the demo result object very large (~50-100KB of hardcoded data).

6. **Multiple `setTimeout` fallbacks without cleanup** (`LegacyApp.js:3989-3996`)
   - In `VideoReviewPlayer.jumpTo()`, both an `addEventListener('seeked')` and two `setTimeout` fallbacks fire. The 1500ms timeout at line 3993 always fires and calls `captureFrame()` even if the `seeked` event already handled it.

7. **Recharts unused imports increase bundle** (`LegacyApp.js:2`)
   - `AreaChart`, `Area`, `BarChart`, `Bar`, `RadarChart`, `Radar`, `PolarGrid`, `PolarAngleAxis`, `Cell` are imported but never used. Tree-shaking may not eliminate them with CRA's webpack config.

8. **Canvas elements created but never destroyed** (`LegacyApp.js:2942`)
   - `document.createElement("canvas")` in `extractFrames` creates a canvas that is never removed from memory (though it goes out of scope, it may be held by the GC if drawImage operations reference it).

---

## Security Risks

1. **Gemini API key served with `Access-Control-Allow-Origin: *`** (`api/gemini-key.js:2`)
   - Any website can call the endpoint and retrieve the key. Should check `req.headers.origin` or `req.headers.referer`.

2. **User-entered API key stored in localStorage in plaintext** (`LegacyApp.js:2686`)
   - `storage.set("strive-gemini-key", inlineKey.trim())` stores the key unencrypted. Any script running on the page (including browser extensions) can read it.

3. **API key passed as URL parameter** (`LegacyApp.js:3054, 3096, 3115`)
   - `?key=${apiKey}` in Gemini API URLs means the key appears in browser history, network logs, and any request interceptors. Should use Authorization header instead (though Gemini's API requires the key parameter).

4. **`dangerouslySetInnerHTML` usage** (`LegacyApp.js:1229`)
   - SVG strings are hardcoded so this is not exploitable, but it's a pattern that could become dangerous if strings are ever user-supplied.

5. **No input sanitization on profile fields** (`LegacyApp.js:1409, 1462`)
   - User name, meet name, notes are stored and displayed without sanitization. React's JSX escaping prevents XSS in most cases, but the data is also included in `navigator.share()` text (line 2147) and clipboard text (line 5509) which could be used for social engineering.

6. **`crossOrigin="anonymous"` on hidden video** (`LegacyApp.js:3708`)
   - The hidden video element used for frame extraction sets `crossOrigin="anonymous"` but loads from a blob URL (same origin). This is harmless but unnecessary.

7. **Debug data stored in localStorage** (`LegacyApp.js:3145`)
   - `localStorage.setItem('debug-gemini-${label}', rawText)` stores full Gemini API responses. These may contain sensitive context from the judging prompt (athlete name, level, etc.).

8. **No CSP headers beyond basic `X-Frame-Options`** (`vercel.json:12-16`)
   - `X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY` are set, but no `Content-Security-Policy` header. The app loads scripts from multiple CDN origins (Google Fonts, MediaPipe CDN, Google Storage) without a CSP whitelist.
