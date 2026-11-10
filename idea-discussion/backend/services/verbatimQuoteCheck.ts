/**
 * 生成物への原文の混入検査
 *
 * 目的: 最小寄与人数 k が有効なテーマで、生成物（政策ドラフト・ダイジェスト・レポート例・
 *       ビジュアルレポート・討論分析）に、入力の課題文・解決策文がほぼそのまま含まれていないかを検査する
 *       （issue #146）。含まれていれば、書き直しを指示して再生成する。
 *       MAX_GENERATION_ATTEMPTS 回生成しても含まれていれば例外を投げ、生成物を保存させない。
 *       テーマ単位でプロンプトを上書きできる（Theme.pipelineConfig）ため、プロンプトの指示だけには頼らない。
 * 仕様: - 課題文・解決策文の連続した VERBATIM_QUOTE_MIN_LENGTH 字以上が、生成物にそのまま現れたら
 *         「原文が含まれる」とする。より短い一致は、よくある言い回しの一致と区別できないため検出しない
 *       - 比較の前に、全角・半角の違い（NFKC）・空白・HTML タグを取り除く
 *       - k が無効なテーマでは検査しない。テーマが見つからない場合は検査する（隠す側に倒す）
 *       - 例外のメッセージには件数だけを入れ、原文は含めない（ログに残さないため）
 */
import { hidesIndividualOpinions } from "../constants/minContributors.js";
import Theme from "../models/Theme.js";
import type { LLMMessage } from "./llmService.js";

/** 原文が含まれるとみなす、連続した一致の最小の文字数 */
const VERBATIM_QUOTE_MIN_LENGTH = 20;

/**
 * 原文が含まれていたときに、生成を試みる最大の回数（最初の生成を含む）
 *
 * 注意: issue #146 の実験では、引用しない指示を入れても13件中9件で原文が含まれていた。
 *       再生成は LLM の呼び出しを増やすため、回数に上限を設ける。
 */
const MAX_GENERATION_ATTEMPTS = 3;

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
 * 前の出力に原文が含まれていたことを伝え、書き直しを指示するメッセージを作る
 *
 * 注意: どの意見の言い回しを写したかを伝えるため、課題文・解決策文をメッセージに入れる。
 *       これらは元のプロンプトにも入っている文で、LLM に新たに渡す情報ではない。
 */
const createRewriteInstruction = (quotedStatements: string[]): string =>
  `前の出力には、次の意見の言い回しがそのまま含まれていました。これらの言い回しを写さず、複数の意見をまとめた表現で書き直し、前と同じ形式で出力してください。
${quotedStatements.map((statement) => `- ${statement}`).join("\n")}`;

/**
 * k が有効なテーマで、原文がほぼそのまま含まれない生成物を、必要なら再生成して返す
 *
 * 内容: generate で生成し、原文が含まれていれば、前の出力と書き直しの指示をメッセージに足して
 *       再生成する。MAX_GENERATION_ATTEMPTS 回生成しても含まれていれば例外を投げる。
 *       k が無効なテーマでは検査せず、1回の生成結果をそのまま返す。
 *       テーマが見つからない場合は、k を確かめられないため検査する（隠す側に倒す）。
 *
 * @param params.themeId - 生成物の論点が属するテーマの ID
 * @param params.statements - LLM に入力した課題文・解決策文
 * @param params.messages - 最初の生成で LLM に渡すメッセージ
 * @param params.generate - メッセージを受け取って LLM を呼び、生成物を返す関数（出力の形式の検証も行う）
 * @returns 原文が含まれていない生成物（k が無効なテーマでは1回目の生成物）
 * @throws VerbatimQuoteError MAX_GENERATION_ATTEMPTS 回生成しても原文が含まれていた場合
 */
export const generateWithoutVerbatimQuotes = async <T>(params: {
  themeId: unknown;
  statements: string[];
  messages: LLMMessage[];
  generate: (messages: LLMMessage[]) => Promise<T>;
}): Promise<T> => {
  const theme = await Theme.findById(params.themeId)
    .select("minContributors")
    .lean();
  if (theme !== null && !hidesIndividualOpinions(theme)) {
    return params.generate(params.messages);
  }

  let messages = params.messages;
  let quoted: string[] = [];
  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
    const output = await params.generate(messages);
    quoted = findVerbatimQuotes(collectStrings(output), params.statements);
    if (quoted.length === 0) {
      return output;
    }
    // 件数だけを記録し、原文はログに残さない
    console.warn(
      `[VerbatimQuoteCheck] 生成物に原文が ${quoted.length} 件含まれていました（${attempt}/${MAX_GENERATION_ATTEMPTS} 回目）。`
    );
    messages = [
      ...messages,
      {
        role: "assistant",
        content: typeof output === "string" ? output : JSON.stringify(output),
      },
      { role: "user", content: createRewriteInstruction(quoted) },
    ];
  }
  throw new VerbatimQuoteError(quoted.length);
};
