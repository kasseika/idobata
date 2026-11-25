/**
 * apiClient.startQuestionChatFromOpinion のテスト（issue #177）
 *
 * 目的: 他の人の意見を起点に論点チャット・テーマ全体のチャットを始めるとき、
 *       バックエンドが受け取るリクエストの形を検証する。
 *       発言の本文（message）は送らず、起点（origin）・論点・論点チャットの文脈を送る。
 *       本文はバックエンドが反応の種類から決めるため。
 * 前提: HttpClient はモックし、post に渡されたパスとボディを観測する。
 */
import { ok } from "neverthrow";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ post: vi.fn() }));

vi.mock("./httpClient", () => ({
  HttpClient: vi.fn(function (this: { post: typeof mocks.post }) {
    this.post = mocks.post;
  }),
}));

import { apiClient } from "./apiClient";

describe("apiClient.startQuestionChatFromOpinion", () => {
  it("本文を付けず、起点と論点を付けて論点チャットのメッセージ送信 API に送ること", async () => {
    mocks.post.mockResolvedValue(
      ok({ response: "理由を教えてください。", threadId: "thread-1" })
    );
    const origin = {
      type: "solution" as const,
      id: "650000000000000000000301",
      reaction: "differ" as const,
    };

    await apiClient.startQuestionChatFromOpinion(
      "uuid-営業部の佐藤さんの端末",
      "650000000000000000000001",
      "650000000000000000000002",
      origin,
      "650000000000000000000100"
    );

    expect(mocks.post).toHaveBeenCalledWith(
      "/themes/650000000000000000000001/chat/messages",
      {
        userId: "uuid-営業部の佐藤さんの端末",
        threadId: "650000000000000000000100",
        questionId: "650000000000000000000002",
        context: "question",
        origin,
      }
    );
  });
});

describe("apiClient.startThemeChatFromOpinion", () => {
  it("本文も論点も付けず、起点だけを付けてテーマのメッセージ送信 API に送ること", async () => {
    // 前提: テーマ詳細ページの「寄せられた意見」から始めるため、テーマ全体のスレッドに入る
    mocks.post.mockResolvedValue(
      ok({ response: "理由を教えてください。", threadId: "thread-1" })
    );
    const origin = {
      type: "problem" as const,
      id: "650000000000000000000201",
      reaction: "agree" as const,
    };

    await apiClient.startThemeChatFromOpinion(
      "uuid-営業部の佐藤さんの端末",
      "650000000000000000000001",
      origin,
      undefined
    );

    expect(mocks.post).toHaveBeenCalledWith(
      "/themes/650000000000000000000001/chat/messages",
      {
        userId: "uuid-営業部の佐藤さんの端末",
        threadId: undefined,
        origin,
      }
    );
  });
});
