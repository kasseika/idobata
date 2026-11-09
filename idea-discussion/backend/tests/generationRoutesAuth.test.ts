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
vi.mock("../controllers/adminController.js", () => ({
  triggerQuestionGenerationByTheme: respondAccepted(),
}));
vi.mock("../controllers/importController.js", () => ({
  importGenericDataByTheme: respondAccepted(),
}));
// 最小寄与人数 k による管理者向け API の制限（minContributorsGuard）が参照するモデル。
// k が無効なテーマ（従来どおり処理まで到達するテーマ）として扱う
vi.mock("../models/Theme.js", () => ({
  default: {
    findById: vi.fn(() => ({
      select: () => ({
        lean: vi.fn().mockResolvedValue({ minContributors: null }),
      }),
    })),
  },
}));
vi.mock("../models/SharpQuestion.js", () => ({
  default: {
    findById: vi.fn(() => ({
      select: () => ({
        lean: vi
          .fn()
          .mockResolvedValue({ themeId: "650000000000000000000001" }),
      }),
    })),
  },
}));
// 寄与人数の判定は、どの論点も k を満たす（従来どおり処理まで到達する）として扱う
vi.mock("../services/minContributorsService.js", () => ({
  selectVisibleQuestions: vi.fn(async (questions: unknown[]) => ({
    visibleQuestions: questions,
    hiddenCount: 0,
  })),
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
import themeGenerateQuestionsRoutes from "../routes/themeGenerateQuestionsRoutes.js";
import themeImportRoutes from "../routes/themeImportRoutes.js";
import themeQuestionRoutes from "../routes/themeQuestionRoutes.js";

/** server.ts と同じパスにルーターをマウントしたアプリを作る */
const createApp = () => {
  const app = express();
  app.use("/api/themes/:themeId/questions", themeQuestionRoutes);
  app.use(
    "/api/themes/:themeId/generate-questions",
    themeGenerateQuestionsRoutes
  );
  app.use("/api/themes/:themeId/import", themeImportRoutes);
  app.use("/api/themes/:themeId", themeEmbeddingRoutes);
  app.use("/api/questions/:questionId", questionEmbeddingRoutes);
  // 埋め込み系ルーターと同じパスの下に、後からマウントされる公開ルートを再現する
  app.get("/api/themes/:themeId/public-summary", (_req, res) => {
    res.status(200).json({ message: "公開の要約です" });
  });
  return app;
};

const themePath = `/api/themes/${fixtures.themeId}`;
const questionPath = `${themePath}/questions/${fixtures.questionId}`;

/** 管理者だけが呼べるべき API */
const protectedEndpoints = [
  { method: "post", path: `${themePath}/import/generic` },
  { method: "post", path: `${themePath}/generate-questions` },
  { method: "post", path: `${questionPath}/generate-policy` },
  { method: "post", path: `${questionPath}/generate-digest` },
  { method: "post", path: `${questionPath}/generate-visual-report` },
  { method: "post", path: `${questionPath}/generate-report` },
  { method: "post", path: `${questionPath}/generate-debate-analysis` },
  { method: "post", path: `${themePath}/embeddings/generate` },
  { method: "post", path: `${themePath}/cluster` },
  {
    method: "post",
    path: `/api/questions/${fixtures.questionId}/embeddings/generate`,
  },
  { method: "post", path: `/api/questions/${fixtures.questionId}/cluster` },
  // 検索も入力文の埋め込みに外部APIを呼ぶため、管理者だけに許可する
  { method: "get", path: `${themePath}/search?queryText=評価制度` },
  {
    method: "get",
    path: `/api/questions/${fixtures.questionId}/search?queryText=評価制度`,
  },
] as const;

/** コントローラーのモックが返す本文。拒否したリクエストで返らないことを確かめる */
const reachedControllerMessage = "コントローラーまで到達しました";

/** 取り込ませようとする偽の意見 */
const injectedOpinion = {
  sourceType: "参加者による偽装",
  content: "全員が現行の評価制度に満足しています",
};

/** 指定した API に、任意の Authorization ヘッダを付けてリクエストを送る */
const send = (
  endpoint: (typeof protectedEndpoints)[number],
  authorization?: string
) => {
  const req = request(createApp())[endpoint.method](endpoint.path);
  if (authorization) req.set("Authorization", authorization);
  return endpoint.method === "post" ? req.send(injectedOpinion) : req;
};

describe("書き込み・生成系APIの管理者認可", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test.each(protectedEndpoints)(
    "認証ヘッダなしで $method $path を呼ぶと 401 になり、処理は実行されない",
    async (endpoint) => {
      const res = await send(endpoint);

      expect(res.status).toBe(401);
      expect(res.body.message).not.toBe(reachedControllerMessage);
    }
  );

  test.each(protectedEndpoints)(
    "不正なトークンで $method $path を呼ぶと 401 になり、処理は実行されない",
    async (endpoint) => {
      const res = await send(endpoint, "Bearer forged-token");

      expect(res.status).toBe(401);
      expect(res.body.message).not.toBe(reachedControllerMessage);
    }
  );

  test.each(protectedEndpoints)(
    "管理者でないユーザーのトークンで $method $path を呼ぶと 403 になり、処理は実行されない",
    async (endpoint) => {
      const res = await send(endpoint, `Bearer ${fixtures.editorToken}`);

      expect(res.status).toBe(403);
      expect(res.body.message).not.toBe(reachedControllerMessage);
    }
  );

  test.each(protectedEndpoints)(
    "管理者のトークンで $method $path を呼ぶと、従来どおり処理まで到達する",
    async (endpoint) => {
      const res = await send(endpoint, `Bearer ${fixtures.adminToken}`);

      expect(res.status).toBe(202);
      expect(res.body.message).toBe(reachedControllerMessage);
    }
  );
});

describe("参加者向けの公開APIは、認可を付けた後も認証なしで呼べる", () => {
  test("論点の一覧 GET /questions は認証なしで処理まで到達する", async () => {
    const res = await request(createApp()).get(`${themePath}/questions`);

    expect(res.status).toBe(202);
    expect(res.body.message).toBe(reachedControllerMessage);
  });

  test("埋め込み系ルーターと同じパスに後からマウントされた公開ルートは、認証なしで呼べる", async () => {
    const res = await request(createApp()).get(`${themePath}/public-summary`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("公開の要約です");
  });
});
