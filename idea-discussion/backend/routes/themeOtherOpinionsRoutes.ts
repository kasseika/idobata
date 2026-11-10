/**
 * 「その他の意見」の生成ルート
 *
 * 目的: POST /api/themes/:themeId/generate-other-opinions を提供する（issue #147）。
 * 注意: 生成は LLM の費用がかかり、結果が公開されるため管理者だけに許可する。
 *       未認証のリクエストでボディを読まないよう、パーサーより先に認可する。
 */
import express from "express";
import { triggerOtherOpinionsGeneration } from "../controllers/otherOpinionsController.js";
import { admin, protect } from "../middleware/authMiddleware.js";
import { rateLimiters } from "../middleware/rateLimiters.js";

const router = express.Router({ mergeParams: true });

router.use(protect, admin, rateLimiters.generation);

router.use(express.json());

router.post("/", triggerOtherOpinionsGeneration);

export default router;
