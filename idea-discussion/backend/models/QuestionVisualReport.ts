/**
 * 重要論点ビジュアルレポートモデル
 *
 * 目的: 重要論点に対して生成されたビジュアル表示用のレポートを管理する。
 * 注意: (questionId, version) の複合ユニーク制約により、同一質問の版管理を行う。
 */

import mongoose from "mongoose";
import type { IQuestionVisualReport } from "../types/index.js";

const questionVisualReportSchema = new mongoose.Schema<IQuestionVisualReport>(
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
    overallAnalysis: {
      type: String,
      required: true,
    },
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

questionVisualReportSchema.index(
  { questionId: 1, version: 1 },
  { unique: true }
);

const QuestionVisualReport = mongoose.model<IQuestionVisualReport>(
  "QuestionVisualReport",
  questionVisualReportSchema
);

export default QuestionVisualReport;
