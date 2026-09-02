#!/usr/bin/env bash
set -euo pipefail

REPORT_PATH=${1:-"./benchmark-report.json"}

if [ ! -f "$REPORT_PATH" ]; then
  echo "Error: Report file $REPORT_PATH not found."
  exit 1
fi

node -e '
const fs = require("fs");
const path = process.argv[1];
const data = JSON.parse(fs.readFileSync(path, "utf-8"));
console.log("\n============================================================");
console.log("BENCHMARK SUMMARY: " + path);
console.log("============================================================");
console.log("Score:        " + (data.score?.score?.toFixed(2) || "N/A") + " / 100");
console.log("Correctness:  " + data.correctness?.passed + " / " + data.correctness?.total + " (" + (data.score?.correctness?.points?.toFixed(2) || "N/A") + " pts)");
console.log("Performance:  " + (data.score?.performance?.points?.toFixed(2) || "N/A") + " / 50 pts");
console.log("Queries:      " + (data.score?.queries?.points?.toFixed(2) || "N/A") + " / 15 pts");
console.log("Reliability:  " + (data.score?.reliability?.points?.toFixed(2) || "N/A") + " / 20 pts");
console.log("------------------------------------------------------------");
console.log("Scenarios:");
for (const s of (data.scenarios || [])) {
  console.log("  * " + s.scenario.padEnd(12) + ": " + Math.round(s.logsPerSecond) + " logs/s (p95: " + s.latencyP95Ms.toFixed(1) + "ms, errors: " + (s.errorRate * 100).toFixed(2) + "%, agg: " + s.aggregateP95Ms.toFixed(1) + "ms)");
}
console.log("============================================================\n");
' "$REPORT_PATH"
