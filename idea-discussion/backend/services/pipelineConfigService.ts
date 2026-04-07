/**
 * パイプライン設定解決サービス
 *
 * 目的: テーマ単位のパイプラインステージ別モデル/プロンプト設定を解決する。
 *       設定の優先度は Theme.pipelineConfig > customPrompt（chatステージのみ）> デフォルト値 の順。
 *       プロンプト解決後に {{theme_title}} / {{theme_description}} 変数を実値で置換する。
 * 注意: テーマが見つからない場合やエラー時はデフォルト値にフォールバックする。
 *       テーマが見つからない場合は変数置換をスキップし、テンプレート文字列がそのまま使われる。
 */

import { getPipelineStageById } from "../constants/pipelineStages.js";
import Theme from "../models/Theme.js";

/**
 * プロンプトテンプレートの変数を実値で置換する。
 *
 * 対応変数:
 * - {{theme_title}}: テーマのタイトル
 * - {{theme_description}}: テーマの説明文
 *
 * @param template - 置換対象のプロンプトテンプレート文字列
 * @param variables - 変数名と置換値のマップ
 * @returns 変数置換後のプロンプト文字列
 */
export function applyTemplateVariables(
  template: string,
  variables: Record<string, string>
): string {
  return Object.entries(variables).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, value),
    template
  );
}

/**
 * 指定されたテーマIDとステージIDに対して、使用するモデルとプロンプトを解決して返す。
 *
 * 優先度:
 * 1. Theme.pipelineConfig.get(stageId).model / .prompt
 * 2. chatステージのみ: Theme.customPrompt（後方互換）
 * 3. pipelineStages.ts の defaultModel / defaultPrompt
 *
 * プロンプト解決後に applyTemplateVariables でテーマ変数を置換する。
 * テーマが見つからない/DBエラー時は変数置換をスキップしてデフォルト値を返す。
 *
 * @param themeId - テーマのMongoose ObjectID文字列
 * @param stageId - パイプラインステージID（pipelineStages.ts 参照）
 * @returns 解決済みのモデルとプロンプト（変数置換済み）
 */
export async function resolveStageConfig(
  themeId: string,
  stageId: string
): Promise<{ model: string; prompt: string }> {
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

      // プロンプトテンプレート変数をテーマの実値で置換する
      prompt = applyTemplateVariables(prompt, {
        theme_title: theme.title ?? "",
        theme_description: theme.description ?? "",
      });
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
