/**
 * Socket.IO サービス
 *
 * 目的: Socket.IO の io インスタンスをラップし、テーマ・スレッドへのイベント送信を担う。
 * 注意: server.ts との循環依存を避けるため、io インスタンスは initSocketService() で注入する。
 *       initSocketService() を呼び出す前に emit 系関数を使用すると例外が発生する。
 *       最小寄与人数 k が有効なテーマの抽出イベントは、テーマのルームに送らない（issue #146）。
 */

import type { Server } from "socket.io";
import Theme from "../models/Theme.js";
import { hidesIndividualOpinions } from "./minContributorsService.js";

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
 * 抽出イベントを、テーマのルームとスレッドのルームに送る
 *
 * 注意: 最小寄与人数 k が有効なテーマでは、テーマのルームには送らない（issue #146）。
 *       テーマのルームは誰でも購読できるため、送ると他の参加者の課題文・解決策文が届いてしまう。
 *       スレッドのルームは本人の画面が購読するため、k に関係なく送る。
 */
async function emitExtractionEvent(
  eventName: "new-extraction" | "extraction-update",
  themeId: string,
  threadId: string | null,
  type: string,
  data: object
): Promise<void> {
  const event = { type, data };

  const theme = await Theme.findById(themeId).select("minContributors").lean();
  if (theme === null || !hidesIndividualOpinions(theme)) {
    console.log(
      `[SocketService] Emitting ${eventName} event for theme:${themeId}`
    );
    getIo().to(`theme:${themeId}`).emit(eventName, event);
  }

  if (threadId) {
    console.log(
      `[SocketService] Emitting ${eventName} event for thread:${threadId}`
    );
    getIo().to(`thread:${threadId}`).emit(eventName, event);
  }
}

/**
 * テーマまたはスレッドに購読している全クライアントに新規抽出イベントを送信する
 * @param themeId - テーマ ID
 * @param threadId - スレッド ID（省略可）
 * @param type - 抽出種別（"problem" または "solution"）
 * @param data - 抽出データ
 * 注意: k が有効なテーマでは、スレッドのルームにだけ送る（emitExtractionEvent を参照）
 */
export async function emitNewExtraction(
  themeId: string,
  threadId: string | null,
  type: string,
  data: object
): Promise<void> {
  await emitExtractionEvent("new-extraction", themeId, threadId, type, data);
}

/**
 * テーマまたはスレッドに購読している全クライアントに抽出更新イベントを送信する
 * @param themeId - テーマ ID
 * @param threadId - スレッド ID（省略可）
 * @param type - 抽出種別（"problem" または "solution"）
 * @param data - 抽出データ
 * 注意: k が有効なテーマでは、スレッドのルームにだけ送る（emitExtractionEvent を参照）
 */
export async function emitExtractionUpdate(
  themeId: string,
  threadId: string | null,
  type: string,
  data: object
): Promise<void> {
  await emitExtractionEvent("extraction-update", themeId, threadId, type, data);
}
