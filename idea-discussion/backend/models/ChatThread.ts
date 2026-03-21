/**
 * チャットスレッドモデル
 *
 * 目的: ユーザーとAIのチャット会話履歴を管理する。
 *       抽出された課題・解決策のIDを保持し、後続のパイプライン処理に使用する。
 * 注意: userId は必須フィールド。questionId は特定の重要論点に関連するスレッドの場合のみ設定される。
 */

import mongoose from "mongoose";
import type { IChatMessage, IChatThread } from "../types/index.js";

const messageSchema = new mongoose.Schema<IChatMessage>(
  {
    role: {
      type: String,
      enum: ["user", "assistant"],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
); // Don't create separate _id for subdocuments

const chatThreadSchema = new mongoose.Schema<IChatThread>(
  {
    userId: {
      type: String,
      required: true,
      index: true, // Index userId for faster lookups
    },
    messages: {
      type: [messageSchema],
      default: [],
    },
    extractedProblemIds: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Problem", // Reference to the Problem model
        },
      ],
      default: [],
    },
    extractedSolutionIds: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Solution", // Reference to the Solution model
        },
      ],
      default: [],
    },
    sessionId: {
      // 一時的なセッション識別子（オプション）
      type: String,
      required: false,
    },
    themeId: {
      // 追加：所属するテーマのID
      type: mongoose.Schema.Types.ObjectId,
      ref: "Theme",
      required: true,
    },
    questionId: {
      // 追加：特定の質問に関連するスレッドかどうか
      type: mongoose.Schema.Types.ObjectId,
      ref: "SharpQuestion",
      required: false,
      index: true, // Index questionId for faster lookups
    },
  },
  { timestamps: true }
); // Adds createdAt and updatedAt automatically

const ChatThread = mongoose.model<IChatThread>("ChatThread", chatThreadSchema);

export default ChatThread;
