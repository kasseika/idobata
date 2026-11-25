/**
 * チャットスレッドモデル
 *
 * 目的: ユーザーとAIのチャット会話履歴を管理する。
 *       抽出された課題・解決策のIDを保持し、後続のパイプライン処理に使用する。
 * 注意: userId は必須フィールド。questionId は特定の重要論点に関連するスレッドの場合のみ設定される。
 *       参加者の発言の origin は、他の人の意見を起点に始めた発言の場合だけ設定される（issue #177）。
 */

import mongoose from "mongoose";
import type { IChatMessage, IChatThread } from "../types/index.js";
import { chatMessageOriginSchema } from "./opinionOriginSchemas.js";

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
    origin: {
      // 他の人の意見を起点に始めた発言の場合だけ設定する（issue #177）
      type: chatMessageOriginSchema,
      required: false,
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

// 同じユーザー・同じテーマ・同じ論点のスレッドを1つに限る（issue #169）。
// questionId が無い（テーマ全体の）スレッドも、MongoDB の一意インデックスでは未設定が
// null として扱われるため、userId + themeId ごとに1つに限られる。
// 注意: 既存データに重複があるとインデックス作成が失敗する。事前に scripts/findDuplicateChatThreads.js で確認する。
chatThreadSchema.index(
  { userId: 1, themeId: 1, questionId: 1 },
  { unique: true }
);

const ChatThread = mongoose.model<IChatThread>("ChatThread", chatThreadSchema);

export default ChatThread;
