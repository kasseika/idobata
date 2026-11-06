/**
 * 政策ドラフト・ダイジェスト生成ワーカーの使用モデルのテスト
 *
 * 目的: generatePolicyDraft / generateDigestDraft が OpenRouter で提供中の
 *       Pro モデル（google/gemini-3.1-pro-preview）を指定して LLM を呼ぶことを検証する。
 *       提供終了した google/gemini-2.5-pro-preview-03-25 を指定すると OpenRouter が
 *       エラーを返し、ドラフトが生成されなくなるため。
 * 注意: DB モデルと llmService をモックして外部依存を排除している。
 *       LLM に渡すモデル ID は外部サービスが観測する値なので、振る舞いとして検証する。
 */

import { beforeEach, describe, expect, test, vi } from "vitest";

/** 提供中の Pro モデル ID（constants/pipelineStages.ts の重い処理と同じモデル） */
const EXPECTED_PRO_MODEL = "google/gemini-3.1-pro-preview";

// DB モデルのモック
vi.mock("../models/SharpQuestion.js", () => ({
  default: { findById: vi.fn() },
}));
vi.mock("../models/QuestionLink.js", () => ({
  default: { find: vi.fn() },
}));
vi.mock("../models/Problem.js", () => ({
  default: { find: vi.fn() },
}));
vi.mock("../models/Solution.js", () => ({
  default: { find: vi.fn() },
}));
// PolicyDraft / DigestDraft は `new Model({...}).save()` で保存されるため、
// コンストラクタとして使える関数でモックする
vi.mock("../models/PolicyDraft.js", () => {
  const PolicyDraft = vi.fn(function (this: { save: () => Promise<void> }) {
    this.save = vi.fn().mockResolvedValue(undefined);
  });
  return { default: Object.assign(PolicyDraft, { findOne: vi.fn() }) };
});
vi.mock("../models/DigestDraft.js", () => ({
  default: vi.fn(function (this: { save: () => Promise<void> }) {
    this.save = vi.fn().mockResolvedValue(undefined);
  }),
}));

// LLM サービスのモック
vi.mock("../services/llmService.js", () => ({
  callLLM: vi.fn(),
}));

import PolicyDraft from "../models/PolicyDraft.js";
import Problem from "../models/Problem.js";
import QuestionLink from "../models/QuestionLink.js";
import SharpQuestion from "../models/SharpQuestion.js";
import Solution from "../models/Solution.js";
import { callLLM } from "../services/llmService.js";
import { generateDigestDraft } from "../workers/digestGenerator.js";
import { generatePolicyDraft } from "../workers/policyGenerator.js";

const questionId = "質問ID001";

describe("ドラフト生成ワーカーの使用モデル", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // 前提: 重要論点が1件あり、課題1件・解決策1件が紐づいている
    (SharpQuestion.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      _id: questionId,
      questionText: "どのようにすれば若者が地域の祭りに参加しやすくなるか？",
      themeId: "テーマID001",
    });
    (QuestionLink.find as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        linkedItemType: "problem",
        linkedItemId: "課題ID001",
        relevanceScore: 0.9,
      },
      {
        linkedItemType: "solution",
        linkedItemId: "解決策ID001",
        relevanceScore: 0.8,
      },
    ]);
    (Problem.find as ReturnType<typeof vi.fn>).mockResolvedValue([
      { _id: "課題ID001", statement: "祭りの準備が平日に集中している" },
    ]);
    (Solution.find as ReturnType<typeof vi.fn>).mockResolvedValue([
      { _id: "解決策ID001", statement: "準備作業を週末にも分散する" },
    ]);

    // 前提: LLM は title と content を持つ正しい JSON を返す
    (callLLM as ReturnType<typeof vi.fn>).mockResolvedValue({
      title: "若者が参加しやすい祭りづくり",
      content: "準備日程の見直しにより参加の敷居を下げる。",
    });
  });

  test("政策ドラフト生成は提供中の Pro モデルで LLM を呼ぶ", async () => {
    await generatePolicyDraft(questionId);

    // 検証: LLM の第3引数（モデル ID）が提供中の Pro モデルである
    expect(callLLM).toHaveBeenCalledTimes(1);
    expect(callLLM).toHaveBeenCalledWith(
      expect.any(Array),
      true,
      EXPECTED_PRO_MODEL
    );
  });

  test("ダイジェスト生成は提供中の Pro モデルで LLM を呼ぶ", async () => {
    // 前提: 元になる最新の政策ドラフトが存在する（findOne().sort().limit() で取得される）
    const latestPolicyDraft = {
      _id: "政策ドラフトID001",
      title: "若者が参加しやすい祭りづくり",
      content: "準備日程の見直しにより参加の敷居を下げる。",
    };
    (PolicyDraft.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      sort: () => ({ limit: () => Promise.resolve(latestPolicyDraft) }),
    });

    await generateDigestDraft(questionId);

    // 検証: LLM の第3引数（モデル ID）が提供中の Pro モデルである
    expect(callLLM).toHaveBeenCalledTimes(1);
    expect(callLLM).toHaveBeenCalledWith(
      expect.any(Array),
      true,
      EXPECTED_PRO_MODEL
    );
  });
});
