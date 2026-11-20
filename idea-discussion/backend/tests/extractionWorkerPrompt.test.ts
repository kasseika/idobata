/**
 * extractionWorker のプロンプト組み立てに関するユニットテスト
 *
 * 目的: パイプライン設定（管理画面で編集できる指針）が LLM に渡るメッセージに含まれ、
 *       会話履歴・既存項目・入力テキスト・出力形式はコード側で埋め込まれ続けることを検証する。
 * 注意: DB・LLM・リンキング・Socket はモックしている。
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
import ImportedItem from "../models/ImportedItem.js";
import Problem from "../models/Problem.js";
import Solution from "../models/Solution.js";
import { callLLM } from "../services/llmService.js";
import { resolveStageConfig } from "../services/pipelineConfigService.js";
import { processExtraction } from "../workers/extractionWorker.js";

const スレッドID = new mongoose.Types.ObjectId().toString();
const 取り込みID = new mongoose.Types.ObjectId().toString();
const 既存課題ID = new mongoose.Types.ObjectId().toString();
const 設定した指針 =
  "【テスト用の指針】課題文は必ず「です・ます」調で書くこと。";
// 管理画面で保存された古いプロンプトのように、JSON 形式の記述を含む指針
const JSON形式を含む指針 = `${設定した指針}\n出力は {"additions": []} の形で返すこと。`;

/** callLLM に渡された最初のメッセージ本文を取り出す */
function getSentPrompt(): string {
  const [messages] = vi.mocked(callLLM).mock.calls[0];
  return messages.map((message) => message.content).join("\n");
}

describe("processExtraction: 設定したプロンプトの利用", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(callLLM).mockResolvedValue({ additions: [], updates: [] });
    vi.mocked(Solution.find).mockResolvedValue([] as never);
  });

  describe("チャット抽出", () => {
    beforeEach(() => {
      vi.mocked(ChatThread.findById).mockResolvedValue({
        _id: スレッドID,
        themeId: new mongoose.Types.ObjectId(),
        messages: [
          { role: "assistant", content: "困っていることを教えてください" },
          { role: "user", content: "棚の上の商品に手が届かない" },
        ],
        extractedProblemIds: [既存課題ID],
        extractedSolutionIds: [],
      } as never);
      vi.mocked(Problem.find).mockResolvedValue([
        { _id: 既存課題ID, statement: "高い棚の商品を取りにくい" },
      ] as never);
    });

    test("設定した指針が LLM に渡るメッセージに含まれ、設定したモデルで呼ばれる", async () => {
      vi.mocked(resolveStageConfig).mockResolvedValue({
        model: "テスト用モデル",
        prompt: 設定した指針,
      });

      await processExtraction({
        data: { sourceType: "chat", sourceOriginId: スレッドID },
      } as never);

      expect(resolveStageConfig).toHaveBeenCalledWith(
        expect.any(String),
        "extraction_chat"
      );
      expect(getSentPrompt()).toContain(設定した指針);
      expect(vi.mocked(callLLM).mock.calls[0][2]).toBe("テスト用モデル");
    });

    test("会話履歴・既存項目・出力形式はコード側で埋め込まれる", async () => {
      vi.mocked(resolveStageConfig).mockResolvedValue({
        model: "テスト用モデル",
        prompt: 設定した指針,
      });

      await processExtraction({
        data: { sourceType: "chat", sourceOriginId: スレッドID },
      } as never);

      const prompt = getSentPrompt();
      expect(prompt).toContain("棚の上の商品に手が届かない");
      expect(prompt).toContain("[LATEST USER MESSAGE]");
      expect(prompt).toContain(`ID: ${既存課題ID}`);
      expect(prompt).toContain("高い棚の商品を取りにくい");
      expect(prompt).toContain('"additions"');
      expect(prompt).toContain('"updates"');
    });

    test("指針に JSON 形式の記述が含まれていても、出力形式はコード側で渡される", async () => {
      vi.mocked(resolveStageConfig).mockResolvedValue({
        model: "テスト用モデル",
        prompt: JSON形式を含む指針,
      });

      await processExtraction({
        data: { sourceType: "chat", sourceOriginId: スレッドID },
      } as never);

      const prompt = getSentPrompt();
      expect(prompt).toContain(設定した指針);
      expect(prompt).toContain("Output Format");
      expect(prompt).toContain('"updates"');
    });

    test("指針が空のときは暗黙のフォールバックをせず、LLM を呼ばない", async () => {
      vi.mocked(resolveStageConfig).mockResolvedValue({
        model: "テスト用モデル",
        prompt: "",
      });

      await processExtraction({
        data: { sourceType: "chat", sourceOriginId: スレッドID },
      } as never);

      expect(callLLM).not.toHaveBeenCalled();
    });
  });

  describe("インポート抽出", () => {
    beforeEach(() => {
      vi.mocked(ImportedItem.findById).mockResolvedValue({
        _id: 取り込みID,
        themeId: new mongoose.Types.ObjectId(),
        status: "pending",
        content: "最寄りのバス停に屋根がなく、雨の日に高齢者が困っている",
        save: vi.fn(),
      } as never);
    });

    test("設定した指針と入力テキスト・出力形式が LLM に渡る", async () => {
      vi.mocked(resolveStageConfig).mockResolvedValue({
        model: "テスト用モデル",
        prompt: JSON形式を含む指針,
      });

      await processExtraction({
        data: { sourceType: "tweet", sourceOriginId: 取り込みID },
      } as never);

      expect(resolveStageConfig).toHaveBeenCalledWith(
        expect.any(String),
        "extraction_import"
      );
      const prompt = getSentPrompt();
      expect(prompt).toContain(設定した指針);
      expect(prompt).toContain("バス停に屋根がなく");
      expect(prompt).toContain("Output Format");
      expect(prompt).toContain('"additions"');
    });
  });
});
