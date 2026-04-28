import { testConnection, triggerJob } from "../services/jenkinsService.js";
import type { Request, Response } from "express";
import { asObjectRecord } from "../utils/guards.js";

export function testHandler(_req: Request, res: Response) {
  return res.json({
    success: true,
    message: "Jenkins routes are working",
    timestamp: new Date().toISOString(),
  });
}

export async function testConnectionHandler(_req: Request, res: Response) {
  try {
    const payload = await testConnection();
    return res.json(payload);
  } catch (error) {
    return res.status(error?.statusCode || 500).json({
      success: false,
      message: error?.message || "Jenkins server is not reachable",
      code: error?.code,
    });
  }
}

export async function triggerJobHandler(req: Request, res: Response) {
  try {
    const payload = await triggerJob(asObjectRecord(req.body));
    return res.json(payload);
  } catch (error) {
    return res.status(error?.response?.status || error?.statusCode || 500).json({
      success: false,
      message: error?.response?.statusText || error?.message || "Jenkins trigger failed",
      details: error?.response?.data || null,
    });
  }
}
