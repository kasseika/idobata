/**
 * チャットスレッドの作成・取得 テスト
 *
 * 目的: issue #169 の次の振る舞いを検証する。
 *       - 取得 API（GET）はスレッドを作らず、無ければ threadId: null を返す
 *       - 送信 API（POST）が threadId なしで呼ばれたとき、論点チャットなら questionId 付きで作る
 *       - 同じユーザー・同じ論点（テーマ）のスレッドが既にあれば、新しく作らずそれに追記する
 *       - 二重送信などで一意インデックス違反（E11000）が起きても、既存スレッドに追記して成功させる
 * 前提: 実際の Express ルーターをマウントし、Mongoose モデルと LLM 呼び出しはモックする。
 */
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, test, vi } from "vitest";

const fixtures = vi.hoisted(() => ({
  themeId: "650000000000000000000001",
  otherThemeId: "650000000000000000000002",
  questionId: "650000000000000000000011",
  threadId: "650000000000000000000099",
  userId: "uuid-営業部の佐藤さんの端末",
}));

const chatThreadMock = vi.hoisted(() => {
  const constructed: Array<Record<string, unknown>> = [];
  const saveBehavior: { error: unknown } = { error: null };
  const ctor = vi.fn(function (this: Record<string, unknown>, data: object) {
    Object.assign(this, data);
    this._id = "650000000000000000000100";
    this.isNew = true;
    this.save = vi.fn(async () => {
      if (saveBehavior.error) throw saveBehavior.error;
    });
    constructed.push(this);
  }) as unknown as ReturnType<typeof vi.fn> & {
    findOne: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
  };
  ctor.findOne = vi.fn();
  ctor.findById = vi.fn();
  return { ctor, constructed, saveBehavior };
});

vi.mock("../models/ChatThread.js", () => ({ default: chatThreadMock.ctor }));
vi.mock("../models/Theme.js", () => ({
  default: {
    findById: vi.fn(() => ({
      select: () => ({
        lean: vi.fn().mockResolvedValue({ minContributors: null }),
      }),
    })),
  },
}));
vi.mock("../models/QuestionLink.js", () => ({
  default: { find: vi.fn(), aggregate: vi.fn().mockResolvedValue([]) },
}));
vi.mock("../models/SharpQuestion.js", () => ({
  default: {
    findById: vi.fn(),
    find: vi.fn(() => ({ lean: vi.fn().mockResolvedValue([]) })),
  },
}));
vi.mock("../services/llmService.js", () => ({ callLLM: vi.fn() }));
vi.mock("../services/pipelineConfigService.js", () => ({
  resolveStageConfig: vi.fn(),
}));
vi.mock("../workers/extractionWorker.js", () => ({
  processExtraction: vi.fn().mockResolvedValue(undefined),
}));

import ChatThread from "../models/ChatThread.js";
import SharpQuestion from "../models/SharpQuestion.js";
import themeChatRoutes from "../routes/themeChatRoutes.js";
import { callLLM } from "../services/llmService.js";
import { resolveStageConfig } from "../services/pipelineConfigService.js";

const createApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/themes/:themeId/chat", themeChatRoutes);
  return app;
};

const basePath = `/api/themes/${fixtures.themeId}/chat`;

/** findById(...).lean() / await のどちらでも値が得られる論点クエリ */
const questionQuery = (themeId: string) => {
  const doc = {
    _id: fixtures.questionId,
    themeId,
    questionText: "評価面談をどう改善するか",
  };
  const query = {
    lean: () => Promise.resolve(doc),
    // biome-ignore lint/suspicious/noThenProperty: Mongoose のクエリは thenable なので再現する
    then: (resolve: (value: unknown) => unknown) => resolve(doc),
  };
  return query;
};

const createExistingThread = () => ({
  _id: fixtures.threadId,
  userId: fixtures.userId,
  themeId: fixtures.themeId,
  messages: [{ role: "user", content: "以前の相談です" }],
  extractedProblemIds: [],
  extractedSolutionIds: [],
  save: vi.fn().mockResolvedValue(undefined),
});

beforeEach(() => {
  vi.clearAllMocks();
  chatThreadMock.constructed.length = 0;
  chatThreadMock.saveBehavior.error = null;
  vi.mocked(resolveStageConfig).mockResolvedValue({
    model: "テスト用モデル",
    prompt: "あなたは研修のファシリテーターです",
  } as never);
  vi.mocked(callLLM).mockResolvedValue("もう少し教えてください。");
});

describe("取得 API はスレッドを作らない", () => {
  test("論点のスレッドが無いとき、スレッドを作らず threadId: null と themeId を返す", async () => {
    vi.mocked(SharpQuestion.findById).mockReturnValue(
      questionQuery(fixtures.themeId) as never
    );
    vi.mocked(ChatThread.findOne).mockResolvedValue(null as never);

    const res = await request(createApp())
      .get(`${basePath}/thread-by-question`)
      .query({ userId: fixtures.userId, questionId: fixtures.questionId });

    expect(res.status).toBe(200);
    expect(res.body.threadId).toBeNull();
    expect(res.body.themeId).toBe(fixtures.themeId);
    expect(res.body.messages).toEqual([]);
    expect(chatThreadMock.constructed).toHaveLength(0);
  });

  test("テーマ全体のスレッドが無いとき、スレッドを作らず threadId: null と themeId を返す", async () => {
    vi.mocked(ChatThread.findOne).mockResolvedValue(null as never);

    const res = await request(createApp())
      .get(`${basePath}/thread`)
      .query({ userId: fixtures.userId });

    expect(res.status).toBe(200);
    expect(res.body.threadId).toBeNull();
    expect(res.body.themeId).toBe(fixtures.themeId);
    expect(chatThreadMock.constructed).toHaveLength(0);
  });

  test("スレッドが既にあるときは、そのスレッドの ID とメッセージを返す", async () => {
    vi.mocked(ChatThread.findOne).mockResolvedValue(
      createExistingThread() as never
    );

    const res = await request(createApp())
      .get(`${basePath}/thread`)
      .query({ userId: fixtures.userId });

    expect(res.status).toBe(200);
    expect(res.body.threadId).toBe(fixtures.threadId);
    expect(res.body.messages[0].content).toBe("以前の相談です");
  });
});

describe("送信 API が threadId なしで呼ばれたとき", () => {
  test("論点チャットなら、questionId 付きの新規スレッドを作る", async () => {
    vi.mocked(SharpQuestion.findById).mockReturnValue(
      questionQuery(fixtures.themeId) as never
    );
    vi.mocked(ChatThread.findOne).mockResolvedValue(null as never);

    const res = await request(createApp()).post(`${basePath}/messages`).send({
      userId: fixtures.userId,
      message: "面談の時間が短いです",
      context: "question",
      questionId: fixtures.questionId,
    });

    expect(res.status).toBe(200);
    expect(chatThreadMock.constructed).toHaveLength(1);
    expect(chatThreadMock.constructed[0].questionId).toBe(fixtures.questionId);
    expect(chatThreadMock.constructed[0].themeId).toBe(fixtures.themeId);
  });

  test("論点が別のテーマのものなら、questionId を入れずテーマ全体のスレッドとして作る", async () => {
    vi.mocked(SharpQuestion.findById).mockReturnValue(
      questionQuery(fixtures.otherThemeId) as never
    );
    vi.mocked(ChatThread.findOne).mockResolvedValue(null as never);

    const res = await request(createApp()).post(`${basePath}/messages`).send({
      userId: fixtures.userId,
      message: "面談の時間が短いです",
      context: "question",
      questionId: fixtures.questionId,
    });

    expect(res.status).toBe(200);
    expect(chatThreadMock.constructed[0].questionId).toBeUndefined();
  });

  test("テーマ全体のチャットなら、questionId なしで作る", async () => {
    vi.mocked(ChatThread.findOne).mockResolvedValue(null as never);

    await request(createApp()).post(`${basePath}/messages`).send({
      userId: fixtures.userId,
      message: "研修の進め方について",
    });

    expect(chatThreadMock.constructed).toHaveLength(1);
    expect(chatThreadMock.constructed[0].questionId).toBeUndefined();
  });

  test("同じユーザー・同じ論点のスレッドが既にあれば、新しく作らずそれに追記する", async () => {
    const existing = createExistingThread();
    vi.mocked(SharpQuestion.findById).mockReturnValue(
      questionQuery(fixtures.themeId) as never
    );
    vi.mocked(ChatThread.findOne).mockResolvedValue(existing as never);

    const res = await request(createApp()).post(`${basePath}/messages`).send({
      userId: fixtures.userId,
      message: "面談の時間が短いです",
      context: "question",
      questionId: fixtures.questionId,
    });

    expect(res.status).toBe(200);
    expect(res.body.threadId).toBe(fixtures.threadId);
    expect(chatThreadMock.constructed).toHaveLength(0);
    expect(existing.messages).toHaveLength(3);
    expect(existing.save).toHaveBeenCalled();
    expect(vi.mocked(ChatThread.findOne)).toHaveBeenCalledWith({
      userId: fixtures.userId,
      themeId: fixtures.themeId,
      questionId: fixtures.questionId,
    });
  });

  test("二重作成で E11000 が起きたら、既存スレッドを取り直してそこに追記する", async () => {
    const existing = createExistingThread();
    vi.mocked(ChatThread.findOne)
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce(existing as never);
    chatThreadMock.saveBehavior.error = Object.assign(new Error("dup"), {
      code: 11000,
    });

    const res = await request(createApp()).post(`${basePath}/messages`).send({
      userId: fixtures.userId,
      message: "研修の進め方について",
    });

    expect(res.status).toBe(200);
    expect(res.body.threadId).toBe(fixtures.threadId);
    // 以前の1件 + 今回のユーザー発言とAI応答
    expect(existing.messages).toHaveLength(3);
    expect(existing.save).toHaveBeenCalled();
  });

  test("E11000 以外の保存エラーは握りつぶさず 500 を返す", async () => {
    vi.mocked(ChatThread.findOne).mockResolvedValue(null as never);
    chatThreadMock.saveBehavior.error = new Error("接続エラー");

    const res = await request(createApp()).post(`${basePath}/messages`).send({
      userId: fixtures.userId,
      message: "研修の進め方について",
    });

    expect(res.status).toBe(500);
  });
});
