/**
 * getDefaultPrompt コントローラーのユニットテスト
 *
 * 目的: getDefaultPrompt コントローラー関数が
 *       デフォルトのシステムプロンプトを返すことを検証する。
 * 注意: このテストはコントローラーを直接呼び出すユニットテストであり、
 *       admin認証（protect/admin ミドルウェア）の検証はルーティング層の
 *       統合テストで行う必要がある。
 */
import type { Request, Response } from "express";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { DEFAULT_CHAT_SYSTEM_PROMPT } from "../constants/defaultPrompts.js";
import { getDefaultPrompt } from "../controllers/themeController.js";

/**
 * モック用のリクエスト・レスポンスオブジェクトを生成するヘルパー関数
 */
const createMockReqRes = () => {
  const req = {} as Request;
  const res = {
    json: vi.fn(),
    status: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return { req, res };
};

describe("getDefaultPrompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("デフォルトプロンプトをHTTP 200 JSONで返す", async () => {
    const { req, res } = createMockReqRes();

    await getDefaultPrompt(req, res);

    expect(res.status as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
    expect(res.status as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(200);
    expect(res.json as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
    const response = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(response).toHaveProperty("defaultPrompt");
  });

  test("定数 DEFAULT_CHAT_SYSTEM_PROMPT と厳密に一致するプロンプトを返す", async () => {
    const { req, res } = createMockReqRes();

    await getDefaultPrompt(req, res);

    const response = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(response.defaultPrompt).toBe(DEFAULT_CHAT_SYSTEM_PROMPT);
  });
});
