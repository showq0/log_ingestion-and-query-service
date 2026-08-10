import {
    uuid,
    jsonb,
    pgTable,
    text,
    timestamp,
} from "drizzle-orm/pg-core";

export const logs = pgTable("logs", {
    id: uuid("id").primaryKey().defaultRandom(),

    timestamp: timestamp("timestamp").notNull().defaultNow(),

    level: text("level").notNull(),

    serviceName: text("service_name").notNull(),

    message: text("message").notNull(),

    attributes: jsonb("attributes"),
});

export type NewLog = typeof logs.$inferInsert;
