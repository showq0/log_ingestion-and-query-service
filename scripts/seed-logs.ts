import { createClient } from "@clickhouse/client";
import { config } from "../src/config.js";

const client = createClient({
    url: config.clickhouse.url,
    database: config.clickhouse.database,
    clickhouse_settings: {
        async_insert: 0,
        max_insert_threads: "1",
    },
});

const TOTAL_LOGS = 1_000_000;

// Keep INSERT batches small because ClickHouse is limited to ~1 GiB.
const BATCH_SIZE = 15000

// Historical data: July 1 → July 31, 2026
const START_DATE = new Date("2026-07-01T00:00:00.000Z");
const END_DATE = new Date("2026-07-31T00:00:00.000Z");

const services = [
    "api",
    "auth",
    "checkout",
    "payments",
    "orders",
    "users",
];

const levels = ["debug", "info", "warn", "error"] as const;

const messages = [
    "request completed",
    "request failed",
    "user authenticated",
    "payment processed",
    "payment declined",
    "order created",
    "database query completed",
    "cache miss",
    "cache hit",
    "connection timeout",
];

function randomItem<T>(items: readonly T[]): T {
    return items[Math.floor(Math.random() * items.length)];
}

function randomTimestamp(): Date {
    const start = START_DATE.getTime();
    const end = END_DATE.getTime();

    return new Date(
        start + Math.random() * (end - start),
    );
}

function createLog() {
    const service = randomItem(services);
    const level = randomItem(levels);
    const ts = randomTimestamp();

    return {
        timestamp: ts.toISOString().replace("T", " ").replace("Z", ""),
        level,
        service,
        message: randomItem(messages),
        attributes: {
            user_id: String(
                Math.floor(Math.random() * 100_000),
            ),
            request_id: crypto.randomUUID(),
            region: randomItem([
                "eu-west",
                "us-east",
                "ap-south",
                "eu-central",
            ]),
            retries: String(Math.floor(Math.random() * 4)),
        },
    };
}

async function seed() {
    console.log(
        `Seeding ${TOTAL_LOGS.toLocaleString()} logs into ClickHouse...`,
    );

    console.log(
        `Batch size: ${BATCH_SIZE.toLocaleString()}`,
    );

    console.log(
        `Expected batches: ${Math.ceil(
            TOTAL_LOGS / BATCH_SIZE,
        ).toLocaleString()}`,
    );

    console.log(
        `Date range: ${START_DATE.toISOString()} → ${END_DATE.toISOString()}`,
    );

    const startedAt = Date.now();

    for (
        let offset = 0;
        offset < TOTAL_LOGS;
        offset += BATCH_SIZE
    ) {
        const size = Math.min(
            BATCH_SIZE,
            TOTAL_LOGS - offset,
        );

        const batch = Array.from(
            { length: size },
            createLog,
        );

        await client.insert({
            table: "logs",
            values: batch,
            format: "JSONEachRow",
        });

        const inserted = offset + size;
        const percentage = (
            (inserted / TOTAL_LOGS) *
            100
        ).toFixed(1);

        console.log(
            `${inserted.toLocaleString()} / ${TOTAL_LOGS.toLocaleString()} (${percentage}%)`,
        );
    }

    const elapsed =
        (Date.now() - startedAt) / 1000;

    console.log(
        `Finished seeding ${TOTAL_LOGS.toLocaleString()} logs in ${elapsed.toFixed(2)}s`,
    );

    await client.close();
}

seed().catch(async (error) => {
    console.error("Seeding failed:", error);
    await client.close();
});