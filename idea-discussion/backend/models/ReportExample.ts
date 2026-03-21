/**
 * レポートサンプルモデル
 *
 * 目的: 重要論点に対して生成されたレポートのサンプル（導入・課題一覧）を管理する。
 * 注意: version フィールドで同一質問に対する複数バージョンを管理できる。
 */

import mongoose from "mongoose";
import type { IReportExample } from "../types/index.js";

const reportExampleSchema = new mongoose.Schema<IReportExample>(
  {
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SharpQuestion",
      required: true,
    },
    introduction: {
      type: String,
      required: true,
    },
    issues: [
      {
        title: {
          type: String,
          required: true,
        },
        description: {
          type: String,
          required: true,
        },
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

const ReportExample = mongoose.model<IReportExample>(
  "ReportExample",
  reportExampleSchema
);

export default ReportExample;
