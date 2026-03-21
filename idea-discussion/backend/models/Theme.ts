/**
 * テーマモデル
 *
 * 目的: いどばたビジョンのテーマ（議題）を管理する。
 *       status フィールド（draft/active/closed）でライフサイクルを管理する。
 *       - draft: 準備中。全フィールド編集可能。ユーザーからは非表示
 *       - active: 意見募集中。pipelineConfig/customPrompt の通常編集不可
 *       - closed: 終了（終端状態）。コメント不可。プロンプト完全ロック
 * 注意: status が唯一の真実の源。isActive/disableNewComment は廃止済み。
 *       一度 active になったテーマは draft に戻せない（過去の議論と整合性が取れなくなるため）。
 */

import mongoose from "mongoose";
import type { IPipelineStageConfig, ITheme } from "../types/index.js";

const pipelineStageConfigSchema = new mongoose.Schema<IPipelineStageConfig>(
  {
    model: { type: String, required: false },
    prompt: { type: String, required: false },
  },
  { _id: false }
);

const themeSchema = new mongoose.Schema<ITheme>(
  {
    title: {
      type: String,
      required: true,
      unique: true,
    },
    description: {
      type: String,
      required: false,
    },
    // テーマのライフサイクルステータス（唯一の真実の源）
    // draft → active → closed の一方向遷移のみ許可
    status: {
      type: String,
      enum: ["draft", "active", "closed"],
      default: "draft",
    },
    tags: {
      type: [{ type: String, trim: true, maxlength: 50 }],
      default: [],
    },
    customPrompt: {
      type: String,
      required: false,
    },
    // 透明性表示のON/OFFフラグ。nullの場合はSiteConfigの設定に従う
    showTransparency: {
      type: Boolean,
      default: null,
    },
    clusteringResults: {
      type: Map,
      of: Object,
      default: {},
    },
    // パイプラインステージ別のモデル/プロンプト設定
    // Map<stageId, { model?, prompt? }> 形式。未設定のステージはエントリなし
    pipelineConfig: {
      type: Map,
      of: pipelineStageConfigSchema,
      default: {},
    },
  },
  { timestamps: true }
);

const Theme = mongoose.model<ITheme>("Theme", themeSchema);

export default Theme;
