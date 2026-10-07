import type { SeedResult } from "./types.js";

// Deterministic Mulberry32 PRNG
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SERVICES = [
  "checkout",
  "payment",
  "auth",
  "order",
  "inventory",
  "gateway",
  "notification",
  "analytics",
];

const LEVELS = [
  "info",
  "info",
  "info",
  "info",
  "info",
  "debug",
  "debug",
  "warn",
  "warn",
  "error",
];

const REGIONS = [
  "us-east",
  "us-west",
  "eu-west",
  "eu-central",
  "ap-southeast",
];

const MESSAGE_TEMPLATES = [
  "Request completed successfully",
  "Database query took 12ms",
  "Payment processed for user",
  "Cache miss on key lookup",
  "User logged in from new device",
  "Inventory reservation completed",
  "Notification queued for delivery",
  "Failed to connect to upstream service",
  "Rate limit threshold approaching",
  "Token refreshed successfully",
];

export function generateDeterministicBatch(
  count: number,
  rng: () => number,
  now: Date,
  batchIndex: number,
) {
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const nowMs = now.getTime();
  const logs = new Array(count);

  for (let i = 0; i < count; i++) {
    // Generate deterministic timestamp covering [now - 30 days, now]
    const randomOffsetMs = rng() * thirtyDaysMs;
    const logTimestamp = new Date(nowMs - randomOffsetMs);
    const timestamp = logTimestamp.toISOString();

    const service = SERVICES[Math.floor(rng() * SERVICES.length)];
    const level = LEVELS[Math.floor(rng() * LEVELS.length)];
    const message = MESSAGE_TEMPLATES[Math.floor(rng() * MESSAGE_TEMPLATES.length)];
    const region = REGIONS[Math.floor(rng() * REGIONS.length)];
    const userId = Math.floor(rng() * 100000);
    const duration = Math.floor(rng() * 500);

    logs[i] = {
      timestamp,
      level,
      service,
      message: `${message} [b${batchIndex}-i${i}]`,
      attributes: {
        user_id: String(userId),
        region,
        duration_ms: duration,
        cached: rng() > 0.5,
        version: "1.0",
      },
    };
  }
  return logs;
}

async function queryDatasetSize(
  baseUrl: string,
  since: string,
  until: string,
  apiKey?: string,
): Promise<number | null> {
  try {
    const aggRes = await fetch(
      `${baseUrl}/logs/aggregate?since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}&bucket=1d`,
      apiKey ? { headers: { Authorization: `Bearer ${apiKey}` } } : {},
    );
    if (!aggRes.ok) return null;
    const aggBody: any = await aggRes.json();
    if (!Array.isArray(aggBody.buckets)) return null;
    return aggBody.buckets.reduce(
      (sum: number, b: any) => sum + Number(b.count || 0),
      0,
    );
  } catch {
    return null;
  }
}

export async function seedDatabase(
  baseUrl: string,
  totalRecords: number = 1_000_000,
  batchSize: number = 500,
  randomSeed: number = 1337,
  apiKey?: string,
  concurrency: number = 8,
  onProgress?: (attempted: number, accepted: number, total: number) => void,
): Promise<SeedResult> {
  const startTime = performance.now();
  const rng = mulberry32(randomSeed);
  const now = new Date();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const since = new Date(now.getTime() - thirtyDaysMs - 60_000).toISOString();
  const until = new Date(now.getTime() + 60_000).toISOString();

  const totalBatches = Math.ceil(totalRecords / batchSize);
  const batches: unknown[][] = [];
  for (let bIdx = 0; bIdx < totalBatches; bIdx++) {
    const count = Math.min(batchSize, totalRecords - bIdx * batchSize);
    batches.push(generateDeterministicBatch(count, rng, now, bIdx));
  }

  let attempted = 0;
  let accepted = 0;
  let rejected = 0;
  let nextBatch = 0;

  async function worker() {
    while (true) {
      const bIdx = nextBatch++;
      if (bIdx >= batches.length) break;
      const logs = batches[bIdx];
      attempted += logs.length;

      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (apiKey) {
          headers["Authorization"] = `Bearer ${apiKey}`;
        }

        const res = await fetch(`${baseUrl}/logs`, {
          method: "POST",
          headers,
          body: JSON.stringify({ logs }),
        });

        if (res.ok) {
          const body: any = await res.json();
          accepted += Number(body.accepted || 0);
          if (Array.isArray(body.rejected)) {
            rejected += body.rejected.length;
          }
        } else {
          rejected += logs.length;
        }
      } catch {
        rejected += logs.length;
      }

      if (onProgress) {
        onProgress(attempted, accepted, totalRecords);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const deadline = Date.now() + 60_000;
  let datasetSize = accepted;
  while (Date.now() < deadline) {
    const visible = await queryDatasetSize(baseUrl, since, until, apiKey);
    if (visible !== null) {
      datasetSize = visible;
      if (accepted === 0 || visible >= accepted * 0.99) {
        break;
      }
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  const durationMs = Math.round(performance.now() - startTime);

  return {
    durationMs,
    attempted,
    accepted,
    rejected,
    datasetSize,
  };
}
