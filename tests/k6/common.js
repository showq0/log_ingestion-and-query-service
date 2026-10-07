import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";
import exec from "k6/execution";

export const BASE_URL = (__ENV.BASE_URL || "http://127.0.0.1:8080").replace(/\/+$/, "");
export const BATCH_SIZE = Number(__ENV.BATCH_SIZE || 100);
export const DURATION_SCALE = Number(__ENV.DURATION_SCALE || 1.0);
export const RUN_ID = __ENV.RUN_ID || `run-${Date.now()}`;
export const AUTH_ENABLED = __ENV.AUTH_ENABLED === "true";
export const API_KEY = __ENV.LOADGEN_API_KEY || "";
export const DRAIN_TIMEOUT_SECONDS = Number(__ENV.DRAIN_TIMEOUT_SECONDS || 30);

export const acceptedLogs = new Counter("accepted_logs");
export const rejectedLogs = new Counter("rejected_logs");
export const httpErrors = new Counter("http_errors");
export const applicationErrors = new Counter("application_errors");
export const ingestDuration = new Trend("ingest_duration", true);
export const queryDuration = new Trend("query_duration", true);
export const aggregateDuration = new Trend("aggregate_duration", true);
export const consistencyPassed = new Counter("consistency_passed");
export const consistencyProbesTotal = new Counter("consistency_probes_total");
export const drainPassed = new Counter("drain_passed");
export const drainVisibleLogs = new Counter("drain_visible_logs");
export const healthPassed = new Counter("health_passed");
export const healthFailed = new Counter("health_failed");

const SERVICES = ["checkout", "payments", "auth", "orders", "users", "api"];
const LEVELS = ["debug", "info", "warn", "error"];
const MESSAGES = [
  "payment declined",
  "payment processed",
  "order created",
  "user authenticated",
  "database query completed",
  "cache hit",
  "request completed",
  "connection pool acquired",
  "token verification succeeded",
  "session refreshed",
];
const REGIONS = ["eu-west", "us-east", "us-west", "ap-south", "eu-central"];

export function scaled(seconds) {
  return Math.max(2, Math.round(seconds * DURATION_SCALE));
}

export function arrivalRate(logsPerSecond) {
  return Math.max(1, Math.round(logsPerSecond / BATCH_SIZE));
}

export function vuBudget(rate) {
  // The generator is capped at 1 GiB (see benchmark spec). k6 keeps a completed
  // scenario's VUs allocated until the whole test ends, so multi-phase scenarios
  // (stress = 3 ingest phases, breakpoint = 4) accumulate VUs across phases.
  // The caps below bound total VUs so peak memory stays within the 1 GiB budget
  // instead of being OOM-killed; shortfalls surface as dropped iterations and are
  // reported via generatorLimited rather than crashing the run.
  const preAllocatedVUs = Math.min(100, Math.max(20, rate));
  const maxVUs = Math.min(180, Math.max(60, rate * 2));
  return { preAllocatedVUs, maxVUs };
}

export function ingestScenario(name, logsPerSecond, durationSec, startTimeSec = 0) {
  const rate = arrivalRate(logsPerSecond);
  const vus = vuBudget(rate);
  return {
    executor: "constant-arrival-rate",
    exec: "ingest",
    rate,
    timeUnit: "1s",
    duration: `${durationSec}s`,
    startTime: `${startTimeSec}s`,
    preAllocatedVUs: vus.preAllocatedVUs,
    maxVUs: vus.maxVUs,
    gracefulStop: "5s",
    tags: { phase: name, type: "ingest" },
  };
}

export function queryScenario(durationSec) {
  return {
    executor: "constant-arrival-rate",
    exec: "query",
    rate: 2,
    timeUnit: "1s",
    duration: `${durationSec}s`,
    preAllocatedVUs: 2,
    maxVUs: 10,
    gracefulStop: "5s",
    tags: { type: "query" },
  };
}

export function aggregateScenario(durationSec) {
  return {
    executor: "constant-arrival-rate",
    exec: "aggregate",
    rate: 1,
    timeUnit: "1s",
    duration: `${durationSec}s`,
    preAllocatedVUs: 1,
    maxVUs: 5,
    gracefulStop: "5s",
    tags: { type: "aggregate" },
  };
}

export function healthScenario(durationSec) {
  return {
    executor: "constant-vus",
    exec: "health",
    vus: 1,
    duration: `${durationSec}s`,
    gracefulStop: "5s",
    tags: { type: "health" },
  };
}

export function probeScenario(durationSec) {
  return {
    executor: "constant-arrival-rate",
    exec: "probe",
    rate: 1,
    timeUnit: "1s",
    duration: `${durationSec}s`,
    preAllocatedVUs: 1,
    maxVUs: 4,
    gracefulStop: "5s",
    tags: { type: "probe" },
  };
}

function getHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (AUTH_ENABLED && API_KEY) {
    headers["Authorization"] = `Bearer ${API_KEY}`;
  }
  return headers;
}

function phaseTags(type) {
  const phase = exec.scenario ? exec.scenario.name : "unknown";
  return { phase, type };
}

export function generateLogBatch(size = BATCH_SIZE, now = Date.now()) {
  const logs = new Array(size);
  for (let i = 0; i < size; i++) {
    const ts = new Date(now - i * 10);
    logs[i] = {
      timestamp: ts.toISOString(),
      level: LEVELS[(i + Math.floor(Math.random() * 4)) % LEVELS.length],
      service: SERVICES[(i + Math.floor(Math.random() * 6)) % SERVICES.length],
      message: `${MESSAGES[i % MESSAGES.length]} [vu=${__VU} iter=${__ITER} i=${i}]`,
      attributes: {
        user_id: String((__VU * 10000 + i) % 100000),
        region: REGIONS[i % REGIONS.length],
        retries: i % 4,
        run_id: RUN_ID,
      },
    };
  }
  return logs;
}

export function ingest() {
  ingestLogs();
}

export function ingestLogs(size = BATCH_SIZE) {
  const logs = generateLogBatch(size);
  const payload = JSON.stringify({ logs });
  const headers = getHeaders();
  const tags = phaseTags("ingest");

  const res = http.post(`${BASE_URL}/logs`, payload, {
    headers,
    tags,
    timeout: "30s",
  });

  ingestDuration.add(res.timings.duration, tags);

  let accepted = 0;
  let rejected = 0;

  if (res.status === 200) {
    try {
      const data = res.json();
      accepted = typeof data.accepted === "number" ? data.accepted : size;
      rejected = Array.isArray(data.rejected) ? data.rejected.length : 0;
    } catch (_) {
      accepted = size;
    }
  } else {
    rejected = size;
    if (res.status === 0 || res.status >= 500) {
      httpErrors.add(1, tags);
    } else {
      applicationErrors.add(1, tags);
    }
  }

  acceptedLogs.add(accepted, tags);
  if (rejected > 0) {
    rejectedLogs.add(rejected, tags);
    if (res.status === 200) {
      applicationErrors.add(1, tags);
    }
  }

  check(res, {
    "ingest status is 200": (r) => r.status === 200,
  });
}

export function query() {
  queryLogs();
}

export function queryLogs() {
  const until = new Date();
  const since = new Date(until.getTime() - 30 * 24 * 60 * 60 * 1000);
  const headers = getHeaders();
  const tags = { type: "query" };
  const url = `${BASE_URL}/logs?since=${encodeURIComponent(since.toISOString())}&until=${encodeURIComponent(until.toISOString())}&limit=50`;

  const res = http.get(url, {
    headers,
    tags,
    timeout: "15s",
  });

  queryDuration.add(res.timings.duration, tags);
  if (res.status !== 200) {
    if (res.status === 0 || res.status >= 500) httpErrors.add(1, tags);
    else applicationErrors.add(1, tags);
  }

  check(res, {
    "query status is 200": (r) => r.status === 200,
  });
}

export function aggregate() {
  queryAggregate();
}

export function queryAggregate() {
  const until = new Date();
  const since = new Date(until.getTime() - 30 * 24 * 60 * 60 * 1000);
  const headers = getHeaders();
  const tags = { type: "aggregate" };

  const url = `${BASE_URL}/logs/aggregate?since=${encodeURIComponent(
    since.toISOString(),
  )}&until=${encodeURIComponent(until.toISOString())}&bucket=1h&group_by=service`;

  const res = http.get(url, {
    headers,
    tags,
    timeout: "15s",
  });

  aggregateDuration.add(res.timings.duration, tags);
  if (res.status !== 200) {
    if (res.status === 0 || res.status >= 500) httpErrors.add(1, tags);
    else applicationErrors.add(1, tags);
  }

  check(res, {
    "aggregate status is 200": (r) => r.status === 200,
  });
}

export function health() {
  healthCheck();
}

export function healthCheck() {
  const headers = getHeaders();
  const tags = { type: "health" };
  const res = http.get(`${BASE_URL}/health`, { headers, tags, timeout: "5s" });
  if (res.status === 200) {
    healthPassed.add(1, tags);
  } else {
    healthFailed.add(1, tags);
  }
}

export function probe() {
  checkConsistencyProbe();
}

export function checkConsistencyProbe() {
  const probeId = `probe-${RUN_ID}-${__VU}-${Date.now()}`;
  const now = new Date();
  const probeLog = {
    timestamp: now.toISOString(),
    level: "info",
    service: "consistency-probe",
    message: probeId,
    attributes: { probe_id: probeId, run_id: RUN_ID },
  };

  const headers = getHeaders();
  const writeRes = http.post(`${BASE_URL}/logs`, JSON.stringify({ logs: [probeLog] }), {
    headers,
    tags: { type: "probe_write" },
    timeout: "10s",
  });

  consistencyProbesTotal.add(1);

  if (writeRes.status === 200) {
    const queryUrl = `${BASE_URL}/logs?service=consistency-probe&q=${encodeURIComponent(probeId)}&limit=5`;
    const readRes = http.get(queryUrl, { headers, tags: { type: "probe_read" }, timeout: "10s" });
    let found = false;
    if (readRes.status === 200) {
      try {
        const body = readRes.json();
        const logs = body.logs || body.result?.logs || [];
        found = logs.some((l) => l.message === probeId);
      } catch (_) {}
    }
    if (found) {
      consistencyPassed.add(1);
    }
  }
}

export function drainAfterScenario() {
  const headers = getHeaders();
  const until = new Date(Date.now() + 60_000).toISOString();
  const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const url = `${BASE_URL}/logs/aggregate?since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}&bucket=1d&attr.run_id=${encodeURIComponent(RUN_ID)}`;

  let visible = 0;
  for (let i = 0; i < DRAIN_TIMEOUT_SECONDS; i++) {
    const res = http.get(url, { headers, tags: { type: "drain" }, timeout: "15s" });
    if (res.status === 200) {
      try {
        const body = res.json();
        const buckets = body.buckets || [];
        visible = buckets.reduce((sum, b) => sum + Number(b.count || 0), 0);
        if (visible > 0) {
          break;
        }
      } catch (_) {}
    }
    sleep(1);
  }

  drainVisibleLogs.add(visible);
  if (visible > 0) {
    drainPassed.add(1);
  }
}

export function teardown() {
  drainAfterScenario();
}
