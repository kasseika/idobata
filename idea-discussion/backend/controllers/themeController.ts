/**
 * テーマコントローラー
 *
 * 目的: テーマの CRUD 操作および緊急パイプライン設定修正・デフォルトプロンプト取得APIを提供する。
 * 注意: ステータス遷移は draft → active → closed の一方向のみ許可。
 *       active/closed のテーマはプロンプト変更をロックし、緊急修正APIを使用する。
 */

import type { Request, Response } from "express";
import mongoose from "mongoose";
import { DEFAULT_CHAT_SYSTEM_PROMPT } from "../constants/defaultPrompts.js";
import { PIPELINE_STAGES } from "../constants/pipelineStages.js";
import ChatThread from "../models/ChatThread.js";
import Like from "../models/Like.js";
import PipelineConfigChangeLog from "../models/PipelineConfigChangeLog.js";
import Problem from "../models/Problem.js";
import QuestionLink from "../models/QuestionLink.js";
import SharpQuestion from "../models/SharpQuestion.js";
import Solution from "../models/Solution.js";
import Theme from "../models/Theme.js";

/**
 * 許可されたステータス遷移マップ
 * draft → active → closed ⇄ archived の遷移を許可。
 * 公開後は draft に戻せない（過去の議論と整合性が取れなくなるため）。
 * archived は closed に戻せる（再公開のため）。
 */
const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ["active"],
  active: ["closed"],
  closed: ["archived"],
  archived: ["closed"],
};

export const getAllThemes = async (req: Request, res: Response) => {
  try {
    // 管理者かつ includeInactive=true の場合のみ全テーマ取得、それ以外は公開中・終了済みのみ
    const isAdmin = req.user?.role === "admin";
    const filter =
      isAdmin && req.query.includeInactive === "true"
        ? {}
        : { status: { $in: ["active", "closed"] } };
    const themes = await Theme.find(filter).sort({ createdAt: -1 });

    // 全テーマIDを抽出し、集計クエリで件数を一括取得（2N+1 → 3クエリに最適化）
    const themeIds = themes.map((t) => t._id);
    const [questionAgg, threadAgg] = await Promise.all([
      SharpQuestion.aggregate([
        { $match: { themeId: { $in: themeIds } } },
        { $group: { _id: "$themeId", count: { $sum: 1 } } },
      ]),
      ChatThread.aggregate([
        { $match: { themeId: { $in: themeIds } } },
        { $group: { _id: "$themeId", count: { $sum: 1 } } },
      ]),
    ]);

    const questionCountMap = new Map(
      questionAgg.map((x) => [String(x._id), x.count])
    );
    const threadCountMap = new Map(
      threadAgg.map((x) => [String(x._id), x.count])
    );

    const enhancedThemes = themes.map((theme) => {
      const key = String(theme._id);
      return {
        _id: theme._id,
        title: theme.title,
        description: theme.description || "",
        status: theme.status,
        tags: theme.tags || [],
        createdAt: theme.createdAt,
        keyQuestionCount: questionCountMap.get(key) ?? 0,
        commentCount: threadCountMap.get(key) ?? 0,
      };
    });

    return res.status(200).json(enhancedThemes);
  } catch (error) {
    console.error("Error fetching all themes:", error);
    return res.status(500).json({
      message: "Error fetching themes",
      error: (error as Error).message,
    });
  }
};

export const getThemeById = async (req: Request, res: Response) => {
  const { themeId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(themeId)) {
    return res.status(400).json({ message: "Invalid theme ID format" });
  }

  try {
    const theme = await Theme.findById(themeId);
    if (!theme) {
      return res.status(404).json({ message: "Theme not found" });
    }

    // 非管理者は draft/archived テーマにアクセス不可
    const isAdmin = req.user?.role === "admin";
    if (!isAdmin && (theme.status === "archived" || theme.status === "draft")) {
      return res.status(404).json({ message: "Theme not found" });
    }

    return res.status(200).json(theme);
  } catch (error) {
    console.error(`Error fetching theme ${themeId}:`, error);
    return res.status(500).json({
      message: "Error fetching theme",
      error: (error as Error).message,
    });
  }
};

export const createTheme = async (req: Request, res: Response) => {
  const { title, description, status, customPrompt, tags, pipelineConfig } =
    req.body;

  if (!title) {
    return res.status(400).json({ message: "Title is required" });
  }

  try {
    const theme = new Theme({
      title,
      description,
      status: status || "draft",
      customPrompt,
      tags: tags || [],
      pipelineConfig: pipelineConfig || {},
    });

    const savedTheme = await theme.save();
    return res.status(201).json(savedTheme);
  } catch (error) {
    console.error("Error creating theme:", error);
    return res.status(500).json({
      message: "Error creating theme",
      error: (error as Error).message,
    });
  }
};

export const updateTheme = async (req: Request, res: Response) => {
  const { themeId } = req.params;
  const { title, description, status, customPrompt, tags, pipelineConfig } =
    req.body;

  if (!mongoose.Types.ObjectId.isValid(themeId)) {
    return res.status(400).json({ message: "Invalid theme ID format" });
  }

  try {
    const theme = await Theme.findById(themeId);
    if (!theme) {
      return res.status(404).json({ message: "Theme not found" });
    }

    // プロンプトロック制御: draft 以外のテーマはプロンプト変更不可
    // ロック中は pipelineConfig/customPrompt を更新対象から除外する（エラーは返さない）
    // 理由: 管理画面は formData 全体を送信するため、フィールドの存在だけでは拒否できない。
    //       UI 上ですでに編集不可を表示しており、意図的な変更には緊急修正API を使用する。
    const isPromptLocked = theme.status !== "draft";

    // ステータス遷移バリデーション
    if (status !== undefined && status !== theme.status) {
      const allowedNext = ALLOWED_STATUS_TRANSITIONS[theme.status] || [];
      if (!allowedNext.includes(status)) {
        return res.status(400).json({
          message: `ステータスの遷移 "${theme.status}" → "${status}" は許可されていません。`,
        });
      }
    }

    const updateFields: Record<string, unknown> = {
      title: title || theme.title,
      description: description !== undefined ? description : theme.description,
      status: status !== undefined ? status : theme.status,
      tags: tags !== undefined ? tags || [] : theme.tags,
    };

    // ロック中（active/closed）は pipelineConfig/customPrompt を更新対象から除外する
    if (!isPromptLocked) {
      if (customPrompt !== undefined) {
        updateFields.customPrompt = customPrompt;
      }
      if (pipelineConfig !== undefined) {
        updateFields.pipelineConfig = pipelineConfig;
      }
    }

    const updatedTheme = await Theme.findByIdAndUpdate(themeId, updateFields, {
      new: true,
      runValidators: true,
    });

    return res.status(200).json(updatedTheme);
  } catch (error) {
    console.error(`Error updating theme ${themeId}:`, error);
    return res.status(500).json({
      message: "Error updating theme",
      error: (error as Error).message,
    });
  }
};

export const deleteTheme = async (req: Request, res: Response) => {
  const { themeId } = req.params;

  // 環境変数からテーマ削除機能の有効/無効を取得
  // 設定がない場合やfalseの場合は、テーマの削除機能は無効
  const allowDeleteTheme = process.env.ALLOW_DELETE_THEME === "true";

  // テーマ削除機能が無効の場合は400エラーを返す
  if (!allowDeleteTheme) {
    return res.status(400).json({
      message:
        "Theme deletion is disabled. Set ALLOW_DELETE_THEME=true to enable this feature.",
    });
  }

  if (!mongoose.Types.ObjectId.isValid(themeId)) {
    return res.status(400).json({ message: "Invalid theme ID format" });
  }

  try {
    const theme = await Theme.findById(themeId);
    if (!theme) {
      return res.status(404).json({ message: "Theme not found" });
    }

    await Theme.findByIdAndDelete(themeId);
    return res.status(200).json({ message: "Theme deleted successfully" });
  } catch (error) {
    console.error(`Error deleting theme ${themeId}:`, error);
    return res.status(500).json({
      message: "Error deleting theme",
      error: (error as Error).message,
    });
  }
};

export const getThemeDetail = async (req: Request, res: Response) => {
  const { themeId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(themeId)) {
    return res.status(400).json({ message: "Invalid theme ID format" });
  }

  try {
    // テーマの基本情報を取得
    const theme = await Theme.findById(themeId);
    if (!theme) {
      return res.status(404).json({ message: "Theme not found" });
    }

    // 非管理者は draft/archived テーマにアクセス不可
    const isAdmin = req.user?.role === "admin";
    if (!isAdmin && (theme.status === "archived" || theme.status === "draft")) {
      return res.status(404).json({ message: "Theme not found" });
    }

    // キークエスチョンを取得（関連数でJSソートするためDBソートは行わない）
    const keyQuestions = await SharpQuestion.find({ themeId });

    // 課題（問題点）を取得：新しい順で返す
    const issues = await Problem.find({ themeId }).sort({ createdAt: -1 });

    // 解決策を取得：新しい順で返す
    const solutions = await Solution.find({ themeId }).sort({ createdAt: -1 });

    // 各キークエスチョンに関連する課題と解決策の数を計算
    const keyQuestionsWithCounts = await Promise.all(
      keyQuestions.map(async (question) => {
        const questionId = question._id;

        // このキークエスチョンに関連する課題数を取得
        const issueCount = await QuestionLink.countDocuments({
          questionId,
          linkedItemType: "problem",
        });

        // このキークエスチョンに関連する解決策数を取得
        const solutionCount = await QuestionLink.countDocuments({
          questionId,
          linkedItemType: "solution",
        });

        const voteCount = await Like.countDocuments({
          targetId: question._id,
          targetType: "question",
        });

        return {
          ...question.toObject(),
          issueCount,
          solutionCount,
          voteCount,
        };
      })
    );

    // 重要論点を関連する課題数＋解決策数の多い順にソート（元配列を変更しないようコピーしてからソート）
    const sortedKeyQuestions = [...keyQuestionsWithCounts].sort(
      (a, b) =>
        b.issueCount + b.solutionCount - (a.issueCount + a.solutionCount)
    );

    // 最適化されたレスポンスを返す
    res.status(200).json({
      theme,
      keyQuestions: sortedKeyQuestions,
      issues,
      solutions,
    });
  } catch (error) {
    console.error("Error fetching theme detail:", error);
    res
      .status(500)
      .json({ message: "Server error", error: (error as Error).message });
  }
};

/**
 * 公開中テーマのパイプライン設定を緊急修正する
 *
 * 目的: status=active の場合のみ使用可能。変更理由を必須とし、
 *       変更前後の差分を PipelineConfigChangeLog に記録する。
 * 注意: 通常の updateTheme ではプロンプト変更がロックされているため、
 *       緊急修正が必要な場合はこのエンドポイントを使用する。
 */
export const emergencyUpdatePipelineConfig = async (
  req: Request,
  res: Response
) => {
  const { themeId } = req.params;
  const { stageId, model, prompt, reason } = req.body;

  if (!reason) {
    return res.status(400).json({
      message: "緊急修正の理由（reason）は必須です。",
    });
  }

  if (!stageId) {
    return res.status(400).json({ message: "stageId は必須です。" });
  }

  // model と prompt の少なくとも一方は必須
  if (model === undefined && prompt === undefined) {
    return res.status(400).json({
      message: "model または prompt の少なくとも一方を指定してください。",
    });
  }

  // stageId が有効なパイプラインステージか検証する
  const validStage = PIPELINE_STAGES.find((s) => s.id === stageId);
  if (!validStage) {
    return res.status(400).json({
      message: `stageId "${stageId}" は有効なパイプラインステージではありません。`,
    });
  }

  if (!mongoose.Types.ObjectId.isValid(themeId)) {
    return res.status(400).json({ message: "Invalid theme ID format" });
  }

  try {
    const theme = await Theme.findById(themeId);
    if (!theme) {
      return res.status(404).json({ message: "Theme not found" });
    }

    // 緊急修正は active のテーマのみ使用可能
    if (theme.status !== "active") {
      return res.status(400).json({
        message: "緊急修正APIは status=active のテーマのみ使用できます。",
      });
    }

    // 変更前の設定を取得
    const currentStageConfig = theme.pipelineConfig?.get(stageId) || {};

    // no-op チェック: 少なくとも一方に実際の変更があること。
    // 変更のない緊急修正は透明性ログを汚染するため拒否する。
    const modelChanged =
      model !== undefined && model !== currentStageConfig.model;
    const promptChanged =
      prompt !== undefined && prompt !== currentStageConfig.prompt;
    if (!modelChanged && !promptChanged) {
      return res.status(400).json({
        message:
          "指定された model または prompt が現在の値と同一です。実際に変更がある場合のみ緊急修正を実行してください。",
      });
    }

    const newModel = model !== undefined ? model : currentStageConfig.model;
    const newPrompt = prompt !== undefined ? prompt : currentStageConfig.prompt;

    // 対象 stageId のみを原子的に更新する（$set で特定パスのみ更新）
    // 理由: pipelineConfig 全体を再保存すると並行した緊急修正で他ステージの変更が失われる
    // 注意: Theme 更新を先に行い、成功後に変更ログを記録する。
    //       逆順にするとテーマ更新失敗時に stale なログが残るリスクがある。
    const updatedTheme = await Theme.findByIdAndUpdate(
      themeId,
      {
        $set: {
          [`pipelineConfig.${stageId}`]: { model: newModel, prompt: newPrompt },
        },
      },
      { new: true }
    );

    if (!updatedTheme) {
      return res.status(404).json({
        message: "テーマの更新に失敗しました。テーマが見つかりません。",
      });
    }

    // 変更ログを記録（Theme 更新成功後に保存して stale ログを防ぐ）
    const changeLog = new PipelineConfigChangeLog({
      themeId: theme._id,
      stageId,
      previousModel: currentStageConfig.model,
      previousPrompt: currentStageConfig.prompt,
      newModel,
      newPrompt,
      reason,
      changedBy: req.user?.id,
    });
    await changeLog.save();

    return res.status(200).json(updatedTheme);
  } catch (error) {
    console.error(
      `Error in emergencyUpdatePipelineConfig for theme ${themeId}:`,
      error
    );
    return res.status(500).json({
      message: "Error updating pipeline config",
      error: (error as Error).message,
    });
  }
};

/**
 * AIチャットのデフォルトシステムプロンプトを返す
 *
 * 目的: admin画面がテーマ新規作成時にデフォルトプロンプトを表示するために使用する。
 * 注意: このエンドポイントはadmin認証が必要（ルート設定で制御）。
 */
export const getDefaultPrompt = (req: Request, res: Response) => {
  res.status(200).json({ defaultPrompt: DEFAULT_CHAT_SYSTEM_PROMPT });
};

/**
 * 全パイプラインステージのデフォルト設定を返す
 *
 * 目的: admin画面がパイプライン設定UIでデフォルト値を表示するために使用する。
 * 注意: このエンドポイントはadmin認証が必要（ルート設定で制御）。
 */
export const getPipelineDefaults = (req: Request, res: Response) => {
  res.status(200).json({ stages: PIPELINE_STAGES });
};
