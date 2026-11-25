/**
 * 他の人の意見を起点にしたテーマ全体のチャットの開始のテスト（issue #177）
 *
 * 目的: テーマ詳細ページの「寄せられた意見」から始めたとき、ThemeDetailChatManager.startFromOpinion が
 *       次の振る舞いをすることを検証する。
 *       - どの意見を起点にしたかの通知と、参加者の反応を、既存の履歴の後に表示する
 *       - 起点（種類・ID・反応）を付けて、テーマ全体のスレッドへ送信する
 *       - AI の応答を表示し、返ってきた threadId を次の送信に付ける
 *       - 送信に失敗したら、エラーを表示する
 *       - 破棄（cleanup）した後は、送信もスレッドの購読もしない
 * 前提: apiClient と socketClient はモックする。
 */
import { err, ok } from "neverthrow";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getThreadByUserAndTheme: vi.fn(),
  sendMessage: vi.fn(),
  startThemeChatFromOpinion: vi.fn(),
  subscribeToTheme: vi.fn(),
  subscribeToThread: vi.fn(),
}));

vi.mock("../../services/api/apiClient", () => ({
  apiClient: {
    getThreadByUserAndTheme: mocks.getThreadByUserAndTheme,
    sendMessage: mocks.sendMessage,
    startThemeChatFromOpinion: mocks.startThemeChatFromOpinion,
  },
}));
vi.mock("../../services/socket/socketClient", () => ({
  socketClient: {
    subscribeToTheme: mocks.subscribeToTheme,
    subscribeToThread: mocks.subscribeToThread,
    unsubscribeFromTheme: vi.fn(),
    unsubscribeFromThread: vi.fn(),
    onNewExtraction: () => () => {},
    onExtractionUpdate: () => () => {},
  },
}));

import type { Message } from "../../types";
import { ThemeDetailChatManager } from "./ThemeDetailChatManager";

const themeId = "650000000000000000000001";
const userId = "uuid-営業部の佐藤さんの端末";
const createdThreadId = "650000000000000000000100";
/** 他の参加者（鈴木さん）が書いた解決策 */
const otherSolution = "四半期ごとに上司と短い振り返り面談を行う。";
const origin = {
  type: "solution" as const,
  id: "650000000000000000000301",
  reaction: "differ" as const,
};

async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** マネージャーを作り、チャットに表示されたメッセージを記録する */
function createManager() {
  const shown: Message[] = [];
  const manager = new ThemeDetailChatManager({
    themeId,
    themeName: "評価制度の見直し",
    userId,
    onNewMessage: (message) => shown.push(message),
    onNewExtraction: () => {},
  });
  return { manager, shown };
}

describe("ThemeDetailChatManager.startFromOpinion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getThreadByUserAndTheme.mockResolvedValue(
      ok({ threadId: null, themeId, messages: [] })
    );
    mocks.startThemeChatFromOpinion.mockResolvedValue(
      ok({
        response: "どこが違うか教えてください。",
        threadId: createdThreadId,
      })
    );
    mocks.sendMessage.mockResolvedValue(
      ok({ response: "ありがとうございます。", threadId: createdThreadId })
    );
  });

  it("起点の意見の通知と参加者の反応を表示し、起点を付けて送信し、AI の応答を表示すること", async () => {
    const { manager, shown } = createManager();
    await flushPromises();
    shown.length = 0;

    await manager.startFromOpinion(origin, otherSolution);

    expect(shown.map((m) => m.content)).toEqual([
      `「${otherSolution}」という意見を起点に話します。`,
      "自分の場合は少し違う",
      "どこが違うか教えてください。",
    ]);
    expect(shown[1].constructor.name).toBe("UserMessage");
    expect(mocks.startThemeChatFromOpinion).toHaveBeenCalledWith(
      userId,
      themeId,
      origin,
      undefined
    );
  });

  it("返ってきた threadId を、次の通常の送信に付けること", async () => {
    const { manager } = createManager();
    await flushPromises();

    await manager.startFromOpinion(origin, otherSolution);
    await manager.addMessage("うちの部署では面談の時間が取れません", "user");

    const args = mocks.sendMessage.mock.calls[0];
    expect(args[args.length - 1]).toBe(createdThreadId);
  });

  it("履歴の読み込みが終わる前に始めても、起点の通知と反応を履歴の後に表示すること", async () => {
    // 前提: 佐藤さんはこのテーマで以前にも話しており、履歴の読み込みには時間がかかる
    mocks.getThreadByUserAndTheme.mockImplementationOnce(async () => {
      await flushPromises();
      return ok({
        threadId: createdThreadId,
        themeId,
        messages: [{ role: "user", content: "面談の時間が短いです" }],
      });
    });
    const { manager, shown } = createManager();

    await manager.startFromOpinion(origin, otherSolution);

    const contents = shown.map((m) => m.content);
    const historyIndex = contents.indexOf("面談の時間が短いです");
    expect(historyIndex).toBeGreaterThanOrEqual(0);
    expect(historyIndex).toBeLessThan(
      contents.indexOf(`「${otherSolution}」という意見を起点に話します。`)
    );
    expect(mocks.startThemeChatFromOpinion).toHaveBeenCalledWith(
      userId,
      themeId,
      origin,
      createdThreadId
    );
  });

  it("送信に失敗した場合は、エラーを表示すること", async () => {
    mocks.startThemeChatFromOpinion.mockResolvedValue(
      err(new Error("通信エラー"))
    );
    const { manager, shown } = createManager();
    await flushPromises();

    await manager.startFromOpinion(origin, otherSolution);

    expect(shown[shown.length - 1].content).toBe(
      "メッセージの送信中にエラーが発生しました。"
    );
  });

  it("履歴の読み込み中に破棄された場合は、送信も購読もしないこと", async () => {
    const { manager } = createManager();

    const starting = manager.startFromOpinion(origin, otherSolution);
    manager.cleanup();
    await starting;

    expect(mocks.startThemeChatFromOpinion).not.toHaveBeenCalled();
    expect(mocks.subscribeToTheme).not.toHaveBeenCalled();
  });

  it("送信の応答が届く前に破棄された場合は、返ってきたスレッドを購読しないこと", async () => {
    let resolveSend: (value: unknown) => void = () => {};
    mocks.startThemeChatFromOpinion.mockReturnValue(
      new Promise((resolve) => {
        resolveSend = resolve;
      })
    );
    const { manager } = createManager();
    await flushPromises();

    const starting = manager.startFromOpinion(origin, otherSolution);
    await flushPromises();
    manager.cleanup();
    resolveSend(
      ok({ response: "理由を教えてください。", threadId: createdThreadId })
    );
    await starting;

    expect(mocks.subscribeToThread).not.toHaveBeenCalled();
  });

  it("破棄されていなければ、返ってきたスレッドを購読すること", async () => {
    const { manager } = createManager();
    await flushPromises();

    await manager.startFromOpinion(origin, otherSolution);

    expect(mocks.subscribeToThread).toHaveBeenCalledWith(createdThreadId);
  });
});
