/**
 * themeController のユニットテスト
 *
 * 目的: getAllThemes・updateTheme・emergencyUpdatePipelineConfig の動作を検証する。
 *       - getAllThemes: status フィールドを含むレスポンス、フィルタリング動作
 *       - updateTheme: ステータスベースのプロンプトロック制御、ステータス遷移バリデーション
 *       - emergencyUpdatePipelineConfig: active テーマのみ、reason 必須、変更ログ記録
 */
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
  },
}));
vi.mock("../models/ChatThread.js", () => ({
  default: {
    aggregate: vi.fn(),
  },
}));
vi.mock("../models/Like.js", () => ({ default: {} }));
vi.mock("../models/Problem.js", () => ({ default: {} }));
vi.mock("../models/QuestionLink.js", () => ({ default: {} }));
vi.mock("../models/Solution.js", () => ({ default: {} }));
vi.mock("../models/PipelineConfigChangeLog.js", () => ({
  default: vi.fn().mockImplementation(() => ({
    save: vi.fn().mockResolvedValue({}),
  })),
}));

import {
  emergencyUpdatePipelineConfig,
  getAllThemes,
  updateTheme,
} from "../controllers/themeController.js";
import ChatThread from "../models/ChatThread.js";
import PipelineConfigChangeLog from "../models/PipelineConfigChangeLog.js";
import SharpQuestion from "../models/SharpQuestion.js";
import Theme from "../models/Theme.js";

/**
 * モック用のテーマデータを生成するヘルパー関数
 */
const createMockTheme = (overrides = {}) => ({
  _id: "テーマID001",
  title: "テストテーマ",
  description: "テストの説明文",
  slug: "test-theme",
  status: "active",
  tags: [],
  createdAt: new Date("2024-01-01T00:00:00.000Z"),
  ...overrides,
});

/**
 * Theme.find().sort() のモックをセットアップするヘルパー関数
 * @returns {sortMock} sort モック関数（呼び出し引数の検証に使用）
 */
const mockThemeFindSorted = (themes) => {
  const sortMock = vi.fn().mockResolvedValue(themes);
  Theme.find.mockReturnValue({ sort: sortMock });
  return { sortMock };
};

/**
 * モック用のリクエスト・レスポンスオブジェクトを生成するヘルパー関数
 * @param {object} query - クエリパラメータ
 * @param {object|undefined} user - 認証済みユーザー情報（optionalProtect で設定される）
 */
const createMockReqRes = (query = {}, user = undefined) => {
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
    SharpQuestion.aggregate.mockResolvedValue([]);
    ChatThread.aggregate.mockResolvedValue([]);
  });

  describe("レスポンスフィールドの検証", () => {
    test("status フィールドがレスポンスに含まれること", async () => {
      const mockTheme = createMockTheme({ status: "active" });
      mockThemeFindSorted([mockTheme]);

      const { req, res } = createMockReqRes();
      await getAllThemes(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const responseData = res.json.mock.calls[0][0];
      expect(responseData[0]).toHaveProperty("status", "active");
    });

    test("createdAt フィールドがレスポンスに含まれること", async () => {
      const createdAt = new Date("2024-06-15T10:00:00.000Z");
      const mockTheme = createMockTheme({ createdAt });
      mockThemeFindSorted([mockTheme]);

      const { req, res } = createMockReqRes();
      await getAllThemes(req, res);

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
      await getAllThemes(req, res);

      const responseData = res.json.mock.calls[0][0];
      expect(responseData[0]).toHaveProperty("status", "draft");
    });

    test("既存フィールド（_id, title, description, slug, keyQuestionCount, commentCount）もレスポンスに含まれること", async () => {
      const mockTheme = createMockTheme();
      SharpQuestion.aggregate.mockResolvedValue([
        { _id: mockTheme._id, count: 3 },
      ]);
      ChatThread.aggregate.mockResolvedValue([
        { _id: mockTheme._id, count: 5 },
      ]);
      mockThemeFindSorted([mockTheme]);

      const { req, res } = createMockReqRes();
      await getAllThemes(req, res);

      const responseData = res.json.mock.calls[0][0];
      expect(responseData[0]).toMatchObject({
        _id: "テーマID001",
        title: "テストテーマ",
        description: "テストの説明文",
        slug: "test-theme",
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
      await getAllThemes(req, res);

      const responseData = res.json.mock.calls[0][0];
      expect(responseData[0]).toHaveProperty("tags", ["政策", "社会保障"]);
    });

    test("tagsが未設定の場合、空配列がレスポンスに含まれること", async () => {
      const mockTheme = createMockTheme({ tags: undefined });
      mockThemeFindSorted([mockTheme]);

      const { req, res } = createMockReqRes();
      await getAllThemes(req, res);

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
      await getAllThemes(req, res);

      expect(Theme.find).toHaveBeenCalledWith({});
    });

    test("非管理者が includeInactive=true を指定しても、公開中テーマのみのフィルタを使用すること", async () => {
      mockThemeFindSorted([]);

      const { req, res } = createMockReqRes({ includeInactive: "true" });
      await getAllThemes(req, res);

      expect(Theme.find).toHaveBeenCalledWith({ status: "active" });
    });

    test("includeInactive パラメータなしの場合、公開中テーマのみのフィルタ（{ status: 'active' }）を使用すること", async () => {
      const { sortMock } = mockThemeFindSorted([]);

      const { req, res } = createMockReqRes();
      await getAllThemes(req, res);

      expect(Theme.find).toHaveBeenCalledWith({ status: "active" });
      expect(sortMock).toHaveBeenCalledWith({ createdAt: -1 });
    });

    test("includeInactive=false の場合、公開中テーマのみのフィルタを使用すること", async () => {
      mockThemeFindSorted([]);

      const { req, res } = createMockReqRes(
        { includeInactive: "false" },
        { role: "admin" }
      );
      await getAllThemes(req, res);

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
        slug: "draft-theme",
      });
      mockThemeFindSorted([activeTheme, draftTheme]);

      const { req, res } = createMockReqRes(
        { includeInactive: "true" },
        { role: "admin" }
      );
      await getAllThemes(req, res);

      const responseData = res.json.mock.calls[0][0];
      expect(responseData).toHaveLength(2);
      expect(responseData[0]).toHaveProperty("status", "active");
      expect(responseData[1]).toHaveProperty("status", "draft");
    });
  });

  describe("エラーハンドリング", () => {
    test("DB エラーが発生した場合、500 エラーを返すこと", async () => {
      Theme.find.mockReturnValue({
        sort: vi.fn().mockRejectedValue(new Error("DB接続エラー")),
      });

      const { req, res } = createMockReqRes();
      await getAllThemes(req, res);

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
const createUpdateMockReqRes = (body = {}, params = {}) => {
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
const createMockThemeDoc = (overrides = {}) => ({
  _id: VALID_THEME_ID,
  title: "テストテーマ",
  description: "テストの説明文",
  slug: "test-theme",
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
    test("status=active のテーマで pipelineConfig を変更しようとすると 400 エラーを返すこと", async () => {
      Theme.findById.mockResolvedValue(
        createMockThemeDoc({ status: "active" })
      );

      const { req, res } = createUpdateMockReqRes({
        pipelineConfig: {
          chat: { model: "openai/gpt-5.4", prompt: "新しいプロンプト" },
        },
      });
      await updateTheme(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining("ロック") })
      );
    });

    test("status=active のテーマで customPrompt を変更しようとすると 400 エラーを返すこと", async () => {
      Theme.findById.mockResolvedValue(
        createMockThemeDoc({ status: "active" })
      );

      const { req, res } = createUpdateMockReqRes({
        customPrompt: "新しいカスタムプロンプト",
      });
      await updateTheme(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining("ロック") })
      );
    });

    test("status=closed のテーマで pipelineConfig を変更しようとすると 400 エラーを返すこと", async () => {
      Theme.findById.mockResolvedValue(
        createMockThemeDoc({ status: "closed" })
      );

      const { req, res } = createUpdateMockReqRes({
        pipelineConfig: {
          chat: { model: "openai/gpt-5.4", prompt: "新しいプロンプト" },
        },
      });
      await updateTheme(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    test("status=draft のテーマでは pipelineConfig の変更が許可されること", async () => {
      const mockTheme = createMockThemeDoc({ status: "draft" });
      Theme.findById.mockResolvedValue(mockTheme);
      Theme.findByIdAndUpdate.mockResolvedValue(mockTheme);

      const { req, res } = createUpdateMockReqRes({
        pipelineConfig: {
          chat: { model: "openai/gpt-5.4", prompt: "新しいプロンプト" },
        },
      });
      await updateTheme(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe("ステータス遷移バリデーション", () => {
    test("draft → active の遷移は許可されること", async () => {
      const mockTheme = createMockThemeDoc({ status: "draft" });
      Theme.findById.mockResolvedValue(mockTheme);
      Theme.findByIdAndUpdate.mockResolvedValue({
        ...mockTheme,
        status: "active",
      });

      const { req, res } = createUpdateMockReqRes({ status: "active" });
      await updateTheme(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    test("active → closed の遷移は許可されること", async () => {
      const mockTheme = createMockThemeDoc({ status: "active" });
      Theme.findById.mockResolvedValue(mockTheme);
      Theme.findByIdAndUpdate.mockResolvedValue({
        ...mockTheme,
        status: "closed",
      });

      const { req, res } = createUpdateMockReqRes({ status: "closed" });
      await updateTheme(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    test("closed → draft の遷移は拒否されること（終端状態）", async () => {
      Theme.findById.mockResolvedValue(
        createMockThemeDoc({ status: "closed" })
      );

      const { req, res } = createUpdateMockReqRes({ status: "draft" });
      await updateTheme(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining("遷移") })
      );
    });

    test("closed → active の遷移は拒否されること", async () => {
      Theme.findById.mockResolvedValue(
        createMockThemeDoc({ status: "closed" })
      );

      const { req, res } = createUpdateMockReqRes({ status: "active" });
      await updateTheme(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    test("active → draft の遷移は拒否されること（公開後はdraftに戻れない）", async () => {
      Theme.findById.mockResolvedValue(
        createMockThemeDoc({ status: "active" })
      );

      const { req, res } = createUpdateMockReqRes({ status: "draft" });
      await updateTheme(req, res);

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

  const createEmergencyReqRes = (body = {}, params = {}) => ({
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
    mockTheme.pipelineConfig = {
      get: vi
        .fn()
        .mockReturnValue({ model: "旧モデル", prompt: "旧プロンプト" }),
    };
    Theme.findById.mockResolvedValue(mockTheme);
    Theme.findByIdAndUpdate.mockResolvedValue(mockTheme);

    const { req, res } = createEmergencyReqRes({
      stageId: "chat",
      prompt: "修正後プロンプト",
      reason: "プロンプトの誤字修正",
    });
    await emergencyUpdatePipelineConfig(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  test("reason が未指定の場合は 400 エラーを返すこと", async () => {
    Theme.findById.mockResolvedValue(createMockThemeDoc({ status: "active" }));

    const { req, res } = createEmergencyReqRes({
      stageId: "chat",
      prompt: "修正後プロンプト",
      // reason なし
    });
    await emergencyUpdatePipelineConfig(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("reason") })
    );
  });

  test("status=draft のテーマでは緊急修正を拒否すること（400 エラー）", async () => {
    Theme.findById.mockResolvedValue(createMockThemeDoc({ status: "draft" }));

    const { req, res } = createEmergencyReqRes({
      stageId: "chat",
      prompt: "修正後プロンプト",
      reason: "緊急修正理由",
    });
    await emergencyUpdatePipelineConfig(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("active") })
    );
  });

  test("緊急修正時に PipelineConfigChangeLog に変更ログが記録されること", async () => {
    const mockTheme = createMockThemeDoc({ status: "active" });
    mockTheme.pipelineConfig = {
      get: vi
        .fn()
        .mockReturnValue({ model: "旧モデル", prompt: "旧プロンプト" }),
    };
    Theme.findById.mockResolvedValue(mockTheme);
    Theme.findByIdAndUpdate.mockResolvedValue(mockTheme);

    const { req, res } = createEmergencyReqRes({
      stageId: "chat",
      prompt: "修正後プロンプト",
      reason: "プロンプトの誤字修正",
    });
    await emergencyUpdatePipelineConfig(req, res);

    expect(PipelineConfigChangeLog).toHaveBeenCalledWith(
      expect.objectContaining({
        themeId: VALID_THEME_ID,
        stageId: "chat",
        reason: "プロンプトの誤字修正",
        previousPrompt: "旧プロンプト",
        newPrompt: "修正後プロンプト",
      })
    );
  });
});
