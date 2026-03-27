import express from "express";
import {
  getAdminThreadsByTheme,
  getThreadByUserAndQuestion,
  getThreadByUserAndTheme,
  getThreadExtractionsByTheme,
  getThreadMessagesByTheme,
  handleNewMessageByTheme,
} from "../controllers/chatController.js";
import { admin, protect } from "../middleware/authMiddleware.js";

const router = express.Router({ mergeParams: true });

router.use(express.json());

// 管理者用: テーマのスレッド一覧取得（protect + admin 必須）
router.get("/admin/threads", protect, admin, getAdminThreadsByTheme);

// 管理者用: スレッドのメッセージ取得（protect + admin 必須）
router.get(
  "/admin/threads/:threadId/messages",
  protect,
  admin,
  getThreadMessagesByTheme
);

router.post("/messages", handleNewMessageByTheme);

router.get("/threads/:threadId/extractions", getThreadExtractionsByTheme);

router.get("/threads/:threadId/messages", getThreadMessagesByTheme);

// 既存のエンドポイント: theme IDとuser IDでスレッドを取得 (theme-level chats)
router.get("/thread", getThreadByUserAndTheme);

// 新しいエンドポイント: question IDとuser IDでスレッドを取得 (question-specific chats)
router.get("/thread-by-question", getThreadByUserAndQuestion);

export default router;
