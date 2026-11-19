/**
 * extractionWorker の「既存項目の更新」に関するユニットテスト
 *
 * 目的: LLM が updates に ObjectId として不正な ID を返しても、その項目だけを飛ばし、
 *       残りの更新を続けることを検証する。
 * 注意: DB・LLM・リンキング・Socket はモックしている。
 *       findById のモックは、本物の Mongoose と同じく不正な ID で CastError 相当の例外を投げる。
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

const スレッドID = new mongoose.Types.ObjectId().toString();
const 正しい課題ID = new mongoose.Types.ObjectId().toString();
// 24 桁の 16 進数より 2 桁長く、ObjectId として解釈できない ID
const 壊れた課題ID = `${new mongoose.Types.ObjectId().toString()}ab`;

describe("processExtraction: 不正な ID を含む updates", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(ChatThread.findById).mockResolvedValue({
      _id: スレッドID,
      themeId: new mongoose.Types.ObjectId(),
      messages: [{ role: "user", content: "棚の上の商品に手が届かない" }],
      extractedProblemIds: [正しい課題ID],
      extractedSolutionIds: [],
    } as never);
    vi.mocked(Problem.find).mockResolvedValue([] as never);
    vi.mocked(Solution.find).mockResolvedValue([] as never);
    vi.mocked(resolveStageConfig).mockResolvedValue({
      model: "テスト用モデル",
      prompt: "",
    } as never);

    // 本物の Mongoose と同じく、ObjectId として不正な値では例外を投げる
    vi.mocked(Problem.findById).mockImplementation(((id: string) => {
      if (!mongoose.isValidObjectId(id)) {
        return Promise.reject(new Error("Cast to ObjectId failed"));
      }
      return Promise.resolve({ _id: id, version: 1 });
    }) as never);
    vi.mocked(Problem.findOneAndUpdate).mockResolvedValue({
      version: 2,
    } as never);
  });

  test("不正な ID の更新は飛ばし、後ろにある正しい ID の更新は反映する", async () => {
    vi.mocked(callLLM).mockResolvedValue({
      updates: [
        {
          id: 壊れた課題ID,
          type: "problem",
          statement: "棚の上段の商品を取るときに踏み台を探す手間がかかる",
        },
        {
          id: 正しい課題ID,
          type: "problem",
          statement: "棚の上段の商品を取るときに無理な姿勢になる",
        },
      ],
    });

    await processExtraction({
      data: { sourceType: "chat", sourceOriginId: スレッドID },
    } as never);

    expect(Problem.findById).not.toHaveBeenCalledWith(壊れた課題ID);
    expect(Problem.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(Problem.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 正しい課題ID, version: 1 },
      expect.anything(),
      expect.anything()
    );
  });
});
