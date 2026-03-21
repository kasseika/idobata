/**
 * ユーザーモデル
 *
 * 目的: フロントエンドからアクセスするユーザー情報（表示名・プロフィール画像）を管理する。
 * 注意: userId はフロントエンドが生成する一意の文字列識別子（MongoDB の _id とは別物）。
 */

import mongoose from "mongoose";
import type { IUser } from "../types/index.js";

const UserSchema = new mongoose.Schema<IUser>({
  userId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  displayName: {
    type: String,
    default: null,
  },
  profileImagePath: {
    type: String,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

UserSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

export default mongoose.model<IUser>("User", UserSchema);
