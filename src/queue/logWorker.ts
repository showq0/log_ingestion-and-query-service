import { Worker } from "bullmq";
import { client } from "../db/index.js";

export const INSERT_BATCH_SIZE = 5000;

const connection = {
    host: process.env.REDIS_HOST ?? "localhost",
    port: Number(process.env.REDIS_PORT ?? 6379),
};

type LogJob = {
    rows: Array<{
        id: string;
        timestamp: string;
        level: string;
        service: string;
        message: string;
        attributes?: Record<string, string>;
    }>;
};

const sleep = (ms: number) =>
    new Promise(resolve => setTimeout(resolve, ms));

export const worker = new Worker<LogJob>(
    "logs",
    async (job) => {
        const { rows } = job.data;

        if (!rows.length) {
            return;
        }

        for (
            let i = 0;
            i < rows.length;
            i += INSERT_BATCH_SIZE
        ) {
            const batch = rows.slice(
                i,
                i + INSERT_BATCH_SIZE,
            );

            await client.insert({
                table: "logs",
                values: batch,
                format: "JSONEachRow",
            });

            console.log(
                `[logs] inserted ${batch.length} rows ` +
                `(job=${job.id}, offset=${i})`,
            );

            await sleep(10);
        }
    },
    {
        connection,

        // CRITICAL:
        // only one ClickHouse INSERT at a time.
        concurrency: 4,

        // 3 seconds is too short.
        lockDuration: 60_000,

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