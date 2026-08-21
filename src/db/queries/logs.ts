import { db } from "../index.js";
import { NewLog, logs } from "../schema.js";
import { logs_1m_level, logs_1m_service } from "../aggSchema.js"

import { and, SQL, desc, sql, asc } from "drizzle-orm";
import { encodeCursor } from "../../utils.js";
const PAGE_DEFAULT = 100;

const intervals = {
    "1m": sql`interval '1 minute'`,
    "5m": sql`interval '5 minutes'`,
    "1h": sql`interval '1 hour'`,
    "1d": sql`interval '1 day'`,
} as const;

export type Bucket = keyof typeof intervals;

export async function createLog(log: NewLog) {
    const [result] = await db
        .insert(logs)
        .values(log)
        .onConflictDoNothing()
        .returning();
    return result;
}

export async function createLogs(logEntries: NewLog[]) {
    return db
        .insert(logs)
        .values(logEntries)
        .onConflictDoNothing()
}

export async function filterLogs(conditions: SQL[], limit?: number) {
    //where limit (undefined)returns 100 
    const query_limit = limit ?? PAGE_DEFAULT

    const result = await db
        .select()
        .from(logs)
        .where(
            conditions.length > 0
                ? and(...conditions)
                : undefined,
        )
        .orderBy(
            desc(logs.timestamp),
        ).limit(query_limit + 1);

    const hasNextPage = result.length > query_limit;
    // remove extra row
    const logsResult = result.slice(0, query_limit);

    // create next curser by using the last id element 
    // the info should encoded
    const nextCursor = hasNextPage
        ? encodeCursor({
            timestamp: logsResult[logsResult.length - 1].timestamp.toISOString()
        })
        : null;

    return {
        logs: logsResult,
        next_cursor: nextCursor,
    };
}

export async function aggregateLog(
    conditions: SQL[],
    groupBy: "service" | "level" | undefined,
    bucket: Bucket,
) {
    const bucketExpression = sql<Date>`
        time_bucket(
            ${intervals[bucket]},
            ${logs.timestamp}
        )
    `;
    if (groupBy === "service") {
        return db
            .select({
                start: bucketExpression,
                group: logs.service,
                count: sql<number>`count(*)::int`
            }).from(logs).where(
                conditions.length > 0
                    ? and(...conditions)
                    : undefined,).groupBy(
                        bucketExpression,
                        logs.service,
                    );
    }

    if (groupBy === "level") {
        return db
            .select({
                start: bucketExpression,
                group: logs.level,
                count: sql<number>`count(*)::int`,
            }).from(logs).where(
                conditions.length > 0
                    ? and(...conditions)
                    : undefined,
            ).groupBy(
                bucketExpression,
                logs.level,
            );
    }

    return db
        .select({
            start: bucketExpression,
            group: sql<null>`NULL`,
            count: sql<number>`count(*)::int`,
        }).from(logs).where(
            conditions.length > 0
                ? and(...conditions)
                : undefined).groupBy(
                    bucketExpression,
                );
}


export async function aggregateLog1m(
    conditions: SQL[],
    groupBy: "service" | "level" | undefined,
    bucket: Bucket,
) {
    const table = groupBy === "service" ? logs_1m_service : groupBy === "level" ? logs_1m_level : logs_1m_service;

    const bucketExpression = sql<Date>`  time_bucket(${intervals[bucket]}, ${table.bucket}) `;

    const groupColumn = groupBy === "service" ? logs_1m_service.service : groupBy === "level" ? logs_1m_level.level : undefined;

    const selection = {
        start: bucketExpression,
        group: groupColumn ?? sql<null>`NULL`,
        count: sql<string>`sum(${table.count})::bigint`,
    };

    return db
        .select(selection)
        .from(table)
        .where(and(...conditions))
        .groupBy(
            bucketExpression,
            ...(groupColumn ? [groupColumn] : []),
        );
}

