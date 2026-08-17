import type { MigrationConfig } from "drizzle-orm/migrator";

const HOST = process.env["HOST"] ?? "localhost"

const migrationConfig: MigrationConfig = {
    migrationsFolder: "./drizzle",
};

export type APIConfig = {
    fileserverHits: number;
    port: number;
    platform: string,
};
type DBConfig = {
    url: string;
    migrationConfig: MigrationConfig;
};
type Config = {
    api: APIConfig;
    db: DBConfig;
};

export const config: Config = {
    api: {
        fileserverHits: 0,
        port: Number(process.env["PORT"] ?? 8080),
        platform: process.env["PLATFORM"]!
    }
    ,
    db: {
        url: `postgres://postgres:postgres@${HOST}:5432/logs_db?sslmode=disable`,
        migrationConfig: migrationConfig,
    },
};