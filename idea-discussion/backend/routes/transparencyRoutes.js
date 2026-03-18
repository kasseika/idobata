/**
 * 透明性APIルート定義
 *
 * 目的: AIパイプラインの透明性情報を提供するエンドポイントを定義する。
 * エンドポイント:
 *   GET /api/transparency/pipeline-stages - 全ステージのメタデータを返す
 *
 * 注意: GET /api/themes/:themeId/transparency は server.js で直接登録している。
 *       themeId パラメータが /api/themes/:themeId/* ルートグループに属するため。
 */

import express from "express";
import { getPipelineStages } from "../controllers/transparencyController.js";

const router = express.Router();

// 全パイプラインステージのメタデータを取得
router.get("/pipeline-stages", getPipelineStages);

export default router;
