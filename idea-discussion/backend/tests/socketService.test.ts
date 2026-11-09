/**
 * Socket.IO サービスのテスト
 *
 * 目的: 抽出イベント（new-extraction・extraction-update）を、テーマのルームとスレッドのルームに
 *       送ることを検証する。あわせて、最小寄与人数 k が有効なテーマでは、誰でも購読できる
 *       テーマのルームには送らず、本人のスレッドのルームにだけ送ることを検証する（issue #146）。
 * 前提: io インスタンスと Theme モデルはモックする。
 */
import type { Server } from "socket.io";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("../models/Theme.js", () => ({ default: { findById: vi.fn() } }));

import Theme from "../models/Theme.js";
import {
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
});
