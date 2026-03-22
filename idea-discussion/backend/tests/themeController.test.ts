/**
 * themeController のユニットテスト
 *
 * 目的: getAllThemes・updateTheme・emergencyUpdatePipelineConfig・getThemeDetail の動作を検証する。
 *       - getAllThemes: status フィールドを含むレスポンス、フィルタリング動作
 *       - updateTheme: ステータスベースのプロンプトロック制御、ステータス遷移バリデーション
 *       - emergencyUpdatePipelineConfig: active テーマのみ、reason 必須、変更ログ記録
 *       - getThemeDetail: 課題・解決策は createdAt 降順、重要論点は関連数降順
 */
import type { Request, Response } from "express";
import { beforeEach, describe, expect, test, vi } from "vitest";

// Mongoose モデルのモック
vi.mock("../models/Theme.js", () => ({
  default: {
    find: vi.fn(),
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
  },
}));
vi.mock("../models/SharpQuestion.js", () => ({
  default: {
    aggregate: vi.fn(),
    find: vi.fn(),
  },
}));
vi.mock("../models/ChatThread.js", () => ({
  default: {
    aggregate: vi.fn(),
  },
}));
vi.mock("../models/Like.js", () => ({ default: { countDocuments: vi.fn() } }));
vi.mock("../models/Problem.js", () => ({ default: { find: vi.fn() } }));
vi.mock("../models/QuestionLink.js", () => ({
  default: { countDocuments: vi.fn() },
}));
vi.mock("../models/Solution.js", () => ({ default: { find: vi.fn() } }));
vi.mock("../models/PipelineConfigChangeLog.js", () => ({
  default: vi.fn().mockImplementation(() => ({
    save: vi.fn().mockResolvedValue({}),
  })),
}));

import {
  emergencyUpdatePipelineConfig,
  getAllThemes,
  getThemeDetail,
  updateTheme,
} from "../controllers/themeController.js";
import ChatThread from "../models/ChatThread.js";
import Like from "../models/Like.js";
import PipelineConfigChangeLog from "../models/PipelineConfigChangeLog.js";
import Problem from "../models/Problem.js";
import QuestionLink from "../models/QuestionLink.js";
import SharpQuestion from "../models/SharpQuestion.js";
import Solution from "../models/Solution.js";
import Theme from "../models/Theme.js";

/**
 * モック用のテーマデータを生成するヘルパー関数
 */
const createMockTheme = (overrides: Record<string, unknown> = {}) => ({
  _id: "テーマID001",
  title: "テストテーマ",
  description: "テストの説明文",
  status: "active",
  tags: [],
  createdAt: new Date("2024-01-01T00:00:00.000Z"),
  ...overrides,
});

/**
 * Theme.find().sort() のモックをセットアップするヘルパー関数
 * @returns {sortMock} sort モック関数（呼び出し引数の検証に使用）
 */
const mockThemeFindSorted = (themes: ReturnType<typeof createMockTheme>[]) => {
  const sortMock = vi.fn().mockResolvedValue(themes);
  (Theme.find as ReturnType<typeof vi.fn>).mockReturnValue({ sort: sortMock });
  return { sortMock };
};

/**
 * モック用のリクエスト・レスポンスオブジェクトを生成するヘルパー関数
 * @param query - クエリパラメータ
 * @param user - 認証済みユーザー情報（optionalProtect で設定される）
 */
const createMockReqRes = (
  query: Record<string, string> = {},
  user: { role: string } | undefined = undefined
) => {
  const req = { query, user };
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return { req, res };
};

describe("getAllThemes コントローラー", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // デフォルト: SharpQuestion と ChatThread の集計結果は空配列（件数 0）
    (SharpQuestion.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (ChatThread.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  describe("レスポンスフィールドの検証", () => {
    test("status フィールドがレスポンスに含まれること", async () => {
      const mockTheme = createMockTheme({ status: "active" });
      mockThemeFindSorted([mockTheme]);

      const { req, res } = createMockReqRes();
      await getAllThemes(req as unknown as Request, res as unknown as Response);

      expect(res.status).toHaveBeenCalledWith(200);
      const responseData = res.json.mock.calls[0][0];
      expect(responseData[0]).toHaveProperty("status", "active");
    });

    test("createdAt フィールドがレスポンスに含まれること", async () => {
      const createdAt = new Date("2024-06-15T10:00:00.000Z");
      const mockTheme = createMockTheme({ createdAt });
      mockThemeFindSorted([mockTheme]);

      const { req, res } = createMockReqRes();
      await getAllThemes(req as unknown as Request, res as unknown as Response);

      const responseData = res.json.mock.calls[0][0];
      expect(responseData[0]).toHaveProperty("createdAt", createdAt);
    });

    test("status=draft のテーマでも status フィールドが正しく含まれること", async () => {
      const mockTheme = createMockTheme({ status: "draft" });
      mockThemeFindSorted([mockTheme]);

      const { req, res } = createMockReqRes(
        { includeInactive: "true" },
        { role: "admin" }
      );
      await getAllThemes(req as unknown as Request, res as unknown as Response);

      const responseData = res.json.mock.calls[0][0];
      expect(responseData[0]).toHaveProperty("status", "draft");
    });

    test("既存フィールド（_id, title, description, keyQuestionCount, commentCount）もレスポンスに含まれること", async () => {
      const mockTheme = createMockTheme();
      (SharpQuestion.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue([
        { _id: mockTheme._id, count: 3 },
      ]);
      (ChatThread.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue([
        { _id: mockTheme._id, count: 5 },
      ]);
      mockThemeFindSorted([mockTheme]);

      const { req, res } = createMockReqRes();
      await getAllThemes(req as unknown as Request, res as unknown as Response);

      const responseData = res.json.mock.calls[0][0];
      expect(responseData[0]).toMatchObject({
        _id: "テーマID001",
        title: "テストテーマ",
        description: "テストの説明文",
        keyQuestionCount: 3,
        commentCount: 5,
      });
    });
  });

  describe("tagsフィールドの検証", () => {
    test("tagsフィールドがレスポンスに含まれること", async () => {
      const mockTheme = createMockTheme({ tags: ["政策", "社会保障"] });
      mockThemeFindSorted([mockTheme]);

      const { req, res } = createMockReqRes();
      await getAllThemes(req as unknown as Request, res as unknown as Response);

      const responseData = res.json.mock.calls[0][0];
      expect(responseData[0]).toHaveProperty("tags", ["政策", "社会保障"]);
    });

    test("tagsが未設定の場合、空配列がレスポンスに含まれること", async () => {
      const mockTheme = createMockTheme({ tags: undefined });
      mockThemeFindSorted([mockTheme]);

      const { req, res } = createMockReqRes();
      await getAllThemes(req as unknown as Request, res as unknown as Response);

      const responseData = res.json.mock.calls[0][0];
      expect(responseData[0]).toHaveProperty("tags", []);
    });
  });

  describe("includeInactive パラメータによるフィルタリング", () => {
    test("管理者かつ includeInactive=true の場合、全テーマを取得するフィルタ（{}）を使用すること", async () => {
      mockThemeFindSorted([]);

      const { req, res } = createMockReqRes(
        { includeInactive: "true" },
        { role: "admin" }
      );
      await getAllThemes(req as unknown as Request, res as unknown as Response);

      expect(Theme.find).toHaveBeenCalledWith({});
    });

    test("非管理者が includeInactive=true を指定しても、公開中テーマのみのフィルタを使用すること", async () => {
      mockThemeFindSorted([]);

      const { req, res } = createMockReqRes({ includeInactive: "true" });
      await getAllThemes(req as unknown as Request, res as unknown as Response);

      expect(Theme.find).toHaveBeenCalledWith({ status: "active" });
    });

    test("includeInactive パラメータなしの場合、公開中テーマのみのフィルタ（{ status: 'active' }）を使用すること", async () => {
      const { sortMock } = mockThemeFindSorted([]);

      const { req, res } = createMockReqRes();
      await getAllThemes(req as unknown as Request, res as unknown as Response);

      expect(Theme.find).toHaveBeenCalledWith({ status: "active" });
      expect(sortMock).toHaveBeenCalledWith({ createdAt: -1 });
    });

    test("includeInactive=false の場合、公開中テーマのみのフィルタを使用すること", async () => {
      mockThemeFindSorted([]);

      const { req, res } = createMockReqRes(
        { includeInactive: "false" },
        { role: "admin" }
      );
      await getAllThemes(req as unknown as Request, res as unknown as Response);

      expect(Theme.find).toHaveBeenCalledWith({ status: "active" });
    });

    test("管理者かつ includeInactive=true の場合、全ステータスのテーマが返されること", async () => {
      const activeTheme = createMockTheme({
        _id: "アクティブID001",
        status: "active",
      });
      const draftTheme = createMockTheme({
        _id: "ドラフトID001",
        status: "draft",
        title: "下書きテーマ",
      });
      mockThemeFindSorted([activeTheme, draftTheme]);

      const { req, res } = createMockReqRes(
        { includeInactive: "true" },
        { role: "admin" }
      );
      await getAllThemes(req as unknown as Request, res as unknown as Response);

      const responseData = res.json.mock.calls[0][0];
      expect(responseData).toHaveLength(2);
      expect(responseData[0]).toHaveProperty("status", "active");
      expect(responseData[1]).toHaveProperty("status", "draft");
    });
  });

  describe("エラーハンドリング", () => {
    test("DB エラーが発生した場合、500 エラーを返すこと", async () => {
      (Theme.find as ReturnType<typeof vi.fn>).mockReturnValue({
        sort: vi.fn().mockRejectedValue(new Error("DB接続エラー")),
      });

      const { req, res } = createMockReqRes();
      await getAllThemes(req as unknown as Request, res as unknown as Response);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Error fetching themes" })
      );
    });
  });
});

// updateTheme テスト用の有効な ObjectId
const VALID_THEME_ID = "507f1f77bcf86cd799439011";

/**
 * updateTheme のモック用レスポンスを生成するヘルパー関数
 */
const createUpdateMockReqRes = (
  body: Record<string, unknown> = {},
  params: Record<string, string> = {}
) => {
  const req = {
    params: { themeId: VALID_THEME_ID, ...params },
    body,
  };
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return { req, res };
};

/**
 * モック用のテーマオブジェクトを生成するヘルパー
 */
const createMockThemeDoc = (overrides: Record<string, unknown> = {}) => ({
  _id: VALID_THEME_ID,
  title: "テストテーマ",
  description: "テストの説明文",
  status: "active",
  customPrompt: null,
  pipelineConfig: new Map(),
  tags: [],
  ...overrides,
});

describe("updateTheme コントローラー - ステータスベースプロンプトロック制御", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("プロンプトロック制御", () => {
    test("status=active のテーマで pipelineConfig を含む更新リクエストでも 200 を返すこと（pipelineConfig は無視される）", async () => {
      const mockTheme = createMockThemeDoc({ status: "active" });
      (Theme.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockTheme);
      (Theme.findByIdAndUpdate as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockTheme
      );

      const { req, res } = createUpdateMockReqRes({
        title: "タイトル更新",
        pipelineConfig: {
          chat: { model: "openai/gpt-5.4", prompt: "新しいプロンプト" },
        },
      });
      await updateTheme(req as unknown as Request, res as unknown as Response);

      expect(res.status).toHaveBeenCalledWith(200);
      // pipelineConfig はロック中のため findByIdAndUpdate の更新対象に含まれないこと
      const updateCall = (Theme.findByIdAndUpdate as ReturnType<typeof vi.fn>)
        .mock.calls[0];
      const updateObject = updateCall[1];
      expect(updateObject).not.toHaveProperty("pipelineConfig");
    });

    test("status=active のテーマで customPrompt を含む更新リクエストでも 200 を返すこと（customPrompt は無視される）", async () => {
      const mockTheme = createMockThemeDoc({ status: "active" });
      (Theme.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockTheme);
      (Theme.findByIdAndUpdate as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockTheme
      );

      const { req, res } = createUpdateMockReqRes({
        customPrompt: "新しいカスタムプロンプト",
      });
      await updateTheme(req as unknown as Request, res as unknown as Response);

      expect(res.status).toHaveBeenCalledWith(200);
      const updateCall = (Theme.findByIdAndUpdate as ReturnType<typeof vi.fn>)
        .mock.calls[0];
      const updateObject = updateCall[1];
      expect(updateObject).not.toHaveProperty("customPrompt");
    });

    test("status=closed のテーマで pipelineConfig を含む更新リクエストでも 200 を返すこと（pipelineConfig は無視される）", async () => {
      const mockTheme = createMockThemeDoc({ status: "closed" });
      (Theme.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockTheme);
      (Theme.findByIdAndUpdate as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockTheme
      );

      const { req, res } = createUpdateMockReqRes({
        pipelineConfig: {
          chat: { model: "openai/gpt-5.4", prompt: "新しいプロンプト" },
        },
      });
      await updateTheme(req as unknown as Request, res as unknown as Response);

      expect(res.status).toHaveBeenCalledWith(200);
      const updateCall = (Theme.findByIdAndUpdate as ReturnType<typeof vi.fn>)
        .mock.calls[0];
      const updateObject = updateCall[1];
      expect(updateObject).not.toHaveProperty("pipelineConfig");
    });

    test("status=draft のテーマでは pipelineConfig の変更が許可されること", async () => {
      const mockTheme = createMockThemeDoc({ status: "draft" });
      (Theme.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockTheme);
      (Theme.findByIdAndUpdate as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockTheme
      );

      const { req, res } = createUpdateMockReqRes({
        pipelineConfig: {
          chat: { model: "openai/gpt-5.4", prompt: "新しいプロンプト" },
        },
      });
      await updateTheme(req as unknown as Request, res as unknown as Response);

      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe("ステータス遷移バリデーション", () => {
    test("draft → active の遷移は許可されること", async () => {
      const mockTheme = createMockThemeDoc({ status: "draft" });
      (Theme.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockTheme);
      (Theme.findByIdAndUpdate as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockTheme,
        status: "active",
      });

      const { req, res } = createUpdateMockReqRes({ status: "active" });
      await updateTheme(req as unknown as Request, res as unknown as Response);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    test("active → closed の遷移は許可されること", async () => {
      const mockTheme = createMockThemeDoc({ status: "active" });
      (Theme.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockTheme);
      (Theme.findByIdAndUpdate as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockTheme,
        status: "closed",
      });

      const { req, res } = createUpdateMockReqRes({ status: "closed" });
      await updateTheme(req as unknown as Request, res as unknown as Response);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    test("closed → draft の遷移は拒否されること（終端状態）", async () => {
      (Theme.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockThemeDoc({ status: "closed" })
      );

      const { req, res } = createUpdateMockReqRes({ status: "draft" });
      await updateTheme(req as unknown as Request, res as unknown as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining("遷移") })
      );
    });

    test("closed → active の遷移は拒否されること", async () => {
      (Theme.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockThemeDoc({ status: "closed" })
      );

      const { req, res } = createUpdateMockReqRes({ status: "active" });
      await updateTheme(req as unknown as Request, res as unknown as Response);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    test("active → draft の遷移は拒否されること（公開後はdraftに戻れない）", async () => {
      (Theme.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockThemeDoc({ status: "active" })
      );

      const { req, res } = createUpdateMockReqRes({ status: "draft" });
      await updateTheme(req as unknown as Request, res as unknown as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining("遷移") })
      );
    });
  });
});

describe("emergencyUpdatePipelineConfig コントローラー", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createEmergencyReqRes = (
    body: Record<string, unknown> = {},
    params: Record<string, string> = {}
  ) => ({
    req: {
      params: { themeId: VALID_THEME_ID, ...params },
      body,
      user: { _id: "管理者ID001" },
    },
    res: {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    },
  });

  test("status=active のテーマで緊急修正が成功すること", async () => {
    const mockTheme = createMockThemeDoc({ status: "active" });
    (mockTheme as Record<string, unknown>).pipelineConfig = {
      get: vi
        .fn()
        .mockReturnValue({ model: "旧モデル", prompt: "旧プロンプト" }),
    };
    (Theme.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockTheme);
    (Theme.findByIdAndUpdate as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockTheme
    );

    const { req, res } = createEmergencyReqRes({
      stageId: "chat",
      prompt: "修正後プロンプト",
      reason: "プロンプトの誤字修正",
    });
    await emergencyUpdatePipelineConfig(
      req as unknown as Request,
      res as unknown as Response
    );

    expect(res.status).toHaveBeenCalledWith(200);
  });

  test("reason が未指定の場合は 400 エラーを返すこと", async () => {
    (Theme.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
      createMockThemeDoc({ status: "active" })
    );

    const { req, res } = createEmergencyReqRes({
      stageId: "chat",
      prompt: "修正後プロンプト",
      // reason なし
    });
    await emergencyUpdatePipelineConfig(
      req as unknown as Request,
      res as unknown as Response
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("reason") })
    );
  });

  test("status=draft のテーマでは緊急修正を拒否すること（400 エラー）", async () => {
    (Theme.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
      createMockThemeDoc({ status: "draft" })
    );

    const { req, res } = createEmergencyReqRes({
      stageId: "chat",
      prompt: "修正後プロンプト",
      reason: "緊急修正理由",
    });
    await emergencyUpdatePipelineConfig(
      req as unknown as Request,
      res as unknown as Response
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("active") })
    );
  });

  test("model と prompt が両方未指定の場合は 400 エラーを返すこと", async () => {
    (Theme.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
      createMockThemeDoc({ status: "active" })
    );

    const { req, res } = createEmergencyReqRes({
      stageId: "chat",
      reason: "緊急修正理由",
      // model も prompt も未指定
    });
    await emergencyUpdatePipelineConfig(
      req as unknown as Request,
      res as unknown as Response
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("model"),
      })
    );
  });

  test("無効な stageId の場合は 400 エラーを返すこと", async () => {
    (Theme.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
      createMockThemeDoc({ status: "active" })
    );

    const { req, res } = createEmergencyReqRes({
      stageId: "存在しないステージ",
      prompt: "修正後プロンプト",
      reason: "緊急修正理由",
    });
    await emergencyUpdatePipelineConfig(
      req as unknown as Request,
      res as unknown as Response
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("stageId"),
      })
    );
  });

  test("緊急修正で findByIdAndUpdate が $set で対象 stageId のみ原子的に更新すること", async () => {
    const mockTheme = createMockThemeDoc({ status: "active" });
    (mockTheme as Record<string, unknown>).pipelineConfig = {
      get: vi
        .fn()
        .mockReturnValue({ model: "旧モデル", prompt: "旧プロンプト" }),
    };
    (Theme.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockTheme);
    (Theme.findByIdAndUpdate as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockTheme
    );

    const { req, res } = createEmergencyReqRes({
      stageId: "chat",
      prompt: "修正後プロンプト",
      reason: "プロンプトの誤字修正",
    });
    await emergencyUpdatePipelineConfig(
      req as unknown as Request,
      res as unknown as Response
    );

    expect(Theme.findByIdAndUpdate).toHaveBeenCalledWith(
      VALID_THEME_ID,
      expect.objectContaining({
        $set: expect.objectContaining({
          "pipelineConfig.chat": expect.any(Object),
        }),
      }),
      expect.any(Object)
    );
  });

  test("緊急修正時に PipelineConfigChangeLog に変更ログが記録されること", async () => {
    const mockTheme = createMockThemeDoc({ status: "active" });
    (mockTheme as Record<string, unknown>).pipelineConfig = {
      get: vi
        .fn()
        .mockReturnValue({ model: "旧モデル", prompt: "旧プロンプト" }),
    };
    (Theme.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockTheme);
    (Theme.findByIdAndUpdate as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockTheme
    );

    const { req, res } = createEmergencyReqRes({
      stageId: "chat",
      prompt: "修正後プロンプト",
      reason: "プロンプトの誤字修正",
    });
    await emergencyUpdatePipelineConfig(
      req as unknown as Request,
      res as unknown as Response
    );

    expect(
      PipelineConfigChangeLog as unknown as ReturnType<typeof vi.fn>
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        themeId: VALID_THEME_ID,
        stageId: "chat",
        reason: "プロンプトの誤字修正",
        previousPrompt: "旧プロンプト",
        newPrompt: "修正後プロンプト",
      })
    );
    // save() が呼ばれたことも検証（コンストラクタ呼び出しだけでは永続化されない）
    // mock.results[0].value でコンストラクタの返り値（インスタンス）を取得する
    const changeLogResult = (
      PipelineConfigChangeLog as unknown as ReturnType<typeof vi.fn>
    ).mock.results[0].value;
    expect(changeLogResult.save).toHaveBeenCalled();
  });

  test("現在値と同一の prompt を指定した場合は 400 エラーを返すこと（no-op 防止）", async () => {
    const mockTheme = createMockThemeDoc({ status: "active" });
    (mockTheme as Record<string, unknown>).pipelineConfig = {
      get: vi
        .fn()
        .mockReturnValue({ model: "現在のモデル", prompt: "現在のプロンプト" }),
    };
    (Theme.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockTheme);

    const { req, res } = createEmergencyReqRes({
      stageId: "chat",
      prompt: "現在のプロンプト", // 現在値と同一
      reason: "誤字修正のつもり",
    });
    await emergencyUpdatePipelineConfig(
      req as unknown as Request,
      res as unknown as Response
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("同一") })
    );
  });

  test("model の単独更新が成功すること", async () => {
    const mockTheme = createMockThemeDoc({ status: "active" });
    (mockTheme as Record<string, unknown>).pipelineConfig = {
      get: vi
        .fn()
        .mockReturnValue({ model: "旧モデル", prompt: "旧プロンプト" }),
    };
    (Theme.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockTheme);
    (Theme.findByIdAndUpdate as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockTheme
    );

    const { req, res } = createEmergencyReqRes({
      stageId: "chat",
      model: "新しいモデル", // model のみ指定
      reason: "より良いモデルへの移行",
    });
    await emergencyUpdatePipelineConfig(
      req as unknown as Request,
      res as unknown as Response
    );

    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe("getThemeDetail コントローラー - 表示順の検証", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * getThemeDetail 用のリクエスト・レスポンスモックを生成するヘルパー関数
   */
  const createDetailReqRes = (themeId = VALID_THEME_ID) => ({
    req: { params: { themeId } },
    res: {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    },
  });

  /**
   * SharpQuestion.find() のモックをセットアップするヘルパー関数
   * 重要論点はDBソートではなくJSでソートするため、findは直接配列を返す
   * @param questions - 返す論点リスト（toObject() も返せるように設定）
   */
  const mockSharpQuestionFind = (
    questions: Array<{ _id: string; statement: string; toObject: () => object }>
  ) => {
    (SharpQuestion.find as ReturnType<typeof vi.fn>).mockResolvedValue(
      questions
    );
  };

  /**
   * Problem.find().sort() のモックをセットアップするヘルパー関数
   */
  const mockProblemFind = (
    problems: Array<{ _id: string; statement: string; createdAt: Date }>
  ) => {
    const sortMock = vi.fn().mockResolvedValue(problems);
    (Problem.find as ReturnType<typeof vi.fn>).mockReturnValue({
      sort: sortMock,
    });
    return sortMock;
  };

  /**
   * Solution.find().sort() のモックをセットアップするヘルパー関数
   */
  const mockSolutionFind = (
    solutions: Array<{ _id: string; statement: string; createdAt: Date }>
  ) => {
    const sortMock = vi.fn().mockResolvedValue(solutions);
    (Solution.find as ReturnType<typeof vi.fn>).mockReturnValue({
      sort: sortMock,
    });
    return sortMock;
  };

  test("課題が createdAt 降順（新しい順）で取得されること", async () => {
    (Theme.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
      createMockThemeDoc()
    );
    mockSharpQuestionFind([]);
    const problemSortMock = mockProblemFind([]);
    mockSolutionFind([]);

    const { req, res } = createDetailReqRes();
    await getThemeDetail(req as unknown as Request, res as unknown as Response);

    expect(problemSortMock).toHaveBeenCalledWith({ createdAt: -1 });
  });

  test("解決策が createdAt 降順（新しい順）で取得されること", async () => {
    (Theme.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
      createMockThemeDoc()
    );
    mockSharpQuestionFind([]);
    mockProblemFind([]);
    const solutionSortMock = mockSolutionFind([]);

    const { req, res } = createDetailReqRes();
    await getThemeDetail(req as unknown as Request, res as unknown as Response);

    expect(solutionSortMock).toHaveBeenCalledWith({ createdAt: -1 });
  });

  test("重要論点が関連する課題数＋解決策数の多い順で返ること", async () => {
    (Theme.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
      createMockThemeDoc()
    );

    // 3つの論点を用意（関連数が少ない順に定義し、降順でソートされることを確認）
    const questions = [
      {
        _id: "論点ID001",
        statement: "関連数1の論点",
        toObject: () => ({ _id: "論点ID001", statement: "関連数1の論点" }),
      },
      {
        _id: "論点ID002",
        statement: "関連数5の論点",
        toObject: () => ({ _id: "論点ID002", statement: "関連数5の論点" }),
      },
      {
        _id: "論点ID003",
        statement: "関連数3の論点",
        toObject: () => ({ _id: "論点ID003", statement: "関連数3の論点" }),
      },
    ];
    mockSharpQuestionFind(questions);
    mockProblemFind([]);
    mockSolutionFind([]);

    // 論点IDごとの課題数・解決策数をモック
    // 論点ID001: 課題1 + 解決策0 = 1
    // 論点ID002: 課題3 + 解決策2 = 5
    // 論点ID003: 課題2 + 解決策1 = 3
    (
      QuestionLink.countDocuments as ReturnType<typeof vi.fn>
    ).mockImplementation(
      ({
        questionId,
        linkedItemType,
      }: { questionId: string; linkedItemType: string }) => {
        const counts: Record<string, Record<string, number>> = {
          論点ID001: { problem: 1, solution: 0 },
          論点ID002: { problem: 3, solution: 2 },
          論点ID003: { problem: 2, solution: 1 },
        };
        return Promise.resolve(counts[questionId]?.[linkedItemType] ?? 0);
      }
    );
    (Like.countDocuments as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const { req, res } = createDetailReqRes();
    await getThemeDetail(req as unknown as Request, res as unknown as Response);

    expect(res.status).toHaveBeenCalledWith(200);
    const responseData = res.json.mock.calls[0][0];
    // 関連数5 → 3 → 1 の順に並んでいること
    expect(responseData.keyQuestions[0].statement).toBe("関連数5の論点");
    expect(responseData.keyQuestions[1].statement).toBe("関連数3の論点");
    expect(responseData.keyQuestions[2].statement).toBe("関連数1の論点");
  });
});
