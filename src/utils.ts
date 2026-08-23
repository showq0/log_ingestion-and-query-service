import { ValidationResult, logSchema, logAggrigatorSchema, logQuerySchema, Cursor } from "./type.js"
import errors from "./errors.js";
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
    try {
        const decoded = Buffer.from(cursor, "base64url").toString("utf8");
        const parsed = JSON.parse(decoded);
        return parsed;
    } catch {
        throw new errors.BadRequestError("Invalid cursor");
    }
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

export function validateAggQueryParameter(
    entryQueryParameter: Record<string, unknown>
): {
    success: boolean;
    error?: unknown;
    data?: z.infer<typeof logAggrigatorSchema>;
} {
    const queryParameter =
        logAggrigatorSchema.safeParse(entryQueryParameter);

    if (!queryParameter.success) {
        return {
            success: false,
            error: queryParameter.error.issues.map((error) => ({
                path: error.path.join("."),
                message: error.message,
            })),
        };
    }

    if (queryParameter.data.since >= queryParameter.data.until) {
        return {
            success: false,
            error: [
                {
                    path: "until",
                    message: "until must be later than since",
                },
            ],
        };
    }

    return {
        success: true,
        data: queryParameter.data,
    };
}