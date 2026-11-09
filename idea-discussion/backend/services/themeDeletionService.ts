/**
 * テーマ削除サービス
 *
 * 目的: テーマと、そのテーマで集めた参加者のデータをまとめて削除する。
 *       企業研修では「終了後はデータを削除できる」と約束するため、テーマ本体だけが消えて
 *       会話や課題が DB に残る状態を防ぐ。
 * 削除対象: チャットスレッド・課題・解決策・インポート項目・重要論点、重要論点にひもづく
 *           リンク・政策ドラフト・ダイジェスト・討論分析・ビジュアルレポート・レポート例、
 *           課題・解決策・重要論点へのいいね、テーマ本体。
 * 削除しないもの: 設定変更の監査ログ（PipelineConfigChangeLog。参加者のデータではないため）、
 *                 python-service（ChromaDB）の埋め込みベクトル（本文を含まず、削除APIがないため）、
 *                 ユーザー（表示名。テーマをまたいで使われるため）。
 * 注意: 関連データを先に消し、テーマ本体は最後に消す。途中で失敗した場合はテーマが残るため、
 *       管理者が削除を再実行すれば残りを削除しきれる（各削除は何度実行しても同じ結果になる）。
 */

import ChatThread from "../models/ChatThread.js";
import DebateAnalysis from "../models/DebateAnalysis.js";
import DigestDraft from "../models/DigestDraft.js";
import ImportedItem from "../models/ImportedItem.js";
import Like from "../models/Like.js";
import PolicyDraft from "../models/PolicyDraft.js";
import Problem from "../models/Problem.js";
import QuestionLink from "../models/QuestionLink.js";
import QuestionVisualReport from "../models/QuestionVisualReport.js";
import ReportExample from "../models/ReportExample.js";
import SharpQuestion from "../models/SharpQuestion.js";
import Solution from "../models/Solution.js";
import Theme from "../models/Theme.js";

/**
 * テーマと、そのテーマに属するすべての参加者データを削除する
 *
 * @param themeId 削除するテーマのID（呼び出し側で ObjectId 形式であることを検証済みであること）
 * @throws いずれかの削除に失敗した場合は、その例外をそのまま送出する（テーマ本体は残る）
 */
export const deleteThemeWithRelatedData = async (
  themeId: string
): Promise<void> => {
  // 削除前に、テーマ単位でないデータを探すためのIDを集める
  const [questionIds, problemIds, solutionIds] = await Promise.all([
    SharpQuestion.distinct("_id", { themeId }),
    Problem.distinct("_id", { themeId }),
    Solution.distinct("_id", { themeId }),
  ]);

  const byQuestion = { questionId: { $in: questionIds } };
  await Promise.all([
    QuestionLink.deleteMany(byQuestion),
    PolicyDraft.deleteMany(byQuestion),
    DigestDraft.deleteMany(byQuestion),
    DebateAnalysis.deleteMany(byQuestion),
    QuestionVisualReport.deleteMany(byQuestion),
    ReportExample.deleteMany(byQuestion),
    Like.deleteMany({
      targetId: { $in: [...problemIds, ...solutionIds, ...questionIds] },
    }),
  ]);

  const byTheme = { themeId };
  await Promise.all([
    ChatThread.deleteMany(byTheme),
    Problem.deleteMany(byTheme),
    Solution.deleteMany(byTheme),
    ImportedItem.deleteMany(byTheme),
    SharpQuestion.deleteMany(byTheme),
  ]);

  await Theme.findByIdAndDelete(themeId);
};
