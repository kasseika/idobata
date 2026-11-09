/**
 * 書き込み・生成系APIの管理者認可 テスト
 *
 * 目的: 意見の取り込み・LLM生成・埋め込み生成・クラスタリングを起動するAPIが、
 *       管理者のトークンなしでは呼べないことを検証する（issue #136）。
 *       研修の参加者が同じURLにアクセスしても、論点やレポートを改ざんしたり、
 *       APIの費用を消費させたりできないことを確かめる。
 * 前提: 実際の Express ルーターを server.ts と同じパスにマウントする。
 *       コントローラーはモックし、ルーティング層の認可だけを検証する。
 *       JWT の検証（authService）と管理者ユーザーの取得（AdminUser）もモックする。
 */
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, test, vi } from "vitest";

const fixtures = vi.hoisted(() => ({
  themeId: "650000000000000000000001",
  questionId: "650000000000000000000002",
  // トークンは Authorization ヘッダに載せるため ASCII にする
  adminToken: "token-of-training-office-admin",
  editorToken: "token-of-editor-without-admin-role",
  adminUserId: "650000000000000000000010",
  editorUserId: "650000000000000000000011",
}));

/** コントローラーの代わりに 202 を返すモックを作る */
const respondAccepted = vi.hoisted(
  () => () =>
    vi.fn((_req, res) => {
      res.status(202).json({ message: "コントローラーまで到達しました" });
    })
);

vi.mock("../controllers/questionController.js", () => ({
  getQuestionDetails: respondAccepted(),
  getQuestionsByTheme: respondAccepted(),
  getVisualReport: respondAccepted(),
  triggerDebateAnalysisGeneration: respondAccepted(),
  triggerDigestGeneration: respondAccepted(),
  triggerPolicyGeneration: respondAccepted(),
  triggerReportGeneration: respondAccepted(),
  triggerVisualReportGeneration: respondAccepted(),
}));
vi.mock("../controllers/embeddingController.js", () => ({
  clusterQuestion: respondAccepted(),
  clusterTheme: respondAccepted(),
  generateQuestionEmbeddings: respondAccepted(),
  generateThemeEmbeddings: respondAccepted(),
  searchQuestion: respondAccepted(),
  searchTheme: respondAccepted(),
}));
vi.mock("../controllers/importController.js", () => ({
  importGenericDataByTheme: respondAccepted(),
}));
vi.mock("../services/auth/authService.js", () => ({
  default: {
    verifyToken: vi.fn((token: string) => {
      if (token === fixtures.adminToken) return { id: fixtures.adminUserId };
      if (token === fixtures.editorToken) return { id: fixtures.editorUserId };
      throw new Error("トークンが無効です");
    }),
  },
}));
vi.mock("../models/AdminUser.js", () => ({
  default: {
    findById: vi.fn(async (id: string) => {
      if (id === fixtures.adminUserId) {
        return { _id: id, email: "admin@example.com", role: "admin" };
      }
      if (id === fixtures.editorUserId) {
        return { _id: id, email: "editor@example.com", role: "editor" };
      }
      return null;
    }),
  },
}));

import questionEmbeddingRoutes from "../routes/questionEmbeddingRoutes.js";
import themeEmbeddingRoutes from "../routes/themeEmbeddingRoutes.js";
import themeImportRoutes from "../routes/themeImportRoutes.js";
import themeQuestionRoutes from "../routes/themeQuestionRoutes.js";

/** server.ts と同じパスにルーターをマウントしたアプリを作る */
const createApp = () => {
  const app = express();
  app.use("/api/themes/:themeId/questions", themeQuestionRoutes);
  app.use("/api/themes/:themeId/import", themeImportRoutes);
  app.use("/api/themes/:themeId", themeEmbeddingRoutes);
  app.use("/api/questions/:questionId", questionEmbeddingRoutes);
  return app;
};

const themePath = `/api/themes/${fixtures.themeId}`;
const questionPath = `${themePath}/questions/${fixtures.questionId}`;

/** 管理者だけが呼べるべき POST API */
const protectedEndpoints = [
  `${themePath}/import/generic`,
  `${questionPath}/generate-policy`,
  `${questionPath}/generate-digest`,
  `${questionPath}/generate-visual-report`,
  `${questionPath}/generate-report`,
  `${questionPath}/generate-debate-analysis`,
  `${themePath}/embeddings/generate`,
  `${themePath}/cluster`,
  `/api/questions/${fixtures.questionId}/embeddings/generate`,
  `/api/questions/${fixtures.questionId}/cluster`,
];

/** 取り込ませようとする偽の意見 */
const injectedOpinion = {
  sourceType: "参加者による偽装",
  content: "全員が現行の評価制度に満足しています",
};

describe("書き込み・生成系APIの管理者認可", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test.each(protectedEndpoints)(
    "認証ヘッダなしで %s を呼ぶと 401 になる",
    async (path) => {
      const res = await request(createApp()).post(path).send(injectedOpinion);

      expect(res.status).toBe(401);
    }
  );

  test.each(protectedEndpoints)(
    "管理者でないユーザーのトークンで %s を呼ぶと 403 になる",
    async (path) => {
      const res = await request(createApp())
        .post(path)
        .set("Authorization", `Bearer ${fixtures.editorToken}`)
        .send(injectedOpinion);

      expect(res.status).toBe(403);
    }
  );

  test.each(protectedEndpoints)(
    "管理者のトークンで %s を呼ぶと、従来どおりコントローラーまで到達する",
    async (path) => {
      const res = await request(createApp())
        .post(path)
        .set("Authorization", `Bearer ${fixtures.adminToken}`)
        .send(injectedOpinion);

      expect(res.status).toBe(202);
    }
  );
});
