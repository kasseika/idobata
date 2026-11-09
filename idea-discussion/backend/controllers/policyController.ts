/**
 * 政策ドラフトコントローラー
 *
 * 目的: テーマに属する全質問の政策ドラフトを取得するAPIを提供する。
 */

import type { Request, Response } from "express";
import mongoose from "mongoose";
import PolicyDraft from "../models/PolicyDraft.js";
import SharpQuestion from "../models/SharpQuestion.js";
import { selectVisibleQuestions } from "../services/minContributorsService.js";

export const getPolicyDraftsByTheme = async (req: Request, res: Response) => {
  const { themeId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(themeId)) {
    return res.status(400).json({ message: "Invalid theme ID format" });
  }

  try {
    // 最小寄与人数 k が有効なテーマでは、k 未満の論点の政策ドラフトを返さない（issue #146）
    const { visibleQuestions } = await selectVisibleQuestions(
      await SharpQuestion.find({ themeId })
    );
    const questionIds = visibleQuestions.map((q) => q._id);

    const drafts = await PolicyDraft.find({ questionId: { $in: questionIds } })
      .sort({ createdAt: -1 })
      .populate("questionId", "questionText");

    res.status(200).json(drafts);
  } catch (error) {
    console.error("Error fetching policy drafts for theme %s:", themeId, error);
    res.status(500).json({
      message: "Failed to fetch policy drafts for theme",
      error: (error as Error).message,
    });
  }
};
