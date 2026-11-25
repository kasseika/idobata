/**
 * 他の人の意見を起点にしたチャットのテスト（issue #177）
 *
 * 目的: 参加者が他の人の意見（課題・解決策）に「私もそう思う」「自分の場合は少し違う」と反応して、
 *       論点の既存スレッドで対話を始められることを検証する。
 *       - 起点（origin）を付けた送信では、参加者の発言を反応のラベルとして保存し、起点を発言に記録する。
 *         他の人の意見の文は参加者の発言として保存しない（参加者自身の寄与として抽出されないようにするため）
 *       - AI には、起点の意見の文と、反応の種類に応じた指示を渡す。後続の発言でも起点の意見を渡し続ける
 *       - 最小寄与人数 k が有効なテーマでは、課題・解決策を起点にした送信を拒否する。
 *         原文を AI の文脈に入れると、応答を通じて他の参加者の意見が漏れるため
 *       - 起点の形が不正な場合、別のテーマの意見の場合は拒否する
 *       - テーマ詳細ページ（重要論点を指定しないテーマ全体のスレッド）でも、同じく起点を付けて始められる
 * 前提: 観測するのは、HTTP ステータス、保存されたスレッドの発言、モックした LLM（callLLM）が受け取るメッセージである。
 */
import type { Request, Response } from "express";
import { beforeEach, describe, expect, test, vi } from "vitest";

const ids = vi.hoisted(() => ({
  themeId: "650000000000000000000001",
  otherThemeId: "650000000000000000000002",
  threadId: "650000000000000000000099",
  questionId: "650000000000000000000101",
  problemId: "650000000000000000000201",
  solutionId: "650000000000000000000301",
  userId: "uuid-営業部の佐藤さんの端末",
}));

vi.mock("../models/ChatThread.js", () => ({
  default: { findById: vi.fn() },
}));
vi.mock("../models/Theme.js", () => ({ default: { findById: vi.fn() } }));
vi.mock("../models/SharpQuestion.js", () => ({
  default: { findById: vi.fn(), find: vi.fn() },
}));
vi.mock("../models/QuestionLink.js", () => ({
  default: { aggregate: vi.fn() },
}));
vi.mock("../models/Problem.js", () => ({ default: { findById: vi.fn() } }));
vi.mock("../models/Solution.js", () => ({ default: { findById: vi.fn() } }));
vi.mock("../services/llmService.js", () => ({
  callLLM: vi.fn().mockResolvedValue("賛同された理由を教えてください。"),
}));
vi.mock("../services/pipelineConfigService.js", () => ({
  resolveStageConfig: vi.fn().mockResolvedValue({
    model: "openai/gpt-5.4-mini",
    prompt: "あなたは対話の聞き手です。",
  }),
}));
vi.mock("../workers/extractionWorker.js", () => ({
  processExtraction: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../services/minContributorsService.js", () => ({
  selectVisibleQuestions: vi.fn(async (questions: unknown[]) => ({
    visibleQuestions: questions,
    hiddenCount: 0,
  })),
}));

import {
  OPINION_ORIGIN_INSTRUCTIONS,
  QUESTION_CHAT_INSTRUCTION,
} from "../constants/defaultPrompts.js";
import { handleNewMessageByTheme } from "../controllers/chatController.js";
import ChatThread from "../models/ChatThread.js";
import Problem from "../models/Problem.js";
import QuestionLink from "../models/QuestionLink.js";
import SharpQuestion from "../models/SharpQuestion.js";
import Solution from "../models/Solution.js";
import Theme from "../models/Theme.js";
import { callLLM } from "../services/llmService.js";

/** 他の参加者（鈴木さん）が書いた課題。佐藤さんはこれに反応して対話を始める */
const OTHER_PROBLEM =
  "評価面談が年1回しかなく、日々の成果が評価に反映されにくい。";
/** 他の参加者が書いた解決策 */
const OTHER_SOLUTION = "四半期ごとに上司と短い振り返り面談を行うとよい。";

type StoredMessage = {
  role: string;
  content: string;
  origin?: { type: string; id: unknown; reaction: string };
};

/** テーマのモック（k の有無を切り替える） */
const mockTheme = (minContributors: number | null) => {
  vi.mocked(Theme.findById).mockReturnValue({
    select: () => ({
      lean: vi.fn().mockResolvedValue({ _id: ids.themeId, minContributors }),
    }),
  } as never);
};

/** 課題・解決策の findById(...).lean() のモック。登録した ID だけを返す */
const mockOpinions = (
  model: typeof Problem | typeof Solution,
  docs: Record<string, { statement: string; themeId: string }>
) => {
  vi.mocked(model.findById).mockImplementation(((id: string) => ({
    lean: vi.fn().mockResolvedValue(docs[String(id)] ?? null),
  })) as never);
};

/** 佐藤さん本人の、論点のスレッド */
let thread: {
  _id: string;
  themeId: { toString: () => string };
  questionId: string;
  userId: string;
  messages: StoredMessage[];
  save: ReturnType<typeof vi.fn>;
};

/** チャットのメッセージを送り、レスポンスのモックを返す */
const send = async (body: Record<string, unknown>) => {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  await handleNewMessageByTheme(
    {
      params: { themeId: ids.themeId },
      body: {
        userId: ids.userId,
        threadId: ids.threadId,
        questionId: ids.questionId,
        context: "question",
        ...body,
      },
    } as unknown as Request,
    res as unknown as Response
  );
  return res;
};

/** LLM が受け取ったメッセージの内容を1つの文字列で返す */
const llmInput = (): string => {
  const llmMessages = vi.mocked(callLLM).mock.calls[0][0] as {
    content: string;
  }[];
  return llmMessages.map((m) => m.content).join("\n");
};

beforeEach(() => {
  vi.clearAllMocks();
  thread = {
    _id: ids.threadId,
    themeId: { toString: () => ids.themeId },
    questionId: ids.questionId,
    userId: ids.userId,
    messages: [],
    save: vi.fn().mockResolvedValue(undefined),
  };
  vi.mocked(ChatThread.findById).mockResolvedValue(thread as never);
  vi.mocked(SharpQuestion.findById).mockReturnValue({
    lean: vi.fn().mockResolvedValue({
      _id: ids.questionId,
      themeId: ids.themeId,
      questionText: "評価への納得感を高めるにはどうすればよいだろうか？",
    }),
  } as never);
  vi.mocked(QuestionLink.aggregate).mockResolvedValue([]);
  mockOpinions(Problem, {
    [ids.problemId]: { statement: OTHER_PROBLEM, themeId: ids.themeId },
  });
  mockOpinions(Solution, {
    [ids.solutionId]: { statement: OTHER_SOLUTION, themeId: ids.themeId },
  });
  mockTheme(null);
});

describe("k が無効なテーマで、意見を起点に対話を始める", () => {
  test("「私もそう思う」で始めると、発言を反応のラベルとして保存し、起点を発言に記録すること", async () => {
    const res = await send({
      origin: { type: "problem", id: ids.problemId, reaction: "agree" },
    });

    expect(res.status).toHaveBeenCalledWith(200);
    const userMessage = thread.messages.find((m) => m.role === "user");
    expect(userMessage?.content).toBe("私もそう思う");
    expect(userMessage?.origin?.type).toBe("problem");
    expect(String(userMessage?.origin?.id)).toBe(ids.problemId);
    expect(userMessage?.origin?.reaction).toBe("agree");
    // 他の人の意見の文は、佐藤さんの発言として保存しない
    expect(
      thread.messages.some(
        (m) => m.role === "user" && m.content.includes(OTHER_PROBLEM)
      )
    ).toBe(false);
  });

  test("「私もそう思う」で始めると、起点の意見の文と賛同向けの指示を AI に渡すこと", async () => {
    await send({
      origin: { type: "problem", id: ids.problemId, reaction: "agree" },
    });

    const input = llmInput();
    expect(input).toContain(OTHER_PROBLEM);
    expect(input).toContain(OPINION_ORIGIN_INSTRUCTIONS.agree);
    expect(input).not.toContain(OPINION_ORIGIN_INSTRUCTIONS.differ);
    // 論点の文脈の指示も従来どおり渡す
    expect(input).toContain(QUESTION_CHAT_INSTRUCTION);
  });

  test("「自分の場合は少し違う」で始めると、発言をそのラベルで保存し、違いを聞く指示を AI に渡すこと", async () => {
    await send({
      origin: { type: "solution", id: ids.solutionId, reaction: "differ" },
    });

    const userMessage = thread.messages.find((m) => m.role === "user");
    expect(userMessage?.content).toBe("自分の場合は少し違う");
    const input = llmInput();
    expect(input).toContain(OTHER_SOLUTION);
    expect(input).toContain(OPINION_ORIGIN_INSTRUCTIONS.differ);
    expect(input).not.toContain(OPINION_ORIGIN_INSTRUCTIONS.agree);
  });

  test("起点を付けずに続けて送った発言でも、直近の起点の意見の文を AI に渡し続けること", async () => {
    // 前提: スレッドには、すでに課題を起点に始めた発言と AI の応答がある
    thread.messages.push(
      {
        role: "user",
        content: "私もそう思う",
        origin: { type: "problem", id: ids.problemId, reaction: "agree" },
      },
      { role: "assistant", content: "賛同された理由を教えてください。" }
    );

    const res = await send({ message: "面談が少ないと上司と話す機会がない" });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(llmInput()).toContain(OTHER_PROBLEM);
  });

  test("起点のない普段の対話では、起点の意見の指示を AI に渡さないこと", async () => {
    const res = await send({ message: "評価の仕組みに不満があります" });

    expect(res.status).toHaveBeenCalledWith(200);
    const input = llmInput();
    expect(input).not.toContain(OPINION_ORIGIN_INSTRUCTIONS.agree);
    expect(input).not.toContain(OPINION_ORIGIN_INSTRUCTIONS.differ);
  });
});

describe("テーマ全体のスレッドで、意見を起点に対話を始める", () => {
  test("論点を指定しない送信でも、発言を反応のラベルとして保存し、起点の意見の文を AI に渡すこと", async () => {
    // 前提: テーマ詳細ページの「寄せられた意見」から始める。論点の文脈（context・questionId）は付けない
    vi.mocked(SharpQuestion.find).mockReturnValue({
      lean: vi.fn().mockResolvedValue([]),
    } as never);

    const res = await send({
      context: undefined,
      questionId: undefined,
      origin: { type: "solution", id: ids.solutionId, reaction: "agree" },
    });

    expect(res.status).toHaveBeenCalledWith(200);
    const userMessage = thread.messages.find((m) => m.role === "user");
    expect(userMessage?.content).toBe("私もそう思う");
    expect(userMessage?.origin?.type).toBe("solution");
    const input = llmInput();
    expect(input).toContain(OTHER_SOLUTION);
    expect(input).toContain(OPINION_ORIGIN_INSTRUCTIONS.agree);
  });
});

describe("起点を付けた送信を拒否する場合", () => {
  test("k が有効なテーマでは、課題を起点にした送信を 403 で拒否し、AI を呼ばず保存もしないこと", async () => {
    mockTheme(5);

    const res = await send({
      origin: { type: "problem", id: ids.problemId, reaction: "agree" },
    });

    expect(res.status).toHaveBeenCalledWith(403);
    expect(callLLM).not.toHaveBeenCalled();
    expect(thread.save).not.toHaveBeenCalled();
  });

  test("k が有効なテーマで、起点のない送信は従来どおり受け付けること", async () => {
    mockTheme(5);

    const res = await send({ message: "評価の仕組みに不満があります" });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(callLLM).toHaveBeenCalled();
  });

  test("別のテーマの課題を起点に指定された場合は 404 で拒否すること", async () => {
    mockOpinions(Problem, {
      [ids.problemId]: { statement: OTHER_PROBLEM, themeId: ids.otherThemeId },
    });

    const res = await send({
      origin: { type: "problem", id: ids.problemId, reaction: "agree" },
    });

    expect(res.status).toHaveBeenCalledWith(404);
    expect(callLLM).not.toHaveBeenCalled();
  });

  test("存在しない課題を起点に指定された場合は 404 で拒否すること", async () => {
    const res = await send({
      origin: {
        type: "problem",
        id: "650000000000000000000999",
        reaction: "agree",
      },
    });

    expect(res.status).toHaveBeenCalledWith(404);
    expect(callLLM).not.toHaveBeenCalled();
  });

  test.each([
    [
      "起点の種類が不明",
      { type: "comment", id: ids.problemId, reaction: "agree" },
    ],
    [
      "反応の種類が不明",
      { type: "problem", id: ids.problemId, reaction: "like" },
    ],
    [
      "ID の形式が不正",
      { type: "problem", id: "not-an-id", reaction: "agree" },
    ],
    ["オブジェクトでない", "problem"],
  ])("%sの場合は 400 で拒否すること", async (_label, origin) => {
    const res = await send({ origin });

    expect(res.status).toHaveBeenCalledWith(400);
    expect(callLLM).not.toHaveBeenCalled();
  });

  test("起点と一緒に発言の本文が送られた場合は 400 で拒否すること", async () => {
    // 発言はサーバーが反応のラベルから決めるため、本文との食い違いを受け付けない
    const res = await send({
      message: "自由に書いた本文",
      origin: { type: "problem", id: ids.problemId, reaction: "agree" },
    });

    expect(res.status).toHaveBeenCalledWith(400);
    expect(callLLM).not.toHaveBeenCalled();
  });
});
