/**
 * テーマの最小寄与人数（minContributors）設定のユニットテスト
 *
 * 目的: issue #146 の「k は draft のときだけ設定・変更できる」仕様を検証する。
 *       - createTheme: minContributors を指定してテーマを作成できること、不正値は 400 になること
 *       - updateTheme: draft のときだけ minContributors を変更・無効化できること
 *                      draft 以外では更新対象から除外されること（pipelineConfig のロックと同じ扱い）
 *       - emergencyUpdatePipelineConfig: 緊急修正 API では minContributors を変更できないこと
 * 前提: 最小寄与人数 k は「2以上の整数」または null（無効）とする。
 *       k=1 は「1人でも寄与すれば表示」となり、保護として意味を持たないため不正値とする。
 */
import type { Request, Response } from "express";
import { beforeEach, describe, expect, test, vi } from "vitest";

// createTheme は `new Theme(...).save()` を呼ぶため、コンストラクタとして呼べる class でモックする。
// コンストラクタに渡された値を save の戻り値として返し、保存内容を検証できるようにする。
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
vi.mock("../models/PipelineConfigChangeLog.js", () => ({
  default: vi.fn(
    class {
      save = vi.fn().mockResolvedValue({});
    }
  ),
}));

import {
  createTheme,
  emergencyUpdatePipelineConfig,
  updateTheme,
} from "../controllers/themeController.js";
import Theme from "../models/Theme.js";

const VALID_THEME_ID = "507f1f77bcf86cd799439011";

/** リクエスト・レスポンスのモックを生成する */
const createReqRes = (body: Record<string, unknown>) => {
  const req = { params: { themeId: VALID_THEME_ID }, body };
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return { req, res };
};

/** 保存済みテーマのモックを生成する */
const createThemeDoc = (overrides: Record<string, unknown> = {}) => ({
  _id: VALID_THEME_ID,
  title: "新人研修 2026 春",
  description: "職場の困りごとを話し合うテーマ",
  status: "draft",
  tags: [],
  pipelineConfig: new Map(),
  minContributors: null,
  ...overrides,
});

/** findByIdAndUpdate に渡された更新内容を取り出す */
const getUpdateObject = () =>
  (Theme.findByIdAndUpdate as ReturnType<typeof vi.fn>).mock.calls[0][1];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createTheme - 最小寄与人数", () => {
  test("minContributors=5 を指定すると、5 が設定されたテーマが作成されること", async () => {
    const { req, res } = createReqRes({
      title: "新人研修 2026 春",
      minContributors: 5,
    });

    await createTheme(req as unknown as Request, res as unknown as Response);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ minContributors: 5 })
    );
  });

  test("minContributors を指定しないと、無効（null）のテーマが作成されること", async () => {
    const { req, res } = createReqRes({ title: "地域の防災を考える" });

    await createTheme(req as unknown as Request, res as unknown as Response);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ minContributors: null })
    );
  });

  test.each([
    ["1（保護として意味を持たない）", 1],
    ["0", 0],
    ["負の数", -3],
    ["小数", 2.5],
    ["数値文字列", "5"],
  ])(
    "minContributors が %s の場合は 400 を返し、テーマを作成しないこと",
    async (_label, value) => {
      const { req, res } = createReqRes({
        title: "新人研修 2026 春",
        minContributors: value,
      });

      await createTheme(req as unknown as Request, res as unknown as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(Theme).not.toHaveBeenCalled();
    }
  );
});

describe("updateTheme - 最小寄与人数", () => {
  test("draft のテーマでは minContributors を 5 に変更できること", async () => {
    (Theme.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
      createThemeDoc({ status: "draft" })
    );
    (Theme.findByIdAndUpdate as ReturnType<typeof vi.fn>).mockResolvedValue(
      createThemeDoc({ status: "draft", minContributors: 5 })
    );
    const { req, res } = createReqRes({ minContributors: 5 });

    await updateTheme(req as unknown as Request, res as unknown as Response);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(getUpdateObject()).toHaveProperty("minContributors", 5);
  });

  test("draft のテーマでは minContributors を null にして無効化できること", async () => {
    (Theme.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
      createThemeDoc({ status: "draft", minContributors: 5 })
    );
    (Theme.findByIdAndUpdate as ReturnType<typeof vi.fn>).mockResolvedValue(
      createThemeDoc({ status: "draft" })
    );
    const { req, res } = createReqRes({ minContributors: null });

    await updateTheme(req as unknown as Request, res as unknown as Response);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(getUpdateObject()).toHaveProperty("minContributors", null);
  });

  test("draft のテーマで minContributors=1 を指定すると 400 を返し、更新しないこと", async () => {
    (Theme.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
      createThemeDoc({ status: "draft" })
    );
    const { req, res } = createReqRes({ minContributors: 1 });

    await updateTheme(req as unknown as Request, res as unknown as Response);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(Theme.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  test.each(["active", "closed", "archived"])(
    "%s のテーマでは minContributors が更新対象から除外されること",
    async (status) => {
      // 前提: 実施中のテーマで k=5 が設定されている。管理者が k を無効にしようとする
      (Theme.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
        createThemeDoc({ status, minContributors: 5 })
      );
      (Theme.findByIdAndUpdate as ReturnType<typeof vi.fn>).mockResolvedValue(
        createThemeDoc({ status, minContributors: 5 })
      );
      const { req, res } = createReqRes({
        title: "新人研修 2026 春（改題）",
        minContributors: null,
      });

      await updateTheme(req as unknown as Request, res as unknown as Response);

      // 管理画面はフォーム全体を送るため、エラーにはせず k だけを更新対象から外す
      expect(res.status).toHaveBeenCalledWith(200);
      expect(getUpdateObject()).not.toHaveProperty("minContributors");
      expect(getUpdateObject()).toHaveProperty(
        "title",
        "新人研修 2026 春（改題）"
      );
    }
  );

  test("active のテーマでも、不正な minContributors が送られた場合は 400 を返し、更新しないこと", async () => {
    // 前提: 入力の型の検証はステータスのロック判定より先に行う（issue #149）。
    //       正しい値なら draft 以外では無視されるが、不正な値はステータスに関係なく拒否する
    (Theme.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
      createThemeDoc({ status: "active", minContributors: 5 })
    );
    const { req, res } = createReqRes({ minContributors: 1 });

    await updateTheme(req as unknown as Request, res as unknown as Response);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(Theme.findByIdAndUpdate).not.toHaveBeenCalled();
  });
});

describe("emergencyUpdatePipelineConfig - 最小寄与人数", () => {
  test("緊急修正 API に minContributors を含めても、k は変更されないこと", async () => {
    // 前提: 実施中（active）のテーマで k=5 が設定されている
    (Theme.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
      createThemeDoc({ status: "active", minContributors: 5 })
    );
    (Theme.findByIdAndUpdate as ReturnType<typeof vi.fn>).mockResolvedValue(
      createThemeDoc({ status: "active", minContributors: 5 })
    );
    const { req, res } = createReqRes({
      stageId: "chat",
      prompt: "より丁寧に聞き返してください",
      reason: "参加者から質問の意図が分かりにくいとの声があったため",
      minContributors: null,
    });

    await emergencyUpdatePipelineConfig(
      req as unknown as Request,
      res as unknown as Response
    );

    expect(res.status).toHaveBeenCalledWith(200);
    // 更新内容は対象ステージの pipelineConfig だけで、minContributors を含まないこと
    const update = getUpdateObject();
    expect(update).toEqual({
      $set: {
        "pipelineConfig.chat": {
          model: undefined,
          prompt: "より丁寧に聞き返してください",
        },
      },
    });
  });
});
