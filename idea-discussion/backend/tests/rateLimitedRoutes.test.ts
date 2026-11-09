/**
 * ルートのレート制限 テスト
 *
 * 目的: 総当たり・費用の消費につながるルートに、レート制限が付いていることを検証する（issue #144）。
 *       - ログイン・初期管理者作成: 同じIPからの失敗が続くと 429 を返す
 *       - チャット送信: 同じ参加者（userId）からの送信が続くと 429 を返す。
 *         研修の参加者は同じグローバルIPからアクセスするため、別の参加者は弾かない
 *       - 参加者の書き込み（表示名・プロフィール画像・いいね）: 同じ参加者からの書き込みが続くと 429 を返す
 *       - 管理者専用の生成系ルート・検索: 同じ管理者からの呼び出しが続くと 429 を返す
 * 前提: 実際の Express ルーターを server.ts と同じパスにマウントする。
 *       上限値は環境変数で小さくし、コントローラー・JWT検証・AdminUser はモックする。
 *       レート制限の記録はモジュールごとに持つため、テストごとにモジュールを読み込み直す。
 *       別のIPからのリクエストは、trust proxy を有効にして X-Forwarded-For で再現する。
 */
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, test, vi } from "vitest";

const fixtures = vi.hoisted(() => {
  // ルーターの読み込み前に上限値を小さくする
  process.env.RATE_LIMIT_LOGIN_PER_IP_PER_15_MINUTES = "3";
  process.env.RATE_LIMIT_CHAT_PER_USER_PER_MINUTE = "2";
  process.env.RATE_LIMIT_CHAT_PER_IP_PER_MINUTE = "5";
  process.env.RATE_LIMIT_GENERATION_PER_ADMIN_PER_15_MINUTES = "2";
  process.env.RATE_LIMIT_SEARCH_PER_ADMIN_PER_15_MINUTES = "3";
  process.env.RATE_LIMIT_PARTICIPANT_WRITE_PER_USER_PER_MINUTE = "2";
  return {
    themeId: "650000000000000000000001",
    questionId: "650000000000000000000002",
    correctPassword: "研修事務局の正しいパスワード",
    // トークンは Authorization ヘッダに載せるため ASCII にする
    adminToken: "token-of-training-office-admin",
    anotherAdminToken: "token-of-another-admin",
    adminUserId: "650000000000000000000010",
    anotherAdminUserId: "650000000000000000000012",
  };
});

/** コントローラーの代わりに 200 を返すモックを作る */
const respondOk = vi.hoisted(
  () => () =>
    vi.fn((_req, res) => {
      res.status(200).json({ message: "コントローラーまで到達しました" });
    })
);

vi.mock("../controllers/authController.js", () => ({
  createAdminUser: respondOk(),
  getCurrentUser: respondOk(),
  getSetupStatus: respondOk(),
  initializeAdminUser: vi.fn((_req, res) => {
    res.status(403).json({ message: "管理者はすでに作成されています" });
  }),
  login: vi.fn((req, res) => {
    if (req.body.password === fixtures.correctPassword) {
      res.status(200).json({ token: "発行されたトークン" });
      return;
    }
    res
      .status(401)
      .json({ message: "メールアドレスまたはパスワードが違います" });
  }),
}));
vi.mock("../controllers/chatController.js", () => ({
  getAdminThreadsByTheme: respondOk(),
  getThreadByUserAndQuestion: respondOk(),
  getThreadByUserAndTheme: respondOk(),
  getThreadExtractionsByTheme: respondOk(),
  getThreadMessagesByTheme: respondOk(),
  handleNewMessageByTheme: respondOk(),
}));
vi.mock("../controllers/adminController.js", () => ({
  triggerQuestionGenerationByTheme: respondOk(),
}));
vi.mock("../controllers/questionController.js", () => ({
  getQuestionDetails: respondOk(),
  getQuestionsByTheme: respondOk(),
  getVisualReport: respondOk(),
  triggerDebateAnalysisGeneration: respondOk(),
  triggerDigestGeneration: respondOk(),
  triggerPolicyGeneration: respondOk(),
  triggerReportGeneration: respondOk(),
  triggerVisualReportGeneration: respondOk(),
}));
vi.mock("../controllers/embeddingController.js", () => ({
  clusterQuestion: respondOk(),
  clusterTheme: respondOk(),
  generateQuestionEmbeddings: respondOk(),
  generateThemeEmbeddings: respondOk(),
  searchQuestion: respondOk(),
  searchTheme: respondOk(),
}));
vi.mock("../controllers/importController.js", () => ({
  importGenericDataByTheme: respondOk(),
}));
vi.mock("../controllers/userController.js", () => ({
  getUserInfo: respondOk(),
  updateUserDisplayName: respondOk(),
  uploadProfileImage: respondOk(),
}));
vi.mock("../controllers/likeController.js", () => ({
  getLikeStatus: respondOk(),
  toggleLike: respondOk(),
}));
// プロフィール画像の受け取り（multer）は、ディスクに書かないよう素通しにする
vi.mock("../middleware/uploadMiddleware.js", () => ({
  logRequest: vi.fn((_req, _res, next) => next()),
  upload: { single: () => vi.fn((_req, _res, next) => next()) },
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
vi.mock("../services/auth/authService.js", () => ({
  default: {
    verifyToken: vi.fn((token: string) => {
      if (token === fixtures.adminToken) return { id: fixtures.adminUserId };
      if (token === fixtures.anotherAdminToken) {
        return { id: fixtures.anotherAdminUserId };
      }
      throw new Error("トークンが無効です");
    }),
  },
}));
vi.mock("../models/AdminUser.js", () => ({
  default: {
    findById: vi.fn(async (id: string) => ({
      _id: id,
      email: `${id}@example.com`,
      role: "admin",
    })),
  },
}));

/**
 * server.ts と同じパスにルーターをマウントしたアプリを作る。
 * レート制限の記録を前のテストから持ち越さないよう、ルーターを読み込み直す。
 */
const createApp = async () => {
  vi.resetModules();
  const authRoutes = (await import("../routes/authRoutes.js")).default;
  const themeChatRoutes = (await import("../routes/themeChatRoutes.js"))
    .default;
  const themeGenerateQuestionsRoutes = (
    await import("../routes/themeGenerateQuestionsRoutes.js")
  ).default;
  const themeImportRoutes = (await import("../routes/themeImportRoutes.js"))
    .default;
  const themeQuestionRoutes = (await import("../routes/themeQuestionRoutes.js"))
    .default;
  const themeEmbeddingRoutes = (
    await import("../routes/themeEmbeddingRoutes.js")
  ).default;
  const questionEmbeddingRoutes = (
    await import("../routes/questionEmbeddingRoutes.js")
  ).default;
  const userRoutes = (await import("../routes/userRoutes.js")).default;
  const likeRoutes = (await import("../routes/likeRoutes.js")).default;

  const app = express();
  // X-Forwarded-For で、別のIPからのリクエストを再現できるようにする
  app.set("trust proxy", 1);
  app.use("/api/auth", authRoutes);
  app.use("/api/themes/:themeId/questions", themeQuestionRoutes);
  app.use(
    "/api/themes/:themeId/generate-questions",
    themeGenerateQuestionsRoutes
  );
  app.use("/api/themes/:themeId/import", themeImportRoutes);
  app.use("/api/themes/:themeId/chat", themeChatRoutes);
  app.use("/api/themes/:themeId", themeEmbeddingRoutes);
  app.use("/api/questions/:questionId", questionEmbeddingRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/likes", likeRoutes);
  return app;
};

const themePath = `/api/themes/${fixtures.themeId}`;
const questionPath = `${themePath}/questions/${fixtures.questionId}`;

/** 上限を超えたときの本文 */
const tooManyRequestsMessage =
  "リクエストが多すぎます。しばらく待ってから、もう一度お試しください";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ログイン POST /api/auth/login", () => {
  /** 間違ったパスワードでログインを試す */
  const tryWrongPassword = (app: express.Express) =>
    request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "推測したパスワード" });

  test("同じIPから上限の回数まで失敗しても、まだ 401 を返す", async () => {
    const app = await createApp();

    for (let i = 0; i < 3; i++) {
      const res = await tryWrongPassword(app);
      expect(res.status).toBe(401);
    }
  });

  test("同じIPからの失敗が上限を超えると 429 を返し、ログイン処理を実行しない", async () => {
    const app = await createApp();
    for (let i = 0; i < 3; i++) await tryWrongPassword(app);
    const { login } = await import("../controllers/authController.js");
    vi.mocked(login).mockClear();

    const res = await tryWrongPassword(app);

    expect(res.status).toBe(429);
    expect(res.body.message).toBe(tooManyRequestsMessage);
    expect(login).not.toHaveBeenCalled();
  });

  test("成功したログインは回数に数えない", async () => {
    const app = await createApp();

    for (let i = 0; i < 5; i++) {
      const res = await request(app).post("/api/auth/login").send({
        email: "admin@example.com",
        password: fixtures.correctPassword,
      });
      expect(res.status).toBe(200);
    }
  });
});

describe("初期管理者の作成 POST /api/auth/initialize", () => {
  test("同じIPからの失敗が上限を超えると 429 を返す", async () => {
    const app = await createApp();
    for (let i = 0; i < 3; i++) {
      const res = await request(app).post("/api/auth/initialize").send({});
      expect(res.status).toBe(403);
    }

    const res = await request(app).post("/api/auth/initialize").send({});

    expect(res.status).toBe(429);
  });
});

describe("チャット送信 POST /api/themes/:themeId/chat/messages", () => {
  /**
   * 指定した参加者として、チャットにメッセージを送る。
   * ip を指定すると、そのIPからの送信として扱う（指定しなければテスト実行環境のIP）。
   */
  const sendMessage = (app: express.Express, userId?: string, ip?: string) => {
    const req = request(app).post(`${themePath}/chat/messages`);
    if (ip) req.set("X-Forwarded-For", ip);
    return req.send({
      userId,
      message: "評価制度の基準が部署ごとに違うと感じます",
    });
  };

  test("同じ参加者からの送信が上限を超えると 429 を返し、送信処理を実行しない", async () => {
    const app = await createApp();
    const participant = "uuid-営業部の佐藤さんの端末";
    for (let i = 0; i < 2; i++) {
      const res = await sendMessage(app, participant);
      expect(res.status).toBe(200);
    }
    const { handleNewMessageByTheme } = await import(
      "../controllers/chatController.js"
    );
    vi.mocked(handleNewMessageByTheme).mockClear();

    const res = await sendMessage(app, participant);

    expect(res.status).toBe(429);
    expect(res.body.message).toBe(tooManyRequestsMessage);
    expect(handleNewMessageByTheme).not.toHaveBeenCalled();
  });

  test("同じIPでも、別の参加者は上限に達した参加者の巻き添えにならない", async () => {
    const app = await createApp();
    for (let i = 0; i < 3; i++) {
      await sendMessage(app, "uuid-営業部の佐藤さんの端末");
    }

    const res = await sendMessage(app, "uuid-同じ研修に参加した鈴木さんの端末");

    expect(res.status).toBe(200);
  });

  test("別のIPから同じ userId を名乗って送っても、本人の上限は使い切られない", async () => {
    const app = await createApp();
    const victim = "uuid-営業部の佐藤さんの端末";
    // 攻撃者が、佐藤さんの userId を名乗って別のIPから送り続ける
    for (let i = 0; i < 3; i++) {
      await sendMessage(app, victim, "203.0.113.50");
    }

    const res = await sendMessage(app, victim);

    expect(res.status).toBe(200);
  });

  test("参加者ごとの上限で断った送信は、同じIPの参加者全員の上限に数えない", async () => {
    const app = await createApp();
    // 佐藤さんが連打する。2件は受け付け、残りの4件は参加者ごとの上限で断る
    for (let i = 0; i < 6; i++) {
      await sendMessage(app, "uuid-営業部の佐藤さんの端末");
    }

    // IPごとの上限（5件）のうち、佐藤さんの受け付けた2件を除く3件は、ほかの参加者が使える
    for (const participant of ["鈴木", "高橋", "田中"]) {
      const res = await sendMessage(app, `uuid-${participant}さんの端末`);
      expect(res.status).toBe(200);
    }
  });

  test("userId を変えても、同じIPからの送信の合計が上限を超えると 429 を返す", async () => {
    const app = await createApp();
    for (let i = 0; i < 5; i++) {
      const res = await sendMessage(app, `uuid-使い捨ての参加者${i}`);
      expect(res.status).toBe(200);
    }

    const res = await sendMessage(app, "uuid-使い捨ての参加者5");

    expect(res.status).toBe(429);
  });

  test("userId がない送信は、IPごとに上限を数える", async () => {
    const app = await createApp();
    for (let i = 0; i < 2; i++) {
      const res = await sendMessage(app);
      expect(res.status).toBe(200);
    }

    const res = await sendMessage(app);

    expect(res.status).toBe(429);
  });
});

/** 指定した管理者のトークンで、管理者専用のルートを呼ぶ */
const callAs = (
  app: express.Express,
  endpoint: { method: "get" | "post"; path: string },
  token: string
) =>
  request(app)
    [endpoint.method](endpoint.path)
    .set("Authorization", `Bearer ${token}`);

describe("管理者専用の生成系ルート", () => {
  /** 生成・外部APIの呼び出しを起動するルート */
  const generationEndpoints = [
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
  ] as const;

  test.each(generationEndpoints)(
    "同じ管理者が $method $path を上限を超えて呼ぶと 429 を返す",
    async (endpoint) => {
      const app = await createApp();
      for (let i = 0; i < 2; i++) {
        const res = await callAs(app, endpoint, fixtures.adminToken);
        expect(res.status).toBe(200);
      }

      const res = await callAs(app, endpoint, fixtures.adminToken);

      expect(res.status).toBe(429);
      expect(res.body.message).toBe(tooManyRequestsMessage);
    }
  );

  test("生成系ルートの上限は、すべての生成系ルートの合計で数える", async () => {
    const app = await createApp();
    await callAs(app, generationEndpoints[0], fixtures.adminToken);
    await callAs(app, generationEndpoints[1], fixtures.adminToken);

    const res = await callAs(app, generationEndpoints[2], fixtures.adminToken);

    expect(res.status).toBe(429);
  });

  test("上限に達した管理者とは別の管理者は、引き続き呼べる", async () => {
    const app = await createApp();
    for (let i = 0; i < 3; i++) {
      await callAs(app, generationEndpoints[0], fixtures.adminToken);
    }

    const res = await callAs(
      app,
      generationEndpoints[0],
      fixtures.anotherAdminToken
    );

    expect(res.status).toBe(200);
  });

  test("認証されていない呼び出しは、レート制限より先に 401 で拒否する", async () => {
    const app = await createApp();

    for (let i = 0; i < 4; i++) {
      const res = await request(app).post(`${themePath}/generate-questions`);
      expect(res.status).toBe(401);
    }
  });
});

describe("管理者の検索 GET /search", () => {
  /** 入力文の埋め込みに外部APIを呼ぶ検索ルート */
  const searchEndpoints = [
    { method: "get", path: `${themePath}/search?queryText=評価制度` },
    {
      method: "get",
      path: `/api/questions/${fixtures.questionId}/search?queryText=評価制度`,
    },
  ] as const;
  const generateQuestions = {
    method: "post",
    path: `${themePath}/generate-questions`,
  } as const;

  test.each(searchEndpoints)(
    "同じ管理者が $method $path を上限を超えて呼ぶと 429 を返す",
    async (endpoint) => {
      const app = await createApp();
      for (let i = 0; i < 3; i++) {
        const res = await callAs(app, endpoint, fixtures.adminToken);
        expect(res.status).toBe(200);
      }

      const res = await callAs(app, endpoint, fixtures.adminToken);

      expect(res.status).toBe(429);
    }
  );

  test("生成系ルートの上限に達しても、検索は引き続き呼べる", async () => {
    const app = await createApp();
    for (let i = 0; i < 3; i++) {
      await callAs(app, generateQuestions, fixtures.adminToken);
    }

    const res = await callAs(app, searchEndpoints[0], fixtures.adminToken);

    expect(res.status).toBe(200);
  });

  test("検索の上限に達しても、生成系ルートは引き続き呼べる", async () => {
    const app = await createApp();
    for (let i = 0; i < 4; i++) {
      await callAs(app, searchEndpoints[0], fixtures.adminToken);
    }

    const res = await callAs(app, generateQuestions, fixtures.adminToken);

    expect(res.status).toBe(200);
  });
});

describe("参加者の書き込み（表示名・プロフィール画像・いいね）", () => {
  const participant = "uuid-営業部の佐藤さんの端末";
  const anotherParticipant = "uuid-同じ研修に参加した鈴木さんの端末";
  const likePath = `/api/likes/question/${fixtures.questionId}`;

  /** 参加者が書き込みに使うルート。userId はパスか本文で指定する */
  const writeEndpoints = [
    {
      name: "表示名の変更 PUT /api/users/:userId",
      send: (app: express.Express, userId: string) =>
        request(app)
          .put(`/api/users/${encodeURIComponent(userId)}`)
          .send({ displayName: "営業部 佐藤" }),
    },
    {
      name: "プロフィール画像の登録 POST /api/users/:userId/profile-image",
      send: (app: express.Express, userId: string) =>
        request(app).post(
          `/api/users/${encodeURIComponent(userId)}/profile-image`
        ),
    },
    {
      name: "いいねの切り替え POST /api/likes/:targetType/:targetId",
      send: (app: express.Express, userId: string) =>
        request(app).post(likePath).send({ userId }),
    },
  ];

  test.each(writeEndpoints)(
    "$name: 同じ参加者からの書き込みが上限を超えると 429 を返す",
    async ({ send }) => {
      const app = await createApp();
      for (let i = 0; i < 2; i++) {
        const res = await send(app, participant);
        expect(res.status).toBe(200);
      }

      const res = await send(app, participant);

      expect(res.status).toBe(429);
      expect(res.body.message).toBe(tooManyRequestsMessage);
    }
  );

  test.each(writeEndpoints)(
    "$name: 同じIPでも、別の参加者は巻き添えにならない",
    async ({ send }) => {
      const app = await createApp();
      for (let i = 0; i < 3; i++) await send(app, participant);

      const res = await send(app, anotherParticipant);

      expect(res.status).toBe(200);
    }
  );

  test("参加者の情報の取得 GET /api/users/:userId は、書き込みの上限に数えない", async () => {
    const app = await createApp();
    for (let i = 0; i < 3; i++) {
      const res = await request(app).get(
        `/api/users/${encodeURIComponent(participant)}`
      );
      expect(res.status).toBe(200);
    }
  });
});
