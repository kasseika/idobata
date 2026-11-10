/**
 * 「その他の意見」のコントローラー
 *
 * 目的: 重要論点に拾われなかった意見を、テーマごとにまとめる生成を起動する（issue #147）。
 * 注意: 生成は LLM を呼ぶため時間がかかる。応答を待たせないよう非同期に起動し、すぐに 202 を返す。
 *       生成の失敗はログに残す（起動の応答は成功のまま）。
 */
import type { Request, Response } from "express";
import mongoose from "mongoose";
import Theme from "../models/Theme.js";
import { generateOtherOpinions } from "../workers/otherOpinionsGenerator.js";

/**
 * POST /api/themes/:themeId/generate-other-opinions - 「その他の意見」の生成を起動する
 */
export const triggerOtherOpinionsGeneration = async (
  req: Request,
  res: Response
) => {
  const { themeId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(themeId)) {
    return res.status(400).json({ message: "Invalid theme ID format" });
  }

  try {
    const theme = await Theme.exists({ _id: themeId });
    if (!theme) {
      return res.status(404).json({ message: "Theme not found" });
    }

    setTimeout(() => {
      generateOtherOpinions(themeId).catch((err) => {
        console.error(
          "[API Trigger] Error during background other opinions generation for theme %s:",
          themeId,
          err
        );
      });
    }, 0);

    res.status(202).json({
      message: `Other opinions generation started for theme ${themeId}`,
    });
  } catch (error) {
    console.error(
      "Error triggering other opinions generation for theme %s:",
      themeId,
      error
    );
    res.status(500).json({
      message: "Error triggering other opinions generation",
      error: (error as Error).message,
    });
  }
};
