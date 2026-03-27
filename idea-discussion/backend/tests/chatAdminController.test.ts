/**
 * chatController の管理者用スレッド一覧エンドポイント ユニットテスト
 *
 * 目的: getAdminThreadsByTheme が認証・権限チェック済みの状態で
 *       テーマIDに紐づくチャットスレッドをページネーション付きで返すことを検証する。
 * 注意: Mongoose モデルをモックしてDBアクセスを排除している。
 *       認証ミドルウェア（protect/admin）はルーター層の責務のため本テストでは検証しない。
 *       メッセージが0件のスレッドはAPIレベルで除外される。
 */
import type { Request, Response } from "express";
import {
  type MockInstance,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";

// ChatThread モデルのモック
vi.mock("../models/ChatThread.js", () => ({
  default: {
    aggregate: vi.fn(),
  },
}));

// 他の依存モジュールのモック（chatController がインポートするもの）
vi.mock("../models/QuestionLink.js", () => ({
  default: { find: vi.fn() },
}));
vi.mock("../models/SharpQuestion.js", () => ({
  default: { findById: vi.fn() },
}));
vi.mock("../services/llmService.js", () => ({
  callLLM: vi.fn(),
}));
vi.mock("../services/pipelineConfigService.js", () => ({
  resolveStageConfig: vi.fn(),
}));
vi.mock("../workers/extractionWorker.js", () => ({
  processExtraction: vi.fn(),
}));

import { getAdminThreadsByTheme } from "../controllers/chatController.js";
import ChatThread from "../models/ChatThread.js";

/** テスト用のモックレスポンス型 */
interface MockResponse {
  status: MockInstance;
  json: MockInstance;
}

/**
 * モック用のリクエスト・レスポンスオブジェクトを生成するヘルパー関数
 */
const createMockReqRes = (
  params: Record<string, string> = {},
  query: Record<string, string> = {}
) => {
  const req = { params, query } as unknown as Request;
  const res: MockResponse = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return { req, res: res as unknown as Response, mock: res };
};

describe("getAdminThreadsByTheme", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("不正なthemeIDが指定された場合", () => {
    test("400エラーを返すこと", async () => {
      // 前提条件: 不正なObjectID形式
      const { req, res, mock } = createMockReqRes({ themeId: "無効なID" });

      await getAdminThreadsByTheme(req, res);

      // 検証: 400ステータスとエラーメッセージが返ること
      expect(mock.status).toHaveBeenCalledWith(400);
      expect(mock.json).toHaveBeenCalledWith({
        error: "Invalid theme ID format",
      });
    });
  });

  describe("正常なthemeIDが指定された場合", () => {
    // 有効なMongoose ObjectID形式（24桁の16進数）
    const 有効なテーマID = "507f1f77bcf86cd799439011";

    test("スレッドが存在する場合、ページネーション付きで一覧を返すこと", async () => {
      // 前提条件: 2件のスレッドが存在する（いずれもメッセージ1件以上）
      const モックスレッド一覧 = [
        {
          _id: "スレッドID001",
          userId: "ユーザー田中",
          themeId: 有効なテーマID,
          questionId: null,
          messageCount: 5,
          lastMessage: {
            role: "assistant",
            content: "ご意見ありがとうございます。",
            timestamp: new Date("2026-03-27T10:00:00Z"),
          },
          createdAt: new Date("2026-03-27T09:00:00Z"),
          updatedAt: new Date("2026-03-27T10:00:00Z"),
        },
        {
          _id: "スレッドID002",
          userId: "ユーザー鈴木",
          themeId: 有効なテーマID,
          questionId: "質問ID001",
          messageCount: 12,
          lastMessage: {
            role: "user",
            content: "もう少し詳しく教えてください。",
            timestamp: new Date("2026-03-26T15:00:00Z"),
          },
          createdAt: new Date("2026-03-26T14:00:00Z"),
          updatedAt: new Date("2026-03-26T15:00:00Z"),
        },
      ];

      // 1回目のaggregate: スレッド一覧を返す
      (ChatThread.aggregate as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        モックスレッド一覧
      );
      // 2回目のaggregate: 件数カウント（$countの結果形式）を返す
      (ChatThread.aggregate as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { total: 2 },
      ]);

      const { req, res, mock } = createMockReqRes(
        { themeId: 有効なテーマID },
        { page: "1", limit: "20" }
      );

      await getAdminThreadsByTheme(req, res);

      // 検証: スレッド一覧・ページネーション情報が返ること
      expect(mock.json).toHaveBeenCalledWith({
        threads: モックスレッド一覧,
        pagination: {
          total: 2,
          page: 1,
          limit: 20,
          totalPages: 1,
        },
      });
    });

    test("スレッドが存在しない場合、空の一覧を返すこと", async () => {
      // 前提条件: スレッドが0件
      (ChatThread.aggregate as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        []
      );
      // 件数カウントも空配列（$countはマッチ0件のとき空配列を返す）
      (ChatThread.aggregate as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        []
      );

      const { req, res, mock } = createMockReqRes({ themeId: 有効なテーマID });

      await getAdminThreadsByTheme(req, res);

      // 検証: 空の配列とページネーション情報が返ること
      expect(mock.json).toHaveBeenCalledWith({
        threads: [],
        pagination: {
          total: 0,
          page: 1,
          limit: 20,
          totalPages: 0,
        },
      });
    });

    test("ページネーションパラメータが指定された場合、正しくページ情報が計算されること", async () => {
      // 前提条件: 合計50件、1ページ10件で3ページ目を取得
      const モックスレッド = Array.from({ length: 10 }, (_, i) => ({
        _id: `スレッドID${i + 21}`,
        userId: `ユーザー${i + 21}`,
        themeId: 有効なテーマID,
        questionId: null,
        messageCount: 3,
        lastMessage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      (ChatThread.aggregate as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        モックスレッド
      );
      (ChatThread.aggregate as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { total: 50 },
      ]);

      const { req, res, mock } = createMockReqRes(
        { themeId: 有効なテーマID },
        { page: "3", limit: "10" }
      );

      await getAdminThreadsByTheme(req, res);

      // 検証: totalPages が正しく計算されること
      expect(mock.json).toHaveBeenCalledWith({
        threads: モックスレッド,
        pagination: {
          total: 50,
          page: 3,
          limit: 10,
          totalPages: 5,
        },
      });
    });

    test("DBエラーが発生した場合、500エラーを返すこと", async () => {
      // 前提条件: aggregate が例外を投げる
      (ChatThread.aggregate as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("MongoDB接続エラー")
      );

      const { req, res, mock } = createMockReqRes({ themeId: 有効なテーマID });

      await getAdminThreadsByTheme(req, res);

      // 検証: 500ステータスとエラーメッセージが返ること
      expect(mock.status).toHaveBeenCalledWith(500);
      expect(mock.json).toHaveBeenCalledWith({
        error: "Internal server error while getting admin threads.",
      });
    });
  });
});
