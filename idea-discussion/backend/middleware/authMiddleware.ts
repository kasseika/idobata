/**
 * 認証ミドルウェア
 *
 * 目的: JWT トークンを検証し、req.user に認証済みユーザー情報を設定する。
 * 注意: protect は必須認証（未認証時 401 を返す）。
 *       admin は管理者権限チェック（admin 以外は 403）。
 *       optionalProtect はトークンがない・無効でもエラーにせず next() を呼ぶ。
 */

import type { NextFunction, Request, Response } from "express";
import AdminUser from "../models/AdminUser.js";
import authService from "../services/auth/authService.js";

export const protect = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ message: "認証が必要です" });
      return;
    }

    const token = authHeader.split(" ")[1];

    try {
      const decoded = authService.verifyToken(token);

      const user = await AdminUser.findById(decoded.id);

      if (!user) {
        res.status(401).json({ message: "ユーザーが見つかりません" });
        return;
      }

      req.user = {
        id: user._id,
        email: user.email,
        role: user.role,
      };

      next();
    } catch {
      res.status(401).json({ message: "トークンが無効です" });
    }
  } catch (error) {
    console.error("[AuthMiddleware] Protect error:", error);
    res.status(500).json({ message: "サーバーエラーが発生しました" });
  }
};

export const admin = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (req.user && req.user.role === "admin") {
    next();
  } else {
    res.status(403).json({ message: "管理者権限が必要です" });
  }
};

/**
 * トークンがあれば検証して req.user を設定するが、
 * トークンがない・無効でもエラーにせず next() を呼ぶ任意認証ミドルウェア。
 * 公開エンドポイントで管理者権限に応じて挙動を変えたい場合に使用する。
 */
export const optionalProtect = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      next();
      return;
    }

    const token = authHeader.split(" ")[1];

    try {
      const decoded = authService.verifyToken(token);
      const user = await AdminUser.findById(decoded.id);

      if (user) {
        req.user = {
          id: user._id,
          email: user.email,
          role: user.role,
        };
      }
    } catch {
      // トークンが無効でも続行
    }

    next();
  } catch (error) {
    console.error("[AuthMiddleware] OptionalProtect error:", error);
    next();
  }
};
