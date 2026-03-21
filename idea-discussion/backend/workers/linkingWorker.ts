/**
 * リンキングワーカー
 *
 * 目的: 課題・解決策と重要論点（SharpQuestion）の関連性を LLM で判定し、QuestionLink を生成する。
 * 注意: linkQuestionToAllItems は DB アクセスをループ外に集約し、N+1 問題を回避している。
 *       linkSpecificQuestionToItem は外部から呼び出されるため既存シグネチャを維持し、
 *       内部で DB 取得後に _executeLinking を呼ぶ。
 */

import type { Types } from "mongoose";
import pLimit from "p-limit";
import Problem from "../models/Problem.js";
import QuestionLink from "../models/QuestionLink.js";
import SharpQuestion from "../models/SharpQuestion.js";
import Solution from "../models/Solution.js";
import { callLLM } from "../services/llmService.js";
import { resolveStageConfig } from "../services/pipelineConfigService.js";
import { emitExtractionUpdate } from "../services/socketService.js";

const DEFAULT_CONCURRENCY_LIMIT = 10;

/** リンキング判定 LLM レスポンスの型 */
interface LinkingLLMResponse {
  is_relevant?: boolean;
  link_type?: string;
  relevanceScore?: number;
  rationale?: string;
}

/** リンキング対象アイテムの最小限の型 */
interface LinkableItem {
  _id: unknown;
  statement: string;
  themeId?: Types.ObjectId;
}

/**
 * LLM 呼び出しと QuestionLink 保存のみを行う内部ヘルパー。
 * DB アクセスは行わず、呼び出し元で取得済みのオブジェクトを受け取る。
 */
async function _executeLinking(
  question: { _id: unknown; questionText: string },
  item: LinkableItem,
  itemType: "problem" | "solution",
  linkingModel: string,
  linkingPrompt: string
): Promise<void> {
  const promptMessages = [
    {
      role: "system" as const,
      content: linkingPrompt,
    },
    {
      role: "user" as const,
      content: `Sharp Question: "${question.questionText}"

Statement (${itemType}): "${item.statement}"

Analyze the relationship and provide the JSON output.`,
    },
  ];

  try {
    const llmResponse = (await callLLM(
      promptMessages,
      true,
      linkingModel
    )) as LinkingLLMResponse;

    if (llmResponse?.is_relevant) {
      console.log(
        `[LinkingWorker] Found relevant link: Question ${question._id} <-> ${itemType} ${item._id} (Type: ${llmResponse.link_type})`
      );
      await QuestionLink.findOneAndUpdate(
        { questionId: question._id, linkedItemId: item._id },
        {
          questionId: question._id,
          linkedItemId: item._id,
          linkedItemType: itemType,
          linkType: llmResponse.link_type,
          relevanceScore: llmResponse.relevanceScore ?? 0.8,
          rationale: llmResponse.rationale || "N/A",
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }
  } catch (llmError) {
    console.error(
      `[LinkingWorker] LLM call failed for Question ${question._id} and ${itemType} ${item._id}:`,
      llmError
    );
  }
}

/**
 * Links a specific Problem or Solution item to relevant SharpQuestions using LLM.
 * @param itemId - The ID of the Problem or Solution item.
 * @param itemType - The type of the item ('problem' or 'solution').
 */
async function linkItemToQuestions(
  itemId: string,
  itemType: "problem" | "solution"
): Promise<void> {
  console.log(`[LinkingWorker] Starting linking for ${itemType} ID: ${itemId}`);
  try {
    let item: LinkableItem | null;
    if (itemType === "problem") {
      item = await Problem.findById(itemId);
    } else if (itemType === "solution") {
      item = await Solution.findById(itemId);
    } else {
      console.error(`[LinkingWorker] Invalid itemType: ${itemType}`);
      return;
    }

    if (!item) {
      console.error(`[LinkingWorker] ${itemType} not found with ID: ${itemId}`);
      return;
    }

    if (!item.statement) {
      console.warn(
        `[LinkingWorker] Statement is empty for ${itemType} ID: ${itemId}. Skipping linking.`
      );
      return;
    }

    const itemThemeId = item.themeId;
    if (!itemThemeId) {
      console.error(
        `[LinkingWorker] ${itemType} ${itemId} does not have a themeId. Cannot proceed with linking.`
      );
      return;
    }

    const questions = await SharpQuestion.find({ themeId: itemThemeId });
    if (questions.length === 0) {
      console.log(
        `[LinkingWorker] No sharp questions found in theme ${itemThemeId} to link against.`
      );
      return;
    }

    console.log(
      `[LinkingWorker] Found ${questions.length} questions in theme ${itemThemeId}. Checking links for ${itemType} ID: ${itemId}`
    );

    // テーマのパイプライン設定からリンキングステージのモデルとプロンプトを解決
    const { model: linkingModel, prompt: linkingPrompt } =
      await resolveStageConfig(itemThemeId.toString(), "linking");

    for (const question of questions) {
      await _executeLinking(
        question,
        item,
        itemType,
        linkingModel,
        linkingPrompt
      );
    }

    console.log(
      `[LinkingWorker] Finished linking for ${itemType} ID: ${itemId}`
    );

    emitExtractionUpdate(itemThemeId.toString(), null, itemType, item);
  } catch (error) {
    console.error(
      `[LinkingWorker] Error processing linking for ${itemType} ID ${itemId}:`,
      error
    );
  }
}

/**
 * Links a specific SharpQuestion to a specific Problem or Solution item using LLM.
 * @param questionId - The ID of the SharpQuestion.
 * @param itemId - The ID of the Problem or Solution item.
 * @param itemType - The type of the item ('problem' or 'solution').
 */
async function linkSpecificQuestionToItem(
  questionId: string,
  itemId: string,
  itemType: "problem" | "solution"
): Promise<void> {
  try {
    const question = await SharpQuestion.findById(questionId);
    if (!question) {
      console.error(
        `[LinkingWorker] SharpQuestion not found with ID: ${questionId}`
      );
      return;
    }

    let item: LinkableItem | null;
    if (itemType === "problem") {
      item = await Problem.findById(itemId);
    } else if (itemType === "solution") {
      item = await Solution.findById(itemId);
    } else {
      console.error(`[LinkingWorker] Invalid itemType: ${itemType}`);
      return;
    }

    if (!item) {
      console.error(`[LinkingWorker] ${itemType} not found with ID: ${itemId}`);
      return;
    }

    if (!item.statement) {
      console.warn(
        `[LinkingWorker] Statement is empty for ${itemType} ID: ${itemId}. Skipping linking.`
      );
      return;
    }

    // SharpQuestion の themeId からパイプライン設定を解決
    const questionThemeId = question.themeId?.toString();
    if (!questionThemeId) {
      console.warn(
        `[LinkingWorker] Question ${questionId} does not have a themeId. Skipping linking.`
      );
      return;
    }
    const { model: linkingModel, prompt: linkingPrompt } =
      await resolveStageConfig(questionThemeId, "linking");

    await _executeLinking(
      question,
      item,
      itemType,
      linkingModel,
      linkingPrompt
    );
  } catch (error) {
    console.error(
      `[LinkingWorker] Error processing specific linking for Question ${questionId} and ${itemType} ${itemId}:`,
      error
    );
  }
}

/**
 * Links all existing Problems and Solutions to a specific SharpQuestion.
 * Typically called after a new question is generated.
 * @param questionId - The ID of the newly generated SharpQuestion.
 */
async function linkQuestionToAllItems(questionId: string): Promise<void> {
  const concurrencyLimit = DEFAULT_CONCURRENCY_LIMIT;
  console.log(
    `[LinkingWorker] Starting linking for new Question ID: ${questionId} with concurrency ${concurrencyLimit}`
  );
  const limit = pLimit(concurrencyLimit);
  let completedTasks = 0;
  let totalTasks = 0;

  try {
    const question = await SharpQuestion.findById(questionId);
    if (!question) {
      console.error(
        `[LinkingWorker] SharpQuestion not found with ID: ${questionId}`
      );
      return;
    }

    const themeId = question.themeId;
    if (!themeId) {
      console.error(
        `[LinkingWorker] Question ${questionId} does not have a themeId. Cannot proceed with linking.`
      );
      return;
    }

    // リンキング設定をループ前に1回だけ解決（N+1 回避）
    const { model: linkingModel, prompt: linkingPrompt } =
      await resolveStageConfig(themeId.toString(), "linking");

    // 取得済みの problems/solutions を再利用（N+1 回避）
    const problems = await Problem.find({ themeId });
    const solutions = await Solution.find({ themeId });

    totalTasks = problems.length + solutions.length;
    console.log(
      `[LinkingWorker] Linking Question ${questionId} to ${problems.length} problems and ${solutions.length} solutions from theme ${themeId}. Total tasks: ${totalTasks}`
    );

    const tasks: Promise<void>[] = [];

    for (const problem of problems) {
      tasks.push(
        limit(async () => {
          try {
            await _executeLinking(
              question,
              problem as LinkableItem,
              "problem",
              linkingModel,
              linkingPrompt
            );
          } finally {
            completedTasks++;
            const progress =
              totalTasks > 0
                ? Math.round((completedTasks / totalTasks) * 100)
                : 100;
            console.log(
              `[LinkingWorker] Progress for Q ${questionId}: ${completedTasks}/${totalTasks} (${progress}%)`
            );
          }
        })
      );
    }

    for (const solution of solutions) {
      tasks.push(
        limit(async () => {
          try {
            await _executeLinking(
              question,
              solution as LinkableItem,
              "solution",
              linkingModel,
              linkingPrompt
            );
          } finally {
            completedTasks++;
            const progress =
              totalTasks > 0
                ? Math.round((completedTasks / totalTasks) * 100)
                : 100;
            console.log(
              `[LinkingWorker] Progress for Q ${questionId}: ${completedTasks}/${totalTasks} (${progress}%)`
            );
          }
        })
      );
    }

    await Promise.all(tasks);

    console.log(
      `[LinkingWorker] Finished linking for new Question ID: ${questionId}`
    );
  } catch (error) {
    console.error(
      `[LinkingWorker] Error processing linking for Question ID ${questionId}:`,
      error
    );
  }
}

export {
  linkItemToQuestions,
  linkQuestionToAllItems,
  linkSpecificQuestionToItem,
};
