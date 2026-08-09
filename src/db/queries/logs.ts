import { db } from "../index.js";
import { NewLog, logs } from "../schema.js";

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
        .returning();
}