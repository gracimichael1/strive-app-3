# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## CRITICAL: Read STRATEGY.md First
**Before making ANY changes, read `STRATEGY.md` in the project root.** It contains locked decisions on tiers, architecture, phases, and scope fences. All work must align with the current phase. Do not build features from future phases.

## Project Context

- **PROJECT**: Strive — AI-powered gymnastics analysis platform ("The Parent's Scoring Companion")
- **MAIN FILE**: `src/LegacyApp.js` (~11,000 lines React) — being broken into `src/screens/` and `src/components/`
- **NEW SCREENS**: `src/screens/ResultsScreen/`, `src/screens/DashboardScreen/`, `src/screens/TrainingScreen/`
- **NEW COMPONENTS**: `src/components/ui/SkillCard.js`, `src/components/video/VideoReviewPlayer.js`
- **DEPLOY**: Vercel auto-deploy from strive-app-3 GitHub repo
- **AI ENGINE**: Gemini 2.5 Flash (full video judging, NOT Claude)
- **STACK**: React, Vercel serverless, Google Gemini API
- **OWNER WORKFLOW**: VS Code → GitHub Desktop commit → push → Vercel auto-deploys in 90 seconds
- **LAUNCH TARGET**: September 2026 (competitive season starts Sep-Oct)

## Membership Tiers (FINAL)

### Consumer
| Tier | Name | Price | Annual |
|------|------|-------|--------|
| Free | Free | $0 | — |
| Paid | Competitive | $9.99/mo | $99/yr |
| Premium | Elite | $19.99/mo | $199/yr |

### B2B (Phase 3+)
| Tier | Name | Price |
|------|------|-------|
| Coach | Coach | $49.99/mo ($499/yr) |
| Gym | Gym | $149-299/mo |

### 3-Layer Results (FINAL)
- **Layer 1 (Free)**: Score + 2 sentences (what went right, what to work on). Intentionally vague. 3 analyses/month cap. Upgrade CTA with blurred preview.
- **Layer 2 (Competitive)**: Full skill-by-skill breakdown, VideoReviewPlayer (slow-mo, skeleton, frame capture, perfect form), biomechanics, drills, injury awareness, score path, road to next level, artistry/composition. Unlimited analyses.
- **Layer 3 (Elite)**: Everything + what-if simulator, body mechanics overview, session diagnostics, coach report, fault trend. Unlimited analyses.

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
10. Don't touch the scoring prompt without explicit owner approval

## Bugs Fixed (March 19, 2026)

1. ~~Video not displaying inside expanded skill cards~~ — FIXED: preload, webkit-playsinline, fallback
2. ~~Skeleton overlay was decorative SVG~~ — VideoReviewPlayer now does live MediaPipe on frame capture
3. ~~Scoring inconsistency~~ — FIXED: Brevet prompt, two-sided calibration (0.80-1.50), tested 8.850 vs 8.925 actual (0.075 delta)
4. ~~UI design spec alignment~~ — FIXED: design system audit + corrections
5. ~~CORS 403 on /api/gemini-key~~ — FIXED: same-origin requests allowed, no crash on undefined origin
6. ~~maxOutputTokens truncation~~ — FIXED: increased to 16384 (was 8000)
7. ~~Data binding mismatch~~ — FIXED: Layer2/Layer3 check both result.summary.X and result.X
8. ~~Tier switcher missing~~ — FIXED: 3-button switcher in Settings (Free/Competitive/Elite)

## Remaining Open Items (Phase 1)

### Must Complete Before Launch
1. End-to-end pipeline verification — test with cleared localStorage
2. COPPA parental consent wiring — BLOCKING
3. Scoring validation (100 routines vs real judges)
4. Rich skill narratives from Gemini
5. Training programs connected to per-analysis drill recs
6. Free tier dashboard cleanup
7. Demo data fallback for empty states

### Owner Action Required
1. Stripe account setup + wiring
2. Business entity formation
3. Legal review of Privacy Policy + ToS

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
- `src/context/TierContext.js` — Free/Competitive/Elite tier gating with feature flags
- `src/components/video/VideoReviewPlayer.js` — Extracted: slow-mo, seek-to-skill, skeleton overlay, frame capture, perfect form comparison
- `src/components/ui/SkillCard.js` — Expandable per-skill card with faults, body mechanics, injury awareness, drills
- `src/components/` — Other extracted components (BottomNav, SplashScreen, SkillTimeline, VideoAnalyzer, StriveLogo)
- `src/data/constants.js` — Levels, deductions, skill requirements
- `src/styles/global.css` — Global styles and animations
- `api/gemini-key.js` — Vercel serverless function that serves GEMINI_API_KEY from env
- `api/analyze.js` — Vercel serverless function for biomechanics → Gemini → structured JSON

### AI Analysis Pipeline
```
Video upload → compress if >100MB → extract 24 frames (85% JPEG)
→ Upload full video to Gemini File API
→ Single-pass Brevet USAG judging prompt (two-sided calibration 0.80-1.50)
→ gemini-2.5-flash, maxOutputTokens: 16384
→ Parse JSON → Render in tier-appropriate screen
→ Fallback: Claude Sonnet 4 frame analysis → Fallback: demo data
```

Critical functions in LegacyApp.js: `compressVideo`, `extractViaSeek/Play/SingleFrame`, `buildJudgingPrompt`, `analyzeWithGeminiVideo`, `analyzeWithClaude`, `analyzeWithAI` (orchestrator), `runPoseDetection`, `ResultsScreen`.

## Gotchas

- **Recharts imports**: MUST use named imports (`import { LineChart, XAxis } from "recharts"`). Default import crashes CRA.
- **Storage**: Use `localStorage` directly, NOT `window.storage`.
- **Blob URLs**: Die on component unmount. Store the `File` object at App level; create fresh blob URLs in consuming components.
- **LegacyApp.js size**: The file is massive. When editing, read only the relevant section using line offsets. Search for function names rather than reading the whole file.
- **GitHub Desktop sync**: Terminal `git push` works but GitHub Desktop needs "Fetch origin" to see changes.

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
