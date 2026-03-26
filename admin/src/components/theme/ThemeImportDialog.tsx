/**
 * テーマインポート確認ダイアログ
 *
 * 目的: JSONファイルを選択してテーマをインポートする確認UIを提供する。
 *       ファイル選択 → データ件数プレビュー → 実行/キャンセルのフローで操作する。
 *
 * 注意: インポートされたテーマは常に draft ステータスで作成される。
 */
import React, { useRef, useState } from "react";
import type { FC } from "react";
import type { ThemeImportStats } from "../../services/api/types";
import { Button } from "../ui/button";

interface ThemeImportDialogProps {
  /** インポート実行コールバック。パース済みのエクスポートデータを受け取る */
  onImport: (exportData: unknown) => Promise<void>;
  /** ダイアログを閉じるコールバック */
  onClose: () => void;
  /** インポート中フラグ */
  isLoading: boolean;
  /** インポート成功後の統計情報。null の場合は未実行 */
  importStats: ThemeImportStats | null;
}

/**
 * エクスポートデータから件数サマリーを生成するヘルパー
 */
const buildSummary = (data: Record<string, unknown>) => {
  const fields: Array<{ key: string; label: string }> = [
    { key: "chatThreads", label: "チャットスレッド" },
    { key: "importedItems", label: "インポートアイテム" },
    { key: "problems", label: "課題" },
    { key: "solutions", label: "解決策" },
    { key: "sharpQuestions", label: "重要論点" },
    { key: "pipelineConfigChangeLogs", label: "パイプライン変更ログ" },
    { key: "policyDrafts", label: "政策ドラフト" },
    { key: "digestDrafts", label: "ダイジェストドラフト" },
    { key: "debateAnalyses", label: "議論分析" },
    { key: "questionVisualReports", label: "質問ビジュアルレポート" },
    { key: "questionLinks", label: "質問リンク" },
    { key: "reportExamples", label: "レポート例" },
    { key: "likes", label: "いいね" },
  ];

  return fields
    .map(({ key, label }) => {
      const arr = data[key];
      return Array.isArray(arr) ? { label, count: arr.length } : null;
    })
    .filter(
      (item): item is { label: string; count: number } =>
        item !== null && item.count > 0
    );
};

const ThemeImportDialog: FC<ThemeImportDialogProps> = ({
  onImport,
  onClose,
  isLoading,
  importStats,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedData, setParsedData] = useState<Record<string, unknown> | null>(
    null
  );

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setParseError(null);
    setParsedData(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string) as Record<
          string,
          unknown
        >;
        setParsedData(json);
      } catch {
        setParseError(
          "JSONファイルの解析に失敗しました。有効なエクスポートファイルを選択してください。"
        );
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!parsedData) return;
    await onImport(parsedData);
  };

  const summary = parsedData ? buildSummary(parsedData) : [];
  const themeTitle =
    typeof (parsedData?.theme as Record<string, unknown>)?.title === "string"
      ? ((parsedData?.theme as Record<string, unknown>).title as string)
      : null;

  return (
    // オーバーレイ
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background rounded-lg shadow-lg p-6 w-full max-w-md mx-4">
        <h2 className="text-xl font-bold mb-4">テーマをインポート</h2>

        {importStats ? (
          // インポート成功後の結果表示
          <div>
            <p className="text-success font-medium mb-2">
              インポートが完了しました
            </p>
            <p className="text-sm text-muted-foreground mb-1">
              テーマ:{" "}
              <span className="font-medium text-foreground">
                {importStats.themeTitle}
              </span>
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              ステータス:{" "}
              <span className="font-medium text-foreground">
                下書き（draft）
              </span>
            </p>
            <Button onClick={onClose} className="w-full">
              閉じる
            </Button>
          </div>
        ) : (
          // ファイル選択・確認UI
          <div>
            <p className="text-sm text-muted-foreground mb-4">
              エクスポートしたJSONファイルを選択してください。
              インポートされたテーマは常に<strong>下書き（draft）</strong>
              状態で作成されます。
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileChange}
              className="block w-full text-sm text-muted-foreground mb-4
                file:mr-4 file:py-2 file:px-4 file:rounded-md
                file:border-0 file:text-sm file:font-medium
                file:bg-primary file:text-primary-foreground
                hover:file:bg-primary/90 cursor-pointer"
            />

            {parseError && (
              <p className="text-sm text-destructive mb-4">{parseError}</p>
            )}

            {parsedData && (
              <div className="bg-muted rounded-md p-3 mb-4">
                {themeTitle && (
                  <p className="text-sm font-medium mb-2">
                    テーマ: {themeTitle}
                  </p>
                )}
                {summary.length > 0 ? (
                  <ul className="text-sm text-muted-foreground space-y-1">
                    {summary.map(({ label, count }) => (
                      <li key={label}>
                        {label}:{" "}
                        <span className="font-medium text-foreground">
                          {count}件
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    関連データなし
                  </p>
                )}
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={onClose} disabled={isLoading}>
                キャンセル
              </Button>
              <Button
                onClick={handleImport}
                disabled={!parsedData || isLoading}
              >
                {isLoading ? "インポート中..." : "インポート実行"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ThemeImportDialog;
