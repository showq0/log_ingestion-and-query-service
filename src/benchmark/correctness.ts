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
      if (res.status === 200 && Array.isArray(res.body?.logs)) {
        if (res.body.logs.length >= expectedCount) {
          return res.body.logs;
        }
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

  // 1. health.status
  try {
    const res = await request(`${baseUrl}/health`, {}, apiKey);
    const passed =
      res.status === 200 &&
      res.body?.status === "healthy" &&
      res.body?.dependencies?.postgres === "up";
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

  // 2. ingestion.single
  try {
    const service = `correctness-single-${crypto.randomUUID()}`;
    const log = makeValidLog(service);
    const res = await request(
      `${baseUrl}/logs`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logs: [log] }),
      },
      apiKey,
    );
    const passed =
      res.status === 200 &&
      res.body?.accepted === 1 &&
      Array.isArray(res.body?.rejected) &&
      res.body.rejected.length === 0;
    checks.push({
      name: "ingestion.single",
      passed,
      expected: "a valid log is accepted",
      actual: `HTTP status ${res.status}`,
    });
  } catch (err: any) {
    checks.push({
      name: "ingestion.single",
      passed: false,
      expected: "a valid log is accepted",
      actual: `Error: ${err.message}`,
    });
  }

  // 3. ingestion.batch
  try {
    const service = `correctness-batch-${crypto.randomUUID()}`;
    const logs = [
      makeValidLog(service, { level: "info" }),
      makeValidLog(service, { level: "debug" }),
      makeValidLog(service, { level: "warn" }),
      makeValidLog(service, { level: "error" }),
      makeValidLog(service, { level: "info" }),
    ];
    const res = await request(
      `${baseUrl}/logs`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logs }),
      },
      apiKey,
    );
    const passed =
      res.status === 200 &&
      res.body?.accepted === logs.length &&
      Array.isArray(res.body?.rejected) &&
      res.body.rejected.length === 0;
    checks.push({
      name: "ingestion.batch",
      passed,
      expected: "a valid batch is accepted",
      actual: `HTTP status ${res.status}`,
    });
  } catch (err: any) {
    checks.push({
      name: "ingestion.batch",
      passed: false,
      expected: "a valid batch is accepted",
      actual: `Error: ${err.message}`,
    });
  }

  // 4. ingestion.partial-invalid
  try {
    const service = `correctness-partial-${crypto.randomUUID()}`;
    const validLog = makeValidLog(service);
    const invalidLog = { ...makeValidLog(service), level: "critical" }; // invalid level
    const res = await request(
      `${baseUrl}/logs`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logs: [validLog, invalidLog] }),
      },
      apiKey,
    );
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
      actual: `HTTP status ${res.status}`,
    });
  } catch (err: any) {
    checks.push({
      name: "ingestion.partial-invalid",
      passed: false,
      expected: "invalid entries are reported without accepting them",
      actual: `Error: ${err.message}`,
    });
  }

  // 5. ingestion.empty
  try {
    const res = await request(
      `${baseUrl}/logs`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logs: [] }),
      },
      apiKey,
    );
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

  // 6. ingestion.malformed-json
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
      expected: "malformed JSON is rejected with a client error",
      actual: `HTTP status ${res.status}`,
    });
  } catch (err: any) {
    checks.push({
      name: "ingestion.malformed-json",
      passed: false,
      expected: "malformed JSON is rejected with a client error",
      actual: `Error: ${err.message}`,
    });
  }

  // 7. query.unfiltered
  try {
    const res = await request(`${baseUrl}/logs?limit=10`, {}, apiKey);
    const passed =
      res.status === 200 &&
      Array.isArray(res.body?.logs) &&
      res.body.hasOwnProperty("next_cursor");
    checks.push({
      name: "query.unfiltered",
      passed,
      expected: "stored logs can be listed",
      actual: `HTTP status ${res.status}`,
    });
  } catch (err: any) {
    checks.push({
      name: "query.unfiltered",
      passed: false,
      expected: "stored logs can be listed",
      actual: `Error: ${err.message}`,
    });
  }

  // 8. query.filters
  try {
    const testId = crypto.randomUUID();
    const service = `query-filters-${testId}`;
    const timestamp = new Date(Date.now() - 30_000);
    const since = new Date(timestamp.getTime() - 60_000).toISOString();
    const until = new Date(timestamp.getTime() + 60_000).toISOString();

    const logs = [
      makeValidLog(service, {
        timestamp: timestamp.toISOString(),
        level: "error",
        message: `payment failed ${testId}`,
        attributes: { testId, region: "eu-west" },
      }),
      makeValidLog(service, {
        timestamp: timestamp.toISOString(),
        level: "info",
        message: `payment accepted ${testId}`,
        attributes: { testId, region: "eu-west" },
      }),
    ];

    await request(
      `${baseUrl}/logs`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logs }),
      },
      apiKey,
    );

    await waitForLogs(baseUrl, service, since, until, 2, 10000, apiKey);

    const queryUrl =
      `${baseUrl}/logs?service=${encodeURIComponent(service)}` +
      `&level=error` +
      `&since=${encodeURIComponent(since)}` +
      `&until=${encodeURIComponent(until)}` +
      `&attr.testId=${encodeURIComponent(testId)}` +
      `&q=${encodeURIComponent("payment failed")}`;

    const res = await request(queryUrl, {}, apiKey);
    const passed =
      res.status === 200 &&
      Array.isArray(res.body?.logs) &&
      res.body.logs.length === 1 &&
      res.body.logs[0]?.level === "error" &&
      res.body.logs[0]?.attributes?.testId === testId;

    checks.push({
      name: "query.filters",
      passed,
      expected: "service and level filters are applied",
      actual: `HTTP status ${res.status}`,
    });
  } catch (err: any) {
    checks.push({
      name: "query.filters",
      passed: false,
      expected: "service and level filters are applied",
      actual: `Error: ${err.message}`,
    });
  }

  // 9. query.invalid-parameters
  try {
    const invalidUrls = [
      `${baseUrl}/logs?limit=0`,
      `${baseUrl}/logs?limit=1001`,
      `${baseUrl}/logs?since=invalid-date`,
    ];
    let allFailedAs400 = true;
    for (const u of invalidUrls) {
      const res = await request(u, {}, apiKey);
      if (res.status !== 400) {
        allFailedAs400 = false;
        break;
      }
    }
    checks.push({
      name: "query.invalid-parameters",
      passed: allFailedAs400,
      expected: "invalid query parameters return a client error",
      actual: allFailedAs400 ? "HTTP status 400" : "Invalid status returned",
    });
  } catch (err: any) {
    checks.push({
      name: "query.invalid-parameters",
      passed: false,
      expected: "invalid query parameters return a client error",
      actual: `Error: ${err.message}`,
    });
  }

  // 10. pagination.stable-order
  try {
    const testId = crypto.randomUUID();
    const service = `pagination-order-${testId}`;
    const testTimestamp = new Date(Date.now() - 30_000);
    const isoTime = testTimestamp.toISOString();
    const since = new Date(testTimestamp.getTime() - 60_000).toISOString();
    const until = new Date(testTimestamp.getTime() + 60_000).toISOString();

    const logs = [1, 2, 3].map((num) =>
      makeValidLog(service, {
        timestamp: isoTime,
        message: `order-log-${num}-${testId}`,
        attributes: { testId },
      }),
    );

    await request(
      `${baseUrl}/logs`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logs }),
      },
      apiKey,
    );

    await waitForLogs(baseUrl, service, since, until, 3, 10000, apiKey);

    const queryUrl = `${baseUrl}/logs?service=${encodeURIComponent(service)}&since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}&limit=10`;
    const res1 = await request(queryUrl, {}, apiKey);
    const res2 = await request(queryUrl, {}, apiKey);

    const ids1 = res1.body?.logs?.map((l: any) => l.id) || [];
    const ids2 = res2.body?.logs?.map((l: any) => l.id) || [];

    const passed =
      res1.status === 200 &&
      ids1.length === 3 &&
      JSON.stringify(ids1) === JSON.stringify(ids2) &&
      ids1[0] > ids1[1] &&
      ids1[1] > ids1[2];

    checks.push({
      name: "pagination.stable-order",
      passed,
      expected: "results have deterministic ordering",
      actual: `HTTP status ${res1.status}`,
    });
  } catch (err: any) {
    checks.push({
      name: "pagination.stable-order",
      passed: false,
      expected: "results have deterministic ordering",
      actual: `Error: ${err.message}`,
    });
  }

  // 11. pagination.cursor
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

    await request(
      `${baseUrl}/logs`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logs }),
      },
      apiKey,
    );

    await waitForLogs(baseUrl, service, since, until, 5, 10000, apiKey);

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
      if (res.status !== 200 || !Array.isArray(res.body?.logs)) break;
      collectedLogs.push(...res.body.logs);
      cursor = res.body.next_cursor;
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
      actual: `HTTP status 200`,
    });
  } catch (err: any) {
    checks.push({
      name: "pagination.cursor",
      passed: false,
      expected: "cursor pages have no gaps or duplicates",
      actual: `Error: ${err.message}`,
    });
  }

  // 12. pagination.invalid-cursor
  try {
    const res = await request(
      `${baseUrl}/logs?cursor=invalid-cursor-token-123`,
      {},
      apiKey,
    );
    const passed = res.status === 400;
    checks.push({
      name: "pagination.invalid-cursor",
      passed,
      expected: "invalid cursors return a client error",
      actual: `HTTP status ${res.status}`,
    });
  } catch (err: any) {
    checks.push({
      name: "pagination.invalid-cursor",
      passed: false,
      expected: "invalid cursors return a client error",
      actual: `Error: ${err.message}`,
    });
  }

  // 13. aggregate.buckets
  try {
    const testId = crypto.randomUUID();
    const service = `aggregate-buckets-${testId}`;
    const timestamp = new Date(Date.now() - 30_000);
    const since = new Date(timestamp.getTime() - 60_000).toISOString();
    const until = new Date(timestamp.getTime() + 60_000).toISOString();

    const logs = [
      makeValidLog(service, { timestamp: timestamp.toISOString(), attributes: { testId } }),
      makeValidLog(service, { timestamp: timestamp.toISOString(), attributes: { testId } }),
      makeValidLog(service, { timestamp: timestamp.toISOString(), attributes: { testId } }),
    ];

    await request(
      `${baseUrl}/logs`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logs }),
      },
      apiKey,
    );

    await waitForLogs(baseUrl, service, since, until, 3, 10000, apiKey);

    const aggUrl = `${baseUrl}/logs/aggregate?service=${encodeURIComponent(service)}&since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}&bucket=1m&attr.testId=${encodeURIComponent(testId)}`;
    const res = await request(aggUrl, {}, apiKey);

    const totalCount =
      Array.isArray(res.body?.buckets)
        ? res.body.buckets.reduce((acc: number, b: any) => acc + Number(b.count || 0), 0)
        : 0;

    const passed =
      res.status === 200 &&
      Array.isArray(res.body?.buckets) &&
      res.body.buckets.length >= 1 &&
      totalCount === 3;

    checks.push({
      name: "aggregate.buckets",
      passed,
      expected: "time buckets contain correct counts",
      actual: `HTTP status ${res.status}`,
    });
  } catch (err: any) {
    checks.push({
      name: "aggregate.buckets",
      passed: false,
      expected: "time buckets contain correct counts",
      actual: `Error: ${err.message}`,
    });
  }

  // 14. aggregate.grouping
  try {
    const testId = crypto.randomUUID();
    const service = `aggregate-grouping-${testId}`;
    const timestamp = new Date(Date.now() - 30_000);
    const since = new Date(timestamp.getTime() - 60_000).toISOString();
    const until = new Date(timestamp.getTime() + 60_000).toISOString();

    const logs = [
      makeValidLog(service, { timestamp: timestamp.toISOString(), level: "error", attributes: { testId } }),
      makeValidLog(service, { timestamp: timestamp.toISOString(), level: "error", attributes: { testId } }),
      makeValidLog(service, { timestamp: timestamp.toISOString(), level: "info", attributes: { testId } }),
    ];

    await request(
      `${baseUrl}/logs`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logs }),
      },
      apiKey,
    );

    await waitForLogs(baseUrl, service, since, until, 3, 10000, apiKey);

    const aggUrl = `${baseUrl}/logs/aggregate?service=${encodeURIComponent(service)}&since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}&bucket=1m&group_by=level&attr.testId=${encodeURIComponent(testId)}`;
    const res = await request(aggUrl, {}, apiKey);

    const groups: Record<string, number> = {};
    if (Array.isArray(res.body?.buckets)) {
      for (const b of res.body.buckets) {
        groups[b.group] = (groups[b.group] || 0) + Number(b.count || 0);
      }
    }

    const passed =
      res.status === 200 &&
      groups["error"] === 2 &&
      groups["info"] === 1;

    checks.push({
      name: "aggregate.grouping",
      passed,
      expected: "service and level grouping is supported",
      actual: `HTTP status ${res.status}`,
    });
  } catch (err: any) {
    checks.push({
      name: "aggregate.grouping",
      passed: false,
      expected: "service and level grouping is supported",
      actual: `Error: ${err.message}`,
    });
  }

  // 15. aggregate.invalid-options
  try {
    const invalidAggUrls = [
      `${baseUrl}/logs/aggregate?bucket=invalid`,
      `${baseUrl}/logs/aggregate?since=2026-07-20T14:00:00Z`, // missing until and bucket
    ];
    let allFailedAs400 = true;
    for (const u of invalidAggUrls) {
      const res = await request(u, {}, apiKey);
      if (res.status !== 400) {
        allFailedAs400 = false;
        break;
      }
    }
    checks.push({
      name: "aggregate.invalid-options",
      passed: allFailedAs400,
      expected: "invalid aggregation options return a client error",
      actual: allFailedAs400 ? "HTTP status 400" : "Invalid status returned",
    });
  } catch (err: any) {
    checks.push({
      name: "aggregate.invalid-options",
      passed: false,
      expected: "invalid aggregation options return a client error",
      actual: `Error: ${err.message}`,
    });
  }

  const passedCount = checks.filter((c) => c.passed).length;
  const totalCount = checks.length;

  return {
    passed: passedCount,
    total: totalCount,
    cap: passedCount === totalCount ? null : passedCount < 15 ? 75 : null,
    checks,
  };
}
