import fs from "node:fs/promises";
import path from "node:path";
import type { BenchmarkReport } from "./types.js";

export async function writeReport(
  report: BenchmarkReport,
  outputPath: string,
): Promise<void> {
  const dir = path.dirname(path.resolve(outputPath));
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2), "utf-8");
}

export function printSummaryToConsole(report: BenchmarkReport): void {
  const { score, correctness, scenarios, seed, machineSpeed } = report;

  console.log("\n" + "=".repeat(72));
  console.log("                LOGI PRODUCTION BENCHMARK REPORT                ");
  console.log("=".repeat(72));

  console.log(`Endpoint:         ${report.endpoint}`);
  console.log(`Duration Scale:   ${report.durationScale}x`);
  console.log(`Machine Speed:    ${machineSpeed.workUnitsPerSecond.toFixed(2)} units/s (${machineSpeed.factor}x baseline)`);
  if (seed) {
    console.log(`Seeded Dataset:   ${seed.datasetSize.toLocaleString()} logs in ${seed.durationMs}ms`);
  }
  console.log("-".repeat(72));

  // Correctness
  console.log(`CORRECTNESS:      ${correctness.passed}/${correctness.total} checks passed (${score.correctness.points}/${score.correctness.maximum} pts)`);
  if (correctness.passed < correctness.total) {
    for (const c of correctness.checks.filter((x) => !x.passed)) {
      console.log(`  ❌ ${c.name}: ${c.actual} (expected: ${c.expected})`);
    }
  }

  console.log("-".repeat(72));
  console.log("SCENARIOS:");
  console.log(
    "Scenario".padEnd(12) +
      "Target".padEnd(12) +
      "Achieved".padEnd(14) +
      "p95 Latency".padEnd(14) +
      "Agg p95".padEnd(10) +
      "Limitation".padEnd(14) +
      "Status",
  );

  for (const s of scenarios) {
    let lim = "None";
    if (s.generatorLimited) lim = "Generator";
    else if (s.serviceLimited) lim = "Service";

    console.log(
      s.scenario.padEnd(12) +
        `${s.offeredLogsPerSecond}/s`.padEnd(12) +
        `${Math.round(s.logsPerSecond)}/s`.padEnd(14) +
        `${s.latencyP95Ms.toFixed(1)}ms`.padEnd(14) +
        `${s.aggregateP95Ms.toFixed(1)}ms`.padEnd(10) +
        lim.padEnd(14) +
        s.status.toUpperCase(),
    );
  }

  console.log("-".repeat(72));
  console.log("SCORE BREAKDOWN:");
  console.log(`  Correctness:    ${score.correctness.points.toFixed(2)} / ${score.correctness.maximum} pts (${score.correctness.percentage.toFixed(1)}%)`);
  console.log(`  Performance:    ${score.performance.points.toFixed(2)} / ${score.performance.maximum} pts (${score.performance.percentage.toFixed(1)}%)`);
  console.log(`  Queries:        ${score.queries.points.toFixed(2)} / ${score.queries.maximum} pts (${score.queries.percentage.toFixed(1)}%)`);
  console.log(`  Reliability:    ${score.reliability.points.toFixed(2)} / ${score.reliability.maximum} pts (${score.reliability.percentage.toFixed(1)}%)`);
  console.log("  " + "-".repeat(40));
  console.log(`  TOTAL SCORE:    ${score.score.toFixed(2)} / ${score.maximumScore} pts`);
  console.log("=".repeat(72) + "\n");
}
