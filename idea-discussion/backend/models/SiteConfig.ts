/**
 * サイト設定モデル
 *
 * 目的: サイト全体の設定（タイトル・概要メッセージ・透明性表示フラグ）を管理する。
 * 注意: レコードは通常1件のみ存在する。複数件ある場合は最初の1件が使用される。
 */

import mongoose from "mongoose";
import type { ISiteConfig } from "../types/index.js";

const siteConfigSchema = new mongoose.Schema<ISiteConfig>(
  {
    title: {
      type: String,
      required: true,
    },
    aboutMessage: {
      type: String,
      required: false,
    },
    // 透明性表示のON/OFFフラグ。trueの場合、AIパイプライン情報をユーザーに公開する
    showTransparency: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

const SiteConfig = mongoose.model<ISiteConfig>("SiteConfig", siteConfigSchema);

export default SiteConfig;
