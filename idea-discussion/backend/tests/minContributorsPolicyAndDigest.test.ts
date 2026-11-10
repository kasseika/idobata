/**
 * 最小寄与人数 k による政策ドラフト・ダイジェストの制限のテスト
 *
 * 目的: issue #146 の Phase 1 のうち、次の仕様を検証する。
 *       - k が有効なテーマでは、政策ドラフトの生成で「生の声（引用など）を取り入れる」よう LLM に指示しない。
 *         引用された原文から、書き手を推定されるのを防ぐため
 *       - k が有効なテーマでは、政策ドラフト・ダイジェストの一覧（公開 API）に、k 未満の論点の分を含めない
 *       - k が無効なテーマでは、従来どおりとする
 * 前提: Mongoose モデルと LLM 呼び出しはモックする。
 *       寄与人数の判定（selectVisibleQuestions）は「研修テーマの hiddenQuestionId だけが k を満たさない」としてモックする。
 */
import type { Request, Response } from "express";
import { beforeEach, describe, expect, test, vi } from "vitest";

const ids = vi.hoisted(() => ({
  trainingThemeId: "650000000000000000000001", // k=5 の研修テーマ
  openThemeId: "650000000000000000000002", // k が無効の一般テーマ
  visibleQuestionId: "650000000000000000000101",
  hiddenQuestionId: "650000000000000000000102",
}));

vi.mock("../models/Theme.js", () => ({
  default: {
    findById: vi.fn((themeId: string) => ({
      select: () => ({
        lean: vi.fn().mockResolvedValue({
          _id: themeId,
          minContributors: themeId === ids.trainingThemeId ? 5 : null,
        }),
      }),
    })),
  },
}));
vi.mock("../models/SharpQuestion.js", () => ({
  default: { findById: vi.fn(), find: vi.fn() },
}));
vi.mock("../models/QuestionLink.js", () => ({
  default: { find: vi.fn().mockResolvedValue([]) },
}));
vi.mock("../models/Problem.js", () => ({
  default: { find: vi.fn().mockResolvedValue([]) },
}));
vi.mock("../models/Solution.js", () => ({
  default: { find: vi.fn().mockResolvedValue([]) },
}));
vi.mock("../models/PolicyDraft.js", () => {
  const PolicyDraftMock = vi.fn(
    class {
      _id = "政策ドラフトID";
      save = vi.fn().mockResolvedValue(undefined);
    }
  );
  return { default: Object.assign(PolicyDraftMock, { find: vi.fn() }) };
});
vi.mock("../models/DigestDraft.js", () => ({
  default: { find: vi.fn() },
}));
vi.mock("../services/llmService.js", () => ({
  callLLM: vi.fn().mockResolvedValue({
    title: "評価制度の改善に向けて",
    content: "## ビジョンレポート\n...\n## 解決手段レポート\n...",
  }),
}));
vi.mock("../services/minContributorsService.js", () => ({
  selectVisibleQuestions: vi.fn(
    async (questions: { _id: unknown; themeId: unknown }[]) => {
      // k が有効な研修テーマの hiddenQuestionId だけを、k を満たさない論点とする
      const visibleQuestions = questions.filter(
        (q) =>
          String(q.themeId) !== ids.trainingThemeId ||
          String(q._id) !== ids.hiddenQuestionId
      );
      return {
        visibleQuestions,
        hiddenCount: questions.length - visibleQuestions.length,
      };
    }
  ),
}));

import { getDigestDraftsByTheme } from "../controllers/digestController.js";
import { getPolicyDraftsByTheme } from "../controllers/policyController.js";
import DigestDraft from "../models/DigestDraft.js";
import PolicyDraft from "../models/PolicyDraft.js";
import SharpQuestion from "../models/SharpQuestion.js";
import { callLLM } from "../services/llmService.js";
import { generatePolicyDraft } from "../workers/policyGenerator.js";

/** 政策ドラフトの生成で、LLM に渡したシステムプロンプトを返す */
const generateAndGetSystemPrompt = async (themeId: string) => {
  (SharpQuestion.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
    _id: ids.visibleQuestionId,
    themeId,
    questionText: "評価への納得感を高めるにはどうすればよいだろうか？",
  });

  await generatePolicyDraft(ids.visibleQuestionId);

  const messages = (callLLM as ReturnType<typeof vi.fn>).mock.calls[0][0];
  return messages.find((m: { role: string }) => m.role === "system").content;
};

/** 2つの論点（k 以上・k 未満）それぞれの生成物を用意し、DB と同じく questionId の条件で絞って返す */
const setUpDrafts = (model: { find: unknown }, themeId: string) => {
  (SharpQuestion.find as ReturnType<typeof vi.fn>).mockResolvedValue([
    { _id: ids.visibleQuestionId, themeId },
    { _id: ids.hiddenQuestionId, themeId },
  ]);
  const drafts = [
    { questionId: ids.visibleQuestionId, title: "評価制度の改善に向けて" },
    { questionId: ids.hiddenQuestionId, title: "経理部の月末処理の負担軽減" },
  ];
  (model.find as ReturnType<typeof vi.fn>).mockImplementation(
    (filter: { questionId: { $in: unknown[] } }) => {
      const matched = drafts.filter((d) =>
        filter.questionId.$in.map(String).includes(d.questionId)
      );
      const query = {
        sort: () => query,
        populate: () => query,
        // biome-ignore lint/suspicious/noThenProperty: Mongoose のクエリは thenable なので再現する
        then: (resolve: (value: unknown) => unknown) => resolve(matched),
      };
      return query;
    }
  );
};

/** 一覧 API を呼び、返ったドラフトのタイトルを返す */
const listDraftTitles = async (
  handler: (req: Request, res: Response) => Promise<unknown>,
  themeId: string
) => {
  const json = vi.fn();
  const res = { status: vi.fn().mockReturnThis(), json };
  await handler(
    { params: { themeId } } as unknown as Request,
    res as unknown as Response
  );
  expect(res.status).toHaveBeenCalledWith(200);
  return json.mock.calls[0][0].map((d: { title: string }) => d.title);
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("政策ドラフトの生成のプロンプト", () => {
  test("k が有効なテーマでは、生の声（引用）を取り入れるよう指示せず、引用しないよう指示すること", async () => {
    const systemPrompt = await generateAndGetSystemPrompt(ids.trainingThemeId);

    expect(systemPrompt).not.toContain("生の声");
    expect(systemPrompt).toContain("引用せず");
  });

  test("k が無効なテーマでは、従来どおり生の声（引用）を取り入れるよう指示すること", async () => {
    const systemPrompt = await generateAndGetSystemPrompt(ids.openThemeId);

    expect(systemPrompt).toContain("生の声（引用など）を取り入れてください");
  });
});

describe("政策ドラフトの一覧（GET /themes/:themeId/policy-drafts）", () => {
  test("k が有効なテーマでは、k 未満の論点の政策ドラフトを含めないこと", async () => {
    setUpDrafts(PolicyDraft, ids.trainingThemeId);

    const titles = await listDraftTitles(
      getPolicyDraftsByTheme,
      ids.trainingThemeId
    );

    expect(titles).toEqual(["評価制度の改善に向けて"]);
  });

  test("k が無効なテーマでは、従来どおりすべての論点の政策ドラフトを返すこと", async () => {
    setUpDrafts(PolicyDraft, ids.openThemeId);

    const titles = await listDraftTitles(
      getPolicyDraftsByTheme,
      ids.openThemeId
    );

    expect(titles).toHaveLength(2);
  });
});

describe("ダイジェストの一覧（GET /themes/:themeId/digest-drafts）", () => {
  test("k が有効なテーマでは、k 未満の論点のダイジェストを含めないこと", async () => {
    setUpDrafts(DigestDraft, ids.trainingThemeId);

    const titles = await listDraftTitles(
      getDigestDraftsByTheme,
      ids.trainingThemeId
    );

    expect(titles).toEqual(["評価制度の改善に向けて"]);
  });

  test("k が無効なテーマでは、従来どおりすべての論点のダイジェストを返すこと", async () => {
    setUpDrafts(DigestDraft, ids.openThemeId);

    const titles = await listDraftTitles(
      getDigestDraftsByTheme,
      ids.openThemeId
    );

    expect(titles).toHaveLength(2);
  });
});
