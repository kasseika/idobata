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
import Theme, { STATUS_FIELD_MAP } from "../models/Theme.js";

/**
 * 許可されたステータス遷移マップ
 * キー: 現在のステータス、値: 遷移可能なステータスの配列
 */
const ALLOWED_STATUS_TRANSITIONS = {
  draft: ["active"],
  active: ["closed"],
  closed: ["draft"],
};

export const getAllThemes = async (req, res) => {
  try {
    // 管理者かつ includeInactive=true の場合のみ全テーマ取得、それ以外はアクティブのみ
    const isAdmin = req.user?.role === "admin";
    const filter =
      isAdmin && req.query.includeInactive === "true" ? {} : { isActive: true };
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
        slug: theme.slug,
        isActive: theme.isActive,
        tags: theme.tags || [],
        createdAt: theme.createdAt,
        keyQuestionCount: questionCountMap.get(key) ?? 0,
        commentCount: threadCountMap.get(key) ?? 0,
      };
    });

    return res.status(200).json(enhancedThemes);
  } catch (error) {
    console.error("Error fetching all themes:", error);
    return res
      .status(500)
      .json({ message: "Error fetching themes", error: error.message });
  }
};

export const getThemeById = async (req, res) => {
  const { themeId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(themeId)) {
    return res.status(400).json({ message: "Invalid theme ID format" });
  }

  try {
    const theme = await Theme.findById(themeId);
    if (!theme) {
      return res.status(404).json({ message: "Theme not found" });
    }
    return res.status(200).json(theme);
  } catch (error) {
    console.error(`Error fetching theme ${themeId}:`, error);
    return res
      .status(500)
      .json({ message: "Error fetching theme", error: error.message });
  }
};

export const createTheme = async (req, res) => {
  const {
    title,
    description,
    slug,
    status,
    customPrompt,
    tags,
    pipelineConfig,
  } = req.body;

  if (!title || !slug) {
    return res.status(400).json({ message: "Title and slug are required" });
  }

  try {
    const existingTheme = await Theme.findOne({ slug });
    if (existingTheme) {
      return res
        .status(400)
        .json({ message: "A theme with this slug already exists" });
    }

    // status から isActive/disableNewComment を決定する
    const resolvedStatus = status || "draft";
    const statusFields =
      STATUS_FIELD_MAP[resolvedStatus] || STATUS_FIELD_MAP.draft;

    const theme = new Theme({
      title,
      description,
      slug,
      status: resolvedStatus,
      isActive: statusFields.isActive,
      disableNewComment: statusFields.disableNewComment,
      customPrompt,
      tags: tags || [],
      pipelineConfig: pipelineConfig || {},
    });

    const savedTheme = await theme.save();
    return res.status(201).json(savedTheme);
  } catch (error) {
    console.error("Error creating theme:", error);
    return res
      .status(500)
      .json({ message: "Error creating theme", error: error.message });
  }
};

export const updateTheme = async (req, res) => {
  const { themeId } = req.params;
  const {
    title,
    description,
    slug,
    status,
    customPrompt,
    tags,
    pipelineConfig,
  } = req.body;

  if (!mongoose.Types.ObjectId.isValid(themeId)) {
    return res.status(400).json({ message: "Invalid theme ID format" });
  }

  try {
    const theme = await Theme.findById(themeId);
    if (!theme) {
      return res.status(404).json({ message: "Theme not found" });
    }

    // プロンプトロック制御: active または closed のテーマはプロンプト変更不可
    const isPromptLocked =
      theme.status === "active" || theme.status === "closed";
    if (
      isPromptLocked &&
      (pipelineConfig !== undefined || customPrompt !== undefined)
    ) {
      return res.status(400).json({
        message:
          "公開中または終了済みのテーマのプロンプト設定はロックされています。緊急修正APIを使用してください。",
      });
    }

    // ステータス遷移バリデーション
    if (status !== undefined && status !== theme.status) {
      const allowedNext = ALLOWED_STATUS_TRANSITIONS[theme.status] || [];
      if (!allowedNext.includes(status)) {
        return res.status(400).json({
          message: `ステータスの遷移 "${theme.status}" → "${status}" は許可されていません。`,
        });
      }
    }

    if (slug && slug !== theme.slug) {
      const existingTheme = await Theme.findOne({ slug });
      if (existingTheme && existingTheme._id.toString() !== themeId) {
        return res
          .status(400)
          .json({ message: "A theme with this slug already exists" });
      }
    }

    // status が変わる場合は isActive/disableNewComment を同期する
    const resolvedStatus = status !== undefined ? status : theme.status;
    const statusFields = STATUS_FIELD_MAP[resolvedStatus];

    const updatedTheme = await Theme.findByIdAndUpdate(
      themeId,
      {
        title: title || theme.title,
        description:
          description !== undefined ? description : theme.description,
        slug: slug || theme.slug,
        status: resolvedStatus,
        isActive: statusFields.isActive,
        disableNewComment: statusFields.disableNewComment,
        customPrompt:
          customPrompt !== undefined ? customPrompt : theme.customPrompt,
        tags: tags !== undefined ? tags || [] : theme.tags,
        pipelineConfig:
          pipelineConfig !== undefined ? pipelineConfig : theme.pipelineConfig,
      },
      { new: true, runValidators: true }
    );

    return res.status(200).json(updatedTheme);
  } catch (error) {
    console.error(`Error updating theme ${themeId}:`, error);
    return res
      .status(500)
      .json({ message: "Error updating theme", error: error.message });
  }
};

export const deleteTheme = async (req, res) => {
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
    return res
      .status(500)
      .json({ message: "Error deleting theme", error: error.message });
  }
};

export const getThemeDetail = async (req, res) => {
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

    // キークエスチョンを取得
    const keyQuestions = await SharpQuestion.find({ themeId });

    // 課題（問題点）を取得
    const issues = await Problem.find({ themeId });

    // 解決策を取得
    const solutions = await Solution.find({ themeId });

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

    // 最適化されたレスポンスを返す
    res.status(200).json({
      theme,
      keyQuestions: keyQuestionsWithCounts,
      issues,
      solutions,
    });
  } catch (error) {
    console.error("Error fetching theme detail:", error);
    res.status(500).json({ message: "Server error", error: error.message });
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
export const emergencyUpdatePipelineConfig = async (req, res) => {
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

    // 変更ログを記録
    const changeLog = new PipelineConfigChangeLog({
      themeId: theme._id,
      stageId,
      previousModel: currentStageConfig.model,
      previousPrompt: currentStageConfig.prompt,
      newModel: model !== undefined ? model : currentStageConfig.model,
      newPrompt: prompt !== undefined ? prompt : currentStageConfig.prompt,
      reason,
      changedBy: req.user?._id,
    });
    await changeLog.save();

    // pipelineConfig を更新する（既存の Map をコピーして上書き）
    const updatedPipelineConfig = Object.fromEntries(
      theme.pipelineConfig instanceof Map
        ? theme.pipelineConfig
        : Object.entries(theme.pipelineConfig || {})
    );
    updatedPipelineConfig[stageId] = {
      model: model !== undefined ? model : currentStageConfig.model,
      prompt: prompt !== undefined ? prompt : currentStageConfig.prompt,
    };

    const updatedTheme = await Theme.findByIdAndUpdate(
      themeId,
      { pipelineConfig: updatedPipelineConfig },
      { new: true }
    );

    return res.status(200).json(updatedTheme);
  } catch (error) {
    console.error(
      `Error in emergencyUpdatePipelineConfig for theme ${themeId}:`,
      error
    );
    return res.status(500).json({
      message: "Error updating pipeline config",
      error: error.message,
    });
  }
};

/**
 * AIチャットのデフォルトシステムプロンプトを返す
 *
 * 目的: admin画面がテーマ新規作成時にデフォルトプロンプトを表示するために使用する。
 * 注意: このエンドポイントはadmin認証が必要（ルート設定で制御）。
 */
export const getDefaultPrompt = (req, res) => {
  res.status(200).json({ defaultPrompt: DEFAULT_CHAT_SYSTEM_PROMPT });
};

/**
 * 全パイプラインステージのデフォルト設定を返す
 *
 * 目的: admin画面がパイプライン設定UIでデフォルト値を表示するために使用する。
 * 注意: このエンドポイントはadmin認証が必要（ルート設定で制御）。
 */
export const getPipelineDefaults = (req, res) => {
  res.status(200).json({ stages: PIPELINE_STAGES });
};
