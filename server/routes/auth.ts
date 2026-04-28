import { Router } from "express";
import {
  changePasswordHandler,
  forgotPasswordHandler,
  loginHandler,
  meHandler,
  profileHandler,
  registerHandler,
  resetPasswordHandler,
} from "../controllers/authController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.post("/register", registerHandler);
router.post("/login", loginHandler);
router.get("/me", requireAuth, meHandler);
router.patch("/profile", requireAuth, profileHandler);
router.post("/forgot-password", forgotPasswordHandler);
router.post("/reset-password", resetPasswordHandler);
router.post("/change-password", requireAuth, changePasswordHandler);

export default router;
