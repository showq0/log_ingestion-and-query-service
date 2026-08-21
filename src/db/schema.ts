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
PARTITION BY toYYYYMMDD(timestamp)
ORDER BY (service, level, timestamp, id)

`;

export async function migrate(): Promise<void> {
    await client.command({ query: CREATE_LOGS_TABLE });

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
