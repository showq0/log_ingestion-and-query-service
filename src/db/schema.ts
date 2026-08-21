import {
    uuid,
    jsonb,
    pgTable,
    primaryKey,
    text,
    timestamp,
    index,
} from "drizzle-orm/pg-core";

export const logs = pgTable("logs", {
    id: uuid("id").notNull().defaultRandom(),

    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),

    level: text("level").notNull(),

    service: text("service").notNull(),

    message: text("message").notNull(),

    attributes: jsonb("attributes"),
},
    (table) => [
        primaryKey({ name: "logs_timestamp_id_pk", columns: [table.timestamp, table.id] }),

        index("logs_service_timestamp_id_idx").on(table.service, table.timestamp.desc(), table.id.desc()),

        index("logs_level_timestamp_idx").on(table.level)
    ]

);

export type NewLog = typeof logs.$inferInsert;
