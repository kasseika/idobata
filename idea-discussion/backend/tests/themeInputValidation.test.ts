/**
 * テーマ作成・更新 API の入力検証のテスト
 *
 * 目的: issue #149 の対応として、createTheme・updateTheme が想定外の型の値を受け取ったとき、
 *       400 を返し、DB への書き込み（Theme の作成・更新）を行わないことを検証する。
 *       あわせて、正しい値なら従来どおり保存されることも確認し、テストが書き込みを検知できることを示す。
 */
import type { Request, Response } from "express";
import { beforeEach, describe, expect, test, vi } from "vitest";

// createTheme は `new Theme(...).save()` を呼ぶため、コンストラクタとして呼べる class でモックする
vi.mock("../models/Theme.js", () => {
  const ThemeMock = vi.fn(
    class {
      data: Record<string, unknown>;
      constructor(data: Record<string, unknown>) {
        this.data = data;
      }
      save = vi.fn(async () => this.data);
    }
  );
  return {
    default: Object.assign(ThemeMock, {
      findById: vi.fn(),
      findByIdAndUpdate: vi.fn(),
    }),
  };
});

import { createTheme, updateTheme } from "../controllers/themeController.js";
import Theme from "../models/Theme.js";

const VALID_THEME_ID = "507f1f77bcf86cd799439011";

/** リクエスト・レスポンスのモックを生成する */
const createReqRes = (body: unknown) => {
  const req = { params: { themeId: VALID_THEME_ID }, body };
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return { req, res };
};

/** 保存済みの draft テーマのモック */
const draftTheme = {
  _id: VALID_THEME_ID,
  title: "新人研修 2026 春",
  description: "職場の困りごとを話し合うテーマ",
  status: "draft",
  tags: [],
  pipelineConfig: new Map(),
  minContributors: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  (Theme.findById as ReturnType<typeof vi.fn>).mockResolvedValue(draftTheme);
  (Theme.findByIdAndUpdate as ReturnType<typeof vi.fn>).mockResolvedValue(
    draftTheme
  );
});

describe("createTheme - 入力検証", () => {
  test("正しい値ならテーマを作成すること", async () => {
    const { req, res } = createReqRes({
      title: "新人研修 2026 春",
      tags: ["研修"],
    });

    await createTheme(req as unknown as Request, res as unknown as Response);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(Theme).toHaveBeenCalledTimes(1);
  });

  test("description にクエリ演算子のオブジェクトが送られた場合は 400 を返し、テーマを作成しないこと", async () => {
    const { req, res } = createReqRes({
      title: "新人研修 2026 春",
      description: { $ne: "" },
    });

    await createTheme(req as unknown as Request, res as unknown as Response);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(Theme).not.toHaveBeenCalled();
  });

  test("title がオブジェクトの場合は 400 を返し、テーマを作成しないこと", async () => {
    const { req, res } = createReqRes({ title: { $gt: "" } });

    await createTheme(req as unknown as Request, res as unknown as Response);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(Theme).not.toHaveBeenCalled();
  });
});

describe("updateTheme - 入力検証", () => {
  test("正しい値ならテーマを更新すること", async () => {
    const { req, res } = createReqRes({ title: "新人研修 2026 秋" });

    await updateTheme(req as unknown as Request, res as unknown as Response);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(Theme.findByIdAndUpdate).toHaveBeenCalledTimes(1);
  });

  test.each([
    ["title がオブジェクト", { title: { $ne: "" } }],
    ["tags にオブジェクトが含まれる", { tags: [{ $gt: "" }] }],
    ["status がオブジェクト", { status: { $ne: "draft" } }],
    [
      "pipelineConfig の prompt がオブジェクト",
      { pipelineConfig: { chat: { prompt: { $set: "x" } } } },
    ],
  ])("%s の場合は 400 を返し、更新しないこと", async (_label, body) => {
    const { req, res } = createReqRes(body);

    await updateTheme(req as unknown as Request, res as unknown as Response);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(Theme.findByIdAndUpdate).not.toHaveBeenCalled();
  });
});
