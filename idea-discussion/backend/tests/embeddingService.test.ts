/**
 * embeddingService のユニットテスト
 *
 * 目的: generateEmbeddings・generateTransientEmbedding の model パラメータが
 *       python-service へのリクエストボディに含まれることを検証する。
 */
import { beforeEach, describe, expect, test, vi } from "vitest";
import { DEFAULT_EMBEDDING_MODEL } from "../constants/pipelineStages.js";

// axios モック
vi.mock("axios", () => ({
  default: {
    create: vi.fn().mockReturnValue({
      post: vi.fn(),
    }),
  },
}));

vi.mock("dotenv", () => ({
  default: { config: vi.fn() },
  config: vi.fn(),
}));

import axios from "axios";
import {
  clusterVectors,
  generateEmbeddings,
  generateTransientEmbedding,
  searchVectors,
} from "../services/embedding/embeddingService.js";

const mockPost = vi.mocked(axios.create({} as never).post);

describe("generateEmbeddings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPost.mockResolvedValue({
      data: { status: "success", generatedCount: 1, errors: [] },
    });
  });

  test("modelパラメータをリクエストボディに含めること", async () => {
    const items = [
      {
        id: "test-id",
        text: "テストテキスト",
        topicId: "topic-1",
        itemType: "problem",
      },
    ];
    await generateEmbeddings(items, "google/gemini-embedding-001", "col_name");

    expect(mockPost).toHaveBeenCalledWith(
      "/api/embeddings/generate",
      expect.objectContaining({ model: "google/gemini-embedding-001" })
    );
  });

  test("modelパラメータが省略された場合はデフォルトモデルを使用すること", async () => {
    const items = [
      {
        id: "test-id",
        text: "テストテキスト",
        topicId: "topic-1",
        itemType: "problem",
      },
    ];
    await generateEmbeddings(items);

    expect(mockPost).toHaveBeenCalledWith(
      "/api/embeddings/generate",
      expect.objectContaining({ model: DEFAULT_EMBEDDING_MODEL })
    );
  });

  test("collectionNameパラメータをリクエストボディに含めること", async () => {
    const items = [
      {
        id: "test-id",
        text: "テストテキスト",
        topicId: "topic-1",
        itemType: "problem",
      },
    ];
    await generateEmbeddings(
      items,
      DEFAULT_EMBEDDING_MODEL,
      "abc123_openai_text-embedding-3-small"
    );

    expect(mockPost).toHaveBeenCalledWith(
      "/api/embeddings/generate",
      expect.objectContaining({
        collectionName: "abc123_openai_text-embedding-3-small",
      })
    );
  });
});

describe("searchVectors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPost.mockResolvedValue({
      data: { results: [] },
    });
  });

  test("collectionNameパラメータをリクエストボディに含めること", async () => {
    await searchVectors(
      [0.1, 0.2],
      { topicId: "topic-1", itemType: "problem" },
      10,
      "abc123_openai_text-embedding-3-small"
    );

    expect(mockPost).toHaveBeenCalledWith(
      "/api/vectors/search",
      expect.objectContaining({
        collectionName: "abc123_openai_text-embedding-3-small",
      })
    );
  });
});

describe("clusterVectors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPost.mockResolvedValue({
      data: { clusters: [] },
    });
  });

  test("collectionNameパラメータをリクエストボディに含めること", async () => {
    await clusterVectors(
      { topicId: "topic-1", itemType: "problem" },
      "kmeans",
      { n_clusters: 3 },
      "abc123_openai_text-embedding-3-small"
    );

    expect(mockPost).toHaveBeenCalledWith(
      "/api/vectors/cluster",
      expect.objectContaining({
        collectionName: "abc123_openai_text-embedding-3-small",
      })
    );
  });
});

describe("generateTransientEmbedding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPost.mockResolvedValue({
      data: { embedding: [0.1, 0.2, 0.3] },
    });
  });

  test("modelパラメータをリクエストボディに含めること", async () => {
    await generateTransientEmbedding(
      "テストテキスト",
      "google/gemini-embedding-001"
    );

    expect(mockPost).toHaveBeenCalledWith(
      "/api/embeddings/transient",
      expect.objectContaining({ model: "google/gemini-embedding-001" })
    );
  });

  test("modelパラメータが省略された場合はデフォルトモデルを使用すること", async () => {
    await generateTransientEmbedding("テストテキスト");

    expect(mockPost).toHaveBeenCalledWith(
      "/api/embeddings/transient",
      expect.objectContaining({ model: DEFAULT_EMBEDDING_MODEL })
    );
  });
});
