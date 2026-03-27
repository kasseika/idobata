export interface PipelineStageConfig {
  model?: string;
  prompt?: string;
}

export interface PipelineStageDefault {
  id: string;
  name: string;
  description: string;
  defaultModel: string;
  defaultPrompt: string;
  order: number;
}

/**
 * テーマのライフサイクルステータス
 *
 * 遷移ルール: draft → active → closed ⇄ archived
 * - draft: 下書き。一般ユーザーには非表示。全フィールド編集可能
 * - active: 公開中。意見募集中。プロンプト編集ロック（緊急修正APIを使用）
 * - closed: 募集終了。チャット不可・閲覧可能。プロンプト編集ロック
 * - archived: 完全非公開。一般ユーザーはアクセス不可（404）。closed に戻せる
 */
export type ThemeStatus = "draft" | "active" | "closed" | "archived";

/** 生成済みEmbeddingコレクション情報 */
export interface EmbeddingCollectionInfo {
  /** Embeddingモデルのフルパス（例: "openai/text-embedding-3-small"） */
  model: string;
  /** ChromaDB コレクション名 */
  collectionName: string;
  /** 最終生成日時 */
  generatedAt: string;
  /** 生成済みアイテム数 */
  itemCount: number;
}

export interface Theme {
  _id: string;
  title: string;
  description?: string;
  /** テーマのライフサイクルステータス。draft: 準備中、active: 公開中、closed: 終了（終端） */
  status: ThemeStatus;
  customPrompt?: string;
  tags?: string[];
  pipelineConfig?: Record<string, PipelineStageConfig>;
  /** 埋め込みベクトル生成に使用するモデル。未設定時はデフォルトモデルを使用 */
  embeddingModel?: string;
  /** 生成済みEmbeddingコレクション一覧（モデル別） */
  availableEmbeddingCollections?: EmbeddingCollectionInfo[];
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateThemePayload {
  title: string;
  description?: string;
  /** テーマのライフサイクルステータス。未指定の場合は "draft" */
  status?: ThemeStatus;
  customPrompt?: string;
  tags?: string[];
  pipelineConfig?: Record<string, PipelineStageConfig>;
  /** 埋め込みベクトル生成に使用するモデル。省略時はデフォルトモデル（openai/text-embedding-3-small）を使用 */
  embeddingModel?: string;
}

export interface UpdateThemePayload {
  title?: string;
  description?: string;
  /** テーマのライフサイクルステータス。draft→active→closed の一方向遷移のみ許可 */
  status?: ThemeStatus;
  customPrompt?: string;
  tags?: string[];
  pipelineConfig?: Record<string, PipelineStageConfig>;
  /** 埋め込みベクトル生成に使用するモデル。省略時はデフォルトモデル（openai/text-embedding-3-small）を使用 */
  embeddingModel?: string;
}

/** パイプライン設定の緊急修正リクエスト */
export interface EmergencyUpdatePipelineConfigPayload {
  stageId: string;
  model?: string;
  prompt?: string;
  /** 変更理由（必須） */
  reason: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface UserResponse {
  user: User;
}

export interface CreateUserPayload {
  name: string;
  email: string;
  password: string;
  role?: string;
}

export interface SetupStatusResponse {
  needsSetup: boolean;
}

export interface InitializeAdminResponse {
  message: string;
  user: User;
}

export interface SiteConfig {
  _id: string;
  title: string;
  aboutMessage: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface UpdateSiteConfigPayload {
  title: string;
  aboutMessage: string;
}

/** システム設定レスポンス（APIキーは実値を返さずマスク表示のみ） */
export interface SystemConfig {
  /** APIキーが設定済みかどうかのフラグ */
  hasOpenrouterApiKey: boolean;
  /** APIキーの部分マスク表示（例: "sk-or-v1-abc...xyz"）。未設定時はnull */
  openrouterApiKeyMasked: string | null;
}

/** システム設定更新リクエスト */
export interface UpdateSystemConfigPayload {
  openrouterApiKey: string;
}

export interface VectorSearchResult {
  id: string;
  text: string;
  createdAt: string;
  updatedAt: string;
  similarity: number;
}

export interface VectorSearchParams {
  queryText: string;
  itemType: "problem" | "solution";
  k?: number;
  /** 使用するEmbeddingモデル。省略時はテーマ設定のモデルを使用 */
  model?: string;
}

export interface ClusteringParams {
  itemType: "problem" | "solution";
  method?: "kmeans" | "hierarchical";
  params?: {
    // For K-Means and optionally Hierarchical
    n_clusters?: number;
    // Specifically for Hierarchical
    distance_threshold?: number;
    // Linkage method could also be added here if needed
    // linkage?: 'ward' | 'complete' | 'average' | 'single';
  };
  /** 使用するEmbeddingモデル。省略時はテーマ設定のモデルを使用 */
  model?: string;
}

// Represents a single item with its assigned cluster ID from the clustering API
export interface ClusteredItem {
  id: string; // ID of the item (e.g., problem ID, solution ID)
  cluster: number; // The index of the cluster this item belongs to
  text?: string; // Optional text content of the item (may not be present depending on API)
}

// Define the hierarchical node structure (matches backend enrichment)
export interface HierarchicalClusterNode {
  is_leaf: boolean;
  count: number;
  // For leaf nodes
  id?: string;
  text?: string;
  // For internal nodes
  children?: HierarchicalClusterNode[];
  // Optional: distance if provided by backend
  // distance?: number;
}

// Represents the overall result from the clustering API
export interface ClusteringResult {
  // clusters can now be an array (kmeans) or a single root node object (hierarchical), or null if empty
  clusters: ClusteredItem[] | HierarchicalClusterNode | null;
  message?: string; // Optional message from backend
}

export interface Question {
  _id: string;
  themeId: string;
  questionText: string;
  tagLine?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Problem {
  _id: string;
  statement: string;
  themeId: string;
  sourceType: string;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionWithProblems extends Question {
  relatedProblems?: Problem[];
}

/** テーマインポートの件数統計 */
export interface ImportCounts {
  chatThreads: number;
  importedItems: number;
  problems: number;
  solutions: number;
  sharpQuestions: number;
  pipelineConfigChangeLogs: number;
  policyDrafts: number;
  digestDrafts: number;
  debateAnalyses: number;
  questionVisualReports: number;
  questionLinks: number;
  reportExamples: number;
  likes: number;
}

/** テーマインポート結果 */
export interface ThemeImportStats {
  themeId: string;
  themeTitle: string;
  counts: ImportCounts;
}

/** チャットメッセージ */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

/** スレッド一覧のサマリー項目（管理者用） */
export interface ChatThreadSummary {
  _id: string;
  userId: string;
  themeId: string;
  /** テーマレベルのスレッドでは null が返る場合がある */
  questionId?: string | null;
  messageCount: number;
  /** メッセージ数0件のスレッドはAPIで除外されるため常に存在する */
  lastMessage: ChatMessage;
  createdAt: string;
  updatedAt: string;
}

/** ページネーション情報 */
export interface PaginationInfo {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** スレッド一覧APIレスポンス（管理者用） */
export interface ChatThreadListResponse {
  threads: ChatThreadSummary[];
  pagination: PaginationInfo;
}

/** スレッド詳細APIレスポンス */
export interface ChatThreadDetail {
  threadId: string;
  userId: string;
  themeId: string;
  messages: ChatMessage[];
}
