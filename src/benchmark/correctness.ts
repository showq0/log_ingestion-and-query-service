import crypto from "node:crypto";
import type { CheckResult, CorrectnessReport } from "./types.js";

interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

interface RequestResponse {
  status: number;
  body: any;
  rawBody: string;
}

function extractQueryBody(body: any): { logs: any[]; next_cursor: string | null } {
  if (Array.isArray(body?.logs)) {
    return { logs: body.logs, next_cursor: body.next_cursor ?? null };
  }
  if (Array.isArray(body?.result?.logs)) {
    return { logs: body.result.logs, next_cursor: body.result.next_cursor ?? null };
  }
  return { logs: [], next_cursor: null };
}

async function request(
  url: string,
  options: RequestOptions = {},
  apiKey?: string,
): Promise<RequestResponse> {
  const headers: Record<string, string> = {
    ...options.headers,
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const timeoutMs = options.timeoutMs || 5000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: options.method || "GET",
      headers,
      body: options.body,
      signal: controller.signal,
    });
    const rawBody = await res.text();
    let body: any = null;
    try {
      body = JSON.parse(rawBody);
    } catch {
      body = rawBody;
    }
    return { status: res.status, body, rawBody };
  } finally {
    clearTimeout(timer);
  }
}

function makeValidLog(service: string, overrides: Record<string, any> = {}) {
  return {
    timestamp: new Date().toISOString(),
    level: "info",
    service,
    message: "correctness test log message",
    attributes: {
      environment: "test",
      version: 1,
      active: true,
    },
    ...overrides,
  };
}

async function ingest(
  baseUrl: string,
  logs: unknown[],
  apiKey?: string,
): Promise<RequestResponse> {
  return request(
    `${baseUrl}/logs`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logs }),
      timeoutMs: 30_000,
    },
    apiKey,
  );
}

async function waitForLogs(
  baseUrl: string,
  service: string,
  since: string,
  until: string,
  expectedCount: number,
  timeoutMs = 15000,
  apiKey?: string,
): Promise<any[]> {
  const deadline = Date.now() + timeoutMs;
  const url = `${baseUrl}/logs?service=${encodeURIComponent(service)}&since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}&limit=100`;

  while (Date.now() < deadline) {
    try {
      const res = await request(url, {}, apiKey);
      const { logs } = extractQueryBody(res.body);
      if (res.status === 200 && logs.length >= expectedCount) {
        return logs;
      }
    } catch {
      // Retry
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return [];
}

export async function runCorrectnessChecks(
  baseUrl: string,
  apiKey?: string,
): Promise<CorrectnessReport> {
  const checks: CheckResult[] = [];

  try {
    const res = await request(`${baseUrl}/health`, {}, apiKey);
    const passed = res.status === 200;
    checks.push({
      name: "health.status",
      passed,
      expected: "GET /health returns HTTP 200",
      actual: `HTTP status ${res.status}`,
    });
  } catch (err: any) {
    checks.push({
      name: "health.status",
      passed: false,
      expected: "GET /health returns HTTP 200",
      actual: `Error: ${err.message}`,
    });
  }

  try {
    const service = `correctness-multi-${crypto.randomUUID()}`;
    const logs = [
      makeValidLog(service, { level: "info", message: "multi-1" }),
      makeValidLog(service, { level: "debug", message: "multi-2" }),
      makeValidLog(service, { level: "warn", message: "multi-3" }),
      makeValidLog(service, { level: "error", message: "multi-4" }),
      makeValidLog(service, { level: "info", message: "multi-5" }),
    ];
    const since = new Date(Date.now() - 60_000).toISOString();
    const until = new Date(Date.now() + 60_000).toISOString();
    const res = await ingest(baseUrl, logs, apiKey);
    const stored = await waitForLogs(baseUrl, service, since, until, logs.length, 15000, apiKey);
    const messages = stored.map((l) => l.message).sort();
    const expected = logs.map((l) => l.message).sort();
    const passed =
      res.status === 200 &&
      res.body?.accepted === logs.length &&
      stored.length === logs.length &&
      new Set(stored.map((l) => l.id)).size === logs.length &&
      JSON.stringify(messages) === JSON.stringify(expected);
    checks.push({
      name: "ingestion.multiple",
      passed,
      expected: "all submitted logs are stored with no missing or duplicate records",
      actual: `accepted=${res.body?.accepted} visible=${stored.length} unique=${new Set(stored.map((l) => l.id)).size}`,
    });
  } catch (err: any) {
    checks.push({
      name: "ingestion.multiple",
      passed: false,
      expected: "all submitted logs are stored with no missing or duplicate records",
      actual: `Error: ${err.message}`,
    });
  }

  try {
    const service = `correctness-partial-${crypto.randomUUID()}`;
    const validLog = makeValidLog(service);
    const invalidLog = { ...makeValidLog(service), level: "critical" };
    const res = await ingest(baseUrl, [validLog, invalidLog], apiKey);
    const passed =
      res.status === 200 &&
      res.body?.accepted === 1 &&
      Array.isArray(res.body?.rejected) &&
      res.body.rejected.length === 1 &&
      res.body.rejected[0]?.index === 1;
    checks.push({
      name: "ingestion.partial-invalid",
      passed,
      expected: "invalid entries are reported without accepting them",
      actual: `HTTP status ${res.status} accepted=${res.body?.accepted} rejected=${res.body?.rejected?.length}`,
    });
  } catch (err: any) {
    checks.push({
      name: "ingestion.partial-invalid",
      passed: false,
      expected: "invalid entries are reported without accepting them",
      actual: `Error: ${err.message}`,
    });
  }

  try {
    const res = await ingest(baseUrl, [], apiKey);
    const passed = res.status === 400;
    checks.push({
      name: "ingestion.empty",
      passed,
      expected: "an empty batch is rejected with a client error",
      actual: `HTTP status ${res.status}`,
    });
  } catch (err: any) {
    checks.push({
      name: "ingestion.empty",
      passed: false,
      expected: "an empty batch is rejected with a client error",
      actual: `Error: ${err.message}`,
    });
  }

  try {
    const res = await request(
      `${baseUrl}/logs`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"logs":[',
      },
      apiKey,
    );
    const passed = res.status === 400;
    checks.push({
      name: "ingestion.malformed-json",
      passed,
      expected: "malformed JSON is rejected with HTTP 400",
      actual: `HTTP status ${res.status}`,
    });
  } catch (err: any) {
    checks.push({
      name: "ingestion.malformed-json",
      passed: false,
      expected: "malformed JSON is rejected with HTTP 400",
      actual: `Error: ${err.message}`,
    });
  }

  try {
    const service = `correctness-range-${crypto.randomUUID()}`;
    const inRange = new Date(Date.now() - 30_000);
    const outOfRange = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const since = new Date(inRange.getTime() - 10_000).toISOString();
    const until = new Date(inRange.getTime() + 10_000).toISOString();
    await ingest(
      baseUrl,
      [
        makeValidLog(service, { timestamp: inRange.toISOString(), message: "in-range" }),
        makeValidLog(service, { timestamp: outOfRange.toISOString(), message: "out-of-range" }),
      ],
      apiKey,
    );
    await waitForLogs(baseUrl, service, new Date(outOfRange.getTime() - 10_000).toISOString(), new Date().toISOString(), 2, 15000, apiKey);
    const res = await request(
      `${baseUrl}/logs?service=${encodeURIComponent(service)}&since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}&limit=100`,
      {},
      apiKey,
    );
    const { logs } = extractQueryBody(res.body);
    const passed =
      res.status === 200 &&
      logs.length === 1 &&
      logs[0]?.message === "in-range";
    checks.push({
      name: "query.time-range",
      passed,
      expected: "only logs within the requested time range are returned",
      actual: `HTTP status ${res.status} count=${logs.length}`,
    });
  } catch (err: any) {
    checks.push({
      name: "query.time-range",
      passed: false,
      expected: "only logs within the requested time range are returned",
      actual: `Error: ${err.message}`,
    });
  }

  try {
    const service = `correctness-limit-${crypto.randomUUID()}`;
    const since = new Date(Date.now() - 60_000).toISOString();
    const until = new Date(Date.now() + 60_000).toISOString();
    const logs = Array.from({ length: 8 }, (_, i) =>
      makeValidLog(service, { message: `limit-log-${i}` }),
    );
    await ingest(baseUrl, logs, apiKey);
    await waitForLogs(baseUrl, service, since, until, 8, 15000, apiKey);
    const res = await request(
      `${baseUrl}/logs?service=${encodeURIComponent(service)}&since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}&limit=3`,
      {},
      apiKey,
    );
    const page = extractQueryBody(res.body);
    const passed = res.status === 200 && page.logs.length === 3;
    checks.push({
      name: "query.limit",
      passed,
      expected: "the API returns no more than the requested number of logs",
      actual: `HTTP status ${res.status} count=${page.logs.length}`,
    });
  } catch (err: any) {
    checks.push({
      name: "query.limit",
      passed: false,
      expected: "the API returns no more than the requested number of logs",
      actual: `Error: ${err.message}`,
    });
  }

  try {
    const testId = crypto.randomUUID();
    const service = `pagination-cursor-${testId}`;
    const baseTime = Date.now() - 40_000;
    const since = new Date(baseTime - 60_000).toISOString();
    const until = new Date(baseTime + 120_000).toISOString();
    const logs = [0, 1, 2, 3, 4].map((i) =>
      makeValidLog(service, {
        timestamp: new Date(baseTime + i * 1000).toISOString(),
        message: `cursor-log-${i}-${testId}`,
        attributes: { testId },
      }),
    );
    await ingest(baseUrl, logs, apiKey);
    await waitForLogs(baseUrl, service, since, until, 5, 15000, apiKey);

    const collectedLogs: any[] = [];
    let cursor: string | null = null;
    let iterations = 0;
    while (iterations < 10) {
      iterations++;
      let url = `${baseUrl}/logs?service=${encodeURIComponent(service)}&since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}&limit=2`;
      if (cursor) {
        url += `&cursor=${encodeURIComponent(cursor)}`;
      }
      const res = await request(url, {}, apiKey);
      const page = extractQueryBody(res.body);
      if (res.status !== 200) break;
      collectedLogs.push(...page.logs);
      cursor = page.next_cursor;
      if (!cursor) break;
    }

    const uniqueIds = new Set(collectedLogs.map((l) => l.id));
    const passed =
      collectedLogs.length === 5 &&
      uniqueIds.size === 5 &&
      cursor === null;
    checks.push({
      name: "pagination.cursor",
      passed,
      expected: "cursor pages have no gaps or duplicates",
      actual: `collected=${collectedLogs.length} unique=${uniqueIds.size} next_cursor=${cursor}`,
    });
  } catch (err: any) {
    checks.push({
      name: "pagination.cursor",
      passed: false,
      expected: "cursor pages have no gaps or duplicates",
      actual: `Error: ${err.message}`,
    });
  }

  try {
    const testId = crypto.randomUUID();
    const service = `query-level-${testId}`;
    const timestamp = new Date(Date.now() - 30_000);
    const since = new Date(timestamp.getTime() - 60_000).toISOString();
    const until = new Date(timestamp.getTime() + 60_000).toISOString();
    await ingest(
      baseUrl,
      [
        makeValidLog(service, { timestamp: timestamp.toISOString(), level: "error", message: "level-error" }),
        makeValidLog(service, { timestamp: timestamp.toISOString(), level: "info", message: "level-info" }),
      ],
      apiKey,
    );
    await waitForLogs(baseUrl, service, since, until, 2, 15000, apiKey);
    const res = await request(
      `${baseUrl}/logs?service=${encodeURIComponent(service)}&level=error&since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}`,
      {},
      apiKey,
    );
    const { logs } = extractQueryBody(res.body);
    const passed =
      res.status === 200 &&
      logs.length === 1 &&
      logs[0]?.level === "error";
    checks.push({
      name: "query.level-filter",
      passed,
      expected: "only logs matching the requested log level are returned",
      actual: `HTTP status ${res.status} count=${logs.length} level=${logs[0]?.level}`,
    });
  } catch (err: any) {
    checks.push({
      name: "query.level-filter",
      passed: false,
      expected: "only logs matching the requested log level are returned",
      actual: `Error: ${err.message}`,
    });
  }

  try {
    const suffix = crypto.randomUUID();
    const keep = `query-service-keep-${suffix}`;
    const drop = `query-service-drop-${suffix}`;
    const timestamp = new Date(Date.now() - 30_000);
    const since = new Date(timestamp.getTime() - 60_000).toISOString();
    const until = new Date(timestamp.getTime() + 60_000).toISOString();
    await ingest(
      baseUrl,
      [
        makeValidLog(keep, { timestamp: timestamp.toISOString(), message: "keep-service" }),
        makeValidLog(drop, { timestamp: timestamp.toISOString(), message: "drop-service" }),
      ],
      apiKey,
    );
    await waitForLogs(baseUrl, keep, since, until, 1, 15000, apiKey);
    const res = await request(
      `${baseUrl}/logs?service=${encodeURIComponent(keep)}&since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}`,
      {},
      apiKey,
    );
    const { logs } = extractQueryBody(res.body);
    const passed =
      res.status === 200 &&
      logs.length >= 1 &&
      logs.every((l) => l.service === keep);
    checks.push({
      name: "query.service-filter",
      passed,
      expected: "only logs belonging to the requested service are returned",
      actual: `HTTP status ${res.status} count=${logs.length}`,
    });
  } catch (err: any) {
    checks.push({
      name: "query.service-filter",
      passed: false,
      expected: "only logs belonging to the requested service are returned",
      actual: `Error: ${err.message}`,
    });
  }

  try {
    const testId = crypto.randomUUID();
    const service = `aggregate-buckets-${testId}`;
    const t1 = new Date(Date.now() - 120_000);
    const t2 = new Date(Date.now() - 30_000);
    const since = new Date(t1.getTime() - 60_000).toISOString();
    const until = new Date(t2.getTime() + 60_000).toISOString();
    await ingest(
      baseUrl,
      [
        makeValidLog(service, { timestamp: t1.toISOString(), attributes: { testId } }),
        makeValidLog(service, { timestamp: t1.toISOString(), attributes: { testId } }),
        makeValidLog(service, { timestamp: t2.toISOString(), attributes: { testId } }),
      ],
      apiKey,
    );
    await waitForLogs(baseUrl, service, since, until, 3, 15000, apiKey);
    const res = await request(
      `${baseUrl}/logs/aggregate?service=${encodeURIComponent(service)}&since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}&bucket=1m&attr.testId=${encodeURIComponent(testId)}`,
      {},
      apiKey,
    );
    const buckets = Array.isArray(res.body?.buckets) ? res.body.buckets : [];
    const totalCount = buckets.reduce((acc: number, b: any) => acc + Number(b.count || 0), 0);
    const passed = res.status === 200 && totalCount === 3 && buckets.length >= 1;
    checks.push({
      name: "aggregate.buckets",
      passed,
      expected: "aggregated counts match the actual logs in each requested time bucket",
      actual: `HTTP status ${res.status} buckets=${buckets.length} total=${totalCount}`,
    });
  } catch (err: any) {
    checks.push({
      name: "aggregate.buckets",
      passed: false,
      expected: "aggregated counts match the actual logs in each requested time bucket",
      actual: `Error: ${err.message}`,
    });
  }

  try {
    const testId = crypto.randomUUID();
    const service = `aggregate-grouping-${testId}`;
    const timestamp = new Date(Date.now() - 30_000);
    const since = new Date(timestamp.getTime() - 60_000).toISOString();
    const until = new Date(timestamp.getTime() + 60_000).toISOString();
    await ingest(
      baseUrl,
      [
        makeValidLog(service, { timestamp: timestamp.toISOString(), level: "error", attributes: { testId } }),
        makeValidLog(service, { timestamp: timestamp.toISOString(), level: "error", attributes: { testId } }),
        makeValidLog(service, { timestamp: timestamp.toISOString(), level: "info", attributes: { testId } }),
      ],
      apiKey,
    );
    await waitForLogs(baseUrl, service, since, until, 3, 15000, apiKey);
    const res = await request(
      `${baseUrl}/logs/aggregate?service=${encodeURIComponent(service)}&since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}&bucket=1m&group_by=level&attr.testId=${encodeURIComponent(testId)}`,
      {},
      apiKey,
    );
    const groups: Record<string, number> = {};
    if (Array.isArray(res.body?.buckets)) {
      for (const b of res.body.buckets) {
        groups[b.group] = (groups[b.group] || 0) + Number(b.count || 0);
      }
    }
    const passed = res.status === 200 && groups["error"] === 2 && groups["info"] === 1;
    checks.push({
      name: "aggregate.grouping",
      passed,
      expected: "service and level grouping is supported",
      actual: `HTTP status ${res.status} groups=${JSON.stringify(groups)}`,
    });
  } catch (err: any) {
    checks.push({
      name: "aggregate.grouping",
      passed: false,
      expected: "service and level grouping is supported",
      actual: `Error: ${err.message}`,
    });
  }

  const passedCount = checks.filter((c) => c.passed).length;
  const totalCount = checks.length;

  return {
    passed: passedCount,
    total: totalCount,
    cap: passedCount === totalCount ? null : 75,
    checks,
  };
}
