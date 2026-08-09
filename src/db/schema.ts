import {
    bigint,
    jsonb,
    pgTable,
    text,
    timestamp,
} from "drizzle-orm/pg-core";

export const logs = pgTable("logs", {
    id: bigint("id", { mode: "number" }).primaryKey(),

    timestamp: timestamp("timestamp").notNull().defaultNow(),

    level: text("level").notNull(),

    serviceName: text("service_name").notNull(),

    message: text("message").notNull(),

    attributes: jsonb("attributes"),
});

export type NewLog = typeof logs.$inferInsert;
