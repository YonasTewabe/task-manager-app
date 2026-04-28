import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  listNotificationsHandler,
  unreadCountHandler,
  markReadHandler,
  markAllReadHandler,
  streamHandler,
  savePushSubscriptionHandler,
  removePushSubscriptionHandler,
} from "../controllers/notificationsController.js";

const router = Router();

router.get("/", requireAuth, listNotificationsHandler);

router.get("/unread-count", requireAuth, unreadCountHandler);

router.patch("/:id/read", requireAuth, markReadHandler);

router.patch("/read-all", requireAuth, markAllReadHandler);

router.get("/stream", streamHandler);

router.post("/push-subscriptions", requireAuth, savePushSubscriptionHandler);

router.delete("/push-subscriptions", requireAuth, removePushSubscriptionHandler);

export default router;
