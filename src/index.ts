import express from "express";
import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import { validateLogs } from "./utils.js"
import { config } from "./config.js";
import { createLogs } from "./db/queries/logs.js"
const migrationClient = postgres(config.db.url, { max: 1 });

try {
    await migrate(drizzle(migrationClient), config.db.migrationConfig);
} catch (error) {
    console.error("Database initialization failed: \n", error);
    process.exit(1);
}

// console.log(migrationClient);
const app = express();
const PORT = 8080;

app.use(express.static("."));

app.get("/health", (req, res) => {
    res.status(200).json({
        status: "ok",
    });
});

app.post("/logs", async (req, res) => {
    const body = req.body;

    //validate
    const result = validateLogs(body);

    if (result.invalid.length > 0) {
        return res.status(400).json(result);
    }

    // insert valid logs
    // await createLogs(result.valid);
    return res.status(201).json({
        accepted: result.valid.length,
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

