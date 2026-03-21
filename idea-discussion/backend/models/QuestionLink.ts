/**
 * 重要論点関連付けモデル
 *
 * 目的: 重要論点（SharpQuestion）と課題/解決策（Problem/Solution）の関連を管理する。
 *       linkType で「課題が重要論点を提起」「解決策が重要論点に回答」を区別する。
 * 注意: linkedItemTypeModel は linkedItemType から自動設定される（pre-save フック）。
 *       populate 時の動的参照先決定に使用する。
 */

import mongoose from "mongoose";
import type { IQuestionLink } from "../types/index.js";

const questionLinkSchema = new mongoose.Schema<IQuestionLink>(
  {
    questionId: {
      // 関連する `sharp_questions` のID
      type: mongoose.Schema.Types.ObjectId,
      ref: "SharpQuestion",
      required: true,
    },
    linkedItemId: {
      // 関連する `problems` または `solutions` のID
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      // refPath を使って動的に参照先を決定
      refPath: "linkedItemTypeModel",
    },
    linkedItemType: {
      // 関連アイテムの種類
      type: String,
      required: true,
      enum: ["problem", "solution"],
    },
    // linkedItemTypeに基づいて参照するモデル名を動的に設定するための仮想フィールド
    linkedItemTypeModel: {
      type: String,
      required: true,
      enum: ["Problem", "Solution"], // 実際のモデル名
    },
    linkType: {
      // 関連の種類 (課題が重要論点を提起 / 解決策が重要論点に回答)
      type: String,
      required: true,
      enum: ["prompts_question", "answers_question"],
    },
    relevanceScore: {
      // (任意) LLMによる関連度スコア
      type: Number,
      min: 0,
      max: 1,
    },
    rationale: {
      // (任意) LLMによる関連性の根拠説明
      type: String,
    },
  },
  { timestamps: true }
); // createdAt, updatedAt を自動追加

// linkedItemId の参照先を動的に設定するための pre-save フック
questionLinkSchema.pre("save", function (next) {
  if (this.linkedItemType === "problem") {
    this.linkedItemTypeModel = "Problem";
  } else if (this.linkedItemType === "solution") {
    this.linkedItemTypeModel = "Solution";
  } else {
    // エラーハンドリング: 予期しない linkedItemType
    next(new Error("Invalid linkedItemType specified"));
    return;
  }
  next();
});

const QuestionLink = mongoose.model<IQuestionLink>(
  "QuestionLink",
  questionLinkSchema
);

export default QuestionLink;
