/**
 * 対話の起点にした他の人の意見の扱い（issue #177）
 *
 * 目的: 参加者が他の人の意見（課題・解決策）に反応して対話を始めるときの、起点の検証・取得・
 *       AI へ渡す文脈の組み立てを1か所にまとめる。
 * 内容: - parseOpinionOrigin: リクエストの origin を検証し、ドメインの型にする
 *       - findOriginStatement: 起点の意見の文を、送信先のテーマに属する場合だけ取得する
 *       - findActiveOrigin: スレッドの発言から、直近の起点を取り出す
 *       - buildOriginContext: 起点の意見の文と反応別の指示から、AI へ渡す文脈を作る
 * 注意: 最小寄与人数 k が有効なテーマでは、課題・解決策の原文を AI に渡してはならない（issue #146）。
 *       その判定は呼び出し側（chatController）が行う。
 */

import mongoose from "mongoose";
import { OPINION_ORIGIN_INSTRUCTIONS } from "../constants/defaultPrompts.js";
import Problem from "../models/Problem.js";
import Solution from "../models/Solution.js";
import {
  type IChatMessage,
  type IChatMessageOrigin,
  OPINION_ORIGIN_TYPES,
  OPINION_REACTIONS,
  type OpinionOriginType,
  type OpinionReaction,
} from "../types/index.js";

/** 検証済みの起点（リクエストから読み取ったもの） */
interface ParsedOpinionOrigin {
  type: OpinionOriginType;
  id: string;
  reaction: OpinionReaction;
}

/** 値が readonly の候補配列のいずれかであるかを確かめる型ガード */
const isOneOf = <T extends string>(
  candidates: readonly T[],
  value: unknown
): value is T =>
  typeof value === "string" &&
  (candidates as readonly string[]).includes(value);

/**
 * リクエストの origin を検証する
 *
 * @param raw リクエストボディの origin（外部入力）
 * @returns 正しい形なら検証済みの起点、不正なら null
 * 注意: id は ObjectId として解釈できる文字列だけを受け付ける。DB の検索条件に使うため、
 *       文字列以外（クエリ演算子のオブジェクトなど）は拒否する。
 */
export const parseOpinionOrigin = (
  raw: unknown
): ParsedOpinionOrigin | null => {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const { type, id, reaction } = raw as Record<string, unknown>;
  if (
    !isOneOf(OPINION_ORIGIN_TYPES, type) ||
    !isOneOf(OPINION_REACTIONS, reaction) ||
    typeof id !== "string" ||
    !mongoose.Types.ObjectId.isValid(id)
  ) {
    return null;
  }
  return { type, id, reaction };
};

/**
 * 起点の意見の文を取得する
 *
 * @param origin 起点の種類と ID
 * @param themeId 送信先のテーマ ID
 * @returns 意見の文。意見が存在しない、または別のテーマのものなら null
 * 注意: 別のテーマの意見を起点にさせると、そのテーマの意見が AI の応答から漏れるため、テーマの一致を必ず確かめる。
 */
export const findOriginStatement = async (
  origin: { type: OpinionOriginType; id: unknown },
  themeId: string
): Promise<string | null> => {
  const opinion =
    origin.type === "problem"
      ? await Problem.findById(origin.id).lean()
      : await Solution.findById(origin.id).lean();
  if (!opinion || String(opinion.themeId) !== themeId) {
    return null;
  }
  return opinion.statement;
};

/**
 * スレッドの発言から、直近の起点を取り出す
 *
 * @param messages スレッドの発言（古い順）
 * @returns 最後に起点を付けて送られた参加者の発言の起点。無ければ undefined
 * 注意: 起点を付けた発言の後に続く発言も、同じ起点の対話の続きとして扱う。
 *       参加者が途中で別の話題に移っても区別しない（区別する手がかりがないため）。
 */
export const findActiveOrigin = (
  messages: IChatMessage[]
): IChatMessageOrigin | undefined =>
  [...messages]
    .reverse()
    .find((message) => message.role === "user" && message.origin)?.origin;

/**
 * 起点の意見の文と反応別の指示から、AI へ渡す文脈を作る
 *
 * @param statement 起点の意見の文
 * @param reaction 参加者の反応の種類
 * @returns AI に system メッセージとして渡す文
 */
export const buildOriginContext = (
  statement: string,
  reaction: OpinionReaction
): string =>
  `「起点の意見」（他の参加者の意見）:\n${statement}\n\n${OPINION_ORIGIN_INSTRUCTIONS[reaction]}\n`;
