import express from "express";
import {
  getSiteConfig,
  updateSiteConfig,
} from "../controllers/siteConfigController.js";
import { admin, protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", getSiteConfig);

// 認証・認可後にボディパースを実行することで、未認証リクエストに対して不要な処理を行わない
router.put("/", protect, admin, express.json(), updateSiteConfig);

export default router;
