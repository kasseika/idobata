/**
 * 暗号化サービス
 *
 * 目的: システム設定に保存するAPIキーなどの機密情報をAES-256-GCMで暗号化・復号化する。
 * 注意: 暗号化キーは環境変数 SYSTEM_CONFIG_ENCRYPTION_KEY（32バイトのBase64文字列）から取得する。
 *       キーが設定されていない場合は即座にエラーをスローする（Fail-Fast）。
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM推奨のIV長（96ビット）

/**
 * 暗号化キーを環境変数から取得する
 * @throws SYSTEM_CONFIG_ENCRYPTION_KEY が未設定または32バイトでない場合
 */
function getEncryptionKey(): Buffer {
  const keyBase64 = process.env.SYSTEM_CONFIG_ENCRYPTION_KEY;
  if (!keyBase64) {
    throw new Error("SYSTEM_CONFIG_ENCRYPTION_KEY が設定されていません");
  }
  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== 32) {
    throw new Error(
      `SYSTEM_CONFIG_ENCRYPTION_KEY は32バイト（256ビット）のBase64文字列である必要があります（現在: ${key.length}バイト）`
    );
  }
  return key;
}

/**
 * 平文テキストをAES-256-GCMで暗号化する
 * @param plainText - 暗号化する平文テキスト
 * @returns 暗号文・IV・認証タグ（いずれもhex文字列）
 */
export function encrypt(plainText: string): {
  encrypted: string;
  iv: string;
  tag: string;
} {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  return {
    encrypted: encrypted.toString("hex"),
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
  };
}

/**
 * AES-256-GCMで暗号化されたデータを復号化する
 * @param encrypted - 暗号文（hex文字列）
 * @param iv - 初期化ベクトル（hex文字列）
 * @param tag - 認証タグ（hex文字列）
 * @returns 復号化された平文テキスト
 * @throws 認証タグが不正な場合（データ改ざん検知）
 */
export function decrypt(encrypted: string, iv: string, tag: string): string {
  const key = getEncryptionKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted, "hex")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
