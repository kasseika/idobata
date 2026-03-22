/**
 * embeddingController のユニットテスト
 *
 * 目的: generateThemeEmbeddings・generateQuestionEmbeddings における
 *       embeddingGeneratedCollections フィールドの読み書きを検証する。
 *       - Problem/Solution の find クエリがコレクション名でフィルタリングされること
 *       - updateMany が $addToSet でコレクション名を追加すること
 *       - Solutionにもフィルタが適用されること（旧バグの修正検証）
 */
import type { Request, Response } from "express";
import { beforeEach, describe, expect, test, vi } from "vitest";

// axios・dotenv はサービス層で使用されるため先にモック
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

// Mongoose モデルのモック
vi.mock("../models/Problem.js", () => ({
  default: {
    find: vi.fn(),
    updateMany: vi.fn(),
  },
}));

vi.mock("../models/Solution.js", () => ({
  default: {
    find: vi.fn(),
    updateMany: vi.fn(),
  },
}));

vi.mock("../models/Theme.js", () => ({
  default: {
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
  },
  ALLOWED_EMBEDDING_MODELS: ["openai/text-embedding-3-small"],
}));

vi.mock("../models/SharpQuestion.js", () => ({
  default: {
    findById: vi.fn(),
  },
}));

vi.mock("../models/QuestionLink.js", () => ({
  default: {
    find: vi.fn(),
  },
}));

// embeddingService のモック
vi.mock("../services/embedding/embeddingService.js", () => ({
  generateEmbeddings: vi.fn(),
  searchVectors: vi.fn(),
  clusterVectors: vi.fn(),
  generateTransientEmbedding: vi.fn(),
}));

import {
  generateQuestionEmbeddings,
  generateThemeEmbeddings,
} from "../controllers/embeddingController.js";
import Problem from "../models/Problem.js";
import QuestionLink from "../models/QuestionLink.js";
import SharpQuestion from "../models/SharpQuestion.js";
import Solution from "../models/Solution.js";
import Theme from "../models/Theme.js";
import { generateEmbeddings } from "../services/embedding/embeddingService.js";

/** モック用ヘルパー: req/res オブジェクトを生成する */
const createMockReqRes = (
  params: Record<string, string> = {},
  body: Record<string, unknown> = {}
) => {
  const req = { params, body };
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return { req, res };
};

// テーマID・コレクション名（openai/text-embedding-3-small のデフォルト）
const テーマID = "6507f1f77bcf86cd799439011";
const 質問ID = "6607f1f77bcf86cd799439022";
const デフォルトコレクション名 = `${テーマID}_openai_text-embedding-3-small`;
const 別モデルコレクション名 = `${テーマID}_google_gemini-embedding-001`;
// generateQuestionEmbeddings はquestionスコープのマーカーを使用する
const デフォルトQuestionマーカー = `${デフォルトコレクション名}:question:${質問ID}`;
const 別モデルQuestionマーカー = `${別モデルコレクション名}:question:${質問ID}`;

/** モック用: 成功レスポンスを返す generateEmbeddings */
const setupGenerateEmbeddingsMock = () => {
  (generateEmbeddings as ReturnType<typeof vi.fn>).mockResolvedValue({
    status: "success",
    errors: [],
    collectionCount: 2,
  });
};

// ============================================================
// generateQuestionEmbeddings テスト
// ============================================================

describe("generateQuestionEmbeddings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupGenerateEmbeddingsMock();

    // SharpQuestion: 質問を返す（themeId を持つ）
    (SharpQuestion.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      _id: 質問ID,
      themeId: テーマID,
    });

    // Theme: デフォルトEmbeddingモデルを返す
    (Theme.findById as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: テーマID,
        embeddingModel: "openai/text-embedding-3-small",
      }),
    });

    // Problem: 課題リンクと課題データのデフォルト設定
    (QuestionLink.find as ReturnType<typeof vi.fn>).mockResolvedValue([
      { linkedItemId: "課題ID001", linkedItemType: "problem" },
    ]);

    (Problem.find as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          _id: "課題ID001",
          statement: "テスト課題の説明",
          embeddingGeneratedCollections: [],
        },
      ]),
    });

    (Solution.find as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue([]),
    });

    (Problem.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({
      modifiedCount: 1,
    });
    (Solution.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({
      modifiedCount: 0,
    });
  });

  test("Problem.findクエリにembeddingGeneratedCollectionsフィルタが使用されること", async () => {
    const { req, res } = createMockReqRes(
      { questionId: 質問ID },
      { itemType: "problem" }
    );

    await generateQuestionEmbeddings(
      req as unknown as Request,
      res as unknown as Response
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(Problem.find).toHaveBeenCalledWith(
      expect.objectContaining({
        embeddingGeneratedCollections: { $ne: デフォルトQuestionマーカー },
      })
    );
  });

  test("Solution.findクエリにもembeddingGeneratedCollectionsフィルタが使用されること（バグ修正）", async () => {
    // Solutionリンクが返るように設定（itemType: "solution" のとき QuestionLink.find は1回だけ呼ばれる）
    (QuestionLink.find as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { linkedItemId: "解決策ID001", linkedItemType: "solution" },
    ]);

    (Solution.find as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          _id: "解決策ID001",
          statement: "テスト解決策の説明",
          embeddingGeneratedCollections: [],
        },
      ]),
    });

    const { req, res } = createMockReqRes(
      { questionId: 質問ID },
      { itemType: "solution" }
    );

    await generateQuestionEmbeddings(
      req as unknown as Request,
      res as unknown as Response
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(Solution.find).toHaveBeenCalledWith(
      expect.objectContaining({
        embeddingGeneratedCollections: { $ne: デフォルトQuestionマーカー },
      })
    );
  });

  test("Problem.updateManyが$addToSetでコレクション名を追加すること", async () => {
    const { req, res } = createMockReqRes(
      { questionId: 質問ID },
      { itemType: "problem" }
    );

    await generateQuestionEmbeddings(
      req as unknown as Request,
      res as unknown as Response
    );

    expect(Problem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ _id: { $in: ["課題ID001"] } }),
      {
        $addToSet: {
          embeddingGeneratedCollections: デフォルトQuestionマーカー,
        },
      }
    );
  });

  test("Solution.updateManyが$addToSetでコレクション名を追加すること", async () => {
    // itemType: "solution" のとき QuestionLink.find は1回だけ呼ばれる
    (QuestionLink.find as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { linkedItemId: "解決策ID001", linkedItemType: "solution" },
    ]);

    (Solution.find as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          _id: "解決策ID001",
          statement: "テスト解決策の説明",
          embeddingGeneratedCollections: [],
        },
      ]),
    });

    const { req, res } = createMockReqRes(
      { questionId: 質問ID },
      { itemType: "solution" }
    );

    await generateQuestionEmbeddings(
      req as unknown as Request,
      res as unknown as Response
    );

    expect(Solution.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ _id: { $in: ["解決策ID001"] } }),
      {
        $addToSet: {
          embeddingGeneratedCollections: デフォルトQuestionマーカー,
        },
      }
    );
  });

  test("別モデルのコレクション名でフィルタが適用されること", async () => {
    // 別モデル（google/gemini-embedding-001）が設定されたテーマ
    (Theme.findById as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: テーマID,
        embeddingModel: "google/gemini-embedding-001",
      }),
    });

    const { req, res } = createMockReqRes(
      { questionId: 質問ID },
      { itemType: "problem" }
    );

    await generateQuestionEmbeddings(
      req as unknown as Request,
      res as unknown as Response
    );

    expect(Problem.find).toHaveBeenCalledWith(
      expect.objectContaining({
        embeddingGeneratedCollections: { $ne: 別モデルQuestionマーカー },
      })
    );
  });

  test("collectionAで生成済みのProblemがcollectionBでは取得対象になること", async () => {
    // collectionA（デフォルトモデル）で既に生成済みの課題
    (Problem.find as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          _id: "課題ID001",
          statement: "別モデルでは未生成の課題",
          embeddingGeneratedCollections: [デフォルトコレクション名], // collectionAのみ生成済み
        },
      ]),
    });

    // collectionB（別モデル）で処理
    (Theme.findById as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: テーマID,
        embeddingModel: "google/gemini-embedding-001",
      }),
    });

    const { req, res } = createMockReqRes(
      { questionId: 質問ID },
      { itemType: "problem" }
    );

    await generateQuestionEmbeddings(
      req as unknown as Request,
      res as unknown as Response
    );

    // collectionBのフィルタで課題が取得され、generateEmbeddingsが呼ばれること
    expect(generateEmbeddings).toHaveBeenCalled();
    expect(Problem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ _id: { $in: ["課題ID001"] } }),
      { $addToSet: { embeddingGeneratedCollections: 別モデルQuestionマーカー } }
    );
  });
});

// ============================================================
// generateThemeEmbeddings テスト
// ============================================================

describe("generateThemeEmbeddings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupGenerateEmbeddingsMock();

    // Theme: デフォルトEmbeddingモデルを返す
    (Theme.findById as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: テーマID,
        embeddingModel: "openai/text-embedding-3-small",
      }),
    });

    // Problem: テーマに紐づく課題データ
    (Problem.find as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          _id: "課題ID001",
          statement: "テスト課題の説明",
          themeId: テーマID,
          embeddingGeneratedCollections: [],
        },
      ]),
    });

    // Solution: テーマに紐づく解決策データ
    (Solution.find as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue([]),
    });

    (Problem.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({
      modifiedCount: 1,
    });
    (Solution.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({
      modifiedCount: 0,
    });
    (Theme.findByIdAndUpdate as ReturnType<typeof vi.fn>).mockResolvedValue({});
  });

  test("Problem.updateManyが$addToSetでコレクション名を追加すること", async () => {
    const { req, res } = createMockReqRes(
      { themeId: テーマID },
      { itemType: "problem" }
    );

    await generateThemeEmbeddings(
      req as unknown as Request,
      res as unknown as Response
    );

    expect(Problem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ _id: { $in: ["課題ID001"] } }),
      { $addToSet: { embeddingGeneratedCollections: デフォルトコレクション名 } }
    );
  });

  test("Solution.updateManyが$addToSetでコレクション名を追加すること", async () => {
    (Solution.find as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          _id: "解決策ID001",
          statement: "テスト解決策の説明",
          themeId: テーマID,
          embeddingGeneratedCollections: [],
        },
      ]),
    });

    const { req, res } = createMockReqRes(
      { themeId: テーマID },
      { itemType: "solution" }
    );

    await generateThemeEmbeddings(
      req as unknown as Request,
      res as unknown as Response
    );

    expect(Solution.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ _id: { $in: ["解決策ID001"] } }),
      { $addToSet: { embeddingGeneratedCollections: デフォルトコレクション名 } }
    );
  });
});
