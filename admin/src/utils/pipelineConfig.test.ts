/**
 * pipelineConfig ユーティリティのユニットテスト
 *
 * 目的: stripDefaultsFromPipelineConfig 関数が、デフォルト値と同一の設定を除外することを検証する。
 * 注意: デフォルト値と一致するエントリを保存しないことで、将来のデフォルト変更が既存テーマに追従できるようにする。
 */

import { describe, expect, test } from "vitest";
import type { PipelineStageDefault } from "../services/api/types";
import { stripDefaultsFromPipelineConfig } from "./pipelineConfig";

/** テスト用デフォルトステージ定義 */
const テスト用デフォルト: PipelineStageDefault[] = [
  {
    id: "chat",
    name: "チャット対話",
    description: "テスト用",
    defaultModel: "google/gemini-flash",
    defaultPrompt: "デフォルトのチャットプロンプト",
    order: 1,
  },
  {
    id: "linking",
    name: "リンキング判定",
    description: "テスト用",
    defaultModel: "google/gemini-flash",
    defaultPrompt: "デフォルトのリンキングプロンプト",
    order: 2,
  },
];

describe("stripDefaultsFromPipelineConfig", () => {
  test("すべてデフォルトと同一の設定 → 空オブジェクトを返す", () => {
    const config = {
      chat: {
        model: "google/gemini-flash",
        prompt: "デフォルトのチャットプロンプト",
      },
      linking: {
        model: "google/gemini-flash",
        prompt: "デフォルトのリンキングプロンプト",
      },
    };

    const result = stripDefaultsFromPipelineConfig(config, テスト用デフォルト);

    expect(result).toEqual({});
  });

  test("モデルのみカスタム → そのステージのモデルのみ保持", () => {
    const config = {
      chat: {
        model: "anthropic/claude-sonnet-4.6",
        prompt: "デフォルトのチャットプロンプト",
      },
      linking: {
        model: "google/gemini-flash",
        prompt: "デフォルトのリンキングプロンプト",
      },
    };

    const result = stripDefaultsFromPipelineConfig(config, テスト用デフォルト);

    expect(result).toEqual({
      chat: { model: "anthropic/claude-sonnet-4.6" },
    });
  });

  test("プロンプトのみカスタム → そのステージのプロンプトのみ保持", () => {
    const config = {
      chat: {
        model: "google/gemini-flash",
        prompt: "カスタムチャットプロンプト",
      },
      linking: {
        model: "google/gemini-flash",
        prompt: "デフォルトのリンキングプロンプト",
      },
    };

    const result = stripDefaultsFromPipelineConfig(config, テスト用デフォルト);

    expect(result).toEqual({
      chat: { prompt: "カスタムチャットプロンプト" },
    });
  });

  test("一部ステージがカスタム、他はデフォルト → カスタム部分のみ保持", () => {
    const config = {
      chat: {
        model: "anthropic/claude-sonnet-4.6",
        prompt: "カスタムチャットプロンプト",
      },
      linking: {
        model: "google/gemini-flash",
        prompt: "デフォルトのリンキングプロンプト",
      },
    };

    const result = stripDefaultsFromPipelineConfig(config, テスト用デフォルト);

    expect(result).toEqual({
      chat: {
        model: "anthropic/claude-sonnet-4.6",
        prompt: "カスタムチャットプロンプト",
      },
    });
  });

  test("設定が空オブジェクト → 空オブジェクトを返す", () => {
    const result = stripDefaultsFromPipelineConfig({}, テスト用デフォルト);

    expect(result).toEqual({});
  });
});
