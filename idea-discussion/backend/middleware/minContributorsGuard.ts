/**
 * 最小寄与人数 k による管理者向け API の制限
 *
 * 目的: k が有効なテーマでは、個々の課題文・解決策文やチャットの原文を返す API を、
 *       管理者にも呼ばせない（issue #146）。脅威モデルに管理者を含めたため。
 *       また、寄与人数が k 未満の重要論点では、生成物（政策ドラフト・レポート等）の生成と公開をさせない。
 *       対象のルートで、認証（protect・admin）の後に置く（公開の取得 API では認証なしで置く）。
 * 注意: - テーマ・論点の ID の形式が不正な場合や、見つからない場合は、判定せずに次へ進める。
 *         ID の検証と 404 は、各コントローラーがこれまでどおり返す
 *       - DB の読み込みに失敗した場合は next(error) でエラーとして扱い、処理には進めない
 */
import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { hidesIndividualOpinions } from "../constants/minContributors.js";
import SharpQuestion from "../models/SharpQuestion.js";
import Theme from "../models/Theme.js";
import { selectVisibleQuestions } from "../services/minContributorsService.js";

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

/**
 * ルートパラメータ :questionId の論点が、k が有効なテーマで寄与人数 k を満たさない場合に、
 * 指定した応答を返すミドルウェアを作る
 *
 * @param rejection - 拒否するときのステータスとメッセージ
 * 注意: k が無効なテーマの論点は、selectVisibleQuestions が常に表示可として返すため、従来どおり進める。
 */
const createHiddenQuestionGuard =
  (rejection: { status: 403 | 404; message: string }) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { questionId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(questionId)) {
      next();
      return;
    }
    try {
      const question = await SharpQuestion.findById(questionId)
        .select("themeId")
        .lean();
      if (question === null) {
        next();
        return;
      }
      const { visibleQuestions } = await selectVisibleQuestions([question]);
      if (visibleQuestions.length === 0) {
        res.status(rejection.status).json({ message: rejection.message });
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };

/** k 未満の論点で、生成物の生成を拒否する（管理者向けの生成 API に置く） */
export const rejectGenerationForHiddenQuestion = createHiddenQuestionGuard({
  status: 403,
  message:
    "この重要論点は、関わった参加者が最小寄与人数に満たないため、レポート等を生成できません。",
});

/** k 未満の論点の生成物を、存在しないものとして扱う（公開の取得 API に置く） */
export const hideOutputsOfHiddenQuestion = createHiddenQuestionGuard({
  status: 404,
  message: "Question not found",
});
