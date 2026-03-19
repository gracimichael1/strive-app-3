# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Context

- **PROJECT**: Strive — AI-powered gymnastics analysis platform
- **MAIN FILE**: `src/LegacyApp.js` (~7,800 lines React)
- **DEPLOY**: Vercel auto-deploy from strive-app-3 GitHub repo
- **AI ENGINE**: Gemini 2.5 Flash (full video judging, NOT Claude)
- **STACK**: React, Vercel serverless, Google Gemini API
- **OWNER WORKFLOW**: VS Code → GitHub Desktop commit → push → Vercel auto-deploys in 90 seconds

## Absolute Rules — NEVER Violate

1. Never show "Gemini", "Claude", "AI", or "Anthropic" anywhere in the UI
2. Same video analyzed twice must score within 0.10 of each other
3. Gymnast name + gender + exact level + event must be in every Gemini prompt
4. Combination tumbling passes (RO+BHS+skill) = ONE skill card, never split
5. Injury awareness section required on every card with physical risk fault
6. AI-generated content legal disclaimer visible before first analysis
7. Never show a blank white screen — always fallback to cached or demo data
8. Never use `sudo` with npm
9. After every change: verify the app builds without errors before committing

## Current Bugs to Fix (Priority Order)

1. Video not displaying inside expanded skill cards
2. Skeleton overlay is decorative SVG, not real MediaPipe pose detection
3. Scoring inconsistency — same video produces different scores
4. UI needs to match design spec (see sessions from March 18, 2026)

## Design System (Locked)

```
Background: #070c16        Surface: #0d1422 / #121b2d
Gold:       #e8962a        Gold light: #ffc15a
Green:      #22c55e        Orange:     #e06820        Red: #dc2626
Fonts: Outfit (display) + Space Mono (data/numbers)
Max width: 540px centered. Min touch target: 44px.
Aesthetic: Luxury athletic — Olympic broadcast quality, not generic app store.
```

## Development Commands

```bash
npm start          # Dev server on localhost:3000
npm run build      # Production build (CRA) → build/
npm test           # Jest unit tests (interactive watch mode)
npm run server     # Local Express server (server.js)

# E2E tests (Playwright — auto-starts dev server if not running)
npm run test:e2e          # Headless
npm run test:e2e:ui       # Interactive UI mode
```

## Architecture

**Single-file monolith**: Nearly all app logic lives in `src/LegacyApp.js`. `src/App.js` is a thin wrapper that adds `TierProvider` context around `LegacyApp`.

### Key modules outside LegacyApp.js
- `src/analysis/` — Client-side analysis pipeline: frame extraction, MediaPipe pose detection, skill segmentation, biomechanics angle calculations
- `src/context/TierContext.js` — Free/Pro tier gating (Free: 3 analyses/mo, Pro: unlimited)
- `src/components/` — Extracted UI components (BottomNav, SplashScreen, SkillTimeline, SkillCard, VideoAnalyzer, StriveLogo)
- `src/data/constants.js` — Levels, deductions, skill requirements
- `src/styles/global.css` — Global styles and animations
- `api/gemini-key.js` — Vercel serverless function that serves GEMINI_API_KEY from env

### AI Analysis Pipeline
```
Video upload → compress if >100MB → extract 24 frames (85% JPEG)
→ Upload full video to Gemini File API → 2-pass (Detect → Judge) with gemini-2.5-flash
→ Parse JSON response → Render results
→ Fallback: Claude Sonnet 4 frame analysis → Fallback: demo data
```

Critical functions in LegacyApp.js: `compressVideo`, `extractViaSeek/Play/SingleFrame`, `buildJudgingPrompt`, `analyzeWithGeminiVideo`, `analyzeWithClaude`, `analyzeWithAI` (orchestrator), `runPoseDetection`, `VideoReviewPlayer`, `ResultsScreen`.

## Gotchas

- **Recharts imports**: MUST use named imports (`import { LineChart, XAxis } from "recharts"`). Default import crashes CRA.
- **Storage**: Use `localStorage` directly, NOT `window.storage`.
- **Blob URLs**: Die on component unmount. Store the `File` object at App level; create fresh blob URLs in consuming components.
- **LegacyApp.js size**: The file is massive. When editing, read only the relevant section using line offsets. Search for function names rather than reading the whole file.

## USAG Scoring Reference

### Deduction Scale
| Severity | Deduction | Color |
|---|---|---|
| Small | 0.05-0.10 | #22c55e |
| Medium | 0.10-0.15 | #f59e0b |
| Large | 0.20-0.30 | #e06820 |
| Very Large | 0.30-0.50 | #ef4444 |
| Fall | 0.50 (DP) | #dc2626 |

### Calibration Targets
- Good routine (9.1-9.3): 0.70-0.90 total, 6-8 faults
- Average routine (8.7-9.0): 0.90-1.30 total, 8-12 faults
- Rough routine (<8.5): 1.30-1.80+ total, 10-15+ faults
- **If AI finds <5 deductions, it is MISSING deductions**
