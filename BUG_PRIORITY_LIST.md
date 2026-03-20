# BUG PRIORITY LIST — Ranked by User-Facing Severity
> March 19, 2026

---

## P0 — Must Fix Before Any User Testing

| # | Bug | File | Line | Status |
|---|-----|------|------|--------|
| 1 | Degree symbol renders as `\u00B0` in biomechanics tiles | LegacyApp.js, SkillCard.js | L6244, L156, L773, L784 | **FIXED** |
| 2 | Gemini API key publicly exposed via `/api/gemini-key` | api/gemini-key.js | All | Open |
| 3 | Upgrade bypasses payment — localStorage flag only | LegacyApp.js, UpgradeModal.js | L1824 | Open (needs Stripe) |
| 4 | TEST_MODE=true bypasses all COPPA consent | LegacyApp.js | L1534 | Open (flip before launch) |
| 5 | Two competing tier tracking systems | LegacyApp.js vs TierContext.js | Multiple | Open |

## P1 — Should Fix Before Launch

| # | Bug | File | Line | Impact |
|---|-----|------|------|--------|
| 6 | Score cache collision on same filename | LegacyApp.js | ~L4520 | Wrong results for re-uploaded videos |
| 7 | MediaPipe WASM re-downloaded on every skill card click | VideoReviewPlayer.js | — | 5-10MB download per click, slow UX |
| 8 | Deduction values not validated as USAG amounts | LegacyApp.js | L4626-4630 | Shows non-standard values like -0.13 |
| 9 | `strive-analysis-count` vs `strive-analyses-month` dual counter | LegacyApp.js + TierContext.js | — | Free tier cap inconsistent |
| 10 | storage.js checks `window.storage` before localStorage | src/utils/storage.js | — | Could collide with browser extensions |

## P2 — Should Fix Before Public Launch

| # | Bug | File | Impact |
|---|-----|------|--------|
| 11 | localStorage approaching 5MB limit with 10+ cached analyses | Multiple | App could silently fail to save |
| 12 | `debug-gemini-*` keys never cleaned up | LegacyApp.js | Wastes storage quota |
| 13 | Pipe-delimited fallback parser can misparse multi-line faults | LegacyApp.js L784-839 | Missing or garbled deductions |
| 14 | YouTube/Google links still present in drill recommendations | LegacyApp.js, SkillCard.js | Violates owner directive |
| 15 | No consent withdrawal or data deletion capability | — | COPPA compliance gap |

## P3 — Nice to Fix

| # | Bug | File | Impact |
|---|-----|------|--------|
| 16 | Dead code (~12 files) inflates bundle | src/analysis/*, etc. | Slower initial load |
| 17 | Score cache doesn't invalidate on prompt version change | LegacyApp.js | Stale results after prompt updates |
| 18 | No ErrorBoundary around individual skill cards | LegacyApp.js | One bad skill card crashes entire results |
| 19 | bodyMechanics from Gemini passed through without validation | LegacyApp.js L4632 | Could render "undefined" or "[object Object]" |
| 20 | TrainingScreen not connected to per-analysis drill recs | TrainingScreen/index.js | Generic drills, not personalized |
