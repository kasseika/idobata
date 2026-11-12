import { Socket, io } from "socket.io-client";
import type { Problem, Solution } from "../../types";
import { userIdManager } from "../../utils/userIdManager";

/**
 * 抽出イベントを送ったルームの種類
 * - "thread": スレッドのルーム。スレッドの持ち主だけが購読できるため、自分の発言から抽出されたもの
 * - "theme": テーマのルーム。テーマを見ている全員に届く（他の参加者の発言から抽出されたもの）
 */
type ExtractionRoom = "theme" | "thread";

export interface NewExtractionEvent {
  type: "problem" | "solution";
  data: Problem | Solution;
  room: ExtractionRoom;
}

export interface ExtractionUpdateEvent {
  type: "problem" | "solution";
  data: Problem | Solution;
  room: ExtractionRoom;
}

type NewExtractionCallback = (event: NewExtractionEvent) => void;
type ExtractionUpdateCallback = (event: ExtractionUpdateEvent) => void;
type DisconnectCallback = () => void;
type ConnectCallback = () => void;

/**
 * API のベース URL から、Socket.IO の接続先にするオリジンを取り出す
 *
 * 目的: Socket.IO のクライアントは URL のパスを名前空間と解釈する。
 *       ベース URL が `https://example.com/api/idea` のようにパスを含むと、
 *       存在しない名前空間 `/api/idea` に参加しようとしてサーバーに拒否される（Invalid namespace）。
 *       そのため、パスを除いたオリジンだけを返す。
 * 注意: ベース URL が空文字の場合は、空文字のまま返す（Socket.IO はページと同じオリジンに接続する）。
 *       `/api/idea` のような相対 URL は、ページのオリジンを基準に解決する。
 *       不正な URL の場合は URL コンストラクタが例外を投げる（設定ミスを早期に知らせるため）。
 * @param baseUrl - 環境変数 VITE_API_BASE_URL の値
 * @returns Socket.IO に渡す接続先のオリジン
 */
function toSocketOrigin(baseUrl: string): string {
  if (baseUrl === "") {
    return "";
  }
  return new URL(baseUrl, window.location.origin).origin;
}

class SocketClient {
  private socket: Socket | null = null;
  private newExtractionCallbacks: NewExtractionCallback[] = [];
  private extractionUpdateCallbacks: ExtractionUpdateCallback[] = [];
  private disconnectCallbacks: DisconnectCallback[] = [];
  private connectCallbacks: ConnectCallback[] = [];
  private isConnected = false;
  private currentThemeId: string | null = null;
  private currentThreadId: string | null = null;

  constructor() {
    this.setupSocket();
  }

  private setupSocket(): void {
    if (this.socket) {
      return;
    }

    const baseUrl =
      typeof import.meta.env !== "undefined"
        ? import.meta.env.VITE_API_BASE_URL || ""
        : "";
    this.socket = io(toSocketOrigin(baseUrl), {
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      // WebSocket のみに限定（サーバー側設定と一致させること）
      // polling フォールバックを無効化し、接続安定性を高める
      transports: ["websocket"],
    });

    this.socket.on("connect", () => {
      console.log("Socket connected:", this.socket?.id);
      this.isConnected = true;

      // 接続/再接続時は subscribeToTheme/subscribeToThread を経由せず直接 emit する。
      // subscribeToTheme は「すでに購読済みなら skip」するガードがあるため、
      // currentThemeId がセット済みのまま接続すると subscribe-theme が送信されない。
      if (this.currentThemeId) {
        this.socket?.emit("subscribe-theme", this.currentThemeId);
        console.log(`Subscribed to theme on connect: ${this.currentThemeId}`);
      }
      if (this.currentThreadId) {
        this.socket?.emit(
          "subscribe-thread",
          this.createThreadSubscription(this.currentThreadId)
        );
        console.log(`Subscribed to thread on connect: ${this.currentThreadId}`);
      }

      for (const callback of this.connectCallbacks) {
        callback();
      }
    });

    this.socket.on("disconnect", () => {
      console.log("Socket disconnected");
      this.isConnected = false;
      for (const callback of this.disconnectCallbacks) {
        callback();
      }
    });

    this.socket.on("new-extraction", (event: NewExtractionEvent) => {
      console.log("Received new extraction:", event);
      console.log(
        "Number of extraction callbacks:",
        this.newExtractionCallbacks.length
      );
      for (const callback of this.newExtractionCallbacks) {
        console.log("Executing extraction callback");
        callback(event);
      }
    });

    this.socket.on("extraction-update", (event: ExtractionUpdateEvent) => {
      console.log("Received extraction update:", event);
      for (const callback of this.extractionUpdateCallbacks) {
        callback(event);
      }
    });
  }

  /**
   * スレッドのルームの購読要求を作る
   *
   * 注意: サーバーは、スレッドの持ち主の userId を示したときだけ購読を許可する。
   *       スレッド ID だけでは、他の参加者の抽出結果を受け取れないようにするため。
   */
  private createThreadSubscription(threadId: string): {
    threadId: string;
    userId: string;
  } {
    return { threadId, userId: userIdManager.getUserId() };
  }

  connect(): void {
    if (this.socket && !this.isConnected) {
      this.socket.connect();
    }
  }

  disconnect(): void {
    if (this.socket && this.isConnected) {
      this.socket.disconnect();
    }
  }

  subscribeToTheme(themeId: string): void {
    if (this.currentThemeId === themeId) {
      console.log(`Already subscribed to theme: ${themeId}, skipping`);
      return;
    }

    if (this.socket && this.isConnected) {
      this.socket.emit("subscribe-theme", themeId);
      this.currentThemeId = themeId;
      console.log(`Subscribed to theme: ${themeId}`);
    } else {
      this.currentThemeId = themeId;
      this.connect();
    }
  }

  subscribeToThread(threadId: string): void {
    if (this.currentThreadId === threadId) {
      console.log(`Already subscribed to thread: ${threadId}, skipping`);
      return;
    }

    if (this.socket && this.isConnected) {
      this.socket.emit(
        "subscribe-thread",
        this.createThreadSubscription(threadId)
      );
      this.currentThreadId = threadId;
      console.log(`Subscribed to thread: ${threadId}`);
    } else {
      this.currentThreadId = threadId;
      this.connect();
    }
  }

  unsubscribeFromTheme(themeId: string): void {
    if (this.currentThemeId !== themeId) {
      console.log(`Not subscribed to theme: ${themeId}, skipping unsubscribe`);
      return;
    }

    if (this.socket && this.isConnected) {
      this.socket.emit("unsubscribe-theme", themeId);
      this.currentThemeId = null;
      console.log(`Unsubscribed from theme: ${themeId}`);
    }
  }

  unsubscribeFromThread(threadId: string): void {
    if (this.currentThreadId !== threadId) {
      console.log(
        `Not subscribed to thread: ${threadId}, skipping unsubscribe`
      );
      return;
    }

    if (this.socket && this.isConnected) {
      this.socket.emit("unsubscribe-thread", threadId);
      this.currentThreadId = null;
      console.log(`Unsubscribed from thread: ${threadId}`);
    }
  }

  onNewExtraction(callback: NewExtractionCallback): () => void {
    this.newExtractionCallbacks.push(callback);
    return () => {
      this.newExtractionCallbacks = this.newExtractionCallbacks.filter(
        (cb) => cb !== callback
      );
    };
  }

  onExtractionUpdate(callback: ExtractionUpdateCallback): () => void {
    this.extractionUpdateCallbacks.push(callback);
    return () => {
      this.extractionUpdateCallbacks = this.extractionUpdateCallbacks.filter(
        (cb) => cb !== callback
      );
    };
  }

  onDisconnect(callback: DisconnectCallback): () => void {
    this.disconnectCallbacks.push(callback);
    return () => {
      this.disconnectCallbacks = this.disconnectCallbacks.filter(
        (cb) => cb !== callback
      );
    };
  }

  onConnect(callback: ConnectCallback): () => void {
    this.connectCallbacks.push(callback);
    return () => {
      this.connectCallbacks = this.connectCallbacks.filter(
        (cb) => cb !== callback
      );
    };
  }
}

export const socketClient = new SocketClient();
