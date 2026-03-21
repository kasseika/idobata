/**
 * linkingWorker のユニットテスト
 *
 * 目的: linkQuestionToAllItems の N+1 DB アクセスが解消されていることを検証する。
 *       resolveStageConfig と SharpQuestion.findById がそれぞれ1回のみ呼ばれることを確認する。
 * 注意: DB・LLM・pipelineConfigService をモックして外部依存を排除している。
 */

import { beforeEach, describe, expect, test, vi } from "vitest";

// DB モデルのモック
vi.mock("../models/SharpQuestion.js", () => ({
  default: { findById: vi.fn() },
}));
vi.mock("../models/Problem.js", () => ({
  default: { find: vi.fn(), findById: vi.fn() },
}));
vi.mock("../models/Solution.js", () => ({
  default: { find: vi.fn(), findById: vi.fn() },
}));
vi.mock("../models/QuestionLink.js", () => ({
  default: { findOneAndUpdate: vi.fn() },
}));

// LLM サービスのモック
vi.mock("../services/llmService.js", () => ({
  callLLM: vi.fn(),
}));

// pipelineConfigService のモック
vi.mock("../services/pipelineConfigService.js", () => ({
  resolveStageConfig: vi.fn(),
}));

// Socket サービスのモック（emitExtractionUpdate は副作用のため無視）
vi.mock("../services/socketService.js", () => ({
  emitExtractionUpdate: vi.fn(),
}));

import Problem from "../models/Problem.js";
import QuestionLink from "../models/QuestionLink.js";
import SharpQuestion from "../models/SharpQuestion.js";
import Solution from "../models/Solution.js";
import { callLLM } from "../services/llmService.js";
import { resolveStageConfig } from "../services/pipelineConfigService.js";
import { linkQuestionToAllItems } from "../workers/linkingWorker.js";

describe("linkQuestionToAllItems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("resolveStageConfig は問題数+解決策数に関わらず1回のみ呼ばれる", async () => {
    const テーマID = "テーマID001";
    const 質問ID = "質問ID001";

    (SharpQuestion.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      _id: 質問ID,
      questionText: "どのようにすれば市民参加を促進できるか？",
      themeId: テーマID,
    });

    (Problem.find as ReturnType<typeof vi.fn>).mockResolvedValue([
      { _id: "課題ID001", statement: "市民の関心が低い", themeId: テーマID },
      { _id: "課題ID002", statement: "情報アクセスが困難", themeId: テーマID },
    ]);

    (Solution.find as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        _id: "解決策ID001",
        statement: "オンライン参加の仕組みを整備する",
        themeId: テーマID,
      },
    ]);

    (resolveStageConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      model: "テスト用モデル",
      prompt: "テスト用プロンプト",
    });

    (callLLM as ReturnType<typeof vi.fn>).mockResolvedValue({
      is_relevant: true,
      link_type: "prompts_question",
      relevanceScore: 0.9,
      rationale: "関連性が高い",
    });

    (
      QuestionLink.findOneAndUpdate as ReturnType<typeof vi.fn>
    ).mockResolvedValue({});

    await linkQuestionToAllItems(質問ID);

    // resolveStageConfig は問題2件+解決策1件=3タスクに対して1回のみ
    expect(resolveStageConfig).toHaveBeenCalledTimes(1);
    expect(resolveStageConfig).toHaveBeenCalledWith(テーマID, "linking");
  });

  test("SharpQuestion.findById は1回のみ呼ばれる", async () => {
    const テーマID = "テーマID001";
    const 質問ID = "質問ID001";

    (SharpQuestion.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      _id: 質問ID,
      questionText: "どのようにすれば市民参加を促進できるか？",
      themeId: テーマID,
    });

    (Problem.find as ReturnType<typeof vi.fn>).mockResolvedValue([
      { _id: "課題ID001", statement: "市民の関心が低い", themeId: テーマID },
      { _id: "課題ID002", statement: "情報アクセスが困難", themeId: テーマID },
    ]);

    (Solution.find as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    (resolveStageConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      model: "テスト用モデル",
      prompt: "テスト用プロンプト",
    });

    (callLLM as ReturnType<typeof vi.fn>).mockResolvedValue({
      is_relevant: false,
    });
    (
      QuestionLink.findOneAndUpdate as ReturnType<typeof vi.fn>
    ).mockResolvedValue({});

    await linkQuestionToAllItems(質問ID);

    // SharpQuestion.findById は最初の1回のみ（各タスクで再取得しない）
    expect(SharpQuestion.findById).toHaveBeenCalledTimes(1);
    expect(SharpQuestion.findById).toHaveBeenCalledWith(質問ID);
  });

  test("各 problem/solution に対して callLLM が呼ばれる", async () => {
    const テーマID = "テーマID001";
    const 質問ID = "質問ID001";

    (SharpQuestion.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      _id: 質問ID,
      questionText: "どのようにすれば市民参加を促進できるか？",
      themeId: テーマID,
    });

    (Problem.find as ReturnType<typeof vi.fn>).mockResolvedValue([
      { _id: "課題ID001", statement: "市民の関心が低い", themeId: テーマID },
      { _id: "課題ID002", statement: "情報アクセスが困難", themeId: テーマID },
    ]);

    (Solution.find as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        _id: "解決策ID001",
        statement: "オンライン参加の仕組みを整備する",
        themeId: テーマID,
      },
    ]);

    (resolveStageConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      model: "テスト用モデル",
      prompt: "テスト用プロンプト",
    });

    (callLLM as ReturnType<typeof vi.fn>).mockResolvedValue({
      is_relevant: false,
    });
    (
      QuestionLink.findOneAndUpdate as ReturnType<typeof vi.fn>
    ).mockResolvedValue({});

    await linkQuestionToAllItems(質問ID);

    // 課題2件 + 解決策1件 = 合計3回 callLLM が呼ばれる
    expect(callLLM).toHaveBeenCalledTimes(3);
  });

  test("question.themeId が存在しない場合 → 早期リターンし DB/LLM を呼ばない", async () => {
    const 質問ID = "質問ID001";

    (SharpQuestion.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      _id: 質問ID,
      questionText: "どのようにすれば市民参加を促進できるか？",
      themeId: null, // themeId なし
    });

    await linkQuestionToAllItems(質問ID);

    // themeId がないため Problem.find/Solution.find/resolveStageConfig/callLLM は呼ばれない
    expect(Problem.find).not.toHaveBeenCalled();
    expect(Solution.find).not.toHaveBeenCalled();
    expect(resolveStageConfig).not.toHaveBeenCalled();
    expect(callLLM).not.toHaveBeenCalled();
    expect(QuestionLink.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test("resolveStageConfig がエラーをスローした場合 → callLLM/QuestionLink は呼ばれない", async () => {
    const テーマID = "テーマID001";
    const 質問ID = "質問ID001";

    (SharpQuestion.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      _id: 質問ID,
      questionText: "どのようにすれば市民参加を促進できるか？",
      themeId: テーマID,
    });

    (Problem.find as ReturnType<typeof vi.fn>).mockResolvedValue([
      { _id: "課題ID001", statement: "市民の関心が低い", themeId: テーマID },
    ]);

    (Solution.find as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    (resolveStageConfig as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("model is empty for stage=linking")
    );

    // エラーが発生してもクラッシュしない（内部でキャッチされる）
    await expect(linkQuestionToAllItems(質問ID)).resolves.toBeUndefined();

    // resolveStageConfig エラー後は callLLM/QuestionLink は呼ばれない
    expect(callLLM).not.toHaveBeenCalled();
    expect(QuestionLink.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
