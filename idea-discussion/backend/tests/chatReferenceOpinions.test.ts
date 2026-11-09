/**
 * チャットの参考意見（AI に渡す他の参加者の意見）のテスト
 *
 * 目的: issue #146 の Phase 1 のうち、チャットの参考意見が次の仕様を満たすことを検証する。
 *       - 最小寄与人数 k が有効なテーマでは、他の参加者の課題文・解決策文を AI に渡さない。
 *         AI の応答から、他の参加者の意見が漏れるのを防ぐため
 *       - k が有効なテーマでは、k 人以上が寄与した重要論点の文だけを渡し、k 未満の論点の文は渡さない
 *       - k が無効なテーマでは、従来どおり関連する課題文・解決策文を渡す
 * 前提: 観測するのは、モックした LLM（callLLM）が受け取るメッセージの内容である。
 *       寄与人数の判定（selectVisibleQuestions）は「hiddenQuestionId だけが k を満たさない」としてモックする。
 */
import type { Request, Response } from "express";
import { beforeEach, describe, expect, test, vi } from "vitest";

const ids = vi.hoisted(() => ({
  themeId: "650000000000000000000001",
  threadId: "650000000000000000000099",
  visibleQuestionId: "650000000000000000000101",
  hiddenQuestionId: "650000000000000000000102",
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
vi.mock("../services/llmService.js", () => ({
  callLLM: vi.fn().mockResolvedValue("お話を聞かせてください。"),
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
vi.mock("../services/minContributorsService.js", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("../services/minContributorsService.js")
    >();
  return {
    ...original,
    selectVisibleQuestions: vi.fn(
      async (questions: { _id: unknown; themeId: unknown }[]) => {
        const visibleQuestions = questions.filter(
          (q) => String(q._id) !== ids.hiddenQuestionId
        );
        return {
          visibleQuestions,
          hiddenCount: questions.length - visibleQuestions.length,
        };
      }
    ),
  };
});

import { handleNewMessageByTheme } from "../controllers/chatController.js";
import ChatThread from "../models/ChatThread.js";
import QuestionLink from "../models/QuestionLink.js";
import SharpQuestion from "../models/SharpQuestion.js";
import Theme from "../models/Theme.js";
import { callLLM } from "../services/llmService.js";

/** 他の参加者（鈴木さん）が書いた課題・解決策。k が有効なテーマでは AI に渡してはならない */
const OTHER_PROBLEM = "経理部の月末処理で毎月残業が続いています。";
const OTHER_SOLUTION =
  "月末処理の手順をマニュアル化すると負担が減ると思います。";

const visibleQuestion = {
  _id: ids.visibleQuestionId,
  themeId: ids.themeId,
  questionText: "評価への納得感を高めるにはどうすればよいだろうか？",
};
const hiddenQuestion = {
  _id: ids.hiddenQuestionId,
  themeId: ids.themeId,
  questionText: "経理部の月末処理の負担をどう減らすか？",
};

/** テーマのモック（k の有無を切り替える） */
const mockTheme = (minContributors: number | null) => {
  (Theme.findById as ReturnType<typeof vi.fn>).mockReturnValue({
    select: () => ({
      lean: vi.fn().mockResolvedValue({ _id: ids.themeId, minContributors }),
    }),
  });
};

/** 佐藤さん本人のスレッド */
const createOwnThread = () => ({
  _id: ids.threadId,
  themeId: { toString: () => ids.themeId },
  userId: ids.userId,
  messages: [] as { role: string; content: string }[],
  save: vi.fn().mockResolvedValue(undefined),
});

/** チャットのメッセージを送り、LLM が受け取ったメッセージの内容を1つの文字列で返す */
const sendMessage = async (body: Record<string, unknown>) => {
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
        message: "評価の仕組みに不満があります",
        ...body,
      },
    } as unknown as Request,
    res as unknown as Response
  );
  expect(res.status).toHaveBeenCalledWith(200);
  const llmMessages = (callLLM as ReturnType<typeof vi.fn>).mock.calls[0][0];
  return llmMessages.map((m: { content: string }) => m.content).join("\n");
};

beforeEach(() => {
  vi.clearAllMocks();
  (ChatThread.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
    createOwnThread()
  );
  (SharpQuestion.find as ReturnType<typeof vi.fn>).mockReturnValue({
    lean: vi.fn().mockResolvedValue([visibleQuestion, hiddenQuestion]),
  });
  // どの論点にも、他の参加者の課題・解決策が高い関連度でリンクされている
  (QuestionLink.aggregate as ReturnType<typeof vi.fn>).mockImplementation(
    async (pipeline: { $match?: { linkedItemType?: string } }[]) => {
      const linkedItemType = pipeline[0].$match?.linkedItemType;
      return linkedItemType === "problem"
        ? [
            {
              relevanceScore: 0.9,
              linkedProblem: { themeId: ids.themeId, statement: OTHER_PROBLEM },
            },
          ]
        : [
            {
              relevanceScore: 0.9,
              linkedSolution: {
                themeId: ids.themeId,
                statement: OTHER_SOLUTION,
              },
            },
          ];
    }
  );
});

describe("テーマ全体の文脈のチャット", () => {
  test("k が有効なテーマでは、他の参加者の課題文・解決策文を AI に渡さないこと", async () => {
    mockTheme(5);

    const prompt = await sendMessage({});

    expect(prompt).not.toContain(OTHER_PROBLEM);
    expect(prompt).not.toContain(OTHER_SOLUTION);
  });

  test("k が有効なテーマでは、k 以上の論点の文だけを渡し、k 未満の論点の文は渡さないこと", async () => {
    mockTheme(5);

    const prompt = await sendMessage({});

    expect(prompt).toContain(visibleQuestion.questionText);
    expect(prompt).not.toContain(hiddenQuestion.questionText);
  });

  test("k が無効なテーマでは、従来どおり関連する課題文・解決策文とすべての論点を渡すこと", async () => {
    mockTheme(null);

    const prompt = await sendMessage({});

    expect(prompt).toContain(OTHER_PROBLEM);
    expect(prompt).toContain(OTHER_SOLUTION);
    expect(prompt).toContain(hiddenQuestion.questionText);
  });
});

describe("参考情報の説明文", () => {
  test("k が有効なテーマでは、関連する意見を渡したかのような説明文を入れないこと", async () => {
    // 前提: 意見を渡していないのに「関連する意見を踏まえて」と伝えると、AI が意見を作り出すおそれがある
    mockTheme(5);

    const prompt = await sendMessage({});

    expect(prompt).not.toContain("関連する意見の一部");
    expect(prompt).not.toContain("関連意見も踏まえ");
  });

  test("テーマが見つからない場合は、k が有効なテーマと同じく他の参加者の意見を渡さないこと", async () => {
    (Theme.findById as ReturnType<typeof vi.fn>).mockReturnValue({
      select: () => ({ lean: vi.fn().mockResolvedValue(null) }),
    });

    const prompt = await sendMessage({});

    expect(prompt).not.toContain(OTHER_PROBLEM);
  });
});

describe("重要論点の文脈のチャット", () => {
  const mockQuestion = (question: typeof visibleQuestion) => {
    (SharpQuestion.findById as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue(question),
    });
  };

  test("k が有効なテーマで、k 以上の論点では、論点の文だけを渡し、他の参加者の課題文・解決策文は渡さないこと", async () => {
    mockTheme(5);
    mockQuestion(visibleQuestion);

    const prompt = await sendMessage({
      context: "question",
      questionId: ids.visibleQuestionId,
    });

    expect(prompt).toContain(visibleQuestion.questionText);
    expect(prompt).not.toContain(OTHER_PROBLEM);
    expect(prompt).not.toContain(OTHER_SOLUTION);
  });

  test("k が有効なテーマで、k 未満の論点では、論点の文も渡さないこと", async () => {
    mockTheme(5);
    mockQuestion(hiddenQuestion);

    const prompt = await sendMessage({
      context: "question",
      questionId: ids.hiddenQuestionId,
    });

    expect(prompt).not.toContain(hiddenQuestion.questionText);
    expect(prompt).not.toContain(OTHER_PROBLEM);
  });

  test("別のテーマの論点を指定された場合は、論点の文を渡さないこと", async () => {
    // 前提: k が無効なテーマの URL で、k が有効な別のテーマの論点 ID を指定される
    mockTheme(null);
    mockQuestion({
      ...hiddenQuestion,
      themeId: "650000000000000000000009",
    });

    const prompt = await sendMessage({
      context: "question",
      questionId: ids.hiddenQuestionId,
    });

    expect(prompt).not.toContain(hiddenQuestion.questionText);
  });

  test("k が無効なテーマでは、従来どおり論点に関連する課題文・解決策文を渡すこと", async () => {
    mockTheme(null);
    mockQuestion(hiddenQuestion);

    const prompt = await sendMessage({
      context: "question",
      questionId: ids.hiddenQuestionId,
    });

    expect(prompt).toContain(hiddenQuestion.questionText);
    expect(prompt).toContain(OTHER_PROBLEM);
    expect(prompt).toContain(OTHER_SOLUTION);
  });
});
