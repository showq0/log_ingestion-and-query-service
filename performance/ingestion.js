import http from "k6/http";
import { check } from "k6";
import { Rate, Counter, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:8080";
const BATCH_SIZE = Number(__ENV.BATCH_SIZE || 100);

const ingestionErrors = new Rate("ingestion_errors");
const logsAccepted = new Counter("logs_accepted");
const ingestionDuration = new Trend("ingestion_request_duration", true);

export const options = {
    scenarios: {
        ingestion: {
            executor: "ramping-arrival-rate",

            // Number of POST /logs requests per second.
            startRate: 10,
            timeUnit: "1s",

            preAllocatedVUs: 50,
            maxVUs: 500,

            stages: [
                // 1,000 logs/sec
                { target: 10, duration: "10" },

                // 5,000 logs/sec
                { target: 50, duration: "20" },

                // 10,000 logs/sec
                { target: 80, duration: "20" },

                { target: 50, duration: "20s" },

                { target: 10, duration: "10s" },
            ],
        },
    },

    thresholds: {
        http_req_failed: ["rate<0.01"],
        ingestion_errors: ["rate<0.01"],
        http_req_duration: ["p(95)<1000"],
    },
};
// aggrigator 
function createLog(index) {
    return {
        timestamp: new Date().toISOString(),
        level: ["debug", "info", "warn", "error"][index % 4],
        service: ["checkout", "auth", "payments", "api"][index % 4],
        message: `performance test log ${index}`,
        attributes: {
            user_id: String(index % 10000),
            region: "test",
            retries: index % 3,
        },
    };
}

function createBatch() {
    const logs = [];

    for (let i = 0; i < BATCH_SIZE; i++) {
        logs.push(createLog(i));
    }

    return JSON.stringify({ logs });
}

export default function () {
    const response = http.post(`${BASE_URL}/logs`, createBatch(), {
        headers: {
            "Content-Type": "application/json",
        },
    });

    ingestionDuration.add(response.timings.duration);

    const success = check(response, {
        "POST /logs returns 200": (r) => r.status === 200,
        "accepted is present": (r) => {
            try {
                return typeof r.json("accepted") === "number";
            } catch {
                return false;
            }
        },
    });

    if (!success) {
        ingestionErrors.add(1);
        return;
    }

    const accepted = Number(response.json("accepted"));

    if (Number.isFinite(accepted)) {
        logsAccepted.add(accepted);
    }
}

// export function handleSummary(data) {
//     return {
//         "performance/ingestion-summary.json": JSON.stringify(data, null, 2),
//     };
// }