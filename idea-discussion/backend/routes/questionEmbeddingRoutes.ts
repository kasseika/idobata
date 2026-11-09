import express from "express";
import {
  clusterQuestion,
  generateQuestionEmbeddings,
  searchQuestion,
} from "../controllers/embeddingController.js";
import { admin, protect } from "../middleware/authMiddleware.js";
import { rateLimiters } from "../middleware/rateLimiters.js";

const router = express.Router({ mergeParams: true });

// 埋め込みの生成・検索（入力文の埋め込み）は外部APIを呼び出し、クラスタリングは
// 公開される論点整理を書き換えるため、すべて管理者だけに許可する。
// このルーターは他のルーターと同じパスにマウントされるため、router.use で認可すると
// 無関係のリクエストまで拒否してしまう。ルートごとに、ボディを読む前に認可する

router.post(
  "/embeddings/generate",
  protect,
  admin,
  rateLimiters.generation,
  express.json(),
  generateQuestionEmbeddings
);

router.get("/search", protect, admin, rateLimiters.generation, searchQuestion);

router.post(
  "/cluster",
  protect,
  admin,
  rateLimiters.generation,
  express.json(),
  clusterQuestion
);

export default router;
