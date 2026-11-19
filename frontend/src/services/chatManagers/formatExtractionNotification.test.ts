/**
 * formatExtractionNotification のテスト
 *
 * 目的: チャットに出す「登録しました」通知の文面を、短い1行（summary）と全文（detail）に分けて
 *       作ることを検証する。抽出された文章は二文構成で長くなりやすいため、チャットには
 *       一文目を短く切った1行だけを出し、全文は開いたときにだけ読めるようにする。
 *       - 一文目が上限の文字数以内で、二文目が無いときは、そのまま表示すること
 *       - 二文目があるときは、一文目だけを表示し、末尾に「…」を付けること
 *       - 一文目が上限の文字数を超えるときは、上限で切って「…」を付けること
 *       - detail には常に抽出された文章の全文を入れること
 */
import { describe, expect, it } from "vitest";
import { formatExtractionNotification } from "./formatExtractionNotification";

describe("formatExtractionNotification", () => {
  it("短い一文だけの課題は、そのまま1行に表示すること", () => {
    const result = formatExtractionNotification(
      "problem",
      "定例会議が長引いて結論が出ない"
    );

    expect(result.summary).toBe(
      "課題「定例会議が長引いて結論が出ない」を登録しました"
    );
    expect(result.detail).toBe("定例会議が長引いて結論が出ない");
  });

  it("二文目がある解決策は、一文目だけを表示し「…」を付けること", () => {
    const statement =
      "会議の議題を前日までに共有する。この案は会議の準備不足が話題になったときに出た。";

    const result = formatExtractionNotification("solution", statement);

    expect(result.summary).toBe(
      "解決策「会議の議題を前日までに共有する…」を登録しました"
    );
    expect(result.detail).toBe(statement);
  });

  it("一文目が30文字を超えるときは、30文字で切って「…」を付けること", () => {
    const statement =
      "高齢者は、デジタル機器の操作が複雑で理解しづらいため、行政サービスのオンライン化に対応できていない。この問題は高齢の親族の事例から説明された。";

    const result = formatExtractionNotification("problem", statement);

    expect(result.summary).toBe(
      "課題「高齢者は、デジタル機器の操作が複雑で理解しづらいため、行政サ…」を登録しました"
    );
    expect(result.detail).toBe(statement);
  });
});
