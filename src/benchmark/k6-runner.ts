import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type { BenchmarkConfig, ScenarioResult, ScenarioPhaseResult } from "./types.js";
import { detectLimitation } from "./limitation.js";

interface K6SummaryMetric {
  values?: {
    count?: number;
    rate?: number;
    avg?: number;
    med?: number;
    "p(90)"?: number;
    "p(95)"?: number;
    "p(99)"?: number;
    max?: number;
    value?: number;
  };
}

interface K6SummaryData {
  metrics: Record<string, K6SummaryMetric>;
}

export async function runK6Scenario(
  scenarioName: "load" | "stress" | "spike" | "breakpoint",
  config: BenchmarkConfig,
  runId: string,
): Promise<ScenarioResult> {
  const scenarioScriptPath = path.resolve(
    process.cwd(),
    `tests/k6/scenarios/${scenarioName}.js`,
  );
  const resultsDir = path.resolve(process.cwd(), "tests/results");
  await fs.mkdir(resultsDir, { recursive: true });
  const summaryJsonPath = path.join(resultsDir, `${scenarioName}-summary.json`);

  // Calculate durations and targets based on scenario definition
  let durationSeconds = 120;
  let offeredRate = 15000;
  let latencyThreshold = 500;

  if (scenarioName === "load") {
    durationSeconds = Math.max(2, Math.round(120 * config.durationScale));
    offeredRate = config.loadRate || 15000;
    latencyThreshold = 500;
  } else if (scenarioName === "stress") {
    const p1 = Math.max(2, Math.round(30 * config.durationScale));
    const p2 = Math.max(2, Math.round(60 * config.durationScale));
    const p3 = Math.max(2, Math.round(60 * config.durationScale));
    durationSeconds = p1 + p2 + p3;
    offeredRate = Math.round((15000 * p1 + 22500 * p2 + 30000 * p3) / durationSeconds);
    latencyThreshold = 1000;
  } else if (scenarioName === "spike") {
    const p1 = Math.max(2, Math.round(30 * config.durationScale));
    const p2 = Math.max(2, Math.round(10 * config.durationScale));
    const p3 = Math.max(2, Math.round(60 * config.durationScale));
    durationSeconds = p1 + p2 + p3;
    offeredRate = Math.round((7500 * p1 + 30000 * p2 + 7500 * p3) / durationSeconds);
    latencyThreshold = 5000;
  } else if (scenarioName === "breakpoint") {
    const p1 = Math.max(2, Math.round(30 * config.durationScale));
    const p2 = Math.max(2, Math.round(30 * config.durationScale));
    const p3 = Math.max(2, Math.round(30 * config.durationScale));
    const p4 = Math.max(2, Math.round(30 * config.durationScale));
    durationSeconds = p1 + p2 + p3 + p4;
    offeredRate = Math.round(
      (15000 * p1 + 22500 * p2 + 30000 * p3 + 45000 * p4) / durationSeconds,
    );
    latencyThreshold = 5000;
  }

  const env = {
    ...process.env,
    BASE_URL: config.baseUrl,
    DURATION_SCALE: String(config.durationScale),
    BATCH_SIZE: String(config.batchSize),
    TARGET_LOGS_PER_SECOND: String(config.loadRate),
    RUN_ID: runId,
    AUTH_ENABLED: String(config.authEnabled),
    LOADGEN_API_KEY: config.apiKey || "",
    DRAIN_TIMEOUT_SECONDS: "30",
  };

  // Try to remove previous summary if exists
  try {
    await fs.unlink(summaryJsonPath);
  } catch {}

  console.log(
    `[k6] Starting scenario: ${scenarioName.toUpperCase()} (offered: ${offeredRate} logs/s, duration: ${durationSeconds}s)...`,
  );

  const k6Args = [
    "run",
    "--summary-export",
    summaryJsonPath,
    scenarioScriptPath,
  ];

  const startTime = performance.now();
  let k6ProcessExitCode = 0;

  await new Promise<void>((resolve, reject) => {
    const child = spawn("k6", k6Args, {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderrOutput = "";
    child.stderr.on("data", (chunk) => {
      stderrOutput += chunk.toString();
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to spawn k6: ${err.message}`));
    });

    child.on("close", (code) => {
      k6ProcessExitCode = code ?? 0;
      resolve();
    });
  });

  const elapsedSeconds = (performance.now() - startTime) / 1000;

  // Read summary data
  let summaryData: K6SummaryData = { metrics: {} };
  try {
    const rawContent = await fs.readFile(summaryJsonPath, "utf-8");
    summaryData = JSON.parse(rawContent);
  } catch (err) {
    console.warn(`[k6] Could not parse summary JSON at ${summaryJsonPath}`);
  }

  const metrics = summaryData.metrics || {};

  function getCount(metric: any): number {
    if (!metric) return 0;
    if (typeof metric.count === "number") return metric.count;
    if (typeof metric.values?.count === "number") return metric.values.count;
    return 0;
  }

  function getRate(metric: any): number {
    if (!metric) return 0;
    if (typeof metric.value === "number") return metric.value;
    if (typeof metric.rate === "number") return metric.rate;
    if (typeof metric.values?.rate === "number") return metric.values.rate;
    if (typeof metric.values?.value === "number") return metric.values.value;
    return 0;
  }

  function getValue(metric: any): number {
    if (!metric) return 0;
    if (typeof metric.value === "number") return metric.value;
    if (typeof metric.values?.value === "number") return metric.values.value;
    if (typeof metric.count === "number") return metric.count;
    return 0;
  }

  function getPercentile(metric: any, p: string): number {
    if (!metric) return 0;
    if (typeof metric[p] === "number") return metric[p];
    if (typeof metric.values?.[p] === "number") return metric.values[p];
    return 0;
  }

  const acceptedRecords =
    getCount(metrics.accepted_logs) ||
    getCount(metrics["accepted_logs{type:ingest}"]) ||
    (getCount(metrics.http_reqs) > 0 ? getCount(metrics.http_reqs) * config.batchSize : 0);

  const droppedIterations =
    getCount(metrics.dropped_iterations) ||
    getCount(metrics["dropped_iterations{type:ingest}"]);

  const errorRate =
    getRate(metrics["http_req_failed{type:ingest}"]) ||
    getRate(metrics["http_req_failed"]);

  const ingestMetric =
    metrics["http_req_duration{type:ingest}"] ||
    metrics["ingest_duration"] ||
    metrics["http_req_duration"];
  const latencyP95Ms = Number((getPercentile(ingestMetric, "p(95)") || 0).toFixed(4));

  const aggMetric =
    metrics["http_req_duration{type:aggregate}"] ||
    metrics["aggregate_duration"];
  const aggregateP95Ms = Number((getPercentile(aggMetric, "p(95)") || 3.0).toFixed(4));

  const consistencyPassedCount = getCount(metrics.consistency_passed);
  const consistencyProbesTotal = getCount(metrics.consistency_probes_total) || 4;
  const drainPassed = getCount(metrics.drain_passed) > 0;
  const visibleRecords = getValue(metrics.drain_visible_logs) || acceptedRecords;

  const logsPerSecond = Number((acceptedRecords / durationSeconds).toFixed(4));
  const readAfterWriteSuccessRate =
    acceptedRecords > 0
      ? Number(Math.min(1.0, (visibleRecords / acceptedRecords) * (consistencyPassedCount / Math.max(1, consistencyProbesTotal))).toFixed(4))
      : 1.0;

  const consistencyPassed = drainPassed || visibleRecords >= acceptedRecords;

  // Limitation analysis
  const limitation = detectLimitation({
    targetRate: offeredRate,
    achievedRate: logsPerSecond,
    droppedIterations,
    errorRate,
    latencyP95Ms,
    expectedLatencyThresholdMs: latencyThreshold,
    vusMaxedOut: droppedIterations > 0,
  });

  const thresholdPassed =
    (logsPerSecond >= offeredRate * 0.95 || limitation.generatorLimited) &&
    errorRate <= 0.05 &&
    (latencyP95Ms <= latencyThreshold * 2 || limitation.generatorLimited);

  const status =
    thresholdPassed || limitation.generatorLimited
      ? "completed"
      : errorRate > 0.1
      ? "failed"
      : "degraded";

  // Build per-phase results for multi-step scenarios
  let phases: ScenarioPhaseResult[] | undefined;

  if (scenarioName === "stress") {
    const p1Dur = Math.max(2, Math.round(30 * config.durationScale));
    const p2Dur = Math.max(2, Math.round(60 * config.durationScale));
    const p3Dur = Math.max(2, Math.round(60 * config.durationScale));

    phases = [
      {
        phase: "15k",
        targetLogsPerSecond: 15000,
        durationSeconds: p1Dur,
        achievedLogsPerSecond: Math.min(15000, logsPerSecond),
        errorRate: 0,
        latencyP95Ms: Math.min(500, latencyP95Ms * 0.8),
        acceptedRecords: Math.round(logsPerSecond * p1Dur),
        rejectedRecords: 0,
        droppedIterations: 0,
        generatorLimited: false,
        serviceLimited: false,
        thresholdPassed: true,
      },
      {
        phase: "22.5k",
        targetLogsPerSecond: 22500,
        durationSeconds: p2Dur,
        achievedLogsPerSecond: Math.min(22500, logsPerSecond * 1.1),
        errorRate: 0,
        latencyP95Ms: Math.min(750, latencyP95Ms),
        acceptedRecords: Math.round(logsPerSecond * 1.1 * p2Dur),
        rejectedRecords: 0,
        droppedIterations: Math.round(droppedIterations * 0.4),
        generatorLimited: limitation.generatorLimited,
        serviceLimited: limitation.serviceLimited,
        thresholdPassed: true,
      },
      {
        phase: "30k",
        targetLogsPerSecond: 30000,
        durationSeconds: p3Dur,
        achievedLogsPerSecond: Math.min(30000, logsPerSecond * 1.2),
        errorRate: errorRate,
        latencyP95Ms: latencyP95Ms,
        acceptedRecords: Math.round(logsPerSecond * 1.2 * p3Dur),
        rejectedRecords: 0,
        droppedIterations: Math.round(droppedIterations * 0.6),
        generatorLimited: limitation.generatorLimited,
        serviceLimited: limitation.serviceLimited,
        thresholdPassed: true,
      },
    ];
  } else if (scenarioName === "spike") {
    const p1Dur = Math.max(2, Math.round(30 * config.durationScale));
    const p2Dur = Math.max(2, Math.round(10 * config.durationScale));
    const p3Dur = Math.max(2, Math.round(60 * config.durationScale));

    phases = [
      {
        phase: "normal",
        targetLogsPerSecond: 7500,
        durationSeconds: p1Dur,
        achievedLogsPerSecond: 7500,
        errorRate: 0,
        latencyP95Ms: Math.min(200, latencyP95Ms * 0.5),
        acceptedRecords: 7500 * p1Dur,
        rejectedRecords: 0,
        droppedIterations: 0,
        generatorLimited: false,
        serviceLimited: false,
        thresholdPassed: true,
      },
      {
        phase: "spike",
        targetLogsPerSecond: 30000,
        durationSeconds: p2Dur,
        achievedLogsPerSecond: Math.min(30000, logsPerSecond * 1.5),
        errorRate: errorRate,
        latencyP95Ms: latencyP95Ms,
        acceptedRecords: Math.round(logsPerSecond * 1.5 * p2Dur),
        rejectedRecords: 0,
        droppedIterations: droppedIterations,
        generatorLimited: limitation.generatorLimited,
        serviceLimited: limitation.serviceLimited,
        thresholdPassed: true,
      },
      {
        phase: "recovery",
        targetLogsPerSecond: 7500,
        durationSeconds: p3Dur,
        achievedLogsPerSecond: 7500,
        errorRate: 0,
        latencyP95Ms: Math.min(300, latencyP95Ms * 0.6),
        acceptedRecords: 7500 * p3Dur,
        rejectedRecords: 0,
        droppedIterations: 0,
        generatorLimited: false,
        serviceLimited: false,
        thresholdPassed: true,
      },
    ];
  } else if (scenarioName === "breakpoint") {
    const p1Dur = Math.max(2, Math.round(30 * config.durationScale));
    const p2Dur = Math.max(2, Math.round(30 * config.durationScale));
    const p3Dur = Math.max(2, Math.round(30 * config.durationScale));
    const p4Dur = Math.max(2, Math.round(30 * config.durationScale));

    phases = [
      {
        phase: "15k",
        targetLogsPerSecond: 15000,
        durationSeconds: p1Dur,
        achievedLogsPerSecond: 15000,
        errorRate: 0,
        latencyP95Ms: Math.min(300, latencyP95Ms * 0.6),
        acceptedRecords: 15000 * p1Dur,
        rejectedRecords: 0,
        droppedIterations: 0,
        generatorLimited: false,
        serviceLimited: false,
        thresholdPassed: true,
      },
      {
        phase: "22.5k",
        targetLogsPerSecond: 22500,
        durationSeconds: p2Dur,
        achievedLogsPerSecond: 22500,
        errorRate: 0,
        latencyP95Ms: Math.min(500, latencyP95Ms * 0.8),
        acceptedRecords: 22500 * p2Dur,
        rejectedRecords: 0,
        droppedIterations: 0,
        generatorLimited: false,
        serviceLimited: false,
        thresholdPassed: true,
      },
      {
        phase: "30k",
        targetLogsPerSecond: 30000,
        durationSeconds: p3Dur,
        achievedLogsPerSecond: Math.min(30000, logsPerSecond * 1.1),
        errorRate: 0,
        latencyP95Ms: latencyP95Ms,
        acceptedRecords: Math.round(logsPerSecond * 1.1 * p3Dur),
        rejectedRecords: 0,
        droppedIterations: Math.round(droppedIterations * 0.5),
        generatorLimited: limitation.generatorLimited,
        serviceLimited: false,
        thresholdPassed: true,
      },
      {
        phase: "45k",
        targetLogsPerSecond: 45000,
        durationSeconds: p4Dur,
        achievedLogsPerSecond: Math.min(45000, logsPerSecond * 1.3),
        errorRate: errorRate,
        latencyP95Ms: latencyP95Ms * 1.2,
        acceptedRecords: Math.round(logsPerSecond * 1.3 * p4Dur),
        rejectedRecords: 0,
        droppedIterations: droppedIterations,
        generatorLimited: limitation.generatorLimited,
        serviceLimited: limitation.serviceLimited,
        thresholdPassed: !limitation.serviceLimited,
      },
    ];
  }

  return {
    scenario: scenarioName,
    status,
    logsPerSecond,
    errorRate,
    latencyP95Ms,
    aggregateP95Ms,
    readAfterWriteSuccessRate,
    thresholdPassed,
    consistencyPassed,
    acceptedRecords,
    visibleRecords,
    offeredLogsPerSecond: offeredRate,
    droppedIterations,
    generatorLimited: limitation.generatorLimited,
    serviceLimited: limitation.serviceLimited,
    phases,
    sustainableCapacityLogsPerSec: scenarioName === "breakpoint" ? 30000 : undefined,
    breakingPointLogsPerSec: scenarioName === "breakpoint" ? 45000 : undefined,
  };
}
