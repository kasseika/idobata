/**
 * システム設定コントローラー
 *
 * 目的: OpenRouter APIキーなどのシステム設定を取得・更新するAPIを提供する。
 * 注意: GET/PUTともにadmin権限が必要（ルートでミドルウェアを適用すること）。
 *       GETレスポンスにAPIキーの実値は含めず、マスク表示のみ返す。
 */

import type { Request, Response } from "express";
import SystemConfig from "../models/SystemConfig.js";
import { invalidateApiKeyCache } from "../services/apiKeyService.js";
import { encrypt } from "../services/encryptionService.js";

/**
 * APIキーを全マスク表示形式に変換する
 * わからなくなった場合はローテーションすること
 */
function maskApiKey(key: string): string {
  return "*".repeat(Math.min(key.length, 20));
}

/**
 * システム設定を取得する
 * APIキーは実値を返さず、マスク表示と設定済みフラグのみ返す
 */
export const getSystemConfig = async (req: Request, res: Response) => {
  try {
    const systemConfig = await SystemConfig.findOne();
    const hasKey = Boolean(systemConfig?.openrouterApiKey);

    res.status(200).json({
      hasOpenrouterApiKey: hasKey,
      openrouterApiKeyMasked: hasKey
        ? maskApiKey(systemConfig?.openrouterApiKey ?? "")
        : null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    res.status(500).json({ message });
  }
};

/**
 * システム設定を更新する
 * APIキーをAES-256-GCMで暗号化してDBに保存し、キャッシュを無効化する
 */
export const updateSystemConfig = async (req: Request, res: Response) => {
  try {
    const { openrouterApiKey } = req.body;

    if (!openrouterApiKey || typeof openrouterApiKey !== "string") {
      res.status(400).json({ message: "openrouterApiKey は必須です" });
      return;
    }

    const { encrypted, iv, tag } = encrypt(openrouterApiKey);

    let systemConfig = await SystemConfig.findOne();

    if (systemConfig) {
      systemConfig.openrouterApiKey = encrypted;
      systemConfig.openrouterApiKeyIv = iv;
      systemConfig.openrouterApiKeyTag = tag;
      await systemConfig.save();
    } else {
      systemConfig = await SystemConfig.create({
        openrouterApiKey: encrypted,
        openrouterApiKeyIv: iv,
        openrouterApiKeyTag: tag,
      });
    }

    // キャッシュを無効化して次回アクセス時にDBから再取得させる
    invalidateApiKeyCache();

    res.status(200).json({
      hasOpenrouterApiKey: true,
      openrouterApiKeyMasked: maskApiKey(openrouterApiKey),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    res.status(500).json({ message });
  }
};
