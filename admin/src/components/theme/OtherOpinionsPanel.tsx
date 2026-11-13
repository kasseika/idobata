/**
 * 「その他の意見」パネル
 *
 * 目的: テーマ編集画面で、重要論点に拾われなかった意見の要約（「その他の意見」）を
 *       生成し、最新の結果を確かめられるようにする（issue #147）。
 * 注意: 生成は LLM を呼ぶため、バックエンドで非同期に行われ、終わる時刻が読めない。
 *       そのため自動では読み直さず、管理者が「再読み込み」で最新の結果を取り直す。
 *       バックエンドは材料にした課題の ID を返さないため、要約だけを表示する。
 */
import { useCallback, useEffect, useState } from "react";
import { apiClient } from "../../services/api/apiClient";
import type { OtherOpinions } from "../../services/api/types";
import { Button } from "../ui/button";

interface OtherOpinionsPanelProps {
  themeId: string;
}

/**
 * 読み込みの状態
 * - loading: 読み込み中
 * - loaded: 読み込み済み（otherOpinions が null なら未生成）
 * - failed: 読み込みに失敗した
 */
type LoadState =
  | { kind: "loading" }
  | { kind: "loaded"; otherOpinions: OtherOpinions | null }
  | { kind: "failed" };

/** 読み込んだ結果の本文を描画する */
const renderResult = (loadState: LoadState) => {
  switch (loadState.kind) {
    case "loading":
      return <p className="text-muted-foreground">読み込み中...</p>;
    case "failed":
      return (
        <p className="text-destructive">
          「その他の意見」の読み込みに失敗しました。
        </p>
      );
    case "loaded": {
      const { otherOpinions } = loadState;
      if (otherOpinions === null) {
        return (
          <p className="text-muted-foreground">まだ生成されていません。</p>
        );
      }
      if (otherOpinions.groups.length === 0) {
        // k が有効なテーマで、k 人以上の書き手が集まるまとまりが無かった場合など
        return (
          <p className="text-muted-foreground">
            まとめて表示できる意見はありませんでした。
          </p>
        );
      }
      return (
        <div>
          <h3 className="font-semibold mb-2">
            要約（{otherOpinions.groups.length}件）
          </h3>
          <p className="text-sm text-muted-foreground mb-2">
            生成日時:{" "}
            {new Date(otherOpinions.createdAt).toLocaleString("ja-JP")}
          </p>
          <ul className="list-disc pl-6 space-y-1">
            {otherOpinions.groups.map((group) => (
              <li key={group.summary}>{group.summary}</li>
            ))}
          </ul>
        </div>
      );
    }
    default: {
      const _exhaustive: never = loadState;
      return _exhaustive;
    }
  }
};

const OtherOpinionsPanel = ({ themeId }: OtherOpinionsPanelProps) => {
  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateMessage, setGenerateMessage] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);

  /** 最新の「その他の意見」を読み込む */
  const load = useCallback(async () => {
    setLoadState({ kind: "loading" });
    const result = await apiClient.getOtherOpinions(themeId);
    result.match(
      (otherOpinions) => setLoadState({ kind: "loaded", otherOpinions }),
      (error) => {
        console.error(
          "Failed to fetch other opinions for theme %s:",
          themeId,
          error
        );
        setLoadState({ kind: "failed" });
      }
    );
  }, [themeId]);

  useEffect(() => {
    load();
  }, [load]);

  /** 生成を起動する（結果は再読み込みで確かめる） */
  const handleGenerate = async () => {
    setIsGenerating(true);
    setGenerateMessage(null);
    setGenerateError(null);

    const result = await apiClient.generateOtherOpinions(themeId);
    result.match(
      () =>
        setGenerateMessage(
          "生成を開始しました。しばらくしてから「再読み込み」で結果を確かめてください。"
        ),
      (error) => {
        console.error(
          "Failed to generate other opinions for theme %s:",
          themeId,
          error
        );
        setGenerateError("「その他の意見」の生成の開始に失敗しました。");
      }
    );

    setIsGenerating(false);
  };

  return (
    <div className="mt-8 border-t pt-6">
      <h2 className="text-xl font-bold mb-2">その他の意見</h2>
      <p className="text-sm text-muted-foreground mb-4">
        重要論点に拾われなかった意見を、趣旨の近いものごとに要約します。重要論点を生成した後に実行してください。
      </p>

      <div className="flex space-x-4 mb-4">
        <Button type="button" onClick={handleGenerate} disabled={isGenerating}>
          {isGenerating ? "生成を開始しています..." : "その他の意見を生成"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={load}
          disabled={loadState.kind === "loading"}
        >
          再読み込み
        </Button>
      </div>

      {generateMessage && (
        <output className="block text-green-700 mb-4">{generateMessage}</output>
      )}
      {generateError && (
        <p className="text-destructive mb-4" role="alert">
          {generateError}
        </p>
      )}

      {renderResult(loadState)}
    </div>
  );
};

export default OtherOpinionsPanel;
