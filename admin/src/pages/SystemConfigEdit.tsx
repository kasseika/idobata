/**
 * システム設定編集ページ
 *
 * 目的: OpenRouter APIキーをadmin画面から設定・更新する。
 * 注意: APIキーの実値はサーバーから返されない。マスク表示のみ表示する。
 *       「APIキーを変更」ボタンで入力フィールドを表示し、保存時に暗号化してDBに保存する。
 */

import React, { useEffect, useState } from "react";
import type { FC } from "react";
import { apiClient } from "../services/api/apiClient";

const SystemConfigEdit: FC = () => {
  const [hasKey, setHasKey] = useState(false);
  const [maskedKey, setMaskedKey] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [newApiKey, setNewApiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    const fetchConfig = async () => {
      setLoading(true);
      const result = await apiClient.getSystemConfig();
      result.match(
        (data) => {
          setHasKey(data.hasOpenrouterApiKey);
          setMaskedKey(data.openrouterApiKeyMasked);
          setFetchError(null);
        },
        () => {
          setFetchError("システム設定の取得に失敗しました。");
        }
      );
      setLoading(false);
    };

    fetchConfig();
  }, []);

  const handleSave = async () => {
    if (!newApiKey.trim()) {
      setSaveError("APIキーを入力してください。");
      return;
    }

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    const result = await apiClient.updateSystemConfig({
      openrouterApiKey: newApiKey.trim(),
    });

    result.match(
      (data) => {
        setHasKey(data.hasOpenrouterApiKey);
        setMaskedKey(data.openrouterApiKeyMasked);
        setIsEditing(false);
        setNewApiKey("");
        setSaveSuccess(true);
      },
      (error) => {
        setSaveError(`保存に失敗しました: ${error.message}`);
      }
    );

    setSaving(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setNewApiKey("");
    setSaveError(null);
  };

  if (loading) {
    return <div className="text-center py-4">読み込み中...</div>;
  }

  if (fetchError) {
    return (
      <div className="bg-red-100 text-red-700 p-4 rounded mb-4">
        {fetchError}
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">システム設定</h1>

      <div className="bg-white shadow rounded-lg p-6 max-w-2xl">
        <h2 className="text-lg font-semibold mb-2">OpenRouter APIキー</h2>
        <p className="text-sm text-gray-500 mb-4">
          <a
            href="https://openrouter.ai/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            OpenRouter
          </a>{" "}
          でAPIキーを取得してください。
        </p>

        {saveSuccess && (
          <div className="bg-green-100 text-green-700 p-3 rounded mb-4">
            APIキーを保存しました。
          </div>
        )}

        {saveError && (
          <div className="bg-red-100 text-red-700 p-3 rounded mb-4">
            {saveError}
          </div>
        )}

        <div className="mb-4">
          <p className="text-sm text-gray-600 mb-2">現在の設定:</p>
          {hasKey ? (
            <p className="font-mono bg-gray-100 px-3 py-2 rounded text-sm">
              {maskedKey}
            </p>
          ) : (
            <p className="text-gray-500 text-sm">未設定（環境変数を使用中）</p>
          )}
        </div>

        {isEditing ? (
          <div>
            <label
              htmlFor="apiKey"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              新しいAPIキー
            </label>
            <input
              id="apiKey"
              type="password"
              value={newApiKey}
              onChange={(e) => setNewApiKey(e.target.value)}
              placeholder="sk-or-..."
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoComplete="off"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "保存中..." : "保存"}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={saving}
                className="bg-gray-200 text-gray-700 px-4 py-2 rounded text-sm hover:bg-gray-300 disabled:opacity-50"
              >
                キャンセル
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setIsEditing(true);
              setSaveSuccess(false);
            }}
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
          >
            {hasKey ? "APIキーを変更" : "APIキーを設定"}
          </button>
        )}

        <p className="mt-4 text-xs text-gray-500">
          ここで設定したAPIキーは環境変数より優先されます。AES-256-GCMで暗号化してデータベースに保存されます。
          設定済みのキーは全マスク表示されます。わからなくなった場合はOpenRouterでローテーションしてください。
        </p>
      </div>
    </div>
  );
};

export default SystemConfigEdit;
