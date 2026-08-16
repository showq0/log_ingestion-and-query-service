import { z } from "zod";
import { NewLog } from "./db/schema.js";
import { sql } from "drizzle-orm";

export const logQuerySchema = z.object({
  service: z.string().optional(),
  level: z.literal(["debug", "info", "warn", "error"]).optional(),
  since: z.iso
    .datetime()
    .transform((value) => new Date(value))
    .optional(),
  until: z.iso
    .datetime()
    .transform((value) => new Date(value))
    .optional(),
  q: z.string().optional(),

  limit: z
    .string()
    .regex(/^\d+$/, "limit must be a number")
    .transform(Number)
    .refine((value) => value <= 1000, {
      message: "limit must be less than  1000",
    })
    .optional(),
  cursor: z.string().optional(),
});

export const logAggrigatorSchema = z.object({
  service: z.string().optional(),
  bucket: z.literal(["1m", "5m", "1h", "1d"]),
  since: z.iso.datetime().transform((value) => new Date(value)),
  until: z.iso.datetime().transform((value) => new Date(value)),
  level: z.literal(["debug", "info", "warn", "error"]).optional(),
  q: z.string().optional(),
});

export const logSchema = z.object({
  timestamp: z.iso
    .datetime()
    .refine(
      (value) => new Date(value).getTime() <= Date.now() + 5 * 60 * 1000,
      {
        message: "timestamp cannot be more than 5 minutes in the future",
      },
    )
    .transform((value) => new Date(value)),
  level: z.enum(["debug", "info", "warn", "error"]),
  service: z.string(),
  message: z.string(),
  attributes: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .optional(),
});

// Now add this object into an array
export const logsSchema = z.array(logSchema);

export type InvalidLog = {
  index: number;
  reason: string;
};

export type ValidationResult = {
  valid: NewLog[];
  invalid: InvalidLog[];
};

export type Cursor = {
  timestamp: string;
};
