#!/bin/bash
# Pipeline A — NAWGJ Score Extraction
# Usage:
#   ./run.sh              # Full run (all target videos)
#   ./run.sh test         # Test run (first 3 videos only)
#   LIMIT=20 ./run.sh     # Custom limit

set -euo pipefail
cd "$(dirname "$0")/.."

# Load environment
if [ -f .env.local ]; then
  export $(grep -v '^#' .env.local | grep GEMINI_API_KEY | xargs)
fi

if [ -z "${GEMINI_API_KEY:-}" ]; then
  echo "ERROR: GEMINI_API_KEY not found in .env.local"
  exit 1
fi

# Test mode
if [ "${1:-}" = "test" ]; then
  export LIMIT=3
  echo "=== TEST MODE: 3 videos only ==="
fi

echo "Starting Pipeline A at $(date)"
node pipeline-a/extract.mjs
echo "Finished at $(date)"
