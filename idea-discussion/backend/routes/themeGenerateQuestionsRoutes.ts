import express from "express";
import { triggerQuestionGenerationByTheme } from "../controllers/adminController.js";
import { admin, protect } from "../middleware/authMiddleware.js";

const router = express.Router({ mergeParams: true });

// 論点の生成は LLM の費用がかかり、結果が公開されるため管理者だけに許可する。
// 未認証のリクエストでボディを読まないよう、パーサーより先に認可する
router.use(protect, admin);

router.use(express.json());

router.post("/", triggerQuestionGenerationByTheme);

export default router;
