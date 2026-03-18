# STRIVE — AI Gymnastics Scoring & Coaching App

## Project Identity
- **Name**: STRIVE — "See Your Score. Own Your Growth."
- **Live URL**: https://strive-app-amber.vercel.app
- **GitHub Repo**: strive-app-3 (auto-deploys to Vercel on push to main)
- **Owner**: Michael Graci (mgraci) — parent of Xcel Gold gymnast
- **Platform**: Mac, VS Code, GitHub Desktop

## Deploy Workflow
GitHub Desktop → commit to strive-app-3 → push to origin → Vercel auto-deploys in ~90 seconds.

---

## Tech Stack
```
Framework:      React (Create React App)
Entry point:    src/App.js (THIS IS THE SOURCE OF TRUTH)
Styling:        src/styles/global.css + inline styles
AI Engine:      Google Gemini 2.5 Flash (full video analysis)
AI Fallback:    Anthropic Claude Sonnet 4 (frame-based)
Pose Detection: MediaPipe Pose Landmarker (browser CDN, partially working)
Charts:         Recharts (NAMED IMPORTS ONLY — default import crashes CRA)
Storage:        localStorage (NOT window.storage)
Fonts:          Google Fonts — Outfit + Space Mono
Hosting:        Vercel (auto-deploy from GitHub)
API Proxy:      api/gemini-key.js (Vercel serverless)
Tier System:    src/context/TierContext.js (Free: 3/mo, Pro: unlimited)
```

## Project Structure
```
strive-app/
├── api/gemini-key.js               # Vercel serverless — serves Gemini key
├── vercel.json
├── package.json                     # react, recharts, @mediapipe/tasks-vision
├── src/
│   ├── App.js                       # ~4,900 lines — ALL core logic
│   ├── LegacyApp.js                 # Old version (reference only)
│   ├── styles/global.css            # Global styles, animations
│   ├── context/TierContext.js       # Free/Pro gating
│   ├── data/constants.js            # Levels, deductions, skill requirements
│   ├── components/
│   │   ├── layout/BottomNav.js
│   │   ├── onboarding/SplashScreen.js
│   │   ├── video/                   # Video player components
│   │   ├── timeline/                # Deduction timeline
│   │   └── analysis/                # Result display components
│   ├── analysis/                    # Engine modules
│   └── overlay/                     # Skeleton/pose overlay
```

## Critical Functions in src/App.js
| Function | Purpose |
|---|---|
| `compressVideo` | Client-side compression (1080p target, 100MB threshold) |
| `extractViaSeek/Play/SingleFrame` | 3-strategy frame extraction for iPhone .MOV |
| `buildJudgingPrompt` | THE PROMPT — dynamic from profile (gender, level, event) |
| `analyzeWithGeminiVideo` | Full video upload via Gemini File API → poll → analyze |
| `analyzeWithClaude` | Frame-based Claude fallback |
| `analyzeWithAI` | Orchestrator: Gemini → Claude → demo fallback |
| `runPoseDetection` | MediaPipe CDN load + 33-landmark detection |
| `generateDemoResult` | Realistic demo when all AI fails |
| `VideoReviewPlayer` | Sticky video + jump-to-deduction + slow-mo |
| `ResultsScreen` | Multi-tab results |

---

## Analysis Pipeline
```
Video upload → compress if >100MB → extract 24 frames (85% JPEG)
→ Check Gemini key → Upload full video to Gemini File API
→ 2-pass pipeline (Detect → Judge) with gemini-2.5-flash (8K thinking)
→ Parse response to JSON → Render in UI
→ Fallback: Claude frame analysis → Fallback: demo data
```

---

## KNOWN BUGS (March 2026)

### CRITICAL
1. **Under-detecting deductions**: Only finding 1-3 faults on routines with 8-12. An 8.5 routine should have ~1.50 in deductions but gets 0.15-0.30. The old 3-pass verification was rejecting real deductions. Dropped to 2-pass + 8K thinking. STILL NEEDS TUNING.
2. **Scoring inconsistency**: Same video can produce scores 0.3+ apart. Need temperature:0 and calibration rules in prompt.
3. **Duplicate deductions on bars**: Lists same fault on every repetition instead of consolidating.

### IMPORTANT
4. **Results UI not dramatic enough**: Owner wants Dartfish/Hudl-level quality. Needs skill-by-skill cards, sticky video player, horizontal skill timeline, body heatmap.
5. **Video playback blob URL death**: Blob URLs die on component unmount. Must store File at App level, create fresh URL in VideoReviewPlayer.
6. **MediaPipe skeleton**: CDN loading inconsistent. Skeleton doesn't flow with body.
7. **Bottom nav**: Emoji icons need SVG. All screens need 540px max-width.

### MODERATE
8. **Recharts**: MUST use `import { LineChart, XAxis, ... } from "recharts"` — NO default import.
9. **Gemini API key**: Users enter in Settings → localStorage. Vercel env var not yet configured for auto-serve.

---

## USAG SCORING (2025-2028)

### Deduction Scale
| Severity | Deduction | Color |
|---|---|---|
| Small | 0.05-0.10 | #22c55e |
| Medium | 0.10-0.15 | #f59e0b |
| Large | 0.20-0.30 | #f97316 |
| Very Large | 0.30-0.50 | #ef4444 |
| Fall | 0.50 (DP) | #dc2626 |

### Calibration Targets
- Good routine (9.1-9.3): 0.70-0.90 total, 6-8 faults
- Average routine (8.7-9.0): 0.90-1.30 total, 8-12 faults
- Rough routine (<8.5): 1.30-1.80+ total, 10-15+ faults
- **If AI finds <5 deductions, it is MISSING deductions**

### Detection Engines (Gemini conversation concepts)
- TPM (Toe Point): shin-to-foot angle <160° = -0.05
- KTM (Knee Tension): hip-knee-ankle <175° = -0.05-0.10
- Split-Check: hip vertex <120° = -0.10-0.20
- VAE (Verticality): >10° off vertical = -0.05-0.10
- Cowboy Detection: knee separation >1.2x shoulder width = -0.20

---

## DESIGN SYSTEM
```
Background:     #0a0e27       Gold:    #d4af37 / #f2d06b
Surface:        rgba(255,255,255,0.04)
Text:           #e2e8f0 / rgba(255,255,255,0.5) / rgba(255,255,255,0.3)
Success: #22c55e  Warning: #f59e0b  Orange: #f97316  Error: #ef4444
Fonts: Outfit (body 300-500, headers 600-900), Space Mono (data 400-700)
Max width: 540px centered. Min touch: 44px.
Aesthetic: Luxury athletic. Olympic broadcast, not app store generic.
Benchmark: Dartfish, Hudl Technique.
```

## OWNER RULES (NON-NEGOTIABLE)
- NO Gemini/Google/Claude branding in UI — everything is "STRIVE"
- Championship Strictness judging (0.05-0.15 below actual meet scores)
- Same video twice must score within ±0.150
- Specific skill names always ("Round-off BHS back layout" not "tumbling pass")
- NO external YouTube/Google search links
- Parent-friendly: a 12-year-old's parent can use it without confusion
- The app must look like a $20/month premium product
