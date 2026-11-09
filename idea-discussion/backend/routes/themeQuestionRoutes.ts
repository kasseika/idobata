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
import { admin, protect } from "../middleware/authMiddleware.js";

const router = express.Router({ mergeParams: true });

router.get("/", getQuestionsByTheme);

router.get("/:questionId/details", getQuestionDetails);

// 生成系は LLM の費用がかかり、結果が公開されるため管理者だけに許可する。
// 未認証のリクエストでボディを読まないよう、パーサーより先に認可する
router.post(
  "/:questionId/generate-policy",
  protect,
  admin,
  express.json(),
  triggerPolicyGeneration
);

router.post(
  "/:questionId/generate-digest",
  protect,
  admin,
  express.json(),
  triggerDigestGeneration
);

router.post(
  "/:questionId/generate-visual-report",
  protect,
  admin,
  express.json(),
  triggerVisualReportGeneration
);
router.post(
  "/:questionId/generate-report",
  protect,
  admin,
  express.json(),
  triggerReportGeneration
);
router.post(
  "/:questionId/generate-debate-analysis",
  protect,
  admin,
  express.json(),
  triggerDebateAnalysisGeneration
);

router.get("/:questionId/visual-report", getVisualReport);

export default router;
