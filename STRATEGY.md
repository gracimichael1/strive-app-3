# STRIVE STRATEGY — LOCKED DECISIONS

> This file governs ALL development decisions. Every code change, feature addition, or architectural choice must align with this document. If a proposed change conflicts with this strategy, it requires explicit owner (Michael Graci) approval before proceeding.

> **Last updated: March 19, 2026**

---

## Mission Statement
Give gymnasts, parents, and coaches an intuitive AI-powered platform to understand scoring, improve performance, prevent injuries, and track growth — starting with gymnastics, built to scale to all judged sports.

**Positioning:** "The Parent's Scoring Companion." Not a coach tool, not gym software. The app that makes gymnastics scoring understandable for the parent sitting in the stands wondering why their daughter got an 8.7.

---

## Market Opportunity

### Target Market
- **150K** USAG-registered competitive gymnasts (primary target)
- Families spending **$6K–12K/year** on the sport (coaching, privates, travel, gear)
- These families are **proven premium spenders** — primed for a subscription tool that gives expert feedback on demand

### Why Now
- No AI-native gymnastics scoring tool exists for parents
- GenAI video analysis hit production quality in 2025 (Gemini 2.5 Flash)
- Gymnastics parents are digitally engaged, community-driven, and hungry for insight between lessons
- 2% market share (~3,000 subscribers) = **$500K+ ARR**

### Data Moat
Every analysis generates labeled training data. By 100K analyses, Strive owns the most valuable gymnastics scoring dataset in existence. Competitors starting from scratch are 12-18 months behind.

| Stage | Trigger | Action | Cost per Analysis |
|-------|---------|--------|-------------------|
| **Now** | Launch | Gemini 2.5 Flash | $0.018 |
| **Stage 2** | 50K analyses | Fine-tune open model (Llama/Gemma) on proprietary data | $0.018 (training ~$5K) |
| **Stage 3** | 100K analyses | Hybrid — own model for standard, Gemini for edge cases | ~$0.005 |
| **Stage 4** | 250K+ analyses | Mostly self-hosted, Gemini as fallback only | ~$0.002 |

---

## Competitive Landscape

| Competitor | Threat | What They Do | Why Strive Wins |
|------------|--------|-------------|-----------------|
| **Sprongo** | High | Cloud video, AI pose tracking (SIVA), 150K athletes. Multi-sport. No gymnastics-specific scoring. Coach-oriented pricing. | We actually **score the routine**. Sprongo gives video tools — we give a judge's verdict and coaching plan. |
| **OnForm** | Medium | Sports video coaching, HD recording, slow-mo, drawing tools. Requires a human coach. $5-79/mo. Golf-heavy. | We ARE the judge + coach + analyst. OnForm requires a human to provide the analysis. |
| **Gymnastics Tools** | Low | Training management, 1,500 exercises, video annotation. Coach/org-oriented, enterprise pricing. No AI scoring. | We score and coach the individual athlete. They manage programs. Different use case. |
| **iScore5** | Low | Evaluation/tracking for coaches. Skill checklists, progress reporting. No video, no AI, no USAG deductions. | Entirely different product category. |
| **MeetCritique** | Low | Manual video critique by real judges. ~$10/routine, 1-3 day wait. | At Competitive tier: 36 analyses/year for $120 total = $3.33/analysis. We're instant, they're 3 days. |

---

## Membership Tiers (FINAL)

### Consumer Tiers

| Tier | Name | Price | Annual | Target Customer |
|------|------|-------|--------|-----------------|
| Free | **Free** | $0 | $0 | Gym parent at a meet — conversion hook |
| Paid | **Competitive** | $9.99/mo | $99/yr (save 17%) | Committed athlete/parent who wants to understand scoring |
| Premium | **Elite** | $19.99/mo | $199/yr (save 17%) | Serious competitor, college-track, data-driven parent |

### B2B Tiers (Phase 3+)

| Tier | Name | Price | Target |
|------|------|-------|--------|
| B2B | **Coach** | $49.99/mo ($499/yr) | Individual coaches — free tier first, paid when features justify |
| B2B | **Gym** | $149-299/mo | Gym-wide license, unlimited athlete accounts |

### What Each Tier Gets

#### Free — "The Hook"
- Score + 2-sentence summary (what went right, what to work on)
- Intentionally vague to drive upgrades
- **3 analyses per month** cap (the conversion trigger)
- Blurred preview of full analysis as visual teaser
- Upgrade CTA prominently placed
- Daily encouragement on dashboard

#### Competitive — "The Breakdown" ($9.99/mo)
- **Everything in Free, plus:**
- Full skill-by-skill graded cards (quality score, fault severity, corrections)
- Video Analysis Player (slow-mo 0.25x, seek-to-skill, frame capture)
- MediaPipe skeleton overlay on captured frames
- Perfect form comparison (actual vs zero-deduction reference)
- Judge's Analysis narrative (why this score)
- Celebrations (what went right — detailed list)
- Path to Higher Score (top fixes with projected score gain)
- Road to Next Level (current vs next level skill comparison)
- Artistry & Composition breakdown (collapsible)
- Weekly Focus Drills (top 3 derived from faults)
- Score Path ("fix these 2 things = 9.2")
- Injury awareness on skills with physical risk
- Reference links (YouTube perfect form, Google images, level examples)
- Unlimited analyses
- Daily encouragement on dashboard

#### Elite — "The Lab" ($19.99/mo)
- **Everything in Competitive, plus:**
- What-If Simulator (toggle faults on/off to project score)
- Body Mechanics Overview (knee angle, hip alignment, shoulder position, toe point across all skills)
- Session Diagnostics (confidence %, skills detected, total faults, recurring faults, artistry/composition deductions)
- Coach Report (share/export)
- Fault Trend (multi-session tracking)
- Full access to all future elite features
- Daily encouragement on dashboard

### Free-to-Paid Funnel
```
Parent downloads at a meet → uploads first video → sees score + 2 vague sentences
→ Sees blurred preview of full breakdown ("We found more for your gymnast")
→ Hits 3/month cap on second meet weekend → Upgrade CTA
→ $9.99/mo Competitive (most conversions here)
→ Power users who want what-if + diagnostics → $19.99/mo Elite
```

### Pricing Psychology
- Free cap of 3/month is the trigger — a competitive family uses this at least 4x/month
- At $9.99/mo, parent gets ~36 analyses/year for $120 total ($3.33/analysis vs MeetCritique's $10)
- Annual plans lock in revenue and reduce churn (save 17% = $99/yr)

---

## Phase Gates — Do NOT Skip Ahead

### Phase 1: LAUNCH READY (Current)
**Goal: Ship to paying gym parents. Revenue day 1.**
**Target: September 2026 (competitive season starts Sep-Oct)**

#### DONE — Verified Working
- [x] Secure API key endpoint (CORS fix deployed)
- [x] Accessibility fixes (WCAG AA baseline)
- [x] Performance fixes (lazy loading, memoization)
- [x] Build 3-layer results screens (Free/Competitive/Elite)
- [x] Build Training tab (drills, strength, mental, nutrition)
- [x] Wire new components into app
- [x] Scoring calibration — Brevet prompt, two-sided bounds (0.80-1.50)
  - Tested: 8.850 output vs 8.925 actual = 0.075 delta (within 0.10 target)
- [x] Cache versioning (`v5_strict_brevet`)
- [x] maxOutputTokens: 16384 (was 8000, caused truncated JSON)
- [x] 3-button tier switcher in Settings
- [x] Data binding fix — Layer2/Layer3 read from both `result.summary.X` and `result.X`
- [x] VideoReviewPlayer extracted and wired into Competitive + Elite
  - Slow-mo, seek-to-skill, skeleton overlay, frame capture, perfect form comparison
- [x] Road to Next Level tile (current vs next level skills)
- [x] ScoreHero (animated score, delta from previous)
- [x] SkillCard (expandable, per-skill faults, body mechanics, injury awareness, drills)
- [x] Stripe scaffolding (checkout, webhook, upgrade modal)
- [x] Privacy Policy + Terms of Service drafted
- [x] Fix video display in expanded skill cards

#### IN PROGRESS — Must Complete Before Launch
- [ ] **End-to-end pipeline verification** — CORS fix deployed, need fresh test with cleared localStorage to confirm: API key loads → video uploads → skills parse → tiles populate
- [ ] **COPPA parental consent flow** — BLOCKING. Components built (AgeGate, ParentalConsent), need wiring
- [ ] **Scoring validation (100 routines)** — Test across multiple levels/events vs real judge scores
- [ ] **Rich skill narratives** — Match depth of direct Gemini conversations (quality grades, body mechanics detail)
- [ ] **Training programs connected to analysis** — TrainingScreen exists but isn't fed personalized drill recs from latest analysis
- [ ] **Free tier dashboard cleanup** — Remove Competitive/Elite features from Free view
- [ ] **Demo data fallback** — Show realistic demo when no analysis exists

#### OWNER ACTION REQUIRED — Cannot Ship Without
- [ ] Stripe account setup + wiring
- [ ] Business entity formation
- [ ] Legal review of Privacy Policy + ToS

---

### Phase 2: RETENTION ENGINE + COACH CHANNEL
**Goal: Make athletes come back weekly. Activate coach multiplier.**
**Trigger: 100+ paying subscribers**

- [ ] User accounts + cloud sync (Supabase Auth + Postgres)
- [ ] Push notifications (weekly digest, new analysis ready)
- [ ] Drill completion tracking
- [ ] Weekly engagement digest email
- [ ] Progress tracking over time (score trend charts)
- [ ] "Share with Coach" link generation — the hook that gets coaches into the ecosystem
- [ ] Free Coach accounts (view athletes, add notes)
- [ ] Coach referral program (one coach = 20-60 subscriber families)
- [ ] Email outreach to 500 USAG-registered coaches (public directory)

**Retention moat:** After 6 months of data, a family has their daughter's full coaching record in Strive — every deduction, every drill, every improvement charted. That's not an app they cancel.

---

### Phase 3: GYM B2B + MONETIZE COACHES
**Goal: Turn coach adoption into recurring B2B revenue.**
**Trigger: 50+ coach accounts active**

- [ ] Gym Club License ($149-299/mo, unlimited athletes)
- [ ] Coach portal (team management, pattern detection)
- [ ] Coach-specific insights ("3 athletes have same hip angle issue")
- [ ] PDF report export for coaches to share with parents
- [ ] Case study marketing (gym A's improvement data vs gym B)
- [ ] Present at USAG regional congresses and coach clinics

---

### Phase 4: ELITE TOOLS + MULTI-SPORT EXPANSION
**Goal: Serve serious athletes. Expand TAM by 5x.**
**Trigger: $100K+ MRR**

- [ ] Real MediaPipe full-video pose detection (VideoReviewPlayer already does per-frame)
- [ ] D-score / composition analysis (artistry breakdown already exists)
- [ ] Recruiting toolkit
- [ ] Multi-athlete family accounts
- [ ] **Figure skating** — IJS scoring, 176K+ USFS competitive skaters, same parent demographics
- [ ] **Competitive cheer/dance** — hundreds of thousands of athletes, zero AI scoring tools
- [ ] **Diving** — similar judging structure
- [ ] **Rhythmic gymnastics** — adjacent sport, same parent base

**Exit potential:** At $100K+ MRR across 2-3 sports, Strive becomes acquisition target for Hudl, CoachNow, Stack Sports, or Series A candidate.

---

## Go-to-Market Channels

### Phase 1 Channels (Pre-Launch → First 100 Subscribers)

| Channel | Priority | Tactic |
|---------|----------|--------|
| **Gym parent seed group** | P0 | Find 20 parents in local gyms. Free lifetime access for weekly feedback + video testimonials |
| **Facebook groups** | P0 | Post in Gym Parents USA, USAG Parents Network. Free analysis for first 100 families. Collect emails |
| **Reddit** | P1 | Demo video on r/Gymnastics, r/Parenting. Show real routine with timestamped deductions |
| **Instagram/TikTok nano-influencers** | P1 | DM 50 gymnastics parents with 5K-100K followers. Free Competitive access for honest review |
| **Meet presence** | P1 | QR codes at local meets. "Get your routine analyzed free — scan now" |

### Phase 2 Channel (Coach Multiplier)
- One coach adoption = 20-60 paying subscribers
- Free Coach accounts convert coaches into unpaid sales force
- Coach assigns analysis → athlete becomes paying subscriber → parent tells other families → other families pressure their coaches
- Each coach is a distribution node reaching 20-60 families simultaneously

### Launch Timing
**Target: September 2026** — competitive season starts Sep-Oct. Families maximally engaged with scoring. Peak motivation to pay for feedback tools.

---

## Current Architecture (March 19, 2026)

### File Structure
```
src/
├── LegacyApp.js              — ~11K line monolith (being decomposed)
├── App.js                     — Thin wrapper adding TierProvider
├── screens/
│   ├── ResultsScreen/
│   │   ├── index.js           — Tier router (Free/Competitive/Elite)
│   │   ├── ScoreHero.js       — Animated score display with delta
│   │   ├── Layer1Free.js      — Free teaser (2 sentences + upgrade CTA)
│   │   ├── Layer2Competitive.js — Full analysis + VideoReviewPlayer
│   │   ├── Layer3Elite.js     — Expert tools (what-if, diagnostics, coach report)
│   │   └── RoadToNextLevel.js — Level progression comparison
│   ├── DashboardScreen/       — Dashboard with daily encouragement
│   └── TrainingScreen/        — Drills, strength, mental, nutrition
├── components/
│   ├── ui/SkillCard.js        — Expandable per-skill card
│   ├── video/
│   │   ├── VideoReviewPlayer.js — Slow-mo, seek, skeleton, frame capture, perfect form
│   │   └── VideoAnalyzer.js   — Upload + analysis pipeline
│   ├── billing/UpgradeModal.js
│   ├── legal/                 — AgeGate, ParentalConsent, PrivacyNotice, LegalDisclaimer
│   ├── onboarding/SplashScreen.js
│   ├── shared/StriveLogo.js
│   └── timeline/SkillTimeline.js
├── context/TierContext.js     — Free/Competitive/Elite tier gating + feature flags
├── data/constants.js          — LEVELS, LEVEL_SKILLS, SCORE_BENCHMARKS
├── utils/helpers.js           — safeStr, safeArray, safeNum, escapeHtml, log
└── analysis/                  — Frame extraction, MediaPipe pose, skill segmentation
api/
├── gemini-key.js              — Serverless: delivers GEMINI_API_KEY (CORS-safe)
└── analyze.js                 — Serverless: biomechanics → Gemini → structured JSON
```

### AI Pipeline
```
Video upload → compress if >100MB → extract 24 frames (85% JPEG)
→ Upload full video to Gemini File API
→ Single-pass Brevet USAG judging prompt (two-sided calibration 0.80-1.50)
→ gemini-2.5-flash, maxOutputTokens: 16384, responseMimeType: application/json
→ Parse JSON → Map to result structure → Render in tier-appropriate screen
→ Fallback: Claude Sonnet 4 frame analysis → Fallback: demo data
```

### Scoring Calibration (LOCKED — do not modify without owner approval)
- Framing: "Brevet-certified USAG judge at State Championship, no benefit of the doubt"
- Total deductions < 0.80 → too LENIENT
- Total deductions > 1.50 → too HARSH
- Execution deductions typically 0.50-0.90; artistry + composition add 0.20-0.40
- Tested: **8.850 output vs 8.925 actual = 0.075 delta** (target: within 0.10)

---

## Design System (LOCKED — do not change)
```
Background: #070c16    Surface: #0d1422 / #121b2d
Gold: #e8962a          Gold light: #ffc15a
Green: #22c55e         Orange: #e06820         Red: #dc2626
Fonts: Outfit (display) + Space Mono (data/numbers)
Max width: 540px centered. Min touch target: 44px.
Aesthetic: Luxury athletic — Olympic broadcast quality.
```

### Navigation (FINAL)
Bottom nav: Home | Training | Analyze (primary) | Progress | Profile
- Training is its own dedicated tab (drills, nutrition, mental, strength)
- Dashboard shows daily encouragement (ALL tiers)

---

## What We Are NOT Building (Scope Fence)
- No white-label / custom branding for gyms (deferred to Phase 3)
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
9. **Don't break what works.** Scoring calibration is locked. Don't touch the prompt without owner approval.
10. **September 2026 launch target.** Every decision is measured against: does this get us closer to shipping?
