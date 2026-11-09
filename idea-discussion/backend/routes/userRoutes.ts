import express from "express";
import {
  getUserInfo,
  updateUserDisplayName,
  uploadProfileImage,
} from "../controllers/userController.js";
import { rateLimiters } from "../middleware/rateLimiters.js";
import { logRequest, upload } from "../middleware/uploadMiddleware.js";

const router = express.Router();

router.use(express.json());

router.get("/:userId", getUserInfo);

// 参加者の書き込みは、参加者ごとに回数を制限する（ディスク・DB への書き込みを伴うため）
router.put("/:userId", rateLimiters.participantWrite, updateUserDisplayName);

router.post(
  "/:userId/profile-image",
  rateLimiters.participantWrite,
  logRequest,
  upload.single("profileImage"),
  uploadProfileImage
);

export default router;
