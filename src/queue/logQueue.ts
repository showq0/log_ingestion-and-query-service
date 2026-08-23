import { Queue, QueueEvents } from "bullmq";
const connection = {
    host: process.env.REDIS_HOST ?? "localhost",
    port: Number(process.env.REDIS_PORT ?? 6379),
};

export const logQueue = new Queue("logs", {
    connection,

    defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: {
            count: 100,
        },
        attempts: 3,

        backoff: {
            type: "exponential",
            delay: 1000,
        },
    },
});

export const logQueueEvents = new QueueEvents("logs", {
    connection,
});