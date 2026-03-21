/**
 * 論点分析生成ワーカー
 *
 * 目的: サービス層の generateDebateAnalysis をジョブキューから呼び出す薄いラッパー。
 */

import { generateDebateAnalysis } from "../services/debateAnalysisGenerator.js";

export async function generateDebateAnalysisTask(
  questionId: string
): Promise<object | undefined> {
  try {
    console.log(
      `[Worker] Starting debate analysis generation for questionId: ${questionId}`
    );

    const result = await generateDebateAnalysis(questionId);

    console.log(
      `[Worker] Successfully completed debate analysis generation for questionId: ${questionId}`
    );

    return result;
  } catch (error) {
    console.error(
      `[Worker] Error during debate analysis generation for questionId ${questionId}:`,
      error
    );
    throw error;
  }
}
