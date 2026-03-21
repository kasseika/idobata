/**
 * 重要論点モデル
 *
 * 目的: テーマに対して生成された "How might we..." 形式の重要論点を管理する。
 * 注意: clusteringResults は Map 型で、クラスタリング処理の結果を格納する。
 */

import mongoose from "mongoose";
import type { ISharpQuestion } from "../types/index.js";

const sharpQuestionSchema = new mongoose.Schema<ISharpQuestion>(
  {
    questionText: {
      // "How might we..." 形式の重要論点
      type: String,
      required: true,
    },
    tagLine: {
      type: String,
      required: false,
    },
    tags: {
      type: [String],
      default: [],
    },
    sourceProblemIds: [
      {
        // (任意) この重要論点の生成に使用された `problems` のIDリスト
        type: mongoose.Schema.Types.ObjectId,
        ref: "Problem",
      },
    ],
    themeId: {
      // 追加：所属するテーマのID
      type: mongoose.Schema.Types.ObjectId,
      ref: "Theme",
      required: true,
    },
    clusteringResults: {
      type: Map,
      of: Object,
      default: {},
    },
  },
  { timestamps: true }
); // createdAt, updatedAt を自動追加

const SharpQuestion = mongoose.model<ISharpQuestion>(
  "SharpQuestion",
  sharpQuestionSchema
);

export default SharpQuestion;
