#!/usr/bin/env bash
set -euo pipefail

DURATION_SCALE=${DURATION_SCALE:-0.1}
SEED_SIZE=${SEED_SIZE:-10000}
OUTPUT_FILE=${OUTPUT_FILE:-"./benchmark-report.json"}
RESULTS_DIR=${RESULTS_DIR:-"./benchmark-results"}
BASE_URL=${BASE_URL:-"http://127.0.0.1:8080"}

npm run build --silent

node dist/benchmark/cli.js \
  --quick \
  --duration-scale "$DURATION_SCALE" \
  --seed-size "$SEED_SIZE" \
  --output "$OUTPUT_FILE" \
  --results-dir "$RESULTS_DIR" \
  --base-url "$BASE_URL" "$@"
