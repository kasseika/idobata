/**
 * 透明性APIルート定義
 *
 * 目的: AIパイプラインの透明性情報を提供するエンドポイントを定義する。
 * エンドポイント:
 *   GET /api/transparency/pipeline-stages - 全ステージのメタデータを返す
 *   GET /api/themes/:themeId/transparency - テーマの透明性設定とステージ情報を返す
 */

import express from "express";
import {
  getPipelineStages,
  getThemeTransparency,
} from "../controllers/transparencyController.js";

const router = express.Router();

// 全パイプラインステージのメタデータを取得
router.get("/pipeline-stages", getPipelineStages);

export { getThemeTransparency };
export default router;
