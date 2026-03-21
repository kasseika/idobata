/**
 * パイプライン設定解決サービス
 *
 * 目的: テーマ単位のパイプラインステージ別モデル/プロンプト設定を解決する。
 *       設定の優先度は Theme.pipelineConfig > customPrompt（chatステージのみ）> デフォルト値 の順。
 * 注意: テーマが見つからない場合やエラー時はデフォルト値にフォールバックする。
 */

import { getPipelineStageById } from "../constants/pipelineStages.js";
import Theme from "../models/Theme.js";

/**
 * 指定されたテーマIDとステージIDに対して、使用するモデルとプロンプトを解決して返す。
 *
 * 優先度:
 * 1. Theme.pipelineConfig.get(stageId).model / .prompt
 * 2. chatステージのみ: Theme.customPrompt（後方互換）
 * 3. pipelineStages.js の defaultModel / defaultPrompt
 *
 * @param {string} themeId - テーマのMongoose ObjectID文字列
 * @param {string} stageId - パイプラインステージID（pipelineStages.js 参照）
 * @returns {Promise<{ model: string, prompt: string }>} 解決済みのモデルとプロンプト
 */
export async function resolveStageConfig(themeId, stageId) {
  const stageDefaults = getPipelineStageById(stageId);
  if (!stageDefaults) {
    throw new Error(`[PipelineConfigService] Unknown stageId: ${stageId}`);
  }
  const defaultModel = stageDefaults.defaultModel;
  const defaultPrompt = stageDefaults.defaultPrompt;

  let model = defaultModel;
  let prompt = defaultPrompt;

  try {
    const theme = await Theme.findById(themeId);
    if (theme) {
      const stageConfig = theme.pipelineConfig?.get(stageId);

      model = stageConfig?.model ?? defaultModel;

      // プロンプトの解決: pipelineConfig > customPrompt（chatステージのみ）> デフォルト
      if (stageConfig?.prompt) {
        prompt = stageConfig.prompt;
      } else if (stageId === "chat" && theme.customPrompt) {
        prompt = theme.customPrompt;
      }
    }
  } catch (error) {
    console.error(
      `[PipelineConfigService] resolveStageConfig failed for theme=${themeId} stage=${stageId}:`,
      error
    );
    // DBエラー時はデフォルト値にリセットし、下の空modelチェックを通過させる
    model = defaultModel;
    prompt = defaultPrompt;
  }

  if (!model) {
    throw new Error(
      `[PipelineConfigService] model is empty for stage=${stageId}. Check pipelineConfig or stage defaults.`
    );
  }
  if (!prompt) {
    console.warn(
      `[PipelineConfigService] prompt is empty for stage=${stageId}. LLM will be called without a system prompt.`
    );
  }

  return { model, prompt };
}
