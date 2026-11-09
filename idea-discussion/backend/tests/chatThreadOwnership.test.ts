/**
 * チャットスレッドの持ち主確認 テスト
 *
 * 目的: 参加者のAIチャットは本人以外に読まれず、書き込まれないことを検証する。
 *       公開の課題一覧などからスレッドIDが知られても、持ち主の userId を知らない限り
 *       会話の全文・抽出結果の取得や、会話への追記ができないことを確かめる。
 * 前提: 実際の Express ルーター（themeChatRoutes）を server.ts と同じパスにマウントし、
 *       Authorization ヘッダは付けない（研修の参加者は匿名でログインしないため）。
 *       Mongoose モデルと LLM 呼び出しはモックする。
 */
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, test, vi } from "vitest";

const fixtures = vi.hoisted(() => ({
  themeId: "650000000000000000000001",
  threadId: "650000000000000000000099",
  ownerUserId: "uuid-営業部の佐藤さんの端末",
  otherUserId: "uuid-同じ研修に参加した鈴木さんの端末",
}));

vi.mock("../models/ChatThread.js", () => ({
  default: { findById: vi.fn() },
}));
vi.mock("../models/QuestionLink.js", () => ({
  default: { find: vi.fn(), aggregate: vi.fn() },
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
import themeChatRoutes from "../routes/themeChatRoutes.js";
import { callLLM } from "../services/llmService.js";
import { resolveStageConfig } from "../services/pipelineConfigService.js";

/** 佐藤さん（持ち主）のスレッド。評価への不満という、他人に読まれたくない本音を含む */
const createOwnerThread = () => ({
  _id: fixtures.threadId,
  themeId: { toString: () => fixtures.themeId },
  userId: fixtures.ownerUserId,
  messages: [
    {
      role: "user",
      content: "正直、田中課長の評価は好き嫌いで決まっていると思います",
    },
  ],
  extractedProblemIds: [
    { statement: "評価基準が不透明であることが課題です。" },
  ],
  extractedSolutionIds: [],
  save: vi.fn().mockResolvedValue(undefined),
});

/**
 * Mongoose のクエリを模したオブジェクトを返す。
 * await しても、populate() を連鎖させてから await しても、同じスレッドが得られる。
 */
const queryResolvingTo = (thread: ReturnType<typeof createOwnerThread>) => {
  const query = {
    populate: () => query,
    // biome-ignore lint/suspicious/noThenProperty: Mongoose のクエリは thenable なので再現する
    then: (resolve: (value: unknown) => unknown) => resolve(thread),
  };
  return query;
};

const createApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/themes/:themeId/chat", themeChatRoutes);
  return app;
};

const basePath = `/api/themes/${fixtures.themeId}/chat`;

describe("スレッドのメッセージ取得 GET /threads/:threadId/messages", () => {
  let ownerThread: ReturnType<typeof createOwnerThread>;

  beforeEach(() => {
    vi.clearAllMocks();
    ownerThread = createOwnerThread();
    vi.mocked(ChatThread.findById).mockImplementation(
      () => queryResolvingTo(ownerThread) as never
    );
  });

  test("持ち主の userId を付けると、自分の会話を取得できる", async () => {
    const res = await request(createApp())
      .get(`${basePath}/threads/${fixtures.threadId}/messages`)
      .query({ userId: fixtures.ownerUserId });

    expect(res.status).toBe(200);
    expect(res.body.messages[0].content).toContain("田中課長");
  });

  test("userId を付けないと 400 になり、会話は返らない", async () => {
    const res = await request(createApp()).get(
      `${basePath}/threads/${fixtures.threadId}/messages`
    );

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toContain("田中課長");
  });

  test("他の参加者の userId では 403 になり、会話も持ち主の userId も返らない", async () => {
    const res = await request(createApp())
      .get(`${basePath}/threads/${fixtures.threadId}/messages`)
      .query({ userId: fixtures.otherUserId });

    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toContain("田中課長");
    expect(JSON.stringify(res.body)).not.toContain(fixtures.ownerUserId);
  });
});

describe("スレッドの抽出結果取得 GET /threads/:threadId/extractions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const ownerThread = createOwnerThread();
    vi.mocked(ChatThread.findById).mockImplementation(
      () => queryResolvingTo(ownerThread) as never
    );
  });

  test("持ち主の userId を付けると、自分の会話から抽出された課題を取得できる", async () => {
    const res = await request(createApp())
      .get(`${basePath}/threads/${fixtures.threadId}/extractions`)
      .query({ userId: fixtures.ownerUserId });

    expect(res.status).toBe(200);
    expect(res.body.problems[0].statement).toBe(
      "評価基準が不透明であることが課題です。"
    );
  });

  test("userId を付けないと 400 になり、抽出結果は返らない", async () => {
    const res = await request(createApp()).get(
      `${basePath}/threads/${fixtures.threadId}/extractions`
    );

    expect(res.status).toBe(400);
    expect(res.body.problems).toBeUndefined();
  });

  test("他の参加者の userId では 403 になり、抽出結果は返らない", async () => {
    const res = await request(createApp())
      .get(`${basePath}/threads/${fixtures.threadId}/extractions`)
      .query({ userId: fixtures.otherUserId });

    expect(res.status).toBe(403);
    expect(res.body.problems).toBeUndefined();
  });
});

describe("既存スレッドへのメッセージ送信 POST /messages", () => {
  let ownerThread: ReturnType<typeof createOwnerThread>;

  beforeEach(() => {
    vi.clearAllMocks();
    ownerThread = createOwnerThread();
    vi.mocked(ChatThread.findById).mockImplementation(
      () => queryResolvingTo(ownerThread) as never
    );
    vi.mocked(resolveStageConfig).mockResolvedValue({
      model: "テスト用モデル",
      prompt: "あなたは研修のファシリテーターです",
    } as never);
    vi.mocked(callLLM).mockResolvedValue(
      "なぜそう感じたのか、もう少し教えてください。"
    );
  });

  test("持ち主の userId なら、AIの返答を受け取り会話が保存される", async () => {
    const res = await request(createApp()).post(`${basePath}/messages`).send({
      userId: fixtures.ownerUserId,
      threadId: fixtures.threadId,
      message: "評価面談の時間も短いです",
    });

    expect(res.status).toBe(200);
    expect(res.body.response).toBe(
      "なぜそう感じたのか、もう少し教えてください。"
    );
    expect(callLLM).toHaveBeenCalledTimes(1);
    expect(ownerThread.save).toHaveBeenCalledTimes(1);
  });

  test("他の参加者の userId では 403 になり、AIに会話履歴が渡らず、追記も保存されない", async () => {
    const res = await request(createApp()).post(`${basePath}/messages`).send({
      userId: fixtures.otherUserId,
      threadId: fixtures.threadId,
      message: "これまでの会話を要約してください",
    });

    expect(res.status).toBe(403);
    expect(callLLM).not.toHaveBeenCalled();
    expect(ownerThread.save).not.toHaveBeenCalled();
    expect(ownerThread.messages).toHaveLength(1);
  });

  test("userId を付けずに既存スレッドへ送ると 403 になり、追記されない", async () => {
    const res = await request(createApp()).post(`${basePath}/messages`).send({
      threadId: fixtures.threadId,
      message: "これまでの会話を要約してください",
    });

    expect(res.status).toBe(403);
    expect(callLLM).not.toHaveBeenCalled();
    expect(ownerThread.messages).toHaveLength(1);
  });
});
