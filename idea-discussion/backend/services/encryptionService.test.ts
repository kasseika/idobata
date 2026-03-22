/**
 * encryptionService のユニットテスト
 *
 * 目的: AES-256-GCM による暗号化・復号化の正常動作と異常系を検証する。
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const VALID_KEY_BASE64 = Buffer.from("a".repeat(32)).toString("base64");

describe("encryptionService", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.SYSTEM_CONFIG_ENCRYPTION_KEY = VALID_KEY_BASE64;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("encrypt / decrypt ラウンドトリップ", () => {
    it("暗号化したテキストを正しく復号できること", async () => {
      const { encrypt, decrypt } = await import("./encryptionService.js");
      const 平文 = "sk-or-test-api-key-1234567890";

      const { encrypted, iv, tag } = encrypt(平文);
      const 復号結果 = decrypt(encrypted, iv, tag);

      expect(復号結果).toBe(平文);
    });

    it("同じ平文を2回暗号化しても異なる暗号文が生成されること（IVがランダム）", async () => {
      const { encrypt } = await import("./encryptionService.js");
      const 平文 = "同じAPIキー";

      const 結果1 = encrypt(平文);
      const 結果2 = encrypt(平文);

      expect(結果1.encrypted).not.toBe(結果2.encrypted);
      expect(結果1.iv).not.toBe(結果2.iv);
    });

    it("空文字列も暗号化・復号できること", async () => {
      const { encrypt, decrypt } = await import("./encryptionService.js");

      const { encrypted, iv, tag } = encrypt("");
      const 復号結果 = decrypt(encrypted, iv, tag);

      expect(復号結果).toBe("");
    });
  });

  describe("異常系", () => {
    it("SYSTEM_CONFIG_ENCRYPTION_KEYが未設定のときencryptがエラーをスローすること", async () => {
      process.env.SYSTEM_CONFIG_ENCRYPTION_KEY = undefined;
      // encryptionService は環境変数を呼び出し時に参照するためモジュールキャッシュのリセット不要
      const { encrypt } = await import("./encryptionService.js");

      expect(() => encrypt("テスト")).toThrow(
        "SYSTEM_CONFIG_ENCRYPTION_KEY が設定されていません"
      );
    });

    it("SYSTEM_CONFIG_ENCRYPTION_KEYが未設定のときdecryptがエラーをスローすること", async () => {
      process.env.SYSTEM_CONFIG_ENCRYPTION_KEY = undefined;
      // encryptionService は環境変数を呼び出し時に参照するためモジュールキャッシュのリセット不要
      const { decrypt } = await import("./encryptionService.js");

      expect(() => decrypt("暗号文", "iv", "tag")).toThrow(
        "SYSTEM_CONFIG_ENCRYPTION_KEY が設定されていません"
      );
    });

    it("SYSTEM_CONFIG_ENCRYPTION_KEYが32バイト未満のときencryptがエラーをスローすること", async () => {
      // 16バイト（128ビット）のBase64キーを設定（AES-256には不足）
      process.env.SYSTEM_CONFIG_ENCRYPTION_KEY = Buffer.from(
        "a".repeat(16)
      ).toString("base64");
      const { encrypt } = await import("./encryptionService.js");

      expect(() => encrypt("テスト")).toThrow(
        "SYSTEM_CONFIG_ENCRYPTION_KEY は32バイト（256ビット）のBase64文字列である必要があります"
      );
    });

    it("不正な認証タグで復号するとエラーをスローすること", async () => {
      const { encrypt, decrypt } = await import("./encryptionService.js");
      const 平文 = "正規のAPIキー";

      const { encrypted, iv } = encrypt(平文);
      const 不正なタグ = Buffer.alloc(16).toString("hex");

      expect(() => decrypt(encrypted, iv, 不正なタグ)).toThrow();
    });
  });
});
