import {
  ValidationResult,
  logSchema,
  logAggrigatorSchema,
  logQuerySchema,
  Cursor,
} from "./type.js";

import { z } from "zod";

export function validateLogs(logs: unknown[]): ValidationResult {
  return logs.reduce<ValidationResult>(
    (result, log, index) => {
      const parseLog = logSchema.safeParse(log);

      if (parseLog.success) {
        result.valid.push(parseLog.data);
      } else {
        result.invalid.push({
          index,
          reason: parseLog.error.issues
            .map((issue) => `${String(issue.path[0])}: ${issue.message}`)
            .join(", "),
        });
      }
      return result;
    },
    {
      valid: [],
      invalid: [],
    },
  );
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodeCursor(cursor: string): Cursor {
  return JSON.parse(Buffer.from(cursor, "base64url").toString("utf-8"));
}

export function validateQueryParameter(entryQueryParameter: unknown): {
  success: boolean;
  error?: string;
  data?: z.infer<typeof logQuerySchema>;
} {
  // addition handle untile since with others
  const queryParameter = logQuerySchema.safeParse(entryQueryParameter);
  if (queryParameter.success) {
    if (queryParameter.data.since && queryParameter.data.until) {
      if (queryParameter.data.since > queryParameter.data.until) {
        return { success: true, error: "until must be later than since" };
      } else return { success: true, data: queryParameter.data };
    }
    return { success: true, data: queryParameter.data };
  }

  const errors = JSON.parse(queryParameter.error.message);

  return {
    success: false,
    error: errors.map((error: { path: string[]; message: string }) => ({
      path: error.path.join("."),
      message: error.message,
    })),
  };
}

export function validateAggQueryParameter(entryQueryParameter: unknown): {
  success: boolean;
  error?: string;
  data?: z.infer<typeof logAggrigatorSchema>;
} {
  const queryParameter = logAggrigatorSchema.safeParse(entryQueryParameter);
  if (queryParameter.success) {
    if (queryParameter.data.since > queryParameter.data.until) {
      return { success: true, error: "until must be later than since" };
    }
    return { success: true, data: queryParameter.data };
  }
  const errors = JSON.parse(queryParameter.error.message);

  return {
    success: false,
    error: errors.map((error: { path: string[]; message: string }) => ({
      path: error.path.join("."),
      message: error.message,
    })),
  };
}
