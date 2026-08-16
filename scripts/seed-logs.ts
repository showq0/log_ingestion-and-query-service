import postgres from "postgres";
import { logs } from "../src/db/schema.js";
import { drizzle } from "drizzle-orm/postgres-js";
import { config } from "../src/config.js";

const DB_URL = config.db.url;

console.log(DB_URL);

if (!DB_URL) {
    throw new Error("DATABASE_URL is required");
}

const client = postgres(DB_URL, {
    max: 10,
});

const db = drizzle(client);

const TOTAL_LOGS = 1_000_000;
const BATCH_SIZE = 5_000;

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

    return {
        timestamp: randomTimestamp(),
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
            retries: Math.floor(Math.random() * 4),
        },
    };
}

async function seed() {
    console.log(
        `Seeding ${TOTAL_LOGS.toLocaleString()} logs...`,
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

        await db.insert(logs).values(batch);

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

    await client.end();
}

seed().catch(async (error) => {
    console.error("Seeding failed:", error);

    await client.end();

    process.exit(1);
});