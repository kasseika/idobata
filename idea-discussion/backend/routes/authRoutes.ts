import express from "express";
import {
  createAdminUser,
  getCurrentUser,
  getSetupStatus,
  initializeAdminUser,
  login,
} from "../controllers/authController.js";
import { admin, protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(express.json());

router.get("/setup-status", getSetupStatus);
router.post("/login", login);
router.get("/me", protect, getCurrentUser);
router.post("/users", protect, admin, createAdminUser);
router.post("/initialize", initializeAdminUser);

export default router;
