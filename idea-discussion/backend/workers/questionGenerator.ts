/**
 * 重要論点生成ワーカー
 *
 * 目的: テーマの課題一覧から LLM を使用して HMW 形式の重要論点を生成し、DB に保存する。
 * 注意: 生成後、各論点に対して linkQuestionToAllItems を非同期でトリガーする。
 */

import Problem from "../models/Problem.js";
import SharpQuestion from "../models/SharpQuestion.js";
import { callLLM } from "../services/llmService.js";
import { resolveStageConfig } from "../services/pipelineConfigService.js";
import { linkQuestionToAllItems } from "./linkingWorker.js";

/** LLM が返す重要論点オブジェクトの型 */
interface GeneratedQuestionObject {
  question: string;
  tagLine?: string;
  tags?: string[];
}

async function generateSharpQuestions(themeId: string): Promise<void> {
  console.log(
    `[QuestionGenerator] Starting sharp question generation for theme ${themeId}...`
  );
  try {
    // 1. Fetch all problem statements for this theme
    const problems = await Problem.find({ themeId }, "statement").lean();
    if (!problems || problems.length === 0) {
      console.log(
        `[QuestionGenerator] No problems found for theme ${themeId} to generate questions from.`
      );
      return;
    }
    const problemStatements = problems.map((p) => p.statement);
    console.log(
      `[QuestionGenerator] Found ${problemStatements.length} problem statements for theme ${themeId}.`
    );

    // 2. パイプライン設定からシステムプロンプトとモデルを解決
    const { model: questionModel, prompt: questionPrompt } =
      await resolveStageConfig(themeId, "question_generation");

    const messages = [
      {
        role: "system" as const,
        content: questionPrompt,
      },
      {
        role: "user" as const,
        content: `Based on the following problem statements, please generate relevant questions in Japanese using the format "How Might We...":\n\n${problemStatements.join("\n- ")}\n\nFor each question, clearly describe both the current state ("現状はこう") and the desired state ("それをこうしたい") with high detail. Focus exclusively on describing these states without suggesting any specific means, methods, or solutions that could narrow the range of possible answers.\n\nPlease provide the output as a JSON object containing a "questions" array, where each element is an object with "question", "tagLine", and "tags" keys.`,
      },
    ];

    // 3. Call LLM
    console.log("[QuestionGenerator] Calling LLM to generate questions...");
    const llmResponse = (await callLLM(messages, true, questionModel)) as {
      questions?: GeneratedQuestionObject[];
    };

    if (
      !llmResponse ||
      !Array.isArray(llmResponse.questions) ||
      llmResponse.questions.length === 0
    ) {
      console.error(
        "[QuestionGenerator] Failed to get valid questions array from LLM response:",
        llmResponse
      );
      return;
    }

    const generatedQuestionObjects = llmResponse.questions;
    console.log(
      `[QuestionGenerator] LLM generated ${generatedQuestionObjects.length} question objects.`
    );

    // 4. Save questions to DB (avoid duplicates)
    let savedCount = 0;
    for (const questionObj of generatedQuestionObjects) {
      const questionText = questionObj.question;
      const tagLine = questionObj.tagLine || "";
      const tags = questionObj.tags || [];

      if (!questionText || typeof questionText !== "string") {
        console.warn(
          "[QuestionGenerator] Skipping invalid question object (missing or invalid text):",
          questionObj
        );
        continue;
      }
      try {
        // Use findOneAndUpdate with upsert to avoid duplicates based on questionText and themeId
        const result = await SharpQuestion.findOneAndUpdate(
          { questionText: questionText.trim(), themeId }, // Include themeId in query
          {
            $setOnInsert: {
              questionText: questionText.trim(),
              tagLine: tagLine,
              tags: tags,
              themeId,
              createdAt: new Date(),
            },
          }, // Add themeId and createdAt on insert
          {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
            runValidators: true,
          } // Create if not exists, return the new doc
        );

        if (result?._id) {
          // Trigger linking asynchronously for the new or existing question
          console.log(
            `[QuestionGenerator] Triggering linking for question ID: ${result._id}`
          );
          setTimeout(() => linkQuestionToAllItems(String(result._id)), 0);
          savedCount++;
        } else {
          console.warn(
            `[QuestionGenerator] Failed to save or find question: ${questionText}`
          );
        }
      } catch (dbError) {
        console.error(
          `[QuestionGenerator] Error saving question "${questionText}":`,
          dbError
        );
      }
    }

    console.log(
      `[QuestionGenerator] Successfully processed ${savedCount} questions (new or existing).`
    );
  } catch (error) {
    console.error(
      "[QuestionGenerator] Error during sharp question generation:",
      error
    );
  }
}

export { generateSharpQuestions };
