import pLimit from "p-limit";
import Problem from "../models/Problem.js";
import QuestionLink from "../models/QuestionLink.js";
import SharpQuestion from "../models/SharpQuestion.js";
import Solution from "../models/Solution.js";
import { callLLM } from "../services/llmService.js";
import { resolveStageConfig } from "../services/pipelineConfigService.js";
import { emitExtractionUpdate } from "../services/socketService.js";

const DEFAULT_CONCURRENCY_LIMIT = 10; // Set the concurrency limit here

/**
 * Links a specific Problem or Solution item to relevant SharpQuestions using LLM.
 * @param {string} itemId - The ID of the Problem or Solution item.
 * @param {'problem' | 'solution'} itemType - The type of the item ('problem' or 'solution').
 */
async function linkItemToQuestions(itemId, itemType) {
  console.log(`[LinkingWorker] Starting linking for ${itemType} ID: ${itemId}`);
  try {
    let item;
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

    const itemStatement =
      itemType === "problem" ? item.statement : item.statement;
    if (!itemStatement) {
      console.warn(
        `[LinkingWorker] Statement is empty for ${itemType} ID: ${itemId}. Skipping linking.`
      );
      return;
    }

    // Get the theme ID from the item
    const itemThemeId = item.themeId;
    if (!itemThemeId) {
      console.error(
        `[LinkingWorker] ${itemType} ${itemId} does not have a themeId. Cannot proceed with linking.`
      );
      return;
    }

    // Only fetch questions from the same theme
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
      const promptMessages = [
        {
          role: "system",
          content: linkingPrompt,
        },
        {
          role: "user",
          content: `Sharp Question: "${question.questionText}"

Statement (${itemType}): "${itemStatement}"

Analyze the relationship and provide the JSON output.`,
        },
      ];

      try {
        const llmResponse = await callLLM(promptMessages, true, linkingModel); // Request JSON output

        if (llmResponse?.is_relevant) {
          console.log(
            `[LinkingWorker] Found relevant link: Question ${question._id} <-> ${itemType} ${itemId} (Type: ${llmResponse.link_type})`
          );
          await QuestionLink.findOneAndUpdate(
            { questionId: question._id, linkedItemId: item._id },
            {
              questionId: question._id,
              linkedItemId: item._id,
              linkedItemType: itemType,
              linkType: llmResponse.link_type,
              relevanceScore: llmResponse.relevanceScore || 0.8, // Default score if missing
              rationale: llmResponse.rationale || "N/A",
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
        } else {
          // Optional: Log if not relevant or if response format is wrong
          // console.log(`[LinkingWorker] No relevant link found or invalid response for Question ${question._id} and ${itemType} ${itemId}`);
        }
      } catch (llmError) {
        console.error(
          `[LinkingWorker] LLM call failed for Question ${question._id} and ${itemType} ${itemId}:`,
          llmError
        );
        // Continue to the next question even if one LLM call fails
      }
    }

    console.log(
      `[LinkingWorker] Finished linking for ${itemType} ID: ${itemId}`
    );

    // Use the itemThemeId we already have
    if (itemThemeId) {
      emitExtractionUpdate(itemThemeId, null, itemType, item);
    }
  } catch (error) {
    console.error(
      `[LinkingWorker] Error processing linking for ${itemType} ID ${itemId}:`,
      error
    );
  }
}
/**
 * Links a specific SharpQuestion to a specific Problem or Solution item using LLM.
 * @param {string} questionId - The ID of the SharpQuestion.
 * @param {string} itemId - The ID of the Problem or Solution item.
 * @param {'problem' | 'solution'} itemType - The type of the item ('problem' or 'solution').
 */
async function linkSpecificQuestionToItem(questionId, itemId, itemType) {
  try {
    const question = await SharpQuestion.findById(questionId);
    if (!question) {
      console.error(
        `[LinkingWorker] SharpQuestion not found with ID: ${questionId}`
      );
      return;
    }

    let item;
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

    const itemStatement = item.statement;
    if (!itemStatement) {
      console.warn(
        `[LinkingWorker] Statement is empty for ${itemType} ID: ${itemId}. Skipping linking.`
      );
      return;
    }

    // SharpQuestion の themeId からパイプライン設定を解決
    const questionThemeId = question.themeId?.toString();
    const { model: linkingModel, prompt: linkingPrompt } = questionThemeId
      ? await resolveStageConfig(questionThemeId, "linking")
      : { model: undefined, prompt: undefined };

    const promptMessages = [
      {
        role: "system",
        content: linkingPrompt,
      },
      {
        role: "user",
        content: `Sharp Question: "${question.questionText}"

Statement (${itemType}): "${itemStatement}"

Analyze the relationship and provide the JSON output.`,
      },
    ];

    try {
      const llmResponse = await callLLM(promptMessages, true, linkingModel); // Request JSON output

      if (llmResponse?.is_relevant) {
        console.log(
          `[LinkingWorker] Found relevant link: Question ${questionId} <-> ${itemType} ${itemId} (Type: ${llmResponse.link_type})`
        );
        await QuestionLink.findOneAndUpdate(
          { questionId: questionId, linkedItemId: itemId },
          {
            questionId: questionId,
            linkedItemId: itemId,
            linkedItemType: itemType,
            linkType: llmResponse.link_type,
            relevanceScore: llmResponse.relevanceScore || 0.8, // Default score if missing
            rationale: llmResponse.rationale || "N/A",
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      } else {
        // Optional: Log if not relevant or if response format is wrong
        // console.log(`[LinkingWorker] No relevant link found or invalid response for Question ${questionId} and ${itemType} ${itemId}`);
      }
    } catch (llmError) {
      console.error(
        `[LinkingWorker] LLM call failed for Question ${questionId} and ${itemType} ${itemId}:`,
        llmError
      );
    }
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
 * @param {string} questionId - The ID of the newly generated SharpQuestion.
 */
async function linkQuestionToAllItems(questionId) {
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

    // Get the theme ID from the question
    const themeId = question.themeId;
    if (!themeId) {
      console.error(
        `[LinkingWorker] Question ${questionId} does not have a themeId. Cannot proceed with linking.`
      );
      return;
    }

    // Only fetch problems and solutions from the same theme
    const problems = await Problem.find({ themeId });
    const solutions = await Solution.find({ themeId });

    totalTasks = problems.length + solutions.length;
    console.log(
      `[LinkingWorker] Linking Question ${questionId} to ${problems.length} problems and ${solutions.length} solutions from theme ${themeId}. Total tasks: ${totalTasks}`
    );

    const tasks = [];

    // Prepare tasks for problems
    for (const problem of problems) {
      tasks.push(
        limit(async () => {
          try {
            await linkSpecificQuestionToItem(
              questionId,
              problem._id.toString(),
              "problem"
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

    // Prepare tasks for solutions
    for (const solution of solutions) {
      tasks.push(
        limit(async () => {
          try {
            await linkSpecificQuestionToItem(
              questionId,
              solution._id.toString(),
              "solution"
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

    // Execute all tasks concurrently
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
