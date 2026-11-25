/**
 * 重要論点ごとの「気になる」の数を返す管理者用 API のテスト（issue #178）
 *
 * 目的: 管理者が、テーマの重要論点のうちどれに「気になる」が集まったかを把握できることを検証する。
 *       あわせて、管理者でなければ呼べないこと、最小寄与人数 k を満たさず非表示の論点は
 *       数も返さないこと（issue #146）を確かめる。
 * 対象: GET /api/themes/:themeId/questions/like-counts
 * 前提: 実際の Express ルーター（themeQuestionRoutes）を server.ts と同じパスにマウントする。
 *       Mongoose モデル・JWT の検証はモックする。
 *       k による論点の選別（selectVisibleQuestions）は minContributorsService.test.ts で検証済みのため、
 *       ここでは「k を満たさない論点」を固定してモックする。
 */
import express from "express";
import request from "supertest";
import { describe, expect, test, vi } from "vitest";

const fixtures = vi.hoisted(() => ({
  themeId: "650000000000000000000001",
  adminToken: "admin-token-of-hr-manager",
  adminUserId: "650000000000000000000100",
  // テーマの重要論点（3件）
  workStyleQuestionId: "650000000000000000000011", // 「気になる」が3件
  evaluationQuestionId: "650000000000000000000012", // 「気になる」が0件
  hiddenQuestionId: "650000000000000000000013", // k を満たさず非表示の論点。「気になる」が2件
}));

/**
 * Mongoose のクエリを模したオブジェクトを返す。
 * そのまま await しても、select().lean() や sort() を連鎖させても、同じ値が得られる。
 */
const queryResolvingTo = (value: unknown) => {
  const query = {
    select: () => query,
    lean: () => query,
    sort: () => query,
    // biome-ignore lint/suspicious/noThenProperty: Mongoose のクエリは thenable なので再現する
    then: (resolve: (value: unknown) => unknown) => resolve(value),
  };
  return query;
};

vi.mock("../models/SharpQuestion.js", () => ({
  default: {
    find: vi.fn(() =>
      queryResolvingTo([
        {
          _id: fixtures.workStyleQuestionId,
          themeId: fixtures.themeId,
          questionText: "在宅勤務と出社をどう両立させればよいだろうか？",
        },
        {
          _id: fixtures.evaluationQuestionId,
          themeId: fixtures.themeId,
          questionText: "評価への納得感を高めるにはどうすればよいだろうか？",
        },
        {
          _id: fixtures.hiddenQuestionId,
          themeId: fixtures.themeId,
          questionText: "特定の部署の残業をどう減らせるだろうか？",
        },
      ])
    ),
  },
}));

// 論点ごとの「気になる」の件数。Like.aggregate はこの件数を返す
const likeCountsByQuestionId: Record<string, number> = {
  [fixtures.workStyleQuestionId]: 3,
  [fixtures.hiddenQuestionId]: 2,
};
vi.mock("../models/Like.js", () => ({
  default: {
    aggregate: vi.fn(async () =>
      Object.entries(likeCountsByQuestionId).map(([questionId, count]) => ({
        _id: questionId,
        count,
      }))
    ),
    countDocuments: vi.fn(async () => 0),
  },
}));

// k を満たさない論点（hiddenQuestionId）を除いた論点を、表示してよい論点として返す
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
          (question) => String(question._id) !== fixtures.hiddenQuestionId
        );
        return {
          visibleQuestions,
          hiddenCount: questions.length - visibleQuestions.length,
        };
      }
    ),
  };
});

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

import themeQuestionRoutes from "../routes/themeQuestionRoutes.js";

const app = express();
app.use("/api/themes/:themeId/questions", themeQuestionRoutes);

const likeCountsPath = `/api/themes/${fixtures.themeId}/questions/like-counts`;

describe("GET /api/themes/:themeId/questions/like-counts", () => {
  test("ログインしていない利用者には 401 を返し、件数を返さない", async () => {
    // 前提: Authorization ヘッダーを付けない（参加者のリクエスト）
    const response = await request(app).get(likeCountsPath);

    // 検証: 認証エラーになり、件数を含まない
    expect(response.status).toBe(401);
    expect(response.body.likeCounts).toBeUndefined();
  });

  test("管理者には、表示している論点ごとの「気になる」の数を返す", async () => {
    // 前提: 管理者のトークンで呼ぶ
    const response = await request(app)
      .get(likeCountsPath)
      .set("Authorization", `Bearer ${fixtures.adminToken}`);

    // 検証: 「気になる」が付いた論点は件数を、付いていない論点は 0 を返す
    expect(response.status).toBe(200);
    expect(response.body.likeCounts).toEqual({
      [fixtures.workStyleQuestionId]: 3,
      [fixtures.evaluationQuestionId]: 0,
    });
  });

  test("k を満たさず非表示の論点は、「気になる」が付いていても数を返さない", async () => {
    // 前提: hiddenQuestionId には「気になる」が2件あるが、k を満たさない
    const response = await request(app)
      .get(likeCountsPath)
      .set("Authorization", `Bearer ${fixtures.adminToken}`);

    // 検証: 非表示の論点の ID がレスポンスに含まれない
    expect(response.status).toBe(200);
    expect(Object.keys(response.body.likeCounts)).not.toContain(
      fixtures.hiddenQuestionId
    );
  });

  test("テーマ ID の形式が不正なら 400 を返す", async () => {
    const response = await request(app)
      .get("/api/themes/not-an-object-id/questions/like-counts")
      .set("Authorization", `Bearer ${fixtures.adminToken}`);

    expect(response.status).toBe(400);
  });
});
