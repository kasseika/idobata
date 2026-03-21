/**
 * 管理者ユーザーモデル
 *
 * 目的: 管理画面にアクセスする管理者・編集者ユーザーの認証情報を管理する。
 * 注意: password フィールドは select: false のためデフォルトクエリには含まれない。
 *       comparePassword メソッドを使用してパスワード照合を行うこと。
 */

import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import type {
  IAdminUser,
  IAdminUserMethods,
  IAdminUserModel,
} from "../types/index.js";

const adminUserSchema = new mongoose.Schema<
  IAdminUser,
  IAdminUserModel,
  IAdminUserMethods
>(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: ["admin", "editor"],
      default: "editor",
    },
    googleId: {
      type: String,
      default: null,
    },
    lastLogin: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

adminUserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  try {
    const pepperPassword = this.password + process.env.PASSWORD_PEPPER;

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(pepperPassword, salt);

    this.password = hash;
    next();
  } catch (error) {
    next(error as Error);
  }
});

adminUserSchema.methods.comparePassword = async function (
  candidatePassword: string
) {
  const pepperPassword = candidatePassword + process.env.PASSWORD_PEPPER;
  return bcrypt.compare(pepperPassword, this.password);
};

const AdminUser = mongoose.model<IAdminUser, IAdminUserModel>(
  "AdminUser",
  adminUserSchema
);

export default AdminUser;
