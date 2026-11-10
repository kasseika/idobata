/**
 * ダイジェストドラフトコントローラー
 *
 * 目的: テーマに属する全質問のダイジェストドラフトを取得するAPIを提供する。
 */

import type { Request, Response } from "express";
import mongoose from "mongoose";
import DigestDraft from "../models/DigestDraft.js";
import SharpQuestion from "../models/SharpQuestion.js";
import { selectVisibleQuestions } from "../services/minContributorsService.js";

export const getDigestDraftsByTheme = async (req: Request, res: Response) => {
  const { themeId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(themeId)) {
    return res.status(400).json({ message: "Invalid theme ID format" });
  }

  try {
    // 最小寄与人数 k が有効なテーマでは、k 未満の論点のダイジェストを返さない（issue #146）
    const { visibleQuestions } = await selectVisibleQuestions(
      await SharpQuestion.find({ themeId })
    );
    const questionIds = visibleQuestions.map((q) => q._id);

    const drafts = await DigestDraft.find({ questionId: { $in: questionIds } })
      .sort({ createdAt: -1 })
      .populate("questionId", "questionText")
      .populate("policyDraftId", "title");

    res.status(200).json(drafts);
  } catch (error) {
    console.error("Error fetching digest drafts for theme %s:", themeId, error);
    res.status(500).json({
      message: "Failed to fetch digest drafts for theme",
      error: (error as Error).message,
    });
  }
};
