/**
 * 課題モデル
 *
 * 目的: チャットスレッドまたはインポートアイテムから抽出された課題を管理する。
 * 注意: sourceOriginId の参照先は sourceType によって ChatThread または ImportedItem になる。
 *       embeddingGeneratedCollections 配列に含まれるコレクション名は python-service で埋め込みベクトル生成済みを示す（コレクション単位で管理）。
 */

import mongoose from "mongoose";
import type { IProblem } from "../types/index.js";

const problemSchema = new mongoose.Schema<IProblem>(
  {
    statement: {
      // 単体で理解可能な課題文
      type: String,
      required: true,
    },
    sourceOriginId: {
      // 抽出元の `chat_threads` ID または `imported_items` ID
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      // We can't use a simple ref here as it could be ChatThread or ImportedItem.
      // We'll rely on sourceType to know which collection to query.
    },
    sourceType: {
      // データソース種別
      type: String,
      required: true,
      // Removed enum constraint to allow any string value
    },
    originalSnippets: {
      // (任意) 抽出の元になったユーザー発言の断片
      type: [String],
      default: [],
    },
    sourceMetadata: {
      // (任意) ソースに関する追加情報 (例: tweet ID, URL, author)
      type: Object,
      default: {},
    },
    version: {
      // 更新版管理用バージョン番号
      type: Number,
      required: true,
      default: 1,
    },
    themeId: {
      // 追加：所属するテーマのID
      type: mongoose.Schema.Types.ObjectId,
      ref: "Theme",
      required: true,
    },
    embeddingGeneratedCollections: {
      type: [String],
      default: [],
      index: true,
    },
  },
  { timestamps: true }
); // createdAt, updatedAt を自動追加

const Problem = mongoose.model<IProblem>("Problem", problemSchema);

export default Problem;
