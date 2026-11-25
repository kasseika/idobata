import {
  OPINION_REACTION_LABELS,
  type OpinionOrigin,
} from "../../lib/opinionReaction";
import { apiClient } from "../../services/api/apiClient";
import type { HttpResult } from "../../services/api/httpClient";
import { socketClient } from "../../services/socket/socketClient";
import type { NewExtractionEvent } from "../../services/socket/socketClient";
import {
  Message,
  MessageType,
  SystemMessage,
  SystemNotification,
  UserMessage,
} from "../../types";
import { formatExtractionNotification } from "./formatExtractionNotification";

export interface ThemeDetailChatManagerOptions {
  themeId: string;
  themeName: string;
  userId: string;
  onNewMessage?: (message: Message) => void;
  onNewExtraction?: (extraction: NewExtractionEvent) => void;
}

export class ThemeDetailChatManager {
  private themeId: string;
  private themeName: string;
  private messages: Message[] = [];
  private onNewMessage?: (message: Message) => void;
  private onNewExtraction?: (extraction: NewExtractionEvent) => void;
  private threadId?: string;
  private unsubscribeNewExtraction?: () => void;
  private unsubscribeExtractionUpdate?: () => void;
  private userId: string;
  private hasShownNotification = false;
  /** 最初の履歴の読み込み。読み込み前に始めた対話が、履歴より上に表示されないよう待つために使う */
  private initialHistoryLoad: Promise<void>;
  /** cleanup 済みか。破棄後に届いた非同期処理の続きで、送信や購読をしないために使う */
  private isDisposed = false;

  constructor(options: ThemeDetailChatManagerOptions) {
    this.themeId = options.themeId;
    this.themeName = options.themeName;
    this.onNewMessage = options.onNewMessage;
    this.onNewExtraction = options.onNewExtraction;
    this.userId = options.userId;

    this.initialHistoryLoad = this.loadChatHistory();
    this.initialHistoryLoad.then(() => {
      if (this.threadId) {
        this.subscribeToExtraction();
      }
    });
  }

  private showThemeNotification(): void {
    if (this.hasShownNotification) return;
    const notification = new SystemNotification(
      `「${this.themeName}」がチャット対象になりました。`
    );
    this.messages.push(notification);
    this.onNewMessage?.(notification);
    this.hasShownNotification = true;
  }

  async addMessage(content: string, type: MessageType): Promise<void> {
    switch (type) {
      case "user": {
        this.subscribeToExtraction();
        const userMessage = new UserMessage(content);

        this.messages.push(userMessage);
        this.onNewMessage?.(userMessage);

        await this.sendMessageToBackend(content);
        return;
      }
      case "system": {
        const systemMessage = new SystemMessage(content);
        this.messages.push(systemMessage);
        this.onNewMessage?.(systemMessage);
        break;
      }
      case "system-message": {
        const systemNotification = new SystemNotification(content);
        this.messages.push(systemNotification);
        this.onNewMessage?.(systemNotification);
        break;
      }
      default: {
        const defaultMessage = new SystemMessage(content);
        this.messages.push(defaultMessage);
        this.onNewMessage?.(defaultMessage);
      }
    }
  }

  /**
   * 他の人の意見を起点に、テーマ全体のスレッドで対話を始める（issue #177）
   *
   * @param origin 起点にした意見（種類・ID）と反応の種類
   * @param opinionText 起点にした意見の文（チャットの通知に表示する）
   * 注意: 新しいスレッドは作らず、テーマ全体の既存スレッド（無ければ最初の送信で作られる）に続ける。
   *       履歴の読み込み中に呼ばれた場合は、読み込みが終わるまで待ってから始める。
   *       意見の文は通知として画面に出すだけで、参加者の発言としては送らない。
   */
  async startFromOpinion(
    origin: OpinionOrigin,
    opinionText: string
  ): Promise<void> {
    // 履歴を表示し終え、既存スレッドの threadId が分かってから始める
    await this.initialHistoryLoad;
    if (this.isDisposed) return;
    this.subscribeToExtraction();

    const notification = new SystemNotification(
      `「${opinionText}」という意見を起点に話します。`
    );
    this.messages.push(notification);
    this.onNewMessage?.(notification);

    const userMessage = new UserMessage(
      OPINION_REACTION_LABELS[origin.reaction]
    );
    this.messages.push(userMessage);
    this.onNewMessage?.(userMessage);

    const result = await apiClient.startThemeChatFromOpinion(
      this.userId,
      this.themeId,
      origin,
      this.threadId
    );
    this.handleOpinionStartResult(result);
  }

  /**
   * 意見を起点にした開始の送信結果を処理する。失敗ならエラーを表示し、
   * 成功なら threadId を保存して AI の応答を表示する
   */
  private handleOpinionStartResult(
    result: HttpResult<{ response: string; threadId: string }>
  ): void {
    // 応答が届く前に破棄された場合は、表示もスレッドの購読もしない
    if (this.isDisposed) return;
    if (!result.isOk()) {
      const errorMessage = new SystemMessage(
        "メッセージの送信中にエラーが発生しました。"
      );
      this.messages.push(errorMessage);
      this.onNewMessage?.(errorMessage);
      console.error("Error starting chat from opinion:", result.error);
      return;
    }
    const { response, threadId } = result.value;
    if (threadId && !this.threadId) {
      this.setThreadId(threadId);
    }
    if (response) {
      const systemResponse = new SystemMessage(response);
      this.messages.push(systemResponse);
      this.onNewMessage?.(systemResponse);
    }
  }

  private async sendMessageToBackend(userMessage: string): Promise<void> {
    try {
      const result = await apiClient.sendMessage(
        this.userId,
        userMessage,
        this.themeId,
        this.threadId
      );

      if (result.isOk()) {
        const { response, threadId } = result.value;

        if (threadId && !this.threadId) {
          this.setThreadId(threadId);
        }

        if (response) {
          const systemResponse = new SystemMessage(response);
          this.messages.push(systemResponse);
          this.onNewMessage?.(systemResponse);
        }
      } else {
        const errorMessage = new SystemMessage(
          "メッセージの送信中にエラーが発生しました。"
        );
        this.messages.push(errorMessage);
        this.onNewMessage?.(errorMessage);
        console.error("Error sending message:", result.error);
      }
    } catch (error) {
      console.error("Error in sendMessageToBackend:", error);
      const errorMessage = new SystemMessage(
        "メッセージの送信中にエラーが発生しました。"
      );
      this.messages.push(errorMessage);
      this.onNewMessage?.(errorMessage);
    }
  }

  private subscribeToExtraction(): void {
    console.log(
      `[ThemeDetailChatManager] Subscribing to theme: ${this.themeId}`
    );
    socketClient.subscribeToTheme(this.themeId);
    if (this.threadId) {
      console.log(
        `[ThemeDetailChatManager] Subscribing to thread: ${this.threadId}`
      );
      socketClient.subscribeToThread(this.threadId);
    }

    if (this.unsubscribeNewExtraction) {
      console.log(
        "[ThemeDetailChatManager] Unsubscribing from previous new-extraction"
      );
      this.unsubscribeNewExtraction();
    }
    if (this.unsubscribeExtractionUpdate) {
      console.log(
        "[ThemeDetailChatManager] Unsubscribing from previous extraction-update"
      );
      this.unsubscribeExtractionUpdate();
    }

    console.log("[ThemeDetailChatManager] Registering new-extraction handler");
    this.unsubscribeNewExtraction = socketClient.onNewExtraction(
      this.handleNewExtraction.bind(this)
    );
    console.log(
      "[ThemeDetailChatManager] Registering extraction-update handler"
    );
    this.unsubscribeExtractionUpdate = socketClient.onExtractionUpdate(
      this.handleExtractionUpdate.bind(this)
    );
  }

  private handleNewExtraction(event: NewExtractionEvent): void {
    console.log(
      "[ThemeDetailChatManager] handleNewExtraction called with event:",
      event
    );

    // チャットに通知するのは、自分の発言から抽出されたもの（スレッドのルームから届いたもの）だけ。
    // テーマのルームから届いたもの（他の参加者の発言からの抽出）は、ページの一覧の更新にだけ使う。
    if (event.room !== "thread") {
      this.onNewExtraction?.(event);
      return;
    }

    const { type, data } = event;
    // 抽出された文章は長いため、チャットには短い1行だけを出し、全文は開いたときに読めるようにする
    const { summary, detail } = formatExtractionNotification(
      type,
      data.statement
    );

    console.log(`[ThemeDetailChatManager] Creating notification: ${summary}`);
    const notification = new SystemNotification(
      summary,
      new Date(),
      false,
      undefined,
      detail
    );
    this.messages.push(notification);

    console.log("[ThemeDetailChatManager] Calling onNewMessage callback");
    this.onNewMessage?.(notification);

    console.log("[ThemeDetailChatManager] Calling onNewExtraction callback");
    this.onNewExtraction?.(event);
  }

  private handleExtractionUpdate(event: NewExtractionEvent): void {
    this.onNewExtraction?.(event);
  }

  setThreadId(threadId: string): void {
    this.threadId = threadId;
    socketClient.subscribeToThread(threadId);
  }

  cleanup(): void {
    this.isDisposed = true;
    if (this.unsubscribeNewExtraction) {
      this.unsubscribeNewExtraction();
    }
    if (this.unsubscribeExtractionUpdate) {
      this.unsubscribeExtractionUpdate();
    }

    socketClient.unsubscribeFromTheme(this.themeId);
    if (this.threadId) {
      socketClient.unsubscribeFromThread(this.threadId);
    }
  }

  getMessages(): Message[] {
    return [...this.messages];
  }

  clearMessages(): void {
    this.messages = [];
  }

  async loadChatHistory(): Promise<void> {
    if (!this.userId) {
      console.log("No user ID available, cannot load chat history");
      return;
    }

    const result = await apiClient.getThreadByUserAndTheme(
      this.userId,
      this.themeId
    );

    if (!result.isOk()) {
      console.error("Error loading chat history:", result.error);
      return;
    }

    const { threadId, messages } = result.value;

    // threadId が null のときはスレッド未作成。最初の送信後に保存して購読を始める
    this.threadId = threadId ?? undefined;

    if (!messages || messages.length === 0) {
      console.log("No chat history found");
      this.showThemeNotification();
      return;
    }

    this.clearMessages();

    this.showThemeNotification();

    for (const msg of messages as Array<{ role: string; content: string }>) {
      const { role, content } = msg;

      if (role === "user") {
        const userMessage = new UserMessage(content);
        this.messages.push(userMessage);
        this.onNewMessage?.(userMessage);
      } else if (role === "assistant") {
        const systemMessage = new SystemMessage(content);
        this.messages.push(systemMessage);
        this.onNewMessage?.(systemMessage);
      }
    }

    console.log(`Loaded ${messages.length} messages from chat history`);
  }
}
