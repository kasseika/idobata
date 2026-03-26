/**
 * themeImportService ユニットテスト
 *
 * 目的: importThemeData 関数の動作を検証する。
 *       - 有効なエクスポートデータから全モデルが正しく作成される
 *       - _exportId から ObjectID への再マッピングが正しく行われる
 *       - インポートされたテーマは常に draft ステータスで作成される
 *       - テーマタイトルが重複する場合はサフィックスが付与される
 *       - DB エラー時にエラーが返される
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

// --- Mongoose モデルのモック ---
vi.mock("../models/Theme.js", () => ({
  default: {
    findOne: vi.fn(),
    create: vi.fn(),
  },
}));
vi.mock("../models/ChatThread.js", () => ({
  default: { insertMany: vi.fn() },
}));
vi.mock("../models/ImportedItem.js", () => ({
  default: { insertMany: vi.fn() },
}));
vi.mock("../models/Problem.js", () => ({
  default: { insertMany: vi.fn() },
}));
vi.mock("../models/Solution.js", () => ({
  default: { insertMany: vi.fn() },
}));
vi.mock("../models/SharpQuestion.js", () => ({
  default: { insertMany: vi.fn() },
}));
vi.mock("../models/PipelineConfigChangeLog.js", () => ({
  default: { insertMany: vi.fn() },
}));
vi.mock("../models/PolicyDraft.js", () => ({
  default: { insertMany: vi.fn() },
}));
vi.mock("../models/DigestDraft.js", () => ({
  default: { insertMany: vi.fn() },
}));
vi.mock("../models/DebateAnalysis.js", () => ({
  default: { insertMany: vi.fn() },
}));
vi.mock("../models/QuestionVisualReport.js", () => ({
  default: { insertMany: vi.fn() },
}));
vi.mock("../models/QuestionLink.js", () => ({
  default: { insertMany: vi.fn() },
}));
vi.mock("../models/ReportExample.js", () => ({
  default: { insertMany: vi.fn() },
}));
vi.mock("../models/Like.js", () => ({
  default: { insertMany: vi.fn() },
}));

import { Types } from "mongoose";
import ChatThread from "../models/ChatThread.js";
import DebateAnalysis from "../models/DebateAnalysis.js";
import DigestDraft from "../models/DigestDraft.js";
import ImportedItem from "../models/ImportedItem.js";
import Like from "../models/Like.js";
import PipelineConfigChangeLog from "../models/PipelineConfigChangeLog.js";
import PolicyDraft from "../models/PolicyDraft.js";
import Problem from "../models/Problem.js";
import QuestionLink from "../models/QuestionLink.js";
import QuestionVisualReport from "../models/QuestionVisualReport.js";
import ReportExample from "../models/ReportExample.js";
import SharpQuestion from "../models/SharpQuestion.js";
import Solution from "../models/Solution.js";
import Theme from "../models/Theme.js";
import { importThemeData } from "../services/themeImportService.js";
import type { ThemeExportData } from "../types/themeExport.js";

/**
 * 全モデルの insertMany を空成功でモックするヘルパー
 */
const mockAllInsertMany = () => {
  (ChatThread.insertMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (ImportedItem.insertMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (Problem.insertMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (Solution.insertMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (SharpQuestion.insertMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (
    PipelineConfigChangeLog.insertMany as ReturnType<typeof vi.fn>
  ).mockResolvedValue([]);
  (PolicyDraft.insertMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (DigestDraft.insertMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (DebateAnalysis.insertMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (
    QuestionVisualReport.insertMany as ReturnType<typeof vi.fn>
  ).mockResolvedValue([]);
  (QuestionLink.insertMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (ReportExample.insertMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (Like.insertMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
};

/**
 * 最小限の有効なエクスポートデータを生成するヘルパー
 */
const createMinimalExportData = (): ThemeExportData => ({
  version: "1.0.0",
  exportedAt: "2026-01-01T00:00:00.000Z",
  theme: {
    title: "地域交通問題テーマ",
    description: "テーマの説明",
    status: "closed",
    tags: ["交通", "地域"],
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("importThemeData", () => {
  describe("正常系: テーマ作成", () => {
    test("最小限のデータで ok を返す", async () => {
      // 準備
      const mockThemeId = new Types.ObjectId();
      (Theme.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (Theme.create as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          _id: mockThemeId,
          title: "地域交通問題テーマ",
        },
      ]);
      mockAllInsertMany();

      const exportData = createMinimalExportData();

      // 実行
      const result = await importThemeData(exportData);

      // 検証
      expect(result.isOk()).toBe(true);
    });

    test("インポートされたテーマは常に draft ステータスで作成される", async () => {
      // 準備: エクスポート元が closed でも、インポート先では draft になる
      const mockThemeId = new Types.ObjectId();
      (Theme.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (Theme.create as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          _id: mockThemeId,
          title: "地域交通問題テーマ",
        },
      ]);
      mockAllInsertMany();

      const exportData = createMinimalExportData();
      // エクスポート元のステータスが closed
      exportData.theme.status = "closed";

      // 実行
      await importThemeData(exportData);

      // 検証: Theme.create が draft ステータスで呼ばれている
      expect(Theme.create).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ status: "draft" })])
      );
    });

    test("インポート統計情報が正しく返される", async () => {
      // 準備
      const mockThemeId = new Types.ObjectId();
      (Theme.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (Theme.create as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          _id: mockThemeId,
          title: "地域交通問題テーマ",
        },
      ]);
      mockAllInsertMany();

      const exportData: ThemeExportData = {
        ...createMinimalExportData(),
        problems: [
          {
            _exportId: "p_001",
            _originalId: "507f1f77bcf86cd799439012",
            statement: "課題文",
            sourceOriginId: "ct_001",
            sourceType: "chat",
            originalSnippets: [],
            sourceMetadata: {},
            version: 1,
            createdAt: "2026-01-01T10:01:00.000Z",
            updatedAt: "2026-01-01T10:01:00.000Z",
          },
        ],
        chatThreads: [
          {
            _exportId: "ct_001",
            _originalId: "507f1f77bcf86cd799439011",
            userId: "ユーザー001",
            messages: [],
            extractedProblemIds: ["p_001"],
            extractedSolutionIds: [],
            sessionId: null,
            questionId: null,
            createdAt: "2026-01-01T10:00:00.000Z",
            updatedAt: "2026-01-01T10:00:00.000Z",
          },
        ],
      };

      // 実行
      const result = await importThemeData(exportData);

      // 検証
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const stats = result.value;
        expect(stats.counts.problems).toBe(1);
        expect(stats.counts.chatThreads).toBe(1);
        expect(stats.themeTitle).toBe("地域交通問題テーマ");
      }
    });
  });

  describe("正常系: タイトル重複処理", () => {
    test("同名のテーマが既に存在する場合はサフィックスが付与される", async () => {
      // 準備: 最初の findOne は既存のテーマを返す、2回目は null（重複なし）
      (Theme.findOne as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ title: "地域交通問題テーマ" })
        .mockResolvedValueOnce(null);

      const mockThemeId = new Types.ObjectId();
      (Theme.create as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          _id: mockThemeId,
          title: "地域交通問題テーマ（インポート）",
        },
      ]);
      mockAllInsertMany();

      const exportData = createMinimalExportData();

      // 実行
      const result = await importThemeData(exportData);

      // 検証: タイトルにサフィックスが付与されていること
      expect(result.isOk()).toBe(true);
      expect(Theme.create).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            title: expect.stringContaining("（インポート）"),
          }),
        ])
      );
    });
  });

  describe("正常系: ID再マッピング", () => {
    test("Problem.sourceOriginId が新しい ChatThread の ObjectID に再マッピングされる", async () => {
      // 準備
      const mockThemeId = new Types.ObjectId();
      (Theme.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (Theme.create as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          _id: mockThemeId,
          title: "地域交通問題テーマ",
        },
      ]);
      mockAllInsertMany();

      const exportData: ThemeExportData = {
        ...createMinimalExportData(),
        chatThreads: [
          {
            _exportId: "ct_001",
            _originalId: "507f1f77bcf86cd799439011",
            userId: "ユーザー001",
            messages: [],
            extractedProblemIds: ["p_001"],
            extractedSolutionIds: [],
            sessionId: null,
            questionId: null,
            createdAt: "2026-01-01T10:00:00.000Z",
            updatedAt: "2026-01-01T10:00:00.000Z",
          },
        ],
        problems: [
          {
            _exportId: "p_001",
            _originalId: "507f1f77bcf86cd799439012",
            statement: "課題文",
            sourceOriginId: "ct_001",
            sourceType: "chat",
            originalSnippets: [],
            sourceMetadata: {},
            version: 1,
            createdAt: "2026-01-01T10:01:00.000Z",
            updatedAt: "2026-01-01T10:01:00.000Z",
          },
        ],
      };

      // 実行
      await importThemeData(exportData);

      // 検証: Problem.insertMany の呼び出し引数を確認
      const problemInsertCall = (Problem.insertMany as ReturnType<typeof vi.fn>)
        .mock.calls[0][0];
      expect(problemInsertCall).toHaveLength(1);

      const insertedProblem = problemInsertCall[0];
      // sourceOriginId が _exportId("ct_001") ではなく、新しい ObjectID になっている
      expect(insertedProblem.sourceOriginId).toBeInstanceOf(Types.ObjectId);
      expect(insertedProblem.sourceOriginId.toString()).not.toBe("ct_001");
      expect(insertedProblem.sourceOriginId.toString()).not.toBe(
        "507f1f77bcf86cd799439011"
      );

      // ChatThread の extractedProblemIds も新しい Problem の ObjectID になっている
      const chatInsertCall = (ChatThread.insertMany as ReturnType<typeof vi.fn>)
        .mock.calls[0][0];
      const insertedChatThread = chatInsertCall[0];
      expect(insertedChatThread.extractedProblemIds[0]).toBeInstanceOf(
        Types.ObjectId
      );
      // Problem の sourceOriginId と ChatThread の _id が一致している
      expect(insertedChatThread._id.toString()).toBe(
        insertedProblem.sourceOriginId.toString()
      );
    });
  });

  describe("異常系", () => {
    test("Theme.create がエラーをスローした場合は err を返す", async () => {
      // 準備
      (Theme.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (Theme.create as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("MongoDB接続エラー")
      );
      mockAllInsertMany();

      const exportData = createMinimalExportData();

      // 実行
      const result = await importThemeData(exportData);

      // 検証
      expect(result.isErr()).toBe(true);
    });

    test("insertMany がエラーをスローした場合は err を返す", async () => {
      // 準備
      const mockThemeId = new Types.ObjectId();
      (Theme.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (Theme.create as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          _id: mockThemeId,
          title: "地域交通問題テーマ",
        },
      ]);
      mockAllInsertMany();
      // Problem.insertMany がエラーをスロー
      (Problem.insertMany as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("書き込みエラー")
      );

      const exportData: ThemeExportData = {
        ...createMinimalExportData(),
        problems: [
          {
            _exportId: "p_001",
            _originalId: "507f1f77bcf86cd799439012",
            statement: "課題文",
            sourceOriginId: "ct_001",
            sourceType: "chat",
            originalSnippets: [],
            sourceMetadata: {},
            version: 1,
            createdAt: "2026-01-01T10:01:00.000Z",
            updatedAt: "2026-01-01T10:01:00.000Z",
          },
        ],
        chatThreads: [
          {
            _exportId: "ct_001",
            _originalId: "507f1f77bcf86cd799439011",
            userId: "ユーザー001",
            messages: [],
            extractedProblemIds: ["p_001"],
            extractedSolutionIds: [],
            sessionId: null,
            questionId: null,
            createdAt: "2026-01-01T10:00:00.000Z",
            updatedAt: "2026-01-01T10:00:00.000Z",
          },
        ],
      };

      // 実行
      const result = await importThemeData(exportData);

      // 検証
      expect(result.isErr()).toBe(true);
    });
  });
});
