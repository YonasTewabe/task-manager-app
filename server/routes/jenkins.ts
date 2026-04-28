import express from "express";
import {
  testConnectionHandler,
  testHandler,
  triggerJobHandler,
} from "../controllers/jenkinsController.js";

const router = express.Router();
router.get("/test", testHandler);
router.get("/test-connection", testConnectionHandler);
router.post("/trigger-job", triggerJobHandler);

export default router;
