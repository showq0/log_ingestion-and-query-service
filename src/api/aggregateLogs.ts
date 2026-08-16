import { validateAggQueryParameter } from "../utils.js";
import { Request, Response } from "express";
import { createAggLogConditions } from "../db/utils.js";
import { aggregateLog } from "../db/queries/logs.js";

export async function aggregateLogsHandler(req: Request, res: Response) {
  // return time-buckted logs count
  // each bucket is one row
  const obj = req.query;
  const aggValidate = validateAggQueryParameter(obj);
  // attribute extract
  const attribute: Record<string, string> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith("attr.") && typeof value === "string") {
      const keyAttribute = key.slice(5);
      attribute[keyAttribute] = value;
    }
  }
  if (!aggValidate.success || !aggValidate.data) {
    res.status(400).json({
      error: aggValidate.error,
    });
    return;
  }
  const condtion = createAggLogConditions(aggValidate.data, attribute);

  const result = await aggregateLog(
    condtion,
    aggValidate.data.service ? true : false,
    aggValidate.data.bucket,
  );
  return res.status(200).json({
    result: result,
  });
}
