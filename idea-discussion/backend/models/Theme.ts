/**
 * テーマモデル
 *
 * 目的: いどばたビジョンのテーマ（議題）を管理する。
 *       status フィールド（draft/active/closed/archived）でライフサイクルを管理する。
 *       - draft: 準備中。全フィールド編集可能。ユーザーからは非表示
 *       - active: 意見募集中。pipelineConfig/customPrompt の通常編集不可
 *       - closed: 募集終了。チャット不可・閲覧可能。プロンプト完全ロック
 *       - archived: 完全非公開。一般ユーザーからはアクセス不可（404）。closed に戻せる
 * 注意: status が唯一の真実の源。isActive/disableNewComment は廃止済み。
 *       一度 active になったテーマは draft に戻せない（過去の議論と整合性が取れなくなるため）。
 */

import mongoose from "mongoose";
import {
  MIN_CONTRIBUTORS_LOWER_BOUND,
  isValidMinContributors,
} from "../constants/minContributors.js";
import { DEFAULT_EMBEDDING_MODEL } from "../constants/pipelineStages.js";
import type { IPipelineStageConfig, ITheme } from "../types/index.js";

/** 許可されている Embedding モデルの一覧 */
export const ALLOWED_EMBEDDING_MODELS = [
  DEFAULT_EMBEDDING_MODEL,
  "openai/text-embedding-3-large",
  "google/gemini-embedding-001",
  "qwen/qwen3-embedding-8b",
] as const;

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
    // draft → active → closed ⇄ archived（draft/active への逆遷移は不可）
    status: {
      type: String,
      enum: ["draft", "active", "closed", "archived"],
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
    // 最小寄与人数 k。null は無効（従来どおりの挙動）
    // k が有効なテーマでは、k 人以上が寄与した重要論点だけを参加者・管理者に表示する（issue #146）
    // draft のときだけ設定・変更できる（themeController の updateTheme で制御）
    minContributors: {
      type: Number,
      default: null,
      validate: {
        validator: isValidMinContributors,
        message: `minContributors は null または ${MIN_CONTRIBUTORS_LOWER_BOUND} 以上の整数を指定してください`,
      },
    },
    // パイプラインステージ別のモデル/プロンプト設定
    // Map<stageId, { model?, prompt? }> 形式。未設定のステージはエントリなし
    pipelineConfig: {
      type: Map,
      of: pipelineStageConfigSchema,
      default: {},
    },
    // 埋め込みベクトル生成に使用するモデル。未設定時は DEFAULT_EMBEDDING_MODEL を使用
    embeddingModel: {
      type: String,
      required: false,
      enum: {
        values: ALLOWED_EMBEDDING_MODELS,
        message: `embeddingModel は次のいずれかを指定してください: ${ALLOWED_EMBEDDING_MODELS.join(", ")}`,
      },
    },
    // モデル別に生成済みの ChromaDB コレクション情報
    availableEmbeddingCollections: {
      type: [
        {
          model: { type: String, required: true },
          collectionName: { type: String, required: true },
          generatedAt: { type: Date, required: true },
          itemCount: { type: Number, required: true },
          _id: false,
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

const Theme = mongoose.model<ITheme>("Theme", themeSchema);

export default Theme;
