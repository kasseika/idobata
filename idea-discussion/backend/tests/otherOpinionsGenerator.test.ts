/**
 * 「その他の意見」の生成（otherOpinionsGenerator）のテスト
 *
 * 目的: issue #147 の「重要論点に拾われなかった意見を、テーマごとにまとめる」生成を検証する。
 *       - 材料は、表示される重要論点のどれにも relevanceScore 0.8 以上でリンクされていない課題
 *         （リンクがない課題・弱いリンクしかない課題・k で非表示の論点にだけリンクされた課題）
 *       - k が有効なテーマでは、書き手が k 人以上のグループだけを保存する。
 *         書き手が分からない課題は材料に入れず、LLM には userId を渡さない
 *       - k が有効なテーマでは、要約に原文が含まれていれば書き直させ、含まれたままなら保存しない
 *       - k が無効なテーマでは、書き手の人数に関係なくグループを保存する
 * 前提: Mongoose モデル・LLM 呼び出し・寄与人数の判定（minContributorsService）はモックする。
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

const ids = vi.hoisted(() => ({
  trainingThemeId: "650000000000000000000001", // k=5 の研修テーマ
  openThemeId: "650000000000000000000002", // k が無効の一般テーマ
  missingThemeId: "650000000000000000000009", // 見つからないテーマ
  visibleQuestionId: "650000000000000000000101", // 表示される論点（会議）
  hiddenQuestionId: "650000000000000000000102", // k で非表示の論点（夜間対応）
}));

/** find(...).select(...).lean()・find(...).lean()・findById(...).select(...).lean() に対応するクエリのモック */
const queryReturning = vi.hoisted(() => (result: unknown) => {
  const lean = vi.fn().mockResolvedValue(result);
  return { lean, select: () => ({ lean }) };
});

vi.mock("../models/Theme.js", () => ({ default: { findById: vi.fn() } }));
vi.mock("../models/SharpQuestion.js", () => ({ default: { find: vi.fn() } }));
vi.mock("../models/QuestionLink.js", () => ({ default: { find: vi.fn() } }));
vi.mock("../models/Problem.js", () => ({ default: { find: vi.fn() } }));

const saveSpy = vi.hoisted(() => vi.fn());
vi.mock("../models/OtherOpinions.js", () => {
  const Model = vi.fn(
    class {
      save = saveSpy;
      constructor(doc: object) {
        Object.assign(this, doc);
      }
    }
  );
  return {
    default: Object.assign(Model, {
      findOne: vi.fn(() => ({ sort: () => Promise.resolve(null) })),
    }),
  };
});
vi.mock("../services/minContributorsService.js", () => ({
  CONTRIBUTION_MIN_RELEVANCE_SCORE: 0.8,
  selectVisibleQuestions: vi.fn(),
  resolveAuthorIds: vi.fn(),
}));
vi.mock("../services/llmService.js", () => ({ callLLM: vi.fn() }));

import OtherOpinions from "../models/OtherOpinions.js";
import Problem from "../models/Problem.js";
import QuestionLink from "../models/QuestionLink.js";
import SharpQuestion from "../models/SharpQuestion.js";
import Theme from "../models/Theme.js";
import { callLLM } from "../services/llmService.js";
import {
  resolveAuthorIds,
  selectVisibleQuestions,
} from "../services/minContributorsService.js";
import { VerbatimQuoteError } from "../services/verbatimQuoteCheck.js";
import { generateOtherOpinions } from "../workers/otherOpinionsGenerator.js";

/** テーマの課題（書き手の userId と、表示される論点・非表示の論点へのリンク） */
const problems = {
  // 表示される論点に強くリンクされている（材料に入らない）
  meetings: {
    _id: "課題-会議",
    statement: "会議が多く、集中して作業する時間がほとんど取れていません。",
    userId: "user-sato",
  },
  // 表示される論点に弱くしかリンクされていない（材料に入る）
  bossStyle: {
    _id: "課題-上司",
    statement: "上司によって指示の出し方が違い、相談しにくいと感じています。",
    userId: "user-suzuki",
  },
  // k で非表示の論点にだけリンクされている（材料に入る）
  nightDuty: {
    _id: "課題-夜間",
    statement: "夜間の障害対応に手当が出ず、善意に頼った運用になっています。",
    userId: "user-takahashi",
  },
  // どの論点にもリンクされていない（材料に入る）
  remoteWork: {
    _id: "課題-在宅",
    statement: "在宅勤務の許可の出し方が部署ごとに違い、不公平に感じます。",
    userId: "user-tanaka",
  },
  overtime: {
    _id: "課題-残業",
    statement: "残業を申告しづらい雰囲気があり、実際より少なく申告しています。",
    userId: "user-ito",
  },
  systems: {
    _id: "課題-システム",
    statement: "業務システムがばらばらで、同じ内容を何度も入力しています。",
    userId: "user-watanabe",
  },
  // インポートした課題（書き手が分からない）
  imported: {
    _id: "課題-インポート",
    statement: "契約書が紙で回っていて、承認までに時間がかかっています。",
    userId: null,
  },
};
type ProblemFixture = (typeof problems)[keyof typeof problems];

/** 表示される論点に強くリンクされていない課題（k が有効なテーマの材料。書き手は5人） */
const uncoveredAuthoredProblems = [
  problems.bossStyle,
  problems.nightDuty,
  problems.remoteWork,
  problems.overtime,
  problems.systems,
];

/**
 * テーマのデータを用意する
 *
 * @param params.themeId - 生成するテーマ
 * @param params.minContributors - テーマの k（null なら無効）
 * @param params.themeProblems - テーマの課題（既定はすべて）
 */
const setUpTheme = (params: {
  themeId: string;
  minContributors: number | null;
  themeProblems?: ProblemFixture[];
}) => {
  const themeProblems = params.themeProblems ?? Object.values(problems);
  vi.mocked(Theme.findById).mockReturnValue(
    queryReturning({
      _id: params.themeId,
      minContributors: params.minContributors,
    }) as never
  );
  const questions = [
    { _id: ids.visibleQuestionId, themeId: params.themeId },
    { _id: ids.hiddenQuestionId, themeId: params.themeId },
  ];
  vi.mocked(SharpQuestion.find).mockReturnValue(
    queryReturning(questions) as never
  );
  // k が有効なテーマでは、夜間対応の論点が非表示になる
  vi.mocked(selectVisibleQuestions).mockResolvedValue({
    visibleQuestions:
      params.minContributors === null ? questions : [questions[0]],
    hiddenCount: params.minContributors === null ? 0 : 1,
  } as never);
  vi.mocked(QuestionLink.find).mockImplementation(((filter: {
    questionId: { $in: string[] };
  }) => {
    const allLinks = [
      {
        questionId: ids.visibleQuestionId,
        linkedItemType: "problem",
        linkedItemId: problems.meetings._id,
        relevanceScore: 0.9,
      },
      {
        questionId: ids.visibleQuestionId,
        linkedItemType: "problem",
        linkedItemId: problems.bossStyle._id,
        relevanceScore: 0.5,
      },
      {
        questionId: ids.hiddenQuestionId,
        linkedItemType: "problem",
        linkedItemId: problems.nightDuty._id,
        relevanceScore: 0.9,
      },
    ];
    // 問い合わせた論点のリンクだけを返す
    const queried = filter.questionId.$in.map(String);
    return queryReturning(
      allLinks.filter((link) => queried.includes(link.questionId))
    );
  }) as never);
  vi.mocked(Problem.find).mockReturnValue(
    queryReturning(
      themeProblems.map((p) => ({
        _id: p._id,
        statement: p.statement,
        sourceType: p.userId === null ? "import" : "chat",
        sourceOriginId: `thread-of-${p._id}`,
      }))
    ) as never
  );
  vi.mocked(resolveAuthorIds).mockResolvedValue(
    new Map(
      themeProblems
        .filter((p) => p.userId !== null)
        .map((p) => [p._id, p.userId as string])
    )
  );
};

/** LLM に渡したプロンプト（全メッセージ）を返す */
const promptOfCall = (callIndex: number): string =>
  vi
    .mocked(callLLM)
    .mock.calls[callIndex][0].map((m) => m.content)
    .join("\n");

/** 保存した「その他の意見」の内容 */
interface SavedOtherOpinions {
  themeId: string;
  groups: { summary: string; problemIds: string[] }[];
  version: number;
}

/** 保存した「その他の意見」の内容を返す（1回だけ保存したことも確かめる） */
const savedDocument = (): SavedOtherOpinions => {
  expect(saveSpy).toHaveBeenCalledTimes(1);
  return vi.mocked(OtherOpinions).mock.calls[0][0] as SavedOtherOpinions;
};

/** 5人の課題をまとめたグループ（k=5 を満たす） */
const fivePersonGroup = {
  summary:
    "働き方のルールや運用が人や部署によって違い、不公平さや相談のしにくさにつながっているという意見です。",
  memberIds: uncoveredAuthoredProblems.map((p) => p._id),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateOtherOpinions の材料", () => {
  test("表示される論点に強くリンクされた課題は渡さず、それ以外の課題を LLM に渡すこと", async () => {
    setUpTheme({ themeId: ids.trainingThemeId, minContributors: 5 });
    vi.mocked(callLLM).mockResolvedValue({ groups: [fivePersonGroup] });

    await generateOtherOpinions(ids.trainingThemeId);

    const prompt = promptOfCall(0);
    expect(prompt).not.toContain(problems.meetings.statement);
    // 弱いリンクしかない課題・非表示の論点にだけリンクされた課題・リンクがない課題は渡す
    for (const problem of uncoveredAuthoredProblems) {
      expect(prompt).toContain(problem.statement);
    }
  });

  test("k が有効なテーマでは、書き手が分からない課題を渡さず、userId も渡さないこと", async () => {
    setUpTheme({ themeId: ids.trainingThemeId, minContributors: 5 });
    vi.mocked(callLLM).mockResolvedValue({ groups: [fivePersonGroup] });

    await generateOtherOpinions(ids.trainingThemeId);

    const prompt = promptOfCall(0);
    expect(prompt).not.toContain(problems.imported.statement);
    for (const problem of uncoveredAuthoredProblems) {
      expect(prompt).not.toContain(problem.userId);
    }
  });

  test("k が無効なテーマでは、書き手が分からない課題も渡すこと", async () => {
    setUpTheme({ themeId: ids.openThemeId, minContributors: null });
    vi.mocked(callLLM).mockResolvedValue({ groups: [] });

    await generateOtherOpinions(ids.openThemeId);

    const prompt = promptOfCall(0);
    expect(prompt).toContain(problems.imported.statement);
    expect(prompt).not.toContain(problems.meetings.statement);
  });
});

describe("generateOtherOpinions の保存（k が有効なテーマ）", () => {
  test("書き手が k 人以上のグループだけを保存すること", async () => {
    setUpTheme({ themeId: ids.trainingThemeId, minContributors: 5 });
    vi.mocked(callLLM).mockResolvedValue({
      groups: [
        fivePersonGroup,
        {
          summary: "業務の進め方に関する意見です。",
          memberIds: [problems.remoteWork._id, problems.overtime._id],
        },
      ],
    });

    await generateOtherOpinions(ids.trainingThemeId);

    expect(savedDocument()).toEqual({
      themeId: ids.trainingThemeId,
      groups: [
        {
          summary: fivePersonGroup.summary,
          problemIds: fivePersonGroup.memberIds,
        },
      ],
      version: 1,
    });
  });

  test("材料にない ID と、前に採用されたグループの課題は、書き手の人数に数えないこと", async () => {
    setUpTheme({ themeId: ids.trainingThemeId, minContributors: 5 });
    vi.mocked(callLLM).mockResolvedValue({
      groups: [
        fivePersonGroup,
        {
          // 前提: 5人の課題はすべて前のグループで採用済みで、会議の課題と架空の ID は材料にない。
          //       数えられる書き手は0人なので、k=5 を満たさない
          summary: "働き方に関する意見です。",
          memberIds: [
            ...fivePersonGroup.memberIds,
            problems.meetings._id,
            "存在しない課題",
          ],
        },
      ],
    });

    await generateOtherOpinions(ids.trainingThemeId);

    expect(savedDocument().groups).toEqual([
      {
        summary: fivePersonGroup.summary,
        problemIds: fivePersonGroup.memberIds,
      },
    ]);
  });

  test("k 人に届かずに採用されなかったグループの課題は、後のグループで数えること", async () => {
    setUpTheme({ themeId: ids.trainingThemeId, minContributors: 5 });
    vi.mocked(callLLM).mockResolvedValue({
      groups: [
        {
          summary: "相談のしにくさに関する意見です。",
          memberIds: [problems.bossStyle._id],
        },
        fivePersonGroup,
      ],
    });

    await generateOtherOpinions(ids.trainingThemeId);

    expect(savedDocument().groups).toEqual([
      {
        summary: fivePersonGroup.summary,
        problemIds: fivePersonGroup.memberIds,
      },
    ]);
  });

  test("材料の書き手が k 人未満なら、LLM を呼ばずに、グループのない版を保存すること", async () => {
    setUpTheme({
      themeId: ids.trainingThemeId,
      minContributors: 5,
      themeProblems: [
        problems.meetings,
        problems.remoteWork,
        problems.overtime,
        problems.systems,
        problems.imported,
      ],
    });

    await generateOtherOpinions(ids.trainingThemeId);

    expect(callLLM).not.toHaveBeenCalled();
    expect(savedDocument().groups).toEqual([]);
  });

  test("要約に原文が含まれていれば書き直させ、要約されれば保存すること", async () => {
    setUpTheme({ themeId: ids.trainingThemeId, minContributors: 5 });
    vi.mocked(callLLM)
      .mockResolvedValueOnce({
        groups: [
          {
            summary: `「${problems.remoteWork.statement}」という意見です。`,
            memberIds: fivePersonGroup.memberIds,
          },
        ],
      })
      .mockResolvedValueOnce({ groups: [fivePersonGroup] });

    await generateOtherOpinions(ids.trainingThemeId);

    expect(callLLM).toHaveBeenCalledTimes(2);
    expect(savedDocument().groups[0].summary).toBe(fivePersonGroup.summary);
  });

  test("何度生成しても要約に原文が含まれていれば、保存せずに VerbatimQuoteError を投げること", async () => {
    setUpTheme({ themeId: ids.trainingThemeId, minContributors: 5 });
    vi.mocked(callLLM).mockResolvedValue({
      groups: [
        {
          summary: `「${problems.remoteWork.statement}」という意見です。`,
          memberIds: fivePersonGroup.memberIds,
        },
      ],
    });

    await expect(
      generateOtherOpinions(ids.trainingThemeId)
    ).rejects.toBeInstanceOf(VerbatimQuoteError);
    expect(saveSpy).not.toHaveBeenCalled();
  });
});

describe("generateOtherOpinions の保存（k が無効なテーマ）", () => {
  test("書き手の人数に関係なく、材料にある課題のグループを保存すること", async () => {
    setUpTheme({ themeId: ids.openThemeId, minContributors: null });
    vi.mocked(callLLM).mockResolvedValue({
      groups: [
        {
          summary: "契約や承認の手続きに時間がかかるという意見です。",
          memberIds: [problems.imported._id],
        },
      ],
    });

    await generateOtherOpinions(ids.openThemeId);

    expect(savedDocument().groups).toEqual([
      {
        summary: "契約や承認の手続きに時間がかかるという意見です。",
        problemIds: [problems.imported._id],
      },
    ]);
  });

  test("前の版があれば、版の番号を1つ進めて保存すること", async () => {
    setUpTheme({ themeId: ids.openThemeId, minContributors: null });
    vi.mocked(OtherOpinions.findOne).mockReturnValue({
      sort: () => Promise.resolve({ version: 2 }),
    } as never);
    vi.mocked(callLLM).mockResolvedValue({ groups: [] });

    await generateOtherOpinions(ids.openThemeId);

    expect(savedDocument().version).toBe(3);
  });
});

describe("generateOtherOpinions の失敗", () => {
  test("LLM の出力が想定の形でなければ、保存せずにエラーを投げること", async () => {
    setUpTheme({ themeId: ids.openThemeId, minContributors: null });
    vi.mocked(callLLM).mockResolvedValue({ summaries: ["形式が違う出力"] });

    await expect(generateOtherOpinions(ids.openThemeId)).rejects.toThrow();
    expect(saveSpy).not.toHaveBeenCalled();
  });

  test("テーマが見つからなければ、LLM を呼ばずにエラーを投げること", async () => {
    vi.mocked(Theme.findById).mockReturnValue(queryReturning(null) as never);

    await expect(generateOtherOpinions(ids.missingThemeId)).rejects.toThrow();
    expect(callLLM).not.toHaveBeenCalled();
  });
});
