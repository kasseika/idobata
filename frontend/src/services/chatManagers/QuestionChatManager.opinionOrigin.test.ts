/**
 * 他の人の意見を起点にした論点チャットの開始のテスト（issue #177）
 *
 * 目的: QuestionChatManager.startFromOpinion が次の振る舞いをすることを検証する。
 *       - どの意見を起点にしたかの通知と、参加者の反応（「私もそう思う」等）をチャットに表示する
 *       - 起点（種類・ID・反応）を付けて、論点のスレッドへ送信する
 *       - AI の応答をチャットに表示し、返ってきた threadId を次の送信に付ける
 *       - 送信に失敗したら、エラーをチャットに表示する
 *       - 破棄（cleanup）した後は、送信もスレッドの購読もしない（ページを離れた後に購読が残らないようにする）
 * 前提: apiClient と socketClient はモックする。
 */
import { err, ok } from "neverthrow";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendQuestionMessage: vi.fn(),
  startQuestionChatFromOpinion: vi.fn(),
  subscribeToTheme: vi.fn(),
  subscribeToThread: vi.fn(),
}));

vi.mock("../../services/api/apiClient", () => ({
  apiClient: {
    getThreadByUserAndQuestion: vi.fn(async () =>
      ok({
        threadId: null,
        themeId: "650000000000000000000001",
        questionId: "650000000000000000000002",
        messages: [],
      })
    ),
    sendQuestionMessage: mocks.sendQuestionMessage,
    startQuestionChatFromOpinion: mocks.startQuestionChatFromOpinion,
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

import { apiClient } from "../../services/api/apiClient";
import type { Message } from "../../types";
import { QuestionChatManager } from "./QuestionChatManager";

const themeId = "650000000000000000000001";
const questionId = "650000000000000000000002";
const userId = "uuid-営業部の佐藤さんの端末";
const createdThreadId = "650000000000000000000100";
/** 他の参加者（鈴木さん）が書いた課題 */
const otherProblem =
  "評価面談が年1回しかなく、日々の成果が評価に反映されにくい。";
const origin = {
  type: "problem" as const,
  id: "650000000000000000000201",
  reaction: "agree" as const,
};

async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** マネージャーを作り、チャットに表示されたメッセージを記録する */
async function createManager() {
  const shown: Message[] = [];
  const manager = new QuestionChatManager({
    themeId,
    questionId,
    questionText: "評価への納得感を高めるにはどうすればよいだろうか？",
    userId,
    onNewMessage: (message) => shown.push(message),
    onNewExtraction: () => {},
  });
  await flushPromises();
  shown.length = 0;
  return { manager, shown };
}

describe("QuestionChatManager.startFromOpinion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.startQuestionChatFromOpinion.mockResolvedValue(
      ok({
        response: "そう思った理由を教えてください。",
        threadId: createdThreadId,
        userId,
      })
    );
    mocks.sendQuestionMessage.mockResolvedValue(
      ok({ response: "ありがとうございます。", threadId: createdThreadId })
    );
  });

  it("起点の意見の通知と参加者の反応を表示し、起点を付けて送信し、AI の応答を表示すること", async () => {
    const { manager, shown } = await createManager();

    await manager.startFromOpinion(origin, otherProblem);

    expect(shown.map((m) => m.content)).toEqual([
      `「${otherProblem}」という意見を起点に話します。`,
      "私もそう思う",
      "そう思った理由を教えてください。",
    ]);
    expect(shown[1].constructor.name).toBe("UserMessage");
    expect(mocks.startQuestionChatFromOpinion).toHaveBeenCalledWith(
      userId,
      themeId,
      questionId,
      origin,
      undefined
    );
  });

  it("「自分の場合は少し違う」で始めると、その反応を表示すること", async () => {
    const { manager, shown } = await createManager();

    await manager.startFromOpinion(
      { ...origin, reaction: "differ" },
      otherProblem
    );

    expect(shown[1].content).toBe("自分の場合は少し違う");
  });

  it("起点付きの開始で返ってきた threadId を、次の通常の送信に付けること", async () => {
    const { manager } = await createManager();

    await manager.startFromOpinion(origin, otherProblem);
    await manager.addMessage("半年前の成果が忘れられていました", "user");

    const args = mocks.sendQuestionMessage.mock.calls[0];
    expect(args[args.length - 1]).toBe(createdThreadId);
  });

  it("送信に失敗した場合は、エラーをチャットに表示すること", async () => {
    mocks.startQuestionChatFromOpinion.mockResolvedValue(
      err(new Error("通信エラー"))
    );
    const { manager, shown } = await createManager();

    await manager.startFromOpinion(origin, otherProblem);

    expect(shown[shown.length - 1].content).toBe(
      "メッセージの送信中にエラーが発生しました。"
    );
  });

  it("履歴の読み込みが終わる前に始めても、起点の通知と反応を履歴の後に表示すること", async () => {
    // 前提: 佐藤さんはこの論点で以前にも話しており、履歴の読み込みには時間がかかる
    vi.mocked(apiClient.getThreadByUserAndQuestion).mockImplementationOnce(
      async () => {
        await flushPromises();
        return ok({
          threadId: createdThreadId,
          themeId,
          questionId,
          messages: [{ role: "user", content: "面談の時間が短いです" }],
        });
      }
    );
    const shown: Message[] = [];
    const manager = new QuestionChatManager({
      themeId,
      questionId,
      questionText: "評価への納得感を高めるにはどうすればよいだろうか？",
      userId,
      onNewMessage: (message) => shown.push(message),
      onNewExtraction: () => {},
    });

    // 履歴の読み込みを待たずに始める（コメント画面から移動してきた直後など）
    await manager.startFromOpinion(origin, otherProblem);

    const contents = shown.map((m) => m.content);
    const historyIndex = contents.indexOf("面談の時間が短いです");
    expect(historyIndex).toBeGreaterThanOrEqual(0);
    expect(historyIndex).toBeLessThan(
      contents.indexOf(`「${otherProblem}」という意見を起点に話します。`)
    );
    // 読み込んだ履歴のスレッドに続けて送る
    expect(mocks.startQuestionChatFromOpinion).toHaveBeenCalledWith(
      userId,
      themeId,
      questionId,
      origin,
      createdThreadId
    );
  });

  it("履歴の読み込み中に破棄された場合は、送信も購読もしないこと", async () => {
    const shown: Message[] = [];
    const manager = new QuestionChatManager({
      themeId,
      questionId,
      questionText: "評価への納得感を高めるにはどうすればよいだろうか？",
      userId,
      onNewMessage: (message) => shown.push(message),
      onNewExtraction: () => {},
    });

    // 履歴の読み込みを待っている間に、ページを離れてマネージャーが破棄される
    const starting = manager.startFromOpinion(origin, otherProblem);
    manager.cleanup();
    await starting;

    expect(mocks.startQuestionChatFromOpinion).not.toHaveBeenCalled();
    expect(mocks.subscribeToTheme).not.toHaveBeenCalled();
  });

  it("送信の応答が届く前に破棄された場合は、返ってきたスレッドを購読しないこと", async () => {
    // 前提: 送信の応答を、テストが指示するまで返さない
    let resolveSend: (value: unknown) => void = () => {};
    mocks.startQuestionChatFromOpinion.mockReturnValue(
      new Promise((resolve) => {
        resolveSend = resolve;
      })
    );
    const { manager } = await createManager();

    const starting = manager.startFromOpinion(origin, otherProblem);
    await flushPromises();
    manager.cleanup();
    resolveSend(
      ok({ response: "理由を教えてください。", threadId: createdThreadId })
    );
    await starting;

    expect(mocks.subscribeToThread).not.toHaveBeenCalled();
  });

  it("破棄されていなければ、返ってきたスレッドを購読すること", async () => {
    const { manager } = await createManager();

    await manager.startFromOpinion(origin, otherProblem);

    expect(mocks.subscribeToThread).toHaveBeenCalledWith(createdThreadId);
  });
});
