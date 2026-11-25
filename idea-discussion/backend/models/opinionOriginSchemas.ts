/**
 * 起点の意見のサブスキーマ（issue #177）
 *
 * 目的: 他の人の意見を起点に始めた対話について、起点を保存するサブスキーマを1か所で定義する。
 * 内容: - opinionOriginRefSchema: 起点の種類と ID。抽出した課題・解決策に保存し、集計で重複を扱うために使う
 *       - chatMessageOriginSchema: 上に反応の種類を加えたもの。参加者の発言に保存する
 */

import mongoose from "mongoose";
import {
  type IChatMessageOrigin,
  type IOpinionOriginRef,
  OPINION_ORIGIN_TYPES,
  OPINION_REACTIONS,
} from "../types/index.js";

const originRefFields = {
  type: { type: String, enum: OPINION_ORIGIN_TYPES, required: true },
  id: { type: mongoose.Schema.Types.ObjectId, required: true },
};

export const opinionOriginRefSchema = new mongoose.Schema<IOpinionOriginRef>(
  originRefFields,
  { _id: false }
);

export const chatMessageOriginSchema = new mongoose.Schema<IChatMessageOrigin>(
  {
    ...originRefFields,
    reaction: { type: String, enum: OPINION_REACTIONS, required: true },
  },
  { _id: false }
);
