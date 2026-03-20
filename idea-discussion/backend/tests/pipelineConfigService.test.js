/**
 * pipelineConfigService のユニットテスト
 *
 * 目的: resolveStageConfig 関数のフォールバックロジックを検証する。
 *       優先度: pipelineConfig > customPrompt（chatステージのみ）> デフォルト値
 * 注意: Theme モデルおよび pipelineStages 定数をモックして外部依存を排除している。
 */

import { beforeEach, describe, expect, test, vi } from "vitest";

// pipelineStages.js のモック
vi.mock("../constants/pipelineStages.js", () => ({
  getPipelineStageById: vi.fn((stageId) => {
    const stages = {
      chat: {
        id: "chat",
        defaultModel: "デフォルトモデル/chat",
        defaultPrompt: "チャットのデフォルトプロンプトです。",
      },
      question_generation: {
        id: "question_generation",
        defaultModel: "デフォルトモデル/question_generation",
        defaultPrompt: "重要論点生成のデフォルトプロンプトです。",
      },
      linking: {
        id: "linking",
        defaultModel: "デフォルトモデル/linking",
        defaultPrompt: "リンキングのデフォルトプロンプトです。",
      },
    };
    return stages[stageId];
  }),
}));

// Theme モデルのモック
vi.mock("../models/Theme.js", () => ({
  default: {
    findById: vi.fn(),
  },
}));

import Theme from "../models/Theme.js";
import { resolveStageConfig } from "../services/pipelineConfigService.js";

/**
 * pipelineConfig の Map をシミュレートするヘルパー
 */
const createMockTheme = (overrides = {}) => {
  const pipelineConfigMap = new Map(
    Object.entries(overrides.pipelineConfig || {})
  );
  return {
    _id: "テーマID001",
    customPrompt: overrides.customPrompt ?? null,
    pipelineConfig: {
      get: (key) => pipelineConfigMap.get(key),
    },
  };
};

describe("resolveStageConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("デフォルト値へのフォールバック", () => {
    test("pipelineConfig が空でカスタム設定なし → デフォルト値を返す", async () => {
      Theme.findById.mockResolvedValue(createMockTheme());

      const result = await resolveStageConfig(
        "テーマID001",
        "question_generation"
      );

      expect(result.model).toBe("デフォルトモデル/question_generation");
      expect(result.prompt).toBe("重要論点生成のデフォルトプロンプトです。");
    });

    test("未知のステージID → 空文字列のデフォルト値を返す", async () => {
      Theme.findById.mockResolvedValue(createMockTheme());

      const result = await resolveStageConfig("テーマID001", "unknown_stage");

      expect(result.model).toBe("");
      expect(result.prompt).toBe("");
    });

    test("テーマが存在しない → デフォルト値を返す", async () => {
      Theme.findById.mockResolvedValue(null);

      const result = await resolveStageConfig("存在しないID", "chat");

      expect(result.model).toBe("デフォルトモデル/chat");
      expect(result.prompt).toBe("チャットのデフォルトプロンプトです。");
    });

    test("DB エラー発生時 → デフォルト値を返す", async () => {
      Theme.findById.mockRejectedValue(new Error("MongoDBエラー"));

      const result = await resolveStageConfig("テーマID001", "linking");

      expect(result.model).toBe("デフォルトモデル/linking");
      expect(result.prompt).toBe("リンキングのデフォルトプロンプトです。");
    });
  });

  describe("カスタム pipelineConfig の優先", () => {
    test("pipelineConfig にモデルとプロンプトが設定されている → カスタム値を返す", async () => {
      Theme.findById.mockResolvedValue(
        createMockTheme({
          pipelineConfig: {
            question_generation: {
              model: "カスタムモデル",
              prompt: "カスタム重要論点プロンプト",
            },
          },
        })
      );

      const result = await resolveStageConfig(
        "テーマID001",
        "question_generation"
      );

      expect(result.model).toBe("カスタムモデル");
      expect(result.prompt).toBe("カスタム重要論点プロンプト");
    });

    test("pipelineConfig にモデルのみ設定 → モデルはカスタム、プロンプトはデフォルト", async () => {
      Theme.findById.mockResolvedValue(
        createMockTheme({
          pipelineConfig: {
            linking: { model: "カスタムリンキングモデル" },
          },
        })
      );

      const result = await resolveStageConfig("テーマID001", "linking");

      expect(result.model).toBe("カスタムリンキングモデル");
      expect(result.prompt).toBe("リンキングのデフォルトプロンプトです。");
    });

    test("pipelineConfig にプロンプトのみ設定 → プロンプトはカスタム、モデルはデフォルト", async () => {
      Theme.findById.mockResolvedValue(
        createMockTheme({
          pipelineConfig: {
            linking: { prompt: "カスタムリンキングプロンプト" },
          },
        })
      );

      const result = await resolveStageConfig("テーマID001", "linking");

      expect(result.prompt).toBe("カスタムリンキングプロンプト");
      expect(result.model).toBe("デフォルトモデル/linking");
    });
  });

  describe("chat ステージの customPrompt 後方互換性", () => {
    test("pipelineConfig なし + customPrompt あり → customPrompt を返す", async () => {
      Theme.findById.mockResolvedValue(
        createMockTheme({ customPrompt: "従来のカスタムプロンプト" })
      );

      const result = await resolveStageConfig("テーマID001", "chat");

      expect(result.prompt).toBe("従来のカスタムプロンプト");
      expect(result.model).toBe("デフォルトモデル/chat");
    });

    test("pipelineConfig.chat.prompt あり + customPrompt あり → pipelineConfig が優先", async () => {
      Theme.findById.mockResolvedValue(
        createMockTheme({
          customPrompt: "従来のカスタムプロンプト",
          pipelineConfig: {
            chat: { prompt: "新しいパイプライン設定プロンプト" },
          },
        })
      );

      const result = await resolveStageConfig("テーマID001", "chat");

      expect(result.prompt).toBe("新しいパイプライン設定プロンプト");
    });

    test("chat 以外のステージは customPrompt を参照しない", async () => {
      Theme.findById.mockResolvedValue(
        createMockTheme({ customPrompt: "従来のカスタムプロンプト" })
      );

      const result = await resolveStageConfig(
        "テーマID001",
        "question_generation"
      );

      expect(result.prompt).toBe("重要論点生成のデフォルトプロンプトです。");
    });
  });
});
