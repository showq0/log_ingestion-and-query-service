CREATE TABLE "logs" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"level" text NOT NULL,
	"service" text NOT NULL,
	"message" text NOT NULL,
	"attributes" jsonb,
	CONSTRAINT "logs_timestamp_id_pk" PRIMARY KEY("timestamp","id","service")
);
CREATE INDEX "logs_level_timestamp_idx" ON "logs" USING btree ("level" DESC NULLS LAST,"id" DESC NULLS LAST);
CREATE INDEX "logs_service_timestamp_id_idx" ON "logs" USING btree ("service","timestamp" DESC NULLS LAST,"id" DESC NULLS LAST);
