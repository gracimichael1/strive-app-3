# STRIVE STRATEGY — LOCKED DECISIONS

> This file governs ALL development decisions. Every code change, feature addition, or architectural choice must align with this document. If a proposed change conflicts with this strategy, it requires explicit owner (Michael Graci) approval before proceeding.

> **Last updated: March 19, 2026** — Reflects scoring calibration win, CORS fixes, VideoReviewPlayer extraction, and Phase 1 reality check.

## Mission Statement
Give gymnasts, parents, and coaches an intuitive AI-powered platform to understand scoring, improve performance, prevent injuries, and track growth — starting with gymnastics, built to scale to all judged sports.

---

## Phase Gates — Do NOT skip ahead

### Phase 1: LAUNCH READY (Current)
**Goal: Ship to paying gym parents. Revenue day 1.**

#### DONE — Verified Working
- [x] Fix misleading privacy claim
- [x] Secure API key endpoint (CORS fix deployed, `api/gemini-key.js` returns key to allowed origins)
- [x] Accessibility fixes (WCAG AA baseline)
- [x] Performance fixes (lazy loading, memoization)
- [x] Build 3-layer results screen (Free/Competitive/Elite) — all three rendering
- [x] Build Training tab (drills, strength, mental, nutrition)
- [x] Wire new components into app (LegacyApp switches between old/new results)
- [x] Stripe payment integration scaffolding (checkout, webhook, upgrade modal)
- [x] Privacy Policy + Terms of Service — drafted in /legal/
- [x] Fix video display in expanded skill cards
- [x] Scoring calibration — Brevet-certified prompt, two-sided bounds (0.80-1.50), tested 8.850 vs 8.925 actual (0.075 delta, within 0.10 target)
- [x] Cache versioning (`v5_strict_brevet`) to invalidate stale results
- [x] maxOutputTokens increased to 16384 (was 8000, caused truncated JSON)
- [x] 3-button tier switcher in Settings (Free/Competitive/Elite)
- [x] Data binding fix — Layer2/Layer3 read from both `result.summary.X` and `result.X`
- [x] VideoReviewPlayer extracted as standalone component with slow-mo, seek-to-skill, skeleton overlay, frame capture, perfect form comparison
- [x] VideoReviewPlayer wired into Layer2Competitive and Layer3Elite
- [x] Road to Next Level tile — shows current vs next level skill requirements
- [x] ScoreHero — animated score display with start value, deductions, delta from previous

#### IN PROGRESS — Must Complete Before Launch
- [ ] **COPPA parental consent flow** — BLOCKING. Age gate + consent components built, need wiring
- [ ] **End-to-end video pipeline verification** — CORS fix is deployed, need user retest with cleared localStorage to confirm full chain: API key loads → video uploads to Gemini → skills parse → tiles populate
- [ ] **Scoring validation (100 routines)** — Need to test across multiple levels/events vs real judge scores

#### OWNER ACTION REQUIRED — Cannot Ship Without
- [ ] Stripe account setup + wiring (owner)
- [ ] Business entity formation (owner)
- [ ] Legal review of Privacy Policy + ToS (owner)

---

### Phase 1.5: CONTENT DEPTH (Immediate Next — Pre-Launch)
**Goal: Make Competitive and Elite screens feel worth paying for.**

> This is NOT scope creep — this is completing what Phase 1 promised. The 3-layer architecture is built but several tiles still need real data flowing through them.

- [ ] **Verify skills populate from Gemini response** — The "0 skills" display was caused by API key CORS failure (now fixed). Retest needed.
- [ ] **Rich skill narratives** — Match the depth of direct Gemini conversations (per-skill quality grades, body mechanics detail, "The Truth" analysis style)
- [ ] **Training programs wired to analysis** — PersonalizedDrills from analysis data → TrainingScreen. Currently TrainingScreen exists but isn't connected to per-analysis drill recommendations.
- [ ] **Free tier dashboard cleanup** — Remove Competitive/Elite feature tiles from Free view, show only appropriate content
- [ ] **Demo data fallback** — When no video has been analyzed, show realistic demo data instead of empty states

---

### Phase 2: RETENTION ENGINE
**Goal: Make athletes come back weekly.**
- [ ] User accounts + cloud sync (Supabase Auth + Firestore/Postgres)
- [ ] Push notifications
- [ ] Drill completion tracking
- [ ] Weekly engagement digest
- [ ] Score Path visualization ("fix these 2 things = 9.2") — NOTE: basic version already exists in Layer2 "Path to Higher Score" tile

### Phase 3: COACH CONNECTION
**Goal: Make Strive the tool coaches recommend.**
- [ ] Coach portal (view athletes, add notes)
- [ ] Team management
- [ ] Coach-specific insights ("3 athletes have same pattern")
- [ ] Share-with-coach link generation

### Phase 4: ELITE & EXPANSION
**Goal: Serve serious athletes + expand to new sports.**
- [ ] Real MediaPipe pose detection (replace decorative SVG) — NOTE: VideoReviewPlayer already does live MediaPipe on frame capture. Extend to full video.
- [ ] D-score / composition analysis — NOTE: artistry/composition breakdown already exists in Layer2/Layer3
- [ ] Side-by-side perfect form comparison (video overlay, not just SVG) — DEFERRED per owner
- [ ] Recruiting toolkit
- [ ] Multi-athlete family accounts
- [ ] Cheerleading expansion (Year 2)
- [ ] Figure skating expansion (Year 2-3)

---

## Current Architecture — What Exists (March 19, 2026)

### File Structure
```
src/
├── LegacyApp.js              — ~11K line monolith (main app logic, being decomposed)
├── App.js                     — Thin wrapper adding TierProvider
├── screens/
│   ├── ResultsScreen/
│   │   ├── index.js           — Tier router (Free/Competitive/Elite)
│   │   ├── ScoreHero.js       — Animated score display with delta
│   │   ├── Layer1Free.js      — Free teaser (2 sentences + upgrade CTA)
│   │   ├── Layer2Competitive.js — Full analysis (skills, drills, artistry)
│   │   ├── Layer3Elite.js     — Expert tools (what-if, diagnostics, coach report, fault trend)
│   │   └── RoadToNextLevel.js — Level progression comparison
│   ├── DashboardScreen/       — Dashboard with daily encouragement
│   └── TrainingScreen/        — Drills, strength, mental, nutrition
├── components/
│   ├── ui/SkillCard.js        — Expandable per-skill card with faults, body mechanics, injury awareness
│   ├── video/
│   │   ├── VideoReviewPlayer.js — Slow-mo, seek-to-skill, skeleton overlay, frame capture, perfect form
│   │   └── VideoAnalyzer.js   — Video upload + analysis pipeline
│   ├── billing/UpgradeModal.js
│   ├── legal/                 — AgeGate, ParentalConsent, PrivacyNotice, LegalDisclaimer
│   ├── onboarding/SplashScreen.js
│   ├── shared/StriveLogo.js
│   └── timeline/SkillTimeline.js
├── context/TierContext.js     — Free/Competitive/Elite tier gating
├── data/constants.js          — LEVELS, LEVEL_SKILLS, SCORE_BENCHMARKS
├── utils/helpers.js           — safeStr, safeArray, safeNum, escapeHtml, log
└── analysis/                  — Frame extraction, MediaPipe pose, skill segmentation
api/
├── gemini-key.js              — Serverless: delivers GEMINI_API_KEY (CORS-safe)
└── analyze.js                 — Serverless: biomechanics → Gemini → structured JSON
```

### What Each Tier Gets (Results Screen)

| Feature | Free | Competitive | Elite |
|---------|------|-------------|-------|
| ScoreHero (animated score, delta) | Yes | Yes | Yes |
| "What went right" / "What to work on" | 1 sentence each | Full judge's analysis | Full judge's analysis |
| VideoReviewPlayer (slow-mo, skeleton) | No | Yes | Yes |
| Skill cards (expandable, per-skill) | No | Yes | Yes |
| Score Path ("your path to X.X") | No | Yes | Yes |
| Celebrations (what went right list) | No | Yes | Yes |
| Path to Higher Score | No | Yes | Yes |
| Road to Next Level | No | Yes | Yes |
| Artistry & Composition breakdown | No | Yes | Yes |
| Weekly Focus Drills | No | Yes | Yes |
| What-If Simulator | No | No | Yes |
| Body Mechanics Overview | No | No | Yes |
| Session Diagnostics | No | No | Yes |
| Coach Report (share/export) | No | No | Yes |
| Fault Trend (multi-session) | No | No | Yes |
| Upgrade CTA | Yes | No | No |
| Blurred preview teaser | Yes | No | No |

### AI Pipeline
```
Video upload → compress if >100MB → extract 24 frames (85% JPEG)
→ Upload full video to Gemini File API
→ Single-pass judging prompt (Brevet USAG framing, two-sided calibration)
→ gemini-2.5-flash, maxOutputTokens: 16384, responseMimeType: application/json
→ Parse JSON → Map to result structure → Render in tier-appropriate screen
→ Fallback: Claude Sonnet 4 frame analysis → Fallback: demo data
```

### Scoring Prompt — Key Calibration Rules
- Framing: "Brevet-certified USAG judge at State Championship, no benefit of the doubt"
- If total deductions < 0.80 → too LENIENT
- If total deductions > 1.50 → too HARSH
- Execution deductions typically 0.50–0.90, artistry + composition add 0.20–0.40
- Tested: 8.850 output vs 8.925 actual = 0.075 delta (target: within 0.10)

---

## Locked Architecture Decisions

### Tier Structure (FINAL)
| Tier | Name | Price | Target |
|------|------|-------|--------|
| Free | Free | $0 | Gym parent at a meet |
| Paid | Competitive | $9.99/mo ($99/yr) | Committed athlete/parent |
| Premium | Elite | $19.99/mo ($199/yr) | Serious competitor, college-track |
| B2B | Coach | $49.99/mo ($499/yr) | Individual coaches |
| B2B | Gym | $149-299/mo | Gym-wide license |

### 3-Layer Results (FINAL)
- **Layer 1 (Free)**: Score + 2 sentences (what went right, what to work on). Intentionally vague. Upgrade CTA with blurred preview.
- **Layer 2 (Competitive)**: Full skill-by-skill breakdown, video analysis with slow-mo and skeleton overlay, biomechanics, drill recommendations, injury awareness, score path, road to next level.
- **Layer 3 (Elite)**: Everything in Competitive + what-if simulator, body mechanics overview, session diagnostics, coach report export, fault trend tracking across sessions.

### Navigation (FINAL)
Bottom nav: Home | Training | Analyze (primary) | Progress | Profile
- Training is its own dedicated tab (drills, nutrition, mental, strength)
- Dashboard shows daily encouragement (ALL tiers)

### Design System (LOCKED — do not change)
```
Background: #070c16    Surface: #0d1422 / #121b2d
Gold: #e8962a          Gold light: #ffc15a
Green: #22c55e         Orange: #e06820         Red: #dc2626
Fonts: Outfit (display) + Space Mono (data/numbers)
Max width: 540px centered. Min touch target: 44px.
Aesthetic: Luxury athletic — Olympic broadcast quality.
```

## AI Development Roadmap (Data Moat Strategy)
| Stage | Trigger | Action | Cost per Analysis |
|-------|---------|--------|-------------------|
| **Now** | Launch | Gemini 2.5 Flash (ship fast, proven quality) | $0.018 |
| **Stage 2** | 50K analyses | Begin fine-tuning open model (Llama/Gemma) on proprietary data | $0.018 (training cost ~$5K) |
| **Stage 3** | 100K analyses | Hybrid — own model for standard levels, Gemini for edge cases | ~$0.005 |
| **Stage 4** | 250K+ analyses | Mostly self-hosted, Gemini as fallback only | ~$0.002 |

The moat is the DATA, not the model. Every analysis generates labeled training data. By 100K analyses, Strive owns the most valuable gymnastics scoring dataset in existence. Competitors starting from scratch are 12-18 months behind.

## What We Are NOT Building (Scope Fence)
- No white-label / custom branding for gyms (deferred)
- No social features / athlete-to-athlete messaging
- No live streaming or real-time analysis
- No hardware requirements (camera only)
- No gamification for parents (achievements are for athletes only)
- No nutrition advice for minors beyond "talk to your coach/doctor"
- No medical/recovery advice beyond general wellness tips
- No side-by-side video overlay comparison (deferred per owner)

## Rules of Engagement
1. **No scope creep.** If it's not in the current phase, it doesn't get built.
2. **No "while we're at it" improvements.** Fix what's assigned, nothing more.
3. **Every change must build.** Run `npm run build` before committing.
4. **Never show AI provider names in UI.** No "Gemini", "Claude", "AI", "Anthropic".
5. **Same video, same score.** Scoring consistency within 0.10 is non-negotiable.
6. **No blank screens ever.** Always fallback to cached or demo data.
7. **Daily encouragement on dashboard.** All tiers. Non-negotiable.
8. **Legal compliance before launch.** COPPA, Privacy Policy, ToS are launch blockers.
9. **Test before committing.** `npm run build` must pass. No exceptions.
10. **Don't break what works.** The scoring calibration is locked. Don't touch the prompt without explicit owner approval.
