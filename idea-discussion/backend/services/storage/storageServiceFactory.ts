/**
 * ストレージサービスファクトリー
 *
 * 目的: 設定に基づいて適切なストレージサービスのインスタンスを生成する。
 * 注意: 現在はローカルストレージのみサポート。S3等を追加する場合はここに case を追加する。
 */

import LocalStorageService from "./localStorageService.js";
import type StorageServiceInterface from "./storageServiceInterface.js";

/** ストレージサービス設定オブジェクト */
interface StorageConfig {
  baseUrl?: string;
}

/**
 * 設定に基づいて適切なストレージサービスを作成する
 * @param type - ストレージのタイプ（'local', 's3'など）
 * @param config - 設定オブジェクト
 * @returns ストレージサービスのインスタンス
 */
export function createStorageService(
  type = "local",
  config: StorageConfig = {}
): StorageServiceInterface {
  switch (type) {
    case "local":
      return new LocalStorageService(config.baseUrl || "");
    default:
      throw new Error(`Unsupported storage type: ${type}`);
  }
}
