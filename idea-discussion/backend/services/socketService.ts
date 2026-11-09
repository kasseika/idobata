/**
 * Socket.IO サービス
 *
 * 目的: Socket.IO の io インスタンスをラップし、テーマ・スレッドへのイベント送信を担う。
 * 注意: server.ts との循環依存を避けるため、io インスタンスは initSocketService() で注入する。
 *       initSocketService() を呼び出す前に emit 系関数を使用すると例外が発生する。
 *       最小寄与人数 k が有効なテーマの抽出イベントは、テーマのルームに送らない（issue #146）。
 *       スレッドのルームは、スレッドの持ち主の userId を示したときだけ購読できる
 *       （authorizeThreadSubscription を server.ts の subscribe-thread で使う）。
 */

import mongoose from "mongoose";
import type { Server } from "socket.io";
import ChatThread from "../models/ChatThread.js";
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
 *       スレッドのルームは持ち主だけが購読できるため、k に関係なく送る。
 *       テーマが見つからない場合や、テーマの読み込みに失敗した場合は、テーマのルームに送らない
 *       （隠す側に倒す）。読み込みの失敗は記録するだけで例外にしない。配信は画面を更新するための
 *       通知であり、失敗で抽出処理（課題の保存・スレッドへの記録）を止めないため（ユーザー承認済み）。
 */
async function emitExtractionEvent(
  eventName: "new-extraction" | "extraction-update",
  themeId: string,
  threadId: string | null,
  type: string,
  data: object
): Promise<void> {
  const event = { type, data };

  let sendsToThemeRoom = false;
  try {
    const theme = await Theme.findById(themeId)
      .select("minContributors")
      .lean();
    sendsToThemeRoom = theme !== null && !hidesIndividualOpinions(theme);
  } catch (error) {
    console.error(
      `[SocketService] Failed to load theme ${themeId}. Skipping ${eventName} for the theme room.`,
      error
    );
  }
  if (sendsToThemeRoom) {
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

/**
 * スレッドのルームの購読要求を確かめ、購読してよいスレッド ID を返す
 *
 * @param payload - クライアントが subscribe-thread で送った値（未検証）。{ threadId, userId } を期待する
 * @returns スレッドの持ち主の userId が示された場合はスレッド ID、それ以外は null
 * 注意: 参加者は匿名でログインしないため、スレッドの持ち主の確認は REST API と同じく
 *       userId（端末ごとに生成される秘密の識別子）の一致で行う。スレッド ID だけの従来の形式は拒否する。
 */
export async function authorizeThreadSubscription(
  payload: unknown
): Promise<string | null> {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  const { threadId, userId } = payload as Record<string, unknown>;
  if (
    typeof threadId !== "string" ||
    !mongoose.Types.ObjectId.isValid(threadId) ||
    typeof userId !== "string" ||
    userId === ""
  ) {
    return null;
  }

  const thread = await ChatThread.findById(threadId).select("userId").lean();
  return thread !== null && thread.userId === userId ? threadId : null;
}
