export interface ConsistencyCheckResult {
  acceptedRecords: number;
  visibleRecords: number;
  missingRecords: number;
  duplicateRecords: number;
  visibilityRate: number;
  readAfterWriteSuccessRate: number;
  consistencyPassed: boolean;
  timeToVisibilityMs?: number;
}

export async function verifyDrain(
  baseUrl: string,
  serviceName: string,
  sinceIso: string,
  expectedAcceptedLogs: number,
  timeoutSeconds = 30,
  apiKey?: string,
): Promise<ConsistencyCheckResult> {
  const deadline = Date.now() + timeoutSeconds * 1000;
  let visibleCount = 0;
  const start = performance.now();
  let timeToVisibilityMs = 0;

  const headers: Record<string, string> = {};
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  while (Date.now() < deadline) {
    const untilIso = new Date(Date.now() + 60_000).toISOString();
    const url = `${baseUrl}/logs/aggregate?service=${encodeURIComponent(serviceName)}&since=${encodeURIComponent(sinceIso)}&until=${encodeURIComponent(untilIso)}&bucket=1d`;

    try {
      const res = await fetch(url, { headers });
      if (res.ok) {
        const body: any = await res.json();
        if (Array.isArray(body.buckets)) {
          visibleCount = body.buckets.reduce(
            (sum: number, b: any) => sum + Number(b.count || 0),
            0,
          );
          if (visibleCount >= expectedAcceptedLogs) {
            timeToVisibilityMs = Math.round(performance.now() - start);
            break;
          }
        }
      }
    } catch {
      // Retry
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  const missingRecords = Math.max(0, expectedAcceptedLogs - visibleCount);
  const duplicateRecords = Math.max(0, visibleCount - expectedAcceptedLogs);
  const visibilityRate =
    expectedAcceptedLogs > 0
      ? Math.min(1.0, Number((visibleCount / expectedAcceptedLogs).toFixed(4)))
      : 1.0;

  const readAfterWriteSuccessRate = visibilityRate;
  const consistencyPassed = missingRecords === 0;

  return {
    acceptedRecords: expectedAcceptedLogs,
    visibleRecords: visibleCount,
    missingRecords,
    duplicateRecords,
    visibilityRate,
    readAfterWriteSuccessRate,
    consistencyPassed,
    timeToVisibilityMs,
  };
}
