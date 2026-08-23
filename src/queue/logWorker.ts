// workers/logWorker.ts

import { Worker } from "bullmq";
import { client } from "../db/index.js";

export const INSERT_BATCH_SIZE = 8_000;

const connection = {
    host: process.env.REDIS_HOST ?? "localhost",
    port: Number(process.env.REDIS_PORT ?? 6379),
};

type LogJob = {
    rows: Array<{
        timestamp: string;
        level: string;
        service: string;
        message: string;
        attributes?: Record<string, string>;
    }>;
};


const worker = new Worker<LogJob>(
    "logs",
    async (job) => {
        const rows = job.data.rows;

        if (!rows || rows.length === 0) {
            return;
        }
        // Safety net:
        // even if a producer accidentally sends a larger job,
        // never send the whole job to ClickHouse.
        for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
            const batch = rows.slice(i, i + INSERT_BATCH_SIZE);

            await client.insert({
                table: "logs",
                values: batch,
                format: "JSONEachRow",
            });

            console.log(
                `[logs] inserted ${batch.length} rows ` +
                `(job=${job.id}, offset=${i})`,
            );
        }
    },

    {
        connection,

        // CRITICAL:
        // only one ClickHouse INSERT at a time.
        concurrency: 1,

        // Don't let BullMQ wait forever for a broken ClickHouse connection.
        lockDuration: 500,

        // Retry failed jobs.
        maxStalledCount: 2,
    },
);

worker.on("completed", (job) => {
    console.log(`[logs] job ${job.id} completed`);
});

worker.on("failed", (job, error) => {
    console.error(
        `[logs] job ${job?.id} failed:`,
        error,
    );
});

worker.on("error", (error) => {
    console.error("[logs] worker error:", error);
});