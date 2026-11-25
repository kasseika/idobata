import express from "express";
import {
  getQuestionDetails,
  getQuestionsByTheme,
  getVisualReport,
  triggerDebateAnalysisGeneration,
  triggerDigestGeneration,
  triggerPolicyGeneration,
  triggerReportGeneration,
  triggerVisualReportGeneration,
} from "../controllers/questionController.js";
import {
  admin,
  optionalProtect,
  protect,
} from "../middleware/authMiddleware.js";
import {
  hideOutputsOfHiddenQuestion,
  rejectGenerationForHiddenQuestion,
} from "../middleware/minContributorsGuard.js";
import { rateLimiters } from "../middleware/rateLimiters.js";
import {
  hideUnpublishedTheme,
  requireQuestionInTheme,
} from "../middleware/themeVisibilityGuard.js";

const router = express.Router({ mergeParams: true });

// 参加者に見せていないテーマ（draft・archived）の論点は、非管理者に返さない（issue #151）
router.get("/", optionalProtect, hideUnpublishedTheme, getQuestionsByTheme);

// 論点を個別に返す API では、URL のテーマに属さない論点も返さない（issue #151）
router.get(
  "/:questionId/details",
  optionalProtect,
  hideUnpublishedTheme,
  requireQuestionInTheme,
  getQuestionDetails
);

// 生成系は LLM の費用がかかり、結果が公開されるため管理者だけに許可する。
// 最小寄与人数 k が有効なテーマで k 未満の論点では、生成させない（issue #146）。
// 未認証のリクエストでボディを読まないよう、パーサーより先に認可する
router.post(
  "/:questionId/generate-policy",
  protect,
  admin,
  rejectGenerationForHiddenQuestion,
  rateLimiters.generation,
  express.json(),
  triggerPolicyGeneration
);

router.post(
  "/:questionId/generate-digest",
  protect,
  admin,
  rejectGenerationForHiddenQuestion,
  rateLimiters.generation,
  express.json(),
  triggerDigestGeneration
);

router.post(
  "/:questionId/generate-visual-report",
  protect,
  admin,
  rejectGenerationForHiddenQuestion,
  rateLimiters.generation,
  express.json(),
  triggerVisualReportGeneration
);
router.post(
  "/:questionId/generate-report",
  protect,
  admin,
  rejectGenerationForHiddenQuestion,
  rateLimiters.generation,
  express.json(),
  triggerReportGeneration
);
router.post(
  "/:questionId/generate-debate-analysis",
  protect,
  admin,
  rejectGenerationForHiddenQuestion,
  rateLimiters.generation,
  express.json(),
  triggerDebateAnalysisGeneration
);

// 最小寄与人数 k が有効なテーマで k 未満の論点の生成物は、公開の取得 API でも返さない（issue #146）
router.get(
  "/:questionId/visual-report",
  optionalProtect,
  hideUnpublishedTheme,
  requireQuestionInTheme,
  hideOutputsOfHiddenQuestion,
  getVisualReport
);

export default router;
