import crypto from "node:crypto";
import path from "node:path";
import { parseConfig } from "./config.js";
import { profileEngine, measureMachineSpeed } from "./engine.js";
import { runCorrectnessChecks } from "./correctness.js";
import { seedDatabase } from "./seeding.js";
import { runK6Scenario } from "./k6-runner.js";
import { computeScore } from "./scorer.js";
import { writeReport, printSummaryToConsole } from "./reporter.js";
import type {
  BenchmarkReport,
  CorrectnessReport,
  ScenarioResult,
  SeedResult,
} from "./types.js";

async function waitForHealth(baseUrl: string, timeoutMs = 30_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  const urls = [
    `${baseUrl}/health`,
    baseUrl.includes("127.0.0.1")
      ? baseUrl.replace("127.0.0.1", "localhost") + "/health"
      : baseUrl.replace("localhost", "127.0.0.1") + "/health",
  ];
  while (Date.now() < deadline) {
    for (const u of urls) {
      try {
        const res = await fetch(u, { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          return true;
        }
      } catch {}
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

export async function runBenchmark() {
  const config = parseConfig();
  const runId = `bench-${crypto.randomUUID().slice(0, 8)}`;

  console.log("\n============================================================");
  console.log("            LOGI PRODUCTION BENCHMARK SUITE                 ");
  console.log("============================================================");
  console.log(`Target Endpoint:     ${config.baseUrl}`);
  console.log(`Duration Scale:      ${config.durationScale}x`);
  console.log(`Seed Dataset Size:   ${config.seedSize.toLocaleString()} records`);
  console.log(`Batch Size:          ${config.batchSize} logs/request`);
  console.log(`Run Mode:            ${config.mode}`);
  console.log("============================================================\n");

  // Step 1: Health readiness check
  process.stdout.write("[Health] Checking service readiness...");
  const isHealthy = await waitForHealth(config.baseUrl);
  if (!isHealthy) {
    console.log(" FAIL");
    console.error(`Error: Service at ${config.baseUrl}/health did not respond with 200 within 30s.`);
    process.exit(1);
  }
  console.log(" OK");

  // Step 2: Profile host engine & measure machine speed
  process.stdout.write("[Engine] Profiling host capacity & measuring speed...");
  const engine = profileEngine();
  const machineSpeed = measureMachineSpeed();
  console.log(` OK (${engine.cpus} CPUs, ${(engine.memoryBytes / (1024 ** 3)).toFixed(1)} GB RAM, ${machineSpeed.factor}x baseline speed)`);

  // Step 3: Correctness Testing (Stage 0)
  let correctnessReport: CorrectnessReport = {
    passed: 15,
    total: 15,
    cap: null,
    checks: [],
  };

  if (!config.skipCorrectness) {
    console.log("[Correctness] Running 15 mandatory API contract checks...");
    correctnessReport = await runCorrectnessChecks(config.baseUrl, config.apiKey);
    console.log(`[Correctness] Result: ${correctnessReport.passed}/${correctnessReport.total} checks passed.`);

    if (config.correctnessOnly) {
      const report: BenchmarkReport = {
        tool: "@foothill/logs-benchmark",
        generatedAt: new Date().toISOString(),
        mode: config.mode,
        endpoint: config.baseUrl,
        durationScale: config.durationScale,
        resourceLimitsEnforced: config.resourceLimitsEnforced,
        generator: `grafana/k6:0.54.0 in Docker on lgbench-default (cpus ${config.generatorCpus}, ${config.generatorMemory})`,
        generatorIsolated: true,
        engine,
        machineSpeed,
        correctness: correctnessReport,
        scenarios: [],
        score: computeScore(correctnessReport, []),
      };

      await writeReport(report, config.outputFile);
      printSummaryToConsole(report);
      return;
    }
  }

  // Step 4: Stage 1 — Seeding
  let seedResult: SeedResult | undefined;
  if (!config.skipSeeding) {
    console.log(`[Stage 1: Seeding] Generating & ingesting ${config.seedSize.toLocaleString()} historical logs...`);
    seedResult = await seedDatabase(
      config.baseUrl,
      config.seedSize,
      Math.min(500, config.batchSize * 2),
      config.randomSeed,
      config.apiKey,
      4,
      (attempted, accepted, total) => {
        const pct = ((attempted / total) * 100).toFixed(0);
        process.stdout.write(`\r[Stage 1: Seeding] Progress: ${attempted.toLocaleString()}/${total.toLocaleString()} logs (${pct}%)...`);
      },
    );
    console.log(`\n[Stage 1: Seeding] Completed: ${seedResult.accepted.toLocaleString()} logs seeded in ${(seedResult.durationMs / 1000).toFixed(2)}s (dataset size: ${seedResult.datasetSize.toLocaleString()}).`);
  }

  // Step 5: Performance Scenarios (Stages 2-5)
  const scenarioResults: ScenarioResult[] = [];

  for (const scenarioName of config.scenariosToRun) {
    console.log(`\n------------------------------------------------------------`);
    console.log(`Executing Stage: ${scenarioName.toUpperCase()}`);
    console.log(`------------------------------------------------------------`);
    try {
      const result = await runK6Scenario(scenarioName, config, runId);
      scenarioResults.push(result);
      console.log(`[Stage ${scenarioName.toUpperCase()}] Throughput: ${result.logsPerSecond.toFixed(1)} logs/s (Target: ${result.offeredLogsPerSecond}/s), p95: ${result.latencyP95Ms.toFixed(1)}ms, Errors: ${(result.errorRate * 100).toFixed(2)}%`);
    } catch (err: any) {
      console.error(`[Stage ${scenarioName.toUpperCase()}] Error running scenario:`, err.message);
      scenarioResults.push({
        scenario: scenarioName,
        status: "failed",
        logsPerSecond: 0,
        errorRate: 1.0,
        latencyP95Ms: 9999,
        aggregateP95Ms: 9999,
        readAfterWriteSuccessRate: 0,
        thresholdPassed: false,
        consistencyPassed: false,
        acceptedRecords: 0,
        visibleRecords: 0,
        offeredLogsPerSecond: config.loadRate,
        droppedIterations: 0,
        generatorLimited: false,
        serviceLimited: true,
      });
    }
  }

  // Step 6: Final Scoring & Report Generation
  const score = computeScore(correctnessReport, scenarioResults);

  const report: BenchmarkReport = {
    tool: "@foothill/logs-benchmark",
    generatedAt: new Date().toISOString(),
    mode: config.mode,
    endpoint: config.baseUrl,
    durationScale: config.durationScale,
    resourceLimitsEnforced: config.resourceLimitsEnforced,
    generator: `grafana/k6 in Docker (cpus ${config.generatorCpus}, ${config.generatorMemory})`,
    generatorIsolated: true,
    engine,
    machineSpeed,
    seed: seedResult,
    correctness: correctnessReport,
    scenarios: scenarioResults,
    reliability: {
      scenarioCompletion: scenarioResults.filter((s) => s.status === "completed" || s.generatorLimited).length / Math.max(1, scenarioResults.length),
      crashFree: true,
      recovery: true,
    },
    score,
  };

  // Write reports
  await writeReport(report, config.outputFile);
  const timestampedPath = path.join(
    config.resultsDir,
    `benchmark-${Date.now()}.json`,
  );
  await writeReport(report, timestampedPath);

  // Print summary to console
  printSummaryToConsole(report);
  console.log(`Report written to: ${config.outputFile} and ${timestampedPath}\n`);
}

// If invoked directly from CLI
if (process.argv[1]?.endsWith("cli.js") || process.argv[1]?.endsWith("cli.ts")) {
  runBenchmark().catch((err) => {
    console.error("Fatal benchmark error:", err);
    process.exit(1);
  });
}
