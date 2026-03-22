/**
 * システム設定モデル
 *
 * 目的: OpenRouter APIキーなどのシステムレベルの機密設定を管理する。
 * 注意: レコードは通常1件のみ存在するシングルトンパターンで運用する。
 *       APIキーはAES-256-GCMで暗号化してDBに保存する。
 *       SiteConfigとは分離している理由: SiteConfigのGETは認証不要のため、
 *       機密情報を同じモデルに含めることはセキュリティリスクになる。
 */

import mongoose from "mongoose";
import type { ISystemConfig } from "../types/index.js";

const systemConfigSchema = new mongoose.Schema<ISystemConfig>(
  {
    /** 暗号化されたOpenRouter APIキー（hex文字列） */
    openrouterApiKey: {
      type: String,
      required: false,
    },
    /** AES-256-GCMの初期化ベクトル（hex文字列） */
    openrouterApiKeyIv: {
      type: String,
      required: false,
    },
    /** AES-256-GCMの認証タグ（hex文字列） */
    openrouterApiKeyTag: {
      type: String,
      required: false,
    },
  },
  { timestamps: true }
);

const SystemConfig = mongoose.model<ISystemConfig>(
  "SystemConfig",
  systemConfigSchema
);

export default SystemConfig;
