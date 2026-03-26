import express from "express";
import {
  createTheme,
  deleteTheme,
  emergencyUpdatePipelineConfig,
  getAllThemes,
  getDefaultPrompt,
  getPipelineDefaults,
  getThemeById,
  getThemeDetail,
  updateTheme,
} from "../controllers/themeController.js";
import {
  exportTheme,
  importTheme,
} from "../controllers/themeExportController.js";
import {
  admin,
  optionalProtect,
  protect,
} from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/default-prompt", protect, admin, getDefaultPrompt);
router.get("/pipeline-defaults", protect, admin, getPipelineDefaults);

router.get("/", optionalProtect, getAllThemes);

router.get("/:themeId", optionalProtect, getThemeById);

router.get("/:themeId/detail", optionalProtect, getThemeDetail);

router.post("/", protect, admin, createTheme);

router.put("/:themeId", protect, admin, updateTheme);

// 公開中テーマのパイプライン設定緊急修正（変更ログ記録付き）
router.post(
  "/:themeId/pipeline-config/emergency-update",
  protect,
  admin,
  emergencyUpdatePipelineConfig
);

router.delete("/:themeId", protect, admin, deleteTheme);

// テーマのエクスポート/インポート
router.get("/:themeId/export", protect, admin, exportTheme);
router.post("/import", protect, admin, importTheme);

export default router;
