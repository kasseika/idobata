/**
 * Embeddingモデル設定のテスト
 *
 * 目的: DEFAULT_EMBEDDING_MODEL定数の値を検証する。
 */
import { describe, expect, test } from "vitest";
import { DEFAULT_EMBEDDING_MODEL } from "../constants/pipelineStages.js";

describe("DEFAULT_EMBEDDING_MODEL", () => {
  test("デフォルトEmbeddingモデルがopenai/text-embedding-3-smallであること", () => {
    expect(DEFAULT_EMBEDDING_MODEL).toBe("openai/text-embedding-3-small");
  });
});
