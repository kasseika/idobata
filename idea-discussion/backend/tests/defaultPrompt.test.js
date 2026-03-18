/**
 * getDefaultPrompt コントローラーのユニットテスト
 *
 * 目的: getDefaultPrompt コントローラー関数が
 *       デフォルトのシステムプロンプトを返すことを検証する。
 * 注意: このテストはコントローラーを直接呼び出すユニットテストであり、
 *       admin認証（protect/admin ミドルウェア）の検証はルーティング層の
 *       統合テストで行う必要がある。
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
