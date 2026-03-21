/**
 * 管理コントローラー
 *
 * 目的: 重要論点生成のトリガーおよびテーマ別の課題・解決策取得APIを提供する。
 */

import type { Request, Response } from "express";
import mongoose from "mongoose";
import Problem from "../models/Problem.js";
import Solution from "../models/Solution.js";
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
    const problems = await Problem.find({ themeId }).sort({ createdAt: -1 });
    res.status(200).json(problems);
  } catch (error) {
    console.error(
      `[AdminController] Error fetching problems for theme ${themeId}:`,
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
    const solutions = await Solution.find({ themeId }).sort({ createdAt: -1 });
    res.status(200).json(solutions);
  } catch (error) {
    console.error(
      `[AdminController] Error fetching solutions for theme ${themeId}:`,
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
      `[AdminController] Error triggering question generation for theme ${themeId}:`,
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
