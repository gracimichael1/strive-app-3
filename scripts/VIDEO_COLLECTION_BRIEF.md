# Fiverr Hiring Brief: Gymnastics Video Database Collection

## Project Title
**Gymnastics Competition Video Collection & Cataloging — Scored Routines by Level**

## Overview
We are building an AI-powered gymnastics scoring platform and need a database of real competition videos paired with their actual judge-awarded scores. This database will be used internally for algorithm calibration and testing — not published or redistributed.

## Scope of Work

### What We Need
A minimum of **10 videos per event per level** (see matrix below), each with:
- The video file (downloaded or screen recorded, minimum 720p)
- The **actual competition score** awarded by judges
- Metadata logged in the provided spreadsheet

### Video Requirements
- Must show the **full routine** from start to finish
- Prefer **side view** (critical for vault and bars accuracy)
- Audio not required
- Minimum 720p resolution
- Any format (MP4, MOV, AVI — we'll convert)

### Metadata Spreadsheet (one row per video)
| Field | Example |
|-------|---------|
| Filename | L7_floor_001.mp4 |
| Event | Floor Exercise |
| Level | Level 7 |
| Gender | Female |
| Actual Score | 9.125 |
| Score Source | MeetScoresOnline / video overlay / meet program |
| Meet Name | 2025 Florida State Championships |
| Athlete Name (if visible) | Optional — for cross-referencing |
| Source URL | YouTube link or NAWGJ page |
| Camera Angle | Side / Diagonal / Behind |
| Video Quality | Good / Fair / Poor (parent phone from stands) |
| Notes | Score visible on scoreboard at 1:23 |

---

## Collection Matrix

### Women's Gymnastics (Priority)

| Level | Vault | Uneven Bars | Balance Beam | Floor Exercise | Total |
|-------|-------|-------------|--------------|----------------|-------|
| Level 4 | 10 | 10 | 10 | 10 | 40 |
| Level 5 | 10 | 10 | 10 | 10 | 40 |
| Level 6 | 10 | 10 | 10 | 10 | 40 |
| Level 7 | 10 | 10 | 10 | 10 | 40 |
| Level 8 | 10 | 10 | 10 | 10 | 40 |
| Level 9 | 10 | 10 | 10 | 10 | 40 |
| Level 10 | 10 | 10 | 10 | 10 | 40 |
| Xcel Gold | 10 | 10 | 10 | 10 | 40 |
| Xcel Platinum | 10 | 10 | 10 | 10 | 40 |
| Xcel Diamond | 10 | 10 | 10 | 10 | 40 |

**Total: 400 videos minimum (women's)**

### Score Range Targets
Within each level/event batch of 10, try to capture a range:
- 2-3 high scores (9.0+)
- 4-5 mid-range scores (8.5-9.0)
- 2-3 lower scores (below 8.5, including falls if possible)

This range is critical — we need to test accuracy across the full spectrum, not just good routines.

---

## Where to Find Videos + Scores

### Tier 1: Best Sources (scores included with video)
1. **NAWGJ Rapid Review Archive** — nawgj.org
   - Judge training videos with official deduction scripts and final scores
   - Levels 6-10 and Xcel Bronze-Sapphire
   - **This is the #1 priority source**

2. **YouTube channels with scores in title/description:**
   - "Rachel Marie" — hundreds of competitive routines (L6-10, Xcel) with scores
   - "The Coral Girls" — competition footage with scores
   - "gymnicetics" — scoring compilations with overlays
   - Search: `"Level 7 gymnastics" floor routine score`
   - Search: `"Xcel Gold" bars routine meet score`

### Tier 2: Cross-Reference Sources (match video to score)
3. **MeetScoresOnline** (meetscoresonline.com/Results)
   - Find a specific meet → get athlete names + scores
   - Search YouTube for that meet → match athlete to video
   - Example: "2025 Florida State Championships Level 7 Floor"

4. **ScoreKing** — another meet results aggregator

5. **USA Gymnastics Results** — usagym.org (official results)

### Tier 3: Social Media
6. **Instagram** — gym parents often post routines with scores in captions
   - Hashtags: #level7gymnastics #xcelgold #usagymnastics #meetday
7. **TikTok** — less reliable but growing source

---

## Deliverables
1. Video files organized in folders: `Level_7/Floor/`, `Level_7/Vault/`, etc.
2. Completed metadata spreadsheet (CSV or Excel)
3. Source links for verification

## Timeline
- **Phase 1 (Week 1):** Levels 5, 6, 7 — all 4 events (120 videos) — these are our launch priority
- **Phase 2 (Week 2):** Levels 8, 9, 10 (120 videos)
- **Phase 3 (Week 3):** Levels 4, Xcel Gold/Platinum/Diamond (160 videos)

## Budget Guidance
- Expecting $200-400 for the full 400-video collection
- Open to milestone payments per phase
- Bonus for exceeding minimums or finding NAWGJ Rapid Review content

## Important Notes
- All videos are for **internal R&D and algorithm testing only** — they will not be shown to users or redistributed
- Prefer videos where score is **verifiable** (visible on scoreboard, in video title, or cross-referenced with MeetScoresOnline)
- Quality over quantity — a video with a verified score is worth 10 without
- If you find a batch of videos from one meet where all scores are available on MeetScoresOnline, that's ideal — grab them all

## How to Apply
Please include:
- Your experience with gymnastics or sports data collection
- A sample of 3 videos you would collect (with metadata filled in)
- Your estimated timeline and rate
- Whether you have access to NAWGJ member resources
