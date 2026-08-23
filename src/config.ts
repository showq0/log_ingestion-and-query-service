const HOST = process.env["HOST"] ?? "localhost";

export type APIConfig = {
    fileserverHits: number;
    port: number;
    platform: string;
};

type ClickHouseConfig = {
    url: string;
    database: string;
};

type Config = {
    api: APIConfig;
    clickhouse: ClickHouseConfig;
};

export const config: Config = {
    api: {
        fileserverHits: 0,
        port: Number(process.env["PORT"] ?? 8080),
        platform: process.env["PLATFORM"] ?? "linux/arm64",
    },
    clickhouse: {
        url: process.env["CLICKHOUSE_URL"] ?? `http://${HOST}:8123`,
        database: process.env["CLICKHOUSE_DB"] ?? "logs_db",
    },
};
