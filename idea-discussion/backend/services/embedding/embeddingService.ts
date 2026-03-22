/**
 * 埋め込みベクトルサービス
 *
 * 目的: python-service（FastAPI）と通信して埋め込みベクトルの生成・検索・クラスタリングを行う。
 * 注意: python-service が起動していない場合はエラーになる。Docker Compose で起動すること。
 */

import axios from "axios";
import dotenv from "dotenv";
import { DEFAULT_EMBEDDING_MODEL } from "../../constants/pipelineStages.js";

dotenv.config();

const PYTHON_SERVICE_URL =
  process.env.PYTHON_SERVICE_URL || "http://python-service:8000";

/** python-service への共有 axios クライアント（タイムアウト 30 秒） */
const pythonServiceClient = axios.create({
  baseURL: PYTHON_SERVICE_URL,
  timeout: 30000,
});

/** 埋め込み生成リクエストのアイテム型 */
interface EmbeddingItem {
  id: string;
  text: string;
  topicId: string;
  questionId?: string;
  itemType: string;
}

/** ベクトル検索フィルター型（topicId・itemType は必須） */
interface VectorFilter {
  topicId: string;
  questionId?: string;
  itemType: string;
}

/** クラスタリングパラメーター型 */
interface ClusteringParams {
  n_clusters?: number;
  [key: string]: unknown;
}

/** 埋め込み生成レスポンス型（python-service EmbeddingResponse と対応） */
interface EmbeddingGenerationResponse {
  status: string;
  generatedCount: number;
  errors: string[];
}

/** ベクトル検索の1件結果型 */
interface SearchResult {
  id: string;
  similarity: number;
}

/** ベクトル検索レスポンス型（python-service SearchResponse と対応） */
interface SearchResponse {
  results: SearchResult[];
}

/** クラスタリングのアイテム型（kmeans 結果） */
interface ClusterItem {
  id: string;
  cluster: number;
}

/** クラスタリングレスポンス型（python-service ClusteringResponse と対応） */
interface ClusteringResponse {
  clusters: ClusterItem[] | Record<string, unknown> | null;
}

/**
 * アイテムリストの埋め込みベクトルを生成する
 * @param items - 埋め込み対象アイテムのリスト
 * @param model - 使用するEmbeddingモデル（省略時は DEFAULT_EMBEDDING_MODEL）
 * @param collectionName - 保存先 ChromaDB コレクション名
 * @returns python-service からのレスポンス
 */
async function generateEmbeddings(
  items: EmbeddingItem[],
  model = DEFAULT_EMBEDDING_MODEL,
  collectionName?: string
): Promise<EmbeddingGenerationResponse> {
  try {
    const response =
      await pythonServiceClient.post<EmbeddingGenerationResponse>(
        "/api/embeddings/generate",
        { items, model, collectionName }
      );
    return response.data;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error calling Python embedding service:", message);
    throw error;
  }
}

/**
 * テキストクエリの一時的な埋め込みベクトルを生成する
 * @param text - 埋め込み対象テキスト
 * @param model - 使用するEmbeddingモデル（省略時は DEFAULT_EMBEDDING_MODEL）
 * @returns 埋め込みベクトル配列
 */
async function generateTransientEmbedding(
  text: string,
  model = DEFAULT_EMBEDDING_MODEL
): Promise<number[]> {
  try {
    const response = await pythonServiceClient.post<{ embedding: number[] }>(
      "/api/embeddings/transient",
      { text, model }
    );
    return response.data.embedding;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error generating transient embedding:", message);
    throw error;
  }
}

/**
 * クエリベクトルに類似したベクトルを検索する
 * @param queryVector - クエリ埋め込みベクトル
 * @param filter - フィルター条件（topicId、questionId、itemType）
 * @param k - 返す結果数
 * @param collectionName - 検索対象 ChromaDB コレクション名
 * @returns python-service からの検索結果
 */
async function searchVectors(
  queryVector: number[],
  filter: VectorFilter,
  k = 10,
  collectionName?: string
): Promise<SearchResponse> {
  try {
    const response = await pythonServiceClient.post<SearchResponse>(
      "/api/vectors/search",
      { queryVector, filter, k, collectionName }
    );
    return response.data;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error searching vectors:", message);
    throw error;
  }
}

/**
 * フィルター条件に基づいてベクトルをクラスタリングする
 * @param filter - フィルター条件（topicId、questionId、itemType）
 * @param method - クラスタリング手法（'kmeans' または 'hierarchical'）
 * @param params - クラスタリングパラメーター
 * @param collectionName - 対象 ChromaDB コレクション名
 * @returns python-service からのクラスタリング結果
 */
async function clusterVectors(
  filter: VectorFilter,
  method = "kmeans",
  params: ClusteringParams = { n_clusters: 3 },
  collectionName?: string
): Promise<ClusteringResponse> {
  try {
    const response = await pythonServiceClient.post<ClusteringResponse>(
      "/api/vectors/cluster",
      { filter, method, params, collectionName }
    );
    return response.data;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error clustering vectors:", message);
    throw error;
  }
}

export {
  generateEmbeddings,
  generateTransientEmbedding,
  searchVectors,
  clusterVectors,
};
