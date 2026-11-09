/**
 * 最小寄与人数 k による管理者向け API の制限
 *
 * 目的: k が有効なテーマでは、個々の課題文・解決策文やチャットの原文を返す API を、
 *       管理者にも呼ばせない（issue #146）。脅威モデルに管理者を含めたため。
 *       対象のルートで、認証（protect・admin）の後に置く。
 * 注意: - テーマ・論点の ID の形式が不正な場合や、見つからない場合は、判定せずに次へ進める。
 *         ID の検証と 404 は、各コントローラーがこれまでどおり返す
 *       - DB の読み込みに失敗した場合は next(error) でエラーとして扱い、処理には進めない
 */
import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { hidesIndividualOpinions } from "../constants/minContributors.js";
import SharpQuestion from "../models/SharpQuestion.js";
import Theme from "../models/Theme.js";

/** k が有効なテーマで、原文を返す API を拒否するときのメッセージ */
const HIDDEN_OPINIONS_MESSAGE =
  "このテーマは最小寄与人数が有効なため、個々の意見やチャットの内容を参照する機能は使えません。";

/**
 * テーマの k を確かめ、k が有効なら 403 を返す
 *
 * @returns 403 を返した場合は true（呼び出し元は next を呼ばない）
 */
const rejectIfHidden = async (
  themeId: unknown,
  res: Response
): Promise<boolean> => {
  const theme = await Theme.findById(themeId).select("minContributors").lean();
  if (theme !== null && hidesIndividualOpinions(theme)) {
    res.status(403).json({ message: HIDDEN_OPINIONS_MESSAGE });
    return true;
  }
  return false;
};

/**
 * ルートパラメータ :themeId のテーマで k が有効なら、403 を返す
 */
export const rejectWhenThemeHidesOpinions = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { themeId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(themeId)) {
    next();
    return;
  }
  try {
    if (!(await rejectIfHidden(themeId, res))) {
      next();
    }
  } catch (error) {
    next(error);
  }
};

/**
 * ルートパラメータ :questionId の論点が属するテーマで k が有効なら、403 を返す
 */
export const rejectWhenQuestionThemeHidesOpinions = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { questionId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(questionId)) {
    next();
    return;
  }
  try {
    const question = await SharpQuestion.findById(questionId)
      .select("themeId")
      .lean();
    if (question === null || !(await rejectIfHidden(question.themeId, res))) {
      next();
    }
  } catch (error) {
    next(error);
  }
};
