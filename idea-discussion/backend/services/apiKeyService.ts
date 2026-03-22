/**
 * APIキー取得サービス
 *
 * 目的: OpenRouter APIキーをDB（SystemConfig）または環境変数から取得する。
 *       優先順位: DB設定 > 環境変数 OPENROUTER_API_KEY
 * 注意: TTL60秒のインメモリキャッシュでDB負荷を軽減する。
 *       APIキー更新時は invalidateApiKeyCache() を呼び出してキャッシュを無効化すること。
 */

import SystemConfig from "../models/SystemConfig.js";
import { decrypt } from "./encryptionService.js";

const CACHE_TTL_MS = 60 * 1000; // 60秒

/** キャッシュエントリ */
interface CacheEntry {
  key: string;
  expiresAt: number;
}

let cache: CacheEntry | null = null;

/**
 * OpenRouter APIキーを取得する
 *
 * DB（SystemConfig）に暗号化保存されたキーがあればそれを復号して返す。
 * なければ環境変数 OPENROUTER_API_KEY にフォールバックする。
 * @throws どちらも設定されていない場合
 */
export async function getOpenRouterApiKey(): Promise<string> {
  // キャッシュが有効な場合はキャッシュから返す
  if (cache && cache.expiresAt > Date.now()) {
    return cache.key;
  }

  const systemConfig = await SystemConfig.findOne();

  if (
    systemConfig?.openrouterApiKey &&
    systemConfig.openrouterApiKeyIv &&
    systemConfig.openrouterApiKeyTag
  ) {
    const key = decrypt(
      systemConfig.openrouterApiKey,
      systemConfig.openrouterApiKeyIv,
      systemConfig.openrouterApiKeyTag
    );
    cache = { key, expiresAt: Date.now() + CACHE_TTL_MS };
    return key;
  }

  const envKey = process.env.OPENROUTER_API_KEY;
  if (envKey) {
    cache = { key: envKey, expiresAt: Date.now() + CACHE_TTL_MS };
    return envKey;
  }

  throw new Error("OpenRouter APIキーが設定されていません");
}

/**
 * APIキーのインメモリキャッシュを無効化する
 *
 * APIキーをDB更新した後に呼び出し、次回の getOpenRouterApiKey() でDBから再取得させる。
 */
export function invalidateApiKeyCache(): void {
  cache = null;
}
