/**
 * 生成物への原文の混入検査（verbatimQuoteCheck）のテスト
 *
 * 目的: issue #146 の Phase 1 のうち、k が有効なテーマで、生成物（政策ドラフト・レポート等）に
 *       入力の課題文・解決策文がほぼそのまま含まれていたら、保存させないことを検証する。
 *       テーマ単位でプロンプトを上書きできるため、プロンプトの指示（引用しない）だけには頼らない。
 * 仕様: - 課題文・解決策文の連続した 20 字以上が、生成物にそのまま現れたら「原文が含まれる」とする
 *       - 比較の前に、全角・半角の違い（NFKC）・空白・HTML タグを取り除く
 *       - k が無効なテーマでは検査しない。テーマが見つからない場合は検査する（隠す側に倒す）
 *       - 原文が含まれていたら、前の出力と書き直しの指示を渡して再生成する（最大3回まで生成する）
 *       - エラーのメッセージには件数だけを入れ、原文は含めない（ログに残さないため）
 * 前提: Theme モデルはモックする。
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("../models/Theme.js", () => ({ default: { findById: vi.fn() } }));

import Theme from "../models/Theme.js";
import {
  VerbatimQuoteError,
  findVerbatimQuotes,
  generateWithoutVerbatimQuotes,
} from "../services/verbatimQuoteCheck.js";

/** 参加者の課題文（37字） */
const problemStatement =
  "経理部では月末の締め処理が集中し、毎月のように深夜まで残業が続いています。";

/** テーマのモック（k の有無を切り替える） */
const mockTheme = (theme: { minContributors: number | null } | null) => {
  (Theme.findById as ReturnType<typeof vi.fn>).mockReturnValue({
    select: () => ({ lean: vi.fn().mockResolvedValue(theme) }),
  });
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("findVerbatimQuotes", () => {
  test("課題文の連続した20字が生成物に含まれていれば、その課題文を返すこと", () => {
    // 前提: 「月末の締め処理が集中し、毎月のように深夜まで残業」（24字）がそのまま入っている
    const output =
      "参加者からは「月末の締め処理が集中し、毎月のように深夜まで残業」という声がありました。";

    expect(findVerbatimQuotes([output], [problemStatement])).toEqual([
      problemStatement,
    ]);
  });

  test("一致する部分が19字までなら、含まれていないとすること", () => {
    // 前提: 「末の締め処理が集中し、毎月のように深夜」（19字）までしか一致しない
    const output =
      "末の締め処理が集中し、毎月のように深夜に及ぶ業務の偏りが指摘されました。";

    expect(findVerbatimQuotes([output], [problemStatement])).toEqual([]);
  });

  test("要約した表現なら、含まれていないとすること", () => {
    const output =
      "一部の部署で、特定の時期に業務が集中し、長時間労働につながっているとの指摘がありました。";

    expect(findVerbatimQuotes([output], [problemStatement])).toEqual([]);
  });

  test("空白や全角・半角の違いがあっても、原文として検出すること", () => {
    const statement =
      "評価面談では基準の説明が10分程度しかなく、納得できないまま終わります。";
    const output =
      "評価面談では 基準の説明が１０分程度しかなく、納得できないまま終わる、との意見です。";

    expect(findVerbatimQuotes([output], [statement])).toEqual([statement]);
  });

  test("HTML のタグで区切られていても、原文として検出すること", () => {
    const output =
      "<p>月末の締め処理が<strong>集中し、毎月のように深夜まで</strong>残業が続く</p>";

    expect(findVerbatimQuotes([output], [problemStatement])).toEqual([
      problemStatement,
    ]);
  });

  test("複数の生成物の文字列のどれかに含まれていれば検出すること", () => {
    expect(
      findVerbatimQuotes(
        ["タイトル: 業務の平準化", `本文: ${problemStatement}`],
        [problemStatement, "解決策は特にありません。"]
      )
    ).toEqual([problemStatement]);
  });
});

describe("generateWithoutVerbatimQuotes", () => {
  const quotingOutput = { title: "業務の平準化", content: problemStatement };
  const summarizedOutput = {
    title: "業務の平準化",
    content: "特定の時期に業務が集中しているとの指摘がありました。",
  };
  const baseMessages = [
    { role: "system" as const, content: "意見をまとめてください。" },
    { role: "user" as const, content: `課題: ${problemStatement}` },
  ];

  /** 指定した順に出力を返す生成関数（渡されたメッセージを記録する） */
  const createGenerate = (...outputs: unknown[]) => {
    const generate = vi.fn();
    for (const output of outputs) {
      generate.mockResolvedValueOnce(output);
    }
    return generate;
  };

  test("k が有効なテーマで原文が含まれていなければ、1回で生成物を返すこと", async () => {
    mockTheme({ minContributors: 5 });
    const generate = createGenerate(summarizedOutput);

    await expect(
      generateWithoutVerbatimQuotes({
        themeId: "650000000000000000000001",
        statements: [problemStatement],
        messages: baseMessages,
        generate,
      })
    ).resolves.toEqual(summarizedOutput);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  test("k が有効なテーマで原文が含まれていれば、書き直しを指示して再生成すること", async () => {
    mockTheme({ minContributors: 5 });
    const generate = createGenerate(quotingOutput, summarizedOutput);

    await expect(
      generateWithoutVerbatimQuotes({
        themeId: "650000000000000000000001",
        statements: [problemStatement],
        messages: baseMessages,
        generate,
      })
    ).resolves.toEqual(summarizedOutput);

    expect(generate).toHaveBeenCalledTimes(2);
    // 2回目は、元のメッセージに続けて、前の出力と書き直しの指示を渡す
    const retryMessages = generate.mock.calls[1][0];
    expect(retryMessages.slice(0, 2)).toEqual(baseMessages);
    expect(retryMessages[2]).toEqual({
      role: "assistant",
      content: JSON.stringify(quotingOutput),
    });
    expect(retryMessages[3].role).toBe("user");
    expect(retryMessages[3].content).toContain("書き直し");
    // どの意見の言い回しを写したかを伝える
    expect(retryMessages[3].content).toContain(problemStatement);
  });

  test("文字列の生成物は、そのまま前の出力として渡すこと", async () => {
    mockTheme({ minContributors: 5 });
    const quotingHtml = `<p>${problemStatement}</p>`;
    const generate = createGenerate(quotingHtml, "<p>要約しました。</p>");

    await generateWithoutVerbatimQuotes({
      themeId: "650000000000000000000001",
      statements: [problemStatement],
      messages: baseMessages,
      generate,
    });

    expect(generate.mock.calls[1][0][2]).toEqual({
      role: "assistant",
      content: quotingHtml,
    });
  });

  test("3回生成しても原文が含まれていれば、VerbatimQuoteError を投げること", async () => {
    mockTheme({ minContributors: 5 });
    const generate = vi.fn().mockResolvedValue(quotingOutput);

    await expect(
      generateWithoutVerbatimQuotes({
        themeId: "650000000000000000000001",
        statements: [problemStatement],
        messages: baseMessages,
        generate,
      })
    ).rejects.toBeInstanceOf(VerbatimQuoteError);
    expect(generate).toHaveBeenCalledTimes(3);
  });

  test("エラーのメッセージに原文を含めないこと", async () => {
    mockTheme({ minContributors: 5 });

    const error = await generateWithoutVerbatimQuotes({
      themeId: "650000000000000000000001",
      statements: [problemStatement],
      messages: baseMessages,
      generate: vi.fn().mockResolvedValue(quotingOutput),
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(VerbatimQuoteError);
    expect(String((error as Error).message)).not.toContain("月末の締め処理");
  });

  test("ネストした生成物（配列・オブジェクト）の中の文字列も検査すること", async () => {
    mockTheme({ minContributors: 5 });
    const generate = createGenerate(
      {
        axes: [
          { title: "業務量", options: [{ description: problemStatement }] },
        ],
      },
      summarizedOutput
    );

    await generateWithoutVerbatimQuotes({
      themeId: "650000000000000000000001",
      statements: [problemStatement],
      messages: baseMessages,
      generate,
    });

    expect(generate).toHaveBeenCalledTimes(2);
  });

  test("k が無効なテーマでは、原文が含まれていても検査せず1回で返すこと", async () => {
    mockTheme({ minContributors: null });
    const generate = createGenerate(quotingOutput);

    await expect(
      generateWithoutVerbatimQuotes({
        themeId: "650000000000000000000002",
        statements: [problemStatement],
        messages: baseMessages,
        generate,
      })
    ).resolves.toEqual(quotingOutput);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  test("テーマが見つからない場合は検査し、原文が含まれていれば再生成すること", async () => {
    mockTheme(null);
    const generate = createGenerate(quotingOutput, summarizedOutput);

    await expect(
      generateWithoutVerbatimQuotes({
        themeId: "650000000000000000000009",
        statements: [problemStatement],
        messages: baseMessages,
        generate,
      })
    ).resolves.toEqual(summarizedOutput);
    expect(generate).toHaveBeenCalledTimes(2);
  });
});
