import { SQL, eq, gte, lt, lte, ilike, sql, and } from "drizzle-orm";
import { logs } from "./schema.js";
import { decodeCursor } from "../utils.js"
import { logQuerySchema, logAggrigatorSchema } from "../type.js"
import { z } from "zod"

export function createLogConditions(parameter: z.infer<typeof logQuerySchema>, attribute: {}): SQL[] {
    //GET /logs?service=checkout&level=error&attr.user_id=42&attr.region=eu-west
    const conditions: SQL[] = [];
    //Exact service-name match
    if (parameter.service) {
        conditions.push(
            eq(logs.service, parameter.service),
        );
    }
    //Exact level match
    if (parameter.level) {
        conditions.push(
            eq(logs.level, parameter.level),
        );
    }
    //Inclusive start of the time range
    if (parameter.since) {
        conditions.push(
            gte(logs.timestamp, parameter.since),
        );
    }
    //Exclusive end of the time range
    if (parameter.until) {
        conditions.push(
            lt(logs.timestamp, parameter.until));
    }
    //Case-insensitive substring match ilike
    if (parameter.q) {
        conditions.push(
            ilike(logs.message, `%${parameter.q}%`),
        );
    }
    if (parameter.cursor) {
        const cursorInfo = decodeCursor(parameter.cursor);
        const cursorTimestamp = new Date(cursorInfo.timestamp);
        conditions.push(lte(logs.timestamp, cursorTimestamp))
    }
    for (const [key, value] of Object.entries(attribute)) {
        conditions.push(
            // access attribute
            sql`${logs.attributes}->>${key} = ${value}`,
        );
    }

    return conditions;
}

export function createAggLogConditions(parameter: z.infer<typeof logAggrigatorSchema>, attribute: {}): SQL[] {
    const conditions: SQL[] = [];

    conditions.push(
        gte(logs.timestamp, parameter.since),
    );

    conditions.push(
        lt(logs.timestamp, parameter.until),
    );

    if (parameter.service) {
        conditions.push(
            eq(logs.service, parameter.service),
        );
    }
    if (parameter.level) {
        conditions.push(
            eq(logs.level, parameter.level),
        );
    }

    //Case-insensitive substring match ilike
    if (parameter.q) {
        conditions.push(
            ilike(logs.message, `%${parameter.q}%`),
        );
    }

    for (const [key, value] of Object.entries(attribute)) {
        conditions.push(
            // access attribute
            sql`${logs.attributes}->>${key} = ${value}`,
        );
    }

    return conditions;
}
