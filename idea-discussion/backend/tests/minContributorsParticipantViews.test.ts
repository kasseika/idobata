/**
 * 最小寄与人数 k による参加者向け API の表示制御のテスト
 *
 * 目的: issue #146 の Phase 1 のうち、参加者向けの REST API が次の仕様を満たすことを検証する。
 *       - k が有効なテーマでは、個々の課題文・解決策文を返さない（第1層）
 *       - k が有効なテーマでは、寄与人数が k 未満の重要論点を返さない（第2層）。
 *         テーマ詳細では、非表示にした論点の件数（hiddenQuestionCount）だけを返す
 *       - k が無効なテーマでは、従来どおりの応答を返す
 *       あわせて、issue #147 の PR 2 のうち、テーマ詳細が最新の「その他の意見」の要約を返し、
 *       材料にした課題の ID（problemIds）を返さないことを検証する（k の有無を問わない）
 * 前提: Mongoose モデルはモックする。寄与人数の判定（selectVisibleQuestions）は
 *       minContributorsService.test.ts で検証済みのため、ここでは判定結果をモックで与える。
 */
import type { Request, Response } from "express";
import { beforeEach, describe, expect, test, vi } from "vitest";

const ids = vi.hoisted(() => ({
  trainingThemeId: "650000000000000000000001", // k=5 の研修テーマ
  openThemeId: "650000000000000000000002", // k が無効の一般テーマ
  visibleQuestionId: "650000000000000000000101", // 5人以上が寄与した論点
  hiddenQuestionId: "650000000000000000000102", // 4人以下しか寄与していない論点
}));

vi.mock("../models/Theme.js", () => ({
  default: { find: vi.fn(), findById: vi.fn() },
}));
vi.mock("../models/SharpQuestion.js", () => ({
  default: {
    find: vi.fn(),
    findById: vi.fn(),
    countDocuments: vi.fn().mockResolvedValue(0),
  },
}));
vi.mock("../models/Problem.js", () => ({ default: { find: vi.fn() } }));
vi.mock("../models/Solution.js", () => ({ default: { find: vi.fn() } }));
vi.mock("../models/QuestionLink.js", () => ({
  default: {
    find: vi.fn().mockResolvedValue([]),
    findOne: vi.fn(() => ({ populate: vi.fn().mockResolvedValue(null) })),
    countDocuments: vi.fn().mockResolvedValue(0),
  },
}));
vi.mock("../models/ChatThread.js", () => ({
  default: {
    findOne: vi.fn().mockResolvedValue(null),
    countDocuments: vi.fn().mockResolvedValue(0),
    distinct: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock("../models/Like.js", () => ({
  default: { countDocuments: vi.fn().mockResolvedValue(0) },
}));
vi.mock("../models/ReportExample.js", () => ({
  default: {
    findOne: vi.fn(() => ({
      sort: () => ({ lean: vi.fn().mockResolvedValue(null) }),
    })),
  },
}));
vi.mock("../models/OtherOpinions.js", () => ({
  default: { findOne: vi.fn() },
}));
vi.mock("../services/questionVisualReportGenerator.js", () => ({
  getVisualReport: vi.fn().mockResolvedValue(null),
}));
vi.mock("../services/debateAnalysisGenerator.js", () => ({
  getDebateAnalysis: vi.fn().mockResolvedValue(null),
}));
vi.mock("../controllers/userController.js", () => ({
  getUser: vi.fn().mockResolvedValue(null),
}));
// 寄与人数の判定は「hiddenQuestionId だけが k を満たさない」としてモックする
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

import {
  getProblemsByTheme,
  getSolutionsByTheme,
} from "../controllers/adminController.js";
import {
  getQuestionDetails,
  getQuestionsByTheme,
} from "../controllers/questionController.js";
import { getThemeDetail } from "../controllers/themeController.js";
import { getTopPageData } from "../controllers/topPageController.js";
import OtherOpinions from "../models/OtherOpinions.js";
import Problem from "../models/Problem.js";
import SharpQuestion from "../models/SharpQuestion.js";
import Solution from "../models/Solution.js";
import Theme from "../models/Theme.js";

/** テーマのモック。k の有無だけを切り替える */
const themes = {
  training: {
    _id: ids.trainingThemeId,
    title: "新人研修 2026 春",
    status: "active",
    minContributors: 5,
  },
  open: {
    _id: ids.openThemeId,
    title: "地域の防災を考える",
    status: "active",
    minContributors: null,
  },
};

/**
 * 重要論点のモック（Mongoose ドキュメントのように toObject を持つ）
 *
 * 注意: clusteringResults と sourceProblemIds は、個々の課題の ID を持つフィールドである。
 *       k が有効なテーマでは、どの経路でも返してはならない。
 */
const createQuestionDoc = (
  questionId: string,
  themeId: string,
  createdAt = new Date("2026-11-03T10:00:00+09:00")
) => {
  const data = {
    _id: questionId,
    themeId,
    createdAt,
    sourceProblemIds: ["課題ID-1"],
    questionText:
      questionId === ids.hiddenQuestionId
        ? "経理部の月末処理の負担をどう減らすか？"
        : "評価への納得感を高めるにはどうすればよいだろうか？",
    clusteringResults: { kmeans: { clusters: [["課題ID-1", "課題ID-2"]] } },
  };
  return { ...data, toObject: () => data };
};

/** 課題・解決策のモック */
const problemDoc = {
  _id: "650000000000000000000010",
  statement: "評価基準が不透明であることが課題です。",
  createdAt: new Date("2026-11-01T10:00:00+09:00"),
};
const solutionDoc = {
  _id: "650000000000000000000020",
  statement: "評価面談で基準を説明する時間を設けるとよいと思います。",
  createdAt: new Date("2026-11-01T10:05:00+09:00"),
};

/** themeId で引けるテーマを、findById の各呼び出し方（直接 await / select().lean()）に対応させる */
const mockThemeFindById = (theme: object | null) => {
  const query = Promise.resolve(theme);
  (Theme.findById as ReturnType<typeof vi.fn>).mockReturnValue(
    Object.assign(query, {
      select: () => ({ lean: vi.fn().mockResolvedValue(theme) }),
      lean: vi.fn().mockResolvedValue(theme),
    })
  );
};

/** find(...).sort(...) で配列を返すクエリのモック */
const mockFindSorted = (model: { find: unknown }, docs: unknown[]) => {
  (model.find as ReturnType<typeof vi.fn>).mockReturnValue({
    sort: vi.fn().mockResolvedValue(docs),
  });
};

/**
 * 最新の「その他の意見」の版を返すクエリ（findOne().sort().lean()）のモック
 *
 * 注意: 実際の版のドキュメントと同じく problemIds を含めて返す。
 *       応答から problemIds が除かれることを検証するため。
 */
const mockLatestOtherOpinions = (doc: object | null) => {
  (OtherOpinions.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
    sort: () => ({ lean: vi.fn().mockResolvedValue(doc) }),
  });
};

/** リクエスト・レスポンスのモック */
const createReqRes = (params: Record<string, string>) => {
  const json = vi.fn();
  const res = {
    status: vi.fn().mockReturnThis(),
    json,
  };
  return { req: { params }, res, json };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("課題・解決策の一覧（GET /themes/:themeId/problems・solutions）", () => {
  test("k が有効なテーマでは、課題の一覧を空で返すこと", async () => {
    mockThemeFindById(themes.training);
    mockFindSorted(Problem, [problemDoc]);
    const { req, res, json } = createReqRes({ themeId: ids.trainingThemeId });

    await getProblemsByTheme(
      req as unknown as Request,
      res as unknown as Response
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith([]);
  });

  test("k が有効なテーマでは、解決策の一覧を空で返すこと", async () => {
    mockThemeFindById(themes.training);
    mockFindSorted(Solution, [solutionDoc]);
    const { req, res, json } = createReqRes({ themeId: ids.trainingThemeId });

    await getSolutionsByTheme(
      req as unknown as Request,
      res as unknown as Response
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith([]);
  });

  test("k が無効なテーマでは、従来どおり課題の一覧を返すこと", async () => {
    mockThemeFindById(themes.open);
    mockFindSorted(Problem, [problemDoc]);
    const { req, res, json } = createReqRes({ themeId: ids.openThemeId });

    await getProblemsByTheme(
      req as unknown as Request,
      res as unknown as Response
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith([problemDoc]);
  });

  test("k が無効なテーマでは、従来どおり解決策の一覧を返すこと", async () => {
    mockThemeFindById(themes.open);
    mockFindSorted(Solution, [solutionDoc]);
    const { req, res, json } = createReqRes({ themeId: ids.openThemeId });

    await getSolutionsByTheme(
      req as unknown as Request,
      res as unknown as Response
    );

    expect(json).toHaveBeenCalledWith([solutionDoc]);
  });
});

describe("テーマ詳細（GET /themes/:themeId/detail）", () => {
  const setUpThemeDetail = (
    theme: typeof themes.training | typeof themes.open
  ) => {
    mockThemeFindById(theme);
    (SharpQuestion.find as ReturnType<typeof vi.fn>).mockResolvedValue([
      createQuestionDoc(ids.visibleQuestionId, theme._id),
      createQuestionDoc(ids.hiddenQuestionId, theme._id),
    ]);
    mockFindSorted(Problem, [problemDoc]);
    mockFindSorted(Solution, [solutionDoc]);
    mockLatestOtherOpinions(null);
  };

  test("k が有効なテーマでは、課題・解決策を空で返し、k 未満の論点を除いて件数だけを返すこと", async () => {
    setUpThemeDetail(themes.training);
    const { req, res, json } = createReqRes({ themeId: ids.trainingThemeId });

    await getThemeDetail(req as unknown as Request, res as unknown as Response);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = json.mock.calls[0][0];
    expect(body.issues).toEqual([]);
    expect(body.solutions).toEqual([]);
    expect(body.keyQuestions.map((q: { _id: string }) => q._id)).toEqual([
      ids.visibleQuestionId,
    ]);
    expect(body.hiddenQuestionCount).toBe(1);
    // 表示する論点からも、個々の課題の ID を持つフィールドを除くこと
    expect(body.keyQuestions[0]).not.toHaveProperty("clusteringResults");
    expect(body.keyQuestions[0]).not.toHaveProperty("sourceProblemIds");
    // 非表示の論点の文が、応答のどこにも含まれないこと
    expect(JSON.stringify(body)).not.toContain("経理部の月末処理");
  });

  test("k が無効なテーマでは、従来どおり課題・解決策・すべての論点を返し、hiddenQuestionCount を含めないこと", async () => {
    setUpThemeDetail(themes.open);
    const { req, res, json } = createReqRes({ themeId: ids.openThemeId });

    await getThemeDetail(req as unknown as Request, res as unknown as Response);

    const body = json.mock.calls[0][0];
    expect(body.issues).toEqual([problemDoc]);
    expect(body.solutions).toEqual([solutionDoc]);
    expect(body.keyQuestions).toHaveLength(2);
    expect(body.keyQuestions[0]).toHaveProperty("clusteringResults");
    expect(body).not.toHaveProperty("hiddenQuestionCount");
  });
});

describe("テーマ詳細の「その他の意見」（GET /themes/:themeId/detail）", () => {
  /** 生成済みの「その他の意見」の版（材料にした課題の ID を含む） */
  const otherOpinionsDoc = {
    _id: "650000000000000000000301",
    version: 2,
    createdAt: new Date("2026-11-10T09:00:00+09:00"),
    groups: [
      {
        summary:
          "会議の資料が直前に届き、準備の時間が足りないという意見があります。",
        problemIds: ["650000000000000000000011", "650000000000000000000012"],
      },
      {
        summary: "社内の問い合わせ窓口が分かりにくいという意見があります。",
        problemIds: ["650000000000000000000013"],
      },
    ],
  };

  const setUpThemeDetail = (
    theme: typeof themes.training | typeof themes.open,
    latestOtherOpinions: object | null
  ) => {
    mockThemeFindById(theme);
    (SharpQuestion.find as ReturnType<typeof vi.fn>).mockResolvedValue([
      createQuestionDoc(ids.visibleQuestionId, theme._id),
    ]);
    mockFindSorted(Problem, [problemDoc]);
    mockFindSorted(Solution, [solutionDoc]);
    mockLatestOtherOpinions(latestOtherOpinions);
  };

  test.each([
    ["k が有効なテーマ", themes.training],
    ["k が無効なテーマ", themes.open],
  ])(
    "%sでは、最新の「その他の意見」の要約を返し、課題の ID を返さないこと",
    async (_label, theme) => {
      setUpThemeDetail(theme, otherOpinionsDoc);
      const { req, res, json } = createReqRes({ themeId: theme._id });

      await getThemeDetail(
        req as unknown as Request,
        res as unknown as Response
      );

      expect(res.status).toHaveBeenCalledWith(200);
      const body = json.mock.calls[0][0];
      expect(body.otherOpinions).toEqual({
        createdAt: otherOpinionsDoc.createdAt,
        groups: [
          {
            summary:
              "会議の資料が直前に届き、準備の時間が足りないという意見があります。",
          },
          {
            summary: "社内の問い合わせ窓口が分かりにくいという意見があります。",
          },
        ],
      });
      // 材料にした課題の ID が、応答のどこにも含まれないこと
      expect(JSON.stringify(body)).not.toContain("650000000000000000000011");
      expect(JSON.stringify(body)).not.toContain("problemIds");
    }
  );

  test("「その他の意見」がまだ生成されていないテーマでは、otherOpinions に null を返すこと", async () => {
    setUpThemeDetail(themes.open, null);
    const { req, res, json } = createReqRes({ themeId: ids.openThemeId });

    await getThemeDetail(req as unknown as Request, res as unknown as Response);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(json.mock.calls[0][0].otherOpinions).toBeNull();
  });
});

describe("重要論点の一覧（GET /themes/:themeId/questions）", () => {
  const setUpQuestions = (themeId: string) => {
    mockFindSorted(SharpQuestion, [
      createQuestionDoc(ids.visibleQuestionId, themeId),
      createQuestionDoc(ids.hiddenQuestionId, themeId),
    ]);
  };

  test("k が有効なテーマでは、k 未満の論点を除き、クラスタリング結果を含めないこと", async () => {
    mockThemeFindById(themes.training);
    setUpQuestions(ids.trainingThemeId);
    const { req, res, json } = createReqRes({ themeId: ids.trainingThemeId });

    await getQuestionsByTheme(
      req as unknown as Request,
      res as unknown as Response
    );

    expect(res.status).toHaveBeenCalledWith(200);
    const body = json.mock.calls[0][0];
    expect(body.map((q: { _id: string }) => q._id)).toEqual([
      ids.visibleQuestionId,
    ]);
    expect(body[0]).not.toHaveProperty("clusteringResults");
    expect(body[0]).not.toHaveProperty("sourceProblemIds");
  });

  test("k が無効なテーマでは、従来どおりすべての論点をクラスタリング結果つきで返すこと", async () => {
    mockThemeFindById(themes.open);
    setUpQuestions(ids.openThemeId);
    const { req, res, json } = createReqRes({ themeId: ids.openThemeId });

    await getQuestionsByTheme(
      req as unknown as Request,
      res as unknown as Response
    );

    const body = json.mock.calls[0][0];
    expect(body).toHaveLength(2);
    expect(body[0]).toHaveProperty("clusteringResults");
  });
});

describe("重要論点の詳細（GET /themes/:themeId/questions/:questionId/details）", () => {
  const setUpDetails = (
    questionId: string,
    theme: typeof themes.training | typeof themes.open
  ) => {
    (SharpQuestion.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
      createQuestionDoc(questionId, theme._id)
    );
    mockThemeFindById(theme);
    const leanQuery = (docs: unknown[]) => ({
      lean: vi.fn().mockResolvedValue(docs),
      select: () => ({ lean: vi.fn().mockResolvedValue([]) }),
    });
    (Problem.find as ReturnType<typeof vi.fn>).mockReturnValue(
      leanQuery([problemDoc])
    );
    (Solution.find as ReturnType<typeof vi.fn>).mockReturnValue(
      leanQuery([solutionDoc])
    );
  };

  test("k が有効なテーマで、k 未満の論点の詳細は 404 を返すこと", async () => {
    setUpDetails(ids.hiddenQuestionId, themes.training);
    const { req, res, json } = createReqRes({
      themeId: ids.trainingThemeId,
      questionId: ids.hiddenQuestionId,
    });

    await getQuestionDetails(
      req as unknown as Request,
      res as unknown as Response
    );

    expect(res.status).toHaveBeenCalledWith(404);
    expect(JSON.stringify(json.mock.calls[0][0])).not.toContain(
      "経理部の月末処理"
    );
  });

  test("k が有効なテーマで、k 以上の論点の詳細は、関連する課題・解決策を空にして返すこと", async () => {
    setUpDetails(ids.visibleQuestionId, themes.training);
    const { req, res, json } = createReqRes({
      themeId: ids.trainingThemeId,
      questionId: ids.visibleQuestionId,
    });

    await getQuestionDetails(
      req as unknown as Request,
      res as unknown as Response
    );

    expect(res.status).toHaveBeenCalledWith(200);
    const body = json.mock.calls[0][0];
    expect(body.question._id).toBe(ids.visibleQuestionId);
    expect(body.question).not.toHaveProperty("clusteringResults");
    expect(body.question).not.toHaveProperty("sourceProblemIds");
    expect(body.relatedProblems).toEqual([]);
    expect(body.relatedSolutions).toEqual([]);
  });

  test("k が無効なテーマでは、従来どおり関連する課題・解決策を返すこと", async () => {
    setUpDetails(ids.hiddenQuestionId, themes.open);
    const { req, res, json } = createReqRes({
      themeId: ids.openThemeId,
      questionId: ids.hiddenQuestionId,
    });

    await getQuestionDetails(
      req as unknown as Request,
      res as unknown as Response
    );

    expect(res.status).toHaveBeenCalledWith(200);
    const body = json.mock.calls[0][0];
    expect(body.relatedProblems).toHaveLength(1);
    expect(body.relatedSolutions).toHaveLength(1);
  });
});

describe("トップページ（GET /top-page-data）", () => {
  /** 研修テーマと一般テーマに、課題を1件ずつ用意する */
  const trainingProblem = {
    _id: "650000000000000000000011",
    statement: "経理部の月末処理で残業が続いています。",
    themeId: themes.training,
    createdAt: new Date("2026-11-02T10:00:00+09:00"),
  };
  const openProblem = {
    _id: "650000000000000000000012",
    statement: "避難所の場所が分かりにくいです。",
    themeId: themes.open,
    createdAt: new Date("2026-11-02T09:00:00+09:00"),
  };

  /**
   * DB と同じく、themeId の条件に合う論点を新しい順に返す SharpQuestion.find を用意する
   * 注意: limit を付けた場合だけ件数を絞る（付けずに await した場合は全件を返す）
   */
  const setUpTopPageQuestions = (
    questions: ReturnType<typeof createQuestionDoc>[]
  ) => {
    (SharpQuestion.find as ReturnType<typeof vi.fn>).mockImplementation(
      (filter: { themeId: { $in: unknown[] } }) => {
        const matched = questions
          .filter((q) => filter.themeId.$in.map(String).includes(q.themeId))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return {
          sort: () =>
            Object.assign(Promise.resolve(matched), {
              limit: (n: number) => Promise.resolve(matched.slice(0, n)),
            }),
        };
      }
    );
  };

  beforeEach(() => {
    (Theme.find as ReturnType<typeof vi.fn>).mockReturnValue({
      sort: () => ({
        limit: vi.fn().mockResolvedValue([themes.training, themes.open]),
      }),
      select: () => ({
        lean: vi.fn().mockResolvedValue([themes.training, themes.open]),
      }),
    });
    setUpTopPageQuestions([
      createQuestionDoc(ids.visibleQuestionId, ids.trainingThemeId),
      createQuestionDoc(ids.hiddenQuestionId, ids.trainingThemeId),
    ]);
    // DB と同じく、themeId の条件に合う課題だけを返す
    (Problem.find as ReturnType<typeof vi.fn>).mockImplementation(
      (filter: { themeId: { $in: unknown[] } }) => ({
        sort: () => ({
          limit: () => ({
            populate: vi
              .fn()
              .mockResolvedValue(
                [trainingProblem, openProblem].filter((p) =>
                  filter.themeId.$in.map(String).includes(String(p.themeId._id))
                )
              ),
          }),
        }),
      })
    );
    (Solution.find as ReturnType<typeof vi.fn>).mockReturnValue({
      sort: () => ({
        limit: () => ({ populate: vi.fn().mockResolvedValue([]) }),
      }),
    });
  });

  test("k が有効なテーマの課題は最新の意見に含めず、k が無効なテーマの課題は含めること", async () => {
    const { res, json } = createReqRes({});

    await getTopPageData({} as Request, res as unknown as Response);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = json.mock.calls[0][0];
    expect(body.latestOpinions.map((o: { text: string }) => o.text)).toEqual([
      "避難所の場所が分かりにくいです。",
    ]);
  });

  test("k 未満の論点は、最新の論点に含めないこと", async () => {
    const { res, json } = createReqRes({});

    await getTopPageData({} as Request, res as unknown as Response);

    const body = json.mock.calls[0][0];
    expect(body.latestQuestions.map((q: { _id: string }) => q._id)).toEqual([
      ids.visibleQuestionId,
    ]);
    expect(body.latestQuestions[0]).not.toHaveProperty("clusteringResults");
    expect(body.latestQuestions[0]).not.toHaveProperty("sourceProblemIds");
    expect(JSON.stringify(body)).not.toContain("経理部の月末処理");
  });

  test("非表示の論点が新しい100件を占めていても、それより古い表示できる論点を最新の論点に含めること", async () => {
    // 前提: 研修テーマに、k を満たさない新しい論点が100件と、k を満たす古い論点が1件ある
    const hiddenRecentQuestions = Array.from({ length: 100 }, (_, i) =>
      createQuestionDoc(
        ids.hiddenQuestionId,
        ids.trainingThemeId,
        new Date(Date.UTC(2026, 10, 5, 0, i))
      )
    );
    setUpTopPageQuestions([
      ...hiddenRecentQuestions,
      createQuestionDoc(
        ids.visibleQuestionId,
        ids.trainingThemeId,
        new Date("2026-10-01T10:00:00+09:00")
      ),
    ]);
    const { res, json } = createReqRes({});

    await getTopPageData({} as Request, res as unknown as Response);

    const body = json.mock.calls[0][0];
    expect(body.latestQuestions.map((q: { _id: string }) => q._id)).toEqual([
      ids.visibleQuestionId,
    ]);
  });
});
