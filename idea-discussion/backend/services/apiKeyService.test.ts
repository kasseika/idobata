/**
 * apiKeyService のユニットテスト
 *
 * 目的: OpenRouter APIキーのDB優先・環境変数フォールバック・
 *       キャッシュ・キャッシュ無効化の動作を検証する。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// SystemConfigモデルをモック
vi.mock("../models/SystemConfig.js", () => ({
  default: {
    findOne: vi.fn(),
  },
}));

// encryptionServiceをモック
vi.mock("./encryptionService.js", () => ({
  decrypt: vi.fn(),
}));

import SystemConfig from "../models/SystemConfig.js";
import { decrypt } from "./encryptionService.js";

const mockFindOne = vi.mocked(SystemConfig.findOne);
const mockDecrypt = vi.mocked(decrypt);

describe("apiKeyService", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("getOpenRouterApiKey", () => {
    it("DBにAPIキーが設定されている場合はDBのキーを返すこと", async () => {
      const { getOpenRouterApiKey, invalidateApiKeyCache } = await import(
        "./apiKeyService.js"
      );
      invalidateApiKeyCache();

      mockFindOne.mockResolvedValue({
        openrouterApiKey: "暗号文",
        openrouterApiKeyIv: "iv値",
        openrouterApiKeyTag: "tag値",
      } as never);
      mockDecrypt.mockReturnValue("sk-or-db-api-key");

      const result = await getOpenRouterApiKey();

      expect(result).toBe("sk-or-db-api-key");
      expect(mockDecrypt).toHaveBeenCalledWith("暗号文", "iv値", "tag値");
    });

    it("DBにAPIキーが未設定の場合は環境変数にフォールバックすること", async () => {
      const { getOpenRouterApiKey, invalidateApiKeyCache } = await import(
        "./apiKeyService.js"
      );
      invalidateApiKeyCache();

      mockFindOne.mockResolvedValue(null);
      process.env.OPENROUTER_API_KEY = "sk-or-env-api-key";

      const result = await getOpenRouterApiKey();

      expect(result).toBe("sk-or-env-api-key");
      expect(mockDecrypt).not.toHaveBeenCalled();
    });

    it("DBのAPIキーフィールドが空の場合は環境変数にフォールバックすること", async () => {
      const { getOpenRouterApiKey, invalidateApiKeyCache } = await import(
        "./apiKeyService.js"
      );
      invalidateApiKeyCache();

      mockFindOne.mockResolvedValue({
        openrouterApiKey: undefined,
        openrouterApiKeyIv: undefined,
        openrouterApiKeyTag: undefined,
      } as never);
      process.env.OPENROUTER_API_KEY = "sk-or-env-fallback";

      const result = await getOpenRouterApiKey();

      expect(result).toBe("sk-or-env-fallback");
    });

    it("DBも環境変数もない場合はエラーをスローすること", async () => {
      const { getOpenRouterApiKey, invalidateApiKeyCache } = await import(
        "./apiKeyService.js"
      );
      invalidateApiKeyCache();

      mockFindOne.mockResolvedValue(null);
      process.env.OPENROUTER_API_KEY = undefined;

      await expect(getOpenRouterApiKey()).rejects.toThrow(
        "OpenRouter APIキーが設定されていません"
      );
    });

    it("2回目の呼び出しはキャッシュから返すこと（DBアクセスが1回のみ）", async () => {
      const { getOpenRouterApiKey, invalidateApiKeyCache } = await import(
        "./apiKeyService.js"
      );
      invalidateApiKeyCache();

      mockFindOne.mockResolvedValue({
        openrouterApiKey: "暗号文",
        openrouterApiKeyIv: "iv",
        openrouterApiKeyTag: "tag",
      } as never);
      mockDecrypt.mockReturnValue("sk-or-cached-key");

      await getOpenRouterApiKey();
      await getOpenRouterApiKey();

      expect(mockFindOne).toHaveBeenCalledTimes(1);
    });

    it("invalidateApiKeyCacheを呼ぶとキャッシュがクリアされてDBに再アクセスすること", async () => {
      const { getOpenRouterApiKey, invalidateApiKeyCache } = await import(
        "./apiKeyService.js"
      );
      invalidateApiKeyCache();

      mockFindOne.mockResolvedValue({
        openrouterApiKey: "暗号文",
        openrouterApiKeyIv: "iv",
        openrouterApiKeyTag: "tag",
      } as never);
      mockDecrypt.mockReturnValue("sk-or-key");

      await getOpenRouterApiKey();
      invalidateApiKeyCache();
      await getOpenRouterApiKey();

      expect(mockFindOne).toHaveBeenCalledTimes(2);
    });
  });
});
