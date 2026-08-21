import { createClient } from "@clickhouse/client";
import { config } from "../config.js";
export const client = createClient({
    url: config.clickhouse.url,
    database: config.clickhouse.database,
    clickhouse_settings: {
        wait_end_of_query: 1,
        async_insert: 0,
        wait_for_async_insert: 0, // irrelevant when async_insert=0
    }
    // clickhouse_settings: {
    //     wait_end_of_query: 1,
    //     async_insert: 0,
    // },
});
