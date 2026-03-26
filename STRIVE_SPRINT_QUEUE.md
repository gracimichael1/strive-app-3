# STRIVE — Sprint Queue

---

## SPRINT 2A — SCORING ACCURACY (run next)
**STATUS: QUEUED**

### Full Prompt

You are working on the Strive gymnastics scoring app at `/Users/mgraci/Desktop/StriveGymnastics`. Read `CLAUDE.md` and `STRATEGY.md` before making any changes.

**Objective:** Harden scoring accuracy for Bars (worst delta: 0.4604) and all events. Implement Rules 8-11 enforcement and schema additions for skill confidence.

**Tasks:**

1. **Bars Hardening** — Bars has the highest delta (0.4604). Audit `buildJudgingPrompt()` for bars-specific weaknesses. Strengthen bars deduction rules in `src/data/constants.js` — add missing deductions for cast handstand, giant swings, pirouettes, release moves, dismount. Ensure the prompt enforces USAG Code of Points deduction values for bars (connection bonus, composition requirements, execution faults).

2. **Rules 8-11 Enforcement:**
   - Rule 8: Combination tumbling passes (RO+BHS+skill) must be scored as ONE skill card, never split into individual elements
   - Rule 9: Connection bonus must be calculated and applied for eligible combinations (bars: release-to-release, beam: acro series, floor: tumbling passes)
   - Rule 10: Composition/difficulty requirements by level must be checked — flag missing requirements (e.g., Level 7 bars must have a clear hip, Level 8 floor must have 3 tumbling passes)
   - Rule 11: Start value construction — ensure start value is calculated from difficulty + composition + connection before applying deductions

3. **Schema Additions** — Add to the Gemini prompt JSON schema:
   - `skillConfidence`: 0.0-1.0 float per skill (how confident the AI is in its identification)
   - `deductionConfidence`: 0.0-1.0 float per deduction (how confident the AI is this deduction applies)
   - `compositionCheck`: object with `{required: [], present: [], missing: []}` per event/level
   - `connectionBonus`: array of `{skills: [], bonusValue: number}` objects

4. **Skill Confidence UI** — In `src/components/ui/SkillCard.js`, display a small confidence indicator when `skillConfidence < 0.7`. Show "AI is less certain about this skill identification" in a subtle tooltip or footnote. Do not show anything when confidence is high (>= 0.7).

5. **Primary Athlete Verification** — Before analysis, verify the athlete profile has: name, gender, exact USAG level (not Xcel), and event. If any field is missing, show a blocking prompt before analysis starts. Do not allow analysis with incomplete athlete data.

6. **Test** — Run `npm test -- --watchAll=false`. All tests must pass. Run `npm run build` to verify clean build.

7. **Commit and push:**
   ```
   git add -A && git commit -m "feat(scoring): bars hardening, rules 8-11, schema additions, skill confidence UI, athlete verification" && git push origin main
   ```

**Constraints:**
- Do NOT change existing calibration factors (Vault 0.75 / Beam 0.91 / Floor 0.92 / Bars 0.85) without new ground truth data
- Do NOT touch the scoring prompt temperature/seed settings
- Build must pass. Tests must pass. Push immediately.

---

## SPRINT 2B — UX + BIOMECHANICS (run after 2A confirms clean)
**STATUS: QUEUED**

### Full Prompt

You are working on the Strive gymnastics scoring app at `/Users/mgraci/Desktop/StriveGymnastics`. Read `CLAUDE.md` and `STRATEGY.md` before making any changes.

**Objective:** Wire dual-layer biomechanics into the results UI, activate mastermind personalization, enhance judge narrative depth, and complete remaining Sprint 1 polish items.

**Tasks:**

1. **Dual-Layer Biomechanics Wiring** — The biomechanics analysis system produces two layers of data: (a) MediaPipe pose angles from client-side frame analysis, and (b) Gemini narrative biomechanics from the judging prompt. Wire both layers into the results display:
   - Layer 1 (angles): Show joint angle measurements (hip, knee, shoulder, elbow) in the biomechanics section of SkillCard
   - Layer 2 (narrative): Show Gemini's body mechanics narrative alongside the angle data
   - Ensure both layers render for Competitive and Elite tiers. Free tier shows blurred preview only.

2. **Mastermind Personalization** — The mastermind system should personalize content based on the athlete's history:
   - Track which skills have been analyzed across sessions (store in localStorage)
   - On repeat skills, show trend data: "Your back handspring has improved — hip angle was 145 last time, now 158"
   - Personalize drill recommendations based on recurring faults (if the same deduction appears 3+ times, escalate its priority)
   - Show personalized "focus areas" on the Dashboard based on aggregated fault data

3. **Judge Narrative Enhancement** — Enhance the judge narrative section in results:
   - Each skill card should have a 2-3 sentence judge-style narrative explaining what the judge saw, what was deducted, and why
   - Use USAG-standard terminology (not casual language)
   - Include the specific Code of Points reference for each major deduction
   - Tone: professional, constructive, like a Brevet-certified judge giving feedback after a routine

4. **Biomechanics UI (Elite Tier)** — For Elite tier users, add an enhanced biomechanics view:
   - Body mechanics overview showing full-body angle diagram
   - Session diagnostics comparing this routine to the athlete's average
   - Fault trend chart (Recharts) showing deduction patterns over last 5 analyses
   - Coach report export (PDF-ready format stored in state)

5. **Skeleton Pause/Resume** — In VideoReviewPlayer, ensure the MediaPipe skeleton overlay can be paused and resumed during playback. The skeleton should freeze on the current frame when paused, and resume tracking when playback continues.

6. **Injury Signal Consistency** — Ensure injury awareness signals are consistent:
   - Every skill card with a physical-risk fault must show the injury awareness section
   - Color-code by severity: yellow for caution, orange for moderate risk, red for high risk
   - Include the specific body area at risk and the mechanism of injury
   - Never show injury signal on a skill with no physical-risk faults

7. **Level Up Enhancement** — The "Road to Next Level" section:
   - Fix Xcel tier mapping (currently breaks for Xcel Bronze/Silver/Gold/Platinum/Diamond)
   - Show specific skills needed for the next level
   - Show which current skills already meet next-level requirements
   - Add progress bar showing % of next-level requirements met

8. **Judge Scores Integration** — When the Fiverr video-score pairs arrive, the system needs to accept real judge scores for comparison. Add a field in the results view where a known judge score can be entered, and display the delta between AI score and judge score.

9. **Data Export** — Ensure the data export function works:
   - Export analysis results as JSON
   - Export summary as CSV (date, event, level, AI score, judge score if available, delta)
   - Export available from Dashboard and individual results

10. **Test** — Run `npm test -- --watchAll=false`. All tests must pass. Run `npm run build` to verify clean build.

11. **Commit and push:**
    ```
    git add -A && git commit -m "feat(ux): dual-layer biomechanics, mastermind personalization, judge narrative, elite biomechanics UI, skeleton pause/resume, injury signal, level up, judge scores, data export" && git push origin main
    ```

**Constraints:**
- Do NOT change calibration factors without new ground truth data
- Do NOT remove or weaken any existing features
- Recharts imports MUST be named imports (not default)
- Build must pass. Tests must pass. Push immediately.

---

## SPRINT 2C — CI LINT FIX (run anytime, standalone)
**STATUS: QUEUED**

### Full Prompt

You are working on the Strive gymnastics scoring app at `/Users/mgraci/Desktop/StriveGymnastics`. Read `CLAUDE.md` before making any changes.

**Objective:** Fix CI build failures caused by missing environment variable placeholders in the test environment.

**Tasks:**

1. **Create `.env.test`** — Create a `.env.test` file in the project root with placeholder values for all required environment variables:
   ```
   REACT_APP_GEMINI_API_KEY=test-placeholder-key
   REACT_APP_STRIPE_PUBLISHABLE_KEY=pk_test_placeholder
   REACT_APP_SUPABASE_URL=https://placeholder.supabase.co
   REACT_APP_SUPABASE_ANON_KEY=test-placeholder-anon-key
   STRIVE_APP_TOKEN=test-token-placeholder
   ```
   These are NOT real keys — they are placeholders so that code paths referencing `process.env.REACT_APP_*` do not crash with `undefined` during CI test runs.

2. **Verify `.env.test` is NOT in `.gitignore`** — This file contains only placeholders and MUST be committed. Check `.gitignore` and remove any pattern that would exclude `.env.test`. Do NOT add `.env.test` to `.gitignore`.

3. **Verify CI build passes** — Run:
   ```bash
   npm test -- --watchAll=false
   npm run build
   ```
   Both must complete with zero errors.

4. **Commit and push:**
   ```
   git add .env.test && git add -A && git commit -m "fix(ci): add .env.test placeholder vars for CI build" && git push origin main
   ```

**Constraints:**
- Do NOT use real API keys. Placeholders only.
- Do NOT modify any application code. This sprint only adds the `.env.test` file.
- Build must pass. Tests must pass. Push immediately.
