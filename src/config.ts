import type { MigrationConfig } from "drizzle-orm/migrator";

const migrationConfig: MigrationConfig = {
  migrationsFolder: "./drizzle",
};

export type APIConfig = {
  fileserverHits: number;
  port: number;
  platform: string;
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
    port: Number(process.env["PORT"])!,
    platform: process.env["PLATFORM"]!,
  },
  db: {
    url: process.env["DB_URL"]!,
    migrationConfig: migrationConfig,
  },
};
