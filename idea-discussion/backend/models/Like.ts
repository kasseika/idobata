/**
 * いいねモデル
 *
 * 目的: 重要論点・課題・解決策へのいいねを管理する。
 * 注意: (targetType, targetId, userId) の複合ユニーク制約により重複いいねを防止する。
 */

import mongoose from "mongoose";
import type { ILike } from "../types/index.js";

const likeSchema = new mongoose.Schema<ILike>(
  {
    userId: {
      type: String,
      required: true,
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    targetType: {
      type: String,
      required: true,
      enum: ["question", "problem", "solution"], // Support for problems and solutions
    },
  },
  { timestamps: true }
);

likeSchema.index({ targetType: 1, targetId: 1, userId: 1 }, { unique: true });

const Like = mongoose.model<ILike>("Like", likeSchema);

export default Like;
