# STRIVE — Sprint Queue

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

2. **Verify `.env.test` is NOT in `.gitignore`**

3. **Verify CI build passes** — Run tests and build.

4. **Commit and push**

**Constraints:**
- Do NOT use real API keys. Placeholders only.
- Do NOT modify any application code.
- Build must pass. Tests must pass.

---

## Completed Sprints (archive)

### Sprint 1 (77dc5dd) — COMPLETED
Dual-layer biomechanics, mastermind personalization, judge narrative +1, skeleton fix, injury signal consistency, level up fix, data export

### Sprint 2A (1e27cd0) — COMPLETED
Bars hardening, rules 8-11, skill confidence schema+UI, primary athlete verification

### Sprint 2B — COMPLETED
Parser regression, scores-400, cast-constraint, acro-category, biomechanics-verified, skeleton-hard-stop, injury-signal, level-up, mastermind-verified
