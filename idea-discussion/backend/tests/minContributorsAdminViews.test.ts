/**
 * 最小寄与人数 k による管理者向け API の制限のテスト
 *
 * 目的: issue #146 の Phase 1 のうち、k が有効なテーマでは、管理者にも個々の課題文・解決策文や
 *       チャットの原文を返す API を呼ばせないことを検証する。脅威モデルに管理者を含めたため
 *       （直接の上長より上の人物が強権的に振る舞う可能性がある）。
 *       対象: ベクトル検索・クラスタリング（テーマ・論点）、テーマのエクスポート、
 *             管理者向けのスレッド一覧・メッセージ取得。いずれも 403 を返し、処理に到達しない。
 *       あわせて、k が無効なテーマでは従来どおり呼べること、原文を返さない API（埋め込みの生成）は
 *       k が有効なテーマでも呼べることを確かめる。
 * 前提: 実際の Express ルーターを server.ts と同じパスにマウントする。
 *       コントローラーはモックし、ルーティング層の制限だけを検証する。
 *       JWT の検証（authService）と管理者ユーザーの取得（AdminUser）、Theme・SharpQuestion もモックする。
 */
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, test, vi } from "vitest";

const fixtures = vi.hoisted(() => ({
  trainingThemeId: "650000000000000000000001", // k=5 の研修テーマ
  openThemeId: "650000000000000000000002", // k が無効の一般テーマ
  trainingQuestionId: "650000000000000000000101", // 研修テーマの論点
  openQuestionId: "650000000000000000000102", // 一般テーマの論点
  threadId: "650000000000000000000099",
  adminToken: "token-of-training-office-admin",
  adminUserId: "650000000000000000000010",
}));

/** コントローラーの代わりに 202 を返すモックを作る */
const respondAccepted = vi.hoisted(
  () => () =>
    vi.fn((_req, res) => {
      res.status(202).json({ message: "コントローラーまで到達しました" });
    })
);

vi.mock("../controllers/embeddingController.js", () => ({
  clusterQuestion: respondAccepted(),
  clusterTheme: respondAccepted(),
  generateQuestionEmbeddings: respondAccepted(),
  generateThemeEmbeddings: respondAccepted(),
  searchQuestion: respondAccepted(),
  searchTheme: respondAccepted(),
}));
vi.mock("../controllers/themeExportController.js", () => ({
  exportTheme: respondAccepted(),
  importTheme: respondAccepted(),
}));
vi.mock("../controllers/themeController.js", () => ({
  createTheme: respondAccepted(),
  deleteTheme: respondAccepted(),
  emergencyUpdatePipelineConfig: respondAccepted(),
  getAllThemes: respondAccepted(),
  getDefaultPrompt: respondAccepted(),
  getPipelineDefaults: respondAccepted(),
  getThemeById: respondAccepted(),
  getThemeDetail: respondAccepted(),
  updateTheme: respondAccepted(),
}));
vi.mock("../controllers/chatController.js", () => ({
  getAdminThreadsByTheme: respondAccepted(),
  getThreadByUserAndQuestion: respondAccepted(),
  getThreadByUserAndTheme: respondAccepted(),
  getThreadExtractionsByTheme: respondAccepted(),
  getThreadMessagesByTheme: respondAccepted(),
  handleNewMessageByTheme: respondAccepted(),
}));
vi.mock("../services/auth/authService.js", () => ({
  default: {
    verifyToken: vi.fn((token: string) => {
      if (token === fixtures.adminToken) return { id: fixtures.adminUserId };
      throw new Error("トークンが無効です");
    }),
  },
}));
vi.mock("../models/AdminUser.js", () => ({
  default: {
    findById: vi.fn(async () => ({
      _id: fixtures.adminUserId,
      email: "admin@example.com",
      role: "admin",
    })),
  },
}));
// テーマ ID ごとに k を返す（研修テーマは k=5、一般テーマは無効）
vi.mock("../models/Theme.js", () => ({
  default: {
    findById: vi.fn((themeId: string) => ({
      select: () => ({
        lean: vi.fn().mockResolvedValue({
          _id: themeId,
          minContributors: themeId === fixtures.trainingThemeId ? 5 : null,
        }),
      }),
    })),
  },
}));
// 論点 ID ごとに、属するテーマを返す
vi.mock("../models/SharpQuestion.js", () => ({
  default: {
    findById: vi.fn((questionId: string) => ({
      select: () => ({
        lean: vi.fn().mockResolvedValue({
          _id: questionId,
          themeId:
            questionId === fixtures.trainingQuestionId
              ? fixtures.trainingThemeId
              : fixtures.openThemeId,
        }),
      }),
    })),
  },
}));

import questionEmbeddingRoutes from "../routes/questionEmbeddingRoutes.js";
import themeChatRoutes from "../routes/themeChatRoutes.js";
import themeEmbeddingRoutes from "../routes/themeEmbeddingRoutes.js";
import themeRoutes from "../routes/themeRoutes.js";

/** server.ts と同じパスにルーターをマウントしたアプリを作る */
const createApp = () => {
  const app = express();
  app.use("/api/themes", themeRoutes);
  app.use("/api/themes/:themeId/chat", themeChatRoutes);
  app.use("/api/themes/:themeId", themeEmbeddingRoutes);
  app.use("/api/questions/:questionId", questionEmbeddingRoutes);
  return app;
};

/** 個々の課題文・解決策文やチャットの原文を返す、管理者向けの API */
const rawContentEndpoints = (themeId: string, questionId: string) =>
  [
    { method: "get", path: `/api/themes/${themeId}/search?queryText=評価制度` },
    { method: "post", path: `/api/themes/${themeId}/cluster` },
    {
      method: "get",
      path: `/api/questions/${questionId}/search?queryText=評価制度`,
    },
    { method: "post", path: `/api/questions/${questionId}/cluster` },
    { method: "get", path: `/api/themes/${themeId}/export` },
    { method: "get", path: `/api/themes/${themeId}/chat/admin/threads` },
    {
      method: "get",
      path: `/api/themes/${themeId}/chat/admin/threads/${fixtures.threadId}/messages`,
    },
  ] as const;

/** 管理者のトークンでリクエストを送る */
const sendAsAdmin = (endpoint: { method: "get" | "post"; path: string }) =>
  request(createApp())
    [endpoint.method](endpoint.path)
    .set("Authorization", `Bearer ${fixtures.adminToken}`);

/** コントローラーのモックが返す本文。拒否したリクエストで返らないことを確かめる */
const reachedControllerMessage = "コントローラーまで到達しました";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("k が有効なテーマの管理者向け API", () => {
  test.each(
    rawContentEndpoints(fixtures.trainingThemeId, fixtures.trainingQuestionId)
  )(
    "管理者でも $method $path は 403 になり、処理に到達しないこと",
    async (endpoint) => {
      const res = await sendAsAdmin(endpoint);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain("最小寄与人数");
      expect(res.body.message).not.toBe(reachedControllerMessage);
    }
  );

  test("原文を返さない埋め込みの生成は、k が有効なテーマでも呼べること", async () => {
    const res = await sendAsAdmin({
      method: "post",
      path: `/api/themes/${fixtures.trainingThemeId}/embeddings/generate`,
    });

    expect(res.status).toBe(202);
  });
});

describe("k が無効なテーマの管理者向け API", () => {
  test.each(rawContentEndpoints(fixtures.openThemeId, fixtures.openQuestionId))(
    "$method $path は従来どおり処理に到達すること",
    async (endpoint) => {
      const res = await sendAsAdmin(endpoint);

      expect(res.status).toBe(202);
      expect(res.body.message).toBe(reachedControllerMessage);
    }
  );
});
