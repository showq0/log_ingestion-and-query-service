import { createClient } from "@clickhouse/client";
import { config } from "../config.js";
export const client = createClient({
    url: config.clickhouse.url,
    database: config.clickhouse.database,
});
