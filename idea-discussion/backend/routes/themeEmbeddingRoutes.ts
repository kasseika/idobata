import express from "express";
import {
  clusterTheme,
  generateThemeEmbeddings,
  searchTheme,
} from "../controllers/embeddingController.js";
import { admin, protect } from "../middleware/authMiddleware.js";
import { rejectWhenThemeHidesOpinions } from "../middleware/minContributorsGuard.js";
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
  generateThemeEmbeddings
);

// 最小寄与人数 k が有効なテーマでは、検索結果（個々の課題文・解決策文）を管理者にも返さない（issue #146）
router.get(
  "/search",
  protect,
  admin,
  rejectWhenThemeHidesOpinions,
  rateLimiters.search,
  searchTheme
);

router.post(
  "/cluster",
  protect,
  admin,
  // k が有効なテーマでは、クラスタリング結果（個々の課題文）を管理者にも返さない（issue #146）
  rejectWhenThemeHidesOpinions,
  rateLimiters.generation,
  express.json(),
  clusterTheme
);

export default router;
