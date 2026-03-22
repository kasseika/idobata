/**
 * embeddingCollectionName ユーティリティ関数のユニットテスト
 *
 * 目的: deriveCollectionName がテーマIDとモデルIDから
 *       ChromaDBコレクション名を正しく導出することを検証する。
 */
import { describe, expect, test } from "vitest";
import { deriveCollectionName } from "../../utils/embeddingCollectionName.js";

describe("deriveCollectionName", () => {
  test("モデルIDの '/' が '_' に置換されること", () => {
    const result = deriveCollectionName(
      "abc123",
      "openai/text-embedding-3-small"
    );
    expect(result).toBe("abc123_openai_text-embedding-3-small");
  });

  test("google のモデルIDで正しいコレクション名を返すこと", () => {
    const result = deriveCollectionName(
      "def456",
      "google/gemini-embedding-001"
    );
    expect(result).toBe("def456_google_gemini-embedding-001");
  });

  test("qwen のモデルIDで正しいコレクション名を返すこと", () => {
    const result = deriveCollectionName("ghi789", "qwen/qwen3-embedding-8b");
    expect(result).toBe("ghi789_qwen_qwen3-embedding-8b");
  });

  test("openai/text-embedding-3-large で正しいコレクション名を返すこと", () => {
    const result = deriveCollectionName(
      "abc123def456",
      "openai/text-embedding-3-large"
    );
    expect(result).toBe("abc123def456_openai_text-embedding-3-large");
  });

  test("MongoDBのObjectId（24文字）+ 最長モデルIDで63文字以内に収まること", () => {
    // qwen/qwen3-embedding-8b: sanitized後 "qwen_qwen3-embedding-8b" = 23文字
    // 24 + 1 + 23 = 48文字
    const themeId = "507f1f77bcf86cd799439011"; // 24文字のObjectId
    const result = deriveCollectionName(themeId, "qwen/qwen3-embedding-8b");
    expect(result.length).toBeLessThanOrEqual(63);
    expect(result.length).toBeGreaterThanOrEqual(3);
  });
});
