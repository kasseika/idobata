/**
 * 重要論点の取得 API が、テーマの公開状態と URL の themeId を確かめることのテスト（issue #151）
 *
 * 目的: 論点の ID を知っていても、参加者に見せていないテーマ（draft・archived）の論点や、
 *       URL のテーマに属さない論点を、参加者が取得できないことを検証する。
 *       テーマ詳細（getThemeDetail）と同じく、管理者は draft・archived のテーマも取得できる。
 * 対象: GET /api/themes/:themeId/questions
 *       GET /api/themes/:themeId/questions/:questionId/details
 *       GET /api/themes/:themeId/questions/:questionId/visual-report
 * 前提: 実際の Express ルーター（themeQuestionRoutes）を server.ts と同じパスにマウントする。
 *       Mongoose モデル・JWT の検証・生成物の取得サービスはモックする。
 *       どのテーマも最小寄与人数 k は無効とし、k による非表示の影響を受けないようにする。
 */
import express from "express";
import request from "supertest";
import { describe, expect, test, vi } from "vitest";

const fixtures = vi.hoisted(() => {
  const activeThemeId = "65000000000000000000000a";
  const draftThemeId = "650000000000000000000002";
  const archivedThemeId = "650000000000000000000003";
  const closedThemeId = "650000000000000000000004";
  return {
    activeThemeId,
    draftThemeId,
    archivedThemeId,
    closedThemeId,
    adminToken: "admin-token-of-hr-manager",
    adminUserId: "650000000000000000000100",
    // テーマ ID ごとの公開状態
    themes: {
      [activeThemeId]: { title: "人事評価への納得感", status: "active" },
      [draftThemeId]: { title: "来期の賞与制度（準備中）", status: "draft" },
      [archivedThemeId]: { title: "旧オフィスの移転", status: "archived" },
      [closedThemeId]: { title: "社員食堂のメニュー", status: "closed" },
    } as Record<string, { title: string; status: string }>,
    // 論点 ID ごとの、属するテーマ ID と論点の文
    questions: {
      "650000000000000000000011": {
        themeId: activeThemeId,
        questionText: "評価への納得感を高めるにはどうすればよいだろうか？",
      },
      "650000000000000000000012": {
        themeId: draftThemeId,
        questionText: "賞与の配分をどう決めればよいだろうか？",
      },
      "650000000000000000000013": {
        themeId: archivedThemeId,
        questionText: "移転先の通勤負担をどう減らせるだろうか？",
      },
      "650000000000000000000014": {
        themeId: closedThemeId,
        questionText: "食堂のメニューをどう増やせばよいだろうか？",
      },
    } as Record<string, { themeId: string; questionText: string }>,
  };
});

/** 論点 ID から、Mongoose のドキュメントを模したオブジェクトを作る */
const toQuestionDoc = (questionId: string) => {
  const question = fixtures.questions[questionId];
  const plain = { _id: questionId, ...question };
  return { ...plain, toObject: () => plain };
};

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

vi.mock("../models/Theme.js", () => ({
  default: {
    // Mongoose は ID を ObjectId に変換して検索するため、大文字の16進数でも同じテーマが見つかる
    findById: vi.fn((themeId: string) => {
      const theme = fixtures.themes[String(themeId).toLowerCase()];
      return queryResolvingTo(
        theme ? { _id: themeId, ...theme, minContributors: null } : null
      );
    }),
    // selectVisibleQuestions が k を調べるために呼ぶ。k はどのテーマでも無効とする
    find: vi.fn(() => queryResolvingTo([])),
  },
}));
vi.mock("../models/SharpQuestion.js", () => ({
  default: {
    findById: vi.fn((questionId: string) =>
      queryResolvingTo(
        fixtures.questions[String(questionId)]
          ? toQuestionDoc(String(questionId))
          : null
      )
    ),
    find: vi.fn(({ themeId }: { themeId: string }) =>
      queryResolvingTo(
        Object.keys(fixtures.questions)
          .filter((id) => fixtures.questions[id].themeId === String(themeId))
          .map(toQuestionDoc)
      )
    ),
  },
}));
vi.mock("../models/QuestionLink.js", () => ({
  default: { find: vi.fn().mockResolvedValue([]) },
}));
vi.mock("../models/Problem.js", () => ({
  default: { find: vi.fn(() => queryResolvingTo([])) },
}));
vi.mock("../models/Solution.js", () => ({
  default: { find: vi.fn(() => queryResolvingTo([])) },
}));
vi.mock("../models/Like.js", () => ({
  default: { countDocuments: vi.fn().mockResolvedValue(0) },
}));
vi.mock("../models/ReportExample.js", () => ({
  default: { findOne: vi.fn(() => queryResolvingTo(null)) },
}));
vi.mock("../models/ChatThread.js", () => ({
  default: { distinct: vi.fn().mockResolvedValue([]) },
}));
vi.mock("../services/debateAnalysisGenerator.js", () => ({
  getDebateAnalysis: vi.fn().mockResolvedValue(null),
}));
// どの論点にもビジュアルレポートがある（取得できるかどうかは公開状態だけで決まる）
vi.mock("../services/questionVisualReportGenerator.js", () => ({
  getVisualReport: vi.fn().mockResolvedValue({
    overallAnalysis: "評価面談の進め方に関する意見が多く集まりました。",
  }),
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

import themeQuestionRoutes from "../routes/themeQuestionRoutes.js";

const createApp = () => {
  const app = express();
  app.use("/api/themes/:themeId/questions", themeQuestionRoutes);
  return app;
};

const app = createApp();

const questionIdIn = (themeId: string) => {
  const questionId = Object.keys(fixtures.questions).find(
    (id) => fixtures.questions[id].themeId === themeId
  );
  if (!questionId) throw new Error(`テーマ ${themeId} の論点がありません`);
  return questionId;
};

/** 論点を個別に取得する2つの API。どちらにも同じ規則を適用する */
const singleQuestionEndpoints = [
  { name: "論点の詳細", suffix: "details" },
  { name: "ビジュアルレポート", suffix: "visual-report" },
] as const;

describe.each(singleQuestionEndpoints)(
  "GET /api/themes/:themeId/questions/:questionId/$suffix（$name）",
  ({ suffix }) => {
    const path = (themeId: string, questionId: string) =>
      `/api/themes/${themeId}/questions/${questionId}/${suffix}`;

    test.each([
      { label: "公開中（active）", themeId: fixtures.activeThemeId },
      { label: "受付終了（closed）", themeId: fixtures.closedThemeId },
    ])("参加者は、$label のテーマの論点を取得できる", async ({ themeId }) => {
      const res = await request(app).get(path(themeId, questionIdIn(themeId)));

      expect(res.status).toBe(200);
    });

    test.each([
      { label: "準備中（draft）", themeId: fixtures.draftThemeId },
      {
        label: "アーカイブ済み（archived）",
        themeId: fixtures.archivedThemeId,
      },
    ])(
      "参加者が$label のテーマの論点を取得しようとすると 404 を返す",
      async ({ themeId }) => {
        const res = await request(app).get(
          path(themeId, questionIdIn(themeId))
        );

        expect(res.status).toBe(404);
      }
    );

    test("準備中のテーマの論点 ID を、公開中のテーマの URL に付けて取得しようとすると 404 を返す", async () => {
      // 前提: URL のテーマは公開中だが、論点は準備中のテーマに属する
      const res = await request(app).get(
        path(fixtures.activeThemeId, questionIdIn(fixtures.draftThemeId))
      );

      expect(res.status).toBe(404);
    });

    test("別の公開中のテーマの論点 ID を URL に付けて取得しようとすると 404 を返す", async () => {
      // 前提: どちらのテーマも参加者に見せてよいが、論点は URL のテーマに属さない
      const res = await request(app).get(
        path(fixtures.activeThemeId, questionIdIn(fixtures.closedThemeId))
      );

      expect(res.status).toBe(404);
    });

    test("URL の themeId が大文字の16進数でも、そのテーマの論点として取得できる", async () => {
      // 前提: ObjectId の16進数は大文字・小文字を区別しない。DB からは小文字で返る
      const res = await request(app).get(
        path(
          fixtures.activeThemeId.toUpperCase(),
          questionIdIn(fixtures.activeThemeId)
        )
      );

      expect(res.status).toBe(200);
    });

    test("管理者は、準備中のテーマの論点を取得できる", async () => {
      const res = await request(app)
        .get(path(fixtures.draftThemeId, questionIdIn(fixtures.draftThemeId)))
        .set("Authorization", `Bearer ${fixtures.adminToken}`);

      expect(res.status).toBe(200);
    });

    test("無効なトークンを付けた場合は参加者として扱い、準備中のテーマの論点には 404 を返す", async () => {
      const res = await request(app)
        .get(path(fixtures.draftThemeId, questionIdIn(fixtures.draftThemeId)))
        .set("Authorization", "Bearer forged-token");

      expect(res.status).toBe(404);
    });
  }
);

describe("GET /api/themes/:themeId/questions（テーマの論点一覧）", () => {
  const path = (themeId: string) => `/api/themes/${themeId}/questions`;

  test("参加者は、公開中のテーマの論点一覧を取得できる", async () => {
    const res = await request(app).get(path(fixtures.activeThemeId));

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      expect.objectContaining({
        questionText: "評価への納得感を高めるにはどうすればよいだろうか？",
      }),
    ]);
  });

  test.each([
    { label: "準備中（draft）", themeId: fixtures.draftThemeId },
    { label: "アーカイブ済み（archived）", themeId: fixtures.archivedThemeId },
  ])(
    "参加者が$label のテーマの論点一覧を取得しようとすると 404 を返す",
    async ({ themeId }) => {
      const res = await request(app).get(path(themeId));

      expect(res.status).toBe(404);
    }
  );

  test("管理者は、準備中のテーマの論点一覧を取得できる（管理画面が使う）", async () => {
    const res = await request(app)
      .get(path(fixtures.draftThemeId))
      .set("Authorization", `Bearer ${fixtures.adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      expect.objectContaining({
        questionText: "賞与の配分をどう決めればよいだろうか？",
      }),
    ]);
  });
});
