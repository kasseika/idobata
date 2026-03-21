/**
 * チャットコントローラー
 *
 * 目的: テーマ別チャットメッセージ処理・スレッド取得APIを提供する。
 *       LLM を利用した AI 応答生成と非同期の課題・解決策抽出を行う。
 */

import type { Request, Response } from "express";
import type { HydratedDocument } from "mongoose";
import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";
import ChatThread from "../models/ChatThread.js";
import QuestionLink from "../models/QuestionLink.js";
import SharpQuestion from "../models/SharpQuestion.js";
import { callLLM } from "../services/llmService.js";
import { resolveStageConfig } from "../services/pipelineConfigService.js";
import type { IChatThread } from "../types/index.js";
import { processExtraction } from "../workers/extractionWorker.js";

// Controller function for handling new chat messages by theme
const handleNewMessageByTheme = async (req: Request, res: Response) => {
  const { themeId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(themeId)) {
    return res.status(400).json({ error: "Invalid theme ID format" });
  }

  try {
    let { userId, message, threadId, questionId, context } = req.body;

    // Validate input
    if (!message) {
      return res.status(400).json({ error: "Message content is required." });
    }

    // Generate a temporary userId if not provided
    if (!userId) {
      userId = `temp_${uuidv4()}`;
      console.log(`Generated temporary userId: ${userId}`);
    }

    let chatThread: HydratedDocument<IChatThread> | null | undefined;

    if (threadId) {
      // If threadId is provided, find the existing thread
      console.log(`Looking for existing chat thread with ID: ${threadId}`);
      chatThread = await ChatThread.findById(threadId);
      if (!chatThread) {
        console.error(`Chat thread with ID ${threadId} not found.`);
        return res.status(404).json({ error: "Chat thread not found." });
      }

      if (!chatThread.themeId || chatThread.themeId.toString() !== themeId) {
        console.error(`Thread ${threadId} does not belong to theme ${themeId}`);
        return res
          .status(403)
          .json({ error: "Thread does not belong to the specified theme." });
      }

      // Optional: Verify if the userId matches the thread's userId if needed for security
      if (chatThread.userId !== userId) {
        console.warn(
          `User ID mismatch for thread ${threadId}. Request userId: ${userId}, Thread userId: ${chatThread.userId}`
        );
      }
      console.log(`Found existing chat thread with ID: ${threadId}`);
    } else {
      // If no threadId is provided, create a new thread
      console.log(
        `Creating new chat thread for userId: ${userId} in theme: ${themeId}`
      );
      chatThread = new ChatThread({
        userId: userId,
        messages: [],
        extractedProblemIds: [],
        extractedSolutionIds: [],
        themeId: themeId,
      });
    }

    // Add user message to the thread
    chatThread.messages.push({
      role: "user",
      content: message,
      timestamp: new Date(),
    });

    // --- Fetch Reference Opinions (Sharp Questions and related Problems/Solutions) ---
    let referenceOpinions = "";

    if (
      context === "question" &&
      questionId &&
      mongoose.Types.ObjectId.isValid(questionId)
    ) {
      try {
        const question = await SharpQuestion.findById(questionId).lean();
        if (question) {
          referenceOpinions +=
            "現在の議論対象となっている「重要論点」について:\n\n";
          referenceOpinions += `重要論点: ${question.questionText}\n`;
          if (question.tagLine) {
            referenceOpinions += `概要: ${question.tagLine}\n`;
          }
          referenceOpinions += "\n";

          const problemLinks = await QuestionLink.aggregate([
            {
              $match: {
                questionId: question._id,
                linkedItemType: "problem",
                linkType: "prompts_question",
                relevanceScore: { $gte: 0.8 },
              },
            },
            { $sort: { relevanceScore: -1 } },
            { $limit: 15 },
            {
              $lookup: {
                from: "problems",
                localField: "linkedItemId",
                foreignField: "_id",
                as: "linkedProblem",
              },
            },
            {
              $unwind: {
                path: "$linkedProblem",
                preserveNullAndEmptyArrays: true,
              },
            },
          ]);

          if (
            problemLinks.length > 0 &&
            problemLinks.some((link) => link.linkedProblem)
          ) {
            referenceOpinions +=
              "この重要論点に関連性の高い課題 (関連度 >=80%):\n";
            for (const link of problemLinks) {
              if (link.linkedProblem) {
                const problem = link.linkedProblem;
                if (problem.themeId && problem.themeId.toString() === themeId) {
                  const statement =
                    problem.statement ||
                    problem.combinedStatement ||
                    problem.statementA ||
                    problem.statementB ||
                    "N/A";
                  const relevancePercent = Math.round(
                    link.relevanceScore * 100
                  );
                  referenceOpinions += `  - ${statement} (関連度: ${relevancePercent}%)\n`;
                }
              }
            }
          } else {
            referenceOpinions +=
              "この重要論点に関連性の高い課題: (ありません)\n";
          }

          const solutionLinks = await QuestionLink.aggregate([
            {
              $match: {
                questionId: question._id,
                linkedItemType: "solution",
                linkType: "answers_question",
                relevanceScore: { $gte: 0.8 },
              },
            },
            { $sort: { relevanceScore: -1 } },
            { $limit: 15 },
            {
              $lookup: {
                from: "solutions",
                localField: "linkedItemId",
                foreignField: "_id",
                as: "linkedSolution",
              },
            },
            {
              $unwind: {
                path: "$linkedSolution",
                preserveNullAndEmptyArrays: true,
              },
            },
          ]);

          if (
            solutionLinks.length > 0 &&
            solutionLinks.some((link) => link.linkedSolution)
          ) {
            referenceOpinions +=
              "この重要論点に関連性の高い解決策 (関連度 >=80%):\n";
            for (const link of solutionLinks) {
              if (link.linkedSolution) {
                const solution = link.linkedSolution;
                if (
                  solution.themeId &&
                  solution.themeId.toString() === themeId
                ) {
                  const relevancePercent = Math.round(
                    link.relevanceScore * 100
                  );
                  referenceOpinions += `  - ${solution.statement || "N/A"} (関連度: ${relevancePercent}%)\n`;
                }
              }
            }
          } else {
            referenceOpinions +=
              "この重要論点に関連性の高い解決策: (ありません)\n";
          }

          referenceOpinions +=
            "\n---\nこの特定の「重要論点」と関連する課題・解決策を踏まえ、ユーザーとの対話を深めてください。\n";
        }
      } catch (dbError) {
        console.error(
          `Error fetching question-specific context for question ${questionId}:`,
          dbError
        );
        // Fall back to theme-level context if question-specific fetch fails
      }
    } else {
      try {
        const themeQuestions = await SharpQuestion.find({ themeId }).lean();

        if (themeQuestions.length > 0) {
          referenceOpinions +=
            "参考情報として、システム内で議論されている主要な「重要論点」と、それに関連する意見の一部を紹介します:\n\n";

          for (const question of themeQuestions) {
            referenceOpinions += `重要論点: ${question.questionText}\n`;

            // Find up to 10 random related problems with relevance > 0.8
            const problemLinks = await QuestionLink.aggregate([
              {
                $match: {
                  questionId: question._id,
                  linkedItemType: "problem",
                  linkType: "prompts_question",
                  relevanceScore: { $gte: 0.8 },
                },
              },
              { $sample: { size: 10 } },
              {
                $lookup: {
                  from: "problems",
                  localField: "linkedItemId",
                  foreignField: "_id",
                  as: "linkedProblem",
                },
              },
              {
                $unwind: {
                  path: "$linkedProblem",
                  preserveNullAndEmptyArrays: true,
                },
              },
            ]);

            if (
              problemLinks.length > 0 &&
              problemLinks.some((link) => link.linkedProblem)
            ) {
              referenceOpinions += "  関連性の高い課題:\n";
              for (const link of problemLinks) {
                if (link.linkedProblem) {
                  const problem = link.linkedProblem;
                  if (
                    problem.themeId &&
                    problem.themeId.toString() === themeId
                  ) {
                    const statement =
                      problem.statement ||
                      problem.combinedStatement ||
                      problem.statementA ||
                      problem.statementB ||
                      "N/A";
                    referenceOpinions += `    - ${statement})\n`;
                  }
                }
              }
            } else {
              referenceOpinions += "  関連性の高い課題: (ありません)\n";
            }

            // Find up to 10 random related solutions with relevance > 0.8
            const solutionLinks = await QuestionLink.aggregate([
              {
                $match: {
                  questionId: question._id,
                  linkedItemType: "solution",
                  linkType: "answers_question",
                  relevanceScore: { $gte: 0.8 },
                },
              },
              { $sample: { size: 10 } },
              {
                $lookup: {
                  from: "solutions",
                  localField: "linkedItemId",
                  foreignField: "_id",
                  as: "linkedSolution",
                },
              },
              {
                $unwind: {
                  path: "$linkedSolution",
                  preserveNullAndEmptyArrays: true,
                },
              },
            ]);

            if (
              solutionLinks.length > 0 &&
              solutionLinks.some((link) => link.linkedSolution)
            ) {
              referenceOpinions +=
                "  関連性の高い解決策 (最大10件, 関連度 >80%):\n";
              for (const link of solutionLinks) {
                if (link.linkedSolution) {
                  const solution = link.linkedSolution;
                  if (
                    solution.themeId &&
                    solution.themeId.toString() === themeId
                  ) {
                    referenceOpinions += `    - ${solution.statement || "N/A"})\n`;
                  }
                }
              }
            } else {
              referenceOpinions += "  関連性の高い解決策: (ありません)\n";
            }
            referenceOpinions += "\n"; // Add space between questions
          }
          referenceOpinions +=
            "---\nこれらの「重要論点」や関連意見も踏まえ、ユーザーとの対話を深めてください。\n";
        }
      } catch (dbError) {
        console.error(
          `Error fetching reference opinions for theme ${themeId}:`,
          dbError
        );
        // Continue without reference opinions if DB fetch fails
      }
    }
    // --- End Fetch Reference Opinions ---

    // --- Call LLM for AI Response ---
    const llmMessages: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }> = [];

    // --- テーマのパイプライン設定からシステムプロンプトとモデルを解決 ---
    const { model: chatModel, prompt: systemPrompt } = await resolveStageConfig(
      themeId,
      "chat"
    );

    llmMessages.push({ role: "system", content: systemPrompt });
    // --- End core system prompt ---

    // Add the reference opinions as a system message
    if (referenceOpinions) {
      llmMessages.push({ role: "system", content: referenceOpinions });
    }

    // Add actual chat history
    llmMessages.push(
      ...chatThread.messages.map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      }))
    );

    // Call the LLM service
    const aiResponseContent = await callLLM(llmMessages, false, chatModel);

    if (!aiResponseContent) {
      console.error("LLM did not return a response.");
      return res
        .status(500)
        .json({ error: "AI failed to generate a response." });
    }

    // Add AI response to the thread
    chatThread.messages.push({
      role: "assistant",
      content: aiResponseContent as string,
      timestamp: new Date(),
    });
    // --- End LLM Call ---

    // Save the updated thread
    await chatThread.save();
    console.log(`Saved chat thread for userId: ${userId} in theme: ${themeId}`);

    // --- Trigger asynchronous extraction ---
    setTimeout(() => {
      const job = {
        data: {
          sourceType: "chat",
          sourceOriginId: String(chatThread._id),
          content: undefined,
          metadata: {},
          themeId: themeId,
        },
      };

      processExtraction(job).catch((err) => {
        console.error(
          `[Async Extraction Call] Error for thread ${chatThread._id} in theme ${themeId}:`,
          err
        );
      });
    }, 0);
    // --- End Trigger ---

    // Return the response
    const responsePayload: Record<string, unknown> = {
      response: aiResponseContent,
      threadId: chatThread._id,
    };
    if (req.body.userId !== userId) {
      responsePayload.userId = userId;
    }

    res.status(200).json(responsePayload);
  } catch (error) {
    console.error(`Error handling new message for theme ${themeId}:`, error);
    res
      .status(500)
      .json({ error: "Internal server error while processing message." });
  }
};

// Controller function for getting extractions for a specific thread by theme
const getThreadExtractionsByTheme = async (req: Request, res: Response) => {
  const { themeId, threadId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(themeId)) {
    return res.status(400).json({ error: "Invalid theme ID format" });
  }

  if (!threadId) {
    return res.status(400).json({ error: "Thread ID is required." });
  }

  try {
    // Find the chat thread and populate the extracted problems and solutions
    const chatThread = await ChatThread.findById(threadId)
      .populate("extractedProblemIds")
      .populate("extractedSolutionIds");

    if (!chatThread) {
      return res.status(404).json({ error: "Chat thread not found." });
    }

    if (!chatThread.themeId || chatThread.themeId.toString() !== themeId) {
      console.error(`Thread ${threadId} does not belong to theme ${themeId}`);
      return res
        .status(403)
        .json({ error: "Thread does not belong to the specified theme." });
    }

    // Return the populated problems and solutions
    res.status(200).json({
      problems: chatThread.extractedProblemIds || [],
      solutions: chatThread.extractedSolutionIds || [],
    });
  } catch (error) {
    console.error(
      `Error getting thread extractions for theme ${themeId}:`,
      error
    );
    if ((error as Error & { name: string }).name === "CastError") {
      return res.status(400).json({ error: "Invalid Thread ID format." });
    }
    res
      .status(500)
      .json({ error: "Internal server error while getting extractions." });
  }
};

// Controller function for getting a thread's messages by theme
const getThreadMessagesByTheme = async (req: Request, res: Response) => {
  const { themeId, threadId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(themeId)) {
    return res.status(400).json({ error: "Invalid theme ID format" });
  }

  if (!threadId) {
    return res.status(400).json({ error: "Thread ID is required." });
  }

  try {
    // Find the chat thread
    const chatThread = await ChatThread.findById(threadId);

    if (!chatThread) {
      return res.status(404).json({ error: "Chat thread not found." });
    }

    if (!chatThread.themeId || chatThread.themeId.toString() !== themeId) {
      console.error(`Thread ${threadId} does not belong to theme ${themeId}`);
      return res
        .status(403)
        .json({ error: "Thread does not belong to the specified theme." });
    }

    // Return the thread's messages
    res.status(200).json({
      threadId: chatThread._id,
      userId: chatThread.userId,
      themeId: chatThread.themeId,
      messages: chatThread.messages || [],
    });
  } catch (error) {
    console.error(`Error getting thread messages for theme ${themeId}:`, error);
    if ((error as Error & { name: string }).name === "CastError") {
      return res.status(400).json({ error: "Invalid Thread ID format." });
    }
    res
      .status(500)
      .json({ error: "Internal server error while getting thread messages." });
  }
};

// Controller function for getting a thread by user and question
const getThreadByUserAndQuestion = async (req: Request, res: Response) => {
  const { userId, questionId } = req.query as {
    userId?: string;
    questionId?: string;
  };

  if (!userId) {
    return res.status(400).json({ error: "User ID is required" });
  }

  if (!questionId) {
    return res.status(400).json({ error: "Question ID is required" });
  }

  // Validate questionId
  if (!mongoose.Types.ObjectId.isValid(questionId)) {
    return res.status(400).json({ error: "Invalid question ID format" });
  }

  try {
    // First, get the question to find the themeId
    const question = await SharpQuestion.findById(questionId);
    if (!question) {
      return res.status(404).json({ error: "Question not found" });
    }

    const themeId = question.themeId;

    // Build query object
    const query = {
      userId: userId,
      questionId: questionId,
    };

    const chatThread = await ChatThread.findOne(query);

    if (!chatThread) {
      const newChatThread = new ChatThread({
        themeId: themeId,
        userId: userId,
        questionId: questionId,
        messages: [],
        sessionId: `session_${Date.now()}`, // 一時的なセッションID
      });

      await newChatThread.save();

      return res.status(200).json({
        threadId: newChatThread._id,
        userId: userId,
        themeId: themeId,
        questionId: questionId,
        messages: [],
      });
    }

    return res.status(200).json({
      threadId: chatThread._id,
      userId: chatThread.userId,
      themeId: chatThread.themeId,
      questionId: chatThread.questionId,
      messages: chatThread.messages || [],
    });
  } catch (error) {
    console.error(
      `Error getting thread for user ${userId} and question ${questionId}:`,
      error
    );
    return res.status(500).json({
      error: "Internal server error while getting thread messages.",
    });
  }
};

// Controller function for getting a thread by user and theme (for theme-level chats)
const getThreadByUserAndTheme = async (req: Request, res: Response) => {
  const { themeId } = req.params;
  const { userId } = req.query as { userId?: string };

  if (!mongoose.Types.ObjectId.isValid(themeId)) {
    return res.status(400).json({ error: "Invalid theme ID format" });
  }

  if (!userId) {
    return res.status(400).json({ error: "User ID is required" });
  }

  try {
    // For theme-level chats, we don't use questionId
    const query = {
      themeId: themeId,
      userId: userId,
      questionId: null, // Explicitly exclude question-specific threads
    };

    const chatThread = await ChatThread.findOne(query);

    if (!chatThread) {
      const newChatThread = new ChatThread({
        themeId: themeId,
        userId: userId,
        questionId: null,
        messages: [],
        sessionId: `session_${Date.now()}`, // 一時的なセッションID
      });

      await newChatThread.save();

      return res.status(200).json({
        threadId: newChatThread._id,
        userId: userId,
        themeId: themeId,
        messages: [],
      });
    }

    return res.status(200).json({
      threadId: chatThread._id,
      userId: chatThread.userId,
      themeId: chatThread.themeId,
      messages: chatThread.messages || [],
    });
  } catch (error) {
    console.error(
      `Error getting thread for user ${userId} and theme ${themeId}:`,
      error
    );
    return res.status(500).json({
      error: "Internal server error while getting thread messages.",
    });
  }
};

export {
  getThreadExtractionsByTheme,
  getThreadMessagesByTheme,
  handleNewMessageByTheme,
  getThreadByUserAndTheme,
  getThreadByUserAndQuestion,
};
