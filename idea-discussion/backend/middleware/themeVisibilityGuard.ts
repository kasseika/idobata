/**
 * テーマの公開状態による、論点取得 API の制限（issue #151）
 *
 * 目的: 参加者に見せていないテーマ（draft・archived）の論点や、URL のテーマに属さない論点を、
 *       論点の ID を知っているだけで取得できないようにする。
 *       規則はテーマ詳細（themeController.ts の getThemeDetail）と同じで、管理者には制限しない。
 * 使い方: optionalProtect の後に置き、req.user で管理者かどうかを判定する。
 * 注意: - テーマ・論点の ID の形式が不正な場合や、見つからない場合は、判定せずに次へ進める。
 *         ID の検証と 404 は、各コントローラーがこれまでどおり返す
 *       - DB の読み込みに失敗した場合は next(error) でエラーとして扱い、処理には進めない
 */
import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { isHiddenFromParticipants } from "../constants/themeStatuses.js";
import SharpQuestion from "../models/SharpQuestion.js";
import Theme from "../models/Theme.js";

/**
 * ルートパラメータ :themeId のテーマが参加者に見せない状態なら、非管理者に 404 を返す
 */
export const hideUnpublishedTheme = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { themeId } = req.params;
  if (req.user?.role === "admin" || !mongoose.Types.ObjectId.isValid(themeId)) {
    next();
    return;
  }
  try {
    const theme = await Theme.findById(themeId).select("status").lean();
    if (theme !== null && isHiddenFromParticipants(theme.status)) {
      res.status(404).json({ message: "Theme not found" });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * ルートパラメータ :questionId の論点が :themeId のテーマに属さないなら、404 を返す
 *
 * 注意: 論点が属するテーマの公開状態は hideUnpublishedTheme が :themeId で確かめるため、
 *       この確認と組み合わせることで、論点が属するテーマの公開状態も確かめたことになる。
 *       管理者にも適用する（URL と論点の食い違いは、管理者にとっても誤った指定であるため）。
 */
export const requireQuestionInTheme = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { themeId, questionId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(questionId)) {
    next();
    return;
  }
  try {
    const question = await SharpQuestion.findById(questionId)
      .select("themeId")
      .lean();
    // ObjectId の16進数は大文字・小文字を区別しない。DB の値は小文字なので、URL の値も小文字にそろえて比べる
    if (
      question !== null &&
      String(question.themeId) !== themeId.toLowerCase()
    ) {
      res.status(404).json({ message: "Question not found" });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
};
