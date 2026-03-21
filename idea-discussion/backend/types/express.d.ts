/**
 * Express Request 型拡張
 *
 * 目的: req.user の型定義を追加し、認証ミドルウェアで設定されるユーザー情報を型安全に参照できるようにする。
 */

declare namespace Express {
  interface Request {
    user?: {
      id: unknown;
      email: string;
      role: string;
    };
  }
}
