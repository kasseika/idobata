/**
 * 透明性APIコントローラー
 *
 * 目的: AIパイプラインの処理内容（プロンプト・モデル）を公開するAPIを提供する。
 *       いどばたビジョンの処理透明性を確保し、ユーザーがAI処理の詳細を確認できるようにする。
 * 注意: 将来フェーズでAdmin画面からプロンプト/モデルを変更できるよう、
 *       Theme.showTransparency および SiteConfig.showTransparency の優先度ロジックをここで管理する。
 */

import { PIPELINE_STAGES } from "../constants/pipelineStages.js";
import SiteConfig from "../models/SiteConfig.js";
import Theme from "../models/Theme.js";

/**
 * 全パイプラインステージのメタデータを返す
 * GET /api/transparency/pipeline-stages
 *
 * @param {import('express').Request} req - Expressリクエスト
 * @param {import('express').Response} res - Expressレスポンス
 */
export async function getPipelineStages(req, res) {
  res.status(200).json({ stages: PIPELINE_STAGES });
}

/**
 * テーマの透明性設定とパイプライン情報を返す
 * GET /api/themes/:themeId/transparency
 *
 * showTransparency の優先度:
 * 1. Theme.showTransparency が null 以外の場合はその値を使用
 * 2. null の場合は SiteConfig.showTransparency を使用
 * 3. SiteConfig が存在しない場合はデフォルト true を使用
 *
 * @param {import('express').Request} req - Expressリクエスト
 * @param {import('express').Response} res - Expressレスポンス
 */
export async function getThemeTransparency(req, res) {
  const { themeId } = req.params;

  try {
    const theme = await Theme.findById(themeId);
    if (!theme) {
      return res.status(404).json({ error: "テーマが見つかりません" });
    }

    // showTransparency の解決: Theme > SiteConfig > デフォルト(true)
    let showTransparency;
    if (
      theme.showTransparency !== null &&
      theme.showTransparency !== undefined
    ) {
      showTransparency = theme.showTransparency;
    } else {
      const siteConfig = await SiteConfig.findOne();
      showTransparency = siteConfig?.showTransparency ?? true;
    }

    // テーマのカスタム設定をステージ情報に反映する
    const resolvedStages = PIPELINE_STAGES.map((stage) => {
      const custom = theme.pipelineConfig?.get(stage.id);
      const customizedModel = custom?.model ?? undefined;
      const customizedPrompt =
        custom?.prompt ??
        (stage.id === "chat" ? theme.customPrompt : undefined);
      return {
        ...stage,
        model: customizedModel || stage.defaultModel,
        prompt: customizedPrompt || stage.defaultPrompt,
        isCustomized: !!(customizedModel || customizedPrompt),
      };
    });

    res.status(200).json({
      showTransparency,
      stages: resolvedStages,
    });
  } catch (error) {
    // Mongoose の CastError は不正な themeId 形式を示す
    if (error.name === "CastError") {
      return res.status(400).json({ error: "無効なテーマIDです" });
    }
    console.error(
      "[TransparencyController] getThemeTransparency error:",
      error
    );
    res.status(500).json({ error: "内部サーバーエラー" });
  }
}
