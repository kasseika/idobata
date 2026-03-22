/**
 * 埋め込みベクトル生成ページ
 *
 * 目的: テーマに紐づく課題・解決策の埋め込みベクトルを生成する操作UIを提供する。
 *       使用するEmbeddingモデルをここで選択・変更できる。
 * 注意: モデルを変更すると既存ベクトルとの互換性がなくなるため、再生成が必要になる。
 */
import React, { useEffect, useState } from "react";
import type { ChangeEvent, FC, FormEvent } from "react";
import { useParams } from "react-router-dom";
import { Button } from "../components/ui/button";
import { apiClient } from "../services/api/apiClient";
import type { EmbeddingCollectionInfo } from "../services/api/types";

/** OpenRouter 経由で利用可能な Embedding モデル一覧 */
const AVAILABLE_EMBEDDING_MODELS: {
  group: string;
  models: { value: string; label: string }[];
}[] = [
  {
    group: "OpenAI",
    models: [
      {
        value: "openai/text-embedding-3-small",
        label: "Text Embedding 3 Small ($0.02/M) ※デフォルト",
      },
      {
        value: "openai/text-embedding-3-large",
        label: "Text Embedding 3 Large ($0.13/M)",
      },
    ],
  },
  {
    group: "Google",
    models: [
      {
        value: "google/gemini-embedding-001",
        label: "Gemini Embedding 001 ($0.15/M)",
      },
    ],
  },
  {
    group: "Qwen",
    models: [
      {
        value: "qwen/qwen3-embedding-8b",
        label: "Qwen3 Embedding 8B ($0.01/M)",
      },
    ],
  },
];

const DEFAULT_EMBEDDING_MODEL = "openai/text-embedding-3-small";

const ThemeEmbedding: FC = () => {
  const { themeId } = useParams<{ themeId: string }>();
  const [itemType, setItemType] = useState<"problem" | "solution" | "">("");
  const [embeddingModel, setEmbeddingModel] = useState<string>(
    DEFAULT_EMBEDDING_MODEL
  );
  const [availableCollections, setAvailableCollections] = useState<
    EmbeddingCollectionInfo[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    status: string;
    processedCount: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchTheme = () => {
    if (!themeId) return;
    apiClient
      .getThemeById(themeId)
      .then((themeResult) => {
        if (themeResult.isOk()) {
          if (themeResult.value.embeddingModel) {
            setEmbeddingModel(themeResult.value.embeddingModel);
          }
          setAvailableCollections(
            themeResult.value.availableEmbeddingCollections ?? []
          );
        } else {
          console.error(
            `テーマ情報の取得に失敗しました (themeId: ${themeId}):`,
            themeResult.error.message
          );
          setError(
            "テーマ情報の取得に失敗しました。ページを再読み込みしてください。"
          );
        }
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `テーマ情報の取得に失敗しました (themeId: ${themeId}):`,
          message
        );
        setError(
          "テーマ情報の取得に失敗しました。ページを再読み込みしてください。"
        );
      });
  };

  // テーマの現在のembeddingModelを読み込む
  useEffect(() => {
    fetchTheme();
    // fetchThemeはuseCallbackで包まずコンポーネント内関数として定義。themeId変更時のみ実行する。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeId]);

  const handleItemTypeChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    if (v === "problem" || v === "solution" || v === "") {
      setItemType(v);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!themeId) {
      setError("テーマIDが見つかりません。");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    // モデルをテーマに保存してから生成する
    const updateResult = await apiClient.updateTheme(themeId, {
      embeddingModel,
    });
    if (updateResult.isErr()) {
      setError(`モデル設定の保存に失敗しました: ${updateResult.error.message}`);
      setLoading(false);
      return;
    }

    const generateResult = await apiClient.generateThemeEmbeddings(
      themeId,
      itemType || undefined
    );

    generateResult.match(
      (data) => {
        setResult(data);
        // 生成済みコレクション一覧を更新
        fetchTheme();
      },
      (error) => {
        console.error("Embedding generation error:", error);
        setError(`埋め込み生成中にエラーが発生しました: ${error.message}`);
      }
    );

    setLoading(false);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">埋め込み生成</h1>

      <div className="bg-info/10 p-4 rounded mb-6">
        <p className="text-sm text-muted-foreground">
          注:
          ベクトル検索やクラスタリングを使用する前に、アイテムの埋め込みを生成する必要があります。
        </p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl mb-8">
        <div className="mb-4">
          <label
            htmlFor="embeddingModel"
            className="block text-gray-700 font-medium mb-2"
          >
            Embeddingモデル
          </label>
          <p className="text-sm text-muted-foreground mb-2">
            埋め込みベクトル生成に使用するモデルを選択します。モデルを変更すると既存ベクトルとの互換性がなくなるため、再生成が必要です。
          </p>
          <select
            id="embeddingModel"
            name="embeddingModel"
            value={embeddingModel}
            onChange={(e) => setEmbeddingModel(e.target.value)}
            className="w-full px-3 py-2 border border-input rounded focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {AVAILABLE_EMBEDDING_MODELS.map((group) => (
              <optgroup key={group.group} label={group.group}>
                {group.models.map((model) => (
                  <option key={model.value} value={model.value}>
                    {model.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div className="mb-4">
          <label
            htmlFor="itemType"
            className="block text-gray-700 font-medium mb-2"
          >
            アイテムタイプ（オプション）
          </label>
          <select
            id="itemType"
            name="itemType"
            value={itemType}
            onChange={handleItemTypeChange}
            className="w-full px-3 py-2 border border-input rounded focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">すべて</option>
            <option value="problem">問題のみ</option>
            <option value="solution">解決策のみ</option>
          </select>
        </div>

        <Button type="submit" disabled={loading}>
          {loading ? "処理中..." : "埋め込み生成"}
        </Button>
      </form>

      {error && (
        <div className="bg-red-100 text-red-700 p-4 rounded mb-4">{error}</div>
      )}

      {result && (
        <div className="bg-green-100 text-green-700 p-4 rounded mb-4">
          <p>ステータス: {result.status}</p>
          <p>処理済みアイテム数: {result.processedCount}</p>
        </div>
      )}

      {availableCollections.length > 0 && (
        <div className="mt-8">
          <h2 className="text-xl font-bold mb-4">
            生成済みEmbeddingコレクション
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-200 text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-200 px-4 py-2 text-left">
                    モデル
                  </th>
                  <th className="border border-gray-200 px-4 py-2 text-left">
                    コレクション名
                  </th>
                  <th className="border border-gray-200 px-4 py-2 text-right">
                    アイテム数
                  </th>
                  <th className="border border-gray-200 px-4 py-2 text-left">
                    最終生成日時
                  </th>
                </tr>
              </thead>
              <tbody>
                {availableCollections.map((col) => (
                  <tr key={col.model} className="hover:bg-gray-50">
                    <td className="border border-gray-200 px-4 py-2 font-mono text-xs">
                      {col.model}
                    </td>
                    <td className="border border-gray-200 px-4 py-2 font-mono text-xs text-gray-500">
                      {col.collectionName}
                    </td>
                    <td className="border border-gray-200 px-4 py-2 text-right">
                      {col.itemCount}
                    </td>
                    <td className="border border-gray-200 px-4 py-2">
                      {new Date(col.generatedAt).toLocaleString("ja-JP")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default ThemeEmbedding;
