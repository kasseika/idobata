/**
 * ThemeChatThreads ページ
 *
 * 目的: 管理者がテーマごとにユーザーの会話スレッド一覧を閲覧するページ。
 * 注意: 閲覧専用。スレッドの行クリックで ThreadDetailDialog が開く。
 */
import type { FC } from "react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ThreadDetailDialog } from "../components/chat/ThreadDetailDialog";
import { Button } from "../components/ui/button";
import { apiClient } from "../services/api/apiClient";
import type { ChatThreadSummary, PaginationInfo } from "../services/api/types";

/** ページあたりの表示件数 */
const PAGE_LIMIT = 20;

/**
 * 日時を日本語形式でフォーマットする
 * 不正な日付文字列の場合は "—" を返す
 */
const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/**
 * 最終メッセージのプレビューを50文字で省略する
 */
const truncateMessage = (content: string, maxLength = 50): string => {
  if (content.length <= maxLength) return content;
  return `${content.slice(0, maxLength)}...`;
};

const ThemeChatThreads: FC = () => {
  const { themeId } = useParams<{ themeId: string }>();
  const [threads, setThreads] = useState<ChatThreadSummary[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 選択中のスレッド（ダイアログ表示用）
  const [selectedThread, setSelectedThread] =
    useState<ChatThreadSummary | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // themeId が変わった場合はページ番号をリセットする
  useEffect(() => {
    setCurrentPage(1);
  }, [themeId]);

  useEffect(() => {
    if (!themeId) return;

    const fetchThreads = async () => {
      setLoading(true);
      setError(null);

      try {
        const result = await apiClient.getChatThreadsByTheme(themeId, {
          page: currentPage,
          limit: PAGE_LIMIT,
        });

        result.match(
          (data) => {
            setThreads(data.threads);
            setPagination(data.pagination);
          },
          (_err) => {
            setError("チャットスレッドの取得に失敗しました。");
          }
        );
      } catch (_err) {
        setError("チャットスレッドの取得中に予期しないエラーが発生しました。");
      } finally {
        setLoading(false);
      }
    };

    fetchThreads();
  }, [themeId, currentPage]);

  const handleRowClick = (thread: ChatThreadSummary) => {
    setSelectedThread(thread);
    setDialogOpen(true);
  };

  return (
    <div>
      {/* パンくずリスト */}
      <nav className="text-sm text-gray-500 mb-4">
        <Link to="/themes" className="hover:underline">
          テーマ一覧
        </Link>
        <span className="mx-2">/</span>
        {themeId && (
          <>
            <Link to={`/themes/${themeId}`} className="hover:underline">
              テーマ編集
            </Link>
            <span className="mx-2">/</span>
          </>
        )}
        <span className="text-gray-900">チャットスレッド一覧</span>
      </nav>

      <h1 className="text-2xl font-bold mb-6">チャットスレッド一覧</h1>

      {loading && (
        <div className="text-center py-8 text-gray-500">読み込み中...</div>
      )}

      {error && (
        <div className="bg-red-100 text-red-700 p-4 rounded mb-4">{error}</div>
      )}

      {!loading && !error && (
        <>
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">
                    ユーザーID
                  </th>
                  <th className="text-center px-4 py-3 font-medium text-gray-700 w-20">
                    メッセージ数
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">
                    最終メッセージ
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700 w-40">
                    最終更新日
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700 w-40">
                    作成日
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {threads.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-gray-500">
                      スレッドがありません。
                    </td>
                  </tr>
                ) : (
                  threads.map((thread) => (
                    <tr
                      key={thread._id}
                      tabIndex={0}
                      aria-label={`ユーザー ${thread.userId} のスレッドを開く`}
                      onClick={() => handleRowClick(thread)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleRowClick(thread);
                        }
                        if (e.key === " ") {
                          e.preventDefault();
                          handleRowClick(thread);
                        }
                      }}
                      className="hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-gray-700 max-w-[180px] truncate">
                        {thread.userId}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-900">
                        {thread.messageCount}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {truncateMessage(thread.lastMessage.content)}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        {formatDate(thread.updatedAt)}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        {formatDate(thread.createdAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* ページネーション */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-gray-600">
                全 {pagination.total} 件 / {pagination.totalPages} ページ中{" "}
                {pagination.page} ページ
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => p - 1)}
                >
                  前へ
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= pagination.totalPages}
                  onClick={() => setCurrentPage((p) => p + 1)}
                >
                  次へ
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* スレッド詳細ダイアログ */}
      {selectedThread && themeId && (
        <ThreadDetailDialog
          themeId={themeId}
          threadId={selectedThread._id}
          userId={selectedThread.userId}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      )}
    </div>
  );
};

export default ThemeChatThreads;
