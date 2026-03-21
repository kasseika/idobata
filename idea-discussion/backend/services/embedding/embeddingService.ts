/**
 * 埋め込みベクトルサービス
 *
 * 目的: python-service（FastAPI）と通信して埋め込みベクトルの生成・検索・クラスタリングを行う。
 * 注意: python-service が起動していない場合はエラーになる。Docker Compose で起動すること。
 */

import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const PYTHON_SERVICE_URL =
  process.env.PYTHON_SERVICE_URL || "http://python-service:8000";

/** 埋め込み生成リクエストのアイテム型 */
interface EmbeddingItem {
  id: string;
  text: string;
  topicId: string;
  questionId?: string;
  itemType: string;
}

/** ベクトル検索フィルター型 */
interface VectorFilter {
  topicId?: string;
  questionId?: string;
  itemType?: string;
}

/** クラスタリングパラメーター型 */
interface ClusteringParams {
  n_clusters?: number;
  [key: string]: unknown;
}

/**
 * アイテムリストの埋め込みベクトルを生成する
 * @param items - 埋め込み対象アイテムのリスト
 * @returns python-service からのレスポンス
 */
async function generateEmbeddings(items: EmbeddingItem[]): Promise<unknown> {
  try {
    const response = await axios.post(
      `${PYTHON_SERVICE_URL}/api/embeddings/generate`,
      {
        items,
      }
    );
    return response.data;
  } catch (error) {
    console.error("Error calling Python embedding service:", error);
    throw error;
  }
}

/**
 * テキストクエリの一時的な埋め込みベクトルを生成する
 * @param text - 埋め込み対象テキスト
 * @returns 埋め込みベクトル配列
 */
async function generateTransientEmbedding(text: string): Promise<number[]> {
  try {
    const response = await axios.post(
      `${PYTHON_SERVICE_URL}/api/embeddings/transient`,
      {
        text,
      }
    );
    return response.data.embedding;
  } catch (error) {
    console.error("Error generating transient embedding:", error);
    throw error;
  }
}

/**
 * クエリベクトルに類似したベクトルを検索する
 * @param queryVector - クエリ埋め込みベクトル
 * @param filter - フィルター条件（topicId、questionId、itemType）
 * @param k - 返す結果数
 * @returns python-service からの検索結果
 */
async function searchVectors(
  queryVector: number[],
  filter: VectorFilter,
  k = 10
): Promise<unknown> {
  try {
    const response = await axios.post(
      `${PYTHON_SERVICE_URL}/api/vectors/search`,
      {
        queryVector,
        filter,
        k,
      }
    );
    return response.data;
  } catch (error) {
    console.error("Error searching vectors:", error);
    throw error;
  }
}

/**
 * フィルター条件に基づいてベクトルをクラスタリングする
 * @param filter - フィルター条件（topicId、questionId、itemType）
 * @param method - クラスタリング手法（'kmeans' または 'hierarchical'）
 * @param params - クラスタリングパラメーター
 * @returns python-service からのクラスタリング結果
 */
async function clusterVectors(
  filter: VectorFilter,
  method = "kmeans",
  params: ClusteringParams = { n_clusters: 3 }
): Promise<unknown> {
  try {
    const response = await axios.post(
      `${PYTHON_SERVICE_URL}/api/vectors/cluster`,
      {
        filter,
        method,
        params,
      }
    );
    return response.data;
  } catch (error) {
    console.error("Error clustering vectors:", error);
    throw error;
  }
}

export {
  generateEmbeddings,
  generateTransientEmbedding,
  searchVectors,
  clusterVectors,
};
