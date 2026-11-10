/**
 * 生成物への原文の混入検査
 *
 * 目的: 最小寄与人数 k が有効なテーマで、生成物（政策ドラフト・ダイジェスト・レポート例・
 *       ビジュアルレポート・討論分析）に、入力の課題文・解決策文がほぼそのまま含まれていないかを検査する
 *       （issue #146）。含まれていれば例外を投げ、生成物を保存させない。
 *       テーマ単位でプロンプトを上書きできる（Theme.pipelineConfig）ため、プロンプトの指示だけには頼らない。
 * 仕様: - 課題文・解決策文の連続した VERBATIM_QUOTE_MIN_LENGTH 字以上が、生成物にそのまま現れたら
 *         「原文が含まれる」とする。より短い一致は、よくある言い回しの一致と区別できないため検出しない
 *       - 比較の前に、全角・半角の違い（NFKC）・空白・HTML タグを取り除く
 *       - k が無効なテーマでは検査しない。テーマが見つからない場合は検査する（隠す側に倒す）
 *       - 例外のメッセージには件数だけを入れ、原文は含めない（ログに残さないため）
 */
import { hidesIndividualOpinions } from "../constants/minContributors.js";
import Theme from "../models/Theme.js";

/** 原文が含まれるとみなす、連続した一致の最小の文字数 */
const VERBATIM_QUOTE_MIN_LENGTH = 20;

/** 生成物に原文が含まれていたことを表すエラー */
export class VerbatimQuoteError extends Error {
  constructor(quotedCount: number) {
    super(
      `生成物に、参加者の意見の原文がそのまま ${quotedCount} 件含まれていたため、保存しませんでした。`
    );
    this.name = "VerbatimQuoteError";
  }
}

/**
 * HTML のタグ（< から > まで）を取り除く
 *
 * 注意: 比較のためだけに使う。表示用の無害化（サニタイズ）には使わないこと。
 */
const removeTags = (text: string): string => {
  let result = "";
  let insideTag = false;
  for (const char of text) {
    if (char === "<") {
      insideTag = true;
    } else if (char === ">" && insideTag) {
      insideTag = false;
    } else if (!insideTag) {
      result += char;
    }
  }
  return result;
};

/** 比較のために、全角・半角の違い・空白・HTML のタグを取り除く */
const normalize = (text: string): string =>
  removeTags(text.normalize("NFKC")).replace(/\s+/g, "");

/**
 * 生成物の文字列に、原文がほぼそのまま含まれている課題文・解決策文を返す
 *
 * @param outputTexts - 生成物に含まれる文字列
 * @param statements - LLM に入力した課題文・解決策文
 * @returns 連続した VERBATIM_QUOTE_MIN_LENGTH 字以上が生成物に現れた課題文・解決策文
 */
export const findVerbatimQuotes = (
  outputTexts: string[],
  statements: string[]
): string[] => {
  const normalizedOutput = outputTexts.map(normalize).join("\n");
  return statements.filter((statement) => {
    const normalizedStatement = normalize(statement);
    for (
      let start = 0;
      start + VERBATIM_QUOTE_MIN_LENGTH <= normalizedStatement.length;
      start++
    ) {
      const fragment = normalizedStatement.slice(
        start,
        start + VERBATIM_QUOTE_MIN_LENGTH
      );
      if (normalizedOutput.includes(fragment)) {
        return true;
      }
    }
    return false;
  });
};

/** 生成物（オブジェクト・配列を含む）に含まれる文字列をすべて取り出す */
const collectStrings = (value: unknown): string[] => {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectStrings);
  }
  if (typeof value === "object" && value !== null) {
    return Object.values(value).flatMap(collectStrings);
  }
  return [];
};

/**
 * k が有効なテーマで、生成物に原文がほぼそのまま含まれていれば例外を投げる
 *
 * @param params.themeId - 生成物の論点が属するテーマの ID
 * @param params.output - 保存しようとしている生成物（LLM の出力）
 * @param params.statements - LLM に入力した課題文・解決策文
 * @throws VerbatimQuoteError 原文が含まれていた場合
 */
export const assertNoVerbatimQuotes = async (params: {
  themeId: unknown;
  output: unknown;
  statements: string[];
}): Promise<void> => {
  const theme = await Theme.findById(params.themeId)
    .select("minContributors")
    .lean();
  if (theme !== null && !hidesIndividualOpinions(theme)) {
    return;
  }
  const quoted = findVerbatimQuotes(
    collectStrings(params.output),
    params.statements
  );
  if (quoted.length > 0) {
    throw new VerbatimQuoteError(quoted.length);
  }
};
