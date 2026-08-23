import { client } from "../index.js";
import { NewLog } from "../schema.js";
import { encodeCursor } from "../../utils.js";
import { logQueue, } from "../../queue/logQueue.js";
const PAGE_DEFAULT = 100;

const BUCKET_INTERVALS: Record<string, string> = {
    "1m": "toStartOfMinute",
    "5m": "toStartOfFiveMinutes",
    "1h": "toStartOfHour",
    "1d": "toStartOfDay",
};

export type Bucket = keyof typeof BUCKET_INTERVALS;

export async function createLogs(logEntries: NewLog[]): Promise<void> {
    if (logEntries.length === 0) {
        return;
    }
    const rows = logEntries.map((log) => ({
        timestamp: log.timestamp.toISOString().replace("T", " ").replace("Z", ""),
        level: log.level,
        service: log.service,
        message: log.message,
        attributes: log.attributes
            ? Object.fromEntries(
                Object.entries(log.attributes).map(([k, v]) => [k, String(v)]),
            )
            : {},
    }));


    await logQueue.add(
        "insert-logs",
        {
            rows: rows,
        },
    );

}



export async function filterLogs(
    conditions: string[],
    params: Record<string, unknown>,
    limit?: number,
): Promise<{
    logs: Array<{
        id: string;
        timestamp: string;
        level: string;
        service: string;
        message: string;
        attributes: Record<string, string>;
    }>;
    next_cursor: string | null;
}> {
    const queryLimit = limit ?? PAGE_DEFAULT;

    const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // NOTE: the formatted timestamp is aliased to `timestamp_formatted`
    // rather than `timestamp`. Reusing the column name `timestamp` as the
    // alias shadows the real `timestamp` column for the rest of the query —
    // ClickHouse resolves the bare `timestamp` in WHERE/ORDER BY to this
    // SELECT-list alias (a String) instead of the underlying DateTime64(3)
    // column, which breaks any `timestamp >=/<=` filter (since/until/cursor)
    // with "No operation greaterOrEquals between String and DateTime64(3)".
    const query = `
        SELECT
            id,
            formatDateTime(timestamp, '%Y-%m-%dT%H:%i:%s.%f', 'UTC') AS timestamp_formatted,
            level,
            service,
            message,
            attributes
        FROM logs
        ${whereClause}
        ORDER BY timestamp DESC, id DESC
        LIMIT {limit:UInt32}
    `;

    const result = await client.query({
        query,
        query_params: {
            ...params,
            limit: queryLimit + 1,
        },
        format: "JSONEachRow",
    });

    const rows = await result.json<{
        id: string;
        timestamp_formatted: string;
        level: string;
        service: string;
        message: string;
        attributes: Record<string, string>;
    }>();

    const hasNextPage = rows.length > queryLimit;
    const trimmedRows = rows.slice(0, queryLimit);

    // Format timestamps to ISO 8601 and map back to the `timestamp` field
    // name the API contract expects.
    const logsResult = trimmedRows.map((row) => {
        // ClickHouse formatDateTime gives us something like "2026-08-01T12:30:45.123000"
        // Trim trailing zeros from microseconds and add Z
        let timestamp = row.timestamp_formatted.replace(/\.?0+$/, "") + "Z";
        if (!timestamp.includes(".")) {
            timestamp = timestamp.replace("Z", ".000Z");
        }
        return {
            id: row.id,
            timestamp,
            level: row.level,
            service: row.service,
            message: row.message,
            attributes: row.attributes,
        };
    });

    const nextCursor = hasNextPage
        ? encodeCursor({
            timestamp: logsResult[logsResult.length - 1].timestamp,
            id: logsResult[logsResult.length - 1].id
        })
        : null;

    return {
        logs: logsResult,
        next_cursor: nextCursor,
    };
}

export async function aggregateLog(
    conditions: string[],
    params: Record<string, unknown>,
    groupBy: "service" | "level" | undefined,
    bucket: Bucket,
): Promise<
    Array<{
        start: string;
        group: string | null;
        count: number;
    }>
> {
    const bucketFn = BUCKET_INTERVALS[bucket];

    if (!bucketFn) {
        throw new Error(`Unknown bucket interval: ${bucket}`);
    }

    const whereClause =
        conditions.length > 0
            ? `WHERE ${conditions.join(" AND ")}`
            : "";

    let groupColumn: string;
    let groupByClause: string;

    switch (groupBy) {
        case "service":
            groupColumn = "service";
            groupByClause =
                "GROUP BY bucket, service ORDER BY bucket ASC, service ASC";
            break;

        case "level":
            groupColumn = "level";
            groupByClause =
                "GROUP BY bucket, level ORDER BY bucket ASC, level ASC";
            break;

        default:
            groupColumn = "NULL";
            groupByClause =
                "GROUP BY bucket ORDER BY bucket ASC";
            break;
    }

    const query = `
        SELECT
            ${bucketFn}(timestamp) AS bucket,
            ${groupColumn} AS \`group\`,
            count() AS count
        FROM logs
        ${whereClause}
        ${groupByClause}
    `;

    const result = await client.query({
        query,
        query_params: params,
        format: "JSONEachRow",
    });

    const rows = await result.json<{
        bucket: string;
        group: string | null;
        count: string;
    }>();

    return rows.map((row) => ({
        start: new Date(row.bucket).toISOString(),
        group: row.group,
        count: Number(row.count),
    }));
}