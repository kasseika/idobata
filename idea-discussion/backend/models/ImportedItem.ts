/**
 * インポートアイテムモデル
 *
 * 目的: 外部から一括インポートされたデータ（ツイート・CSVなど）を管理する。
 *       status フィールドで処理状態（pending/processing/completed/failed）を追跡する。
 * 注意: metadata フィールドは柔軟な構造を持ち、ソース種別によって内容が異なる。
 */

import mongoose from "mongoose";
import type { IImportedItem } from "../types/index.js";

const ImportedItemSchema = new mongoose.Schema<IImportedItem>({
  sourceType: {
    type: String,
    required: true,
    // Removed enum constraint to allow any string value
    index: true,
  },
  content: {
    type: String,
    required: true,
  },
  metadata: {
    type: Object, // Flexible structure for various metadata (e.g., tweetId, author, url, timestamp)
  },
  status: {
    type: String,
    required: true,
    enum: ["pending", "processing", "completed", "failed"],
    default: "pending",
    index: true,
  },
  extractedProblemIds: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Problem",
    },
  ],
  extractedSolutionIds: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Solution",
    },
  ],
  themeId: {
    // 追加：所属するテーマのID
    type: mongoose.Schema.Types.ObjectId,
    ref: "Theme",
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  processedAt: {
    type: Date,
  },
  errorMessage: {
    type: String,
  },
});

export default mongoose.model<IImportedItem>(
  "ImportedItem",
  ImportedItemSchema
);
