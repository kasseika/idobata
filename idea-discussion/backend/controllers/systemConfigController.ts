/**
 * システム設定コントローラー
 *
 * 目的: OpenRouter APIキーなどのシステム設定を取得・更新・削除するAPIを提供する。
 * 注意: GET/PUT/DELETEともにadmin権限が必要（ルートでミドルウェアを適用すること）。
 *       GETレスポンスにAPIキーの実値は含めず、OpenRouterのUIに合わせた部分マスク表示のみ返す。
 */

import type { Request, Response } from "express";
import SystemConfig from "../models/SystemConfig.js";
import { invalidateApiKeyCache } from "../services/apiKeyService.js";
import { decrypt, encrypt } from "../services/encryptionService.js";

/**
 * APIキーをOpenRouterのUIに合わせた部分マスク表示に変換する
 * 例: "sk-or-v1-abcdefghijklmnopqrst" → "sk-or-v1-2ca...3b8"（先頭12文字+...+末尾3文字）
 */
function maskApiKey(key: string): string {
  const PREFIX_LEN = 12;
  const SUFFIX_LEN = 3;
  if (key.length <= PREFIX_LEN + SUFFIX_LEN) {
    return key;
  }
  return `${key.slice(0, PREFIX_LEN)}...${key.slice(-SUFFIX_LEN)}`;
}

/**
 * システム設定を取得する
 * APIキーはDBから復号して部分マスク表示し、設定済みフラグとともに返す
 */
export const getSystemConfig = async (req: Request, res: Response) => {
  try {
    const systemConfig = await SystemConfig.findOne();
    // 復号に必要な3点セット（key/iv/tag）が揃っている場合のみ「設定済み」とみなす
    const hasKey = Boolean(
      systemConfig?.openrouterApiKey &&
        systemConfig?.openrouterApiKeyIv &&
        systemConfig?.openrouterApiKeyTag
    );

    let masked: string | null = null;
    if (
      hasKey &&
      systemConfig?.openrouterApiKey &&
      systemConfig.openrouterApiKeyIv &&
      systemConfig.openrouterApiKeyTag
    ) {
      try {
        const decrypted = decrypt(
          systemConfig.openrouterApiKey,
          systemConfig.openrouterApiKeyIv,
          systemConfig.openrouterApiKeyTag
        );
        masked = maskApiKey(decrypted);
      } catch {
        // 復号化失敗時はnullのままにする（暗号化キーが変わった場合など）
      }
    }

    res.status(200).json({
      hasOpenrouterApiKey: hasKey,
      openrouterApiKeyMasked: masked,
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

    // findOneAndUpdate + upsert でアトミックに1件だけ保存する（競合状態を防ぐ）
    await SystemConfig.findOneAndUpdate(
      {},
      {
        $set: {
          openrouterApiKey: encrypted,
          openrouterApiKeyIv: iv,
          openrouterApiKeyTag: tag,
        },
      },
      { upsert: true }
    );

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

/**
 * OpenRouter APIキーを削除する
 * 削除後はAPIキー未設定状態となる（admin画面から再設定が必要）
 */
export const deleteOpenrouterApiKey = async (req: Request, res: Response) => {
  try {
    // $unset でアトミックにフィールドをクリアする（ドキュメントが存在しない場合は何もしない）
    await SystemConfig.findOneAndUpdate(
      {},
      {
        $unset: {
          openrouterApiKey: "",
          openrouterApiKeyIv: "",
          openrouterApiKeyTag: "",
        },
      }
    );

    invalidateApiKeyCache();

    res.status(200).json({
      hasOpenrouterApiKey: false,
      openrouterApiKeyMasked: null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    res.status(500).json({ message });
  }
};
