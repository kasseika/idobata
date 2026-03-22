/**
 * システム設定編集ページ
 *
 * 目的: OpenRouter APIキーをadmin画面から設定・更新・削除する。
 * 注意: APIキーの実値はサーバーから返されない。部分マスク表示（先頭12+末尾3）のみ表示する。
 *       「再設定」ボタンでインライン入力フィールドを表示し、保存時に暗号化してDBに保存する。
 *       「削除」ボタンでAPIキーを削除し、環境変数フォールバックに戻す。
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
  const [deleting, setDeleting] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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
      setActionError("APIキーを入力してください。");
      return;
    }

    setSaving(true);
    setActionError(null);

    const result = await apiClient.updateSystemConfig({
      openrouterApiKey: newApiKey.trim(),
    });

    result.match(
      (data) => {
        setHasKey(data.hasOpenrouterApiKey);
        setMaskedKey(data.openrouterApiKeyMasked);
        setIsEditing(false);
        setNewApiKey("");
      },
      (error) => {
        setActionError(`保存に失敗しました: ${error.message}`);
      }
    );

    setSaving(false);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setNewApiKey("");
    setActionError(null);
  };

  const handleDelete = async () => {
    if (
      !window.confirm(
        "APIキーを削除しますか？削除後はAPIキー未設定状態となり、AI機能が利用できなくなります。"
      )
    ) {
      return;
    }

    setDeleting(true);
    setActionError(null);

    const result = await apiClient.deleteSystemConfig();

    result.match(
      (data) => {
        setHasKey(data.hasOpenrouterApiKey);
        setMaskedKey(data.openrouterApiKeyMasked);
      },
      (error) => {
        setActionError(`削除に失敗しました: ${error.message}`);
      }
    );

    setDeleting(false);
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

        {actionError && (
          <div className="bg-red-100 text-red-700 p-3 rounded mb-4">
            {actionError}
          </div>
        )}

        <div className="mb-2">
          {hasKey ? (
            isEditing ? (
              <div>
                <label
                  htmlFor="apiKey-new"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  新しいAPIキー
                </label>
                <input
                  id="apiKey-new"
                  type="password"
                  value={newApiKey}
                  onChange={(e) => setNewApiKey(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !saving) handleSave();
                  }}
                  placeholder="sk-or-v1-..."
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoComplete="off"
                  // biome-ignore lint/a11y/noAutofocus: 再設定ボタン押下後の利便性のため自動フォーカスする
                  autoFocus
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
                    onClick={handleCancelEdit}
                    disabled={saving}
                    className="bg-gray-200 text-gray-700 px-4 py-2 rounded text-sm hover:bg-gray-300 disabled:opacity-50"
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono bg-gray-100 px-3 py-2 rounded text-sm">
                  {maskedKey}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(true);
                    setActionError(null);
                  }}
                  className="bg-gray-200 text-gray-700 px-3 py-2 rounded text-sm hover:bg-gray-300"
                >
                  再設定
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="bg-red-100 text-red-700 px-3 py-2 rounded text-sm hover:bg-red-200 disabled:opacity-50"
                >
                  {deleting ? "削除中..." : "削除"}
                </button>
              </div>
            )
          ) : (
            <div>
              <p className="text-gray-500 text-sm mb-3">
                未設定（環境変数を使用中）
              </p>
              {isEditing ? (
                <div>
                  <label
                    htmlFor="apiKey"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    APIキー
                  </label>
                  <input
                    id="apiKey"
                    type="password"
                    value={newApiKey}
                    onChange={(e) => setNewApiKey(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !saving) handleSave();
                    }}
                    placeholder="sk-or-v1-..."
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoComplete="off"
                    // biome-ignore lint/a11y/noAutofocus: 設定ボタン押下後の利便性のため自動フォーカスする
                    autoFocus
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
                      onClick={handleCancelEdit}
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
                    setActionError(null);
                  }}
                  className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
                >
                  APIキーを設定
                </button>
              )}
            </div>
          )}
        </div>

        {hasKey && !isEditing && (
          <p className="mt-3 text-xs text-gray-500">
            ※ キーは設定時にのみ表示されます。わからなくなった場合は
            <a
              href="https://openrouter.ai/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              OpenRouter
            </a>
            でローテーションしてください。
          </p>
        )}

        <p className="mt-4 text-xs text-gray-500">
          APIキーはAES-256-GCMで暗号化してデータベースに保存されます。
        </p>
      </div>
    </div>
  );
};

export default SystemConfigEdit;
