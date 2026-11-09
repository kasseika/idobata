import express from "express";
import { importGenericDataByTheme } from "../controllers/importController.js";
import { admin, protect } from "../middleware/authMiddleware.js";

const router = express.Router({ mergeParams: true });

// 取り込んだ意見は課題・解決策として公開されるため、管理者だけに許可する。
// 未認証のリクエストで 10MB のボディを読まないよう、パーサーより先に認可する
router.use(protect, admin);

// 汎用データインポート: 大容量データを受け取るため 10MB 制限を適用
router.use(express.json({ limit: "10mb" }));

router.post("/generic", importGenericDataByTheme);

export default router;
