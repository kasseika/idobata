import express from "express";
import { importGenericDataByTheme } from "../controllers/importController.js";

const router = express.Router({ mergeParams: true });

// 汎用データインポート: 大容量データを受け取るため 10MB 制限を適用
router.use(express.json({ limit: "10mb" }));

router.post("/generic", importGenericDataByTheme);

export default router;
