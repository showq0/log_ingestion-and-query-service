import { describe, expect, it } from "vitest";
import { validateLogs } from "../utils.js";

describe("validate", () => {
    it("validates log entries correctly", () => {
        const logs = [
            {
                "timestamp": "1609459200",
                "service": "api",
                "level": "info",
                "message": "hola"
            },
            {
                "timestamp": "2026-07-20T14:32:01.123Z",
                "service": "api",
                "level": "info"
            },
            {
                "timestamp": "2026-07-20T14:32:01.123Z",
                "service": "api"
            },
            {
                "timestamp": "Friday, January 1, 2021 12:00 AM PST",
                "level": "info",
                "service": "api",
                "message": "hello"
            },
            {
                "timestamp": new Date().toISOString(),
                "level": "error",
                "service": "checkout",
                "message": "payment declined",
                "attributes": {
                    "user_id": "42",
                    "region": "eu-west",
                    "retries": 3
                }
            }
        ]

        const result = validateLogs(logs);

        expect(result.valid.length).toBe(1);
        expect(result.invalid.length).toBe(4);
    });
});
