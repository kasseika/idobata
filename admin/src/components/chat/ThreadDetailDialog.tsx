/**
 * ThreadDetailDialog コンポーネント
 *
 * 目的: 管理者がチャットスレッドのメッセージ内容を閲覧するためのモーダルダイアログ。
 * 注意: 閲覧専用。メッセージの編集・削除機能は提供しない。
 */
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiClient } from "@/services/api/apiClient";
import type { ChatMessage } from "@/services/api/types";
import { useEffect, useState } from "react";

interface ThreadDetailDialogProps {
  themeId: string;
  threadId: string;
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * メッセージのタイムスタンプを日本語形式でフォーマットする
 */
const formatTimestamp = (timestamp: string): string => {
  return new Date(timestamp).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export function ThreadDetailDialog({
  themeId,
  threadId,
  userId,
  open,
  onOpenChange,
}: ThreadDetailDialogProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !threadId) return;

    const fetchMessages = async () => {
      setLoading(true);
      setError(null);

      const result = await apiClient.getChatThreadMessages(themeId, threadId);
      result.match(
        (data) => {
          setMessages(data.messages);
        },
        (_err) => {
          setError("メッセージの取得に失敗しました。");
        }
      );

      setLoading(false);
    };

    fetchMessages();
  }, [open, themeId, threadId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>チャットスレッド詳細</DialogTitle>
          <DialogDescription>ユーザーID: {userId}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3 mt-2">
          {loading && (
            <p className="text-center text-gray-500 py-8">読み込み中...</p>
          )}

          {error && (
            <div className="bg-red-100 text-red-700 p-3 rounded">{error}</div>
          )}

          {!loading && !error && messages.length === 0 && (
            <p className="text-center text-gray-500 py-8">
              メッセージがありません。
            </p>
          )}

          {messages.map((message, index) => {
            const isUser = message.role === "user";
            return (
              <div
                // メッセージにはユニーク識別子がないためインデックスを使用
                // biome-ignore lint/suspicious/noArrayIndexKey: メッセージIDが存在しないためインデックスを使用
                key={index}
                className={`flex flex-col gap-1 ${isUser ? "items-end" : "items-start"}`}
              >
                <span className="text-xs text-gray-400">
                  {isUser ? "ユーザー" : "AI"}
                  {message.timestamp && (
                    <span className="ml-2">
                      {formatTimestamp(message.timestamp)}
                    </span>
                  )}
                </span>
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2 text-sm whitespace-pre-wrap break-words ${
                    isUser
                      ? "bg-blue-500 text-white"
                      : "bg-gray-100 text-gray-900"
                  }`}
                >
                  {message.content}
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
