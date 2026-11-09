/**
 * 最小寄与人数 k による生成物の生成・公開の制限のテスト
 *
 * 目的: issue #146 の Phase 1 のうち、生成物（政策ドラフト・ダイジェスト・ビジュアルレポート・
 *       レポート例・討論分析）について次の仕様を検証する。
 *       - k が有効なテーマで、寄与人数が k 未満の重要論点では、管理者でも生成を始められない（403）
 *       - k 未満の重要論点のビジュアルレポートは、公開の取得 API でも返さない（404）
 *       - k 以上の論点と、k が無効なテーマの論点では、従来どおり生成・取得できる
 * 前提: 実際の Express ルーター（themeQuestionRoutes）を server.ts と同じパスにマウントする。
 *       コントローラーはモックし、ルーティング層の制限だけを検証する。
 *       寄与人数の判定（selectVisibleQuestions）は「研修テーマの hiddenQuestionId だけが k を満たさない」としてモックする。
 */
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, test, vi } from "vitest";

const fixtures = vi.hoisted(() => ({
  trainingThemeId: "650000000000000000000001", // k=5 の研修テーマ
  openThemeId: "650000000000000000000002", // k が無効の一般テーマ
  visibleQuestionId: "650000000000000000000101", // 5人以上が寄与した論点
  hiddenQuestionId: "650000000000000000000102", // 4人以下しか寄与していない論点
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
// 論点が属するテーマは、URL のテーマと同じとする（テストごとに currentThemeId を切り替える）
const currentThemeId = vi.hoisted(() => ({ value: "" }));
vi.mock("../models/SharpQuestion.js", () => ({
  default: {
    findById: vi.fn((questionId: string) => ({
      select: () => ({
        lean: vi.fn().mockResolvedValue({
          _id: questionId,
          themeId: currentThemeId.value,
        }),
      }),
    })),
  },
}));
vi.mock("../services/minContributorsService.js", () => ({
  selectVisibleQuestions: vi.fn(
    async (questions: { _id: unknown; themeId: unknown }[]) => {
      // k が有効な研修テーマの hiddenQuestionId だけを、k を満たさない論点とする
      const visibleQuestions = questions.filter(
        (q) =>
          String(q.themeId) !== fixtures.trainingThemeId ||
          String(q._id) !== fixtures.hiddenQuestionId
      );
      return {
        visibleQuestions,
        hiddenCount: questions.length - visibleQuestions.length,
      };
    }
  ),
}));

import themeQuestionRoutes from "../routes/themeQuestionRoutes.js";

/** server.ts と同じパスにルーターをマウントしたアプリを作る */
const createApp = () => {
  const app = express();
  app.use("/api/themes/:themeId/questions", themeQuestionRoutes);
  return app;
};

/** 生成を始める管理者向けの API */
const generationPaths = [
  "generate-policy",
  "generate-digest",
  "generate-visual-report",
  "generate-report",
  "generate-debate-analysis",
];

/** 管理者のトークンで生成を始める */
const startGeneration = (themeId: string, questionId: string, path: string) =>
  request(createApp())
    .post(`/api/themes/${themeId}/questions/${questionId}/${path}`)
    .set("Authorization", `Bearer ${fixtures.adminToken}`)
    .send({});

/** ビジュアルレポートを取得する（認証なしの公開 API） */
const fetchVisualReport = (themeId: string, questionId: string) =>
  request(createApp()).get(
    `/api/themes/${themeId}/questions/${questionId}/visual-report`
  );

/** コントローラーのモックが返す本文。拒否したリクエストで返らないことを確かめる */
const reachedControllerMessage = "コントローラーまで到達しました";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("k が有効なテーマ", () => {
  beforeEach(() => {
    currentThemeId.value = fixtures.trainingThemeId;
  });

  test.each(generationPaths)(
    "k 未満の論点では、管理者でも %s を始められず 403 になること",
    async (path) => {
      const res = await startGeneration(
        fixtures.trainingThemeId,
        fixtures.hiddenQuestionId,
        path
      );

      expect(res.status).toBe(403);
      expect(res.body.message).toContain("最小寄与人数");
      expect(res.body.message).not.toBe(reachedControllerMessage);
    }
  );

  test.each(generationPaths)(
    "k 以上の論点では、%s を始められること",
    async (path) => {
      const res = await startGeneration(
        fixtures.trainingThemeId,
        fixtures.visibleQuestionId,
        path
      );

      expect(res.status).toBe(202);
    }
  );

  test("k 未満の論点のビジュアルレポートは、取得できず 404 になること", async () => {
    const res = await fetchVisualReport(
      fixtures.trainingThemeId,
      fixtures.hiddenQuestionId
    );

    expect(res.status).toBe(404);
    expect(res.body.message).not.toBe(reachedControllerMessage);
  });

  test("k 以上の論点のビジュアルレポートは、取得できること", async () => {
    const res = await fetchVisualReport(
      fixtures.trainingThemeId,
      fixtures.visibleQuestionId
    );

    expect(res.status).toBe(202);
  });
});

describe("k が無効なテーマ", () => {
  beforeEach(() => {
    currentThemeId.value = fixtures.openThemeId;
  });

  test.each(generationPaths)(
    "寄与者が少ない論点でも、従来どおり %s を始められること",
    async (path) => {
      const res = await startGeneration(
        fixtures.openThemeId,
        fixtures.hiddenQuestionId,
        path
      );

      expect(res.status).toBe(202);
    }
  );

  test("寄与者が少ない論点でも、従来どおりビジュアルレポートを取得できること", async () => {
    const res = await fetchVisualReport(
      fixtures.openThemeId,
      fixtures.hiddenQuestionId
    );

    expect(res.status).toBe(202);
  });
});
