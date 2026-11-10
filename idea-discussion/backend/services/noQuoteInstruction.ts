/**
 * 生成処理のプロンプトに入れる「引用しない指示」
 *
 * 目的: 最小寄与人数 k が有効なテーマで、生成物（政策ドラフト・ダイジェスト・レポート例・
 *       ビジュアルレポート・討論分析）に参加者の意見の原文や、書き手を絞り込める情報を
 *       書かせないよう、LLM に指示する（issue #146）。
 * 注意: 指示だけでは原文の混入を防ぎきれないため、保存前に verbatimQuoteCheck でも検査する。
 *       この指示は検査で止まる生成物を減らすためのもの。
 */
import { hidesIndividualOpinions } from "../constants/minContributors.js";
import Theme from "../models/Theme.js";

/** k が有効なテーマの指示: 引用から書き手を推定されないよう、要約した表現で書く */
export const NO_QUOTE_INSTRUCTION =
  "- 個々の意見は引用せず、複数の意見をまとめた表現で記述してください。部署名・役職・固有の出来事など、意見を書いた人を絞り込める情報は書かないでください。";

/**
 * 論点が属するテーマに応じて、プロンプトに入れる引用しない指示を返す
 *
 * @param themeId - 生成物の論点が属するテーマの ID
 * @returns k が有効なテーマなら NO_QUOTE_INSTRUCTION、k が無効なテーマなら null。
 *          テーマが見つからない場合は、k を確かめられないため NO_QUOTE_INSTRUCTION を返す（隠す側に倒す）
 */
export const resolveNoQuoteInstruction = async (
  themeId: unknown
): Promise<string | null> => {
  const theme = await Theme.findById(themeId).select("minContributors").lean();
  return theme === null || hidesIndividualOpinions(theme)
    ? NO_QUOTE_INSTRUCTION
    : null;
};

/**
 * プロンプトの途中に差し込む、引用しない指示の段落を返す
 *
 * @param themeId - 生成物の論点が属するテーマの ID
 * @returns 指示が必要なら「指示＋空行」、k が無効なテーマなら空文字（従来のプロンプトを変えない）
 */
export const resolveNoQuoteSection = async (
  themeId: unknown
): Promise<string> => {
  const instruction = await resolveNoQuoteInstruction(themeId);
  return instruction ? `${instruction}\n\n` : "";
};
