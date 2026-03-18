/**
 * AIパイプライン透明性表示コンポーネント
 *
 * 目的: AIパイプラインの処理段階をタイムライン形式で表示し、
 *       透明性を確保する。折りたたみ（Collapsible）形式で表示を制御する。
 * 注意: showTransparency が false の場合はセクション自体を非表示にする。
 */

import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useState } from "react";
import {
  type TransparencyResponse,
  apiClient,
} from "../../services/api/apiClient";
import SectionHeading from "../common/SectionHeading";
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
      <SectionHeading title="AI処理の透明性" />
      <p className="text-sm text-zinc-600 mb-4">
        あなたの意見は{data.stages.length}
        段階のAI処理パイプラインで処理されます。各段階のプロンプトとモデルを確認できます。
      </p>

      {/* 展開ボタン：ボーダーと背景で「クリックできる」ことを明示 */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center justify-between w-full px-4 py-3 rounded-lg border-2 border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors text-left"
        aria-expanded={isOpen}
      >
        <span className="text-sm font-semibold text-blue-700">
          {isOpen
            ? "パイプラインの詳細を閉じる"
            : "パイプラインの詳細を見る（クリックして展開）"}
        </span>
        {isOpen ? (
          <ChevronUp className="w-5 h-5 text-blue-600 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-5 h-5 text-blue-600 flex-shrink-0" />
        )}
      </button>

      {isOpen && (
        <div className="mt-4">
          {data.stages.map((stage) => (
            <PipelineStageCard key={stage.id} stage={stage} />
          ))}
        </div>
      )}
    </section>
  );
}
