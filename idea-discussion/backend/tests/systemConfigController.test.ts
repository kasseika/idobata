/**
 * systemConfigController のユニットテスト
 *
 * 目的: GET /api/system-config と PUT /api/system-config の動作を検証する。
 *       - getSystemConfig: APIキーのマスク表示・hasOpenrouterApiKeyフラグ
 *       - updateSystemConfig: APIキーの暗号化保存・キャッシュ無効化
 */
import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../models/SystemConfig.js", () => ({
  default: {
    findOne: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock("../services/encryptionService.js", () => ({
  encrypt: vi.fn(),
}));

vi.mock("../services/apiKeyService.js", () => ({
  invalidateApiKeyCache: vi.fn(),
}));

import {
  getSystemConfig,
  updateSystemConfig,
} from "../controllers/systemConfigController.js";
import SystemConfig from "../models/SystemConfig.js";
import { invalidateApiKeyCache } from "../services/apiKeyService.js";
import { encrypt } from "../services/encryptionService.js";

const mockFindOne = vi.mocked(SystemConfig.findOne);
const mockCreate = vi.mocked(SystemConfig.create);
const mockEncrypt = vi.mocked(encrypt);
const mockInvalidateCache = vi.mocked(invalidateApiKeyCache);

/** モックReqを生成するヘルパー */
const createMockReq = (body: Record<string, unknown> = {}): Request =>
  ({ body }) as unknown as Request;

/** モックResを生成するヘルパー */
const createMockRes = (): Response => {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
};

describe("systemConfigController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getSystemConfig", () => {
    it("APIキーが設定済みの場合はマスク表示とhasOpenrouterApiKey=trueを返すこと", async () => {
      mockFindOne.mockResolvedValue({
        openrouterApiKey: "abcdef1234567890",
        openrouterApiKeyIv: "iv値",
        openrouterApiKeyTag: "tag値",
      } as never);

      const req = createMockReq();
      const res = createMockRes();

      await getSystemConfig(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          hasOpenrouterApiKey: true,
          openrouterApiKeyMasked: expect.stringMatching(/^\*+$/),
        })
      );
      // 実際のAPIキー値はレスポンスに含まれないこと
      const jsonArg = vi.mocked(res.json).mock.calls[0][0];
      expect(jsonArg).not.toHaveProperty("openrouterApiKey");
    });

    it("APIキーが未設定の場合はhasOpenrouterApiKey=falseを返すこと", async () => {
      mockFindOne.mockResolvedValue(null);

      const req = createMockReq();
      const res = createMockRes();

      await getSystemConfig(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          hasOpenrouterApiKey: false,
          openrouterApiKeyMasked: null,
        })
      );
    });

    it("DBエラー時は500を返すこと", async () => {
      mockFindOne.mockRejectedValue(new Error("DB接続エラー"));

      const req = createMockReq();
      const res = createMockRes();

      await getSystemConfig(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("updateSystemConfig", () => {
    it("APIキーを暗号化してDBに保存しキャッシュを無効化すること", async () => {
      const mockSave = vi.fn().mockResolvedValue({});
      mockFindOne.mockResolvedValue({ save: mockSave } as never);
      mockEncrypt.mockReturnValue({
        encrypted: "暗号文",
        iv: "iv値",
        tag: "tag値",
      });

      const req = createMockReq({ openrouterApiKey: "sk-or-new-key" });
      const res = createMockRes();

      await updateSystemConfig(req, res);

      expect(mockEncrypt).toHaveBeenCalledWith("sk-or-new-key");
      expect(mockSave).toHaveBeenCalled();
      expect(mockInvalidateCache).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("SystemConfigが存在しない場合は新規作成すること", async () => {
      mockFindOne.mockResolvedValue(null);
      mockEncrypt.mockReturnValue({
        encrypted: "暗号文",
        iv: "iv値",
        tag: "tag値",
      });
      mockCreate.mockResolvedValue({} as never);

      const req = createMockReq({ openrouterApiKey: "sk-or-new-key" });
      const res = createMockRes();

      await updateSystemConfig(req, res);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          openrouterApiKey: "暗号文",
          openrouterApiKeyIv: "iv値",
          openrouterApiKeyTag: "tag値",
        })
      );
      expect(mockInvalidateCache).toHaveBeenCalled();
    });

    it("openrouterApiKeyが未指定の場合は400を返すこと", async () => {
      const req = createMockReq({});
      const res = createMockRes();

      await updateSystemConfig(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("DBエラー時は500を返すこと", async () => {
      mockFindOne.mockRejectedValue(new Error("DB接続エラー"));
      const req = createMockReq({ openrouterApiKey: "sk-or-key" });
      const res = createMockRes();

      await updateSystemConfig(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
