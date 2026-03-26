/**
 * themeExportService ユニットテスト
 *
 * 目的: buildExportData 関数の動作を検証する。
 *       - 全関連データが正しく収集される
 *       - _exportId が正しいプレフィックスで割り当てられる
 *       - ObjectID 参照が _exportId に置換される
 *       - 除外フィールド（clusteringResults, embeddingGeneratedCollections 等）が含まれない
 *       - includeLikes オプションが正しく動作する
 *       - テーマが存在しない場合は err を返す
 */
import type { Types } from "mongoose";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// --- Mongoose モデルのモック ---
vi.mock("../models/Theme.js", () => ({
  default: { findById: vi.fn() },
}));
vi.mock("../models/ChatThread.js", () => ({
  default: { find: vi.fn() },
}));
vi.mock("../models/ImportedItem.js", () => ({
  default: { find: vi.fn() },
}));
vi.mock("../models/Problem.js", () => ({
  default: { find: vi.fn() },
}));
vi.mock("../models/Solution.js", () => ({
  default: { find: vi.fn() },
}));
vi.mock("../models/SharpQuestion.js", () => ({
  default: { find: vi.fn() },
}));
vi.mock("../models/PipelineConfigChangeLog.js", () => ({
  default: { find: vi.fn() },
}));
vi.mock("../models/PolicyDraft.js", () => ({
  default: { find: vi.fn() },
}));
vi.mock("../models/DigestDraft.js", () => ({
  default: { find: vi.fn() },
}));
vi.mock("../models/DebateAnalysis.js", () => ({
  default: { find: vi.fn() },
}));
vi.mock("../models/QuestionVisualReport.js", () => ({
  default: { find: vi.fn() },
}));
vi.mock("../models/QuestionLink.js", () => ({
  default: { find: vi.fn() },
}));
vi.mock("../models/ReportExample.js", () => ({
  default: { find: vi.fn() },
}));
vi.mock("../models/Like.js", () => ({
  default: { find: vi.fn() },
}));

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
import { buildExportData } from "../services/themeExportService.js";

/**
 * テスト用のMongoose ObjectId風の文字列IDを生成するヘルパー
 */
const makeId = (num: number): string =>
  `507f1f77bcf86cd79943${String(num).padStart(4, "0")}`;

/**
 * テスト用のテーマデータを生成するヘルパー
 */
const createMockTheme = (overrides = {}) => ({
  _id: { toString: () => makeId(1) } as unknown as Types.ObjectId,
  title: "地域交通問題テーマ",
  description: "地域の交通問題について議論するテーマです",
  status: "closed",
  tags: ["交通", "地域"],
  customPrompt: null,
  pipelineConfig: new Map(),
  embeddingModel: null,
  showTransparency: null,
  // 除外対象フィールド（エクスポートには含めない）
  clusteringResults: new Map([["stage1", { result: "クラスタリング結果" }]]),
  availableEmbeddingCollections: [
    { model: "text-embedding-3-small", collectionName: "col_001" },
  ],
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  ...overrides,
});

/**
 * 空のコレクションでモデルを全てモックするヘルパー
 */
const mockAllEmpty = () => {
  (ChatThread.find as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (ImportedItem.find as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (Problem.find as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (Solution.find as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (SharpQuestion.find as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (PipelineConfigChangeLog.find as ReturnType<typeof vi.fn>).mockResolvedValue(
    []
  );
  (PolicyDraft.find as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (DigestDraft.find as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (DebateAnalysis.find as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (QuestionVisualReport.find as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (QuestionLink.find as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (ReportExample.find as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (Like.find as ReturnType<typeof vi.fn>).mockResolvedValue([]);
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("buildExportData", () => {
  describe("正常系: テーマ基本情報", () => {
    test("テーマが存在しない場合は err を返す", async () => {
      // 準備
      (Theme.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      // 実行
      const result = await buildExportData(makeId(1));

      // 検証
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain("見つかりません");
      }
    });

    test("テーマの基本情報が正しくエクスポートされる", async () => {
      // 準備
      const mockTheme = createMockTheme();
      (Theme.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockTheme);
      mockAllEmpty();

      // 実行
      const result = await buildExportData(makeId(1));

      // 検証
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const data = result.value;
        expect(data.version).toBe("1.0.0");
        expect(data.theme.title).toBe("地域交通問題テーマ");
        expect(data.theme.description).toBe(
          "地域の交通問題について議論するテーマです"
        );
        expect(data.theme.status).toBe("closed");
        expect(data.theme.tags).toEqual(["交通", "地域"]);
      }
    });

    test("除外フィールド（clusteringResults, availableEmbeddingCollections）がエクスポートに含まれない", async () => {
      // 準備
      const mockTheme = createMockTheme();
      (Theme.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockTheme);
      mockAllEmpty();

      // 実行
      const result = await buildExportData(makeId(1));

      // 検証
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const themeData = result.value.theme;
        expect(themeData).not.toHaveProperty("clusteringResults");
        expect(themeData).not.toHaveProperty("availableEmbeddingCollections");
      }
    });

    test("関連データが0件の場合、全コレクションが空配列で返される", async () => {
      // 準備
      (Theme.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockTheme()
      );
      mockAllEmpty();

      // 実行
      const result = await buildExportData(makeId(1));

      // 検証
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const data = result.value;
        expect(data.chatThreads).toHaveLength(0);
        expect(data.importedItems).toHaveLength(0);
        expect(data.problems).toHaveLength(0);
        expect(data.solutions).toHaveLength(0);
        expect(data.sharpQuestions).toHaveLength(0);
        expect(data.pipelineConfigChangeLogs).toHaveLength(0);
        expect(data.policyDrafts).toHaveLength(0);
        expect(data.digestDrafts).toHaveLength(0);
        expect(data.debateAnalyses).toHaveLength(0);
        expect(data.questionVisualReports).toHaveLength(0);
        expect(data.questionLinks).toHaveLength(0);
        expect(data.reportExamples).toHaveLength(0);
        expect(data.likes).toHaveLength(0);
      }
    });
  });

  describe("正常系: _exportId 割り当てと参照置換", () => {
    test("Problem に _exportId が割り当てられ、ObjectID が _exportId に置換される", async () => {
      // 準備
      const chatThreadObjectId = makeId(100);
      const problemObjectId = makeId(200);

      (Theme.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockTheme()
      );
      mockAllEmpty();

      (ChatThread.find as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          _id: { toString: () => chatThreadObjectId },
          userId: "ユーザー001",
          messages: [],
          extractedProblemIds: [{ toString: () => problemObjectId }],
          extractedSolutionIds: [],
          sessionId: null,
          questionId: null,
          createdAt: new Date("2026-01-01T10:00:00.000Z"),
          updatedAt: new Date("2026-01-01T10:00:00.000Z"),
        },
      ]);

      (Problem.find as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          _id: { toString: () => problemObjectId },
          statement: "交通渋滞が深刻な問題",
          sourceOriginId: { toString: () => chatThreadObjectId },
          sourceType: "chat",
          originalSnippets: ["渋滞がひどい"],
          sourceMetadata: {},
          version: 1,
          // 除外対象フィールド
          embeddingGeneratedCollections: ["collection_001"],
          createdAt: new Date("2026-01-01T10:01:00.000Z"),
          updatedAt: new Date("2026-01-01T10:01:00.000Z"),
        },
      ]);

      // 実行
      const result = await buildExportData(makeId(1));

      // 検証: _exportId が割り当てられていること
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const data = result.value;

        // Problem の _exportId
        expect(data.problems).toHaveLength(1);
        expect(data.problems[0]._exportId).toMatch(/^p_/);
        expect(data.problems[0]._originalId).toBe(problemObjectId);

        // ChatThread の _exportId
        expect(data.chatThreads).toHaveLength(1);
        expect(data.chatThreads[0]._exportId).toMatch(/^ct_/);

        // Problem.sourceOriginId が ChatThread の _exportId に置換されている
        const chatExportId = data.chatThreads[0]._exportId;
        expect(data.problems[0].sourceOriginId).toBe(chatExportId);

        // ChatThread.extractedProblemIds が Problem の _exportId に置換されている
        const problemExportId = data.problems[0]._exportId;
        expect(data.chatThreads[0].extractedProblemIds).toContain(
          problemExportId
        );

        // 除外フィールドが含まれないこと
        expect(data.problems[0]).not.toHaveProperty(
          "embeddingGeneratedCollections"
        );
      }
    });

    test("SharpQuestion の sourceProblemIds が Problem の _exportId に置換される", async () => {
      // 準備
      const problemObjectId = makeId(200);
      const questionObjectId = makeId(300);

      (Theme.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockTheme()
      );
      mockAllEmpty();

      (Problem.find as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          _id: { toString: () => problemObjectId },
          statement: "課題文",
          sourceOriginId: { toString: () => makeId(100) },
          sourceType: "import",
          originalSnippets: [],
          sourceMetadata: {},
          version: 1,
          embeddingGeneratedCollections: [],
          createdAt: new Date("2026-01-01T10:01:00.000Z"),
          updatedAt: new Date("2026-01-01T10:01:00.000Z"),
        },
      ]);

      (ImportedItem.find as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          _id: { toString: () => makeId(100) },
          sourceType: "csv",
          content: "インポートデータ",
          metadata: {},
          status: "completed",
          extractedProblemIds: [{ toString: () => problemObjectId }],
          extractedSolutionIds: [],
          createdAt: new Date("2026-01-01T09:00:00.000Z"),
          updatedAt: new Date("2026-01-01T09:00:00.000Z"),
          processedAt: null,
          errorMessage: null,
        },
      ]);

      (SharpQuestion.find as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          _id: { toString: () => questionObjectId },
          questionText: "どうすれば課題を解決できるか？",
          tagLine: null,
          tags: ["課題"],
          sourceProblemIds: [{ toString: () => problemObjectId }],
          // 除外対象フィールド
          clusteringResults: new Map(),
          createdAt: new Date("2026-01-02T00:00:00.000Z"),
          updatedAt: new Date("2026-01-02T00:00:00.000Z"),
        },
      ]);

      // 実行
      const result = await buildExportData(makeId(1));

      // 検証
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const data = result.value;

        // SharpQuestion の sourceProblemIds が Problem の _exportId に置換されている
        const problemExportId = data.problems[0]._exportId;
        expect(data.sharpQuestions[0].sourceProblemIds).toContain(
          problemExportId
        );

        // 除外フィールドが含まれないこと
        expect(data.sharpQuestions[0]).not.toHaveProperty("clusteringResults");
      }
    });
  });

  describe("正常系: includeLikes オプション", () => {
    test("includeLikes が false（デフォルト）の場合、いいねデータが空配列になる", async () => {
      // 準備
      (Theme.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockTheme()
      );
      mockAllEmpty();

      // 実行（デフォルトは includeLikes: false）
      const result = await buildExportData(makeId(1));

      // 検証
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.likes).toHaveLength(0);
        // Like.find が呼ばれないこと
        expect(Like.find).not.toHaveBeenCalled();
      }
    });

    test("includeLikes が true の場合、いいねデータが含まれる", async () => {
      // 準備
      const questionObjectId = makeId(300);
      (Theme.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockTheme()
      );
      mockAllEmpty();

      (SharpQuestion.find as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          _id: { toString: () => questionObjectId },
          questionText: "重要論点",
          tagLine: null,
          tags: [],
          sourceProblemIds: [],
          clusteringResults: new Map(),
          createdAt: new Date("2026-01-02T00:00:00.000Z"),
          updatedAt: new Date("2026-01-02T00:00:00.000Z"),
        },
      ]);

      (Like.find as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          _id: { toString: () => makeId(400) },
          userId: "ユーザー001",
          targetId: { toString: () => questionObjectId },
          targetType: "question",
          createdAt: new Date("2026-01-03T00:00:00.000Z"),
          updatedAt: new Date("2026-01-03T00:00:00.000Z"),
        },
      ]);

      // 実行
      const result = await buildExportData(makeId(1), { includeLikes: true });

      // 検証
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const data = result.value;
        expect(data.likes).toHaveLength(1);
        expect(data.likes[0]._exportId).toMatch(/^lk_/);
        // Like.targetId が SharpQuestion の _exportId に置換されている
        const questionExportId = data.sharpQuestions[0]._exportId;
        expect(data.likes[0].targetId).toBe(questionExportId);
      }
    });
  });
});
