/**
 * 最小寄与人数サービス（minContributorsService）のユニットテスト
 *
 * 目的: issue #146 の「k 人以上が寄与した重要論点だけを表示する」判定を検証する。
 *       - 寄与人数は、論点にリンクされた課題・解決策の抽出元スレッドの、異なる userId の数で数える
 *       - relevanceScore が閾値（0.8）未満のリンクは数えない（緩い関連づけによる水増しを防ぐ）
 *       - チャット以外（インポート等）から抽出された課題は、書き手が分からないため数えない
 *       - k が無効なテーマの論点は、従来どおりすべて表示する
 * 前提: Mongoose モデルはモックする。モックはクエリの条件に関係なく、与えたデータを返す。
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("../models/Theme.js", () => ({ default: { find: vi.fn() } }));
vi.mock("../models/QuestionLink.js", () => ({ default: { find: vi.fn() } }));
vi.mock("../models/Problem.js", () => ({ default: { find: vi.fn() } }));
vi.mock("../models/Solution.js", () => ({ default: { find: vi.fn() } }));
vi.mock("../models/ChatThread.js", () => ({ default: { find: vi.fn() } }));

import ChatThread from "../models/ChatThread.js";
import Problem from "../models/Problem.js";
import QuestionLink from "../models/QuestionLink.js";
import Solution from "../models/Solution.js";
import Theme from "../models/Theme.js";
import {
  hidesIndividualOpinions,
  selectVisibleQuestions,
} from "../services/minContributorsService.js";

/** find(...).select(...).lean() と find(...).lean() の両方に対応するクエリのモック */
const mockFindResult = (model: { find: unknown }, docs: unknown[]) => {
  const lean = vi.fn().mockResolvedValue(docs);
  (model.find as ReturnType<typeof vi.fn>).mockReturnValue({
    lean,
    select: () => ({ lean }),
  });
};

const TRAINING_THEME_ID = "650000000000000000000001"; // k=5 の研修テーマ
const OPEN_THEME_ID = "650000000000000000000002"; // k が無効の一般テーマ

const evaluationQuestion = {
  _id: "650000000000000000000101",
  themeId: TRAINING_THEME_ID,
  questionText: "評価への納得感を高めるにはどうすればよいだろうか？",
};

/**
 * 研修テーマの論点に、指定した参加者たちの課題をリンクしたデータを用意する
 *
 * @param userIds - 課題を書いた参加者の userId（1人1件の課題・1スレッドとする）
 * @param relevanceScore - リンクの関連度スコア
 */
const setUpLinkedProblems = (userIds: string[], relevanceScore = 0.9) => {
  mockFindResult(
    QuestionLink,
    userIds.map((_, i) => ({
      questionId: evaluationQuestion._id,
      linkedItemId: `problem-${i}`,
      linkedItemType: "problem",
      relevanceScore,
    }))
  );
  mockFindResult(
    Problem,
    userIds.map((_, i) => ({
      _id: `problem-${i}`,
      sourceOriginId: `thread-${i}`,
      sourceType: "chat",
    }))
  );
  mockFindResult(Solution, []);
  mockFindResult(
    ChatThread,
    userIds.map((userId, i) => ({ _id: `thread-${i}`, userId }))
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  mockFindResult(Theme, [
    { _id: TRAINING_THEME_ID, minContributors: 5 },
    { _id: OPEN_THEME_ID, minContributors: null },
  ]);
});

describe("hidesIndividualOpinions", () => {
  test("k が設定されたテーマでは、個々の意見を隠すこと", () => {
    expect(hidesIndividualOpinions({ minContributors: 5 })).toBe(true);
  });

  test("k が null のテーマでは、個々の意見を隠さないこと", () => {
    expect(hidesIndividualOpinions({ minContributors: null })).toBe(false);
  });

  test("k のフィールドがない既存のテーマでは、個々の意見を隠さないこと", () => {
    expect(hidesIndividualOpinions({})).toBe(false);
  });
});

describe("selectVisibleQuestions", () => {
  test("5人が寄与した論点は、k=5 のテーマで表示されること", async () => {
    setUpLinkedProblems(["佐藤", "鈴木", "高橋", "田中", "伊藤"]);

    const result = await selectVisibleQuestions([evaluationQuestion]);

    expect(result.visibleQuestions).toEqual([evaluationQuestion]);
    expect(result.hiddenCount).toBe(0);
  });

  test("4人しか寄与していない論点は、k=5 のテーマで非表示になり、件数に数えられること", async () => {
    setUpLinkedProblems(["佐藤", "鈴木", "高橋", "田中"]);

    const result = await selectVisibleQuestions([evaluationQuestion]);

    expect(result.visibleQuestions).toEqual([]);
    expect(result.hiddenCount).toBe(1);
  });

  test("同じ参加者の課題が複数リンクされていても、1人として数えること", async () => {
    // 前提: 佐藤さんが別々のスレッドで2件書いており、寄与者は4人
    setUpLinkedProblems(["佐藤", "佐藤", "鈴木", "高橋", "田中"]);

    const result = await selectVisibleQuestions([evaluationQuestion]);

    expect(result.hiddenCount).toBe(1);
  });

  test("relevanceScore が 0.8 未満のリンクは寄与に数えないこと", async () => {
    // 前提: 5人分のリンクがあるが、いずれも緩い関連づけ（0.79）
    setUpLinkedProblems(["佐藤", "鈴木", "高橋", "田中", "伊藤"], 0.79);

    const result = await selectVisibleQuestions([evaluationQuestion]);

    expect(result.hiddenCount).toBe(1);
  });

  test("relevanceScore がちょうど 0.8 のリンクは寄与に数えること", async () => {
    setUpLinkedProblems(["佐藤", "鈴木", "高橋", "田中", "伊藤"], 0.8);

    const result = await selectVisibleQuestions([evaluationQuestion]);

    expect(result.hiddenCount).toBe(0);
  });

  test("relevanceScore がないリンクは寄与に数えないこと", async () => {
    mockFindResult(
      QuestionLink,
      ["佐藤", "鈴木", "高橋", "田中", "伊藤"].map((_, i) => ({
        questionId: evaluationQuestion._id,
        linkedItemId: `problem-${i}`,
        linkedItemType: "problem",
      }))
    );
    mockFindResult(
      Problem,
      [0, 1, 2, 3, 4].map((i) => ({
        _id: `problem-${i}`,
        sourceOriginId: `thread-${i}`,
        sourceType: "chat",
      }))
    );
    mockFindResult(Solution, []);
    mockFindResult(
      ChatThread,
      ["佐藤", "鈴木", "高橋", "田中", "伊藤"].map((userId, i) => ({
        _id: `thread-${i}`,
        userId,
      }))
    );

    const result = await selectVisibleQuestions([evaluationQuestion]);

    expect(result.hiddenCount).toBe(1);
  });

  test("課題と解決策の両方の寄与者を合わせて数えること", async () => {
    // 前提: 課題を書いた3人と、解決策を書いた別の2人で、合計5人
    mockFindResult(QuestionLink, [
      ...[0, 1, 2].map((i) => ({
        questionId: evaluationQuestion._id,
        linkedItemId: `problem-${i}`,
        linkedItemType: "problem",
        relevanceScore: 0.9,
      })),
      ...[3, 4].map((i) => ({
        questionId: evaluationQuestion._id,
        linkedItemId: `solution-${i}`,
        linkedItemType: "solution",
        relevanceScore: 0.9,
      })),
    ]);
    mockFindResult(
      Problem,
      [0, 1, 2].map((i) => ({
        _id: `problem-${i}`,
        sourceOriginId: `thread-${i}`,
        sourceType: "chat",
      }))
    );
    mockFindResult(
      Solution,
      [3, 4].map((i) => ({
        _id: `solution-${i}`,
        sourceOriginId: `thread-${i}`,
        sourceType: "chat",
      }))
    );
    mockFindResult(
      ChatThread,
      ["佐藤", "鈴木", "高橋", "田中", "伊藤"].map((userId, i) => ({
        _id: `thread-${i}`,
        userId,
      }))
    );

    const result = await selectVisibleQuestions([evaluationQuestion]);

    expect(result.hiddenCount).toBe(0);
  });

  test("チャット以外（インポート）から抽出された課題は、寄与に数えないこと", async () => {
    // 前提: 5件のうち1件はインポートした意見で、書き手が分からない
    mockFindResult(
      QuestionLink,
      [0, 1, 2, 3, 4].map((i) => ({
        questionId: evaluationQuestion._id,
        linkedItemId: `problem-${i}`,
        linkedItemType: "problem",
        relevanceScore: 0.9,
      }))
    );
    mockFindResult(Problem, [
      ...[0, 1, 2, 3].map((i) => ({
        _id: `problem-${i}`,
        sourceOriginId: `thread-${i}`,
        sourceType: "chat",
      })),
      {
        _id: "problem-4",
        sourceOriginId: "imported-item-1",
        sourceType: "tweet",
      },
    ]);
    mockFindResult(Solution, []);
    mockFindResult(
      ChatThread,
      ["佐藤", "鈴木", "高橋", "田中"].map((userId, i) => ({
        _id: `thread-${i}`,
        userId,
      }))
    );

    const result = await selectVisibleQuestions([evaluationQuestion]);

    expect(result.hiddenCount).toBe(1);
  });

  test("k が無効なテーマの論点は、寄与者が1人でも表示されること", async () => {
    const openQuestion = {
      _id: "650000000000000000000201",
      themeId: OPEN_THEME_ID,
      questionText: "避難所の運営をどう改善するか？",
    };
    setUpLinkedProblems(["佐藤"]);

    const result = await selectVisibleQuestions([openQuestion]);

    expect(result.visibleQuestions).toEqual([openQuestion]);
    expect(result.hiddenCount).toBe(0);
  });

  test("複数テーマの論点が混ざっていても、テーマごとの k で判定し、元の順序を保つこと", async () => {
    const openQuestion = {
      _id: "650000000000000000000201",
      themeId: OPEN_THEME_ID,
      questionText: "避難所の運営をどう改善するか？",
    };
    // 前提: 研修テーマの論点には4人しか寄与していない
    setUpLinkedProblems(["佐藤", "鈴木", "高橋", "田中"]);

    const result = await selectVisibleQuestions([
      evaluationQuestion,
      openQuestion,
    ]);

    expect(result.visibleQuestions).toEqual([openQuestion]);
    expect(result.hiddenCount).toBe(1);
  });

  test("論点が0件なら、DB を参照せずに空の結果を返すこと", async () => {
    const result = await selectVisibleQuestions([]);

    expect(result).toEqual({ visibleQuestions: [], hiddenCount: 0 });
    expect(Theme.find).not.toHaveBeenCalled();
  });
});
