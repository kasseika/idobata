/**
 * 生成物の保存前の原文混入検査のテスト（5つの生成処理）
 *
 * 目的: issue #146 の Phase 1 のうち、k が有効なテーマで、生成物に入力の課題文がほぼそのまま
 *       含まれていた場合に、各生成処理が生成物を保存しないことを検証する。
 *       対象: 政策ドラフト・ダイジェスト・レポート例・ビジュアルレポート・討論分析
 *       原文が含まれていたら書き直しを指示して再生成し、要約されれば保存することも確かめる。
 *       あわせて、要約した生成物は保存すること（検査が保存を検知できること）と、
 *       k が無効なテーマでは従来どおり保存することを確かめる。
 * 前提: Mongoose モデル・LLM 呼び出し・パイプライン設定はモックする。
 *       検査の詳細な規則（20字以上の一致など）は verbatimQuoteCheck.test.ts で検証済み。
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

const ids = vi.hoisted(() => ({
  trainingThemeId: "650000000000000000000001", // k=5 の研修テーマ
  openThemeId: "650000000000000000000002", // k が無効の一般テーマ
  questionId: "650000000000000000000101",
}));

/** 生成物のモデルのモック（new で作り、save の呼び出しを記録する） */
const saveSpies = vi.hoisted(() => ({
  PolicyDraft: vi.fn(),
  DigestDraft: vi.fn(),
  ReportExample: vi.fn(),
  QuestionVisualReport: vi.fn(),
  DebateAnalysis: vi.fn(),
}));
const createOutputModelMock = vi.hoisted(
  () => (saveSpy: ReturnType<typeof vi.fn>, latest: unknown) => {
    const Model = vi.fn(
      class {
        _id = "生成物ID";
        version = 1;
        save = saveSpy;
      }
    );
    // findOne(...).sort(...) と findOne(...).sort(...).limit(...) の両方に対応する
    const sorted = Object.assign(Promise.resolve(latest), {
      limit: () => Promise.resolve(latest),
    });
    return {
      default: Object.assign(Model, {
        findOne: vi.fn(() => ({ sort: () => sorted })),
      }),
    };
  }
);

vi.mock("../models/PolicyDraft.js", () =>
  // ダイジェストの生成は、最新の政策ドラフトを入力に使う
  createOutputModelMock(saveSpies.PolicyDraft, {
    _id: "政策ドラフトID",
    title: "業務の平準化に向けて",
    content: "特定の時期に業務が集中しているとの指摘がありました。",
  })
);
vi.mock("../models/DigestDraft.js", () =>
  createOutputModelMock(saveSpies.DigestDraft, null)
);
vi.mock("../models/ReportExample.js", () =>
  createOutputModelMock(saveSpies.ReportExample, null)
);
vi.mock("../models/QuestionVisualReport.js", () =>
  createOutputModelMock(saveSpies.QuestionVisualReport, null)
);
vi.mock("../models/DebateAnalysis.js", () =>
  createOutputModelMock(saveSpies.DebateAnalysis, null)
);
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
  default: { findById: vi.fn() },
}));
vi.mock("../models/QuestionLink.js", () => ({
  default: {
    find: vi.fn().mockResolvedValue([
      {
        linkedItemType: "problem",
        linkedItemId: "課題ID-1",
        relevanceScore: 0.9,
      },
    ]),
  },
}));
vi.mock("../models/Problem.js", () => ({
  default: {
    find: vi.fn().mockResolvedValue([
      {
        _id: "課題ID-1",
        statement:
          "経理部では月末の締め処理が集中し、毎月のように深夜まで残業が続いています。",
      },
    ]),
  },
}));
vi.mock("../models/Solution.js", () => ({
  default: { find: vi.fn().mockResolvedValue([]) },
}));
vi.mock("../services/llmService.js", () => ({ callLLM: vi.fn() }));
vi.mock("../services/pipelineConfigService.js", () => ({
  resolveStageConfig: vi.fn().mockResolvedValue({
    model: "openai/gpt-5.4-mini",
    prompt: "",
  }),
}));

import SharpQuestion from "../models/SharpQuestion.js";
import { generateDebateAnalysis } from "../services/debateAnalysisGenerator.js";
import { callLLM } from "../services/llmService.js";
import { generateQuestionVisualReport } from "../services/questionVisualReportGenerator.js";
import { generateDigestDraft } from "../workers/digestGenerator.js";
import { generatePolicyDraft } from "../workers/policyGenerator.js";
import { generateReportExample } from "../workers/reportGenerator.js";

/** 課題文の一部（20字以上）をそのまま含む文 */
const QUOTING_TEXT =
  "参加者からは「月末の締め処理が集中し、毎月のように深夜まで残業」という声がありました。";
/** 課題文を要約した文 */
const SUMMARIZED_TEXT = "特定の時期に業務が集中しているとの指摘がありました。";

/**
 * 各生成処理と、LLM が返す出力の形
 *
 * 注意: ビジュアルレポートと討論分析の生成は、失敗を呼び出し元に例外で伝える。
 *       政策ドラフト・ダイジェスト・レポート例の生成は、失敗を記録して終わる。
 */
const generators = [
  {
    name: "政策ドラフト",
    run: () => generatePolicyDraft(ids.questionId),
    saveSpy: saveSpies.PolicyDraft,
    llmOutput: (text: string) => ({
      title: "業務の平準化に向けて",
      content: text,
    }),
    throwsOnFailure: false,
  },
  {
    name: "ダイジェスト",
    run: () => generateDigestDraft(ids.questionId),
    saveSpy: saveSpies.DigestDraft,
    llmOutput: (text: string) => ({ title: "業務の平準化", content: text }),
    throwsOnFailure: false,
  },
  {
    name: "レポート例",
    run: () => generateReportExample(ids.questionId),
    saveSpy: saveSpies.ReportExample,
    llmOutput: (text: string) => ({
      introduction: "研修で寄せられた意見をまとめました。",
      issues: [{ title: "業務の偏り", description: text }],
    }),
    throwsOnFailure: false,
  },
  {
    name: "ビジュアルレポート",
    run: () => generateQuestionVisualReport(ids.questionId),
    saveSpy: saveSpies.QuestionVisualReport,
    llmOutput: (text: string) => `<section><p>${text}</p></section>`,
    throwsOnFailure: true,
  },
  {
    name: "討論分析",
    run: () => generateDebateAnalysis(ids.questionId),
    saveSpy: saveSpies.DebateAnalysis,
    llmOutput: (text: string) => ({
      axes: [
        { title: "業務量", options: [{ label: "現状", description: text }] },
      ],
      agreementPoints: ["業務の平準化が必要"],
      disagreementPoints: [],
    }),
    throwsOnFailure: true,
  },
];

/** 論点が属するテーマを切り替える */
const setQuestionTheme = (themeId: string) => {
  (SharpQuestion.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
    _id: ids.questionId,
    themeId,
    questionText: "業務の偏りをどう解消するか？",
  });
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe.each(generators)("$name の生成", (generator) => {
  test("k が有効なテーマで、何度生成しても課題文がほぼそのまま含まれていれば保存しないこと", async () => {
    setQuestionTheme(ids.trainingThemeId);
    (callLLM as ReturnType<typeof vi.fn>).mockResolvedValue(
      generator.llmOutput(QUOTING_TEXT)
    );

    if (generator.throwsOnFailure) {
      await expect(generator.run()).rejects.toThrow("保存しませんでした");
    } else {
      await generator.run();
    }

    // 最初の生成と、書き直しの再生成2回
    expect(callLLM).toHaveBeenCalledTimes(3);
    expect(generator.saveSpy).not.toHaveBeenCalled();
  });

  test("k が有効なテーマで、課題文が含まれていても、再生成で要約されれば保存すること", async () => {
    setQuestionTheme(ids.trainingThemeId);
    (callLLM as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(generator.llmOutput(QUOTING_TEXT))
      .mockResolvedValueOnce(generator.llmOutput(SUMMARIZED_TEXT));

    await generator.run();

    expect(callLLM).toHaveBeenCalledTimes(2);
    expect(generator.saveSpy).toHaveBeenCalledTimes(1);
  });

  test("k が有効なテーマで、生成物が要約した表現なら保存すること", async () => {
    setQuestionTheme(ids.trainingThemeId);
    (callLLM as ReturnType<typeof vi.fn>).mockResolvedValue(
      generator.llmOutput(SUMMARIZED_TEXT)
    );

    await generator.run();

    expect(generator.saveSpy).toHaveBeenCalledTimes(1);
  });

  test("k が無効なテーマでは、課題文が含まれていても従来どおり保存すること", async () => {
    setQuestionTheme(ids.openThemeId);
    (callLLM as ReturnType<typeof vi.fn>).mockResolvedValue(
      generator.llmOutput(QUOTING_TEXT)
    );

    await generator.run();

    expect(callLLM).toHaveBeenCalledTimes(1);
    expect(generator.saveSpy).toHaveBeenCalledTimes(1);
  });
});
