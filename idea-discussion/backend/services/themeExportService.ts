/**
 * テーマ エクスポートサービス
 *
 * 目的: テーマとその全関連データを ThemeExportData 形式に変換する。
 *       MongoDB の ObjectID を _exportId（論理ID）に変換し、
 *       ChromaDB/クラスタリング関連フィールドを除外したうえで JSON にシリアライズできる形式を返す。
 *
 * 設計:
 *   - _exportId はプレフィックス付きの連番（ct_001, p_001 等）で一意性を保証する
 *   - 全ての ObjectID 参照を _exportId に置換することで、インポート時の ID 再マッピングを可能にする
 *   - includeLikes オプションが false（デフォルト）の場合、Like データは取得しない（パフォーマンス最適化）
 */

import { Types } from "mongoose";
import { type Result, err, ok } from "neverthrow";
import ChatThread from "../models/ChatThread.js";
import DebateAnalysis from "../models/DebateAnalysis.js";
import DigestDraft from "../models/DigestDraft.js";
import ImportedItem from "../models/ImportedItem.js";
import Like from "../models/Like.js";
import PipelineConfigChangeLog from "../models/PipelineConfigChangeLog.js";
import PolicyDraft from "../models/PolicyDraft.js";
import Problem from "../models/Problem.js";
import QuestionLink from "../models/QuestionLink.js";
import QuestionVisualReport from "../models/QuestionVisualReport.js";
import ReportExample from "../models/ReportExample.js";
import SharpQuestion from "../models/SharpQuestion.js";
import Solution from "../models/Solution.js";
import Theme from "../models/Theme.js";
import type {
  ExportChatThread,
  ExportDebateAnalysis,
  ExportDigestDraft,
  ExportImportedItem,
  ExportLike,
  ExportPipelineConfigChangeLog,
  ExportPolicyDraft,
  ExportProblem,
  ExportQuestionLink,
  ExportQuestionVisualReport,
  ExportReportExample,
  ExportSharpQuestion,
  ExportSolution,
  ThemeExportData,
} from "../types/themeExport.js";

/** buildExportData のオプション型 */
export interface BuildExportDataOptions {
  /** いいねデータをエクスポートに含めるか。デフォルト: false */
  includeLikes?: boolean;
}

/** エクスポートエラーのコード種別 */
export type ExportErrorCode = "NOT_FOUND" | "INVALID_ID" | "UNKNOWN";

/** エクスポートエラー型 */
export class ExportError extends Error {
  readonly code: ExportErrorCode;
  constructor(message: string, code: ExportErrorCode = "UNKNOWN") {
    super(message);
    this.name = "ExportError";
    this.code = code;
  }
}

/**
 * テーマとその全関連データをエクスポートデータ形式に変換する
 *
 * @param themeId - エクスポート対象のテーマ ObjectID 文字列
 * @param options - エクスポートオプション
 * @returns 成功時は ok(ThemeExportData)、テーマが見つからない場合は err(ExportError) を返す
 */
export async function buildExportData(
  themeId: string,
  options: BuildExportDataOptions = {}
): Promise<Result<ThemeExportData, ExportError>> {
  const { includeLikes = false } = options;

  // --- 1. テーマを取得 ---
  // ObjectID 形式を事前検証して CastError を回避する
  if (!Types.ObjectId.isValid(themeId)) {
    return err(
      new ExportError(`不正なテーマID形式です: ${themeId}`, "INVALID_ID")
    );
  }
  const theme = await Theme.findById(themeId);
  if (!theme) {
    return err(
      new ExportError(`テーマが見つかりません: ${themeId}`, "NOT_FOUND")
    );
  }

  // --- 2. themeId で直接紐づくデータを並列取得 ---
  const [
    chatThreads,
    importedItems,
    problems,
    solutions,
    sharpQuestions,
    pipelineConfigChangeLogs,
  ] = await Promise.all([
    ChatThread.find({ themeId }),
    ImportedItem.find({ themeId }),
    Problem.find({ themeId }),
    Solution.find({ themeId }),
    SharpQuestion.find({ themeId }),
    PipelineConfigChangeLog.find({ themeId }),
  ]);

  // --- 3. sharpQuestion の questionId で紐づくデータを並列取得 ---
  const questionIds = sharpQuestions.map((q) => q._id);

  const [
    policyDrafts,
    digestDrafts,
    debateAnalyses,
    questionVisualReports,
    questionLinks,
    reportExamples,
  ] = await Promise.all([
    PolicyDraft.find({ questionId: { $in: questionIds } }),
    DigestDraft.find({ questionId: { $in: questionIds } }),
    DebateAnalysis.find({ questionId: { $in: questionIds } }),
    QuestionVisualReport.find({ questionId: { $in: questionIds } }),
    QuestionLink.find({ questionId: { $in: questionIds } }),
    ReportExample.find({ questionId: { $in: questionIds } }),
  ]);

  // --- 4. いいねデータの取得（オプション） ---
  const likes = includeLikes
    ? await Like.find({
        targetId: {
          $in: [
            ...sharpQuestions.map((q) => q._id),
            ...problems.map((p) => p._id),
            ...solutions.map((s) => s._id),
          ],
        },
      })
    : [];

  // --- 5. ObjectID -> _exportId マッピングを構築 ---
  // プレフィックスごとに連番で _exportId を割り当てる
  const objectIdToExportId = new Map<string, string>();

  /**
   * Mongoose ドキュメントの id（文字列）を取得するヘルパー
   * _id の型が unknown になる場合があるため、Mongoose 仮想ゲッター `.id` を優先して使用する
   */
  const getDocId = (item: { id?: string; _id?: unknown }): string => {
    if (item.id) return item.id;
    return String(item._id);
  };

  const assignExportIds = (
    items: Array<{ id?: string; _id?: unknown }>,
    prefix: string
  ) => {
    items.forEach((item, index) => {
      const paddedNum = String(index + 1).padStart(3, "0");
      objectIdToExportId.set(getDocId(item), `${prefix}_${paddedNum}`);
    });
  };

  assignExportIds(chatThreads, "ct");
  assignExportIds(importedItems, "ii");
  assignExportIds(problems, "p");
  assignExportIds(solutions, "s");
  assignExportIds(sharpQuestions, "q");
  assignExportIds(pipelineConfigChangeLogs, "pcl");
  assignExportIds(policyDrafts, "pd");
  assignExportIds(digestDrafts, "dd");
  assignExportIds(debateAnalyses, "da");
  assignExportIds(questionVisualReports, "qvr");
  assignExportIds(questionLinks, "ql");
  assignExportIds(reportExamples, "re");
  if (includeLikes) {
    assignExportIds(likes, "lk");
  }

  /**
   * ObjectID 文字列を _exportId に変換するヘルパー
   * マッピングが存在しない場合は ExportError をスローする（クロステーマ参照等を検出するため）
   */
  const toExportId = (
    id: { toString: () => string } | string | null | undefined
  ): string | null => {
    if (id === null || id === undefined) return null;
    const idStr = typeof id === "string" ? id : id.toString();
    const exportId = objectIdToExportId.get(idStr);
    if (exportId === undefined) {
      throw new ExportError(
        `参照先 ID "${idStr}" がエクスポート対象外です。クロステーマ参照が含まれている可能性があります`,
        "UNKNOWN"
      );
    }
    return exportId;
  };

  const toExportIdArray = (
    ids: Array<{ toString: () => string } | string>
  ): string[] => {
    return ids.map((id) => toExportId(id) as string);
  };

  // --- 6. pipelineConfig の Map をシリアライズ ---
  const pipelineConfigObj: Record<string, { model?: string; prompt?: string }> =
    {};
  if (theme.pipelineConfig) {
    theme.pipelineConfig.forEach((value, key) => {
      pipelineConfigObj[key] = {
        ...(value.model !== undefined ? { model: value.model } : {}),
        ...(value.prompt !== undefined ? { prompt: value.prompt } : {}),
      };
    });
  }

  // --- 7. エクスポートデータを組み立て ---
  // toExportId が参照不整合で例外をスローする場合があるため try-catch で捕捉する
  try {
    const exportChatThreads: ExportChatThread[] = chatThreads.map((ct) => {
      const ctId = getDocId(ct);
      return {
        _exportId: objectIdToExportId.get(ctId) ?? ctId,
        _originalId: ctId,
        userId: ct.userId,
        messages: ct.messages.map((m) => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp.toISOString(),
        })),
        extractedProblemIds: toExportIdArray(ct.extractedProblemIds),
        extractedSolutionIds: toExportIdArray(ct.extractedSolutionIds),
        sessionId: ct.sessionId ?? null,
        questionId: ct.questionId ? toExportId(ct.questionId) : null,
        createdAt: ct.createdAt.toISOString(),
        updatedAt: ct.updatedAt.toISOString(),
      };
    });

    const exportImportedItems: ExportImportedItem[] = importedItems.map(
      (ii) => {
        const iiId = getDocId(ii);
        return {
          _exportId: objectIdToExportId.get(iiId) ?? iiId,
          _originalId: iiId,
          sourceType: ii.sourceType,
          content: ii.content,
          metadata: ii.metadata,
          status: ii.status,
          extractedProblemIds: toExportIdArray(ii.extractedProblemIds),
          extractedSolutionIds: toExportIdArray(ii.extractedSolutionIds),
          createdAt: ii.createdAt.toISOString(),
          updatedAt: ii.updatedAt.toISOString(),
          processedAt: ii.processedAt ? ii.processedAt.toISOString() : null,
          errorMessage: ii.errorMessage ?? null,
        };
      }
    );

    const exportProblems: ExportProblem[] = problems.map((p) => {
      const pId = getDocId(p);
      return {
        _exportId: objectIdToExportId.get(pId) ?? pId,
        _originalId: pId,
        statement: p.statement,
        sourceOriginId:
          toExportId(p.sourceOriginId) ?? p.sourceOriginId.toString(),
        sourceType: p.sourceType,
        originalSnippets: p.originalSnippets,
        sourceMetadata: p.sourceMetadata,
        version: p.version,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
        // embeddingGeneratedCollections は除外（再生成可能なため）
      };
    });

    const exportSolutions: ExportSolution[] = solutions.map((s) => {
      const sId = getDocId(s);
      return {
        _exportId: objectIdToExportId.get(sId) ?? sId,
        _originalId: sId,
        statement: s.statement,
        sourceOriginId:
          toExportId(s.sourceOriginId) ?? s.sourceOriginId.toString(),
        sourceType: s.sourceType,
        originalSnippets: s.originalSnippets,
        sourceMetadata: s.sourceMetadata,
        version: s.version,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
        // embeddingGeneratedCollections は除外（再生成可能なため）
      };
    });

    const exportSharpQuestions: ExportSharpQuestion[] = sharpQuestions.map(
      (q) => {
        const qId = getDocId(q);
        return {
          _exportId: objectIdToExportId.get(qId) ?? qId,
          _originalId: qId,
          questionText: q.questionText,
          tagLine: q.tagLine ?? null,
          tags: q.tags,
          sourceProblemIds: toExportIdArray(q.sourceProblemIds),
          createdAt: q.createdAt.toISOString(),
          updatedAt: q.updatedAt.toISOString(),
          // clusteringResults は除外（再生成可能なため）
        };
      }
    );

    const exportPipelineConfigChangeLogs: ExportPipelineConfigChangeLog[] =
      pipelineConfigChangeLogs.map((pcl) => {
        const pclId = getDocId(pcl);
        return {
          _exportId: objectIdToExportId.get(pclId) ?? pclId,
          _originalId: pclId,
          stageId: pcl.stageId,
          previousModel: pcl.previousModel ?? null,
          previousPrompt: pcl.previousPrompt ?? null,
          newModel: pcl.newModel ?? null,
          newPrompt: pcl.newPrompt ?? null,
          reason: pcl.reason,
          // changedBy（AdminUser ObjectID）はインポート先で再現不可能なため null
          changedBy: null,
          changedAt: pcl.changedAt.toISOString(),
          createdAt: pcl.createdAt.toISOString(),
          updatedAt: pcl.updatedAt.toISOString(),
        };
      });

    const exportPolicyDrafts: ExportPolicyDraft[] = policyDrafts.map((pd) => {
      const pdId = getDocId(pd);
      return {
        _exportId: objectIdToExportId.get(pdId) ?? pdId,
        _originalId: pdId,
        questionId: toExportId(pd.questionId) ?? pd.questionId.toString(),
        title: pd.title,
        content: pd.content,
        sourceProblemIds: toExportIdArray(pd.sourceProblemIds),
        sourceSolutionIds: toExportIdArray(pd.sourceSolutionIds),
        version: pd.version,
        createdAt: pd.createdAt.toISOString(),
        updatedAt: pd.updatedAt.toISOString(),
      };
    });

    const exportDigestDrafts: ExportDigestDraft[] = digestDrafts.map((dd) => {
      const ddId = getDocId(dd);
      return {
        _exportId: objectIdToExportId.get(ddId) ?? ddId,
        _originalId: ddId,
        questionId: toExportId(dd.questionId) ?? dd.questionId.toString(),
        policyDraftId:
          toExportId(dd.policyDraftId) ?? dd.policyDraftId.toString(),
        title: dd.title,
        content: dd.content,
        sourceProblemIds: toExportIdArray(dd.sourceProblemIds),
        sourceSolutionIds: toExportIdArray(dd.sourceSolutionIds),
        version: dd.version,
        createdAt: dd.createdAt.toISOString(),
        updatedAt: dd.updatedAt.toISOString(),
      };
    });

    const exportDebateAnalyses: ExportDebateAnalysis[] = debateAnalyses.map(
      (da) => {
        const daId = getDocId(da);
        return {
          _exportId: objectIdToExportId.get(daId) ?? daId,
          _originalId: daId,
          questionId: toExportId(da.questionId) ?? da.questionId.toString(),
          questionText: da.questionText,
          axes: da.axes,
          agreementPoints: da.agreementPoints,
          disagreementPoints: da.disagreementPoints,
          sourceProblemIds: toExportIdArray(da.sourceProblemIds),
          sourceSolutionIds: toExportIdArray(da.sourceSolutionIds),
          version: da.version,
          createdAt: da.createdAt.toISOString(),
          updatedAt: da.updatedAt.toISOString(),
        };
      }
    );

    const exportQuestionVisualReports: ExportQuestionVisualReport[] =
      questionVisualReports.map((qvr) => {
        const qvrId = getDocId(qvr);
        return {
          _exportId: objectIdToExportId.get(qvrId) ?? qvrId,
          _originalId: qvrId,
          questionId: toExportId(qvr.questionId) ?? qvr.questionId.toString(),
          questionText: qvr.questionText,
          overallAnalysis: qvr.overallAnalysis,
          sourceProblemIds: toExportIdArray(qvr.sourceProblemIds),
          sourceSolutionIds: toExportIdArray(qvr.sourceSolutionIds),
          version: qvr.version,
          createdAt: qvr.createdAt.toISOString(),
          updatedAt: qvr.updatedAt.toISOString(),
        };
      });

    const exportQuestionLinks: ExportQuestionLink[] = questionLinks.map(
      (ql) => {
        const qlId = getDocId(ql);
        return {
          _exportId: objectIdToExportId.get(qlId) ?? qlId,
          _originalId: qlId,
          questionId: toExportId(ql.questionId) ?? ql.questionId.toString(),
          linkedItemId:
            toExportId(ql.linkedItemId) ?? ql.linkedItemId.toString(),
          linkedItemType: ql.linkedItemType,
          linkType: ql.linkType,
          relevanceScore: ql.relevanceScore ?? null,
          rationale: ql.rationale ?? null,
          createdAt: ql.createdAt.toISOString(),
          updatedAt: ql.updatedAt.toISOString(),
        };
      }
    );

    const exportReportExamples: ExportReportExample[] = reportExamples.map(
      (re) => {
        const reId = getDocId(re);
        return {
          _exportId: objectIdToExportId.get(reId) ?? reId,
          _originalId: reId,
          questionId: toExportId(re.questionId) ?? re.questionId.toString(),
          introduction: re.introduction,
          issues: re.issues,
          version: re.version,
          createdAt: re.createdAt.toISOString(),
          updatedAt: re.updatedAt.toISOString(),
        };
      }
    );

    const exportLikes: ExportLike[] = includeLikes
      ? likes.map((lk) => {
          const likeId = getDocId(lk);
          return {
            _exportId: objectIdToExportId.get(likeId) ?? likeId,
            _originalId: likeId,
            userId: lk.userId,
            targetId: toExportId(lk.targetId) ?? lk.targetId.toString(),
            targetType: lk.targetType,
            createdAt: lk.createdAt.toISOString(),
            updatedAt: lk.updatedAt.toISOString(),
          };
        })
      : [];

    const exportData: ThemeExportData = {
      version: "1.0.0",
      exportedAt: new Date().toISOString(),
      theme: {
        title: theme.title,
        description: theme.description ?? null,
        status: theme.status,
        tags: theme.tags,
        customPrompt: theme.customPrompt ?? null,
        pipelineConfig: pipelineConfigObj,
        embeddingModel: theme.embeddingModel ?? null,
        showTransparency: theme.showTransparency,
        createdAt: theme.createdAt.toISOString(),
        updatedAt: theme.updatedAt.toISOString(),
        // clusteringResults, availableEmbeddingCollections は除外（再生成可能なため）
      },
      chatThreads: exportChatThreads,
      importedItems: exportImportedItems,
      problems: exportProblems,
      solutions: exportSolutions,
      sharpQuestions: exportSharpQuestions,
      pipelineConfigChangeLogs: exportPipelineConfigChangeLogs,
      policyDrafts: exportPolicyDrafts,
      digestDrafts: exportDigestDrafts,
      debateAnalyses: exportDebateAnalyses,
      questionVisualReports: exportQuestionVisualReports,
      questionLinks: exportQuestionLinks,
      reportExamples: exportReportExamples,
      likes: exportLikes,
    };

    return ok(exportData);
  } catch (error) {
    if (error instanceof ExportError) {
      return err(error);
    }
    return err(
      new ExportError(
        `エクスポートデータの組み立て中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`,
        "UNKNOWN"
      )
    );
  }
}
