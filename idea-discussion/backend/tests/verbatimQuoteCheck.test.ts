/**
 * 生成物への原文の混入検査（verbatimQuoteCheck）のテスト
 *
 * 目的: issue #146 の Phase 1 のうち、k が有効なテーマで、生成物（政策ドラフト・レポート等）に
 *       入力の課題文・解決策文がほぼそのまま含まれていたら、保存させないことを検証する。
 *       テーマ単位でプロンプトを上書きできるため、プロンプトの指示（引用しない）だけには頼らない。
 * 仕様: - 課題文・解決策文の連続した 20 字以上が、生成物にそのまま現れたら「原文が含まれる」とする
 *       - 比較の前に、全角・半角の違い（NFKC）・空白・HTML タグを取り除く
 *       - k が無効なテーマでは検査しない。テーマが見つからない場合は検査する（隠す側に倒す）
 *       - エラーのメッセージには件数だけを入れ、原文は含めない（ログに残さないため）
 * 前提: Theme モデルはモックする。
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("../models/Theme.js", () => ({ default: { findById: vi.fn() } }));

import Theme from "../models/Theme.js";
import {
  VerbatimQuoteError,
  assertNoVerbatimQuotes,
  findVerbatimQuotes,
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

describe("assertNoVerbatimQuotes", () => {
  const quotingOutput = { title: "業務の平準化", content: problemStatement };
  const summarizedOutput = {
    title: "業務の平準化",
    content: "特定の時期に業務が集中しているとの指摘がありました。",
  };

  test("k が有効なテーマで原文が含まれていれば、VerbatimQuoteError を投げること", async () => {
    mockTheme({ minContributors: 5 });

    await expect(
      assertNoVerbatimQuotes({
        themeId: "650000000000000000000001",
        output: quotingOutput,
        statements: [problemStatement],
      })
    ).rejects.toBeInstanceOf(VerbatimQuoteError);
  });

  test("エラーのメッセージに原文を含めないこと", async () => {
    mockTheme({ minContributors: 5 });

    const error = await assertNoVerbatimQuotes({
      themeId: "650000000000000000000001",
      output: quotingOutput,
      statements: [problemStatement],
    }).catch((e: unknown) => e);

    expect(String((error as Error).message)).not.toContain("月末の締め処理");
  });

  test("k が有効なテーマで原文が含まれていなければ、エラーにしないこと", async () => {
    mockTheme({ minContributors: 5 });

    await expect(
      assertNoVerbatimQuotes({
        themeId: "650000000000000000000001",
        output: summarizedOutput,
        statements: [problemStatement],
      })
    ).resolves.toBeUndefined();
  });

  test("ネストした生成物（配列・オブジェクト）の中の文字列も検査すること", async () => {
    mockTheme({ minContributors: 5 });

    await expect(
      assertNoVerbatimQuotes({
        themeId: "650000000000000000000001",
        output: {
          axes: [
            { title: "業務量", options: [{ description: problemStatement }] },
          ],
        },
        statements: [problemStatement],
      })
    ).rejects.toBeInstanceOf(VerbatimQuoteError);
  });

  test("k が無効なテーマでは、原文が含まれていても検査しないこと", async () => {
    mockTheme({ minContributors: null });

    await expect(
      assertNoVerbatimQuotes({
        themeId: "650000000000000000000002",
        output: quotingOutput,
        statements: [problemStatement],
      })
    ).resolves.toBeUndefined();
  });

  test("テーマが見つからない場合は、検査して原文が含まれていればエラーにすること", async () => {
    mockTheme(null);

    await expect(
      assertNoVerbatimQuotes({
        themeId: "650000000000000000000009",
        output: quotingOutput,
        statements: [problemStatement],
      })
    ).rejects.toBeInstanceOf(VerbatimQuoteError);
  });
});
