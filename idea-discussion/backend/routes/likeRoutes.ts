import express from "express";
import { getLikeStatus, toggleLike } from "../controllers/likeController.js";

const router = express.Router();

router.use(express.json());

router.get("/:targetType/:targetId", getLikeStatus);

router.post("/:targetType/:targetId", toggleLike);

export default router;
