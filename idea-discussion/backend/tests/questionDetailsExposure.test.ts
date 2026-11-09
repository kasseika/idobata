/**
 * 重要論点の詳細 API の公開範囲 テスト
 *
 * 目的: 認証なしで呼べる getQuestionDetails が、関連する課題・解決策を返すときに
 *       抽出元のスレッドID（sourceOriginId）を含めないことを検証する。
 * 前提: このAPIは .lean() で取得したプレーンオブジェクトを返すため、モデルの toJSON 設定が効かない。
 *       Mongoose モデルと依存サービスはモックする。
 */
import type { Request, Response } from "express";
import { beforeEach, describe, expect, test, vi } from "vitest";

const ids = vi.hoisted(() => ({
  themeId: "650000000000000000000001",
  questionId: "650000000000000000000002",
  problemId: "650000000000000000000010",
  solutionId: "650000000000000000000020",
  sourceThreadId: "650000000000000000000099",
}));

vi.mock("../models/SharpQuestion.js", () => ({
  default: {
    findById: vi.fn().mockResolvedValue({
      toObject: () => ({
        _id: ids.questionId,
        questionText: "評価への納得感を高めるにはどうすればよいだろうか？",
      }),
    }),
  },
}));
// 論点が属するテーマ。最小寄与人数 k は無効（関連する課題・解決策を返すテーマ）とする
vi.mock("../models/Theme.js", () => ({
  default: {
    findById: vi.fn(() => ({
      select: () => ({
        lean: vi
          .fn()
          .mockResolvedValue({ _id: ids.themeId, minContributors: null }),
      }),
    })),
  },
}));
vi.mock("../models/QuestionLink.js", () => ({
  default: {
    find: vi.fn().mockResolvedValue([
      {
        linkedItemType: "problem",
        linkedItemId: ids.problemId,
        relevanceScore: 0.9,
      },
      {
        linkedItemType: "solution",
        linkedItemId: ids.solutionId,
        relevanceScore: 0.8,
      },
    ]),
  },
}));
/** lean() でも select().lean() でも、抽出元のスレッドIDを含むプレーンオブジェクトを返すクエリ */
const leanQuery = (docs: unknown[]) => ({
  lean: vi.fn().mockResolvedValue(docs),
  select: () => ({ lean: vi.fn().mockResolvedValue(docs) }),
});
vi.mock("../models/Problem.js", () => ({
  default: {
    find: vi.fn(() =>
      leanQuery([
        {
          _id: ids.problemId,
          statement: "評価基準が不透明であることが課題です。",
          sourceOriginId: ids.sourceThreadId,
        },
      ])
    ),
  },
}));
vi.mock("../models/Solution.js", () => ({
  default: {
    find: vi.fn(() =>
      leanQuery([
        {
          _id: ids.solutionId,
          statement: "評価面談で根拠を書面で示します。",
          sourceOriginId: ids.sourceThreadId,
        },
      ])
    ),
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
vi.mock("../models/ChatThread.js", () => ({
  default: {
    distinct: vi.fn().mockResolvedValue(["uuid-営業部の佐藤さんの端末"]),
  },
}));
vi.mock("../services/debateAnalysisGenerator.js", () => ({
  getDebateAnalysis: vi.fn().mockResolvedValue(null),
}));
vi.mock("../services/questionVisualReportGenerator.js", () => ({
  getVisualReport: vi.fn().mockResolvedValue(null),
}));
vi.mock("../workers/debateAnalysisGenerator.js", () => ({
  generateDebateAnalysisTask: vi.fn(),
}));
vi.mock("../workers/digestGenerator.js", () => ({
  generateDigestDraft: vi.fn(),
}));
vi.mock("../workers/policyGenerator.js", () => ({
  generatePolicyDraft: vi.fn(),
}));
vi.mock("../workers/reportGenerator.js", () => ({
  generateReportExample: vi.fn(),
}));
vi.mock("../workers/visualReportGenerator.js", () => ({
  generateVisualReport: vi.fn(),
}));

import { getQuestionDetails } from "../controllers/questionController.js";

describe("getQuestionDetails の関連課題・解決策", () => {
  let body: Record<string, unknown>;

  beforeEach(async () => {
    const req = {
      params: { themeId: ids.themeId, questionId: ids.questionId },
    } as unknown as Request;
    const json = vi.fn();
    const res = { status: vi.fn(() => ({ json })) } as unknown as Response;

    await getQuestionDetails(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    body = json.mock.calls[0][0];
  });

  test("関連する課題の課題文は返るが、抽出元のスレッドIDは返らない", () => {
    const [problem] = body.relatedProblems as Record<string, unknown>[];

    expect(problem.statement).toBe("評価基準が不透明であることが課題です。");
    expect(problem).not.toHaveProperty("sourceOriginId");
  });

  test("関連する解決策の解決策文は返るが、抽出元のスレッドIDは返らない", () => {
    const [solution] = body.relatedSolutions as Record<string, unknown>[];

    expect(solution.statement).toBe("評価面談で根拠を書面で示します。");
    expect(solution).not.toHaveProperty("sourceOriginId");
  });

  test("レスポンス全体のどこにも抽出元のスレッドIDが含まれない", () => {
    expect(JSON.stringify(body)).not.toContain(ids.sourceThreadId);
  });
});
