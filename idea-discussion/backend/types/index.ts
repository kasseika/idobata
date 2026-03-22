/**
 * idobata-idea-discussion-backend 共通型定義
 *
 * 目的: バックエンド全体で使用するMongooseドキュメント・API応答・サブ型を一元管理する。
 * 注意: 各interfaceは対応する.jsモデルのスキーマを正として定義している。
 *       .js版スキーマを変更した場合はこのファイルも合わせて更新すること。
 */

import { Document, Types } from "mongoose";
import type { Model } from "mongoose";

/** Mongooseの timestamps: true オプションで自動付与されるフィールド */
export interface BaseDocument extends Document {
  createdAt: Date;
  updatedAt: Date;
}

// =====================
// Theme
// =====================

/** Theme.pipelineConfig の各エントリ型 */
export interface IPipelineStageConfig {
  model?: string;
  prompt?: string;
}

/** テーマモデル（draft/active/closed のライフサイクルを管理） */
export interface ITheme extends BaseDocument {
  title: string;
  description?: string;
  status: "draft" | "active" | "closed";
  tags: string[];
  customPrompt?: string;
  /** 透明性表示フラグ。null の場合は SiteConfig の設定に従う */
  showTransparency: boolean | null;
  /** クラスタリング結果 Map<stageId, Object> */
  clusteringResults: Map<string, object>;
  /** パイプラインステージ別設定 Map<stageId, IPipelineStageConfig> */
  pipelineConfig: Map<string, IPipelineStageConfig>;
  /** 埋め込みベクトル生成に使用するモデル。未設定時は DEFAULT_EMBEDDING_MODEL を使用 */
  embeddingModel?: string;
}

// =====================
// SharpQuestion
// =====================

/** 重要論点モデル */
export interface ISharpQuestion extends BaseDocument {
  questionText: string;
  tagLine?: string;
  tags: string[];
  sourceProblemIds: Types.ObjectId[];
  themeId: Types.ObjectId;
  clusteringResults: Map<string, object>;
}

// =====================
// Problem
// =====================

/** 課題モデル */
export interface IProblem extends BaseDocument {
  statement: string;
  sourceOriginId: Types.ObjectId;
  sourceType: string;
  originalSnippets: string[];
  sourceMetadata: object;
  version: number;
  themeId: Types.ObjectId;
  embeddingGenerated: boolean;
}

// =====================
// Solution
// =====================

/** 解決策モデル */
export interface ISolution extends BaseDocument {
  statement: string;
  sourceOriginId: Types.ObjectId;
  sourceType: string;
  originalSnippets: string[];
  sourceMetadata: object;
  version: number;
  themeId: Types.ObjectId;
  embeddingGenerated: boolean;
}

// =====================
// ChatThread
// =====================

/** チャットメッセージのサブドキュメント型 */
export interface IChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

/** チャットスレッドモデル */
export interface IChatThread extends BaseDocument {
  userId: string;
  messages: IChatMessage[];
  extractedProblemIds: Types.ObjectId[];
  extractedSolutionIds: Types.ObjectId[];
  themeId: Types.ObjectId;
  questionId?: Types.ObjectId;
  /** 一時的なセッション識別子（オプション） */
  sessionId?: string;
}

// =====================
// User
// =====================

/** ユーザーモデル */
export interface IUser extends BaseDocument {
  userId: string;
  displayName: string | null;
  profileImagePath: string | null;
}

// =====================
// AdminUser
// =====================

/** AdminUser インスタンスメソッド型 */
export interface IAdminUserMethods {
  comparePassword(candidatePassword: string): Promise<boolean>;
}

/** 管理者ユーザーモデル */
export interface IAdminUser extends BaseDocument {
  name: string;
  email: string;
  password: string;
  role: "admin" | "editor";
  googleId: string | null;
  lastLogin: Date | null;
}

/** AdminUser の Model 型（メソッド付き） */
export type IAdminUserModel = Model<IAdminUser, object, IAdminUserMethods>;

// =====================
// SiteConfig
// =====================

/** サイト設定モデル */
export interface ISiteConfig extends BaseDocument {
  title: string;
  aboutMessage?: string;
  showTransparency: boolean;
}

// =====================
// ImportedItem
// =====================

/** インポートアイテムモデル */
export interface IImportedItem extends BaseDocument {
  sourceType: string;
  content: string;
  metadata?: object;
  status: "pending" | "processing" | "completed" | "failed";
  extractedProblemIds: Types.ObjectId[];
  extractedSolutionIds: Types.ObjectId[];
  themeId: Types.ObjectId;
  processedAt?: Date;
  errorMessage?: string;
}

// =====================
// Like
// =====================

/** いいねモデル */
export interface ILike extends BaseDocument {
  userId: string;
  targetId: Types.ObjectId;
  targetType: "question" | "problem" | "solution";
}

// =====================
// QuestionLink
// =====================

/** 重要論点とアイテムの関連付けモデル */
export interface IQuestionLink extends BaseDocument {
  questionId: Types.ObjectId;
  linkedItemId: Types.ObjectId;
  linkedItemType: "problem" | "solution";
  linkedItemTypeModel: "Problem" | "Solution";
  linkType: "prompts_question" | "answers_question";
  relevanceScore?: number;
  rationale?: string;
}

// =====================
// DebateAnalysis
// =====================

/** 議論の軸オプション型 */
export interface IDebateAxisOption {
  label: string;
  description: string;
}

/** 議論の軸型 */
export interface IDebateAxis {
  title: string;
  options: IDebateAxisOption[];
}

/** 議論分析モデル */
export interface IDebateAnalysis extends BaseDocument {
  questionId: Types.ObjectId;
  questionText: string;
  axes: IDebateAxis[];
  agreementPoints: string[];
  disagreementPoints: string[];
  sourceProblemIds: Types.ObjectId[];
  sourceSolutionIds: Types.ObjectId[];
  version: number;
}

// =====================
// DigestDraft
// =====================

/** ダイジェストドラフトモデル */
export interface IDigestDraft extends BaseDocument {
  questionId: Types.ObjectId;
  policyDraftId: Types.ObjectId;
  title: string;
  content: string;
  sourceProblemIds: Types.ObjectId[];
  sourceSolutionIds: Types.ObjectId[];
  version: number;
}

// =====================
// PolicyDraft
// =====================

/** 政策ドラフトモデル */
export interface IPolicyDraft extends BaseDocument {
  questionId: Types.ObjectId;
  title: string;
  content: string;
  sourceProblemIds: Types.ObjectId[];
  sourceSolutionIds: Types.ObjectId[];
  version: number;
}

// =====================
// ReportExample
// =====================

/** レポートサンプルのissueアイテム型 */
export interface IReportIssue {
  title: string;
  description: string;
}

/** レポートサンプルモデル */
export interface IReportExample extends BaseDocument {
  questionId: Types.ObjectId;
  introduction: string;
  issues: IReportIssue[];
  version: number;
}

// =====================
// QuestionVisualReport
// =====================

/** 重要論点ビジュアルレポートモデル */
export interface IQuestionVisualReport extends BaseDocument {
  questionId: Types.ObjectId;
  questionText: string;
  overallAnalysis: string;
  sourceProblemIds: Types.ObjectId[];
  sourceSolutionIds: Types.ObjectId[];
  version: number;
}

// =====================
// PipelineConfigChangeLog
// =====================

/** パイプライン設定変更ログモデル */
export interface IPipelineConfigChangeLog extends BaseDocument {
  themeId: Types.ObjectId;
  stageId: string;
  previousModel?: string;
  previousPrompt?: string;
  newModel?: string;
  newPrompt?: string;
  reason: string;
  changedBy?: Types.ObjectId;
  changedAt: Date;
}

// =====================
// API応答型
// =====================

/** 汎用API応答型 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/** ページネーション付きAPI応答型 */
export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  limit: number;
}

/** いいね操作の応答型 */
export interface LikeResponse {
  liked: boolean;
  count: number;
}
