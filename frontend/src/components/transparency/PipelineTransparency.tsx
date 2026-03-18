/**
 * AIパイプライン透明性表示コンポーネント
 *
 * 目的: AIパイプラインの10処理段階をタイムライン形式で表示し、
 *       透明性を確保する。折りたたみ（Collapsible）形式で表示を制御する。
 * 注意: showTransparency が false の場合はセクション自体を非表示にする。
 */

import { ChevronDown, ChevronUp, Eye } from "lucide-react";
import { useEffect, useState } from "react";
import {
  type TransparencyResponse,
  apiClient,
} from "../../services/api/apiClient";
import { PipelineStageCard } from "./PipelineStageCard";

interface PipelineTransparencyProps {
  /** 表示対象のテーマID */
  themeId: string;
}

/**
 * テーマのAI処理パイプライン透明性情報を取得・表示するコンポーネント
 */
export function PipelineTransparency({ themeId }: PipelineTransparencyProps) {
  const [data, setData] = useState<TransparencyResponse | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchTransparency() {
      setIsLoading(true);
      const result = await apiClient.getThemeTransparency(themeId);
      if (result.isOk()) {
        setData(result.value);
      }
      setIsLoading(false);
    }
    fetchTransparency();
  }, [themeId]);

  // ロード中または非表示設定の場合はnullを返す
  if (isLoading || !data || !data.showTransparency) {
    return null;
  }

  return (
    <section className="mb-12">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-2 w-full text-left"
      >
        <Eye className="w-5 h-5 text-blue-600" />
        <h3 className="text-lg font-bold text-zinc-800">AI処理の透明性</h3>
        <span className="ml-auto">
          {isOpen ? (
            <ChevronUp className="w-5 h-5 text-zinc-500" />
          ) : (
            <ChevronDown className="w-5 h-5 text-zinc-500" />
          )}
        </span>
      </button>

      {isOpen && (
        <div className="mt-4">
          <p className="text-sm text-zinc-600 mb-6">
            あなたの意見は以下の{data.stages.length}
            段階のAI処理パイプラインで処理されます。
            各段階で使用しているモデルとプロンプトを確認できます。
          </p>
          <div>
            {data.stages.map((stage) => (
              <PipelineStageCard key={stage.id} stage={stage} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
