import { validateLogs } from "../utils.js"
import { Request, Response } from "express"
import { createLogs } from "../db/queries/logs.js"
import { logQueueEvents } from "../queue/logQueue.js"
export async function createLogsHandler(req: Request, res: Response,
) {
    const body = req.body;

    if (!body.logs) {
        return res.status(400).json({
            error: "body is undefined",
        });
    }

    const result = validateLogs(body.logs);

    if (result.valid.length === 0) {
        return res.status(400).json({
            accepted: 0,
            rejected: result.invalid,
        });
    }

    const job = await createLogs(result.valid);

    if (!job) {
        return res.status(400).json({
            accepted: 0,
            rejected: result.invalid,
        });
    }

    // IMPORTANT:
    // Do not return 200 until the worker has successfully
    // persisted the job into ClickHouse.
    await job.waitUntilFinished(logQueueEvents);
    return res.status(200).json({
        accepted: result.valid.length,
        rejected: result.invalid,
    });
}