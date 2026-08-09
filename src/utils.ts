type LogEntry = {
    timestamp: string;
    level: "debug" | "info" | "warn" | "error";
    service: string;
    message: string;
    attributes?: Record<string, string | number | boolean>;
};

type InvalidLog = {
    log: unknown;
    errors: string[];
};

type ValidationResult = {
    valid: LogEntry[];
    invalid: InvalidLog[];
};

const VALID_LEVELS = new Set(["debug", "info", "warn", "error"]);

export function validateLogs(logs: unknown[]): ValidationResult {
    const valid: LogEntry[] = [];
    const invalid: InvalidLog[] = [];

    for (const log of logs) {
        const errors: string[] = [];

        if (typeof log !== "object" || log === null || Array.isArray(log)) {
            invalid.push({
                log,
                errors: ["Log entry must be an object"],
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
                log,
                errors,
            });
        } else {
            valid.push(entry as LogEntry); // trust: treat entry as a LogEntry."
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