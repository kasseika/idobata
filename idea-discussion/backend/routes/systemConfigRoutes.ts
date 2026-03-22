/**
 * システム設定ルート
 *
 * 目的: OpenRouter APIキーなどのシステム設定を管理するエンドポイントを定義する。
 * 注意: GET/PUTともにadmin権限が必要。
 */

import express from "express";
import {
  deleteOpenrouterApiKey,
  getSystemConfig,
  updateSystemConfig,
} from "../controllers/systemConfigController.js";
import { admin, protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", protect, admin, getSystemConfig);

router.put("/", protect, admin, updateSystemConfig);

router.delete("/", protect, admin, deleteOpenrouterApiKey);

export default router;
