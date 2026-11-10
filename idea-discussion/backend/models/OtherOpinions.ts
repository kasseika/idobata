/**
 * 「その他の意見」モデル
 *
 * 目的: 重要論点に拾われなかった意見を、テーマごとにまとめた要約を管理する（issue #147）。
 * 注意: version フィールドで、同じテーマに対する複数の版を管理する（上書きせずに版を重ねる）。
 *       problemIds は要約の材料にした課題の ID で、k が有効なテーマでは参加者・管理者に返さないこと。
 */

import mongoose from "mongoose";
import type { IOtherOpinions } from "../types/index.js";

const otherOpinionsSchema = new mongoose.Schema<IOtherOpinions>(
  {
    themeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Theme",
      required: true,
      index: true,
    },
    groups: [
      {
        summary: {
          type: String,
          required: true,
        },
        problemIds: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Problem",
          },
        ],
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

const OtherOpinions = mongoose.model<IOtherOpinions>(
  "OtherOpinions",
  otherOpinionsSchema
);

export default OtherOpinions;
