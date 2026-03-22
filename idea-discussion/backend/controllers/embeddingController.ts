/**
 * 埋め込みコントローラー
 *
 * 目的: テーマ・質問に紐づく課題・解決策の埋め込みベクトル生成、
 *       ベクトル類似検索、クラスタリングAPIを提供する。
 */

import type { Request, Response } from "express";
import { DEFAULT_EMBEDDING_MODEL } from "../constants/pipelineStages.js";
import Problem from "../models/Problem.js";
import QuestionLink from "../models/QuestionLink.js";
import SharpQuestion from "../models/SharpQuestion.js";
import Solution from "../models/Solution.js";
import Theme from "../models/Theme.js";
import {
  clusterVectors,
  generateEmbeddings,
  generateTransientEmbedding,
  searchVectors,
} from "../services/embedding/embeddingService.js";

/** python-service のベクトル検索レスポンス型 */
interface SearchResult {
  results: Array<{ id: string; similarity: number }>;
}

/** python-service のクラスタリングレスポンス型 */
interface ClusterResult {
  clusters: unknown;
}

/**
 * Generate embeddings for problems or solutions linked to a theme
 */
const generateThemeEmbeddings = async (req: Request, res: Response) => {
  const { themeId } = req.params;
  const { itemType } = req.body || {};

  try {
    const query = { themeId };
    if (itemType) {
      if (itemType !== "problem" && itemType !== "solution") {
        return res.status(400).json({
          message: "Invalid itemType. Must be 'problem' or 'solution'",
        });
      }
    }

    let items: Array<{
      id: string;
      text: string;
      topicId: string;
      questionId?: string;
      itemType: string;
    }> = [];

    if (!itemType || itemType === "problem") {
      const problems = await Problem.find(query).lean();
      items = items.concat(
        problems.map((p) => ({
          id: String(p._id),
          text: p.statement,
          topicId: p.themeId.toString(),
          questionId: undefined,
          itemType: "problem",
        }))
      );
    }

    if (!itemType || itemType === "solution") {
      const solutions = await Solution.find(query).lean();
      items = items.concat(
        solutions.map((s) => ({
          id: String(s._id),
          text: s.statement,
          topicId: s.themeId.toString(),
          questionId: undefined,
          itemType: "solution",
        }))
      );
    }

    if (items.length === 0) {
      return res.status(200).json({
        status: "no items to process",
      });
    }

    const theme = await Theme.findById(themeId).lean();
    const embeddingModel = theme?.embeddingModel ?? DEFAULT_EMBEDDING_MODEL;

    await generateEmbeddings(items, embeddingModel);

    const problemIds = items
      .filter((item) => item.itemType === "problem")
      .map((item) => item.id);
    const solutionIds = items
      .filter((item) => item.itemType === "solution")
      .map((item) => item.id);

    if (problemIds.length > 0) {
      await Problem.updateMany(
        { _id: { $in: problemIds } },
        { embeddingGenerated: true }
      );
    }

    if (solutionIds.length > 0) {
      await Solution.updateMany(
        { _id: { $in: solutionIds } },
        { embeddingGenerated: true }
      );
    }

    return res.status(200).json({
      status: "success",
      processedCount: items.length,
    });
  } catch (error) {
    console.error(`Error generating embeddings for theme ${themeId}:`, error);
    return res.status(500).json({
      message: "Error generating embeddings",
      error: (error as Error).message,
    });
  }
};

/**
 * Generate embeddings for problems or solutions linked to a question
 */
const generateQuestionEmbeddings = async (req: Request, res: Response) => {
  const { questionId } = req.params;
  const { itemType } = req.body || {};

  try {
    const question = await SharpQuestion.findById(questionId);
    if (!question) {
      return res.status(404).json({
        message: "Question not found",
      });
    }

    const themeId = question.themeId;

    let items: Array<{
      id: string;
      text: string;
      topicId: string;
      questionId: string;
      itemType: string;
    }> = [];

    if (!itemType || itemType === "problem") {
      const problemLinks = await QuestionLink.find({
        questionId,
        linkedItemType: "problem",
      });
      const problemIds = problemLinks.map((link) => link.linkedItemId);
      const problems = await Problem.find({
        _id: { $in: problemIds },
        embeddingGenerated: { $ne: true },
      }).lean();

      items = items.concat(
        problems.map((p) => ({
          id: p._id.toString(),
          text: p.statement,
          topicId: themeId.toString(),
          questionId: questionId,
          itemType: "problem",
        }))
      );
    }

    if (!itemType || itemType === "solution") {
      const solutionLinks = await QuestionLink.find({
        questionId,
        linkedItemType: "solution",
      });
      const solutionIds = solutionLinks.map((link) => link.linkedItemId);
      const solutions = await Solution.find({
        _id: { $in: solutionIds },
      }).lean();

      items = items.concat(
        solutions.map((s) => ({
          id: s._id.toString(),
          text: s.statement,
          topicId: themeId.toString(),
          questionId: questionId,
          itemType: "solution",
        }))
      );
    }

    if (items.length === 0) {
      return res.status(200).json({
        status: "no items to process",
      });
    }

    const theme = await Theme.findById(themeId).lean();
    const embeddingModel = theme?.embeddingModel ?? DEFAULT_EMBEDDING_MODEL;

    await generateEmbeddings(items, embeddingModel);

    const problemIds = items
      .filter((item) => item.itemType === "problem")
      .map((item) => item.id);
    const solutionIds = items
      .filter((item) => item.itemType === "solution")
      .map((item) => item.id);

    if (problemIds.length > 0) {
      await Problem.updateMany(
        { _id: { $in: problemIds } },
        { embeddingGenerated: true }
      );
    }

    if (solutionIds.length > 0) {
      await Solution.updateMany(
        { _id: { $in: solutionIds } },
        { embeddingGenerated: true }
      );
    }

    return res.status(200).json({
      status: "success",
      processedCount: items.length,
    });
  } catch (error) {
    console.error(
      `Error generating embeddings for question ${questionId}:`,
      error
    );
    return res.status(500).json({
      message: "Error generating embeddings",
      error: (error as Error).message,
    });
  }
};

/**
 * Search for problems or solutions related to a theme using vector similarity
 */
const searchTheme = async (req: Request, res: Response) => {
  const { themeId } = req.params;
  const { queryText, itemType, k = 10 } = req.query;

  if (!queryText) {
    return res.status(400).json({
      message: "queryText is required",
    });
  }

  if (!itemType || (itemType !== "problem" && itemType !== "solution")) {
    return res.status(400).json({
      message: "itemType must be 'problem' or 'solution'",
    });
  }

  try {
    const theme = await Theme.findById(themeId).lean();
    const embeddingModel = theme?.embeddingModel ?? DEFAULT_EMBEDDING_MODEL;

    const queryEmbedding = await generateTransientEmbedding(
      queryText as string,
      embeddingModel
    );

    const searchResult = (await searchVectors(
      queryEmbedding,
      {
        topicId: themeId,
        questionId: undefined,
        itemType,
      },
      Number.parseInt(k as string)
    )) as SearchResult;

    const ids = searchResult.results.map((item: { id: string }) => item.id);
    let items: Array<{
      _id: unknown;
      statement: string;
      createdAt: unknown;
      updatedAt: unknown;
    }> = [];

    if (itemType === "problem") {
      items = await Problem.find({ _id: { $in: ids } }).lean();
    } else {
      items = await Solution.find({ _id: { $in: ids } }).lean();
    }

    const resultsWithDetails = searchResult.results
      .map((result: { id: string; similarity: number }) => {
        const item = items.find((i) => String(i._id) === result.id);
        if (!item) return null;

        return {
          id: result.id,
          text: item.statement,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          similarity: result.similarity,
        };
      })
      .filter(Boolean);

    return res.status(200).json(resultsWithDetails);
  } catch (error) {
    console.error(`Error searching theme ${themeId}:`, error);
    return res.status(500).json({
      message: "Error searching",
      error: (error as Error).message,
    });
  }
};

/**
 * Search for problems or solutions related to a question using vector similarity
 */
const searchQuestion = async (req: Request, res: Response) => {
  const { questionId } = req.params;
  const { queryText, itemType, k = 10 } = req.query;

  if (!queryText) {
    return res.status(400).json({
      message: "queryText is required",
    });
  }

  if (!itemType || (itemType !== "problem" && itemType !== "solution")) {
    return res.status(400).json({
      message: "itemType must be 'problem' or 'solution'",
    });
  }

  try {
    const question = await SharpQuestion.findById(questionId);
    if (!question) {
      return res.status(404).json({
        message: "Question not found",
      });
    }

    const themeId = question.themeId;

    const theme = await Theme.findById(themeId).lean();
    const embeddingModel = theme?.embeddingModel ?? DEFAULT_EMBEDDING_MODEL;

    const queryEmbedding = await generateTransientEmbedding(
      queryText as string,
      embeddingModel
    );

    const searchResult = (await searchVectors(
      queryEmbedding,
      {
        topicId: themeId.toString(),
        questionId: questionId,
        itemType,
      },
      Number.parseInt(k as string)
    )) as SearchResult;

    const ids = searchResult.results.map((item: { id: string }) => item.id);
    let items: Array<{
      _id: unknown;
      statement: string;
      createdAt: unknown;
      updatedAt: unknown;
    }> = [];

    if (itemType === "problem") {
      items = await Problem.find({ _id: { $in: ids } }).lean();
    } else {
      items = await Solution.find({ _id: { $in: ids } }).lean();
    }

    const resultsWithDetails = searchResult.results
      .map((result: { id: string; similarity: number }) => {
        const item = items.find((i) => String(i._id) === result.id);
        if (!item) return null;

        return {
          id: result.id,
          text: item.statement,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          similarity: result.similarity,
        };
      })
      .filter(Boolean);

    return res.status(200).json(resultsWithDetails);
  } catch (error) {
    console.error(`Error searching question ${questionId}:`, error);
    return res.status(500).json({
      message: "Error searching",
      error: (error as Error).message,
    });
  }
};

/** クラスタリングツリーのノード型 */
interface ClusterNode {
  is_leaf?: boolean;
  item_id?: string;
  count?: number;
  children?: ClusterNode[];
}

// Helper function to recursively fetch text for leaf nodes in the tree
async function enrichTreeWithText(
  node: ClusterNode,
  itemType: string,
  itemMap: Map<string, string>
): Promise<object> {
  if (node.is_leaf) {
    const text =
      itemMap.get(node.item_id ?? "") || "（テキスト情報取得エラー）";
    return {
      id: node.item_id,
      text: text,
      is_leaf: true,
      count: node.count,
    };
  }

  // Recursively process children
  const enrichedChildren = node.children
    ? await Promise.all(
        node.children.map((child) =>
          enrichTreeWithText(child, itemType, itemMap)
        )
      )
    : [];

  return {
    is_leaf: false,
    children: enrichedChildren,
    count: node.count,
  };
}

/**
 * Cluster problems or solutions related to a theme
 */
const clusterTheme = async (req: Request, res: Response) => {
  const { themeId } = req.params;
  // Use 'let' for params so it can be modified
  let { itemType, method = "kmeans", params = { n_clusters: 5 } } = req.body;

  if (!itemType || (itemType !== "problem" && itemType !== "solution")) {
    return res.status(400).json({
      message: "itemType must be 'problem' or 'solution'",
    });
  }

  // Modify params based on method BEFORE calling the service
  if (method === "hierarchical") {
    params = {}; // Hierarchical clustering takes no parameters now
  } else if (method === "kmeans") {
    // Ensure kmeans always has n_clusters, default to 5 if not provided or invalid
    const nClusters = params?.n_clusters;
    params = {
      n_clusters:
        typeof nClusters === "number" &&
        Number.isInteger(nClusters) &&
        nClusters >= 2
          ? nClusters
          : 5, // Default to 5 if invalid or missing
    };
  }

  try {
    console.log(
      `Calling clusterVectors with method: ${method}, params:`,
      params
    );
    const clusterResult = (await clusterVectors(
      {
        topicId: themeId,
        questionId: undefined, // Assuming theme-level clustering
        itemType,
      },
      method,
      params
    )) as ClusterResult;

    if (
      !clusterResult ||
      clusterResult.clusters === null ||
      clusterResult.clusters === undefined ||
      (Array.isArray(clusterResult.clusters) &&
        clusterResult.clusters.length === 0) ||
      (typeof clusterResult.clusters === "object" &&
        !Array.isArray(clusterResult.clusters) &&
        Object.keys(clusterResult.clusters).length === 0)
    ) {
      console.log(
        `No items found or clustered for theme ${themeId}, itemType ${itemType}, method ${method}`
      );
      return res.status(200).json({
        message: "No items found or clustered",
        clusters: Array.isArray(clusterResult?.clusters) ? [] : null,
      });
    }

    let responsePayload: unknown;
    let idsToFetch: string[] = [];

    // Determine if the result is flat (kmeans) or hierarchical
    const isHierarchical =
      typeof clusterResult.clusters === "object" &&
      !Array.isArray(clusterResult.clusters);

    if (isHierarchical) {
      function extractIds(node: ClusterNode): string[] {
        if (!node) return [];
        if (node.is_leaf) {
          return node.item_id ? [node.item_id] : [];
        }
        let ids: string[] = [];
        if (node.children && Array.isArray(node.children)) {
          for (const child of node.children) {
            ids = ids.concat(extractIds(child));
          }
        }
        return ids;
      }
      idsToFetch = extractIds(clusterResult.clusters as ClusterNode);
    } else {
      if (Array.isArray(clusterResult.clusters)) {
        idsToFetch = clusterResult.clusters
          .map((item: { id: string }) => item.id)
          .filter((id: string) => id != null);
      } else {
        console.error(
          `Unexpected cluster result format for theme ${themeId}: Expected array but got ${typeof clusterResult.clusters}`
        );
        idsToFetch = [];
      }
    }

    // Filter unique IDs
    idsToFetch = [...new Set(idsToFetch)];

    // Fetch item details for all unique IDs found
    let items: Array<{ _id: unknown; statement: string }> = [];
    const itemMap = new Map<string, string>();
    if (idsToFetch.length > 0) {
      console.log(
        `Fetching details for ${idsToFetch.length} items (type: ${itemType})`
      );
      if (itemType === "problem") {
        items = await Problem.find({ _id: { $in: idsToFetch } }).lean();
      } else {
        items = await Solution.find({ _id: { $in: idsToFetch } }).lean();
      }
      for (const item of items) {
        itemMap.set(String(item._id), item.statement);
      }
      console.log(`Fetched details for ${itemMap.size} items.`);
    } else {
      console.log(`No IDs to fetch details for theme ${themeId}`);
    }

    if (isHierarchical) {
      console.log(`Enriching hierarchical tree for theme ${themeId}`);
      responsePayload = await enrichTreeWithText(
        clusterResult.clusters as ClusterNode,
        itemType,
        itemMap
      );
    } else {
      console.log(
        `Mapping text details to flat cluster results for theme ${themeId}`
      );
      if (Array.isArray(clusterResult.clusters)) {
        responsePayload = clusterResult.clusters.map(
          (item: { id: string }) => ({
            ...item,
            text: itemMap.get(item.id) || "（テキスト情報取得エラー）",
          })
        );
      } else {
        console.error(
          `Unexpected cluster result format during payload preparation for theme ${themeId}`
        );
        responsePayload = [];
      }
    }

    // Save the *original* cluster result (without text details) to the theme document
    const theme = await Theme.findById(themeId);
    if (theme) {
      if (!theme.clusteringResults) {
        theme.clusteringResults = new Map();
      }
      const paramKey =
        method === "kmeans"
          ? params.n_clusters || "default"
          : params.distance_threshold
            ? `dist_${params.distance_threshold}`
            : params.n_clusters
              ? `n_${params.n_clusters}`
              : "default";
      const clusterKey = `${itemType}_${method}_${paramKey}`;

      console.log(
        `Saving original clustering result to theme ${themeId} under key: ${clusterKey}`
      );
      theme.clusteringResults.set(clusterKey, clusterResult.clusters as object);
      theme.markModified("clusteringResults");
      await theme.save();
    } else {
      console.warn(
        `Theme not found for ID: ${themeId} when trying to save clustering results.`
      );
    }

    console.log(
      `Returning ${isHierarchical ? "hierarchical" : "flat"} clustering results for theme ${themeId}`
    );
    return res.status(200).json({ clusters: responsePayload });
  } catch (error) {
    console.error(`Error clustering theme ${themeId}:`, error);
    return res.status(500).json({
      message: "Error during clustering process",
      error: (error as Error).message,
    });
  }
};

/**
 * Cluster problems or solutions related to a question
 */
const clusterQuestion = async (req: Request, res: Response) => {
  const { questionId } = req.params;
  const { itemType, method = "kmeans", params = { n_clusters: 5 } } = req.body;

  if (!itemType || (itemType !== "problem" && itemType !== "solution")) {
    return res.status(400).json({
      message: "itemType must be 'problem' or 'solution'",
    });
  }

  try {
    const question = await SharpQuestion.findById(questionId);
    if (!question) {
      return res.status(404).json({
        message: "Question not found",
      });
    }

    const themeId = question.themeId;

    const clusterResult = (await clusterVectors(
      {
        topicId: themeId.toString(),
        questionId: questionId,
        itemType,
      },
      method,
      params
    )) as ClusterResult;

    if (
      !clusterResult.clusters ||
      (Array.isArray(clusterResult.clusters) &&
        clusterResult.clusters.length === 0)
    ) {
      return res.status(200).json({
        message: "No items to cluster",
        clusters: [],
      });
    }

    if (!question.clusteringResults) {
      question.clusteringResults = new Map();
    }

    const clusterKey = `${itemType}_${method}_${params.n_clusters || "custom"}`;
    question.clusteringResults.set(
      clusterKey,
      clusterResult.clusters as object
    );

    await question.save();

    return res.status(200).json(clusterResult);
  } catch (error) {
    console.error(`Error clustering question ${questionId}:`, error);
    return res.status(500).json({
      message: "Error clustering",
      error: (error as Error).message,
    });
  }
};

export {
  generateThemeEmbeddings,
  generateQuestionEmbeddings,
  searchTheme,
  searchQuestion,
  clusterTheme,
  clusterQuestion,
};
