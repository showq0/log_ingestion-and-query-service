import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type { BenchmarkConfig, ScenarioResult, ScenarioPhaseResult } from "./types.js";
import { detectLimitation } from "./limitation.js";

const K6_IMAGE = "grafana/k6:0.54.0";

interface ScenarioPlan {
  durationSeconds: number;
  offeredRate: number;
  latencyThreshold: number;
  phases: Array<{ phase: string; targetLogsPerSecond: number; durationSeconds: number }>;
}

function planScenario(
  scenarioName: "load" | "stress" | "spike" | "breakpoint",
  config: BenchmarkConfig,
): ScenarioPlan {
  const scale = (seconds: number) => Math.max(2, Math.round(seconds * config.durationScale));

  if (scenarioName === "load") {
    const durationSeconds = scale(120);
    return {
      durationSeconds,
      offeredRate: config.loadRate || 15000,
      latencyThreshold: 500,
      phases: [{ phase: "load", targetLogsPerSecond: config.loadRate || 15000, durationSeconds }],
    };
  }

  if (scenarioName === "stress") {
    const phases = [
      { phase: "15k", targetLogsPerSecond: 15000, durationSeconds: scale(30) },
      { phase: "22.5k", targetLogsPerSecond: 22500, durationSeconds: scale(60) },
      { phase: "30k", targetLogsPerSecond: 30000, durationSeconds: scale(60) },
    ];
    const durationSeconds = phases.reduce((sum, p) => sum + p.durationSeconds, 0);
    const offeredRate = Math.round(
      phases.reduce((sum, p) => sum + p.targetLogsPerSecond * p.durationSeconds, 0) / durationSeconds,
    );
    return { durationSeconds, offeredRate, latencyThreshold: 1000, phases };
  }

  if (scenarioName === "spike") {
    const phases = [
      { phase: "normal", targetLogsPerSecond: 7500, durationSeconds: scale(30) },
      { phase: "spike", targetLogsPerSecond: 30000, durationSeconds: scale(10) },
      { phase: "recovery", targetLogsPerSecond: 7500, durationSeconds: scale(60) },
    ];
    const durationSeconds = phases.reduce((sum, p) => sum + p.durationSeconds, 0);
    const offeredRate = Math.round(
      phases.reduce((sum, p) => sum + p.targetLogsPerSecond * p.durationSeconds, 0) / durationSeconds,
    );
    return { durationSeconds, offeredRate, latencyThreshold: 5000, phases };
  }

  const phases = [
    { phase: "15k", targetLogsPerSecond: 15000, durationSeconds: scale(30) },
    { phase: "22.5k", targetLogsPerSecond: 22500, durationSeconds: scale(30) },
    { phase: "30k", targetLogsPerSecond: 30000, durationSeconds: scale(30) },
    { phase: "45k", targetLogsPerSecond: 45000, durationSeconds: scale(30) },
  ];
  const durationSeconds = phases.reduce((sum, p) => sum + p.durationSeconds, 0);
  const offeredRate = Math.round(
    phases.reduce((sum, p) => sum + p.targetLogsPerSecond * p.durationSeconds, 0) / durationSeconds,
  );
  return { durationSeconds, offeredRate, latencyThreshold: 5000, phases };
}

function dockerTargetUrl(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
      url.hostname = "host.docker.internal";
    }
    return url.toString().replace(/\/+$/, "");
  } catch {
    return baseUrl.replace("127.0.0.1", "host.docker.internal").replace("localhost", "host.docker.internal");
  }
}

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

function getPercentile(metric: any, p: string): number {
  if (!metric) return 0;
  if (typeof metric[p] === "number") return metric[p];
  if (typeof metric.values?.[p] === "number") return metric.values[p];
  return 0;
}

function metricByPrefix(metrics: Record<string, any>, names: string[]): any {
  for (const name of names) {
    if (metrics[name]) return metrics[name];
  }
  for (const name of names) {
    const match = Object.keys(metrics).find((key) => key === name || key.startsWith(`${name}{`));
    if (match) return metrics[match];
  }
  return undefined;
}

function sumMetric(metrics: Record<string, any>, name: string): number {
  let total = 0;
  for (const [key, value] of Object.entries(metrics)) {
    if (key === name || key.startsWith(`${name}{`)) {
      total += getCount(value) || getRate(value);
    }
  }
  return total;
}

function parsePhase(key: string): string | null {
  const match = key.match(/phase:([^,}]+)/);
  return match ? match[1] : null;
}

async function waitForRecovery(baseUrl: string, timeoutMs = 30_000): Promise<{ recovered: boolean; recoveryMs: number | null }> {
  const start = performance.now();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        return { recovered: true, recoveryMs: Math.round(performance.now() - start) };
      }
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return { recovered: false, recoveryMs: null };
}

export async function runK6Scenario(
  scenarioName: "load" | "stress" | "spike" | "breakpoint",
  config: BenchmarkConfig,
  runId: string,
): Promise<ScenarioResult> {
  const plan = planScenario(scenarioName, config);
  const k6Root = path.resolve(process.cwd(), "tests/k6");
  const resultsDir = path.resolve(process.cwd(), "tests/results");
  await fs.mkdir(resultsDir, { recursive: true });
  const summaryJsonPath = path.join(resultsDir, `${scenarioName}-summary.json`);

  try {
    await fs.unlink(summaryJsonPath);
  } catch {}

  const dockerBaseUrl = dockerTargetUrl(config.baseUrl);
  const envPairs = [
    `BASE_URL=${dockerBaseUrl}`,
    `DURATION_SCALE=${config.durationScale}`,
    `BATCH_SIZE=${config.batchSize}`,
    `TARGET_LOGS_PER_SECOND=${config.loadRate}`,
    `RUN_ID=${runId}-${scenarioName}`,
    `AUTH_ENABLED=${config.authEnabled}`,
    `LOADGEN_API_KEY=${config.apiKey || ""}`,
    `DRAIN_TIMEOUT_SECONDS=30`,
  ];

  const dockerArgs = [
    "run",
    "--rm",
    "--cpus",
    String(config.generatorCpus),
    "--memory",
    config.generatorMemory,
    "--network",
    "bridge",
    "--add-host",
    "host.docker.internal:host-gateway",
    "-v",
    `${k6Root}:/scripts:ro`,
    "-v",
    `${resultsDir}:/results`,
    ...envPairs.flatMap((pair) => ["-e", pair]),
    K6_IMAGE,
    "run",
    "--summary-export",
    `/results/${scenarioName}-summary.json`,
    `/scripts/scenarios/${scenarioName}.js`,
  ];

  console.log(
    `[k6] Starting ${scenarioName.toUpperCase()} via ${K6_IMAGE} (cpus ${config.generatorCpus}, mem ${config.generatorMemory}, isolated bridge)`,
  );
  console.log(`[k6] Offered ${plan.offeredRate} logs/s for ${plan.durationSeconds}s`);

  const dockerRun = await new Promise<{ code: number; error?: Error }>((resolve) => {
    const child = spawn("docker", dockerArgs, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
    });
    child.on("error", (err) => {
      resolve({ code: 1, error: err });
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 1 });
    });
  });

  if (dockerRun.error) {
    throw new Error(`Failed to start Docker k6 runner: ${dockerRun.error.message}. Docker is required to run ${K6_IMAGE}.`);
  }

  const k6ProcessExitCode = dockerRun.code;

  let metrics: Record<string, any> = {};
  try {
    const rawContent = await fs.readFile(summaryJsonPath, "utf-8");
    metrics = JSON.parse(rawContent).metrics || {};
  } catch {
    console.warn(`[k6] Could not parse summary JSON at ${summaryJsonPath}`);
  }

  const acceptedRecords = sumMetric(metrics, "accepted_logs");
  const rejectedRecords = sumMetric(metrics, "rejected_logs");
  const droppedIterations = getCount(metrics.dropped_iterations);
  const httpErrorCount = sumMetric(metrics, "http_errors");
  const applicationErrorCount = sumMetric(metrics, "application_errors");
  const errorRate = getRate(metricByPrefix(metrics, ["http_req_failed"]));
  const ingestMetric = metricByPrefix(metrics, [
    "ingest_duration",
    "http_req_duration{type:ingest}",
    "http_req_duration",
  ]);
  const queryMetric = metricByPrefix(metrics, ["query_duration", "http_req_duration{type:query}"]);
  const aggMetric = metricByPrefix(metrics, [
    "aggregate_duration",
    "http_req_duration{type:aggregate}",
  ]);

  const latencyP95Ms = Number((getPercentile(ingestMetric, "p(95)") || 0).toFixed(4));
  const queryP95Ms = Number((getPercentile(queryMetric, "p(95)") || 0).toFixed(4));
  const aggregateP95Ms = Number((getPercentile(aggMetric, "p(95)") || 0).toFixed(4));

  const consistencyPassedCount = sumMetric(metrics, "consistency_passed");
  const consistencyProbesTotal = Math.max(1, sumMetric(metrics, "consistency_probes_total"));
  const visibleRecords = sumMetric(metrics, "drain_visible_logs") || acceptedRecords;
  const healthFailedCount = sumMetric(metrics, "health_failed");

  const logsPerSecond = Number((acceptedRecords / Math.max(1, plan.durationSeconds)).toFixed(4));
  const readAfterWriteSuccessRate = Number(
    (consistencyPassedCount / consistencyProbesTotal).toFixed(4),
  );

  const consistencyPassed =
    visibleRecords >= acceptedRecords * 0.95 || readAfterWriteSuccessRate >= 0.8;

  const limitation = detectLimitation({
    targetRate: plan.offeredRate,
    achievedRate: logsPerSecond,
    droppedIterations,
    errorRate,
    latencyP95Ms,
    expectedLatencyThresholdMs: plan.latencyThreshold,
    vusMaxedOut: droppedIterations > 0,
  });

  const thresholdPassed =
    (logsPerSecond >= plan.offeredRate * 0.95 || limitation.generatorLimited) &&
    errorRate <= 0.05;

  let status: ScenarioResult["status"] =
    k6ProcessExitCode > 1
      ? "failed"
      : thresholdPassed || limitation.generatorLimited
        ? "completed"
        : errorRate > 0.1
          ? "failed"
          : "degraded";

  let recoveryMs: number | null = null;
  let serviceRecovered = true;
  if (scenarioName === "spike" || scenarioName === "breakpoint") {
    const recovery = await waitForRecovery(config.baseUrl);
    serviceRecovered = recovery.recovered;
    recoveryMs = recovery.recoveryMs;
    if (!serviceRecovered) {
      status = "failed";
    }
  }

  const requestsLost = rejectedRecords + droppedIterations * config.batchSize;
  const httpReqs = getCount(metrics.http_reqs);
  const httpErrorRate = httpReqs > 0 ? httpErrorCount / httpReqs : errorRate;
  const applicationErrorRate = httpReqs > 0 ? applicationErrorCount / httpReqs : 0;

  const phaseAccepted: Record<string, number> = {};
  for (const [key, value] of Object.entries(metrics)) {
    if (!key.startsWith("accepted_logs")) continue;
    const phase = parsePhase(key);
    if (phase) {
      phaseAccepted[phase] = (phaseAccepted[phase] || 0) + getCount(value);
    }
  }

  const phases: ScenarioPhaseResult[] = plan.phases.map((p) => {
    const accepted = phaseAccepted[p.phase] ?? 0;
    const achieved = accepted / Math.max(1, p.durationSeconds);
    const phaseLimited = detectLimitation({
      targetRate: p.targetLogsPerSecond,
      achievedRate: achieved,
      droppedIterations,
      errorRate,
      latencyP95Ms,
      expectedLatencyThresholdMs: plan.latencyThreshold,
      vusMaxedOut: droppedIterations > 0,
    });
    return {
      phase: p.phase,
      targetLogsPerSecond: p.targetLogsPerSecond,
      durationSeconds: p.durationSeconds,
      achievedLogsPerSecond: Number(achieved.toFixed(4)),
      errorRate,
      latencyP95Ms,
      acceptedRecords: accepted,
      rejectedRecords,
      droppedIterations,
      generatorLimited: phaseLimited.generatorLimited,
      serviceLimited: phaseLimited.serviceLimited,
      thresholdPassed: achieved >= p.targetLogsPerSecond * 0.95 || phaseLimited.generatorLimited,
    };
  });

  const breakpointSustainable = [...phases]
    .reverse()
    .find((p) => p.thresholdPassed && !p.serviceLimited);
  const breakpointBroken = phases.find((p) => p.serviceLimited || !p.thresholdPassed);

  return {
    scenario: scenarioName,
    status,
    logsPerSecond,
    errorRate,
    latencyP95Ms,
    queryP95Ms,
    aggregateP95Ms,
    readAfterWriteSuccessRate,
    thresholdPassed,
    consistencyPassed,
    acceptedRecords,
    rejectedRecords,
    visibleRecords,
    offeredLogsPerSecond: plan.offeredRate,
    droppedIterations,
    generatorLimited: limitation.generatorLimited,
    serviceLimited:
      limitation.serviceLimited ||
      (healthFailedCount > 0 && healthFailedCount >= sumMetric(metrics, "health_passed")),
    httpErrorRate,
    applicationErrorRate,
    recoveryMs,
    serviceRecovered,
    requestsLost,
    phases: phases.length > 1 ? phases : undefined,
    sustainableCapacityLogsPerSec:
      scenarioName === "breakpoint"
        ? breakpointSustainable?.targetLogsPerSecond
        : undefined,
    breakingPointLogsPerSec:
      scenarioName === "breakpoint" ? breakpointBroken?.targetLogsPerSecond ?? null : undefined,
  };
}
