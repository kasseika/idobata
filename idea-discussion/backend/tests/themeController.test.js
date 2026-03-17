/**
 * themeController のユニットテスト
 *
 * 目的: getAllThemes エンドポイントが isActive・createdAt フィールドを正しくレスポンスに含め、
 *       includeInactive パラメータによって全テーマまたはアクティブテーマのみを返すことを検証する。
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

// Mongoose モデルのモック
vi.mock("../models/Theme.js", () => ({
  default: {
    find: vi.fn(),
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

import { getAllThemes } from "../controllers/themeController.js";
import ChatThread from "../models/ChatThread.js";
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
  isActive: true,
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
    test("isActive フィールドがレスポンスに含まれること", async () => {
      const mockTheme = createMockTheme({ isActive: true });
      mockThemeFindSorted([mockTheme]);

      const { req, res } = createMockReqRes();
      await getAllThemes(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const responseData = res.json.mock.calls[0][0];
      expect(responseData[0]).toHaveProperty("isActive", true);
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

    test("isActive が false のテーマでも isActive フィールドが正しく含まれること", async () => {
      const mockTheme = createMockTheme({ isActive: false });
      mockThemeFindSorted([mockTheme]);

      const { req, res } = createMockReqRes(
        { includeInactive: "true" },
        { role: "admin" }
      );
      await getAllThemes(req, res);

      const responseData = res.json.mock.calls[0][0];
      expect(responseData[0]).toHaveProperty("isActive", false);
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

    test("非管理者が includeInactive=true を指定しても、アクティブなテーマのみのフィルタを使用すること", async () => {
      mockThemeFindSorted([]);

      const { req, res } = createMockReqRes({ includeInactive: "true" });
      await getAllThemes(req, res);

      expect(Theme.find).toHaveBeenCalledWith({ isActive: true });
    });

    test("includeInactive パラメータなしの場合、アクティブなテーマのみのフィルタ（{ isActive: true }）を使用すること", async () => {
      const { sortMock } = mockThemeFindSorted([]);

      const { req, res } = createMockReqRes();
      await getAllThemes(req, res);

      expect(Theme.find).toHaveBeenCalledWith({ isActive: true });
      expect(sortMock).toHaveBeenCalledWith({ createdAt: -1 });
    });

    test("includeInactive=false の場合、アクティブなテーマのみのフィルタを使用すること", async () => {
      mockThemeFindSorted([]);

      const { req, res } = createMockReqRes(
        { includeInactive: "false" },
        { role: "admin" }
      );
      await getAllThemes(req, res);

      expect(Theme.find).toHaveBeenCalledWith({ isActive: true });
    });

    test("管理者かつ includeInactive=true の場合、アクティブ・非アクティブ両方のテーマが返されること", async () => {
      const activeTheme = createMockTheme({
        _id: "アクティブID001",
        isActive: true,
      });
      const inactiveTheme = createMockTheme({
        _id: "非アクティブID001",
        isActive: false,
        title: "非アクティブテーマ",
        slug: "inactive-theme",
      });
      mockThemeFindSorted([activeTheme, inactiveTheme]);

      const { req, res } = createMockReqRes(
        { includeInactive: "true" },
        { role: "admin" }
      );
      await getAllThemes(req, res);

      const responseData = res.json.mock.calls[0][0];
      expect(responseData).toHaveLength(2);
      expect(responseData[0]).toHaveProperty("isActive", true);
      expect(responseData[1]).toHaveProperty("isActive", false);
    });
  });

  describe("エラーハンドリング", () => {
    test("DB エラーが発生した場合、500 エラーを返すこと", async () => {
      Theme.find.mockReturnValue({
        sort: vi.fn().mockRejectedValue(new Error("DB接続エラー")),
      });
      // Note: このテストのみ Promise 拒否のためヘルパーを使わず直接モックする

      const { req, res } = createMockReqRes();
      await getAllThemes(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Error fetching themes" })
      );
    });
  });
});
