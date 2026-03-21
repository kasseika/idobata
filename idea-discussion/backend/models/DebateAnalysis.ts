/**
 * 議論分析モデル
 *
 * 目的: 重要論点に対する賛否の軸・合意点・対立点を含む議論分析結果を管理する。
 * 注意: (questionId, version) の複合ユニーク制約により、同一質問の版管理を行う。
 */

import mongoose from "mongoose";
import type { IDebateAnalysis } from "../types/index.js";

const debateAnalysisSchema = new mongoose.Schema<IDebateAnalysis>(
  {
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SharpQuestion",
      required: true,
      index: true,
    },
    questionText: {
      type: String,
      required: true,
    },
    axes: [
      {
        title: String,
        options: [
          {
            label: String,
            description: String,
          },
        ],
      },
    ],
    agreementPoints: [String],
    disagreementPoints: [String],
    sourceProblemIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Problem",
      },
    ],
    sourceSolutionIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Solution",
      },
    ],
    version: {
      type: Number,
      required: true,
      default: 1,
    },
  },
  { timestamps: true }
); // createdAt, updatedAt を自動追加

debateAnalysisSchema.index({ questionId: 1, version: 1 }, { unique: true });

const DebateAnalysis = mongoose.model<IDebateAnalysis>(
  "DebateAnalysis",
  debateAnalysisSchema
);

export default DebateAnalysis;
