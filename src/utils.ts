import { NewLog } from "./db/schema.js";

import { z } from "zod";


const logQuerySchema = z.object({
    service: z.string().optional(),
    level: z.literal(["debug", "info", "warn", "error"]).optional(),
    since: z.iso.datetime().optional(),
    until: z.iso.datetime().optional(),
    q: z.string().optional(),

    limit: z.string().regex(/^\d+$/, "limit must be a number").transform(Number).refine((value) => value <= 1000, {
        message: "limit must be less than  1000",
    }).optional(),
    cursor: z.string().optional(),
});


type LogEntry = {
    timestamp: string;
    level: "debug" | "info" | "warn" | "error";
    service: string;
    message: string;
    attributes?: Record<string, string | number | boolean>;
};

type InvalidLog = {
    index: number;
    reason: string;
};

type ValidationResult = {
    valid: NewLog[];
    invalid: InvalidLog[];
};

const VALID_LEVELS = new Set(["debug", "info", "warn", "error"]);

export function validateLogs(logs: unknown[]): ValidationResult {
    const valid: NewLog[] = [];
    const invalid: InvalidLog[] = [];
    let index = 0;
    for (const log of logs) {
        index++;
        const errors: string[] = [];
        if (typeof log !== "object" || log === null || Array.isArray(log)) {
            invalid.push({
                index,
                reason: "The request does not match the expected top-level structure",
            });
            continue;
        }

        const entry = log as Record<string, unknown>;

        // timestamp
        if (typeof entry.timestamp !== "string" || entry.timestamp.trim() === "") {
            errors.push("timestamp is required");
        } else if (!isValidISO8601Timestamp(entry.timestamp)) {
            errors.push("timestamp must be a valid ISO 8601 timestamp");
        } else {
            const timestamp = new Date(entry.timestamp);
            const fiveMinutesFromNow = Date.now() + 5 * 60 * 1000;

            if (timestamp.getTime() > fiveMinutesFromNow) {
                errors.push("timestamp must not be more than five minutes in the future");
            }
        }
        // level
        if (typeof entry.level !== "string") {
            errors.push("level is required");
        } else if (!VALID_LEVELS.has(entry.level)) {
            errors.push(`invalid level: '${entry.level}'`);
        }

        // service
        if (typeof entry.service !== "string" || entry.service.trim() === "") {
            errors.push("service must be a non-empty string");
        }

        // message
        if (typeof entry.message !== "string" || entry.message.trim() === "") {
            errors.push("message must be a non-empty string");
        }

        // attributes
        //[] &&  null
        if (entry.attributes !== undefined) {
            if (
                typeof entry.attributes !== "object" ||
                entry.attributes === null ||
                Array.isArray(entry.attributes)
            ) {
                errors.push("attributes must be a flat object");
            } else {
                for (const [key, value] of Object.entries(entry.attributes)) {
                    if (
                        typeof value !== "string" &&
                        typeof value !== "number" &&
                        typeof value !== "boolean"
                    ) {
                        errors.push(
                            `attributes.${key} must be a string, number, or boolean`,
                        );
                    }
                }
            }
        }

        if (errors.length > 0) {
            invalid.push({
                index,
                reason: errors.join(", "),
            });
        } else {
            const log = toNewLog(entry as LogEntry)// trust: treat entry as a LogEntry."
            valid.push(log);
        }
    }

    return { valid, invalid };
}


function isValidISO8601Timestamp(value: string): boolean {
    const iso8601 =
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

    if (!iso8601.test(value)) {
        return false;
    }

    return !Number.isNaN(new Date(value).getTime());
}


function toNewLog(entry: LogEntry): NewLog {
    return {
        timestamp: new Date(entry.timestamp),
        level: entry.level,
        serviceName: entry.service,
        message: entry.message,
        attributes: entry.attributes,
    };
}


type Cursor = {
    timestamp: string;
};

export function encodeCursor(cursor: Cursor): string {
    return Buffer
        .from(JSON.stringify(cursor))
        .toString("base64url");
}

export function decodeCursor(cursor: string): Cursor {
    return JSON.parse(
        Buffer.from(cursor, "base64url").toString("utf-8")
    );
}

export function validateQueryParameter(entryQueryParameter: {}): { success: boolean; error?: string } {
    // addition handle untile since with others 
    const queryParameter = logQuerySchema.safeParse(entryQueryParameter);
    if (queryParameter.success) {
        if (queryParameter.data.since && queryParameter.data.until) {
            if (queryParameter.data.since > queryParameter.data.until) {
                return { success: true, error: "until must be later than since" };
            }
            else
                return { success: true };
        }
        return { success: true };
    }

    const errors = JSON.parse(queryParameter.error.message);

    return {
        success: false,
        error: errors.map((error: { path: string[]; message: string }) => ({
            path: error.path.join("."),
            message: error.message,
        }))
    };
}