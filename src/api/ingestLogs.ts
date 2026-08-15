import { validateLogs } from "../utils.js"
import { Request, Response } from "express"

import { createLogs } from "../db/queries/logs.js"

export async function createLogsHandler(req: Request, res: Response) {
    const body = req.body;
    //validate
    const result = validateLogs(body.logs);

    if (result.valid.length === 0) {
        return res.status(400).json({
            accepted: 0,
            rejected: result.invalid,
        });
    }
    // insert valid logs
    await createLogs(result.valid);

    return res.status(200).json({
        accepted: result.valid.length,
        rejected: result.invalid
    });
}