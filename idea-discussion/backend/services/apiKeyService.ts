/**
 * APIキー取得サービス
 *
 * 目的: OpenRouter APIキーをDB（SystemConfig）から取得する。
 *       APIキーは admin 画面からのみ設定可能。
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
 * DB（SystemConfig）に暗号化保存されたキーを復号して返す。
 * @throws APIキーが設定されていない場合
 */
export async function getOpenRouterApiKey(): Promise<string> {
  // キャッシュが有効な場合はキャッシュから返す
  if (cache && cache.expiresAt > Date.now()) {
    return cache.key;
  }

  const systemConfig = await SystemConfig.findOne();

  const dbKey = systemConfig?.openrouterApiKey;
  const dbIv = systemConfig?.openrouterApiKeyIv;
  const dbTag = systemConfig?.openrouterApiKeyTag;
  const setCount = [dbKey, dbIv, dbTag].filter(Boolean).length;

  if (setCount > 0 && setCount < 3) {
    // 3点セットの一部しか設定されていない → 設定不整合として明示的に失敗させる
    throw new Error(
      "SystemConfig の暗号化フィールドが不完全です（openrouterApiKey / IV / tag の3点セットが必要）"
    );
  }

  if (setCount === 3) {
    // 型アサーション: setCount===3 のため全フィールドが存在することが保証されている
    const key = decrypt(dbKey as string, dbIv as string, dbTag as string);
    cache = { key, expiresAt: Date.now() + CACHE_TTL_MS };
    return key;
  }

  throw new Error(
    "OpenRouter APIキーが設定されていません。admin画面のシステム設定から設定してください。"
  );
}

/**
 * APIキーのインメモリキャッシュを無効化する
 *
 * APIキーをDB更新した後に呼び出し、次回の getOpenRouterApiKey() でDBから再取得させる。
 */
export function invalidateApiKeyCache(): void {
  cache = null;
}
