/**
 * ダイジェストドラフトモデル
 *
 * 目的: 政策ドラフト（PolicyDraft）をもとに生成された要約ドキュメントを管理する。
 * 注意: policyDraftId で元となる政策ドラフトを参照する。
 */

import mongoose from "mongoose";
import type { IDigestDraft } from "../types/index.js";

const digestDraftSchema = new mongoose.Schema<IDigestDraft>(
  {
    questionId: {
      // 対象とする `sharp_questions` のID
      type: mongoose.Schema.Types.ObjectId,
      ref: "SharpQuestion",
      required: true,
    },
    policyDraftId: {
      // 元となる `policy_drafts` のID
      type: mongoose.Schema.Types.ObjectId,
      ref: "PolicyDraft",
      required: true,
    },
    title: {
      // ダイジェストのタイトル
      type: String,
      required: true,
    },
    content: {
      // ダイジェストの本文
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

const DigestDraft = mongoose.model<IDigestDraft>(
  "DigestDraft",
  digestDraftSchema
);

export default DigestDraft;
