/**
 * 生成処理のプロンプトに入れる「引用しない指示」のテスト
 *
 * 目的: issue #146 の追加実験で、k が有効なテーマでもレポート例の多くが課題文をそのまま写し、
 *       原文の混入検査で保存されないことが分かった（政策ドラフト以外には引用しない指示がなかった）。
 *       そこで、k が有効なテーマでは、レポート例・ダイジェスト・ビジュアルレポート・討論分析の
 *       プロンプトにも引用しない指示を入れることを検証する。
 *       - k が有効なテーマでは、指示を入れる
 *       - テーマが見つからない場合も、k を確かめられないため指示を入れる（隠す側に倒す）
 *       - k が無効なテーマでは、従来どおり指示を入れない
 * 前提: Mongoose モデル・LLM 呼び出し・パイプライン設定はモックする。
 *       政策ドラフトの指示は minContributorsPolicyAndDigest.test.ts で検証済み。
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

const ids = vi.hoisted(() => ({
  trainingThemeId: "650000000000000000000001", // k=5 の研修テーマ
  openThemeId: "650000000000000000000002", // k が無効の一般テーマ
  missingThemeId: "650000000000000000000009", // 見つからないテーマ
  questionId: "650000000000000000000101",
}));

/** 生成物のモデルのモック（new で作れ、最新の1件を findOne(...).sort(...) で返す） */
const createOutputModelMock = vi.hoisted(() => (latest: unknown) => {
  const Model = vi.fn(
    class {
      _id = "生成物ID";
      version = 1;
      save = vi.fn().mockResolvedValue(undefined);
    }
  );
  const sorted = Object.assign(Promise.resolve(latest), {
    limit: () => Promise.resolve(latest),
  });
  return {
    default: Object.assign(Model, {
      findOne: vi.fn(() => ({ sort: () => sorted })),
    }),
  };
});

vi.mock("../models/PolicyDraft.js", () =>
  // ダイジェストの生成は、最新の政策ドラフトを入力に使う
  createOutputModelMock({
    _id: "政策ドラフトID",
    title: "業務の平準化に向けて",
    content: "特定の時期に業務が集中しているとの指摘がありました。",
  })
);
vi.mock("../models/DigestDraft.js", () => createOutputModelMock(null));
vi.mock("../models/ReportExample.js", () => createOutputModelMock(null));
vi.mock("../models/QuestionVisualReport.js", () => createOutputModelMock(null));
vi.mock("../models/DebateAnalysis.js", () => createOutputModelMock(null));
vi.mock("../models/Theme.js", () => ({
  default: {
    findById: vi.fn((themeId: string) => ({
      select: () => ({
        lean: vi.fn().mockResolvedValue(
          themeId === ids.missingThemeId
            ? null
            : {
                _id: themeId,
                minContributors: themeId === ids.trainingThemeId ? 5 : null,
              }
        ),
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
import { generateReportExample } from "../workers/reportGenerator.js";

/** 引用しない指示に含まれる文言 */
const NO_QUOTE_PHRASE = "個々の意見は引用せず";

/** LLM が返す、要約した（原文を含まない）出力 */
const SUMMARIZED_TEXT = "特定の時期に業務が集中しているとの指摘がありました。";

const generators = [
  {
    name: "レポート例",
    run: () => generateReportExample(ids.questionId),
    llmOutput: {
      introduction: "研修で寄せられた意見をまとめました。",
      issues: [{ title: "業務の偏り", description: SUMMARIZED_TEXT }],
    },
  },
  {
    name: "ダイジェスト",
    run: () => generateDigestDraft(ids.questionId),
    llmOutput: { title: "業務の平準化", content: SUMMARIZED_TEXT },
  },
  {
    name: "ビジュアルレポート",
    run: () => generateQuestionVisualReport(ids.questionId),
    llmOutput: `<section><p>${SUMMARIZED_TEXT}</p></section>`,
  },
  {
    name: "討論分析",
    run: () => generateDebateAnalysis(ids.questionId),
    llmOutput: {
      axes: [
        {
          title: "業務量",
          options: [{ label: "現状", description: SUMMARIZED_TEXT }],
        },
      ],
      agreementPoints: ["業務の平準化が必要"],
      disagreementPoints: [],
    },
  },
];

/** 論点が属するテーマを切り替えて生成し、LLM に渡したプロンプト（全メッセージ）を返す */
const generateAndGetPrompt = async (
  generator: (typeof generators)[number],
  themeId: string
) => {
  (SharpQuestion.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
    _id: ids.questionId,
    themeId,
    questionText: "業務の偏りをどう解消するか？",
  });
  (callLLM as ReturnType<typeof vi.fn>).mockResolvedValue(generator.llmOutput);

  await generator.run();

  const messages: { content: string }[] = (callLLM as ReturnType<typeof vi.fn>)
    .mock.calls[0][0];
  return messages.map((m) => m.content).join("\n");
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe.each(generators)("$name のプロンプト", (generator) => {
  test("k が有効なテーマでは、引用しないよう指示すること", async () => {
    const prompt = await generateAndGetPrompt(generator, ids.trainingThemeId);

    expect(prompt).toContain(NO_QUOTE_PHRASE);
  });

  test("テーマが見つからない場合も、引用しないよう指示すること", async () => {
    const prompt = await generateAndGetPrompt(generator, ids.missingThemeId);

    expect(prompt).toContain(NO_QUOTE_PHRASE);
  });

  test("k が無効なテーマでは、従来どおり引用しない指示を入れないこと", async () => {
    const prompt = await generateAndGetPrompt(generator, ids.openThemeId);

    expect(prompt).not.toContain(NO_QUOTE_PHRASE);
  });
});
