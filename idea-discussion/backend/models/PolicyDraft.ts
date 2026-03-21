/**
 * 政策ドラフトモデル
 *
 * 目的: 重要論点に対して生成された政策提言ドラフトを管理する。
 * 注意: version フィールドで同一質問に対する複数バージョンを管理できる。
 */

import mongoose from "mongoose";
import type { IPolicyDraft } from "../types/index.js";

const policyDraftSchema = new mongoose.Schema<IPolicyDraft>(
  {
    questionId: {
      // 対象とする `sharp_questions` のID
      type: mongoose.Schema.Types.ObjectId,
      ref: "SharpQuestion",
      required: true,
    },
    title: {
      // 政策ドラフトのタイトル
      type: String,
      required: true,
    },
    content: {
      // 政策ドラフトの本文
      type: String,
      required: true,
    },
    sourceProblemIds: [
      {
        // 参考にした `problems` のIDリスト
        type: mongoose.Schema.Types.ObjectId,
        ref: "Problem",
      },
    ],
    sourceSolutionIds: [
      {
        // 参考にした `solutions` のIDリスト
        type: mongoose.Schema.Types.ObjectId,
        ref: "Solution",
      },
    ],
    version: {
      // バージョン番号
      type: Number,
      required: true,
      default: 1,
    },
  },
  { timestamps: true }
); // createdAt, updatedAt を自動追加

const PolicyDraft = mongoose.model<IPolicyDraft>(
  "PolicyDraft",
  policyDraftSchema
);

export default PolicyDraft;
