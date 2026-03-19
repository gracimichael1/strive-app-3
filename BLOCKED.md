# BLOCKED.md — Items Requiring Owner Input

## Needs Decision
1. **Vercel GEMINI_API_KEY env var** — The API key proxy at `api/gemini-key.js` has `Access-Control-Allow-Origin: *`. Add CORS restriction to your Vercel domain only, and set GEMINI_API_KEY in Vercel project settings.
2. **Payment integration** — All "Upgrade to Pro" buttons currently just set localStorage. Need Stripe/RevenueCat integration when ready to monetize.
3. **Two competing tier systems** — TierContext.js and direct localStorage reads both exist. Pick one and remove the other.
4. **Dead code cleanup** — 12 files in `src/components/`, `src/analysis/`, `src/overlay/` are never imported by the running app. Safe to delete but wanted owner confirmation.
5. **Real video-side-by-side comparison** — Phase 7C built score comparison (since full videos can't be stored in localStorage). True video comparison would need cloud storage (S3/Firebase).
6. **Market report data verification** — Web search was blocked during research. Market data is from training knowledge (through early 2025). Verify competitor pricing and USAG membership numbers with live research.
