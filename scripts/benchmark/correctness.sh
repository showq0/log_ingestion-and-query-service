#!/usr/bin/env bash
set -euo pipefail

BASE_URL=${BASE_URL:-"http://127.0.0.1:8080"}
OUTPUT_FILE=${OUTPUT_FILE:-"./benchmark-report.json"}

npm run build --silent

node dist/benchmark/cli.js \
  --correctness-only \
  --base-url "$BASE_URL" \
  --output "$OUTPUT_FILE" "$@"
