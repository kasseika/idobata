/**
 * パイプラインステージカードコンポーネント
 *
 * 目的: AIパイプラインの各処理ステージをカード形式で表示する。
 *       ステージ名・説明・使用モデルのBadge・プロンプト閲覧ボタンを含む。
 */

import type { PipelineStage } from "../../services/api/apiClient";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { PromptDrawer } from "./PromptDrawer";

interface PipelineStageCardProps {
  stage: PipelineStage;
}

/**
 * 各パイプラインステージの情報をカード形式で表示するコンポーネント
 */
export function PipelineStageCard({ stage }: PipelineStageCardProps) {
  return (
    <div className="flex gap-4">
      {/* タイムラインのドット */}
      <div className="flex flex-col items-center">
        <div className="w-8 h-8 rounded-full bg-blue-100 border-2 border-blue-400 flex items-center justify-center flex-shrink-0">
          <span className="text-sm font-bold text-blue-700">{stage.order}</span>
        </div>
        <div className="w-0.5 bg-blue-100 flex-1 mt-1" />
      </div>

      {/* カードコンテンツ */}
      <div className="flex-1 pb-4">
        <Card className="border border-zinc-200 rounded-lg p-0 shadow-sm">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-sm font-semibold text-zinc-800">
                {stage.name}
              </CardTitle>
              {/* モデル名 Badge */}
              <span className="inline-flex items-center px-2 py-0.5 rounded text-sm font-medium bg-blue-50 text-blue-700 border border-blue-200 flex-shrink-0">
                {stage.defaultModel}
              </span>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <p className="text-sm text-zinc-600 mb-3">{stage.description}</p>
            <PromptDrawer stageName={stage.name} prompt={stage.defaultPrompt} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
