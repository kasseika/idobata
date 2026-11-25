/**
 * extractionWorker の「起点の意見への参照」に関するユニットテスト（issue #177）
 *
 * 目的: 他の人の意見を起点に始めた対話から新しく抽出した課題・解決策に、起点の意見への参照
 *       （originOpinion: 起点の種類と ID）を保存することを検証する。
 *       起点とほぼ同じ内容の課題が重複して抽出されても、集計の側で重複を扱えるようにするため。
 *       起点のない対話から抽出したものには参照を付けないことも検証する。
 * 注意: DB・LLM・リンキング・Socket はモックしている。Problem・Solution は、
 *       new に渡されたフィールドを記録するコンストラクタとしてモックする。
 */

import mongoose from "mongoose";
import { beforeEach, describe, expect, test, vi } from "vitest";

const created = vi.hoisted(() => ({
  problems: [] as Record<string, unknown>[],
  solutions: [] as Record<string, unknown>[],
}));

/** new に渡されたフィールドを記録し、save で _id を返すモデルのモックを作る */
const mockModel = vi.hoisted(
  () => (store: Record<string, unknown>[]) =>
    Object.assign(
      vi.fn(function (this: Record<string, unknown>, fields: object) {
        store.push({ ...fields });
        this.save = async () => ({ _id: `saved-${store.length}` });
      }),
      { find: vi.fn() }
    )
);

vi.mock("../models/ChatThread.js", () => ({
  default: { findById: vi.fn(), updateOne: vi.fn() },
}));
vi.mock("../models/ImportedItem.js", () => ({
  default: { findById: vi.fn(), updateOne: vi.fn() },
}));
vi.mock("../models/Problem.js", () => ({
  default: mockModel(created.problems),
}));
vi.mock("../models/Solution.js", () => ({
  default: mockModel(created.solutions),
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
}));

import ChatThread from "../models/ChatThread.js";
import Problem from "../models/Problem.js";
import Solution from "../models/Solution.js";
import { callLLM } from "../services/llmService.js";
import { resolveStageConfig } from "../services/pipelineConfigService.js";
import { processExtraction } from "../workers/extractionWorker.js";

const threadId = new mongoose.Types.ObjectId().toString();
const originProblemId = new mongoose.Types.ObjectId();

/** スレッドのモックを、指定した発言で用意する */
const mockThread = (messages: object[]) => {
  vi.mocked(ChatThread.findById).mockResolvedValue({
    _id: threadId,
    themeId: new mongoose.Types.ObjectId(),
    messages,
    extractedProblemIds: [],
    extractedSolutionIds: [],
  } as never);
};

const runExtraction = () =>
  processExtraction({
    data: { sourceType: "chat", sourceOriginId: threadId },
  } as never);

describe("processExtraction: 起点の意見への参照", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    created.problems.length = 0;
    created.solutions.length = 0;
    vi.mocked(Problem.find).mockResolvedValue([] as never);
    vi.mocked(Solution.find).mockResolvedValue([] as never);
    vi.mocked(resolveStageConfig).mockResolvedValue({
      model: "テスト用モデル",
      prompt: "課題文は二文構成で書くこと。",
    } as never);
    vi.mocked(callLLM).mockResolvedValue({
      additions: [
        {
          type: "problem",
          statement:
            "評価面談が年1回しかなく、日々の成果が評価に反映されにくい。",
        },
        {
          type: "solution",
          statement: "月に1回、上司と15分の振り返りをする。",
        },
      ],
    });
  });

  test("起点を付けて始めた対話から抽出した課題・解決策には、起点の種類と ID を保存すること", async () => {
    // 前提: 佐藤さんは他の人の課題に「私もそう思う」と反応し、続けて自分の経験を話した
    mockThread([
      {
        role: "user",
        content: "私もそう思う",
        origin: { type: "problem", id: originProblemId, reaction: "agree" },
      },
      { role: "assistant", content: "そう思った理由を教えてください。" },
      { role: "user", content: "半年前の成果が評価で忘れられていました" },
    ]);

    await runExtraction();

    expect(created.problems).toHaveLength(1);
    expect(created.problems[0].originOpinion).toEqual({
      type: "problem",
      id: originProblemId,
    });
    expect(created.solutions[0].originOpinion).toEqual({
      type: "problem",
      id: originProblemId,
    });
  });

  test("起点のない対話から抽出した課題・解決策には、起点への参照を付けないこと", async () => {
    mockThread([{ role: "user", content: "評価面談が年1回しかありません" }]);

    await runExtraction();

    expect(created.problems).toHaveLength(1);
    expect(created.problems[0].originOpinion).toBeUndefined();
    expect(created.solutions[0].originOpinion).toBeUndefined();
  });
});
