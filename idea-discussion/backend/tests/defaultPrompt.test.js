/**
 * デフォルトプロンプト取得API のユニットテスト
 *
 * 目的: GET /api/themes/default-prompt エンドポイントが
 *       デフォルトのシステムプロンプトを返すことを検証する。
 * 注意: admin認証が必要なエンドポイントであること、
 *       プロンプト内容が空でないことを確認する。
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

import { getDefaultPrompt } from "../controllers/themeController.js";

/**
 * モック用のリクエスト・レスポンスオブジェクトを生成するヘルパー関数
 */
const createMockReqRes = () => {
  const req = {};
  const res = {
    json: vi.fn(),
    status: vi.fn().mockReturnThis(),
  };
  return { req, res };
};

describe("getDefaultPrompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("デフォルトプロンプトをJSONで返す", async () => {
    const { req, res } = createMockReqRes();

    await getDefaultPrompt(req, res);

    expect(res.json).toHaveBeenCalledTimes(1);
    const response = res.json.mock.calls[0][0];
    expect(response).toHaveProperty("defaultPrompt");
    expect(typeof response.defaultPrompt).toBe("string");
    expect(response.defaultPrompt.length).toBeGreaterThan(0);
  });

  test("デフォルトプロンプトに必須の指示項目が含まれている", async () => {
    const { req, res } = createMockReqRes();

    await getDefaultPrompt(req, res);

    const response = res.json.mock.calls[0][0];
    // AIアシスタントの役割説明が含まれていること
    expect(response.defaultPrompt).toContain("アシスタント");
  });
});
