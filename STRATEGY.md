# STRIVE STRATEGY — LOCKED DECISIONS

> This file governs ALL development decisions. Every code change, feature addition, or architectural choice must align with this document. If a proposed change conflicts with this strategy, it requires explicit owner (Michael Graci) approval before proceeding.

## Mission Statement
Give gymnasts, parents, and coaches an intuitive AI-powered platform to understand scoring, improve performance, prevent injuries, and track growth — starting with gymnastics, built to scale to all judged sports.

## Phase Gates — Do NOT skip ahead

### Phase 1: LAUNCH READY (Current)
**Goal: Ship to paying gym parents. Revenue day 1.**
- [x] Fix misleading privacy claim
- [x] Secure API key endpoint
- [x] Accessibility fixes (WCAG AA baseline)
- [x] Performance fixes (lazy loading, memoization)
- [x] Build 3-layer results screen (Free/Competitive/Elite)
- [x] Build Training tab (drills, strength, mental, nutrition)
- [x] Wire new components into app
- [x] Fix scoring consistency bug — seed parameter, prompt constraints, USAG rounding, cache fingerprinting
- [x] Stripe payment integration — scaffolding complete (checkout, webhook, upgrade modal). Activate when Stripe account ready.
- [x] Privacy Policy + Terms of Service — drafted in /legal/
- [ ] COPPA parental consent flow — in progress (age gate + consent components)
- [x] Fix video display in expanded skill cards — preload, webkit-playsinline, fallback added

### Phase 2: RETENTION ENGINE
**Goal: Make athletes come back weekly.**
- [ ] User accounts + cloud sync (Supabase Auth + Firestore/Postgres)
- [ ] Push notifications
- [ ] Drill completion tracking
- [ ] Weekly engagement digest
- [ ] Score Path visualization ("fix these 2 things = 9.2")

### Phase 3: COACH CONNECTION
**Goal: Make Strive the tool coaches recommend.**
- [ ] Coach portal (view athletes, add notes)
- [ ] Team management
- [ ] Coach-specific insights ("3 athletes have same pattern")
- [ ] Share-with-coach link generation

### Phase 4: ELITE & EXPANSION
**Goal: Serve serious athletes + expand to new sports.**
- [ ] Real MediaPipe pose detection (replace decorative SVG)
- [ ] D-score / composition analysis
- [ ] Recruiting toolkit
- [ ] Multi-athlete family accounts
- [ ] Cheerleading expansion (Year 2)
- [ ] Figure skating expansion (Year 2-3)

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
- **Layer 1 (Free)**: Score + 2 sentences (what went right, what to work on). Intentionally vague. Upgrade CTA.
- **Layer 2 (Competitive)**: Full skill-by-skill breakdown, biomechanics, video analysis, motion detection, drill recommendations, injury awareness. The works.
- **Layer 3 (Elite)**: Everything + what-if simulator, diagnostics, coach reports, fault trends, recruiting tools.

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

## Rules of Engagement
1. **No scope creep.** If it's not in the current phase, it doesn't get built.
2. **No "while we're at it" improvements.** Fix what's assigned, nothing more.
3. **Every change must build.** Run `npm run build` before committing.
4. **Never show AI provider names in UI.** No "Gemini", "Claude", "AI", "Anthropic".
5. **Same video, same score.** Scoring consistency within 0.10 is non-negotiable.
6. **No blank screens ever.** Always fallback to cached or demo data.
7. **Daily encouragement on dashboard.** All tiers. Non-negotiable.
8. **Legal compliance before launch.** COPPA, Privacy Policy, ToS are launch blockers.
