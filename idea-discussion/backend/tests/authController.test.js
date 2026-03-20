/**
 * authController のユニットテスト
 *
 * 目的: getSetupStatus エンドポイントが AdminUser の存在有無に応じて
 *       セットアップ必要性を正しくレスポンスとして返すことを検証する。
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

// AdminUser モデルのモック
vi.mock("../models/AdminUser.js", () => ({
  default: {
    exists: vi.fn(),
  },
}));

// authService のモック（login テスト用。今回は不要だが依存関係のため）
vi.mock("../services/auth/authService.js", () => ({
  default: {
    authenticate: vi.fn(),
  },
}));

import { getSetupStatus } from "../controllers/authController.js";
import AdminUser from "../models/AdminUser.js";

/**
 * モック用のレスポンスオブジェクトを生成するヘルパー関数
 */
const createMockReqRes = () => {
  const req = {};
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return { req, res };
};

describe("getSetupStatus コントローラー", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("管理者ユーザーが存在しない場合", () => {
    test("needsSetup: true を返すこと", async () => {
      // exists({}) は存在しない場合 null を返す
      AdminUser.exists.mockResolvedValue(null);

      const { req, res } = createMockReqRes();
      await getSetupStatus(req, res);

      expect(res.json).toHaveBeenCalledWith({ needsSetup: true });
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe("管理者ユーザーが1人以上存在する場合", () => {
    test("needsSetup: false を返すこと", async () => {
      // exists({}) は存在する場合 { _id: ... } を返す
      AdminUser.exists.mockResolvedValue({ _id: "管理者ID001" });

      const { req, res } = createMockReqRes();
      await getSetupStatus(req, res);

      expect(res.json).toHaveBeenCalledWith({ needsSetup: false });
      expect(res.status).not.toHaveBeenCalled();
    });

    test("管理者が存在する場合も needsSetup: false を返すこと", async () => {
      AdminUser.exists.mockResolvedValue({ _id: "管理者ID002" });

      const { req, res } = createMockReqRes();
      await getSetupStatus(req, res);

      expect(res.json).toHaveBeenCalledWith({ needsSetup: false });
    });
  });

  describe("DB エラーが発生した場合", () => {
    test("ステータス 500 とエラーメッセージを返すこと", async () => {
      AdminUser.exists.mockRejectedValue(new Error("DB接続エラー"));

      const { req, res } = createMockReqRes();
      await getSetupStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: "サーバーエラーが発生しました",
      });
    });
  });
});
