/**
 * 透明性APIコントローラー
 *
 * 目的: AIパイプラインの処理内容（プロンプト・モデル）を公開するAPIを提供する。
 *       いどばたビジョンの処理透明性を確保し、ユーザーがAI処理の詳細を確認できるようにする。
 * 注意: 将来フェーズでAdmin画面からプロンプト/モデルを変更できるよう、
 *       Theme.showTransparency および SiteConfig.showTransparency の優先度ロジックをここで管理する。
 */

import type { Request, Response } from "express";
import { PIPELINE_STAGES } from "../constants/pipelineStages.js";
import PipelineConfigChangeLog from "../models/PipelineConfigChangeLog.js";
import SiteConfig from "../models/SiteConfig.js";
import Theme from "../models/Theme.js";
import { applyTemplateVariables } from "../services/pipelineConfigService.js";

/**
 * 全パイプラインステージのメタデータを返す
 * GET /api/transparency/pipeline-stages
 */
export async function getPipelineStages(req: Request, res: Response) {
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
 */
export async function getThemeTransparency(req: Request, res: Response) {
  const { themeId } = req.params;

  try {
    const theme = await Theme.findById(themeId);
    if (!theme) {
      return res.status(404).json({ error: "テーマが見つかりません" });
    }

    // showTransparency の解決: Theme > SiteConfig > デフォルト(true)
    let showTransparency: boolean | null | undefined;
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
      const hasCustomModel = custom?.model !== undefined;
      // resolvedPromptはpipelineConfigService.resolveStageConfigと同じ優先度で解決する:
      // pipelineConfig[stageId].prompt（truthy）> customPrompt（chatのみ、truthy）> defaultPrompt
      const rawPrompt =
        custom?.prompt ||
        (stage.id === "chat"
          ? theme.customPrompt || stage.defaultPrompt
          : stage.defaultPrompt);
      // 透明性表示には変数置換後の「実際にLLMに送られる内容」を表示する
      const resolvedPrompt = applyTemplateVariables(rawPrompt, {
        theme_title: theme.title ?? "",
        theme_description: theme.description ?? "",
      });
      const hasCustomPrompt =
        !!custom?.prompt || (stage.id === "chat" && !!theme.customPrompt);
      const resolvedModel = hasCustomModel ? custom.model : stage.defaultModel;
      return {
        ...stage,
        model: resolvedModel,
        prompt: resolvedPrompt,
        isCustomized: !!(hasCustomModel || hasCustomPrompt),
      };
    });

    // showTransparency=false の場合: prompt/model を除外したステージ情報のみ返す
    // 理由: 非公開設定のテーマでは直接API呼び出しでも内部プロンプトを閲覧させない
    const responseStages = showTransparency
      ? resolvedStages
      : resolvedStages.map(({ prompt, model, ...rest }) => rest);

    if (!showTransparency) {
      return res.status(200).json({ showTransparency, stages: responseStages });
    }

    // 変更ログを取得（時系列順）。changedBy（管理者ID）は公開しない
    const changeLogs = await PipelineConfigChangeLog.find({
      themeId: theme._id,
    })
      .sort({ changedAt: 1 })
      .lean()
      .then((logs) => logs.map(({ changedBy: _changedBy, ...rest }) => rest));

    res.status(200).json({
      showTransparency,
      stages: responseStages,
      changeLogs,
    });
  } catch (error) {
    // Mongoose の CastError は不正な themeId 形式を示す
    if (error instanceof Error && error.name === "CastError") {
      return res.status(400).json({ error: "無効なテーマIDです" });
    }
    console.error(
      "[TransparencyController] getThemeTransparency error:",
      error
    );
    res.status(500).json({ error: "内部サーバーエラー" });
  }
}
