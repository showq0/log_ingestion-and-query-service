import { ValidationResult, logSchema, logAggrigatorSchema, logQuerySchema, Cursor } from "./type.js"

import { z } from "zod";

export function validateLogs(logs: unknown[]): ValidationResult {
    return logs.reduce<ValidationResult>(
        (result, log, index) => {
            const parseLog = logSchema.safeParse(log);

            if (parseLog.success) {
                result.valid.push(parseLog.data);
            } else {
                result.invalid.push({
                    index,
                    reason: parseLog.error.issues
                        .map((issue) => `${String(issue.path[0])}: ${issue.message}`)
                        .join(", "),
                });
            }
            return result;
        },
        {
            valid: [],
            invalid: [],
        }
    );
}


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

export function validateQueryParameter(
    entryQueryParameter: Record<string, unknown>,
): {
    success: boolean;
    error?: unknown;
    data?: z.infer<typeof logQuerySchema>;
} {
    const queryParameter = logQuerySchema.safeParse(entryQueryParameter);

    if (!queryParameter.success) {
        // remove json parse
        const errors = queryParameter.error.issues.map((error) => ({
            path: error.path.join("."),
            message: error.message,
        }));

        return {
            success: false,
            error: errors,
        };
    }

    const { since, until } = queryParameter.data;

    if (since && until && since > until) {
        return {
            success: false,
            error: "until must be later than since",
        };
    }

    return {
        success: true,
        data: queryParameter.data,
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