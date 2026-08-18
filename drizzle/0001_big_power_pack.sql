CREATE EXTENSION IF NOT EXISTS timescaledb;--> statement-breakpoint
-- Interpret timestamps written by the pre-Timescale schema as UTC.
ALTER TABLE "logs" ALTER COLUMN "timestamp" SET DATA TYPE timestamp with time zone USING "timestamp" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "logs" ALTER COLUMN "timestamp" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "logs" DROP CONSTRAINT "logs_pkey";--> statement-breakpoint
ALTER TABLE "logs" ADD CONSTRAINT "logs_timestamp_id_pk" PRIMARY KEY("timestamp","id");--> statement-breakpoint
CREATE INDEX "logs_service_timestamp_idx" ON "logs" USING btree ("service","timestamp" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "logs_timestamp_idx" ON "logs" USING btree ("timestamp" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "logs_attributes_gin_idx" ON "logs" USING gin ("attributes");--> statement-breakpoint
SELECT create_hypertable(
    'logs',
    by_range('timestamp', INTERVAL '1 day'),
    if_not_exists => TRUE,
    migrate_data => TRUE
);
