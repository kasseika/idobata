/**
 * テーマ エクスポート/インポート 型定義とバリデーション
 *
 * 目的: テーマとその全関連データをJSON形式でエクスポート・インポートするための型定義と
 *       バリデーション関数を提供する。
 *
 * 設計:
 *   - _exportId: ファイル内の論理ID。プレフィックスで種別を識別（ct_, p_, s_, q_ 等）
 *   - _originalId: 元環境のMongoDB ObjectID（デバッグ用。インポート時には使用しない）
 *   - 全ての内部参照は _exportId で表現する
 *   - ChromaDB/クラスタリング関連フィールドはインポート先で再生成するため除外する
 *
 * バージョン:
 *   - "1.0.0": 初期バージョン
 */

import { type Result, err, ok } from "neverthrow";

/** サポートされているエクスポートバージョン一覧 */
export const SUPPORTED_EXPORT_VERSIONS = ["1.0.0"] as const;
export type ExportVersion = (typeof SUPPORTED_EXPORT_VERSIONS)[number];

// =====================
// エクスポートデータのサブ型
// =====================

/** エクスポートされたテーマの基本情報（clusteringResults/availableEmbeddingCollections は除外） */
export interface ExportTheme {
  title: string;
  description?: string | null;
  /** エクスポート元のステータス（インポート時は常に draft に変換される） */
  status: "draft" | "active" | "closed" | "archived";
  tags: string[];
  customPrompt?: string | null;
  /** Map<stageId, {model?, prompt?}> をシリアライズしたオブジェクト */
  pipelineConfig: Record<string, { model?: string; prompt?: string }>;
  embeddingModel?: string | null;
  showTransparency: boolean | null;
  createdAt: string;
  updatedAt: string;
}

/** エクスポートされたチャットメッセージ */
export interface ExportChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

/** エクスポートされたチャットスレッド */
export interface ExportChatThread {
  _exportId: string;
  _originalId: string;
  userId: string;
  messages: ExportChatMessage[];
  /** Problem の _exportId 配列 */
  extractedProblemIds: string[];
  /** Solution の _exportId 配列 */
  extractedSolutionIds: string[];
  sessionId: string | null;
  /** SharpQuestion の _exportId（任意） */
  questionId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** エクスポートされたインポートアイテム */
export interface ExportImportedItem {
  _exportId: string;
  _originalId: string;
  sourceType: string;
  content: string;
  metadata?: object;
  status: "pending" | "processing" | "completed" | "failed";
  /** Problem の _exportId 配列 */
  extractedProblemIds: string[];
  /** Solution の _exportId 配列 */
  extractedSolutionIds: string[];
  createdAt: string;
  updatedAt: string;
  processedAt?: string | null;
  errorMessage?: string | null;
}

/** エクスポートされた課題（embeddingGeneratedCollections は除外） */
export interface ExportProblem {
  _exportId: string;
  _originalId: string;
  statement: string;
  /** ChatThread または ImportedItem の _exportId */
  sourceOriginId: string;
  sourceType: string;
  originalSnippets: string[];
  sourceMetadata?: object;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** エクスポートされた解決策（embeddingGeneratedCollections は除外） */
export interface ExportSolution {
  _exportId: string;
  _originalId: string;
  statement: string;
  /** ChatThread または ImportedItem の _exportId */
  sourceOriginId: string;
  sourceType: string;
  originalSnippets: string[];
  sourceMetadata?: object;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** エクスポートされた重要論点（clusteringResults は除外） */
export interface ExportSharpQuestion {
  _exportId: string;
  _originalId: string;
  questionText: string;
  tagLine?: string | null;
  tags: string[];
  /** Problem の _exportId 配列 */
  sourceProblemIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** エクスポートされたパイプライン設定変更ログ（changedBy は null に変換） */
export interface ExportPipelineConfigChangeLog {
  _exportId: string;
  _originalId: string;
  stageId: string;
  previousModel?: string | null;
  previousPrompt?: string | null;
  newModel?: string | null;
  newPrompt?: string | null;
  reason: string;
  /** 元環境の管理者IDは再現不可能なため null */
  changedBy: null;
  changedAt: string;
  createdAt: string;
  updatedAt: string;
}

/** エクスポートされた政策ドラフト */
export interface ExportPolicyDraft {
  _exportId: string;
  _originalId: string;
  /** SharpQuestion の _exportId */
  questionId: string;
  title: string;
  content: string;
  /** Problem の _exportId 配列 */
  sourceProblemIds: string[];
  /** Solution の _exportId 配列 */
  sourceSolutionIds: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** エクスポートされたダイジェストドラフト */
export interface ExportDigestDraft {
  _exportId: string;
  _originalId: string;
  /** SharpQuestion の _exportId */
  questionId: string;
  /** PolicyDraft の _exportId */
  policyDraftId: string;
  title: string;
  content: string;
  /** Problem の _exportId 配列 */
  sourceProblemIds: string[];
  /** Solution の _exportId 配列 */
  sourceSolutionIds: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** エクスポートされた議論分析の軸オプション */
export interface ExportDebateAxisOption {
  label: string;
  description: string;
}

/** エクスポートされた議論分析の軸 */
export interface ExportDebateAxis {
  title: string;
  options: ExportDebateAxisOption[];
}

/** エクスポートされた議論分析 */
export interface ExportDebateAnalysis {
  _exportId: string;
  _originalId: string;
  /** SharpQuestion の _exportId */
  questionId: string;
  questionText: string;
  axes: ExportDebateAxis[];
  agreementPoints: string[];
  disagreementPoints: string[];
  sourceProblemIds: string[];
  sourceSolutionIds: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** エクスポートされた重要論点ビジュアルレポート */
export interface ExportQuestionVisualReport {
  _exportId: string;
  _originalId: string;
  /** SharpQuestion の _exportId */
  questionId: string;
  questionText: string;
  overallAnalysis: string;
  /** Problem の _exportId 配列 */
  sourceProblemIds: string[];
  /** Solution の _exportId 配列 */
  sourceSolutionIds: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** エクスポートされた重要論点関連付け */
export interface ExportQuestionLink {
  _exportId: string;
  _originalId: string;
  /** SharpQuestion の _exportId */
  questionId: string;
  /** Problem または Solution の _exportId */
  linkedItemId: string;
  linkedItemType: "problem" | "solution";
  linkType: "prompts_question" | "answers_question";
  relevanceScore?: number | null;
  rationale?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** エクスポートされたレポートサンプルのissueアイテム */
export interface ExportReportIssue {
  title: string;
  description: string;
}

/** エクスポートされたレポートサンプル */
export interface ExportReportExample {
  _exportId: string;
  _originalId: string;
  /** SharpQuestion の _exportId */
  questionId: string;
  introduction: string;
  issues: ExportReportIssue[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** エクスポートされたいいね */
export interface ExportLike {
  _exportId: string;
  _originalId: string;
  userId: string;
  /** SharpQuestion/Problem/Solution の _exportId */
  targetId: string;
  targetType: "question" | "problem" | "solution";
  createdAt: string;
  updatedAt: string;
}

// =====================
// エクスポートデータのルート型
// =====================

/**
 * テーマ全体のエクスポートデータ型
 *
 * この型のオブジェクトがエクスポートJSONのルートとなる。
 * インポート時はこの型に対してバリデーションを実施してからインポート処理を行う。
 */
export interface ThemeExportData {
  /** エクスポートフォーマットのバージョン */
  version: ExportVersion;
  /** エクスポート日時（ISO8601形式） */
  exportedAt: string;
  /** テーマの基本情報 */
  theme: ExportTheme;
  chatThreads: ExportChatThread[];
  importedItems: ExportImportedItem[];
  problems: ExportProblem[];
  solutions: ExportSolution[];
  sharpQuestions: ExportSharpQuestion[];
  pipelineConfigChangeLogs: ExportPipelineConfigChangeLog[];
  policyDrafts: ExportPolicyDraft[];
  digestDrafts: ExportDigestDraft[];
  debateAnalyses: ExportDebateAnalysis[];
  questionVisualReports: ExportQuestionVisualReport[];
  questionLinks: ExportQuestionLink[];
  reportExamples: ExportReportExample[];
  /** いいねデータ（エクスポート時のオプション設定に応じて含まれる場合がある。省略時は空配列として扱う） */
  likes: ExportLike[];
}

// =====================
// バリデーション
// =====================

/** バリデーションエラー型 */
export class ExportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExportValidationError";
  }
}

/**
 * エクスポートデータのバリデーション
 *
 * @param data - バリデーション対象のデータ（unknown型でも受け付ける）
 * @returns 有効なデータは ok(data)、無効なデータは err(ExportValidationError) を返す
 *
 * 検証内容:
 *   1. version フィールドの存在とサポート対象バージョンチェック
 *   2. theme フィールドと必須フィールドの存在チェック
 *   3. 全コレクションの _exportId 参照整合性チェック
 */
export function validateExportData(
  data: unknown
): Result<ThemeExportData, ExportValidationError> {
  // --- 1. 基本的な型チェック ---
  if (typeof data !== "object" || data === null) {
    return err(
      new ExportValidationError(
        "エクスポートデータがオブジェクトではありません"
      )
    );
  }

  const obj = data as Record<string, unknown>;

  // --- 2. version チェック ---
  if (
    !("version" in obj) ||
    obj.version === undefined ||
    obj.version === null
  ) {
    return err(
      new ExportValidationError("必須フィールドが不足しています: version")
    );
  }

  if (!SUPPORTED_EXPORT_VERSIONS.includes(obj.version as ExportVersion)) {
    return err(
      new ExportValidationError(
        `サポートされていないエクスポートバージョンです: ${obj.version}`
      )
    );
  }

  // --- 2.5. exportedAt チェック ---
  if (
    !("exportedAt" in obj) ||
    typeof obj.exportedAt !== "string" ||
    !obj.exportedAt
  ) {
    return err(
      new ExportValidationError("必須フィールドが不足しています: exportedAt")
    );
  }

  // --- 3. theme チェック ---
  if (!("theme" in obj) || obj.theme === undefined || obj.theme === null) {
    return err(
      new ExportValidationError("必須フィールドが不足しています: theme")
    );
  }

  const theme = obj.theme as Record<string, unknown>;
  if (!theme.title || typeof theme.title !== "string") {
    return err(
      new ExportValidationError("必須フィールドが不足しています: theme.title")
    );
  }

  // --- 4. コレクションの存在チェック（配列であること）---
  // likes は省略可能（エクスポート時に includeLikes: false の場合は含まれない）
  const requiredArrayFields = [
    "chatThreads",
    "importedItems",
    "problems",
    "solutions",
    "sharpQuestions",
    "pipelineConfigChangeLogs",
    "policyDrafts",
    "digestDrafts",
    "debateAnalyses",
    "questionVisualReports",
    "questionLinks",
    "reportExamples",
  ];

  for (const field of requiredArrayFields) {
    if (!Array.isArray(obj[field])) {
      return err(
        new ExportValidationError(
          `必須フィールドが不足しています: ${field}（配列であること）`
        )
      );
    }
  }

  const exportData = data as ThemeExportData;

  // likes が省略されている場合は空配列に正規化する
  if (!Array.isArray(exportData.likes)) {
    (exportData as unknown as Record<string, unknown>).likes = [];
  }

  // --- 5. 参照整合性チェック ---
  try {
    const referenceCheckResult = validateReferences(exportData);
    if (referenceCheckResult.isErr()) {
      return err(referenceCheckResult.error);
    }
  } catch (e) {
    return err(
      new ExportValidationError(
        `参照整合性チェック中にエラーが発生しました: ${e instanceof Error ? e.message : String(e)}`
      )
    );
  }

  return ok(exportData);
}

/**
 * エクスポートデータ内の _exportId 参照整合性を検証する
 *
 * 全ての _exportId 参照先が実際に存在することを確認する。
 * 参照元 -> 参照先の関係:
 *   - chatThread.extractedProblemIds -> problems
 *   - chatThread.extractedSolutionIds -> solutions
 *   - chatThread.questionId -> sharpQuestions
 *   - importedItem.extractedProblemIds -> problems
 *   - importedItem.extractedSolutionIds -> solutions
 *   - problem.sourceOriginId -> chatThreads | importedItems
 *   - solution.sourceOriginId -> chatThreads | importedItems
 *   - sharpQuestion.sourceProblemIds -> problems
 *   - policyDraft.questionId -> sharpQuestions
 *   - policyDraft.sourceProblemIds -> problems
 *   - policyDraft.sourceSolutionIds -> solutions
 *   - digestDraft.questionId -> sharpQuestions
 *   - digestDraft.policyDraftId -> policyDrafts
 *   - digestDraft.sourceProblemIds -> problems
 *   - digestDraft.sourceSolutionIds -> solutions
 *   - debateAnalysis.questionId -> sharpQuestions
 *   - questionVisualReport.questionId -> sharpQuestions
 *   - questionLink.questionId -> sharpQuestions
 *   - questionLink.linkedItemId -> problems | solutions
 *   - reportExample.questionId -> sharpQuestions
 *   - like.targetId -> sharpQuestions | problems | solutions
 */
function validateReferences(
  data: ThemeExportData
): Result<void, ExportValidationError> {
  // _exportId のセットを構築
  const problemIds = new Set(data.problems.map((p) => p._exportId));
  const solutionIds = new Set(data.solutions.map((s) => s._exportId));
  const chatThreadIds = new Set(data.chatThreads.map((ct) => ct._exportId));
  const importedItemIds = new Set(data.importedItems.map((ii) => ii._exportId));
  const sharpQuestionIds = new Set(data.sharpQuestions.map((q) => q._exportId));
  const policyDraftIds = new Set(data.policyDrafts.map((pd) => pd._exportId));
  const sourceOriginIds = new Set([...chatThreadIds, ...importedItemIds]);

  /** 指定された _exportId が指定のセットに存在するか検証するヘルパー */
  function checkRef(
    id: string,
    validSet: Set<string>,
    context: string
  ): Result<void, ExportValidationError> {
    if (!validSet.has(id)) {
      return err(
        new ExportValidationError(
          `参照整合性エラー: ${context} で参照されている _exportId "${id}" が見つかりません`
        )
      );
    }
    return ok(undefined);
  }

  // chatThread の参照チェック
  for (const ct of data.chatThreads) {
    for (const pid of ct.extractedProblemIds) {
      const r = checkRef(
        pid,
        problemIds,
        `chatThread(${ct._exportId}).extractedProblemIds`
      );
      if (r.isErr()) return r;
    }
    for (const sid of ct.extractedSolutionIds) {
      const r = checkRef(
        sid,
        solutionIds,
        `chatThread(${ct._exportId}).extractedSolutionIds`
      );
      if (r.isErr()) return r;
    }
    if (ct.questionId !== null && ct.questionId !== undefined) {
      const r = checkRef(
        ct.questionId,
        sharpQuestionIds,
        `chatThread(${ct._exportId}).questionId`
      );
      if (r.isErr()) return r;
    }
  }

  // importedItem の参照チェック
  for (const ii of data.importedItems) {
    for (const pid of ii.extractedProblemIds) {
      const r = checkRef(
        pid,
        problemIds,
        `importedItem(${ii._exportId}).extractedProblemIds`
      );
      if (r.isErr()) return r;
    }
    for (const sid of ii.extractedSolutionIds) {
      const r = checkRef(
        sid,
        solutionIds,
        `importedItem(${ii._exportId}).extractedSolutionIds`
      );
      if (r.isErr()) return r;
    }
  }

  // problem の参照チェック
  for (const p of data.problems) {
    const r = checkRef(
      p.sourceOriginId,
      sourceOriginIds,
      `problem(${p._exportId}).sourceOriginId`
    );
    if (r.isErr()) return r;
  }

  // solution の参照チェック
  for (const s of data.solutions) {
    const r = checkRef(
      s.sourceOriginId,
      sourceOriginIds,
      `solution(${s._exportId}).sourceOriginId`
    );
    if (r.isErr()) return r;
  }

  // sharpQuestion の参照チェック
  for (const q of data.sharpQuestions) {
    for (const pid of q.sourceProblemIds) {
      const r = checkRef(
        pid,
        problemIds,
        `sharpQuestion(${q._exportId}).sourceProblemIds`
      );
      if (r.isErr()) return r;
    }
  }

  // policyDraft の参照チェック
  for (const pd of data.policyDrafts) {
    const r1 = checkRef(
      pd.questionId,
      sharpQuestionIds,
      `policyDraft(${pd._exportId}).questionId`
    );
    if (r1.isErr()) return r1;
    for (const pid of pd.sourceProblemIds) {
      const r = checkRef(
        pid,
        problemIds,
        `policyDraft(${pd._exportId}).sourceProblemIds`
      );
      if (r.isErr()) return r;
    }
    for (const sid of pd.sourceSolutionIds) {
      const r = checkRef(
        sid,
        solutionIds,
        `policyDraft(${pd._exportId}).sourceSolutionIds`
      );
      if (r.isErr()) return r;
    }
  }

  // digestDraft の参照チェック
  for (const dd of data.digestDrafts) {
    const r1 = checkRef(
      dd.questionId,
      sharpQuestionIds,
      `digestDraft(${dd._exportId}).questionId`
    );
    if (r1.isErr()) return r1;
    const r2 = checkRef(
      dd.policyDraftId,
      policyDraftIds,
      `digestDraft(${dd._exportId}).policyDraftId`
    );
    if (r2.isErr()) return r2;
    for (const pid of dd.sourceProblemIds) {
      const r = checkRef(
        pid,
        problemIds,
        `digestDraft(${dd._exportId}).sourceProblemIds`
      );
      if (r.isErr()) return r;
    }
    for (const sid of dd.sourceSolutionIds) {
      const r = checkRef(
        sid,
        solutionIds,
        `digestDraft(${dd._exportId}).sourceSolutionIds`
      );
      if (r.isErr()) return r;
    }
  }

  // debateAnalysis の参照チェック
  for (const da of data.debateAnalyses) {
    const r = checkRef(
      da.questionId,
      sharpQuestionIds,
      `debateAnalysis(${da._exportId}).questionId`
    );
    if (r.isErr()) return r;
    for (const pid of da.sourceProblemIds) {
      const r2 = checkRef(
        pid,
        problemIds,
        `debateAnalysis(${da._exportId}).sourceProblemIds`
      );
      if (r2.isErr()) return r2;
    }
    for (const sid of da.sourceSolutionIds) {
      const r2 = checkRef(
        sid,
        solutionIds,
        `debateAnalysis(${da._exportId}).sourceSolutionIds`
      );
      if (r2.isErr()) return r2;
    }
  }

  // questionVisualReport の参照チェック
  for (const qvr of data.questionVisualReports) {
    const r = checkRef(
      qvr.questionId,
      sharpQuestionIds,
      `questionVisualReport(${qvr._exportId}).questionId`
    );
    if (r.isErr()) return r;
    for (const pid of qvr.sourceProblemIds) {
      const r2 = checkRef(
        pid,
        problemIds,
        `questionVisualReport(${qvr._exportId}).sourceProblemIds`
      );
      if (r2.isErr()) return r2;
    }
    for (const sid of qvr.sourceSolutionIds) {
      const r2 = checkRef(
        sid,
        solutionIds,
        `questionVisualReport(${qvr._exportId}).sourceSolutionIds`
      );
      if (r2.isErr()) return r2;
    }
  }

  // questionLink の参照チェック
  for (const ql of data.questionLinks) {
    const r1 = checkRef(
      ql.questionId,
      sharpQuestionIds,
      `questionLink(${ql._exportId}).questionId`
    );
    if (r1.isErr()) return r1;
    const linkedSet =
      ql.linkedItemType === "problem" ? problemIds : solutionIds;
    const r2 = checkRef(
      ql.linkedItemId,
      linkedSet,
      `questionLink(${ql._exportId}).linkedItemId`
    );
    if (r2.isErr()) return r2;
  }

  // reportExample の参照チェック
  for (const re of data.reportExamples) {
    const r = checkRef(
      re.questionId,
      sharpQuestionIds,
      `reportExample(${re._exportId}).questionId`
    );
    if (r.isErr()) return r;
  }

  // like の参照チェック
  for (const lk of data.likes) {
    const targetSet =
      lk.targetType === "question"
        ? sharpQuestionIds
        : lk.targetType === "problem"
          ? problemIds
          : solutionIds;
    const r = checkRef(
      lk.targetId,
      targetSet,
      `like(${lk._exportId}).targetId`
    );
    if (r.isErr()) return r;
  }

  return ok(undefined);
}
