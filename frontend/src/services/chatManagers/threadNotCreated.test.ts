/**
 * スレッド未作成時のチャットマネージャーのテスト（ThemeDetailChatManager・QuestionChatManager 共通）
 *
 * 目的: 取得 API が threadId: null（スレッド未作成）を返したときの振る舞いを検証する（issue #169）。
 *       - 履歴の読み込み時点では、スレッドの購読を始めないこと
 *       - 最初のメッセージ送信で返ってきた threadId を保存し、そのスレッドの購読を始めること
 *       - 2通目以降の送信には、保存した threadId を付けること
 * 前提: apiClient と socketClient はモックする。
 */
import { err, ok } from "neverthrow";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  sendQuestionMessage: vi.fn(),
  subscribeToThread: vi.fn(),
}));

vi.mock("../../services/api/apiClient", () => ({
  apiClient: {
    getThreadByUserAndTheme: vi.fn(async () =>
      ok({ threadId: null, themeId: "650000000000000000000001", messages: [] })
    ),
    getThreadByUserAndQuestion: vi.fn(async () =>
      ok({
        threadId: null,
        themeId: "650000000000000000000001",
        questionId: "650000000000000000000002",
        messages: [],
      })
    ),
    sendMessage: mocks.sendMessage,
    sendQuestionMessage: mocks.sendQuestionMessage,
  },
}));
vi.mock("../../services/socket/socketClient", () => ({
  socketClient: {
    subscribeToTheme: vi.fn(),
    subscribeToThread: mocks.subscribeToThread,
    unsubscribeFromTheme: vi.fn(),
    unsubscribeFromThread: vi.fn(),
    onNewExtraction: () => () => {},
    onExtractionUpdate: () => () => {},
  },
}));

import { QuestionChatManager } from "./QuestionChatManager";
import { ThemeDetailChatManager } from "./ThemeDetailChatManager";

const createdThreadId = "650000000000000000000100";

type ManagerLike = {
  addMessage: (content: string, type: "user") => Promise<void>;
};

/** 検証対象のマネージャーと、その送信 API のモックの組 */
const cases: Array<[string, () => ManagerLike, typeof mocks.sendMessage]> = [
  [
    "ThemeDetailChatManager",
    () =>
      new ThemeDetailChatManager({
        themeId: "650000000000000000000001",
        themeName: "定例会議の在り方",
        userId: "uuid-営業部の佐藤さんの端末",
        onNewMessage: () => {},
        onNewExtraction: () => {},
      }),
    mocks.sendMessage,
  ],
  [
    "QuestionChatManager",
    () =>
      new QuestionChatManager({
        themeId: "650000000000000000000001",
        questionId: "650000000000000000000002",
        questionText: "定例会議の時間をどう短くするか",
        userId: "uuid-営業部の佐藤さんの端末",
        onNewMessage: () => {},
        onNewExtraction: () => {},
      }),
    mocks.sendQuestionMessage,
  ],
];

async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** 送信 API のモックに渡された引数のうち、threadId（最後の引数）を取り出す */
function threadIdOfCall(sendMock: typeof mocks.sendMessage, callIndex: number) {
  const args = sendMock.mock.calls[callIndex];
  return args[args.length - 1];
}

describe.each(cases)(
  "%s のスレッド未作成時",
  (_name, createManager, sendMock) => {
    beforeEach(() => {
      vi.clearAllMocks();
      sendMock.mockResolvedValue(
        ok({
          response: "もう少し教えてください。",
          threadId: createdThreadId,
          userId: "uuid-営業部の佐藤さんの端末",
        })
      );
    });

    it("履歴の読み込み時点では、スレッドの購読を始めないこと", async () => {
      createManager();
      await flushPromises();

      expect(mocks.subscribeToThread).not.toHaveBeenCalled();
    });

    it("最初の送信で返ってきた threadId を保存し、購読を始めて、次の送信に付けること", async () => {
      const manager = createManager();
      await flushPromises();

      await manager.addMessage("会議が長引きます", "user");
      await manager.addMessage("結論が出ません", "user");

      expect(threadIdOfCall(sendMock, 0)).toBeUndefined();
      expect(mocks.subscribeToThread).toHaveBeenCalledWith(createdThreadId);
      expect(threadIdOfCall(sendMock, 1)).toBe(createdThreadId);
    });

    it("送信に失敗した場合は、threadId を保存しないこと", async () => {
      sendMock.mockResolvedValue(err(new Error("通信エラー")));
      const manager = createManager();
      await flushPromises();

      await manager.addMessage("会議が長引きます", "user");
      await manager.addMessage("結論が出ません", "user");

      expect(threadIdOfCall(sendMock, 1)).toBeUndefined();
    });
  }
);
