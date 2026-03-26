/**
 * テーマ インポートサービス
 *
 * 目的: エクスポートされたテーマデータを新しいテーマとして MongoDB にインポートする。
 *
 * 設計（1.5パス方式）:
 *   1. 全エンティティの _exportId に対して事前に新しい ObjectID を生成する
 *   2. idMap: Map<exportId, newObjectId> を構築する
 *   3. idMap を参照しながら正しい参照付きで1回の挿入で完結する
 *   - 挿入失敗時は作成済みデータを削除してクリーンアップする
 *
 * 注意:
 *   - MongoDB スタンドアロン構成ではトランザクションが使用できないため、
 *     エラー時は手動クリーンアップで整合性を保つ
 *   - インポートされたテーマのステータスは常に "draft" にリセットする
 *   - ImportedItem の processedAt/errorMessage はクリアして再処理を促す
 *   - テーマタイトルが重複する場合は「（インポート）」サフィックスを付与する
 *   - clusteringResults/embeddingGeneratedCollections は再生成を促すため設定しない
 *   - 全エンティティの createdAt/updatedAt はエクスポートデータの値を復元する
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
import {
  ExportValidationError,
  type ThemeExportData,
} from "../types/themeExport.js";

/** インポート統計情報 */
export interface ImportStats {
  themeId: string;
  themeTitle: string;
  counts: {
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
  };
}

/** タイトル重複時に付与するサフィックス */
const IMPORT_TITLE_SUFFIX = "（インポート）";

/** 最大サフィックス番号（タイトル重複解消の試行上限） */
const MAX_SUFFIX_ATTEMPTS = 10;

/**
 * テーマタイトルの重複を避けるため、ユニークなタイトルを生成する
 *
 * @param baseTitle - ベースとなるタイトル
 * @returns 重複しないタイトル文字列
 */
async function resolveUniqueTitle(baseTitle: string): Promise<string> {
  const existing = await Theme.findOne({ title: baseTitle });
  if (!existing) return baseTitle;

  // サフィックスを付与して重複を解消する
  const suffixedBase = `${baseTitle}${IMPORT_TITLE_SUFFIX}`;
  const existingSuffixed = await Theme.findOne({ title: suffixedBase });
  if (!existingSuffixed) return suffixedBase;

  // 番号付きサフィックスで試行する
  for (let i = 2; i <= MAX_SUFFIX_ATTEMPTS; i++) {
    const candidate = `${baseTitle}${IMPORT_TITLE_SUFFIX}${i}`;
    const exists = await Theme.findOne({ title: candidate });
    if (!exists) return candidate;
  }

  // 上限に達した場合はタイムスタンプを付与して一意性を保証する
  return `${baseTitle}${IMPORT_TITLE_SUFFIX}-${Date.now()}`;
}

/**
 * 部分インポートのクリーンアップ
 *
 * 挿入失敗時に作成済みのデータを削除する。
 * MongoDB スタンドアロンではトランザクションが使用できないため、このクリーンアップで整合性を保つ。
 *
 * @param themeId - 作成されたテーマの ObjectID
 * @param allNewIds - idMap の全値（削除対象 ObjectID リスト）
 */
async function cleanupPartialImport(
  themeId: Types.ObjectId,
  allNewIds: Types.ObjectId[]
): Promise<void> {
  await Promise.all([
    Theme.deleteOne({ _id: themeId }),
    ChatThread.deleteMany({ themeId }),
    ImportedItem.deleteMany({ themeId }),
    Problem.deleteMany({ themeId }),
    Solution.deleteMany({ themeId }),
    SharpQuestion.deleteMany({ themeId }),
    PipelineConfigChangeLog.deleteMany({ themeId }),
    PolicyDraft.deleteMany({ _id: { $in: allNewIds } }),
    DigestDraft.deleteMany({ _id: { $in: allNewIds } }),
    DebateAnalysis.deleteMany({ _id: { $in: allNewIds } }),
    QuestionVisualReport.deleteMany({ _id: { $in: allNewIds } }),
    QuestionLink.deleteMany({ _id: { $in: allNewIds } }),
    ReportExample.deleteMany({ _id: { $in: allNewIds } }),
    Like.deleteMany({ _id: { $in: allNewIds } }),
  ]);
}

/**
 * テーマデータをインポートして新しいテーマを作成する
 *
 * 1.5パス方式で全エンティティの新しい ObjectID を事前生成し、
 * 参照を正しい ObjectID に置換したうえでモデルを一括挿入する。
 *
 * @param exportData - バリデーション済みのエクスポートデータ
 * @returns 成功時は ok(ImportStats)、失敗時は err を返す
 */
export async function importThemeData(
  exportData: ThemeExportData
): Promise<Result<ImportStats, ExportValidationError | Error>> {
  // --- 1. 全エンティティの新しい ObjectID を事前生成（1.5パス方式） ---
  // クリーンアップで使用するため try の外で生成する
  const newThemeId = new Types.ObjectId();
  const idMap = new Map<string, Types.ObjectId>();

  for (const ct of exportData.chatThreads) {
    idMap.set(ct._exportId, new Types.ObjectId());
  }
  for (const ii of exportData.importedItems) {
    idMap.set(ii._exportId, new Types.ObjectId());
  }
  for (const p of exportData.problems) {
    idMap.set(p._exportId, new Types.ObjectId());
  }
  for (const s of exportData.solutions) {
    idMap.set(s._exportId, new Types.ObjectId());
  }
  for (const q of exportData.sharpQuestions) {
    idMap.set(q._exportId, new Types.ObjectId());
  }
  for (const pcl of exportData.pipelineConfigChangeLogs) {
    idMap.set(pcl._exportId, new Types.ObjectId());
  }
  for (const pd of exportData.policyDrafts) {
    idMap.set(pd._exportId, new Types.ObjectId());
  }
  for (const dd of exportData.digestDrafts) {
    idMap.set(dd._exportId, new Types.ObjectId());
  }
  for (const da of exportData.debateAnalyses) {
    idMap.set(da._exportId, new Types.ObjectId());
  }
  for (const qvr of exportData.questionVisualReports) {
    idMap.set(qvr._exportId, new Types.ObjectId());
  }
  for (const ql of exportData.questionLinks) {
    idMap.set(ql._exportId, new Types.ObjectId());
  }
  for (const re of exportData.reportExamples) {
    idMap.set(re._exportId, new Types.ObjectId());
  }
  for (const lk of exportData.likes) {
    idMap.set(lk._exportId, new Types.ObjectId());
  }

  /**
   * 必須の _exportId を新しい ObjectID に変換するヘルパー
   * マッピングが存在しない場合は例外をスローする（バリデーション済みなので通常は発生しない）
   */
  const resolveIdStrict = (
    exportId: string,
    context: string
  ): Types.ObjectId => {
    const resolved = idMap.get(exportId);
    if (!resolved) {
      throw new Error(
        `ID再マッピング失敗: ${context} の _exportId "${exportId}" が idMap に存在しません`
      );
    }
    return resolved;
  };

  /**
   * _exportId の配列を新しい ObjectID の配列に変換するヘルパー
   * マッピングが存在しない場合は例外をスローする（silent drop を防ぐ）
   */
  const resolveIdArray = (exportIds: string[]): Types.ObjectId[] => {
    return exportIds.map((id) =>
      resolveIdStrict(id, `resolveIdArray: exportId "${id}"`)
    );
  };

  // --- 2. pipelineConfig を Map に変換 ---
  const pipelineConfigMap = new Map<
    string,
    { model?: string; prompt?: string }
  >();
  for (const [key, value] of Object.entries(exportData.theme.pipelineConfig)) {
    pipelineConfigMap.set(key, value);
  }

  try {
    // --- 3. テーマタイトルの重複チェックと解消（try 内で実行してエラーを捕捉する） ---
    const resolvedTitle = await resolveUniqueTitle(exportData.theme.title);

    // --- 4. テーマを作成 ---
    await Theme.create([
      {
        _id: newThemeId,
        title: resolvedTitle,
        description: exportData.theme.description ?? undefined,
        // インポートされたテーマは常に draft で開始する（安全性のため）
        status: "draft",
        tags: exportData.theme.tags,
        customPrompt: exportData.theme.customPrompt ?? undefined,
        pipelineConfig: pipelineConfigMap,
        embeddingModel: exportData.theme.embeddingModel ?? undefined,
        showTransparency: exportData.theme.showTransparency,
        createdAt: new Date(exportData.theme.createdAt),
        updatedAt: new Date(exportData.theme.updatedAt),
      },
    ]);

    // --- 5. 全関連データを一括挿入 ---
    // ChatThread の挿入
    if (exportData.chatThreads.length > 0) {
      await ChatThread.insertMany(
        exportData.chatThreads.map((ct) => ({
          _id: resolveIdStrict(ct._exportId, "chatThread._id"),
          themeId: newThemeId,
          userId: ct.userId,
          messages: ct.messages.map((m) => ({
            role: m.role,
            content: m.content,
            timestamp: new Date(m.timestamp),
          })),
          extractedProblemIds: resolveIdArray(ct.extractedProblemIds),
          extractedSolutionIds: resolveIdArray(ct.extractedSolutionIds),
          sessionId: ct.sessionId ?? undefined,
          questionId: ct.questionId
            ? resolveIdStrict(
                ct.questionId,
                `chatThread(${ct._exportId}).questionId`
              )
            : undefined,
          createdAt: new Date(ct.createdAt),
          updatedAt: new Date(ct.updatedAt),
        }))
      );
    }

    // ImportedItem の挿入
    if (exportData.importedItems.length > 0) {
      await ImportedItem.insertMany(
        exportData.importedItems.map((ii) => ({
          _id: resolveIdStrict(ii._exportId, "importedItem._id"),
          themeId: newThemeId,
          sourceType: ii.sourceType,
          content: ii.content,
          metadata: ii.metadata,
          // インポート時は再処理が必要なため pending にリセットし、処理済み情報はクリアする
          status: "pending",
          extractedProblemIds: resolveIdArray(ii.extractedProblemIds),
          extractedSolutionIds: resolveIdArray(ii.extractedSolutionIds),
          processedAt: undefined,
          errorMessage: undefined,
          createdAt: new Date(ii.createdAt),
          updatedAt: new Date(ii.updatedAt),
        }))
      );
    }

    // Problem の挿入
    if (exportData.problems.length > 0) {
      await Problem.insertMany(
        exportData.problems.map((p) => ({
          _id: resolveIdStrict(p._exportId, "problem._id"),
          themeId: newThemeId,
          statement: p.statement,
          sourceOriginId: resolveIdStrict(
            p.sourceOriginId,
            `problem(${p._exportId}).sourceOriginId`
          ),
          sourceType: p.sourceType,
          originalSnippets: p.originalSnippets,
          sourceMetadata: p.sourceMetadata,
          version: p.version,
          createdAt: new Date(p.createdAt),
          updatedAt: new Date(p.updatedAt),
        }))
      );
    }

    // Solution の挿入
    if (exportData.solutions.length > 0) {
      await Solution.insertMany(
        exportData.solutions.map((s) => ({
          _id: resolveIdStrict(s._exportId, "solution._id"),
          themeId: newThemeId,
          statement: s.statement,
          sourceOriginId: resolveIdStrict(
            s.sourceOriginId,
            `solution(${s._exportId}).sourceOriginId`
          ),
          sourceType: s.sourceType,
          originalSnippets: s.originalSnippets,
          sourceMetadata: s.sourceMetadata,
          version: s.version,
          createdAt: new Date(s.createdAt),
          updatedAt: new Date(s.updatedAt),
        }))
      );
    }

    // SharpQuestion の挿入
    if (exportData.sharpQuestions.length > 0) {
      await SharpQuestion.insertMany(
        exportData.sharpQuestions.map((q) => ({
          _id: resolveIdStrict(q._exportId, "sharpQuestion._id"),
          themeId: newThemeId,
          questionText: q.questionText,
          tagLine: q.tagLine ?? undefined,
          tags: q.tags,
          sourceProblemIds: resolveIdArray(q.sourceProblemIds),
          createdAt: new Date(q.createdAt),
          updatedAt: new Date(q.updatedAt),
        }))
      );
    }

    // PipelineConfigChangeLog の挿入
    if (exportData.pipelineConfigChangeLogs.length > 0) {
      await PipelineConfigChangeLog.insertMany(
        exportData.pipelineConfigChangeLogs.map((pcl) => ({
          _id: resolveIdStrict(pcl._exportId, "pipelineConfigChangeLog._id"),
          themeId: newThemeId,
          stageId: pcl.stageId,
          previousModel: pcl.previousModel ?? undefined,
          previousPrompt: pcl.previousPrompt ?? undefined,
          newModel: pcl.newModel ?? undefined,
          newPrompt: pcl.newPrompt ?? undefined,
          reason: pcl.reason,
          // changedBy はインポート先で再現不可能なため設定しない
          changedAt: new Date(pcl.changedAt),
          createdAt: new Date(pcl.createdAt),
          updatedAt: new Date(pcl.updatedAt),
        }))
      );
    }

    // PolicyDraft の挿入
    if (exportData.policyDrafts.length > 0) {
      await PolicyDraft.insertMany(
        exportData.policyDrafts.map((pd) => ({
          _id: resolveIdStrict(pd._exportId, "policyDraft._id"),
          questionId: resolveIdStrict(
            pd.questionId,
            `policyDraft(${pd._exportId}).questionId`
          ),
          title: pd.title,
          content: pd.content,
          sourceProblemIds: resolveIdArray(pd.sourceProblemIds),
          sourceSolutionIds: resolveIdArray(pd.sourceSolutionIds),
          version: pd.version,
          createdAt: new Date(pd.createdAt),
          updatedAt: new Date(pd.updatedAt),
        }))
      );
    }

    // DigestDraft の挿入
    if (exportData.digestDrafts.length > 0) {
      await DigestDraft.insertMany(
        exportData.digestDrafts.map((dd) => ({
          _id: resolveIdStrict(dd._exportId, "digestDraft._id"),
          questionId: resolveIdStrict(
            dd.questionId,
            `digestDraft(${dd._exportId}).questionId`
          ),
          policyDraftId: resolveIdStrict(
            dd.policyDraftId,
            `digestDraft(${dd._exportId}).policyDraftId`
          ),
          title: dd.title,
          content: dd.content,
          sourceProblemIds: resolveIdArray(dd.sourceProblemIds),
          sourceSolutionIds: resolveIdArray(dd.sourceSolutionIds),
          version: dd.version,
          createdAt: new Date(dd.createdAt),
          updatedAt: new Date(dd.updatedAt),
        }))
      );
    }

    // DebateAnalysis の挿入
    if (exportData.debateAnalyses.length > 0) {
      await DebateAnalysis.insertMany(
        exportData.debateAnalyses.map((da) => ({
          _id: resolveIdStrict(da._exportId, "debateAnalysis._id"),
          questionId: resolveIdStrict(
            da.questionId,
            `debateAnalysis(${da._exportId}).questionId`
          ),
          questionText: da.questionText,
          axes: da.axes,
          agreementPoints: da.agreementPoints,
          disagreementPoints: da.disagreementPoints,
          sourceProblemIds: resolveIdArray(da.sourceProblemIds),
          sourceSolutionIds: resolveIdArray(da.sourceSolutionIds),
          version: da.version,
          createdAt: new Date(da.createdAt),
          updatedAt: new Date(da.updatedAt),
        }))
      );
    }

    // QuestionVisualReport の挿入
    if (exportData.questionVisualReports.length > 0) {
      await QuestionVisualReport.insertMany(
        exportData.questionVisualReports.map((qvr) => ({
          _id: resolveIdStrict(qvr._exportId, "questionVisualReport._id"),
          questionId: resolveIdStrict(
            qvr.questionId,
            `questionVisualReport(${qvr._exportId}).questionId`
          ),
          questionText: qvr.questionText,
          overallAnalysis: qvr.overallAnalysis,
          sourceProblemIds: resolveIdArray(qvr.sourceProblemIds),
          sourceSolutionIds: resolveIdArray(qvr.sourceSolutionIds),
          version: qvr.version,
          createdAt: new Date(qvr.createdAt),
          updatedAt: new Date(qvr.updatedAt),
        }))
      );
    }

    // QuestionLink の挿入
    if (exportData.questionLinks.length > 0) {
      await QuestionLink.insertMany(
        exportData.questionLinks.map((ql) => ({
          _id: resolveIdStrict(ql._exportId, "questionLink._id"),
          questionId: resolveIdStrict(
            ql.questionId,
            `questionLink(${ql._exportId}).questionId`
          ),
          linkedItemId: resolveIdStrict(
            ql.linkedItemId,
            `questionLink(${ql._exportId}).linkedItemId`
          ),
          linkedItemType: ql.linkedItemType,
          linkedItemTypeModel:
            ql.linkedItemType === "problem" ? "Problem" : "Solution",
          linkType: ql.linkType,
          relevanceScore: ql.relevanceScore ?? undefined,
          rationale: ql.rationale ?? undefined,
          createdAt: new Date(ql.createdAt),
          updatedAt: new Date(ql.updatedAt),
        }))
      );
    }

    // ReportExample の挿入
    if (exportData.reportExamples.length > 0) {
      await ReportExample.insertMany(
        exportData.reportExamples.map((re) => ({
          _id: resolveIdStrict(re._exportId, "reportExample._id"),
          questionId: resolveIdStrict(
            re.questionId,
            `reportExample(${re._exportId}).questionId`
          ),
          introduction: re.introduction,
          issues: re.issues,
          version: re.version,
          createdAt: new Date(re.createdAt),
          updatedAt: new Date(re.updatedAt),
        }))
      );
    }

    // Like の挿入（エクスポート時に includeLikes: true が指定された場合のみデータが存在する）
    if (exportData.likes.length > 0) {
      await Like.insertMany(
        exportData.likes.map((lk) => ({
          _id: resolveIdStrict(lk._exportId, "like._id"),
          userId: lk.userId,
          targetId: resolveIdStrict(
            lk.targetId,
            `like(${lk._exportId}).targetId`
          ),
          targetType: lk.targetType,
          createdAt: new Date(lk.createdAt),
          updatedAt: new Date(lk.updatedAt),
        }))
      );
    }

    const stats: ImportStats = {
      themeId: newThemeId.toString(),
      themeTitle: resolvedTitle,
      counts: {
        chatThreads: exportData.chatThreads.length,
        importedItems: exportData.importedItems.length,
        problems: exportData.problems.length,
        solutions: exportData.solutions.length,
        sharpQuestions: exportData.sharpQuestions.length,
        pipelineConfigChangeLogs: exportData.pipelineConfigChangeLogs.length,
        policyDrafts: exportData.policyDrafts.length,
        digestDrafts: exportData.digestDrafts.length,
        debateAnalyses: exportData.debateAnalyses.length,
        questionVisualReports: exportData.questionVisualReports.length,
        questionLinks: exportData.questionLinks.length,
        reportExamples: exportData.reportExamples.length,
        likes: exportData.likes.length,
      },
    };

    return ok(stats);
  } catch (error) {
    // 部分的に作成されたデータをクリーンアップする（ベストエフォート）
    console.error(
      "importThemeData: インポート中にエラーが発生しました。クリーンアップを試みます",
      error
    );
    await cleanupPartialImport(newThemeId, [...idMap.values()]).catch(
      (cleanupError) => {
        console.error(
          "importThemeData: クリーンアップ中にエラーが発生しました",
          cleanupError
        );
      }
    );
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}
