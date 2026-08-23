import { z } from "zod";
import { logQuerySchema, logAggrigatorSchema } from "../type.js";
import { decodeCursor } from "../utils.js";

/**
 * Build ClickHouse WHERE conditions for log queries.
 * Returns an array of SQL condition strings and a params object for parameterized queries.
 *
 * Uses ClickHouse parameterized query syntax: {paramName:Type}
 */
export function createLogConditions(
    parameter: z.infer<typeof logQuerySchema>,
    attribute: Record<string, string>,
): {
    conditions: string[];
    params: Record<string, unknown>;
} {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    if (parameter.service) {
        conditions.push("service = {service:String}");
        params.service = parameter.service;
    }

    if (parameter.level) {
        conditions.push("level = {level:String}");
        params.level = parameter.level;
    }

    if (parameter.since) {
        conditions.push("timestamp >= toDateTime64({since:String}, 3, 'UTC')");
        params.since = parameter.since.toISOString().replace("T", " ").replace("Z", "");
    }

    if (parameter.until) {
        conditions.push("timestamp < toDateTime64({until:String}, 3, 'UTC')");
        params.until = parameter.until.toISOString().replace("T", " ").replace("Z", "");
    }

    if (parameter.q) {
        conditions.push("message ILIKE {q:String}");
        params.q = `%${parameter.q}%`;
    }

    if (parameter.cursor) {
        const cursorInfo = decodeCursor(parameter.cursor);
        conditions.push("timestamp <= toDateTime64({cursor_ts:String}, 3, 'UTC')");
        const ts = new Date(cursorInfo.timestamp);
        params.cursor_ts = ts.toISOString().replace("T", " ").replace("Z", "");
    }

    let attrIndex = 0;

    for (const [key, value] of Object.entries(attribute)) {
        const keyParam = `attr_key_${attrIndex}`;
        const valueParam = `attr_val_${attrIndex}`;

        conditions.push(
            `attributes[{${keyParam}:String}] = {${valueParam}:String}`,
        );

        params[keyParam] = key;
        params[valueParam] = value;

        attrIndex++;
    }

    return {
        conditions,
        params,
    };
}

/**
 * Build ClickHouse WHERE conditions for aggregation queries.
 */
export function createAggLogConditions(
    parameter: z.infer<typeof logAggrigatorSchema>,
    attribute: Record<string, string>,
): {
    conditions: string[];
    params: Record<string, unknown>;
} {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    conditions.push("timestamp > toDateTime64({since:String}, 3, 'UTC')");
    params.since = parameter.since.toISOString().replace("T", " ").replace("Z", "");

    conditions.push("timestamp < toDateTime64({until:String}, 3, 'UTC')");
    params.until = parameter.until.toISOString().replace("T", " ").replace("Z", "");

    if (parameter.service) {
        conditions.push("service = {service:String}");
        params.service = parameter.service;
    }

    if (parameter.level) {
        conditions.push("level = {level:String}");
        params.level = parameter.level;
    }

    if (parameter.q) {
        conditions.push("message ILIKE {q:String}");
        params.q = `%${parameter.q}%`;
    }

    let attrIndex = 0;

    for (const [key, value] of Object.entries(attribute)) {
        const paramKey = `attr_key_${attrIndex}`;
        const paramVal = `attr_val_${attrIndex}`;

        conditions.push(
            `attributes[{${paramKey}:String}] = {${paramVal}:String}`
        );

        params[paramKey] = key;
        params[paramVal] = value;

        attrIndex++;
    }

    return {
        conditions,
        params,
    };
}
