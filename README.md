# STRIVE — See Your Score. Own Your Growth.

AI-powered gymnastics scoring and athlete development platform.

---

## Deploy to Vercel (Recommended — 5 minutes)

### Prerequisites
- GitHub account ([github.com](https://github.com))
- Vercel account ([vercel.com](https://vercel.com)) — sign up with GitHub
- GitHub Desktop ([desktop.github.com](https://desktop.github.com))

### Steps

1. **Open GitHub Desktop** → File → Add Local Repository → select this `strive-app` folder
   - If it says "not a git repo", click "Create a Repository" → name it `strive-app` → Create
2. **Commit**: In GitHub Desktop, type "Initial commit" in the Summary box → Click "Commit to main"
3. **Push**: Click "Publish repository" (blue button at top) → Uncheck "Keep this code private" if you want → Publish
4. **Deploy**: Go to [vercel.com/new](https://vercel.com/new) → Import your `strive-app` repo → Click Deploy
5. **Done**: Your app is live at `strive-app.vercel.app`

### Updating the app
When you get a new build from Claude:
1. Replace the files in your `strive-app` folder
2. Open GitHub Desktop → it shows changed files
3. Type a summary like "Phase 3 update" → Commit → Push
4. Vercel auto-deploys in ~60 seconds

---

## Run Locally (for testing)

```bash
cd strive-app
npm install          # first time only
PORT=3001 npm start  # opens http://localhost:3001
```

---

## Gemini API Key

The app needs a Gemini API key for video analysis:
1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Create a free API key
3. In STRIVE: Settings → Video Analysis Engine → paste your key → Save

---

## What's Inside

### 3-Pass Analysis Engine
- **Pass 1 — Skill Detection**: Gemini identifies every skill with timestamps
- **Pass 2 — Execution Judging**: Each skill judged against USAG criteria
- **Pass 3 — Verification**: Re-watches video, confirms or rejects each deduction

### Two-Tier System
| Feature | Free | Pro |
|---|---|---|
| Video analysis | 3/month | Unlimited |
| Score + benchmark | Yes | Yes |
| Deductions shown | Top 3 | All |
| #1 fix | Yes | Full drill library |
| Biomechanics | Locked | Yes |
| Training program | Locked | Yes |
| Mental training | Locked | Yes |
| What-If simulator | Locked | Yes |

### Coverage
- USAG Levels 1–10
- Xcel Bronze through Sapphire
- Men's and Women's Artistic Gymnastics
- All apparatus

---

## Architecture

```
src/
├── App.js              # STRIVE shell + TierProvider
├── LegacyApp.js        # Core app (analysis, UI, all screens)
├── components/
│   ├── layout/         # BottomNav
│   ├── onboarding/     # SplashScreen
│   └── shared/         # StriveLogo
├── context/
│   └── TierContext.js   # Free/Pro tier system
├── data/
│   ├── constants.js     # Deductions, levels, benchmarks
│   └── affirmations.js  # Daily inspiration system
├── utils/
│   ├── storage.js       # localStorage wrapper
│   ├── helpers.js       # Safety utilities + logger
│   └── validation.js    # AI response normalization
└── styles/
    └── global.css       # STRIVE design system
```
