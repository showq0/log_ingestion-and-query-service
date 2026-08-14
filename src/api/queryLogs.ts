import { validateQueryParameter } from "../utils.js"
import { Request, Response } from "express"
import { createLogConditions } from "../db/utils.js"
import { filterLogs } from "../db/queries/logs.js"


export async function queryLogsHandler(req: Request, res: Response) {
    const obj = req.query
    let limit;
    if (obj.limit) {
        limit = Number(obj.limit)
    }
    const logsValidate = validateQueryParameter(obj)
    if (!logsValidate.data || !logsValidate.success) {
        return res.status(400).json({
            "error": logsValidate.error,
        });
    }

    const attribute: Record<string, string> = {};

    for (const [key, value] of Object.entries(obj)) {
        if (key.startsWith("attr.") && typeof value === "string") {
            const keyAttribute = key.slice(5);
            attribute[keyAttribute] = value;
        }
    }
    const conditions = createLogConditions(logsValidate.data, attribute) || undefined;
    const result = await filterLogs(conditions, limit);
    res.status(200).json({
        result: result,
    });
}