import { validateAggQueryParameter } from "../utils.js"
import { Request, Response } from "express"
import { createAggLogConditions } from "../db/utils.js"
import { aggregateLog } from "../db/queries/logs.js"

export async function aggregateLogsHandler(req: Request, res: Response,) {
    // return time-buckted logs count 
    // each bucket is one row
    const obj = req.query
    const aggValidate = validateAggQueryParameter(obj);
    // attribute extract 
    const attribute: Record<string, string> = {};

    for (const [key, value] of Object.entries(obj)) {
        if (key.startsWith("attr.") && typeof value === "string") {
            const keyAttribute = key.slice(5);
            attribute[keyAttribute] = value;
        }
    }
    if (!aggValidate.success || !aggValidate.data?.since) {
        res.status(400).json({
            "error": aggValidate.error,
        });
        return
    }
    const hasCompleteMinuteRange = isMinuteAligned(aggValidate.data.since) && isMinuteAligned(aggValidate.data.until);
    const canUsePreAggregate =
        hasCompleteMinuteRange &&
        !aggValidate.data.q &&
        Object.keys(attribute).length === 0 &&
        !(
            (aggValidate.data.group_by === "service" && aggValidate.data.level !== undefined) ||
            (aggValidate.data.group_by === "level" && aggValidate.data.service !== undefined)
        );

    const result = canUsePreAggregate
        ? await aggregateLog1m(
            createAggLog1mConditions(aggValidate.data),
            aggValidate.data.group_by,
            aggValidate.data.bucket,
        )
        : await aggregateLog(
            createAggLogConditions(aggValidate.data, attribute),
            aggValidate.data.group_by,
            aggValidate.data.bucket,
        );

    // const result = await aggregateLog(
    //     createAggLogConditions(aggValidate.data, attribute),
    //     aggValidate.data.group_by,
    //     aggValidate.data.bucket,
    // );
    return res.status(200).json({
        "buckets": result,
    });
}

const isMinuteAligned = (value: Date | undefined): boolean => {
    if (!value)
        return false;
    return (value.getUTCSeconds() === 0 && value.getUTCMilliseconds() === 0);
};