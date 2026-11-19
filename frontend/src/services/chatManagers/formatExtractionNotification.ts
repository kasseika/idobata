/**
 * チャットに出す「課題・解決策を登録しました」通知の文面を作る
 *
 * 抽出された文章（statement）は二文構成で 100 字を超えることが多く、そのまま通知に入れると
 * AI との会話が画面から押し出されてしまう。そこで、チャットには一文目を短く切った1行（summary）だけを
 * 表示し、全文（detail）は通知を開いたときにだけ読めるようにする。
 */

/** summary に入れる、抽出された文章の最大文字数 */
const SUMMARY_MAX_LENGTH = 30;

/** 文の区切り（句点） */
const SENTENCE_DELIMITER = "。";

/** 省略したことを示す記号 */
const ELLIPSIS = "…";

/** 抽出された項目の種類と、通知に表示する名前 */
const EXTRACTION_LABELS = {
  problem: "課題",
  solution: "解決策",
} as const;

export type ExtractionKind = keyof typeof EXTRACTION_LABELS;

export type ExtractionNotificationText = {
  /** チャットに常に表示する短い1行 */
  summary: string;
  /** 通知を開いたときに表示する、抽出された文章の全文 */
  detail: string;
};

/**
 * 抽出された課題・解決策から、チャット通知の短い1行と全文を作る。
 *
 * - 一文目（最初の句点まで）だけを使い、二文目以降があれば末尾に「…」を付ける
 * - 一文目の中の改行は空白に置き換え、summary を必ず1行にする（detail の改行はそのまま残す）
 * - 一文目が SUMMARY_MAX_LENGTH 文字を超える場合は、その文字数で切って「…」を付ける
 * - 文字数はサロゲートペア（絵文字等）を1文字として数える
 *
 * @param kind 抽出された項目の種類
 * @param statement 抽出された文章の全文
 * @returns 短い1行（summary）と全文（detail）
 */
export function formatExtractionNotification(
  kind: ExtractionKind,
  statement: string
): ExtractionNotificationText {
  const trimmed = statement.trim();
  const delimiterIndex = trimmed.indexOf(SENTENCE_DELIMITER);
  const firstSentence =
    delimiterIndex === -1 ? trimmed : trimmed.slice(0, delimiterIndex);
  // 一文目より後ろに文が続くか（最後の句点だけなら続かないとみなす）
  const hasMoreSentences =
    delimiterIndex !== -1 && delimiterIndex < trimmed.length - 1;

  // summary は1行で表示するため、一文目の中の改行（前後の空白を含む）は空白1つに置き換える
  const singleLine = firstSentence.replace(/\s*[\r\n]+\s*/g, " ");
  const characters = Array.from(singleLine);
  const isTooLong = characters.length > SUMMARY_MAX_LENGTH;
  const head = isTooLong
    ? characters.slice(0, SUMMARY_MAX_LENGTH).join("")
    : singleLine;
  const excerpt = isTooLong || hasMoreSentences ? `${head}${ELLIPSIS}` : head;

  return {
    summary: `${EXTRACTION_LABELS[kind]}「${excerpt}」を登録しました`,
    detail: statement,
  };
}
