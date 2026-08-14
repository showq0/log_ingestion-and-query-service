import { NewLog } from "./db/schema.js";

import { z } from "zod";


export const logQuerySchema = z.object({
    service: z.string().optional(),
    level: z.literal(["debug", "info", "warn", "error"]).optional(),
    since: z.iso.datetime().transform((value) => new Date(value)).optional(),
    until: z.iso.datetime().transform((value) => new Date(value)).optional(),
    q: z.string().optional(),

    limit: z.string().regex(/^\d+$/, "limit must be a number").transform(Number).refine((value) => value <= 1000, {
        message: "limit must be less than  1000",
    }).optional(),
    cursor: z.string().optional(),
});

export const logAggrigatorSchema = z.object({
    service: z.string().optional(),
    bucket: z.literal(["1m", "5m", "1h", "1d"]),
    since: z.iso.datetime().transform((value) => new Date(value)),
    until: z.iso.datetime().transform((value) => new Date(value)),
    level: z.literal(["debug", "info", "warn", "error"]).optional(),
    q: z.string().optional(),
});


const logSchema = z.object({
    timestamp: z
        .iso.datetime()
        .refine(
            (value) => new Date(value).getTime() <= Date.now() + 5 * 60 * 1000,
            {
                message: "timestamp cannot be more than 5 minutes in the future",
            },
        )
        .transform((value) => new Date(value)),
    level: z.enum(["debug", "info", "warn", "error"]),
    service: z.string(),
    message: z.string(),
    attributes: z.record(
        z.string(),
        z.union([
            z.string(),
            z.number(),
            z.boolean(),
        ]),
    ).optional(),
})

// Now add this object into an array
const logsSchema = z.array(logSchema)

type InvalidLog = {
    index: number;
    reason: string;
};

type ValidationResult = {
    valid: NewLog[];
    invalid: InvalidLog[];
};


export function validateLogs(logs: unknown[]): ValidationResult {
    let valid: NewLog[] = [];
    let invalid: InvalidLog[] = [];

    const result = logsSchema.safeParse(logs);
    if (result.success && result.data) {
        valid = result.data;
    } else {
        invalid = result.error.issues.map((issue) => ({
            index: Number(issue.path[0]),
            reason: `${String(issue.path[1])}: ${issue.message}`,
        }));
    };
    return {
        valid,
        invalid,
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

export function validateQueryParameter(entryQueryParameter: {}): { success: boolean; error?: string, data?: z.infer<typeof logQuerySchema> } {
    // addition handle untile since with others 
    const queryParameter = logQuerySchema.safeParse(entryQueryParameter);
    if (queryParameter.success) {
        if (queryParameter.data.since && queryParameter.data.until) {
            if (queryParameter.data.since > queryParameter.data.until) {
                return { success: true, error: "until must be later than since" };
            }
            else
                return { success: true, data: queryParameter.data };
        }
        return { success: true, data: queryParameter.data };
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


export function validateAggQueryParameter(entryQueryParameter: {}): { success: boolean; error?: string, data?: z.infer<typeof logAggrigatorSchema> } {

    const queryParameter = logAggrigatorSchema.safeParse(entryQueryParameter);
    if (queryParameter.success) {
        if (queryParameter.data.since > queryParameter.data.until) {
            return { success: true, error: "until must be later than since" };
        }
        return { success: true, data: queryParameter.data };
    }
    const errors = JSON.parse(queryParameter.error.message);

    return {
        success: false,
        error: errors.map((error: { path: string[]; message: string }) => ({
            path: error.path.join("."),
            message: error.message,
        }
        ))
    };
}