import express from "express";
import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import { config } from "./config.js";
import { Request, Response } from "express"
import { createLogsHandler } from "./api/ingestLogs.js"
import { queryLogsHandler } from "./api/queryLogs.js"
import { aggregateLogsHandler } from "./api/aggregateLogs.js"
import errorsHandling from "./middlewares/errors-handling.js"


const app = express();

// alformed JSON syntax
app.use(express.json());
const PORT = config.api.port;

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
    const migrationClient = postgres(config.db.url, { max: 1, });

    try {
        //Verify database connection
        await migrationClient`SELECT 1`;

        console.log("Database connection established");

        // try migrations
        await migrate(
            drizzle(migrationClient),
            config.db.migrationConfig,
        );

        console.log("Database migrations completed");

        // start 
        // app.listen(PORT, () => {
        //     console.log(`Server is running on port ${PORT}`);
        // });
        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
    } catch (error) {
        console.error("Database initialization failed:", error);

        // Close DB connection
        await migrationClient.end();

        process.exit(1);
    }
}

startServer();
