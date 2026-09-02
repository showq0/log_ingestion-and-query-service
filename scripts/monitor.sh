#!/usr/bin/env bash
set -euo pipefail

RESULTS_DIR="./tests/results"
mkdir -p "$RESULTS_DIR"
LOG_FILE="${RESULTS_DIR}/docker-stats.log"

echo "Sampling resource usage to $LOG_FILE (Press Ctrl+C to stop)..."
echo "Timestamp,Container,CPUPct,MemUsage,MemLimit,MemPct,NetIO,BlockIO" > "$LOG_FILE"

trap 'echo -e "\nMonitoring stopped."; exit 0' SIGINT SIGTERM

while true; do
  docker stats --no-stream --format "{{.Name}},{{.CPUPerc}},{{.MemUsage}},{{.MemPerc}},{{.NetIO}},{{.BlockIO}}" 2>/dev/null | while read -r line; do
    echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ"),$line" >> "$LOG_FILE"
  done
  sleep 1
done
