/**
 * 「その他の意見」の生成を起動する API（otherOpinionsController）のテスト
 *
 * 目的: issue #147 で追加する POST /api/themes/:themeId/generate-other-opinions のコントローラーが、
 *       テーマを確かめてから生成を非同期に起動し、すぐに 202 を返すことを検証する。
 *       認可とレート制限は generationRoutesAuth.test.ts・rateLimitedRoutes.test.ts で検証する。
 * 前提: Theme モデルと生成処理（otherOpinionsGenerator）はモックする。
 */
import type { Request, Response } from "express";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("../models/Theme.js", () => ({ default: { exists: vi.fn() } }));
vi.mock("../workers/otherOpinionsGenerator.js", () => ({
  generateOtherOpinions: vi.fn(),
}));

import { triggerOtherOpinionsGeneration } from "../controllers/otherOpinionsController.js";
import Theme from "../models/Theme.js";
import { generateOtherOpinions } from "../workers/otherOpinionsGenerator.js";

const themeId = "650000000000000000000001";

/** ステータスと本文を記録するレスポンスのモック */
const createResponse = () => {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status: vi.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: vi.fn((body: unknown) => {
      res.body = body;
      return res;
    }),
  };
  return res;
};

/** コントローラーを呼び、非同期に起動された処理まで待つ */
const callController = async (params: { themeId: string }) => {
  const res = createResponse();
  await triggerOtherOpinionsGeneration(
    { params } as unknown as Request,
    res as unknown as Response
  );
  // setTimeout(…, 0) で起動した生成処理を実行させる
  await new Promise((resolve) => setTimeout(resolve, 0));
  return res;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(generateOtherOpinions).mockResolvedValue({} as never);
});

describe("triggerOtherOpinionsGeneration", () => {
  test("テーマがあれば、生成を起動して 202 を返すこと", async () => {
    vi.mocked(Theme.exists).mockResolvedValue({ _id: themeId } as never);

    const res = await callController({ themeId });

    expect(res.statusCode).toBe(202);
    expect(generateOtherOpinions).toHaveBeenCalledWith(themeId);
  });

  test("テーマ ID の形式が正しくなければ、生成を起動せずに 400 を返すこと", async () => {
    const res = await callController({ themeId: "研修テーマ" });

    expect(res.statusCode).toBe(400);
    expect(generateOtherOpinions).not.toHaveBeenCalled();
  });

  test("テーマが見つからなければ、生成を起動せずに 404 を返すこと", async () => {
    vi.mocked(Theme.exists).mockResolvedValue(null);

    const res = await callController({ themeId });

    expect(res.statusCode).toBe(404);
    expect(generateOtherOpinions).not.toHaveBeenCalled();
  });

  test("生成が失敗しても、起動の応答（202）には影響しないこと", async () => {
    vi.mocked(Theme.exists).mockResolvedValue({ _id: themeId } as never);
    vi.mocked(generateOtherOpinions).mockRejectedValue(
      new Error("LLM の呼び出しに失敗しました")
    );

    const res = await callController({ themeId });

    expect(res.statusCode).toBe(202);
  });
});
