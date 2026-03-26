/**
 * テーマ エクスポート/インポート 型定義・バリデーション ユニットテスト
 *
 * 目的: ThemeExportData 型と validateExportData バリデーション関数の動作を検証する。
 *       - 有効なエクスポートデータは ok を返す
 *       - version/theme フィールド欠落時は err を返す
 *       - _exportId 参照整合性エラー時は err を返す
 */
import { describe, expect, test } from "vitest";
import {
  type ThemeExportData,
  validateExportData,
} from "../types/themeExport.js";

/**
 * 最小限の有効なエクスポートデータを生成するヘルパー関数
 */
const createMinimalExportData = (): ThemeExportData => ({
  version: "1.0.0",
  exportedAt: "2026-01-01T00:00:00.000Z",
  theme: {
    title: "テスト用テーマ",
    description: "テスト用の説明文",
    status: "closed",
    tags: ["政策", "地域"],
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

describe("validateExportData", () => {
  describe("正常系", () => {
    test("有効な最小限のデータで ok を返す", () => {
      // 準備
      const data = createMinimalExportData();

      // 実行
      const result = validateExportData(data);

      // 検証
      expect(result.isOk()).toBe(true);
    });

    test("全コレクションにデータがある有効なデータで ok を返す", () => {
      // 準備: chatThread -> problem/solution, sharpQuestion の参照が整合しているデータ
      const data: ThemeExportData = {
        ...createMinimalExportData(),
        chatThreads: [
          {
            _exportId: "ct_001",
            _originalId: "507f1f77bcf86cd799439011",
            userId: "ユーザー001",
            messages: [
              {
                role: "user",
                content: "地域の交通問題について意見を述べます",
                timestamp: "2026-01-01T10:00:00.000Z",
              },
            ],
            extractedProblemIds: ["p_001"],
            extractedSolutionIds: ["s_001"],
            sessionId: "セッション001",
            questionId: "q_001",
            createdAt: "2026-01-01T10:00:00.000Z",
            updatedAt: "2026-01-01T10:05:00.000Z",
          },
        ],
        problems: [
          {
            _exportId: "p_001",
            _originalId: "507f1f77bcf86cd799439012",
            statement: "公共交通の本数が少なく、高齢者の移動が困難",
            sourceOriginId: "ct_001",
            sourceType: "chat",
            originalSnippets: ["交通が不便", "バスが少ない"],
            sourceMetadata: {},
            version: 1,
            createdAt: "2026-01-01T10:01:00.000Z",
            updatedAt: "2026-01-01T10:01:00.000Z",
          },
        ],
        solutions: [
          {
            _exportId: "s_001",
            _originalId: "507f1f77bcf86cd799439013",
            statement: "デマンド型交通サービスの導入",
            sourceOriginId: "ct_001",
            sourceType: "chat",
            originalSnippets: ["デマンドバスが良い"],
            sourceMetadata: {},
            version: 1,
            createdAt: "2026-01-01T10:01:00.000Z",
            updatedAt: "2026-01-01T10:01:00.000Z",
          },
        ],
        sharpQuestions: [
          {
            _exportId: "q_001",
            _originalId: "507f1f77bcf86cd799439014",
            questionText: "どのようにすれば高齢者の移動手段を確保できるか？",
            tagLine: "移動手段の確保",
            tags: ["交通", "高齢者"],
            sourceProblemIds: ["p_001"],
            createdAt: "2026-01-02T00:00:00.000Z",
            updatedAt: "2026-01-02T00:00:00.000Z",
          },
        ],
      };

      // 実行
      const result = validateExportData(data);

      // 検証
      expect(result.isOk()).toBe(true);
    });

    test("likes が含まれているデータで ok を返す", () => {
      // 準備
      const data: ThemeExportData = {
        ...createMinimalExportData(),
        sharpQuestions: [
          {
            _exportId: "q_001",
            _originalId: "507f1f77bcf86cd799439014",
            questionText: "どのようにすれば課題を解決できるか？",
            tagLine: null,
            tags: [],
            sourceProblemIds: [],
            createdAt: "2026-01-02T00:00:00.000Z",
            updatedAt: "2026-01-02T00:00:00.000Z",
          },
        ],
        likes: [
          {
            _exportId: "lk_001",
            _originalId: "507f1f77bcf86cd799439015",
            userId: "ユーザー001",
            targetId: "q_001",
            targetType: "question",
            createdAt: "2026-01-03T00:00:00.000Z",
            updatedAt: "2026-01-03T00:00:00.000Z",
          },
        ],
      };

      // 実行
      const result = validateExportData(data);

      // 検証
      expect(result.isOk()).toBe(true);
    });
  });

  describe("異常系: 必須フィールド欠落", () => {
    test("version フィールドが欠落している場合は err を返す", () => {
      // 準備
      const data = createMinimalExportData();
      // @ts-expect-error: テスト目的で意図的に undefined に設定
      data.version = undefined;

      // 実行
      const result = validateExportData(data as unknown as ThemeExportData);

      // 検証
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain("version");
      }
    });

    test("theme フィールドが欠落している場合は err を返す", () => {
      // 準備
      const data = createMinimalExportData();
      // @ts-expect-error: テスト目的で意図的に undefined に設定
      data.theme = undefined;

      // 実行
      const result = validateExportData(data as unknown as ThemeExportData);

      // 検証
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain("theme");
      }
    });

    test("theme.title が欠落している場合は err を返す", () => {
      // 準備
      const data = createMinimalExportData();
      // @ts-expect-error: テスト目的で意図的に undefined に設定
      data.theme.title = undefined;

      // 実行
      const result = validateExportData(data as unknown as ThemeExportData);

      // 検証
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain("theme.title");
      }
    });

    test("サポートされていない version の場合は err を返す", () => {
      // 準備
      const data = createMinimalExportData();
      // @ts-expect-error: テスト目的で不正な値を設定
      data.version = "99.0.0";

      // 実行
      const result = validateExportData(data);

      // 検証
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain("99.0.0");
      }
    });
  });

  describe("異常系: 参照整合性エラー", () => {
    test("chatThread の extractedProblemIds に存在しない _exportId が含まれる場合は err を返す", () => {
      // 準備: p_999 は problems に存在しない
      const data: ThemeExportData = {
        ...createMinimalExportData(),
        chatThreads: [
          {
            _exportId: "ct_001",
            _originalId: "507f1f77bcf86cd799439011",
            userId: "ユーザー001",
            messages: [],
            extractedProblemIds: ["p_999"],
            extractedSolutionIds: [],
            sessionId: null,
            questionId: null,
            createdAt: "2026-01-01T10:00:00.000Z",
            updatedAt: "2026-01-01T10:00:00.000Z",
          },
        ],
        problems: [],
      };

      // 実行
      const result = validateExportData(data);

      // 検証
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain("p_999");
      }
    });

    test("problem の sourceOriginId に存在しない _exportId が含まれる場合は err を返す", () => {
      // 準備: ct_999 は chatThreads/importedItems に存在しない
      const data: ThemeExportData = {
        ...createMinimalExportData(),
        problems: [
          {
            _exportId: "p_001",
            _originalId: "507f1f77bcf86cd799439012",
            statement: "課題文",
            sourceOriginId: "ct_999",
            sourceType: "chat",
            originalSnippets: [],
            sourceMetadata: {},
            version: 1,
            createdAt: "2026-01-01T10:01:00.000Z",
            updatedAt: "2026-01-01T10:01:00.000Z",
          },
        ],
        chatThreads: [],
        importedItems: [],
      };

      // 実行
      const result = validateExportData(data);

      // 検証
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain("ct_999");
      }
    });

    test("sharpQuestion の sourceProblemIds に存在しない _exportId が含まれる場合は err を返す", () => {
      // 準備: p_999 は problems に存在しない
      const data: ThemeExportData = {
        ...createMinimalExportData(),
        sharpQuestions: [
          {
            _exportId: "q_001",
            _originalId: "507f1f77bcf86cd799439014",
            questionText: "重要論点テキスト",
            tagLine: null,
            tags: [],
            sourceProblemIds: ["p_999"],
            createdAt: "2026-01-02T00:00:00.000Z",
            updatedAt: "2026-01-02T00:00:00.000Z",
          },
        ],
        problems: [],
      };

      // 実行
      const result = validateExportData(data);

      // 検証
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain("p_999");
      }
    });

    test("policyDraft の questionId に存在しない _exportId が含まれる場合は err を返す", () => {
      // 準備: q_999 は sharpQuestions に存在しない
      const data: ThemeExportData = {
        ...createMinimalExportData(),
        policyDrafts: [
          {
            _exportId: "pd_001",
            _originalId: "507f1f77bcf86cd799439015",
            questionId: "q_999",
            title: "政策ドラフトタイトル",
            content: "政策ドラフト本文",
            sourceProblemIds: [],
            sourceSolutionIds: [],
            version: 1,
            createdAt: "2026-01-03T00:00:00.000Z",
            updatedAt: "2026-01-03T00:00:00.000Z",
          },
        ],
        sharpQuestions: [],
      };

      // 実行
      const result = validateExportData(data);

      // 検証
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain("q_999");
      }
    });

    test("like の targetId に存在しない _exportId が含まれる場合は err を返す", () => {
      // 準備: q_999 は sharpQuestions に存在しない
      const data: ThemeExportData = {
        ...createMinimalExportData(),
        likes: [
          {
            _exportId: "lk_001",
            _originalId: "507f1f77bcf86cd799439015",
            userId: "ユーザー001",
            targetId: "q_999",
            targetType: "question",
            createdAt: "2026-01-03T00:00:00.000Z",
            updatedAt: "2026-01-03T00:00:00.000Z",
          },
        ],
        sharpQuestions: [],
      };

      // 実行
      const result = validateExportData(data);

      // 検証
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain("q_999");
      }
    });

    test("debateAnalysis の sourceProblemIds に存在しない _exportId が含まれる場合は err を返す", () => {
      // 準備: p_999 は problems に存在しない
      const data: ThemeExportData = {
        ...createMinimalExportData(),
        sharpQuestions: [
          {
            _exportId: "q_001",
            _originalId: "507f1f77bcf86cd799439014",
            questionText: "重要論点テキスト",
            tagLine: null,
            tags: [],
            sourceProblemIds: [],
            createdAt: "2026-01-02T00:00:00.000Z",
            updatedAt: "2026-01-02T00:00:00.000Z",
          },
        ],
        debateAnalyses: [
          {
            _exportId: "da_001",
            _originalId: "507f1f77bcf86cd799439016",
            questionId: "q_001",
            questionText: "重要論点テキスト",
            axes: [],
            agreementPoints: [],
            disagreementPoints: [],
            sourceProblemIds: ["p_999"],
            sourceSolutionIds: [],
            version: 1,
            createdAt: "2026-01-03T00:00:00.000Z",
            updatedAt: "2026-01-03T00:00:00.000Z",
          },
        ],
        problems: [],
      };

      // 実行
      const result = validateExportData(data);

      // 検証
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain("p_999");
      }
    });

    test("questionVisualReport の sourceSolutionIds に存在しない _exportId が含まれる場合は err を返す", () => {
      // 準備: s_999 は solutions に存在しない
      const data: ThemeExportData = {
        ...createMinimalExportData(),
        sharpQuestions: [
          {
            _exportId: "q_001",
            _originalId: "507f1f77bcf86cd799439014",
            questionText: "重要論点テキスト",
            tagLine: null,
            tags: [],
            sourceProblemIds: [],
            createdAt: "2026-01-02T00:00:00.000Z",
            updatedAt: "2026-01-02T00:00:00.000Z",
          },
        ],
        questionVisualReports: [
          {
            _exportId: "qvr_001",
            _originalId: "507f1f77bcf86cd799439017",
            questionId: "q_001",
            questionText: "重要論点テキスト",
            overallAnalysis: "全体分析",
            sourceProblemIds: [],
            sourceSolutionIds: ["s_999"],
            version: 1,
            createdAt: "2026-01-03T00:00:00.000Z",
            updatedAt: "2026-01-03T00:00:00.000Z",
          },
        ],
        solutions: [],
      };

      // 実行
      const result = validateExportData(data);

      // 検証
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain("s_999");
      }
    });
  });
});
