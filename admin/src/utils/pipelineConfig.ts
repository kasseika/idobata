/**
 * パイプライン設定ユーティリティ
 *
 * 目的: ThemeForm のフォームデータからデフォルト値と同一の設定を除外し、
 *       将来のデフォルト変更が既存テーマに追従できるよう正規化する。
 * 注意: デフォルト値と完全一致するフィールドは保存せず、カスタム値のみを永続化する。
 */

import type { PipelineStageDefault } from "../services/api/types";

/**
 * pipelineConfig からデフォルト値と同一のエントリを除外して返す。
 *
 * @param config - フォームの pipelineConfig（全ステージのモデルとプロンプトを含む）
 * @param defaults - APIから取得したパイプラインステージのデフォルト定義
 * @returns デフォルト値と異なるフィールドのみを含む正規化済み設定
 */
export function stripDefaultsFromPipelineConfig(
  config: Record<string, { model?: string; prompt?: string }>,
  defaults: PipelineStageDefault[]
): Record<string, { model?: string; prompt?: string }> {
  const result: Record<string, { model?: string; prompt?: string }> = {};

  for (const [stageId, stageConfig] of Object.entries(config)) {
    const stageDefault = defaults.find((d) => d.id === stageId);
    const customEntry: { model?: string; prompt?: string } = {};

    if (
      stageConfig.model !== undefined &&
      stageConfig.model !== stageDefault?.defaultModel
    ) {
      customEntry.model = stageConfig.model;
    }
    if (
      stageConfig.prompt !== undefined &&
      stageConfig.prompt !== stageDefault?.defaultPrompt
    ) {
      customEntry.prompt = stageConfig.prompt;
    }

    if (Object.keys(customEntry).length > 0) {
      result[stageId] = customEntry;
    }
  }

  return result;
}
