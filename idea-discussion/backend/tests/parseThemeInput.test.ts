/**
 * parseThemeInput（テーマ作成・更新リクエストボディの検証）のユニットテスト
 *
 * 目的: issue #149 の対応として、テーマの作成・更新 API が受け取る値を、
 *       更新クエリに入れる前に型で検証することを確認する。
 *       オブジェクトなど想定外の型の値は、そのまま MongoDB のクエリに入ると
 *       演算子（$ で始まるキー）として解釈されうるため、エラーにする。
 * 前提: 送られていないフィールド（undefined）は「変更しない」を表し、結果にも含めない。
 */
import { describe, expect, test } from "vitest";
import { parseThemeInput } from "../utils/parseThemeInput.js";

describe("parseThemeInput - 正常な入力", () => {
  test("管理画面が送る形のボディを、そのまま検証済みの値として返すこと", () => {
    const result = parseThemeInput({
      title: "新人研修 2026 春",
      description: "職場の困りごとを話し合うテーマ",
      status: "active",
      customPrompt: "参加者の話を丁寧に聞き返してください",
      tags: ["研修", "職場環境"],
      pipelineConfig: {
        chat: { model: "openai/gpt-5.4", prompt: "やさしく問いかけてください" },
        linking: { model: "openai/gpt-5.4-mini" },
      },
      minContributors: 5,
    });

    expect(result._unsafeUnwrap()).toEqual({
      title: "新人研修 2026 春",
      description: "職場の困りごとを話し合うテーマ",
      status: "active",
      customPrompt: "参加者の話を丁寧に聞き返してください",
      tags: ["研修", "職場環境"],
      pipelineConfig: {
        chat: { model: "openai/gpt-5.4", prompt: "やさしく問いかけてください" },
        linking: { model: "openai/gpt-5.4-mini" },
      },
      minContributors: 5,
    });
  });

  test("送られていないフィールドは結果に含めないこと", () => {
    const result = parseThemeInput({ title: "地域の防災を考える" });

    expect(result._unsafeUnwrap()).toEqual({ title: "地域の防災を考える" });
  });

  test("tags が null の場合は空配列として扱うこと（従来の挙動）", () => {
    const result = parseThemeInput({ tags: null });

    expect(result._unsafeUnwrap()).toEqual({ tags: [] });
  });

  test("minContributors が null の場合は無効化として受け付けること", () => {
    const result = parseThemeInput({ minContributors: null });

    expect(result._unsafeUnwrap()).toEqual({ minContributors: null });
  });

  test("ボディが undefined（空のリクエスト）の場合は、何も変更しない入力として扱うこと", () => {
    const result = parseThemeInput(undefined);

    expect(result._unsafeUnwrap()).toEqual({});
  });
});

describe("parseThemeInput - 不正な入力", () => {
  test.each([
    ["title がオブジェクト（クエリ演算子）", { title: { $ne: "" } }],
    [
      "description がオブジェクト",
      { description: { $set: { status: "draft" } } },
    ],
    ["customPrompt が数値", { customPrompt: 123 }],
    ["status が定義にない値", { status: "deleted" }],
    ["status がオブジェクト", { status: { $ne: "draft" } }],
    ["tags が文字列", { tags: "研修" }],
    ["tags にオブジェクトが含まれる", { tags: ["研修", { $gt: "" }] }],
    ["pipelineConfig が配列", { pipelineConfig: [] }],
    [
      "pipelineConfig に存在しないステージがある",
      { pipelineConfig: { unknown_stage: { model: "openai/gpt-5.4" } } },
    ],
    [
      "pipelineConfig の model がオブジェクト",
      { pipelineConfig: { chat: { model: { $ne: "" } } } },
    ],
    [
      "pipelineConfig の prompt が数値",
      { pipelineConfig: { chat: { prompt: 1 } } },
    ],
    [
      "pipelineConfig のステージ設定が文字列",
      { pipelineConfig: { chat: "openai/gpt-5.4" } },
    ],
    ["minContributors が 1", { minContributors: 1 }],
    ["minContributors が数値文字列", { minContributors: "5" }],
    ["ボディが配列", []],
  ])("%s の場合はエラーを返すこと", (_label, body) => {
    const result = parseThemeInput(body);

    expect(result.isErr()).toBe(true);
  });
});
