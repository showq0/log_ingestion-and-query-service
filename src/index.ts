import express from "express";
import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import { validateLogs, validateQueryParameter } from "./utils.js"
import { config } from "./config.js";
import { createLogs, filterLogs } from "./db/queries/logs.js"
import { Request, Response } from "express"
import { cosineDistance } from "drizzle-orm";
import { createLogConditions } from "./db/utils.js"
const migrationClient = postgres(config.db.url, { max: 1 });

try {
    await migrate(drizzle(migrationClient), config.db.migrationConfig);
} catch (error) {
    console.error("Database initialization failed: \n", error);
    process.exit(1);
}

// console.log(migrationClient);
const app = express();
// alformed JSON syntax
app.use(express.json());
const PORT = 8080;

app.use(express.static("."));

app.get("/health", healthHandler);
app.post("/logs", createLogsHandler);

app.get("/logs", queryLogsHandler);



function healthHandler(req: Request, res: Response) {
    res.status(200).json({
        status: "ok",
    });

}

async function createLogsHandler(req: Request, res: Response) {
    const body = req.body;
    //validate
    const result = validateLogs(body.logs);

    if (result.valid.length === 0) {
        return res.status(400).json({
            accepted: 0,
            rejected: result.invalid,
        });
    }
    // insert valid logs
    await createLogs(result.valid);

    return res.status(201).json({
        accepted: result.valid.length,
        rejected: result.invalid
    });
}
async function queryLogsHandler(req: Request, res: Response) {
    const obj = req.query
    let limit;
    if (obj.limit) {
        limit = Number(obj.limit)
    }
    const logsValidate = validateQueryParameter(obj)
    if (!logsValidate.success) {
        res.status(200).json({
            "error": logsValidate.error,
        });
    }
    const conditions = createLogConditions(obj) || undefined;
    const result = await filterLogs(conditions, limit);
    res.status(200).json({
        result: result,
    });
}

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

