/**
 * チャットの「〜が登録されました」通知のテスト（ThemeDetailChatManager・QuestionChatManager 共通）
 *
 * 目的: チャットに「〜が登録されました」と表示するのは、自分の発言から抽出された課題・解決策だけであることを
 *       検証する。サーバーは、スレッドのルーム（持ち主だけが購読できる）から送ったイベントに
 *       room: "thread" を、テーマのルームから送ったイベントに room: "theme" を付ける。
 *       - room が "thread" のイベントは、チャットに通知すること
 *       - room が "theme" のイベント（他の参加者の発言からの抽出）は、チャットに通知しないこと
 *       - どちらのイベントも、ページの一覧を更新するために onNewExtraction には渡すこと
 * 前提: apiClient と socketClient はモックする。参加者には既存のスレッドがあり、履歴は空とする。
 */
import { ok } from "neverthrow";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "../../types";
import type { NewExtractionEvent } from "../socket/socketClient";

const mocks = vi.hoisted(() => ({
  newExtractionCallbacks: [] as Array<(event: unknown) => void>,
}));

vi.mock("../../services/api/apiClient", () => ({
  apiClient: {
    getThreadByUserAndTheme: vi.fn(async () =>
      ok({ threadId: "650000000000000000000099", messages: [] })
    ),
    getThreadByUserAndQuestion: vi.fn(async () =>
      ok({ threadId: "650000000000000000000099", messages: [] })
    ),
  },
}));
vi.mock("../../services/socket/socketClient", () => ({
  socketClient: {
    subscribeToTheme: vi.fn(),
    subscribeToThread: vi.fn(),
    unsubscribeFromTheme: vi.fn(),
    unsubscribeFromThread: vi.fn(),
    onNewExtraction: (callback: (event: unknown) => void) => {
      mocks.newExtractionCallbacks.push(callback);
      return () => {};
    },
    onExtractionUpdate: () => () => {},
  },
}));

import { QuestionChatManager } from "./QuestionChatManager";
import { ThemeDetailChatManager } from "./ThemeDetailChatManager";

type ManagerCallbacks = {
  onNewMessage: (message: Message) => void;
  onNewExtraction: (event: NewExtractionEvent) => void;
};

/** 検証対象の2種類のチャットマネージャーを作る関数 */
const managerFactories: Array<[string, (callbacks: ManagerCallbacks) => void]> =
  [
    [
      "ThemeDetailChatManager",
      (callbacks) =>
        new ThemeDetailChatManager({
          themeId: "650000000000000000000001",
          themeName: "定例会議の在り方",
          userId: "uuid-営業部の佐藤さんの端末",
          ...callbacks,
        }),
    ],
    [
      "QuestionChatManager",
      (callbacks) =>
        new QuestionChatManager({
          themeId: "650000000000000000000001",
          questionId: "650000000000000000000002",
          questionText: "定例会議の時間をどう短くするか",
          userId: "uuid-営業部の佐藤さんの端末",
          ...callbacks,
        }),
    ],
  ];

/** 保留中の Promise（チャット履歴の読み込み）を処理しきるまで待つ */
async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** 抽出イベントを、登録済みのコールバックすべてに届ける */
function emitNewExtraction(event: NewExtractionEvent): void {
  for (const callback of mocks.newExtractionCallbacks) {
    callback(event);
  }
}

describe.each(managerFactories)("%s の抽出の通知", (_name, createManager) => {
  let messages: Message[];
  let extractions: NewExtractionEvent[];

  beforeEach(async () => {
    mocks.newExtractionCallbacks.length = 0;
    messages = [];
    extractions = [];
    createManager({
      onNewMessage: (message) => messages.push(message),
      onNewExtraction: (event) => extractions.push(event),
    });
    // チャット履歴を読み込み、抽出イベントの購読が始まるまで待つ
    await flushPromises();
  });

  it("自分の発言から抽出された課題は、チャットに通知すること", () => {
    emitNewExtraction({
      type: "problem",
      data: { _id: "problem-own", statement: "定例会議が長引いて結論が出ない" },
      room: "thread",
    });

    const contents = messages.map((message) => message.content);
    expect(contents).toContain(
      "「定例会議が長引いて結論が出ない」という課題が登録されました。"
    );
    expect(extractions).toHaveLength(1);
  });

  it("他の参加者の発言から抽出された課題は、チャットに通知せず、一覧の更新にだけ渡すこと", () => {
    emitNewExtraction({
      type: "problem",
      data: {
        _id: "problem-others",
        statement: "社内チャットの通知が多すぎる",
      },
      room: "theme",
    });

    const contents = messages.map((message) => message.content);
    expect(
      contents.some((content) =>
        content.includes("社内チャットの通知が多すぎる")
      )
    ).toBe(false);
    expect(extractions).toHaveLength(1);
  });
});
