/**
 * Embeddingコレクション名導出ユーティリティ
 *
 * 目的: テーマIDとEmbeddingモデルIDから ChromaDB コレクション名を生成する。
 * 命名規則: {themeId}_{sanitizedModelId}
 *   例: 507f1f77bcf86cd799439011_openai_text-embedding-3-small
 * 注意: ChromaDB のコレクション名に '/' は使えないため '_' に置換する。
 */

/**
 * テーマIDとモデルIDから ChromaDB コレクション名を導出する。
 * @param themeId - テーマの MongoDB ObjectId 文字列
 * @param model - Embeddingモデルのフルパス（例: "openai/text-embedding-3-small"）
 * @returns ChromaDB コレクション名
 */
export function deriveCollectionName(themeId: string, model: string): string {
  const sanitizedModel = model.replace(/\//g, "_");
  return `${themeId}_${sanitizedModel}`;
}
