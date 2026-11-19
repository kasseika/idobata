import { CheckCircle2, ChevronDown } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "../../../lib/utils";
import {
  Message,
  SystemMessage,
  SystemNotification,
  UserMessage,
} from "../../../types";
import { StreamingText } from "./StreamingText";

/**
 * 通知（SystemNotification）を、会話の邪魔にならない小さな灰色の1行で表示する。
 *
 * detail を持つ通知（課題・解決策の登録など）は、content を見出しにした開閉式にし、
 * 押したときだけ全文を表示する。detail が無い通知は content だけを表示する。
 *
 * 注意: summary に display（inline-flex）を指定すると、ブラウザ標準の「▶」の目印が消える。
 *       押せることが分かるよう、見出しの末尾に開閉の向きを示す「⌄」を置き、開くと上向きにする。
 */
function NotificationLine({
  notification,
}: { notification: SystemNotification }) {
  if (notification.detail === undefined) {
    return (
      <div className="text-xs text-gray-500 text-center">
        {notification.isStreaming ? (
          <StreamingText content={notification.content} />
        ) : (
          notification.content
        )}
      </div>
    );
  }

  return (
    <details className="group text-xs text-gray-500 text-center">
      <summary className="inline-flex items-center gap-1 cursor-pointer select-none hover:text-gray-700">
        <CheckCircle2
          className="w-3.5 h-3.5 shrink-0 text-green-600"
          aria-hidden="true"
        />
        {notification.content}
        <ChevronDown
          data-testid="disclosure-indicator"
          className="w-3.5 h-3.5 shrink-0 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <p className="mt-1 px-3 py-2 text-left whitespace-pre-wrap bg-gray-50 border border-gray-200 rounded-lg text-gray-600">
        {notification.detail}
      </p>
    </details>
  );
}

interface ExtendedChatHistoryProps {
  messages: Message[];
}

function ExtendedChatHistory({ messages }: ExtendedChatHistoryProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sortedMessages = [...messages].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );

  return (
    <div className="flex-grow px-3 py-2 xl:px-4 xl:py-3 overflow-y-auto space-y-2 xl:space-y-3 custom-scrollbar">
      {sortedMessages.map((msg, index) => (
        <div
          key={`${msg.createdAt.toISOString()}-${index}`}
          className={cn("animate-fade-in mb-2", {
            "flex justify-end": msg instanceof UserMessage,
            "flex justify-start": msg instanceof SystemMessage,
            "flex justify-center": msg instanceof SystemNotification,
          })}
        >
          <div
            className={cn("flex flex-col max-w-[95%]", {
              "items-end": msg instanceof UserMessage,
              "items-start": msg instanceof SystemMessage,
              "items-center": msg instanceof SystemNotification,
            })}
          >
            {msg instanceof SystemNotification ? (
              <NotificationLine notification={msg} />
            ) : (
              <div
                className={cn(
                  "inline-block py-2 px-3 xl:py-3 xl:px-4 break-words",
                  {
                    "bg-blue-600 text-white rounded-2xl rounded-tr-sm":
                      msg instanceof UserMessage,
                    "bg-white border border-gray-200 text-gray-800 rounded-2xl rounded-tl-sm":
                      msg instanceof SystemMessage,
                  }
                )}
              >
                <div className="text-sm xl:text-base whitespace-pre-wrap leading-tight xl:leading-normal">
                  {msg.isStreaming ? (
                    <StreamingText content={msg.content} />
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            )}
            {/* タイムスタンプは表示しない */}
          </div>
        </div>
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
}

export default ExtendedChatHistory;
