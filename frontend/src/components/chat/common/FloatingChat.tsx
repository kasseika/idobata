import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { useMediaQuery } from "../../../hooks/useMediaQuery";
import { CHAT_PANEL_CLASSES } from "../../../lib/chatPanelConstants";
import { type MessageType } from "../../../types";
import { FloatingChatButton } from "../mobile/FloatingChatButton";
import { ChatProvider, useChat } from "./ChatProvider";
import { ChatSheet } from "./ChatSheet";

interface FloatingChatProps {
  onSendMessage?: (message: string) => void;
  onClose?: () => void;
  onOpen?: () => void;
  disabled?: boolean;
  disabledMessage?: string;
}

export interface FloatingChatRef {
  /**
   * メッセージを追加する。detail は「system-message」（通知）でだけ使い、通知を開いたときに表示する
   */
  addMessage: (content: string, type: MessageType, detail?: string) => void;
  startStreamingMessage: (content: string, type: MessageType) => string;
  updateStreamingMessage: (id: string, content: string) => void;
  endStreamingMessage: (id: string) => void;
  clearMessages: () => void;
  /**
   * チャットを開く（スマートフォン幅で閉じている場合）。デスクトップ幅では常に開いているため何もしない
   * 用途: 他の人の意見に反応して対話を始めたとき、始まった対話をすぐ見せる（issue #177）
   */
  open: () => void;
}

const FloatingChatInner = forwardRef<FloatingChatRef, FloatingChatProps>(
  (
    {
      onSendMessage,
      onClose,
      onOpen,
      disabled = false,
      disabledMessage = "このテーマではコメントが無効化されています",
    },
    ref
  ) => {
    const [isOpen, setIsOpen] = useState(false);
    const [hasUnread, setHasUnread] = useState(false);
    const isDesktop = useMediaQuery("(min-width: 1280px)");

    const {
      addMessage,
      startStreamingMessage,
      updateStreamingMessage,
      endStreamingMessage,
      clearMessages,
    } = useChat();

    // On desktop, chat is always open
    useEffect(() => {
      if (isDesktop && !isOpen) {
        setIsOpen(true);
        onOpen?.();
      }
    }, [isDesktop, isOpen, onOpen]);

    const handleOpen = () => {
      setIsOpen(true);
      setHasUnread(false);
      onOpen?.();
    };

    const handleClose = () => {
      // Only allow closing on mobile
      if (!isDesktop) {
        setIsOpen(false);
        onClose?.();
      }
    };

    const handleSendMessage = (message: string) => {
      onSendMessage?.(message);
    };

    useImperativeHandle(ref, () => ({
      addMessage: (content: string, type: MessageType, detail?: string) => {
        addMessage(content, type, detail);
        if (!isOpen) setHasUnread(true);
      },
      startStreamingMessage: (content: string, type: MessageType) => {
        const id = startStreamingMessage(content, type);
        if (!isOpen) setHasUnread(true);
        return id;
      },
      updateStreamingMessage,
      endStreamingMessage,
      clearMessages,
      open: () => {
        if (!isOpen) handleOpen();
      },
    }));

    return (
      <>
        {/* On mobile: Show floating button when chat is closed */}
        {!isDesktop && !isOpen && (
          <FloatingChatButton
            onClick={handleOpen}
            hasUnread={hasUnread}
            disabled={disabled}
          />
        )}

        {/* Chat view - desktop: fixed sidebar, mobile: bottom sheet */}
        <div className={isDesktop ? CHAT_PANEL_CLASSES : ""}>
          {(isDesktop || isOpen) && (
            <ChatSheet
              isOpen={isOpen}
              onClose={handleClose}
              onSendMessage={handleSendMessage}
              isDesktop={isDesktop}
              disabled={disabled}
              disabledMessage={disabledMessage}
            />
          )}
        </div>
      </>
    );
  }
);

export const FloatingChat = forwardRef<FloatingChatRef, FloatingChatProps>(
  (props, ref) => {
    return (
      <ChatProvider>
        <FloatingChatInner {...props} ref={ref} />
      </ChatProvider>
    );
  }
);

FloatingChat.displayName = "FloatingChat";
