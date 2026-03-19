# STRIVE Strategic Report

**Date**: March 19, 2026
**Author**: Strategic Synthesis Agent
**Input Sources**: RECON_REPORT.md, MARKET_REPORT.md, VISION_REPORT.md, AGENT_LOG.md, BLOCKED.md, CLAUDE.md, git history, production build

---

## SECTION A — WHAT WE BUILT (Current State)

### Complete Feature List

| Feature | Status | Notes |
|---|---|---|
| Splash + onboarding (5-step) | **Working** | Role, name, gender, level, age/goals. 20-second setup. |
| Profile persistence (localStorage) | **Working** | Per-athlete records with fault history, goals, analysis history |
| Dashboard with score trends + affirmations | **Working** | Score trends, quick actions, history, share STRIVE |
| Video upload + camera capture | **Working** | File picker + camera, auto-compression >100MB via MediaRecorder |
| 3-strategy frame extraction | **Working** | Seek-based, play-based, single-frame fallback. iPhone .MOV compatible. |
| Gemini 2.5 Flash video analysis (2-pass) | **Working** | Upload to File API, poll for ACTIVE, Detect -> Judge with 8K thinking |
| Pipe-delimited response parser | **Working** | Parses skill table, validates deductions 0-0.50, computes final score |
| Combo skill grouping (RO+BHS+Layout = 1 card) | **Working** | Adjacent skills within 2s, matching combo patterns, merged deduction capped 0.50 |
| Score caching (24hr, by filename+size+level+event) | **Working** | Fixed: now includes file size to prevent collision on same-name files |
| Expanded deduction validation | **Working** | Granular caps for landing steps, beam wobbles, split angles by level |
| Graded skill cards (A+ through F) | **Working** | 5-tab system: Overview, Bio, Motion, Injury, Drills. Grade-colored left border. |
| In-card video player with timestamp seeking | **Working** | Blob URL per card (create on expand, revoke on collapse), muted autoplay for iOS |
| Playback speed controls (0.25x/0.5x/1x) | **Working** | Per-card playback rate control |
| Real MediaPipe skeleton overlay | **Working** | Lazy-loaded on first toggle, joint color coding by angle deviation, requestAnimationFrame loop |
| Fault timeline strip in skill cards | **Working** | Horizontal bar with orange/red dots for fault moments, tap-to-seek |
| Skills tab filter pills | **Working** | All / Acro / Dance / Clean / Faults filtering |
| Overview tab (8 premium sections) | **Working** | Hero Score Ring, Context Strip, Judge's Perspective, Artistry Breakdown, Areas for Improvement, Path to 9.0+, Improvement Potential, Season Goal Tracker |
| Body heatmap (SVG silhouette) | **Working** | Deduction glow overlays on affected body regions |
| Deduction timeline (time-bucketed bar chart) | **Working** | Time-bucketed visualization of deductions |
| Score benchmark (percentile vs level) | **Working** | Shows where gymnast ranks vs level averages |
| Actual score input + calibration | **Working** | Saves correction data for future AI calibration |
| Meets/history screen | **Working** | Grouped by meet, all-around totals |
| Progress screen (Pro) | **Working** | Score trend chart via Recharts, personal bests, event breakdown |
| Mental training (Pro) | **Working** | 6 sections: visualization, breathing, confidence, meet day, parents |
| Season goals (Pro) | **Working** | Real goal tracking: target score, target meet, days remaining, pts/week needed |
| What-If simulator (Pro) | **Working** | Toggle deductions on/off to see projected score |
| Biomechanics dashboard (Pro) | **Working** | Body report card, power/flight, joint angles, landing analysis |
| Training program (Pro) | **Working** | 5-pillar: drills, strength, mental, nutrition, recovery |
| Diagnostics dashboard (Pro) | **Working** | Engine report, severity distribution, score drains |
| Drills screen with fault-specific recommendations | **Working** | Drills with YouTube links (note: violates owner rule — see debt) |
| Deduction reference guide | **Working** | Category tabs, quick score calculator |
| Settings (edit profile, API key, Pro, reset) | **Working** | Now includes season goal fields (target score, event, meet date, meet name) |
| Athlete profile persistence | **Working** | Per-athlete localStorage records, fault history, analysis history |
| Fault intelligence (cross-analysis) | **Working** | Most common faults, fixed/regression badges, frequency counts |
| Personalized weekly drill plan | **Working** | Auto-generated from top 3 faults after 5+ analyses, 39-drill database |
| Improvement curves | **Working** | Score progression LineChart, per-fault trend indicators (improving/plateaued/worsening) |
| Error boundaries (18 total) | **Working** | 8 screens + 3 sub-tabs + per-card + 6 charts. Retry button, never blank screen. |
| Shimmer loading components | **Working** | ShimmerBlock + SkillCardShimmer for loading states |
| Offline resilience | **Working** | Online/offline detection, banner, last 5 analyses cached, fallback display |
| Demo fallback | **Working** | Realistic fake results when all AI fails |
| Share with coach / share STRIVE | **Working** | Native share sheet or clipboard |
| Free/Pro tier gating | **Partial** | Two competing systems coexist (LegacyApp direct localStorage vs TierContext). TierContext is loaded but inert. |
| Claude Sonnet 4 fallback | **Missing** | CLAUDE.md lists it but `analyzeWithClaude` does not exist in codebase |
| Side-by-side video comparison | **Missing** | Not built. High demand from market research. |
| Video export with annotations | **Missing** | Not built. Table-stakes feature per market analysis. |
| Cloud storage / multi-device | **Missing** | localStorage only. Phone loss = data loss. |
| Multi-athlete profiles | **Missing** | Per-athlete records exist but no in-app profile switcher UI |
| Payment integration (Stripe) | **Missing** | All "Upgrade to Pro" buttons just set localStorage. Anyone is Pro for free. |
| AI-generated content legal disclaimer | **Missing** | Required by CLAUDE.md rule 6 but not built |
| Real-time skeleton tracking during playback | **Partial** | Single-frame capture works; continuous skeleton during video playback is not smooth |

### Technical Debt Remaining

1. **8,693-line monolith** (LegacyApp.js) — every keystroke re-renders entire component tree. No React.memo, no code splitting.
2. **12 dead code files** — entire `src/analysis/`, `src/components/` extraction layer, `src/utils/` — none imported by running code.
3. **Two competing tier systems** — LegacyApp reads localStorage directly; TierContext wraps app but is never consumed.
4. **Gemini API key served with CORS `*`** — any website can steal the key from `/api/gemini-key`.
5. **YouTube/Google search links in drills** — violates owner rule "NO external YouTube/Google search links."
6. **Unused Recharts imports** — AreaChart, BarChart, RadarChart, Radar, PolarGrid, PolarAngleAxis, Cell imported but never used.
7. **Font stylesheet loaded twice** — once in global.css, once in LegacyApp.js.
8. **localStorage quota risk** — full analysis results stored unbounded; will hit 5MB limit at ~50 analyses.
9. **`window.storage` fallback** — designed for Claude artifacts, may collide with browser extensions.
10. **No input sanitization** on profile fields (React JSX escaping prevents XSS but data flows to share/clipboard).

### Performance Benchmark

| Metric | Value |
|---|---|
| **Main JS bundle (gzipped)** | 267.22 kB |
| **Recharts chunk (gzipped)** | 39.86 kB |
| **CSS (gzipped)** | 1.62 kB |
| **Total transfer (gzipped)** | 308.70 kB |
| **Estimated first load (3G)** | ~4-5 seconds |
| **Estimated first load (LTE/WiFi)** | ~1-2 seconds |
| **Analysis pipeline time** | 30-90 seconds (Gemini video upload + polling + 2-pass analysis) |
| **Frame extraction time** | 5-15 seconds (24 frames, 85% JPEG) |
| **Video compression time** | Variable (3x playback speed, only >100MB) |
| **MediaPipe model download** | ~5-10MB on first skeleton toggle |
| **Bundle growth from 5 agents** | +10.66 kB gzipped (from ~256.56 kB baseline) |

### Commit History from 5 Agents

| Commit | Agent | Summary |
|---|---|---|
| `3f8a8ec` | Alpha | Scoring engine verified — cache key collision fix + expanded deduction validation + split angle checks |
| `fc75358` | Beta | Video in skill cards + real MediaPipe skeleton overlay + fault timeline strip |
| `a1bfb0d` | Gamma | Full design system migration (400+ color replacements) + 8-section Overview tab + 5-tab skill cards + filter pills |
| `5a05c30` | Delta | Athlete persistence + fault intelligence + weekly drill plans + improvement curves + goal tracking |
| `386e5fa` | Epsilon | 18 error boundaries + shimmer loading + offline resilience + blank screen fallbacks |

---

## SECTION B — MARKET POSITION

### What is Strive's single strongest differentiator right now?

**Automated USAG deduction detection from video.** No competitor — not Dartfish ($29/mo), not Hudl Technique, not OnForm, not any gymnastics calculator app — watches a routine and outputs specific, timestamped deductions with USAG Code references. Every other tool requires a trained human to identify faults manually. Strive is the only product where a parent with zero gymnastics knowledge uploads a video and understands exactly why their daughter got an 8.85. This is not incremental improvement over competitors; it is a category-creating capability.

### What would a user say to a friend about Strive in one sentence?

"You upload your daughter's routine video and it tells you every deduction the judge took, shows you exactly where in the video it happened, and the score is actually close to what she really got."

### What is the #1 reason a parent would cancel their subscription?

**Inaccurate scores that break trust.** If the AI returns 9.2 and the real score was 8.6, or if it misses obvious faults (finding 2 deductions on a rough routine that should have 10+), the parent concludes the tool is guessing. One wildly inaccurate analysis undoes five good ones. The under-detection bug (finding 1-3 faults instead of 8-12) is the single biggest churn risk in the product. Scoring consistency (same video within +/-0.10) is the foundation. Without it, nothing else matters.

### What is the #1 reason they would tell another parent to sign up?

**"I can finally see what the judges see."** The revelation moment — uploading a routine they have watched fifteen times, getting timestamped deductions, tapping to that exact moment, and seeing the leg separation or bent knees for the first time — transforms a confused spectator into an informed insider. Parents share this experience in person at meets and practices. The viral loop is peer-to-peer, in the bleachers, phone-in-hand.

---

## SECTION C — THE 10 THINGS THAT WOULD MAKE STRIVE 5X BETTER

Scoring: (User Impact 1-10) x (Build Effort 1-10, where 10 = easiest to build). Higher composite = build first.

| Rank | Feature | Impact | Effort (10=easy) | Score | Rationale |
|---|---|---|---|---|---|
| **1** | **Export to PDF / share report** | 9 | 9 | **81** | Parents already want to email results to coaches and grandparents. The share button exists but only copies text. A styled PDF with score ring, deduction list, and timestamped screenshots is high-value, low-effort (html2canvas + jsPDF, ~8 hours). Coaches receiving PDF reports become advocates. |
| **2** | **Video comparison side-by-side** | 9 | 7 | **63** | "September vs. March" is the most requested feature in video analysis apps (Dartfish and Hudl both have it). Parents already compare mentally — making it visual and concrete turns invisible progress into a shareable screenshot. Two synced video elements with matched timestamps, ~20 hours. |
| **3** | **Historical video library** | 8 | 7 | **56** | Every routine searchable by date, event, score. Currently analyses are in localStorage (5MB limit). Requires IndexedDB or cloud storage. Without this, data loss on phone change kills retention. Cloud version needs Supabase/Firebase (~30 hours for IndexedDB local, ~50 for cloud). |
| **4** | **Custom coach notes on AI analysis** | 8 | 8 | **64** | A text field per deduction where a coach (or parent relaying coach feedback) adds context: "Coach says focus on this at Tuesday practice." Bridges AI analysis with human coaching. Trivial to build (textarea + localStorage, ~4 hours). Deepens coach relationship per Vision Report. |
| **5** | **Peer benchmarking (anonymous)** | 8 | 4 | **32** | "Your Level 7 beam score is in the 72nd percentile." Requires server-side aggregation of anonymized scores across users. Massive network effect and switching cost, but needs a backend, privacy policy, and critical mass of users. ~80 hours + ongoing infrastructure. Build after 1,000+ users. |
| **6** | **Multi-gymnast team/family management** | 7 | 6 | **42** | Per-athlete records exist (Delta built this) but no UI to switch between athletes. Families with 2-3 gymnasts need this. Profile switcher + per-athlete data isolation, ~15 hours. Enables Family tier pricing ($19.99/mo). |
| **7** | **Parent education library** | 7 | 8 | **56** | "What is a Tsukahara?" Glossary of skills, deductions, scoring concepts linked from analysis results. Static content, ~12 hours. Reduces parent confusion, builds trust. Replaces the YouTube links that violate owner rules. |
| **8** | **Pre-meet focus card** | 7 | 9 | **63** | One-screen printable card: "Ava's Top 3 Things to Remember on Beam Today." Generated from most frequent recent deductions. Parents will photograph and post it. Coaches will notice. ~6 hours. High word-of-mouth potential per Vision Report. |
| **9** | **Live meet scoring (coach mode)** | 6 | 5 | **30** | Coach taps deductions in real-time while watching a routine. Useful for training, but competes with the AI analysis value prop. Requires a fast deduction-picker UI. ~25 hours. Better as a coach-tier feature. |
| **10** | **Share to Instagram (highlight reel)** | 6 | 5 | **30** | Auto-generate a 15-second clip of the cleanest skills with score overlay. Requires video editing in-browser (ffmpeg.wasm or canvas recording). ~40 hours. High viral potential but technically complex. |

**Not ranked in top 10** (lower composite scores):
- Audio coaching notes (Impact 5, Effort 6 = 30): Niche, requires audio recording/playback infrastructure.
- Pre-meet routine builder (Impact 5, Effort 4 = 20): Cool but speculative — unclear if parents would use it.
- Strength & conditioning plans (Impact 5, Effort 5 = 25): Outside core competency, liability concerns.
- Nutrition timing guide (Impact 3, Effort 7 = 21): Too far from core value prop, generic content.
- Wearable integration (Impact 4, Effort 2 = 8): Apple Watch adds little to video analysis workflow; premature.

---

## SECTION D — THE 3 THINGS TO BUILD NEXT

### 1. Export to PDF Report

**What it is**: A styled, shareable PDF that includes the score ring, deduction breakdown with severity colors, timestamped video frame captures, and the "Path to 9.0+" section — generated with one tap from any analysis result.

**Why users will love it**: Parents desperately want to communicate what they learned to coaches, grandparents, and the gymnast herself. Currently the share button copies plain text. A PDF with the broadcast-quality design system makes the parent feel like they are handing their coach a professional scouting report. The emotion is *competence and generosity* — "I brought this for you, Coach." Coaches who receive these PDFs will recommend the app to other parents.

**How long to build**: 8-12 hours.

**Build steps**:
1. Add html2canvas + jsPDF dependencies (or use browser print-to-PDF with a print-optimized CSS stylesheet).
2. Create a `ReportView` component that renders the key sections (score ring, deduction table, top 3 fix priorities, frame captures) in a print-friendly layout — white background, high contrast, 8.5x11 format.
3. Add "Export PDF" button to ResultsScreen header — generates the PDF client-side and triggers download or opens native share sheet.
4. Include athlete name, event, date, and STRIVE branding (watermark on free tier, clean on Pro).
5. Test on iOS Safari (share sheet) and Android Chrome (download).

---

### 2. Pre-Meet Focus Card

**What it is**: A single-screen, screenshot-ready card that says "Ava's Top 3 Things to Remember on Beam Today" — generated from the most frequent deductions across recent analyses of that event.

**Why users will love it**: This is the feature that turns digital analysis into a tangible pre-meet ritual. The parent shows it to the gymnast in the car on the way to the meet. The gymnast reads three simple sentences. The coach sees the card in the gymnast's bag and asks about it. The emotion is *preparedness* — the parent feels like they contributed something real to their daughter's performance. Per the Vision Report, this is one of the top 5 word-of-mouth generators.

**How long to build**: 6-8 hours.

**Build steps**:
1. Use `computeFaultIntelligence()` (already built by Delta) to get the top 3 faults for the selected event from recent analyses.
2. Create a `FocusCard` component: athlete name, event, date, 3 focus items with simple action language ("Keep legs together through back handspring"), STRIVE branding, gold accents on dark background.
3. Add "Focus Card" button to Dashboard (visible when a meet date is set in goals) and to the Results screen.
4. Implement share via Web Share API (native share sheet) or screenshot-ready rendering.
5. Add a "before meet" push notification reminder (if/when PWA notifications are added): "Ava's meet is tomorrow — here's her focus card."

---

### 3. Video Comparison Side-by-Side

**What it is**: Select two analyses of the same event and view them on a split screen with synchronized playback, showing which deductions were fixed and which remain.

**Why users will love it**: "Look how much better her layouts are now" — this is the progress visualization parents crave. They already compare in their heads. Making it visual and concrete transforms abstract improvement into something they can *see* and screenshot for the family group chat. The emotion is *pride* — tangible proof that the money, time, and tears are paying off. This is also the feature that Dartfish and Hudl have but charge $29+/mo for.

**How long to build**: 18-25 hours.

**Build steps**:
1. Add a "Compare" button to the Meets/History screen. User selects two analyses of the same event.
2. Create a `ComparisonView` component with two stacked (mobile) or side-by-side (tablet) video players. Each loads from the stored video File (requires keeping video files in IndexedDB, since localStorage cannot hold video blobs).
3. Synchronize playback: play/pause/seek one video and the other follows. Playback speed control shared.
4. Below videos, show a deduction diff: deductions present in both (persistent faults), deductions only in the earlier (fixed), deductions only in the later (new). Color-code: green = fixed, red = new, gray = persistent.
5. Add score delta display: "September 8.75 -> March 9.10 (+0.35)".

---

## SECTION E — MONETIZATION INTELLIGENCE

### Optimal Free Tier Limits

**Give away**:
- 3 analyses per month (this is the habit threshold — per Vision Report, 3/month is the magic number for retention)
- Full deduction breakdown with timestamps and severity colors
- Score benchmark (percentile display)
- Deduction reference guide
- Basic share (text-only)

**Gate behind Pro**:
- Unlimited analyses (the core upgrade trigger)
- Score progression charts and improvement curves
- Fault intelligence (cross-analysis patterns, fixed/regression badges)
- Personalized weekly drill plan
- Pre-meet focus card
- What-If simulator
- Biomechanics dashboard
- PDF export (with watermark on free, clean on Pro)
- Video comparison side-by-side
- Season goal tracking
- Mental training content

**Rationale**: The free tier must deliver the full "revelation moment" — the parent must experience the timestamped deduction breakdown and feel the power of the tool. If the free experience is watered down, they will never convert. The gate is on *depth and repetition*: once they are hooked, they need more analyses and more intelligence than 3/month provides.

### Optimal Paid Tier Price Point

| Tier | Price | What It Includes |
|---|---|---|
| **Free** | $0 | 3 analyses/mo, full results, basic share |
| **Pro** | $12.99/mo or $99.99/yr ($8.33/mo) | Unlimited analyses, all intelligence features, PDF export, video comparison, drill plans, goal tracking |
| **Family** | $19.99/mo or $149.99/yr ($12.50/mo) | Everything in Pro for up to 3 athlete profiles (siblings) |

**Why $12.99/mo**: The market has a gap between $5-8/mo (Hudl Technique+, Dartfish Express — manual video tools with no AI) and $30+/mo (Dartfish Pro S, OnForm Coach — professional platforms). $12.99 positions Strive as premium-but-accessible. Gym families already spend $3,000-15,000/year on the sport; $12.99/mo ($156/yr) is less than one month of tuition. The annual plan at $99.99 ($8.33/mo) provides a 36% discount that drives commitment and reduces churn.

### One Additional Revenue Stream

**Gym Team License**: $499/yr per gym. Includes:
- Coach dashboard with anonymized aggregate deduction data ("Your Xcel Gold team's most common deductions this month: leg separation 34%, landing steps 28%")
- All gym families get Pro-tier access as part of their gym membership
- Coach can push focus cards to all athletes before meets
- Gym branding on exported PDFs

**Why this works**: The coach becomes the distribution channel. One gym partnership yields 20-50 paying families overnight. The aggregate data dashboard (per Vision Report section on coach relationships) makes the coach better at their job for free — they become an advocate. At 500 gyms (10% of ~5,000 competitive US gyms), this is $250K/yr in recurring revenue with extremely low churn (gyms cancel slowly).

### The Single Most Effective Upgrade Trigger

**"You've used all 3 free analyses this month. Your daughter's next meet is Saturday."**

The trigger is temporal urgency combined with emotional investment. The parent has already experienced the revelation moment 3 times. They know what the tool does. Their daughter has a meet in 3 days. They recorded a practice routine tonight. They open the app and see the paywall. The decision is: $12.99 to know what the judges will see on Saturday, or go in blind like they used to.

Implementation: Show the upgrade prompt when the user taps "Analyze" after exhausting free analyses. Display their daughter's name, the meet date (from goal tracking), and the message: "[Gymnast Name]'s meet is [X days] away. Unlock unlimited analyses to prepare." Include a 7-day free trial for first-time upgraders.

### Estimated MRR by User Base

Assumptions: 25% of users on Pro ($12.99/mo), 5% on Family ($19.99/mo), 70% free. Blended ARPU = $4.25/user/month.

| Total Users | Paying Users | Pro | Family | Estimated MRR | Estimated ARR |
|---|---|---|---|---|---|
| **500** | 150 | 125 x $12.99 | 25 x $19.99 | **$2,124** | **$25,488** |
| **2,000** | 600 | 500 x $12.99 | 100 x $19.99 | **$8,494** | **$101,928** |
| **5,000** | 1,500 | 1,250 x $12.99 | 250 x $19.99 | **$21,236** | **$254,832** |
| **5,000 + 100 gyms** | 1,500 + gyms | (as above) | (as above) | **$21,236 + $4,158** = **$25,394** | **$304,728** |

Note: These are conservative. If the Family tier catches on with multi-gymnast households (common in competitive gymnastics), Family percentage could reach 10-15%, pushing ARPU to $5.50+. With gym partnerships providing bulk onboarding, the path to 5,000 users is realistic within 18-24 months of App Store launch.

### Pricing Strategy Rationale

1. **Free tier at 3/month is strategic, not generous.** It is exactly the number that creates the habit loop. Fewer would not demonstrate value. More would eliminate upgrade pressure.
2. **Annual pricing at 36% discount drives LTV.** Monthly churn in consumer apps runs 5-8%. Annual subscribers churn at 15-20%/year, roughly half the rate. The $99.99 price point is psychologically under $100 — "less than $100 for a year of scoring."
3. **Family tier captures 30% more revenue from the same household.** Gym families with 2-3 competing siblings are the highest-value customers. Without a Family tier, they create multiple accounts or share one (limiting data integrity). At $19.99/mo, it is a 54% premium over Pro — excellent unit economics for zero marginal cost.
4. **No free trial on monthly; 7-day trial on annual only.** Monthly subscribers can cancel immediately — a trial adds nothing. Annual subscribers need confidence before committing $99.99 — the 7-day trial removes risk.
5. **Gym licensing is the B2B wedge.** It is cheaper per-family than individual Pro ($499/yr across 30 families = $1.39/mo/family vs. $12.99) but delivers bulk acquisition, coach advocacy, and near-zero churn. It is the growth accelerant after product-market fit is proven with individual users.

---

*This report is the synthesis of 5 implementation agents (Alpha through Epsilon), three research reports (Recon, Market, Vision), and the current production build. All recommendations are specific to Strive's current state as of March 19, 2026. Revisit quarterly as the user base grows and market conditions shift.*
