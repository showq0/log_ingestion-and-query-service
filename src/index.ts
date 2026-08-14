import express from "express";
import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import { validateLogs, validateQueryParameter, validateAggQueryParameter } from "./utils.js"
import { config } from "./config.js";
import { createLogs, filterLogs, aggregateLog } from "./db/queries/logs.js"
import { Request, Response } from "express"
import { createLogConditions, createAggLogConditions } from "./db/utils.js"

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
app.get("/logs/aggregate", aggregateLogsHandler);


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
    if (!logsValidate.data || !logsValidate.success) {
        return res.status(400).json({
            "error": logsValidate.error,
        });
    }
    const attribute: Record<string, string> = {};

    for (const [key, value] of Object.entries(obj)) {
        if (key.startsWith("attr.") && typeof value === "string") {
            const keyAttribute = key.slice(5);
            attribute[keyAttribute] = value;
        }
    }
    const conditions = createLogConditions(logsValidate.data, attribute) || undefined;
    const result = await filterLogs(conditions, limit);
    res.status(200).json({
        result: result,
    });
}

async function aggregateLogsHandler(req: Request, res: Response,) {
    // return time-buckted logs count 
    // scince(Inclusive start) , until(exclusiv end ) , bucket(1m , 5m 1d , 1h)  -> required 
    // group-by optional
    // example 
    // 07-20 and -07-22 and 1d 
    // result {12,  07-20} , {14, 07-21}. apply inclusive, exclusiv order by bucket.
    // each bucket is one row
    // a
    const obj = req.query
    const aggValidate = validateAggQueryParameter(obj);
    // attribute extract 
    const attribute: Record<string, string> = {};

    for (const [key, value] of Object.entries(obj)) {
        if (key.startsWith("attr.") && typeof value === "string") {
            const keyAttribute = key.slice(5);
            attribute[keyAttribute] = value;
        }
    }
    if (!aggValidate.success || !aggValidate.data) {
        res.status(400).json({
            "error": aggValidate.error,
        });
        return
    }
    const condtion = createAggLogConditions(aggValidate.data, attribute)

    const result = await aggregateLog(condtion, aggValidate.data.service ? true : false, aggValidate.data.bucket);
    return res.status(200).json({
        result: result,
    });
}
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

