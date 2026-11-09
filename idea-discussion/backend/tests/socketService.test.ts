/**
 * Socket.IO サービスのテスト
 *
 * 目的: 抽出イベント（new-extraction・extraction-update）を、テーマのルームとスレッドのルームに
 *       送ることを検証する。あわせて、最小寄与人数 k が有効なテーマでは、誰でも購読できる
 *       テーマのルームには送らず、本人のスレッドのルームにだけ送ることを検証する（issue #146）。
 *       スレッドのルームは、スレッドの持ち主の userId を示したときだけ購読できることも検証する。
 * 前提: io インスタンスと Theme・ChatThread モデルはモックする。
 */
import type { Server } from "socket.io";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("../models/Theme.js", () => ({ default: { findById: vi.fn() } }));
vi.mock("../models/ChatThread.js", () => ({ default: { findById: vi.fn() } }));

import ChatThread from "../models/ChatThread.js";
import Theme from "../models/Theme.js";
import {
  authorizeThreadSubscription,
  emitExtractionUpdate,
  emitNewExtraction,
  initSocketService,
} from "../services/socketService.js";

/** テスト用のモック io インスタンス */
const mockIo = {
  to: vi.fn().mockReturnThis(),
  emit: vi.fn(),
};

/** テーマのモック（k の有無を切り替える） */
const mockTheme = (minContributors: number | null) => {
  (Theme.findById as ReturnType<typeof vi.fn>).mockReturnValue({
    select: () => ({
      lean: vi.fn().mockResolvedValue({ minContributors }),
    }),
  });
};

const themeId = "650000000000000000000001";
const threadId = "650000000000000000000099";

describe("Socket Service Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // DI パターン: テスト開始前にモック io を注入する
    initSocketService(mockIo as unknown as Server);
  });

  describe("k が無効なテーマ（従来どおり）", () => {
    beforeEach(() => {
      mockTheme(null);
    });

    test("emitNewExtraction should emit to theme room", async () => {
      const type = "problem";
      const data = { statement: "テスト課題", description: "テスト課題の説明" };

      await emitNewExtraction(themeId, null, type, data);

      expect(mockIo.to).toHaveBeenCalledWith(`theme:${themeId}`);
      expect(mockIo.emit).toHaveBeenCalledWith("new-extraction", {
        type,
        data,
      });
    });

    test("emitNewExtraction should emit to theme and thread rooms", async () => {
      const type = "solution";
      const data = {
        statement: "テスト解決策",
        description: "テスト解決策の説明",
      };

      await emitNewExtraction(themeId, threadId, type, data);

      expect(mockIo.to).toHaveBeenCalledWith(`theme:${themeId}`);
      expect(mockIo.to).toHaveBeenCalledWith(`thread:${threadId}`);
      expect(mockIo.emit).toHaveBeenCalledTimes(2);
      expect(mockIo.emit).toHaveBeenCalledWith("new-extraction", {
        type,
        data,
      });
    });

    test("emitExtractionUpdate should emit to theme room", async () => {
      const type = "problem";
      const data = { statement: "テスト課題", description: "テスト課題の説明" };

      await emitExtractionUpdate(themeId, null, type, data);

      expect(mockIo.to).toHaveBeenCalledWith(`theme:${themeId}`);
      expect(mockIo.emit).toHaveBeenCalledWith("extraction-update", {
        type,
        data,
      });
    });

    test("emitExtractionUpdate should emit to theme and thread rooms", async () => {
      const type = "solution";
      const data = {
        statement: "テスト解決策",
        description: "テスト解決策の説明",
      };

      await emitExtractionUpdate(themeId, threadId, type, data);

      expect(mockIo.to).toHaveBeenCalledWith(`theme:${themeId}`);
      expect(mockIo.to).toHaveBeenCalledWith(`thread:${threadId}`);
      expect(mockIo.emit).toHaveBeenCalledTimes(2);
      expect(mockIo.emit).toHaveBeenCalledWith("extraction-update", {
        type,
        data,
      });
    });
  });

  describe("k が有効なテーマ", () => {
    const data = { statement: "経理部の月末処理で毎月残業が続いています。" };

    beforeEach(() => {
      mockTheme(5);
    });

    test("新しい抽出は、テーマのルームには送らず、本人のスレッドのルームにだけ送ること", async () => {
      await emitNewExtraction(themeId, threadId, "problem", data);

      expect(mockIo.to).not.toHaveBeenCalledWith(`theme:${themeId}`);
      expect(mockIo.to).toHaveBeenCalledWith(`thread:${threadId}`);
      expect(mockIo.emit).toHaveBeenCalledTimes(1);
    });

    test("抽出の更新は、テーマのルームには送らず、本人のスレッドのルームにだけ送ること", async () => {
      await emitExtractionUpdate(themeId, threadId, "problem", data);

      expect(mockIo.to).not.toHaveBeenCalledWith(`theme:${themeId}`);
      expect(mockIo.to).toHaveBeenCalledWith(`thread:${threadId}`);
      expect(mockIo.emit).toHaveBeenCalledTimes(1);
    });

    test("スレッドの指定がない抽出の更新は、どこにも送らないこと", async () => {
      await emitExtractionUpdate(themeId, null, "problem", data);

      expect(mockIo.emit).not.toHaveBeenCalled();
    });
  });

  describe("テーマの k を確かめられない場合（隠す側に倒す）", () => {
    const data = { statement: "経理部の月末処理で毎月残業が続いています。" };

    test("テーマが見つからない場合は、テーマのルームには送らず、スレッドのルームにだけ送ること", async () => {
      (Theme.findById as ReturnType<typeof vi.fn>).mockReturnValue({
        select: () => ({ lean: vi.fn().mockResolvedValue(null) }),
      });

      await emitNewExtraction(themeId, threadId, "problem", data);

      expect(mockIo.to).not.toHaveBeenCalledWith(`theme:${themeId}`);
      expect(mockIo.to).toHaveBeenCalledWith(`thread:${threadId}`);
    });

    test("テーマの読み込みに失敗した場合は、例外を投げず、テーマのルームには送らず、スレッドのルームにだけ送ること", async () => {
      // 前提: 配信は画面を更新するための通知なので、失敗しても抽出処理を止めない
      (Theme.findById as ReturnType<typeof vi.fn>).mockReturnValue({
        select: () => ({
          lean: vi.fn().mockRejectedValue(new Error("MongoDB timeout")),
        }),
      });

      await expect(
        emitNewExtraction(themeId, threadId, "problem", data)
      ).resolves.toBeUndefined();

      expect(mockIo.to).not.toHaveBeenCalledWith(`theme:${themeId}`);
      expect(mockIo.to).toHaveBeenCalledWith(`thread:${threadId}`);
    });
  });

  describe("authorizeThreadSubscription（スレッドのルームの購読の可否）", () => {
    const ownerUserId = "uuid-営業部の佐藤さんの端末";

    beforeEach(() => {
      (ChatThread.findById as ReturnType<typeof vi.fn>).mockReturnValue({
        select: () => ({
          lean: vi
            .fn()
            .mockResolvedValue({ _id: threadId, userId: ownerUserId }),
        }),
      });
    });

    test("スレッドの持ち主の userId を示した場合は、購読してよいスレッド ID を返すこと", async () => {
      const result = await authorizeThreadSubscription({
        threadId,
        userId: ownerUserId,
      });

      expect(result).toBe(threadId);
    });

    test("持ち主でない userId の場合は、null を返すこと", async () => {
      const result = await authorizeThreadSubscription({
        threadId,
        userId: "uuid-同じ研修に参加した鈴木さんの端末",
      });

      expect(result).toBeNull();
    });

    test("スレッド ID だけ（従来の形式）の場合は、null を返すこと", async () => {
      const result = await authorizeThreadSubscription(threadId);

      expect(result).toBeNull();
    });

    test("スレッド ID の形式が正しくない場合は、DB を参照せずに null を返すこと", async () => {
      const result = await authorizeThreadSubscription({
        threadId: { $ne: null },
        userId: ownerUserId,
      });

      expect(result).toBeNull();
      expect(ChatThread.findById).not.toHaveBeenCalled();
    });

    test("スレッドが存在しない場合は、null を返すこと", async () => {
      (ChatThread.findById as ReturnType<typeof vi.fn>).mockReturnValue({
        select: () => ({ lean: vi.fn().mockResolvedValue(null) }),
      });

      const result = await authorizeThreadSubscription({
        threadId,
        userId: ownerUserId,
      });

      expect(result).toBeNull();
    });
  });
});
