import express from "express";
import {
  createAdminUser,
  getCurrentUser,
  getSetupStatus,
  initializeAdminUser,
  login,
} from "../controllers/authController.js";
import { admin, protect } from "../middleware/authMiddleware.js";
import { rateLimiters } from "../middleware/rateLimiters.js";

const router = express.Router();

router.use(express.json());

router.get("/setup-status", getSetupStatus);
router.post("/login", rateLimiters.login, login);
router.get("/me", protect, getCurrentUser);
router.post("/users", protect, admin, createAdminUser);
router.post("/initialize", rateLimiters.login, initializeAdminUser);

export default router;
