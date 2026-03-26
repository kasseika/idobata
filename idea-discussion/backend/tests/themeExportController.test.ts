/**
 * テーマ エクスポート/インポートコントローラー ユニットテスト
 *
 * 目的: exportTheme / importTheme コントローラー関数の動作を検証する。
 *       [exportTheme]
 *       - 正常系: 有効なテーマIDでJSONファイルがダウンロードされる
 *       - 異常系: テーマが存在しない場合は404を返す
 *       - 異常系: 無効なthemeIDの場合は400を返す
 *       - includeLikes クエリパラメータが正しくサービスに渡される
 *       [importTheme]
 *       - 正常系: 有効なデータで201とインポート統計を返す
 *       - 異常系: バリデーションエラーの場合は400を返す
 *       - 異常系: インポートサービスエラーの場合は500を返す
 */
import type { Request, Response } from "express";
import { describe, expect, test, vi } from "vitest";

// --- サービス層のモック ---
vi.mock("../services/themeExportService.js", () => ({
  buildExportData: vi.fn(),
  ExportError: class ExportError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "ExportError";
    }
  },
}));

vi.mock("../services/themeImportService.js", () => ({
  importThemeData: vi.fn(),
}));

// validateExportData はモックし、テスト側で振る舞いを制御する
vi.mock("../types/themeExport.js", () => ({
  validateExportData: vi.fn(),
  ExportValidationError: class ExportValidationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "ExportValidationError";
    }
  },
}));

import { err, ok } from "neverthrow";
import {
  exportTheme,
  importTheme,
} from "../controllers/themeExportController.js";
import {
  ExportError,
  buildExportData,
} from "../services/themeExportService.js";
import { importThemeData } from "../services/themeImportService.js";
import {
  ExportValidationError,
  validateExportData,
} from "../types/themeExport.js";

/**
 * モック用のリクエスト・レスポンスオブジェクトを生成するヘルパー関数
 */
const createMockReqRes = (
  params: Record<string, string> = {},
  query: Record<string, string> = {}
) => {
  const req = { params, query };
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
  };
  return { req, res };
};

/**
 * 最小限の有効なエクスポートデータを生成するヘルパー
 */
const createMockExportData = () => ({
  version: "1.0.0" as const,
  exportedAt: "2026-01-01T00:00:00.000Z",
  theme: {
    title: "地域交通問題テーマ",
    description: null,
    status: "closed" as const,
    tags: [],
    customPrompt: null,
    pipelineConfig: {},
    embeddingModel: null,
    showTransparency: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  },
  chatThreads: [],
  importedItems: [],
  problems: [],
  solutions: [],
  sharpQuestions: [],
  pipelineConfigChangeLogs: [],
  policyDrafts: [],
  digestDrafts: [],
  debateAnalyses: [],
  questionVisualReports: [],
  questionLinks: [],
  reportExamples: [],
  likes: [],
});

describe("exportTheme コントローラー", () => {
  describe("正常系", () => {
    test("有効なテーマIDでエクスポートデータがJSONとして返される", async () => {
      // 準備
      const mockData = createMockExportData();
      (buildExportData as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok(mockData)
      );

      const { req, res } = createMockReqRes({
        themeId: "507f1f77bcf86cd799439011",
      });

      // 実行
      await exportTheme(req as unknown as Request, res as unknown as Response);

      // 検証
      expect(res.status).toHaveBeenCalledWith(200);
      // Content-Disposition ヘッダーが設定されている
      expect(res.setHeader).toHaveBeenCalledWith(
        "Content-Disposition",
        expect.stringContaining("attachment")
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        "Content-Type",
        "application/json"
      );
      expect(res.json).toHaveBeenCalledWith(mockData);
    });

    test("includeLikes=true のクエリパラメータが buildExportData に正しく渡される", async () => {
      // 準備
      const mockData = createMockExportData();
      (buildExportData as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok(mockData)
      );

      const { req, res } = createMockReqRes(
        { themeId: "507f1f77bcf86cd799439011" },
        { includeLikes: "true" }
      );

      // 実行
      await exportTheme(req as unknown as Request, res as unknown as Response);

      // 検証: buildExportData が includeLikes: true で呼ばれている
      expect(buildExportData).toHaveBeenCalledWith("507f1f77bcf86cd799439011", {
        includeLikes: true,
      });
    });

    test("includeLikes パラメータが省略された場合は includeLikes: false で呼ばれる", async () => {
      // 準備
      const mockData = createMockExportData();
      (buildExportData as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok(mockData)
      );

      const { req, res } = createMockReqRes({
        themeId: "507f1f77bcf86cd799439011",
      });

      // 実行
      await exportTheme(req as unknown as Request, res as unknown as Response);

      // 検証
      expect(buildExportData).toHaveBeenCalledWith("507f1f77bcf86cd799439011", {
        includeLikes: false,
      });
    });
  });

  describe("異常系", () => {
    test("テーマが存在しない場合は 404 を返す", async () => {
      // 準備
      (buildExportData as ReturnType<typeof vi.fn>).mockResolvedValue(
        err(new ExportError("テーマが見つかりません: 507f1f77bcf86cd799439011"))
      );

      const { req, res } = createMockReqRes({
        themeId: "507f1f77bcf86cd799439011",
      });

      // 実行
      await exportTheme(req as unknown as Request, res as unknown as Response);

      // 検証
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(String) })
      );
    });

    test("themeId が指定されていない場合は 400 を返す", async () => {
      // 準備
      const { req, res } = createMockReqRes({});

      // 実行
      await exportTheme(req as unknown as Request, res as unknown as Response);

      // 検証
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(String) })
      );
    });

    test("buildExportData が予期しないエラーをスローした場合は 500 を返す", async () => {
      // 準備: Promise.reject で例外をシミュレート
      (buildExportData as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("DBへの接続に失敗しました")
      );

      const { req, res } = createMockReqRes({
        themeId: "507f1f77bcf86cd799439011",
      });

      // 実行
      await exportTheme(req as unknown as Request, res as unknown as Response);

      // 検証
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(String) })
      );
    });
  });
});

describe("importTheme コントローラー", () => {
  /**
   * importTheme 用のモックリクエスト・レスポンスを生成するヘルパー
   */
  const createImportMockReqRes = (body: unknown = {}) => {
    const req = { body };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    return { req, res };
  };

  /** 最小限の有効なインポート統計レスポンス */
  const createMockImportStats = () => ({
    themeId: "507f1f77bcf86cd799439011",
    themeTitle: "地域交通問題テーマ",
    counts: {
      chatThreads: 0,
      importedItems: 0,
      problems: 0,
      solutions: 0,
      sharpQuestions: 0,
      pipelineConfigChangeLogs: 0,
      policyDrafts: 0,
      digestDrafts: 0,
      debateAnalyses: 0,
      questionVisualReports: 0,
      questionLinks: 0,
      reportExamples: 0,
      likes: 0,
    },
  });

  describe("正常系", () => {
    test("有効なデータで 201 とインポート統計を返す", async () => {
      // 準備: バリデーション成功・インポート成功
      const validBody = {
        version: "1.0.0",
        theme: { title: "地域交通問題テーマ" },
      };
      const mockStats = createMockImportStats();

      (validateExportData as ReturnType<typeof vi.fn>).mockReturnValue(
        ok(validBody)
      );
      (importThemeData as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok(mockStats)
      );

      const { req, res } = createImportMockReqRes(validBody);

      // 実行
      await importTheme(req as unknown as Request, res as unknown as Response);

      // 検証
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockStats);
    });
  });

  describe("異常系", () => {
    test("バリデーションエラーの場合は 400 を返す", async () => {
      // 準備: バリデーション失敗
      (validateExportData as ReturnType<typeof vi.fn>).mockReturnValue(
        err(new ExportValidationError("バージョンが不正です"))
      );

      const { req, res } = createImportMockReqRes({ version: "0.0.0" });

      // 実行
      await importTheme(req as unknown as Request, res as unknown as Response);

      // 検証
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(String) })
      );
    });

    test("importThemeData が ExportValidationError を返した場合は 400 を返す", async () => {
      // 準備: バリデーション成功・サービスで ValidationError
      const validBody = { version: "1.0.0" };
      (validateExportData as ReturnType<typeof vi.fn>).mockReturnValue(
        ok(validBody)
      );
      (importThemeData as ReturnType<typeof vi.fn>).mockResolvedValue(
        err(new ExportValidationError("参照が不正です"))
      );

      const { req, res } = createImportMockReqRes(validBody);

      // 実行
      await importTheme(req as unknown as Request, res as unknown as Response);

      // 検証
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test("importThemeData がサーバーエラーを返した場合は 500 を返す", async () => {
      // 準備: バリデーション成功・DB エラー
      const validBody = { version: "1.0.0" };
      (validateExportData as ReturnType<typeof vi.fn>).mockReturnValue(
        ok(validBody)
      );
      (importThemeData as ReturnType<typeof vi.fn>).mockResolvedValue(
        err(new Error("MongoDB 接続エラー"))
      );

      const { req, res } = createImportMockReqRes(validBody);

      // 実行
      await importTheme(req as unknown as Request, res as unknown as Response);

      // 検証
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(String) })
      );
    });

    test("importThemeData が予期しない例外をスローした場合は 500 を返す", async () => {
      // 準備: バリデーション成功・予期しない例外
      const validBody = { version: "1.0.0" };
      (validateExportData as ReturnType<typeof vi.fn>).mockReturnValue(
        ok(validBody)
      );
      (importThemeData as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("予期しないエラー")
      );

      const { req, res } = createImportMockReqRes(validBody);

      // 実行
      await importTheme(req as unknown as Request, res as unknown as Response);

      // 検証
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
