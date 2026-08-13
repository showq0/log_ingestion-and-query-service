import { SQL, eq, gte, lt, lte, ilike, sql, and } from "drizzle-orm";
import { logs } from "./schema.js";
import { ParsedQs } from "qs";
import { decodeCursor } from "../utils.js"
export function createLogConditions(parameter: ParsedQs): SQL[] {
    //GET /logs?service=checkout&level=error&attr.user_id=42&attr.region=eu-west
    const conditions: SQL[] = [];
    //Exact service-name match
    if (parameter.service !== undefined && typeof parameter.service === 'string') {
        conditions.push(
            eq(logs.serviceName, parameter.service),
        );
    }
    //Exact level match
    if (parameter.level !== undefined && typeof parameter.level === 'string') {
        conditions.push(
            eq(logs.level, parameter.level),
        );
    }
    //Inclusive start of the time range

    if (parameter.since !== undefined && (typeof parameter.since === "string")) {
        conditions.push(
            gte(logs.timestamp, new Date(parameter.since)),
        );
    }
    //Exclusive end of the time range
    if (parameter.until !== undefined && (typeof parameter.until === "string")) {
        conditions.push(
            lt(logs.timestamp, new Date(parameter.until)),
        );
    }
    //Case-insensitive substring match ilike
    if (parameter.q !== undefined) {
        conditions.push(
            ilike(logs.message, `%${parameter.q}%`),
        );
    }
    if (parameter.cursor !== undefined && (typeof parameter.cursor === "string")) {
        const cursorInfo = decodeCursor(parameter.cursor);
        const cursorTimestamp = new Date(cursorInfo.timestamp);
        conditions.push(lte(logs.timestamp, cursorTimestamp))
    }

    for (const [key, value] of Object.entries(parameter)) {
        if (key.startsWith("attr.")) {
            const keyAttribute = key.slice(5);
            conditions.push(
                // access attribute
                sql`${logs.attributes}->>${keyAttribute} = ${value}`,
            );
        }
    }
    return conditions;
}