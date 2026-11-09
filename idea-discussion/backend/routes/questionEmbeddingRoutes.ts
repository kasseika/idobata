import express from "express";
import {
  clusterQuestion,
  generateQuestionEmbeddings,
  searchQuestion,
} from "../controllers/embeddingController.js";
import { admin, protect } from "../middleware/authMiddleware.js";

const router = express.Router({ mergeParams: true });

router.use(express.json());

// 埋め込み生成は外部APIを呼び出すため、クラスタリングと同じく管理者だけに許可する
router.post("/embeddings/generate", protect, admin, generateQuestionEmbeddings);

router.get("/search", searchQuestion);

router.post("/cluster", protect, admin, clusterQuestion);

export default router;
