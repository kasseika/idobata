/**
 * 課題・解決策の抽出と重要論点の生成で、LLM に渡す指示のテスト
 *
 * 目的: 参加者が読みやすい文を作らせるための、次の指示を検証する。
 *       - チャットからの抽出: 1件の文を 120 字以内にし、発言者を「ユーザー」と書かない
 *       - 重要論点の生成: 「詳しく書く」指示をやめ、文字数の指定（50〜100 文字）とそろえる。
 *         理想像の妥当性を問う質問で、極端な理想像を立てない
 * 前提: 観測するのは、モックした LLM（callLLM）が受け取るメッセージの内容である。
 *       DB・リンキング・Socket はモックしている。
 */

import mongoose from "mongoose";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("../models/ChatThread.js", () => ({
  default: { findById: vi.fn(), updateOne: vi.fn() },
}));
vi.mock("../models/ImportedItem.js", () => ({
  default: { findById: vi.fn(), updateOne: vi.fn() },
}));
vi.mock("../models/Problem.js", () => ({
  default: { find: vi.fn(), findById: vi.fn(), findOneAndUpdate: vi.fn() },
}));
vi.mock("../models/Solution.js", () => ({
  default: { find: vi.fn(), findById: vi.fn(), findOneAndUpdate: vi.fn() },
}));
vi.mock("../models/SharpQuestion.js", () => ({
  default: { findOneAndUpdate: vi.fn() },
}));
vi.mock("../services/llmService.js", () => ({ callLLM: vi.fn() }));
vi.mock("../services/pipelineConfigService.js", () => ({
  resolveStageConfig: vi.fn(),
}));
vi.mock("../services/socketService.js", () => ({
  emitNewExtraction: vi.fn(),
}));
vi.mock("../workers/linkingWorker.js", () => ({
  linkItemToQuestions: vi.fn(),
  linkQuestionToAllItems: vi.fn(),
}));

import { getPipelineStageById } from "../constants/pipelineStages.js";
import ChatThread from "../models/ChatThread.js";
import Problem from "../models/Problem.js";
import Solution from "../models/Solution.js";
import { callLLM } from "../services/llmService.js";
import { resolveStageConfig } from "../services/pipelineConfigService.js";
import { processExtraction } from "../workers/extractionWorker.js";
import { generateSharpQuestions } from "../workers/questionGenerator.js";

/** LLM が最初の呼び出しで受け取ったメッセージの内容を1つの文字列にして返す */
const firstLlmPrompt = (): string => {
  const messages = vi.mocked(callLLM).mock.calls[0][0] as {
    content: string;
  }[];
  return messages.map((m) => m.content).join("\n");
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveStageConfig).mockResolvedValue({
    model: "テスト用モデル",
    prompt: "テスト用のシステムプロンプト",
  } as never);
});

describe("チャットからの課題・解決策の抽出", () => {
  beforeEach(() => {
    vi.mocked(ChatThread.findById).mockResolvedValue({
      _id: new mongoose.Types.ObjectId(),
      themeId: new mongoose.Types.ObjectId(),
      messages: [
        { role: "user", content: "倉庫の棚が高くて、上の段の箱が取りにくい" },
      ],
      extractedProblemIds: [],
      extractedSolutionIds: [],
    } as never);
    vi.mocked(Problem.find).mockResolvedValue([] as never);
    vi.mocked(Solution.find).mockResolvedValue([] as never);
    vi.mocked(callLLM).mockResolvedValue({ additions: [], updates: [] });
  });

  const runChatExtraction = () =>
    processExtraction({
      data: {
        sourceType: "chat",
        sourceOriginId: new mongoose.Types.ObjectId().toString(),
      },
    } as never);

  test("1件の文を 120 字以内にするよう指示すること", async () => {
    await runChatExtraction();

    expect(firstLlmPrompt()).toContain("120字以内");
  });

  test("指示と例のどこにも、発言者を「ユーザーは」「ユーザーが」と書いた文がないこと", async () => {
    // 理由: LLM は例の書き方に倣うため、例に「ユーザーが」があると課題文にも残る
    await runChatExtraction();

    const prompt = firstLlmPrompt();
    expect(prompt).not.toContain("ユーザーは");
    expect(prompt).not.toContain("ユーザーが");
  });
});

describe("重要論点の生成", () => {
  beforeEach(() => {
    vi.mocked(Problem.find).mockReturnValue({
      lean: vi
        .fn()
        .mockResolvedValue([
          { statement: "倉庫で上の段の箱を取るときに無理な姿勢になる。" },
        ]),
    } as never);
    // 生成結果は空にして、保存の処理まで進めない
    vi.mocked(callLLM).mockResolvedValue({ questions: [] });
  });

  test("生成の依頼文で「詳しく書く」よう求めず、50〜100 文字に収めるよう求めること", async () => {
    await generateSharpQuestions(new mongoose.Types.ObjectId().toString());

    const prompt = firstLlmPrompt();
    expect(prompt).not.toContain("high detail");
    expect(prompt).toContain("50-100");
  });

  test("既定のプロンプトで、現状と理想像を「詳細に」書かせず、極端な理想像を立てないよう指示すること", () => {
    const defaultPrompt =
      getPipelineStageById("question_generation")?.defaultPrompt ?? "";

    expect(defaultPrompt).not.toContain("詳細に記述");
    expect(defaultPrompt).toContain("極端");
  });
});
