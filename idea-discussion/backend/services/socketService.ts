/**
 * Socket.IO サービス
 *
 * 目的: Socket.IO の io インスタンスをラップし、テーマ・スレッドへのイベント送信を担う。
 * 注意: server.ts との循環依存を避けるため、io インスタンスは initSocketService() で注入する。
 *       initSocketService() を呼び出す前に emit 系関数を使用すると例外が発生する。
 */

import type { Server } from "socket.io";

/** 注入された Socket.IO の io インスタンス */
let _io: Server | null = null;

/**
 * Socket.IO の io インスタンスを注入する（server.ts から呼び出す）
 * @param io - Socket.IO の Server インスタンス
 */
export function initSocketService(io: Server): void {
  _io = io;
}

/**
 * 注入済みの io インスタンスを取得する
 * @throws io が初期化されていない場合
 */
function getIo(): Server {
  if (!_io) {
    throw new Error(
      "[SocketService] io is not initialized. Call initSocketService(io) first."
    );
  }
  return _io;
}

/**
 * テーマまたはスレッドに購読している全クライアントに新規抽出イベントを送信する
 * @param themeId - テーマ ID
 * @param threadId - スレッド ID（省略可）
 * @param type - 抽出種別（"problem" または "solution"）
 * @param data - 抽出データ
 */
export function emitNewExtraction(
  themeId: string,
  threadId: string | null,
  type: string,
  data: object
): void {
  console.log(
    `[SocketService] Emitting new-extraction event for theme:${themeId}`
  );

  const event = {
    type,
    data,
  };

  getIo().to(`theme:${themeId}`).emit("new-extraction", event);

  if (threadId) {
    console.log(
      `[SocketService] Emitting new-extraction event for thread:${threadId}`
    );
    getIo().to(`thread:${threadId}`).emit("new-extraction", event);
  }
}

/**
 * テーマまたはスレッドに購読している全クライアントに抽出更新イベントを送信する
 * @param themeId - テーマ ID
 * @param threadId - スレッド ID（省略可）
 * @param type - 抽出種別（"problem" または "solution"）
 * @param data - 抽出データ
 */
export function emitExtractionUpdate(
  themeId: string,
  threadId: string | null,
  type: string,
  data: object
): void {
  console.log(
    `[SocketService] Emitting extraction-update event for theme:${themeId}`
  );

  const event = {
    type,
    data,
  };

  getIo().to(`theme:${themeId}`).emit("extraction-update", event);

  if (threadId) {
    console.log(
      `[SocketService] Emitting extraction-update event for thread:${threadId}`
    );
    getIo().to(`thread:${threadId}`).emit("extraction-update", event);
  }
}
