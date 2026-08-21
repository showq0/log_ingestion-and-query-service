import express from "express";
import { config } from "./config.js";
import { Request, Response } from "express"
import { createLogsHandler } from "./api/ingestLogs.js"
import { queryLogsHandler } from "./api/queryLogs.js"
import { aggregateLogsHandler } from "./api/aggregateLogs.js"
import errorsHandling from "./middlewares/errors-handling.js"
import { client } from "./db/index.js";
import { migrate } from "./db/schema.js";


const app = express();

// alformed JSON syntax
app.use(express.json());
const PORT = config.api.port || 8080;

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
app.use(errorsHandling)

async function startServer() {
    try {
        // Verify ClickHouse connection
        const pingResult = await client.ping();
        if (!pingResult.success) {
            throw new Error("ClickHouse ping failed");
        }
        console.log("ClickHouse connection established");

        // Run DDL migration (CREATE TABLE IF NOT EXISTS)
        await migrate();

        // Start server
        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
    } catch (error) {
        console.error("Database initialization failed:", error);
        await client.close();
        process.exit(1);
    }
}

startServer();

