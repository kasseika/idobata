import { beforeEach, describe, expect, test, vi } from "vitest";

// Import after setting up mocks
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

describe("Socket Service Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // DI パターン: テスト開始前にモック io を注入する
    initSocketService(mockIo);
  });

  test("emitNewExtraction should emit to theme room", () => {
    const themeId = "test-theme-id";
    const threadId = null;
    const type = "problem";
    const data = { statement: "テスト課題", description: "テスト課題の説明" };

    emitNewExtraction(themeId, threadId, type, data);

    expect(mockIo.to).toHaveBeenCalledWith(`theme:${themeId}`);
    expect(mockIo.emit).toHaveBeenCalledWith("new-extraction", { type, data });
  });

  test("emitNewExtraction should emit to theme and thread rooms", () => {
    const themeId = "test-theme-id";
    const threadId = "test-thread-id";
    const type = "solution";
    const data = {
      statement: "テスト解決策",
      description: "テスト解決策の説明",
    };

    emitNewExtraction(themeId, threadId, type, data);

    expect(mockIo.to).toHaveBeenCalledWith(`theme:${themeId}`);
    expect(mockIo.to).toHaveBeenCalledWith(`thread:${threadId}`);
    expect(mockIo.emit).toHaveBeenCalledTimes(2);
    expect(mockIo.emit).toHaveBeenCalledWith("new-extraction", { type, data });
  });

  test("emitExtractionUpdate should emit to theme room", () => {
    const themeId = "test-theme-id";
    const threadId = null;
    const type = "problem";
    const data = { statement: "テスト課題", description: "テスト課題の説明" };

    emitExtractionUpdate(themeId, threadId, type, data);

    expect(mockIo.to).toHaveBeenCalledWith(`theme:${themeId}`);
    expect(mockIo.emit).toHaveBeenCalledWith("extraction-update", {
      type,
      data,
    });
  });

  test("emitExtractionUpdate should emit to theme and thread rooms", () => {
    const themeId = "test-theme-id";
    const threadId = "test-thread-id";
    const type = "solution";
    const data = {
      statement: "テスト解決策",
      description: "テスト解決策の説明",
    };

    emitExtractionUpdate(themeId, threadId, type, data);

    expect(mockIo.to).toHaveBeenCalledWith(`theme:${themeId}`);
    expect(mockIo.to).toHaveBeenCalledWith(`thread:${threadId}`);
    expect(mockIo.emit).toHaveBeenCalledTimes(2);
    expect(mockIo.emit).toHaveBeenCalledWith("extraction-update", {
      type,
      data,
    });
  });
});
