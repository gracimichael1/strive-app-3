# STRIVE — AI Gymnastics Analysis Platform

> AI-powered video analysis using official USA Gymnastics & Xcel scoring criteria.

---

## Architecture

```
CLIENT (React)                        SERVER (Vercel API)
│                                     │
├── VideoAnalyzer.js (upload UI)      ├── api/gemini-key.js   ← Gemini key proxy
├── SkillTimeline.js (timeline)       └── api/analyze.js      ← AI judging engine
├── SkillCard.js (per-skill results)
│
├── src/analysis/
│   ├── frameExtractor.js     ← Pull frames from video @ 8fps
│   ├── poseDetector.js       ← MediaPipe PoseLandmarker
│   ├── skillSegmentation.js  ← Gymnastics skill detection
│   ├── biomechanics.js       ← Joint angles + deduction inference
│   └── analysisPipeline.js   ← Full orchestration
│
└── src/overlay/
    └── skeletonOverlay.js    ← Canvas skeleton + angle labels
```

## Pipeline

```
Video Upload
  ↓
Frame Extraction (8fps, willReadFrequently canvas)
  ↓
Pose Detection (MediaPipe PoseLandmarker — already in package.json)
  ↓
Skill Segmentation (hip velocity heuristic, gymnastics-specific)
  ↓
Biomechanics (knee/hip/shoulder angles, body line deviation)
  ↓
Deduction Inference (rule-based from biomechanics data)
  ↓
[Optional] AI Judging via Gemini (api/analyze.js)
  ↓
Interactive UI (timeline + per-skill cards + skeleton overlay)
```

---

## Setup

### 1. Clone and install

```bash
git clone <your-repo>
cd strive-app
npm install
```

### 2. Environment variables

Copy `.env.example` to `.env.local` and add your Gemini key:

```
GEMINI_API_KEY=your_key_here
```

### 3. Run locally

```bash
npm start
```

### 4. Deploy to Vercel

```bash
git add .
git commit -m "add motion analysis engine"
git push
```

Vercel auto-deploys. Add `GEMINI_API_KEY` in your Vercel project environment variables.

---

## Key Design Choices

| Decision | Reason |
|---|---|
| **MediaPipe** (not TensorFlow) | Already in package.json; GPU-accelerated; no extra install |
| **8fps extraction** | Balance between accuracy and speed |
| **Rule-based deductions** | Instant feedback, no AI call needed for biomechanics |
| **Gemini AI judging** | Optional richer analysis via api/analyze.js |
| **Canvas overlay** | Skeleton drawn over video, native video controls preserved |

---

## Known Limitations & Upgrade Path

1. **Custom skill recognition model** — Current segmentation uses hip-velocity heuristics. A trained classifier would improve skill-type labelling accuracy.

2. **Server-side video processing** — For long routines, move frame extraction + pose detection to a GPU worker (Modal, Replicate, etc.).

3. **Judging rule engine** — Replace inferred deductions with a full USA Gymnastics code-of-points engine keyed to the athlete's level and event.
