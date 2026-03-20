# Strive Data Collection Plan

## Purpose
Build a ground-truth database of gymnastics competition videos paired with actual judge-awarded scores. This database is used internally to calibrate, test, and validate our AI scoring accuracy across all levels and events.

---

## Database Target

### Women's Gymnastics (Priority)

| Level | Vault | Bars | Beam | Floor | Total |
|-------|-------|------|------|-------|-------|
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

**Total: 400 videos minimum**

### Score Range Per Batch (10 videos)
- 2-3 high scores (9.0+)
- 4-5 mid-range (8.5-9.0)
- 2-3 lower scores (<8.5, including falls if possible)

### Launch Priority
**Phase 1:** Levels 5, 6, 7 (120 videos) — these are our core user levels

---

## Data Sources

### Tier 1: Judge-Verified (Best)
1. **NAWGJ Rapid Review Archive** — nawgj.org
   - Judge training videos with official deduction scripts AND final scores
   - Levels 6-10 and Xcel Bronze-Sapphire
   - **#1 priority source — this is ground truth from the judges themselves**

### Tier 2: YouTube Channels with Scores
2. **"Rachel Marie"** — hundreds of competitive routines (L6-10, Xcel) with scores in titles
3. **"The Coral Girls"** — competition footage with scores
4. **"gymnicetics"** — scoring compilations with overlays
5. **Search strings:**
   - `"Level 7 gymnastics" floor routine score`
   - `"Xcel Gold" bars routine meet score`
   - `"[meet name] [level] [event] 2025"`

### Tier 3: Cross-Reference (Match Video to Score)
6. **MeetScoresOnline** — meetscoresonline.com/Results
   - Find a specific meet → get athlete names + scores by level/event
   - Search YouTube for that meet name → match athlete to video
   - Example: "2025 Florida State Championships Level 7 Floor"
7. **ScoreKing** — another meet results aggregator
8. **USA Gymnastics Results** — usagym.org (official results)

### Tier 4: Social Media
9. **Instagram** — #level7gymnastics #xcelgold #usagymnastics #meetday
10. **TikTok** — growing source, less reliable scores

---

## Metadata Schema

Every video in the database must have this metadata (stored as CSV):

| Field | Example | Required |
|-------|---------|----------|
| filename | L7_floor_001.mp4 | Yes |
| event | Floor Exercise | Yes |
| level | Level 7 | Yes |
| gender | Female | Yes |
| actual_score | 9.125 | Yes |
| score_source | MeetScoresOnline / video overlay / NAWGJ | Yes |
| meet_name | 2025 Florida State Championships | Yes |
| athlete_name | Jane Doe | Optional |
| source_url | YouTube/NAWGJ link | Yes |
| camera_angle | Side / Diagonal / Behind | Yes |
| video_quality | Good / Fair / Poor | Yes |
| notes | Score on scoreboard at 1:23 | Optional |

---

## Folder Structure

```
data/
  calibration-videos/
    Level_5/
      Vault/
      Uneven_Bars/
      Balance_Beam/
      Floor_Exercise/
    Level_6/
      ...
    Level_7/
      ...
    (etc)
  calibration-scores.csv      ← master metadata file
  calibration-results.csv     ← AI scores vs actual (test output)
```

---

## How This Data Gets Used

1. **Accuracy Testing:** Run each video through our Gemini scoring pipeline, compare AI score to actual judge score
2. **Calibration Tuning:** If AI consistently scores 0.2 high on bars, adjust bars calibration range
3. **Regression Testing:** After any prompt change, re-run all 400 videos to ensure we didn't break accuracy on other events
4. **Per-Level Benchmarking:** Verify accuracy holds across Level 4 through Level 10 (different skill complexity)
5. **Score Distribution Validation:** Confirm our score distributions match real meet distributions per level

### Accuracy Targets
| Metric | Target |
|--------|--------|
| Mean absolute error | < 0.15 |
| Within 0.10 of actual | > 60% of videos |
| Within 0.20 of actual | > 85% of videos |
| Same video, two runs | < 0.10 variance |
| No score > 0.50 from actual | 100% |

---

## Collection Methods

### Manual (Fiverr)
- Hiring brief: `scripts/VIDEO_COLLECTION_BRIEF.md`
- Budget: $200-400 for full 400 videos
- Timeline: 3 weeks (Phase 1 first week)

### Automated (Score Aggregation)
- MeetScoresOnline loads data via JavaScript — requires Playwright/Puppeteer scraper
- Scraper would collect: meet name, level, event, athlete name, score
- Cross-reference with YouTube searches to find matching videos
- Script: TODO — `scripts/scrape-meetscores.js`

### Existing Test Videos
Currently have 4 test videos with known scores:
| File | Event | Score |
|------|-------|-------|
| IMG_9884.MOV (20MB) | Floor Exercise | 8.925 |
| IMG_4061.MOV (43MB) | Uneven Bars | 8.525 |
| differentvaultcomp.mov (13MB) | Vault | 8.850 |
| IMG_5178 3.mov (522MB) | Balance Beam | 8.850 |

---

## Legal Notes
- All videos for **internal R&D and algorithm calibration only**
- Videos will NOT be shown to users or redistributed in the app
- NAWGJ content may require membership access
- YouTube downloads via yt-dlp for internal testing falls under fair use for R&D
- If any video content is ever displayed in-app, permission from original uploaders required
