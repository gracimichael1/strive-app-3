# AUDIT REPORT — Strive.ai Forensic Assessment
> Agent Alpha | March 19, 2026

---

## 1. Feature Inventory

### Working
| Feature | Location | Status |
|---------|----------|--------|
| Onboarding (5-step) | LegacyApp.js ~L1200-1600 | Working |
| Video upload + compression | LegacyApp.js ~L4100-4210 | Working |
| Frame extraction (3 strategies) | LegacyApp.js | Working |
| Gemini video analysis pipeline | LegacyApp.js L4491-4999 | Working |
| Score caching (24hr) | LegacyApp.js L4520-4560 | Working |
| Results screen (8 tabs) | LegacyApp.js L6465-7000 | Working |
| Graded skill cards (A+-F) | LegacyApp.js L5728-6462, SkillCard.js | Working |
| VideoReviewPlayer (slow-mo, skeleton) | VideoReviewPlayer.js | Working |
| Dashboard + history | LegacyApp.js | Working |
| Drills screen | LegacyApp.js | Working |
| What-If simulator | LegacyApp.js | Working |
| Biomechanics dashboard | LegacyApp.js | Working |
| Mental training (6 sections) | LegacyApp.js | Working |
| Settings + profile edit | LegacyApp.js L8220+ | Working |
| Daily affirmations | DashboardScreen/, affirmations.js | Working |

### Partially Working
| Feature | Issue |
|---------|-------|
| Tier gating | Two competing systems: LegacyApp reads localStorage directly, TierContext.js never used |
| COPPA consent | Components built (AgeGate, ParentalConsent), but TEST_MODE=true bypasses everything |
| Stripe payments | Theatrical — upgrade button writes localStorage flag, no real payment |
| Free tier cap (3/month) | Two separate counters: `strive-analysis-count` vs `strive-analyses-month` |

### Not Working / Not Wired
| Feature | Status |
|---------|--------|
| Real payment enforcement | No Stripe integration wired |
| COPPA enforcement | Bypassed by TEST_MODE=true (L1534) |
| Training connected to analysis | TrainingScreen exists but not fed personalized drill recs |
| Demo data fallback for empty states | Partial — demo data exists in code but not consistently surfaced |

---

## 2. Bug Inventory

### P0 — Degree Symbol (FIXED this session)
- **LegacyApp.js L6244**: `\u00B0` in injury risk string → fixed to `°`
- **SkillCard.js L156**: `\u00B0` in correct form text → fixed to `°`
- **SkillCard.js L773, L784**: `&deg;` HTML entities → fixed to `°` with defensive number parsing
- **SkillCard.js L154**: `\u00E9` unicode escapes → fixed to actual characters
- Added defensive `parseInt()` stripping on biomechanics angle values in both LegacyApp.js and SkillCard.js rendering

### P0 — Security
- **api/gemini-key.js**: Returns GEMINI_API_KEY to any allowed origin. No auth, no rate limiting. Any website matching CORS whitelist can steal the key.
- **Fix**: Move all Gemini calls through `/api/analyze` server-side; remove public key endpoint.

### P0 — Tier System Conflict
- **LegacyApp.js L1504-1507**: Reads `localStorage.getItem("strive-tier")` directly
- **TierContext.js**: Defines `useTier()` hook — never called by LegacyApp
- **LegacyApp.js L1824**: `onTierChange` callback writes `localStorage.setItem("strive-tier", t)`
- **TierContext.js**: Tracks analyses under `strive-analyses-month`
- **LegacyApp.js**: Tracks analyses under `strive-analysis-count`
- **Result**: Two independent tier+count systems coexist. TierProvider is loaded but unused.
- **6+ locations** in LegacyApp.js read tier from localStorage directly (L1553, L1840, L1878, L1912, L2570, L6512, L8226)

### P1 — Score Cache Collision
- **LegacyApp.js ~L4520**: Cache key = `btoa(videoFileName + "_" + level + "_" + event)`
- If user uploads different video with same filename (e.g., "IMG_1234.MOV"), retrieves cached result from previous video
- **Fix**: Include file size and lastModified in cache key (partially done — line 4523 includes size+lastModified but verify)

### P1 — MediaPipe Re-initialization
- VideoReviewPlayer calls `PoseLandmarker.createFromOptions()` on every skill card click
- Downloads + initializes WASM model each time (~5-10MB)
- **Fix**: Create once at app level, reuse across skill clicks

### P2 — Storage API Confusion
- `src/utils/storage.js` checks `window.storage?.get` first (non-standard Claude artifacts API)
- Falls back to `localStorage`
- CLAUDE.md says "use localStorage, NOT window.storage" — code does opposite
- **Fix**: Remove artifact support, use localStorage directly

---

## 3. Dead Code Map

| File | Imported By | Status |
|------|-------------|--------|
| `src/analysis/analysisPipeline.js` | VideoAnalyzer.js (dead) | Dead |
| `src/analysis/frameExtractor.js` | VideoAnalyzer.js (dead) | Dead |
| `src/analysis/poseDetector.js` | VideoAnalyzer.js (dead) | Dead |
| `src/analysis/skillSegmentation.js` | VideoAnalyzer.js (dead) | Dead |
| `src/analysis/biomechanics.js` | VideoAnalyzer.js (dead) | Dead |
| `src/components/video/VideoAnalyzer.js` | Nothing | Dead |
| `src/components/analysis/SkillCard.js` | Nothing | Dead (duplicate of ui/SkillCard.js) |
| `src/components/timeline/SkillTimeline.js` | VideoAnalyzer.js (dead) | Dead |
| `src/components/onboarding/SplashScreen.js` | Nothing | Dead (LegacyApp has inline version) |
| `src/utils/validation.js` | Nothing | Dead (LegacyApp has inline copy) |

**Total dead code**: ~12 files, entire `src/analysis/` directory

---

## 4. Performance Bottlenecks (Top 5)

1. **LegacyApp.js monolith (11,416 lines)**: Every state change triggers reconciliation of the entire component tree
2. **MediaPipe re-initialization**: WASM model downloaded per skill card click (~5-10MB each time)
3. **Recharts bundle**: Loaded synchronously, adds to initial bundle size. Already lazy-loaded via `React.lazy()` but could be deferred further
4. **Score cache in localStorage**: Serializing/deserializing large JSON analysis results on every render cycle
5. **Frame extraction**: Extracts 24 frames at 85% JPEG quality regardless of video length or analysis needs

---

## 5. Gemini Pipeline Trace

```
1. User uploads video → compressVideo() if >100MB (VP9/VP8, 3x speed)
2. extractFrames() → 24 frames at 85% JPEG via seek-based/play-based/single-frame fallback
3. uploadVideoToGemini() → Resumable upload to Gemini File API
   → Polls file state until ACTIVE (up to 40 polls, 2s intervals)
4. buildJudgingPrompt() → Constructs Brevet-style prompt with:
   - Athlete profile (name, gender, level, event)
   - Level-specific split angle minimums
   - Two-sided calibration bounds (0.80-1.50)
   - USAG deduction scale reference
5. geminiGenerate() → Calls gemini-2.5-flash
   - temperature: 0.1, topP: 1, topK: 1, maxOutputTokens: 16384, seed: 42
   - Filters out "thought" parts from response
6. Response parsing (L4602-4702):
   - Primary: JSON.parse via regex match(/\{[\s\S]*\}/)
   - Fallback: Pipe-delimited line-by-line parsing
7. Data mapping → skills array with deduction, grade, faults, bodyMechanics
8. Rendered in tier-appropriate screen (Free/Competitive/Elite)
9. Cached in localStorage for 24 hours
```

**Data loss points**:
- Pipe-delimited fallback parser can misparse multi-line fault descriptions
- `bodyMechanics` passed through as-is from Gemini — no validation
- Angle values from Gemini not validated as numeric before rendering (FIXED this session)

---

## 6. Stripe Payment Status

**Current state**: Theatrical.
- `api/create-checkout.js` exists but is a stub
- `api/webhook.js` exists but is a stub
- "Upgrade" button in LegacyApp.js opens `UpgradeModal` component
- `UpgradeModal` writes `localStorage.setItem("strive-tier", "competitive")` on button click
- **Anyone can become Competitive/Elite** by clicking upgrade or running `localStorage.setItem("strive-tier", "competitive")` in console
- No payment, no validation, no subscription management
- **Blocking**: Requires owner to set up Stripe account + wire payment flow

---

## 7. COPPA Assessment

**Components built:**
- `src/components/legal/AgeGate.js` — Asks DOB, determines if parental consent needed
- `src/components/legal/ParentalConsent.js` — Collects parent name, email, explicit consent checkbox
- `src/components/legal/PrivacyNotice.js` — Final acknowledgment
- `src/components/legal/LegalDisclaimer.js` — AI analysis disclaimer

**Current state:**
- `TEST_MODE = true` (LegacyApp.js L1534) bypasses entire consent flow
- AgeGate is rendered in onboarding flow (L2388-2406) but skipped when TEST_MODE is true
- ParentalConsent record stored in profile object when collected
- PrivacyNotice rendered after consent if minor

**Data collected that could belong to minors:**
- Gymnast name
- Date of birth (via AgeGate)
- Gender
- Competition level
- Video content (gymnast performing)
- Analysis results (stored in localStorage)

**What's missing:**
- Consent cannot be reviewed or withdrawn after initial collection
- No consent expiration/renewal mechanism
- No data deletion capability ("right to be forgotten")
- TEST_MODE must be set to false before launch

---

## 8. localStorage Usage Projection

**Current keys used:**
- `strive-profile` (~500 bytes)
- `strive-tier` (~20 bytes)
- `strive-analysis-count` (~10 bytes)
- `strive_cache_*` (~50-100KB per analysis × up to 20 cached = ~1-2MB)
- `strive-athlete-*` (~1KB per athlete)
- `debug-gemini-*` (~100KB per debug log)

**Projection**: With 10+ analyses cached, localStorage approaches 3-4MB of the 5MB limit. Debug Gemini logs are the biggest risk — they cache raw Gemini responses.

**Recommendation**: Clear `debug-gemini-*` keys automatically after 48 hours. Consider IndexedDB for analysis results (Phase 2).

---

## 9. Dual Tier System Conflict — Full Map

| Location | What It Does | System |
|----------|-------------|--------|
| LegacyApp.js L1504 | `useState(() => localStorage.getItem("strive-tier"))` | Legacy |
| LegacyApp.js L1824 | `localStorage.setItem("strive-tier", t)` on tier change | Legacy |
| LegacyApp.js L6512 | `isPro = localStorage.getItem("strive-tier") === "competitive"` | Legacy |
| LegacyApp.js L1553 | Auto-sets tier to "competitive" in TEST_MODE | Legacy |
| TierContext.js L45 | `storage.set("strive-tier", tier)` via async wrapper | Context |
| TierContext.js L62 | `strive-analyses-month` counter | Context |
| LegacyApp.js (various) | `strive-analysis-count` counter | Legacy |

**Fix required**: Route all tier checks through `useTier()` hook. Remove direct localStorage reads in LegacyApp.js.
