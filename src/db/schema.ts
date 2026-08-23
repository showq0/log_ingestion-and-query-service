import { client } from "./index.js";

/**
 * ClickHouse DDL for the logs table.
 *
 * MergeTree engine:
 *   - Columnar storage with per-column compression
 *   - ORDER BY defines the sparse primary index for fast range scans
 *   - PARTITION BY date for efficient partition pruning on time-range queries
 *
 * LowCardinality:
 *   - Dictionary-encodes `level` (4 values) and `service` (low hundreds)
 *   - 10x compression, 5x faster GROUP BY
 *
 * Map(String, String):
 *   - Native map type replaces jsonb — no JSON parsing overhead
 *   - Accessible via attributes['key'] syntax
 */
const CREATE_LOGS_TABLE = `
CREATE TABLE IF NOT EXISTS logs (
    id          UUID DEFAULT generateUUIDv4(),
    timestamp   DateTime64(3, 'UTC'),
    level       LowCardinality(String),
    service     LowCardinality(String),
    message     String,
    attributes  Map(String, String)
)
ENGINE = MergeTree()
ORDER BY (timestamp, id)

`;
// const Retention = `ALTER TABLE logs_db.logs
// MODIFY TTL timestamp + INTERVAL 30 DAY;`


export async function migrate(): Promise<void> {
    await client.command({ query: CREATE_LOGS_TABLE });
    // await client.command({ query: Retention });


    console.log("ClickHouse migration completed — logs table ready");
}

export type NewLog = {
    id?: string;
    timestamp: Date;
    level: string;
    service: string;
    message: string;
    attributes?: Record<string, string | number | boolean> | null;
};


// const rows = logEntries.map((log) => ({
//     timestamp: log.timestamp.toISOString().replace("T", " ").replace("Z", ""),
//     level: log.level,
//     service: log.service,
//     message: log.message,
//     attributes: log.attributes
//         ? Object.fromEntries(
//             Object.entries(log.attributes).map(([k, v]) => [k, String(v)]),
//         )
//         : {},
// }));