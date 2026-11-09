/**
 * 最小寄与人数（k）による表示判定サービス
 *
 * 目的: 少人数の研修で書き手を推定されないように、k が有効なテーマでは
 *       k 人以上が寄与した重要論点だけを表示する（issue #146）。その判定を1か所にまとめる。
 * 仕様:
 *   - k が有効なテーマでは、個々の課題文・解決策文を寄与人数に関係なく常に隠す（第1層）
 *   - 重要論点は、寄与人数が k 以上のものだけを表示する（第2層）
 *   - 寄与人数は、論点にリンクされた課題・解決策の抽出元スレッドの、異なる userId の数とする
 *   - relevanceScore が CONTRIBUTION_MIN_RELEVANCE_SCORE 未満、またはスコアのないリンクは数えない
 *     （linkingWorker は閾値なしでリンクを保存するため、緩い関連づけで寄与人数が水増しされるのを防ぐ）
 *   - チャット以外（インポート等）から抽出された課題・解決策と、userId が空のスレッドは、
 *     書き手が分からないため数えない（数えない側に倒すことで、判定は常に「隠す」方向にだけ誤る）
 *   - 表示する重要論点からも、個々の課題の ID を持つフィールド（clusteringResults・sourceProblemIds）を除く
 * 制約: 同じ人が複数の userId（端末・ブラウザ）で参加した場合は、別人として数えてしまう。
 * 注意: 寄与人数はリンクの追加で増えるため、保存せずに呼び出しのたびに計算する。
 */
import ChatThread from "../models/ChatThread.js";
import Problem from "../models/Problem.js";
import QuestionLink from "../models/QuestionLink.js";
import Solution from "../models/Solution.js";
import Theme from "../models/Theme.js";
import type { ITheme } from "../types/index.js";

/** 寄与人数に数えるリンクの relevanceScore の下限（チャットの参考意見の閾値と同じ値） */
const CONTRIBUTION_MIN_RELEVANCE_SCORE = 0.8;

/** 課題・解決策のうち、チャットから抽出されたことを表す sourceType */
const CHAT_SOURCE_TYPE = "chat";

/**
 * テーマで個々の意見（課題文・解決策文）を隠すかを判定する
 *
 * @param theme - minContributors を持つテーマ。フィールドがない既存のテーマは k 無効として扱う
 * @returns k が有効なら true
 */
export const hidesIndividualOpinions = (
  theme: Partial<Pick<ITheme, "minContributors">>
): boolean =>
  theme.minContributors !== null && theme.minContributors !== undefined;

/** 重要論点のうち、個々の課題の ID を持つフィールド */
type ProblemReferenceField = "clusteringResults" | "sourceProblemIds";

/**
 * 重要論点から、個々の課題の ID を持つフィールドを除く
 *
 * @param question - 重要論点のプレーンオブジェクト（toObject() の結果など）
 * @returns clusteringResults と sourceProblemIds を除いた新しいオブジェクト
 * 注意: k が有効なテーマの論点を返すときに使う。
 */
export const omitProblemReferences = <TQuestion extends object>(
  question: TQuestion
): Omit<TQuestion, ProblemReferenceField> => {
  const {
    clusteringResults: _clusteringResults,
    sourceProblemIds: _sourceProblemIds,
    ...rest
  } = question as TQuestion & Partial<Record<ProblemReferenceField, unknown>>;
  return rest;
};

/**
 * 重要論点ごとの寄与人数を数える
 *
 * @param questionIds - 対象の重要論点の ID
 * @returns 論点 ID（文字列）→ 寄与人数。寄与者がいない論点はエントリを持たない
 */
const countContributorsByQuestion = async (
  questionIds: string[]
): Promise<Map<string, number>> => {
  const links = await QuestionLink.find({
    questionId: { $in: questionIds },
  }).lean();
  // スコアの閾値はクエリではなくここで判定する（スコアのないリンクを確実に除くため）
  const countedLinks = links.filter(
    (link) =>
      typeof link.relevanceScore === "number" &&
      link.relevanceScore >= CONTRIBUTION_MIN_RELEVANCE_SCORE
  );

  const problemIds = countedLinks
    .filter((link) => link.linkedItemType === "problem")
    .map((link) => link.linkedItemId);
  const solutionIds = countedLinks
    .filter((link) => link.linkedItemType === "solution")
    .map((link) => link.linkedItemId);

  const [problems, solutions] = await Promise.all([
    Problem.find({ _id: { $in: problemIds } })
      .select("sourceOriginId sourceType")
      .lean(),
    Solution.find({ _id: { $in: solutionIds } })
      .select("sourceOriginId sourceType")
      .lean(),
  ]);

  // 課題・解決策 ID → 抽出元スレッド ID（チャット由来のものだけ）
  const threadIdByItemId = new Map<string, string>();
  for (const item of [...problems, ...solutions]) {
    if (item.sourceType === CHAT_SOURCE_TYPE) {
      threadIdByItemId.set(String(item._id), String(item.sourceOriginId));
    }
  }

  const threads = await ChatThread.find({
    _id: { $in: [...new Set(threadIdByItemId.values())] },
  })
    .select("userId")
    .lean();
  const userIdByThreadId = new Map(
    threads.map((thread) => [String(thread._id), thread.userId])
  );

  // 論点 ID → 寄与した userId の集合
  const contributorsByQuestion = new Map<string, Set<string>>();
  for (const link of countedLinks) {
    const threadId = threadIdByItemId.get(String(link.linkedItemId));
    const userId =
      threadId !== undefined ? userIdByThreadId.get(threadId) : undefined;
    if (typeof userId !== "string" || userId === "") {
      continue;
    }
    const questionId = String(link.questionId);
    const contributors = contributorsByQuestion.get(questionId) ?? new Set();
    contributors.add(userId);
    contributorsByQuestion.set(questionId, contributors);
  }

  return new Map(
    [...contributorsByQuestion].map(([questionId, contributors]) => [
      questionId,
      contributors.size,
    ])
  );
};

/**
 * 重要論点のうち、表示してよいものだけを選ぶ
 *
 * @param questions - 判定する重要論点（複数テーマが混ざってよい）
 * @returns 表示してよい論点（元の順序を保つ）と、k を満たさず非表示にした論点の件数
 * 注意: k が無効なテーマの論点は、寄与人数に関係なくすべて表示する。
 */
export const selectVisibleQuestions = async <
  TQuestion extends { _id: unknown; themeId: unknown },
>(
  questions: TQuestion[]
): Promise<{ visibleQuestions: TQuestion[]; hiddenCount: number }> => {
  if (questions.length === 0) {
    return { visibleQuestions: [], hiddenCount: 0 };
  }

  const themeIds = [...new Set(questions.map((q) => String(q.themeId)))];
  const themes = await Theme.find({ _id: { $in: themeIds } })
    .select("minContributors")
    .lean();
  const minContributorsByThemeId = new Map<string, number>();
  for (const theme of themes) {
    // フィールドがない既存のテーマ（undefined）と null は、k 無効として扱う
    if (typeof theme.minContributors === "number") {
      minContributorsByThemeId.set(String(theme._id), theme.minContributors);
    }
  }

  const questionsInProtectedThemes = questions.filter((q) =>
    minContributorsByThemeId.has(String(q.themeId))
  );
  if (questionsInProtectedThemes.length === 0) {
    return { visibleQuestions: questions, hiddenCount: 0 };
  }

  const contributorCounts = await countContributorsByQuestion(
    questionsInProtectedThemes.map((q) => String(q._id))
  );

  const visibleQuestions = questions.filter((q) => {
    const minContributors = minContributorsByThemeId.get(String(q.themeId));
    if (minContributors === undefined) {
      return true;
    }
    return (contributorCounts.get(String(q._id)) ?? 0) >= minContributors;
  });

  return {
    visibleQuestions,
    hiddenCount: questions.length - visibleQuestions.length,
  };
};
