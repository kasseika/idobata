import express from "express";
import { getLikeStatus, toggleLike } from "../controllers/likeController.js";
import { rateLimiters } from "../middleware/rateLimiters.js";

const router = express.Router();

router.use(express.json());

router.get("/:targetType/:targetId", getLikeStatus);

// いいねの切り替えは DB に書き込むため、参加者ごとに回数を制限する
router.post(
  "/:targetType/:targetId",
  rateLimiters.participantWrite,
  toggleLike
);

export default router;
