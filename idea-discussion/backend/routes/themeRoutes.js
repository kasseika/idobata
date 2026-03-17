import express from "express";
import {
  createTheme,
  deleteTheme,
  getAllThemes,
  getThemeById,
  getThemeDetail,
  updateTheme,
} from "../controllers/themeController.js";
import { admin, protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", getAllThemes);

router.get("/:themeId", getThemeById);

router.get("/:themeId/detail", getThemeDetail);

router.post("/", protect, admin, createTheme);

router.put("/:themeId", protect, admin, updateTheme);

router.delete("/:themeId", protect, admin, deleteTheme);

export default router;
