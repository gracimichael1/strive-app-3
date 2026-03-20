# STRIVE — 2-WEEK SPRINT PLAN
> Strategy Report v3 vs. Current App | Gap Analysis + Agent Execution Plan
> Created: March 20, 2026 | Deadline: April 3, 2026

---

## Part 1: Strategy vs. Reality — Gap Analysis

### What the Strategy Says is "Done" vs. What Actually Works

| Strategy Claims "Done" | Actual State | Verdict |
|------------------------|-------------|---------|
| Gemini 2.5 Flash video analysis pipeline | Working. Single-pass prompt, JSON parse, score compute. | **TRUE** |
| Scoring calibration (0.075 delta) | Working. One test case. Not validated across levels/events. | **PARTIALLY TRUE** — 1 routine ≠ validated |
| 3-layer results (Free/Competitive/Elite) | Working. Screens render. Content depth varies. | **TRUE** |
| VideoReviewPlayer (slow-mo, skeleton, frame capture) | Working. MediaPipe runs on captured frames. | **TRUE** |
| MediaPipe pose detection on captured frames | Working. Client-side on still frames only. | **TRUE** |
| Perfect form comparison | Working. Side-by-side actual vs ideal. | **TRUE** |
| ScoreHero (animated score, delta) | Working. | **TRUE** |
| SkillCard (expandable, faults, biomechanics, drills) | Working. But skill narratives are thin — not the "rich" breakdowns the strategy promises. | **PARTIALLY TRUE** |
| Road to Next Level | Working for numeric USAG levels. **Breaks for Xcel tiers.** | **PARTIALLY TRUE** |
| Tier switcher | Working. But uses localStorage directly, not TierContext. | **TRUE (with technical debt)** |
| CORS fix for API key endpoint | Working. But regex is too permissive + key exposed to browser. | **TRUE (with security debt)** |
| Stripe scaffolding | Checkout creates session, webhook logs but **doesn't persist subscription state**. | **PARTIALLY TRUE** |
| Privacy Policy + ToS drafted | Files exist. Not reviewed by lawyer. | **TRUE** |
| Training tab | Working. But **not connected to analysis results** — shows generic content. | **PARTIALLY TRUE** |
| CSP fix for MediaPipe WASM | Working. | **TRUE** |

### What the Strategy Says is "In Progress" — Current Reality

| Strategy Item | Status | Blocking? | Effort |
|--------------|--------|-----------|--------|
| End-to-end pipeline verification | NOT STARTED — no fresh test exists | Yes — can't launch what isn't verified | 1 day |
| COPPA parental consent wiring | UI exists, **not wired to any backend** | **LAUNCH BLOCKER** | 2-3 days |
| Scoring validation (100 routines) | **1 routine tested.** 99 to go. | Yes — can't claim accuracy without data | 5-7 days |
| Rich skill narratives from Gemini | Current output is structured but **thin** — bullet points, not coaching narratives | Yes — core value prop | 2-3 days |
| Training programs linked to analysis | TrainingScreen exists but shows **generic content, not personalized drills** from latest analysis | Yes — strategy promises this | 2-3 days |
| Free tier dashboard cleanup | Free users can still see some Competitive/Elite UI elements | Nice-to-have for launch | 1 day |
| Demo data fallback | `generateDemoResult()` exists at LegacyApp:11293 but **not fully wired** for all empty states | Yes — "never show blank screen" rule | 1 day |

### Critical Gaps NOT Mentioned in Strategy Status

| Gap | Impact | Found In |
|-----|--------|----------|
| **Dual tier system** — TierContext exists but is never used. LegacyApp reads localStorage directly 9 times. Two different analysis counter keys. | Free users might get 6 analyses instead of 3. Tier enforcement is inconsistent. | Audit Report §6 |
| **API key exposure** — Raw Gemini API key returned to browser via `/api/gemini-key` | Anyone with DevTools gets your API key. Bill could be run up. | Audit Report §5 |
| **`api/analyze.js` uses wrong model** — `gemini-1.5-pro` vs client's `gemini-2.5-flash` | If fallback fires, response format won't match. Parser crashes. | Audit Report §2 |
| **localStorage will hit 5MB at ~150 analyses** — debug + cache keys never cleaned | Power users lose data silently mid-season | Audit Report §7 |
| **14 dead files (~2,500 lines)** — entire `src/analysis/` directory orphaned | Confusion, bundle size, maintenance burden | Audit Report §3 |
| **normalizedTier is a no-op** — `"competitive" ? "competitive"` normalizes nothing | Legacy "pro" tier string users break tier gates | Audit Report §2 |
| **Scoring consistency untested at scale** — "within 0.10" claim based on 1 routine | Can't launch with this claim unvalidated | Strategy §Calibration |

---

## Part 2: Priority Stack (What to Build in 2 Weeks)

### Non-Negotiable (Must ship or can't launch)

| # | Task | Why | Days |
|---|------|-----|------|
| 1 | **Scoring accuracy validation system** | Core value prop. 1 test ≠ validated. Need framework to test 100+ routines programmatically. | 3 |
| 2 | **Scoring consistency fix** | Same video must score within 0.10. Need deterministic prompt + seed validation. | 2 |
| 3 | **Unify tier system** | Kill dual system. Make LegacyApp use TierContext. Fix analysis counter. Fix normalizedTier. | 2 |
| 4 | **COPPA consent wiring** | Launch blocker per strategy. Wire AgeGate + ParentalConsent to localStorage persistence + gate the app. | 2 |
| 5 | **End-to-end pipeline verification** | Fresh test: clear storage → onboard → upload → analyze → results render correctly across all 3 tiers. | 1 |
| 6 | **Security hardening** | Move Gemini calls server-side (proxy through `/api/analyze`). Stop returning key to browser. Fix CORS regex. Set real app token. | 2 |

### High Priority (Ship quality depends on it)

| # | Task | Why | Days |
|---|------|-----|------|
| 7 | **Rich skill narratives** | Strategy promises coaching-depth breakdowns. Current output is thin bullets. Prompt engineering + response mapping. | 2 |
| 8 | **Training ↔ Analysis connection** | TrainingScreen must show personalized drills from latest analysis, not generic content. | 1 |
| 9 | **localStorage cleanup** | Add cleanup for `debug-gemini-*` and expired `strive_cache_*` keys. Add quota monitoring. | 1 |
| 10 | **Demo data fallback** | Wire `generateDemoResult()` into all empty states. Never show blank screen. | 1 |
| 11 | **Free tier dashboard cleanup** | Hide Competitive/Elite features from Free view. Show upgrade CTAs with blurred previews. | 1 |

### Technical Debt (Do if time allows)

| # | Task | Days |
|---|------|------|
| 12 | Dead code removal (14 files, ~2,500 lines) | 0.5 |
| 13 | Fix `api/analyze.js` model + schema mismatch | 0.5 |
| 14 | Fix Xcel tier mapping in RoadToNextLevel | 0.5 |
| 15 | Performance: extract localStorage reads out of render | 1 |

---

## Part 3: Agent Team Execution Plan

### Team Structure

Five agents, working in **strict sequential phases** to prevent sync conflicts. Each phase completes and verifies before the next begins.

```
PHASE 1 (Days 1-3): SCORING ACCURACY    → Agent Alpha (Scoring Engine)
PHASE 2 (Days 3-5): SECURITY + PLUMBING → Agent Bravo (Infrastructure)
PHASE 3 (Days 5-8): TIER + COPPA        → Agent Charlie (User Systems)
PHASE 4 (Days 8-11): CONTENT + UX       → Agent Delta (Experience)
PHASE 5 (Days 11-14): VERIFY + POLISH   → Agent Echo (QA + Integration)
```

### Why Sequential (Not Parallel)

The codebase is an 11,579-line monolith. Parallel agents editing `LegacyApp.js` will create merge conflicts on every commit. The dependency chain is real:
- Scoring fixes must land before the verification framework can validate them
- Security changes (server-side proxy) change how the analysis pipeline calls Gemini — downstream agents need the new API shape
- Tier unification changes how every screen checks permissions — must land before UX cleanup
- Content/UX changes depend on stable tier gating and a working pipeline

Parallel work is only safe on **isolated files** (extracted components, API routes, tests). The plan identifies these windows.

---

### PHASE 1: Scoring Accuracy (Days 1-3)
**Agent: Alpha (Scoring Engine)**
**Priority: #1 — "judging accuracy and consistency is priority"**

#### Day 1: Scoring Consistency Hardening
- [ ] Audit `buildJudgingPrompt()` (LegacyApp.js:4353-4632) for non-deterministic elements
- [ ] Verify `temperature: 0.1`, `topP: 1`, `topK: 1`, `seed: 42` are locked
- [ ] Add prompt versioning — hash the prompt and include in cache key
- [ ] Test same video 5x → verify all scores within 0.10 range
- [ ] Document any variance sources (Gemini File API processing, frame extraction timing)

#### Day 2: Scoring Validation Framework
- [ ] Create `tests/scoring/` directory with validation harness
- [ ] Build script that takes: video URL + expected score + level + event → runs analysis → compares
- [ ] Create test manifest (`tests/scoring/manifest.json`) with fields for each of 100 routines
- [ ] Structure: `{ video, level, event, actualScore, judgeNotes, expectedDeductions }`
- [ ] Run first 10 validation cases, document deltas

#### Day 3: Prompt Calibration Refinement
- [ ] Analyze delta patterns from Day 2 (which events/levels are off?)
- [ ] If systematic bias exists (e.g., floor always 0.15 high), add event-specific calibration offsets
- [ ] Strengthen `EVENT_JUDGING_RULES` in `constants.js` for underperforming events
- [ ] Verify combination pass merging works correctly for floor/vault combos
- [ ] Test edge cases: fall (0.50 deduction), short routine, wrong level skills

**Deliverable:** Scoring consistency report. Framework for ongoing validation. First 10+ routines validated.

**Parallel work possible:** Another agent can work on `api/analyze.js` fixes and dead code removal (isolated files) while Alpha works on the prompt.

---

### PHASE 2: Security + Infrastructure (Days 3-5)
**Agent: Bravo (Infrastructure)**

#### Day 3 (overlaps with Alpha Day 3 — different files):
- [ ] Rewrite `/api/analyze.js` to be the **primary** Gemini endpoint (server-side proxy)
  - Move `buildJudgingPrompt()` logic server-side (or accept prompt from client with validation)
  - Use `gemini-2.5-flash` (fix the model mismatch)
  - Match the JSON schema the client expects
  - Accept video as upload, not requiring client to have API key
- [ ] Update `api/gemini-key.js` — **stop returning the key**. Return only `{ available: true }` for feature detection.

#### Day 4:
- [ ] Update `LegacyApp.js:analyzeWithAI()` to call `/api/analyze` instead of making direct Gemini calls
  - Client sends: video file + athlete profile (name, level, event, gender)
  - Server returns: structured JSON result (same shape as current)
  - Removes ~200 lines of client-side Gemini API code
- [ ] Fix CORS regex: `strive-app-3*.vercel.app` or exact hostname list
- [ ] Set `STRIVE_APP_TOKEN` as a real env var in Vercel, remove hardcoded fallback from client code
- [ ] Add basic rate limiting to `/api/analyze` (IP-based, 10 requests/minute)

#### Day 5:
- [ ] Test full pipeline through server proxy: upload → server processes → results render
- [ ] Verify Vercel serverless function can handle video upload (check 4.5MB body limit — may need Vercel Blob or chunked upload)
- [ ] Add error handling for server timeout (Vercel serverless has 60s default)
- [ ] Test fallback chain: server Gemini → demo data

**Deliverable:** API key no longer exposed to browser. All Gemini calls proxied. Rate limiting active.

**IMPORTANT NOTE:** Vercel serverless functions have a 4.5MB request body limit (free tier) and 60-second timeout. Video files are typically 10-100MB. Two options:
1. **Upload video to Gemini File API from server** (requires streaming, may exceed timeout)
2. **Keep client-side Gemini File API upload but proxy the generateContent call only** (API key still needed for upload)

Recommend option 2 for MVP: client uploads video to Gemini (using a short-lived, scoped token from server), server makes the generateContent call. This keeps video upload fast while protecting the main API interaction.

---

### PHASE 3: Tier Unification + COPPA (Days 5-8)
**Agent: Charlie (User Systems)**

#### Day 5-6: Tier Unification
- [ ] Make `LegacyApp.js` use `useTier()` hook from TierContext instead of direct localStorage reads
- [ ] Remove all 9 inline `localStorage.getItem("strive-tier")` calls from LegacyApp.js
- [ ] Fix `normalizedTier`: change to `userTier === "pro" ? "competitive" : userTier`
- [ ] Unify analysis counter: single key `strive-analyses-month` used by both TierContext and LegacyApp
- [ ] Delete the `strive-analysis-count` key usage from LegacyApp
- [ ] Wire `TierGate` component around Competitive/Elite-only features
- [ ] Verify free tier shows exactly: score + 2 sentences + blurred preview + upgrade CTA
- [ ] Verify analysis cap: free tier stops at exactly 3/month with clear messaging

#### Day 7: COPPA Consent Wiring
- [ ] Wire `AgeGate` component into onboarding flow (after profile setup, before first analysis)
- [ ] If user is under 13: show `ParentalConsent` component
- [ ] Persist consent state to localStorage: `strive-coppa-consent: { parentEmail, consentDate, childDOB, verified: false }`
- [ ] Gate analysis behind consent check: no analysis without consent for under-13
- [ ] Add consent verification reminder (banner at top until parent email confirmed)
- [ ] Add "Manage Consent" option in Settings for parents to revoke

#### Day 8: Integration Testing
- [ ] Test complete onboarding flow: install → profile → age gate → consent → first analysis
- [ ] Test tier switching: Free → Competitive → Elite → Free (verify features gate correctly)
- [ ] Test analysis cap: run 4 analyses on Free tier, verify 4th is blocked
- [ ] Test consent flow for 13+, under-13, and edge case (exactly 13)

**Deliverable:** Single tier system. COPPA compliance. Analysis cap enforced correctly.

---

### PHASE 4: Content + UX (Days 8-11)
**Agent: Delta (Experience)**

#### Day 8-9: Rich Skill Narratives
- [ ] Enhance `buildJudgingPrompt()` to request richer narrative output per skill:
  - Quality grade with explanation (not just letter grade)
  - Body mechanics narrative (not just angle numbers)
  - Specific drill recommendation with WHY this drill fixes this fault
  - What good execution looks like for this skill at this level
- [ ] Update JSON schema in prompt to include new narrative fields
- [ ] Update `SkillCard.js` to render rich narratives (coach-quality explanations)
- [ ] Update `Layer2Competitive.js` and `Layer3Elite.js` to display new content

#### Day 9-10: Training ↔ Analysis Connection
- [ ] After analysis completes, extract top 3 drills from result
- [ ] Store personalized drill recommendations in localStorage: `strive-drill-recs`
- [ ] Update `TrainingScreen/index.js` to read and display personalized drills at top
- [ ] Show "Based on your last analysis" section with fault-specific drills
- [ ] Keep generic training content below personalized section

#### Day 10-11: Free Tier + Demo Data + Polish
- [ ] Audit Free tier dashboard — remove any Competitive/Elite content that leaks through
- [ ] Add blurred preview cards on Free results (show structure of full analysis, blurred out)
- [ ] Wire `generateDemoResult()` into all empty states (no analysis yet, offline, error)
- [ ] localStorage cleanup: add `cleanupStorage()` function on app init
  - Delete `debug-gemini-*` keys older than 7 days
  - Delete `strive_cache_*` keys older than 24 hours
  - Log total localStorage usage and warn at 4MB
- [ ] Fix Xcel tier mapping in `RoadToNextLevel.js`

**Deliverable:** Rich coaching-quality skill narratives. Personalized training. Clean free tier. No blank screens. Storage managed.

---

### PHASE 5: Verification + Polish (Days 11-14)
**Agent: Echo (QA + Integration)**

#### Day 11-12: End-to-End Verification
- [ ] **FRESH TEST:** Clear all localStorage. Clear browser cache. Load app.
  - Verify: Splash → Onboarding → Age Gate → Analysis → Results → Dashboard
- [ ] Test on 3 devices: iPhone Safari, Android Chrome, Desktop Chrome
- [ ] Test all 3 tiers end-to-end with real video analysis
- [ ] Verify scoring consistency: same video, 3 runs, all within 0.10
- [ ] Test offline behavior: start analysis, go offline, come back
- [ ] Test the upgrade modal and tier switching
- [ ] Verify "never show blank screen" — test every empty state

#### Day 12-13: Scoring Validation Sprint
- [ ] Run remaining routines through validation framework (target: 50+ validated)
- [ ] Document accuracy by level and event
- [ ] Create accuracy dashboard/report showing:
  - Average delta per level
  - Average delta per event
  - Worst-case delta
  - % of routines within 0.10 target
- [ ] If any event/level is consistently off, calibrate with Alpha agent

#### Day 13-14: Dead Code + Performance + Final Polish
- [ ] Remove 14 dead files (after confirming no hidden imports)
- [ ] Remove unused Recharts imports
- [ ] Run `npm run build` — verify clean build with no warnings
- [ ] Run `npm test` — fix any failing tests
- [ ] Run Lighthouse audit — document scores
- [ ] Final review of all changes against STRATEGY.md
- [ ] Write CHANGELOG.md summarizing everything shipped

**Deliverable:** Verified working app. 50+ validated routines. Clean codebase. Ready for seed testing.

---

## Part 4: Beyond the Prompt — What I'd Add

### 1. Scoring Regression Test Suite (Future-Proofing)
Every time the prompt changes, the validation framework re-runs all 100 routines and compares. If any score drifts >0.10 from expected, the change is flagged. This prevents prompt regressions and is the foundation for the data moat — every validated routine is training data.

### 2. A/B Prompt Testing Infrastructure
Before prompt changes ship, run the new prompt against 20 routines and compare deltas to the old prompt. If the new prompt isn't strictly better, don't ship it. This is how the scoring gets to 0.05 delta.

### 3. Gemini Response Quality Monitor
Log every Gemini response's structure (not content) — did it return all expected fields? Were any sections truncated? What was the actual token count vs. max? This catches silent quality regressions in the AI layer before users notice.

### 4. Score Anchoring System
For every level + event combination, maintain a reference score range (e.g., "Level 6 Floor: typical 8.3-9.1"). If Gemini returns a score outside this range, flag it for review. This catches catastrophic scoring errors (a 7.2 on a clean routine, a 9.8 on a fall).

### 5. User Feedback Loop
Add a "Was this score accurate?" thumbs up/down on every result. Store the feedback. After 1,000 ratings, you have a real-world accuracy signal that doesn't depend on having judge scores. Parents KNOW when a score is wrong — they just watched the routine.

### 6. Progressive Prompt Enhancement
As you collect validated routines, start including 2-3 example routines (with known scores) in the prompt as few-shot examples. Gemini's accuracy improves dramatically with concrete examples of "this routine = this score because of these deductions."

### 7. Event-Specific Prompt Splitting
Instead of one mega-prompt that handles all events, create event-specific prompts (floor, beam, vault, bars). Each prompt can be tuned independently, include event-specific few-shot examples, and be tested against event-specific validation sets. This is how you get from 0.075 delta to 0.03.

---

## Part 5: Execution Rules

1. **One agent at a time on LegacyApp.js.** No parallel edits to the monolith. Merge conflicts in an 11K-line file are catastrophic.
2. **Build after every change.** `npm run build` must pass. No exceptions.
3. **Commit at phase boundaries.** Each phase gets its own commit(s) so rollback is possible.
4. **Don't touch the scoring prompt** without running the validation framework against it. Document every change.
5. **Test on mobile.** The app is 540px max-width for a reason — most parents are on phones at meets.
6. **No scope creep.** Phase 2/3/4 of the strategy are out of scope. Coach accounts, cloud sync, push notifications — all deferred.
7. **When in doubt, ship less.** A working app with 8 features beats a broken app with 15.

---

## Timeline Summary

```
Week 1:
  Mon-Wed (Days 1-3):  SCORING ACCURACY — consistency, validation framework, first tests
  Wed-Fri (Days 3-5):  SECURITY — server proxy, key protection, rate limiting

Week 2:
  Mon-Wed (Days 5-8):  TIER + COPPA — unify tiers, wire consent, integration test
  Wed-Fri (Days 8-11): CONTENT + UX — rich narratives, training connection, cleanup
  Fri-Sun (Days 11-14): VERIFY — end-to-end testing, scoring validation sprint, polish
```

**By April 3:** A verified, secure, accurately-scoring app ready for 20 seed families.
