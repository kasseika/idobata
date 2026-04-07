/**
 * transparencyController のユニットテスト
 *
 * 目的: 透明性APIエンドポイントが正しいレスポンスを返すことを検証する。
 * 注意: DBアクセスを伴う操作は Mongoose モデルをモックして検証する。
 */
import type { Request, Response } from "express";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { PIPELINE_STAGES } from "../constants/pipelineStages.js";

// Mongoose モデルのモック
vi.mock("../models/Theme.js", () => ({
  default: {
    findById: vi.fn(),
  },
}));
vi.mock("../models/SiteConfig.js", () => ({
  default: {
    findOne: vi.fn(),
  },
}));
vi.mock("../models/PipelineConfigChangeLog.js", () => ({
  default: {
    find: vi.fn(),
  },
}));

import {
  getPipelineStages,
  getThemeTransparency,
} from "../controllers/transparencyController.js";
import PipelineConfigChangeLog from "../models/PipelineConfigChangeLog.js";
import SiteConfig from "../models/SiteConfig.js";
import Theme from "../models/Theme.js";

/**
 * モック用のリクエスト・レスポンス・nextオブジェクトを生成するヘルパー関数
 */
const createMockReqRes = (
  params: Record<string, string> = {},
  query: Record<string, string> = {}
) => {
  const req = { params, query };
  const res = {
    json: vi.fn(),
    status: vi.fn().mockReturnThis(),
  };
  const next = vi.fn();
  return { req, res, next };
};

describe("getPipelineStages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("全ステージのメタデータをHTTP 200 JSONで返す", async () => {
    const { req, res } = createMockReqRes();

    await getPipelineStages(
      req as unknown as Request,
      res as unknown as Response
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledTimes(1);
    const response = res.json.mock.calls[0][0];
    expect(response).toHaveProperty("stages");
    expect(Array.isArray(response.stages)).toBe(true);
  });

  test("8個のパイプラインステージを返す（政策ドラフト・ダイジェストはadmin UI未実装のため除外）", async () => {
    const { req, res } = createMockReqRes();

    await getPipelineStages(
      req as unknown as Request,
      res as unknown as Response
    );

    const response = res.json.mock.calls[0][0];
    expect(response.stages).toHaveLength(8);
  });

  test("各ステージに必須フィールドが含まれる", async () => {
    const { req, res } = createMockReqRes();

    await getPipelineStages(
      req as unknown as Request,
      res as unknown as Response
    );

    const response = res.json.mock.calls[0][0];
    for (const stage of response.stages) {
      expect(stage).toHaveProperty("id");
      expect(stage).toHaveProperty("name");
      expect(stage).toHaveProperty("description");
      expect(stage).toHaveProperty("defaultModel");
      expect(stage).toHaveProperty("defaultPrompt");
      expect(stage).toHaveProperty("order");
    }
  });

  test("ステージが order フィールドで昇順に並ぶ", async () => {
    const { req, res } = createMockReqRes();

    await getPipelineStages(
      req as unknown as Request,
      res as unknown as Response
    );

    const response = res.json.mock.calls[0][0];
    const orders = response.stages.map((s: { order: number }) => s.order);
    const sortedOrders = [...orders].sort((a: number, b: number) => a - b);
    expect(orders).toEqual(sortedOrders);
  });

  test("PIPELINE_STAGES 定数と一致するデータを返す", async () => {
    const { req, res } = createMockReqRes();

    await getPipelineStages(
      req as unknown as Request,
      res as unknown as Response
    );

    const response = res.json.mock.calls[0][0];
    expect(response.stages).toEqual(PIPELINE_STAGES);
  });
});

describe("getThemeTransparency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // デフォルト: 変更ログなし
    (PipelineConfigChangeLog.find as ReturnType<typeof vi.fn>).mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      }),
    });
  });

  test("テーマが存在しない場合は404を返す", async () => {
    (Theme.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const { req, res } = createMockReqRes({ themeId: "存在しないテーマID" });

    await getThemeTransparency(
      req as unknown as Request,
      res as unknown as Response
    );

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(String) })
    );
  });

  test("テーマに showTransparency=null のとき SiteConfig の値を使用する", async () => {
    (Theme.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      _id: "テーマID001",
      showTransparency: null,
    });
    (SiteConfig.findOne as ReturnType<typeof vi.fn>).mockResolvedValue({
      showTransparency: true,
    });
    const { req, res } = createMockReqRes({ themeId: "テーマID001" });

    await getThemeTransparency(
      req as unknown as Request,
      res as unknown as Response
    );

    expect(res.status).toHaveBeenCalledWith(200);
    const response = res.json.mock.calls[0][0];
    expect(response.showTransparency).toBe(true);
  });

  test("テーマに showTransparency=false のとき SiteConfig より優先される", async () => {
    (Theme.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      _id: "テーマID002",
      showTransparency: false,
    });
    (SiteConfig.findOne as ReturnType<typeof vi.fn>).mockResolvedValue({
      showTransparency: true,
    });
    const { req, res } = createMockReqRes({ themeId: "テーマID002" });

    await getThemeTransparency(
      req as unknown as Request,
      res as unknown as Response
    );

    expect(res.status).toHaveBeenCalledWith(200);
    const response = res.json.mock.calls[0][0];
    expect(response.showTransparency).toBe(false);
  });

  test("SiteConfig が存在しない場合はデフォルト true を使用する", async () => {
    (Theme.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      _id: "テーマID003",
      showTransparency: null,
    });
    (SiteConfig.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const { req, res } = createMockReqRes({ themeId: "テーマID003" });

    await getThemeTransparency(
      req as unknown as Request,
      res as unknown as Response
    );

    expect(res.status).toHaveBeenCalledWith(200);
    const response = res.json.mock.calls[0][0];
    expect(response.showTransparency).toBe(true);
  });

  test("レスポンスに stages フィールドが含まれる", async () => {
    (Theme.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      _id: "テーマID004",
      showTransparency: true,
    });
    (SiteConfig.findOne as ReturnType<typeof vi.fn>).mockResolvedValue({
      showTransparency: true,
    });
    const { req, res } = createMockReqRes({ themeId: "テーマID004" });

    await getThemeTransparency(
      req as unknown as Request,
      res as unknown as Response
    );

    const response = res.json.mock.calls[0][0];
    expect(response).toHaveProperty("stages");
    expect(response.stages).toHaveLength(8);
  });

  test("DB エラー発生時は 500 を返す", async () => {
    (Theme.findById as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("DB接続エラー")
    );
    const { req, res } = createMockReqRes({ themeId: "テーマID005" });

    await getThemeTransparency(
      req as unknown as Request,
      res as unknown as Response
    );

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(String) })
    );
  });

  test("不正な themeId 形式（CastError）のとき 400 を返す", async () => {
    const castError = new Error("Cast to ObjectId failed") as Error & {
      name: string;
    };
    castError.name = "CastError";
    (Theme.findById as ReturnType<typeof vi.fn>).mockRejectedValue(castError);
    const { req, res } = createMockReqRes({ themeId: "不正なID形式" });

    await getThemeTransparency(
      req as unknown as Request,
      res as unknown as Response
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(String) })
    );
  });

  test("レスポンスに changeLogs フィールドが含まれること（変更ログなしの場合は空配列）", async () => {
    (Theme.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      _id: "テーマID006",
      showTransparency: true,
    });
    (SiteConfig.findOne as ReturnType<typeof vi.fn>).mockResolvedValue({
      showTransparency: true,
    });
    // find().sort().lean() のチェーンメソッドをモック
    (PipelineConfigChangeLog.find as ReturnType<typeof vi.fn>).mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      }),
    });
    const { req, res } = createMockReqRes({ themeId: "テーマID006" });

    await getThemeTransparency(
      req as unknown as Request,
      res as unknown as Response
    );

    const response = res.json.mock.calls[0][0];
    expect(response).toHaveProperty("changeLogs");
    expect(response.changeLogs).toEqual([]);
  });

  test("showTransparency=false のとき changeLogs がレスポンスに含まれないこと", async () => {
    (Theme.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      _id: "テーマID008",
      showTransparency: false,
    });
    const mockLog = {
      stageId: "chat",
      reason: "プロンプトの誤字修正",
      changedAt: new Date("2026-03-20T10:00:00.000Z"),
    };
    (PipelineConfigChangeLog.find as ReturnType<typeof vi.fn>).mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([mockLog]),
      }),
    });
    const { req, res } = createMockReqRes({ themeId: "テーマID008" });

    await getThemeTransparency(
      req as unknown as Request,
      res as unknown as Response
    );

    const response = res.json.mock.calls[0][0];
    expect(response).not.toHaveProperty("changeLogs");
  });

  test("showTransparency=false のとき stages に prompt/model が含まれないこと", async () => {
    (Theme.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      _id: "テーマID009",
      showTransparency: false,
    });
    (SiteConfig.findOne as ReturnType<typeof vi.fn>).mockResolvedValue({
      showTransparency: true,
    });
    const { req, res } = createMockReqRes({ themeId: "テーマID009" });

    await getThemeTransparency(
      req as unknown as Request,
      res as unknown as Response
    );

    const response = res.json.mock.calls[0][0];
    expect(response).toHaveProperty("stages");
    for (const stage of response.stages) {
      expect(stage).not.toHaveProperty("prompt");
      expect(stage).not.toHaveProperty("model");
    }
  });

  test("showTransparency=true のとき changeLogs に changedBy が含まれないこと", async () => {
    (Theme.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      _id: "テーマID010",
      showTransparency: true,
    });
    (SiteConfig.findOne as ReturnType<typeof vi.fn>).mockResolvedValue({
      showTransparency: true,
    });
    const mockLog = {
      stageId: "chat",
      reason: "プロンプトの誤字修正",
      changedAt: new Date("2026-03-20T10:00:00.000Z"),
      changedBy: "管理者ID001",
    };
    (PipelineConfigChangeLog.find as ReturnType<typeof vi.fn>).mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([mockLog]),
      }),
    });
    const { req, res } = createMockReqRes({ themeId: "テーマID010" });

    await getThemeTransparency(
      req as unknown as Request,
      res as unknown as Response
    );

    const response = res.json.mock.calls[0][0];
    expect(response.changeLogs).toHaveLength(1);
    expect(response.changeLogs[0]).not.toHaveProperty("changedBy");
  });

  test("chatステージで customPrompt が空文字の場合はデフォルトプロンプトを使用する", async () => {
    (Theme.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      _id: "テーマID011",
      showTransparency: true,
      customPrompt: "",
      pipelineConfig: { get: vi.fn().mockReturnValue(undefined) },
    });
    (SiteConfig.findOne as ReturnType<typeof vi.fn>).mockResolvedValue({
      showTransparency: true,
    });
    const { req, res } = createMockReqRes({ themeId: "テーマID011" });

    await getThemeTransparency(
      req as unknown as Request,
      res as unknown as Response
    );

    const response = res.json.mock.calls[0][0];
    const chatStage = response.stages.find(
      (s: { id: string }) => s.id === "chat"
    );
    // chatステージが存在することを確認
    expect(chatStage).toBeDefined();
    // 空文字のcustomPromptはカスタム設定として扱わず、デフォルトプロンプトを返す
    expect(chatStage.isCustomized).toBe(false);
    // テーマにtitle/descriptionがないため変数は空文字に置換される
    const defaultPrompt =
      PIPELINE_STAGES.find((s) => s.id === "chat")?.defaultPrompt ?? "";
    const expectedPrompt = defaultPrompt
      .replaceAll("{{theme_title}}", "")
      .replaceAll("{{theme_description}}", "");
    expect(chatStage.prompt).toBe(expectedPrompt);
  });

  test("chatステージでpipelineConfig.promptが空文字の場合はcustomPromptにフォールバックする", async () => {
    (Theme.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      _id: "テーマID012",
      showTransparency: true,
      customPrompt: "カスタムチャットプロンプト",
      pipelineConfig: {
        get: (id: string) => (id === "chat" ? { prompt: "" } : undefined),
      },
    });
    (SiteConfig.findOne as ReturnType<typeof vi.fn>).mockResolvedValue({
      showTransparency: true,
    });
    const { req, res } = createMockReqRes({ themeId: "テーマID012" });

    await getThemeTransparency(
      req as unknown as Request,
      res as unknown as Response
    );

    const response = res.json.mock.calls[0][0];
    const chatStage = response.stages.find(
      (s: { id: string }) => s.id === "chat"
    );
    expect(chatStage).toBeDefined();
    // pipelineConfig.promptが空文字のためcustomPromptが使われる
    expect(chatStage.prompt).toBe("カスタムチャットプロンプト");
    // customPromptが有効なのでisCustomized=true
    expect(chatStage.isCustomized).toBe(true);
  });

  test("変更ログがある場合はレスポンスに含まれること", async () => {
    (Theme.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      _id: "テーマID007",
      showTransparency: true,
    });
    (SiteConfig.findOne as ReturnType<typeof vi.fn>).mockResolvedValue({
      showTransparency: true,
    });
    const mockLog = {
      stageId: "chat",
      reason: "プロンプトの誤字修正",
      changedAt: new Date("2026-03-20T10:00:00.000Z"),
      previousPrompt: "旧プロンプト",
      newPrompt: "新プロンプト",
    };
    // find().sort().lean() のチェーンメソッドをモック
    (PipelineConfigChangeLog.find as ReturnType<typeof vi.fn>).mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([mockLog]),
      }),
    });
    const { req, res } = createMockReqRes({ themeId: "テーマID007" });

    await getThemeTransparency(
      req as unknown as Request,
      res as unknown as Response
    );

    const response = res.json.mock.calls[0][0];
    expect(response.changeLogs).toHaveLength(1);
    expect(response.changeLogs[0]).toMatchObject({
      stageId: "chat",
      reason: "プロンプトの誤字修正",
    });
  });

  test("chatステージのプロンプトに {{theme_title}} が含まれる場合は置換後の値を返す", async () => {
    (Theme.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      _id: "テーマID013",
      title: "若者の就職支援",
      description: "就労機会を拡大します。",
      showTransparency: true,
      pipelineConfig: {
        get: (id: string) =>
          id === "chat"
            ? { prompt: "テーマ「{{theme_title}}」 - {{theme_description}}" }
            : undefined,
      },
    });
    (SiteConfig.findOne as ReturnType<typeof vi.fn>).mockResolvedValue({
      showTransparency: true,
    });
    const { req, res } = createMockReqRes({ themeId: "テーマID013" });

    await getThemeTransparency(
      req as unknown as Request,
      res as unknown as Response
    );

    const response = res.json.mock.calls[0][0];
    const chatStage = response.stages.find(
      (s: { id: string }) => s.id === "chat"
    );
    expect(chatStage.prompt).toBe(
      "テーマ「若者の就職支援」 - 就労機会を拡大します。"
    );
  });
});
