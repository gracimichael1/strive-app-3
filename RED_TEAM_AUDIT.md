# Strive Red Team Investment Audit

**Date:** March 19, 2026
**Perspective:** Skeptical Series A investor

## Overall Verdict

"Not today. But closer than most pitches."

## 10 Findings with Severity and Proposed Solutions

### 1. Market Assumptions (Major)

- $75-150M SAM has no primary research backing
- No customer interviews, no willingness-to-pay study
- **Solution:** 30-50 structured parent interviews + $500 Facebook smoke test

### 2. Revenue Projections (Deal-breaker)

- 40% free-to-paid conversion is 4-8x above industry benchmarks (2-5% typical)
- 22% MoM growth sustained 24 months is unrealistic for solo founder
- MRR projections require ~$20 blended ARPU but featured tier is $9.99
- **Solution:** Remodel at 10% conversion base case, 40% as bull case

### 3. Competitive Moat (Major)

- Core tech is Gemini API + prompt (replicable in 2-4 weeks)
- Prompts are client-side (visible in source code)
- MeetCritique could add AI layer; Hudl could enter market
- **Solution:** Move prompts server-side, file provisional patents, accelerate data collection

### 4. Technical Risk (Major)

- 11K-line monolith, no database, no auth, no payment, no tests
- Getting to "can charge money" = 8-12 weeks for solo developer
- Gemini single point of failure
- **Solution:** Prioritize auth + DB + Stripe. Ship paid beta to 50 users in 6 weeks.

### 5. Scoring Accuracy (Deal-breaker until validated)

- Zero validation against real judge scores
- Consistency does not equal accuracy
- One viral negative post in gym parent community could kill the product
- **Solution:** Collect 100 routines with real scores, measure mean absolute error. Must be under 0.30.

### 6. Legal Landmines (Deal-breaker until resolved)

- COPPA deadline April 22, 2026 — not compliant
- BIPA exposure from pose detection on minors
- No entity formed, no legal review of drafted docs
- **Solution:** Stripe Atlas for entity (48hrs), age-gate blocking under-13 for launch, hire children's privacy attorney ($3-5K)

### 7. Unit Economics (Minor)

- Stripe fees not modeled in break-even (shifts from 100 to 110-120 users)
- Video storage costs at scale not included
- Free user subsidy at 10% conversion = $437/month per 100 free users
- **Solution:** Model "Google doubles pricing" scenario, include Stripe fees, consider process-and-discard for video

### 8. Go-to-Market (Major)

- All channels require product to already be compelling
- Coach resistance contradicts coach-referral growth strategy
- "50-100 signups per meet" has no basis
- **Solution:** Run micro-pilot with 20 families at one gym for 4 weeks. Measure everything.

### 9. Solo Founder Risk (Major)

- One person doing dev, legal, marketing, sales, support, fundraising
- Burnout timeline: 3-6 months
- No documentation, no tests, monolith only one person understands
- **Solution:** Find technical co-founder or part-time contractor. Write operations playbook.

### 10. Expansion Skepticism (Acceptable)

- Each sport has fundamentally different scoring systems
- Expansion timeline assumes gymnastics is dominant by Year 2
- **Solution:** Don't mention multi-sport until gymnastics has $50K+ MRR. Position as optionality, not plan.

## What Would Change the Investor's Mind (8-12 weeks)

1. 100 routines scored vs real judges, MAE under 0.30
2. 50 beta users with NPS > 40 and 3+ return sessions
3. Entity formed, COPPA compliant, Stripe billing live
4. Financial model with 10% conversion base case
5. Technical co-founder or committed contractor

## Note

This report is for the founder's review. Findings and solutions are presented for discussion — no changes have been integrated into the strategy or codebase.
