/**
 * 管理コントローラー
 *
 * 目的: 重要論点生成のトリガーおよびテーマ別の課題・解決策取得APIを提供する。
 * 注意: 最小寄与人数 k が有効なテーマでは、課題・解決策の一覧を空で返す（issue #146）。
 *       個々の課題文・解決策文から書き手を推定されるのを防ぐため。
 */

import type { Request, Response } from "express";
import mongoose from "mongoose";
import Problem from "../models/Problem.js";
import Solution from "../models/Solution.js";
import Theme from "../models/Theme.js";
import { hidesIndividualOpinions } from "../services/minContributorsService.js";
import { generateSharpQuestions } from "../workers/questionGenerator.js";

// Controller to trigger the sharp question generation process
const triggerQuestionGeneration = async (req: Request, res: Response) => {
  console.log(
    "[AdminController] Received request to generate sharp questions."
  );
  try {
    // Call the generation function (non-blocking, but we'll wait for it here for simplicity in manual trigger)
    // In a production scenario, this might add a job to a queue instead of direct execution.
    await (generateSharpQuestions as unknown as () => Promise<void>)();

    res.status(202).json({
      message: "Sharp question generation process started successfully.",
    });
  } catch (error) {
    console.error(
      "[AdminController] Error triggering question generation:",
      error
    );
    res
      .status(500)
      .json({ message: "Failed to start sharp question generation process." });
  }
};

const getProblemsByTheme = async (req: Request, res: Response) => {
  const { themeId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(themeId)) {
    return res.status(400).json({ message: "Invalid theme ID format" });
  }

  console.log(`[AdminController] Fetching problems for theme ${themeId}`);
  try {
    const theme = await Theme.findById(themeId)
      .select("minContributors")
      .lean();
    if (theme && hidesIndividualOpinions(theme)) {
      return res.status(200).json([]);
    }
    const problems = await Problem.find({ themeId }).sort({ createdAt: -1 });
    res.status(200).json(problems);
  } catch (error) {
    console.error(
      "[AdminController] Error fetching problems for theme %s:",
      themeId,
      error
    );
    res.status(500).json({
      message: "Failed to fetch problems for theme",
      error: (error as Error).message,
    });
  }
};

const getSolutionsByTheme = async (req: Request, res: Response) => {
  const { themeId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(themeId)) {
    return res.status(400).json({ message: "Invalid theme ID format" });
  }

  console.log(`[AdminController] Fetching solutions for theme ${themeId}`);
  try {
    const theme = await Theme.findById(themeId)
      .select("minContributors")
      .lean();
    if (theme && hidesIndividualOpinions(theme)) {
      return res.status(200).json([]);
    }
    const solutions = await Solution.find({ themeId }).sort({ createdAt: -1 });
    res.status(200).json(solutions);
  } catch (error) {
    console.error(
      "[AdminController] Error fetching solutions for theme %s:",
      themeId,
      error
    );
    res.status(500).json({
      message: "Failed to fetch solutions for theme",
      error: (error as Error).message,
    });
  }
};

const triggerQuestionGenerationByTheme = async (
  req: Request,
  res: Response
) => {
  const { themeId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(themeId)) {
    return res.status(400).json({ message: "Invalid theme ID format" });
  }

  console.log(
    `[AdminController] Received request to generate sharp questions for theme ${themeId}`
  );
  try {
    await generateSharpQuestions(themeId);

    res.status(202).json({
      message: "Sharp question generation process started successfully.",
    });
  } catch (error) {
    console.error(
      "[AdminController] Error triggering question generation for theme %s:",
      themeId,
      error
    );
    res.status(500).json({
      message: "Failed to start sharp question generation process for theme",
      error: (error as Error).message,
    });
  }
};

export {
  triggerQuestionGeneration,
  getProblemsByTheme,
  getSolutionsByTheme,
  triggerQuestionGenerationByTheme,
};
