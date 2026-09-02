#!/usr/bin/env bash
set -euo pipefail

RESULTS_DIR="./benchmark-results/flush-matrix"
mkdir -p "$RESULTS_DIR"

INTERVALS=(10 25 50 100)

echo "============================================================"
echo "          LOGI INGESTION FLUSH MATRIX COMPARISON            "
echo "============================================================"

for interval in "${INTERVALS[@]}"; do
  echo ""
  echo ">>> Testing with LOG_FLUSH_INTERVAL_MS=${interval}..."
  OUTPUT_FILE="${RESULTS_DIR}/report-flush-${interval}ms.json"
  
  DURATION_SCALE=0.1 \
  SEED_SIZE=5000 \
  OUTPUT_FILE="$OUTPUT_FILE" \
  scripts/benchmark/quick.sh
done

echo ""
echo "Flush matrix run complete. Results stored in ${RESULTS_DIR}"
