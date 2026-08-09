CREATE TABLE "logs" (
	"id" bigint PRIMARY KEY NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"level" text NOT NULL,
	"service_name" text NOT NULL,
	"message" text NOT NULL,
	"attributes" jsonb
);
