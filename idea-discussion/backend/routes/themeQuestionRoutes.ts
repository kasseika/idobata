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

router.use(express.json());

router.get("/", getQuestionsByTheme);

router.get("/:questionId/details", getQuestionDetails);

// 生成系は LLM の費用がかかり、結果が公開されるため管理者だけに許可する
router.post(
  "/:questionId/generate-policy",
  protect,
  admin,
  triggerPolicyGeneration
);

router.post(
  "/:questionId/generate-digest",
  protect,
  admin,
  triggerDigestGeneration
);

router.post(
  "/:questionId/generate-visual-report",
  protect,
  admin,
  triggerVisualReportGeneration
);
router.post(
  "/:questionId/generate-report",
  protect,
  admin,
  triggerReportGeneration
);
router.post(
  "/:questionId/generate-debate-analysis",
  protect,
  admin,
  triggerDebateAnalysisGeneration
);

router.get("/:questionId/visual-report", getVisualReport);

export default router;
