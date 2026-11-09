/**
 * ThemeChatThreads ページのテスト
 *
 * 目的: 最小寄与人数 k が有効なテーマで、スレッド一覧の取得が拒否された（403）場合に、
 *       拒否された理由（バックエンドのメッセージ）を表示することを検証する（issue #146）。
 *       それ以外の失敗では、従来どおりの文言を表示することも確かめる。
 * 前提: apiClient はモックする。
 */
import { render, screen } from "@testing-library/react";
import { err } from "neverthrow";
import React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { apiClient } from "../services/api/apiClient";
import { ApiError, ApiErrorType } from "../services/api/apiError";
import ThemeChatThreads from "./ThemeChatThreads";

vi.mock("../services/api/apiClient", () => ({
  apiClient: { getChatThreadsByTheme: vi.fn() },
}));

/** テーマ ID 付きの URL でページを表示する */
const renderPage = () =>
  render(
    <MemoryRouter
      initialEntries={["/themes/650000000000000000000001/chat-threads"]}
    >
      <Routes>
        <Route
          path="/themes/:themeId/chat-threads"
          element={<ThemeChatThreads />}
        />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ThemeChatThreads のエラー表示", () => {
  test("k が有効なテーマで拒否された場合は、拒否された理由を表示すること", async () => {
    const reason =
      "このテーマは最小寄与人数が有効なため、個々の意見やチャットの内容を参照する機能は使えません。";
    vi.mocked(apiClient.getChatThreadsByTheme).mockResolvedValue(
      err(new ApiError(ApiErrorType.FORBIDDEN, reason, 403))
    );

    renderPage();

    expect(await screen.findByText(reason)).toBeInTheDocument();
  });

  test("サーバーエラーの場合は、従来どおりの文言を表示すること", async () => {
    vi.mocked(apiClient.getChatThreadsByTheme).mockResolvedValue(
      err(new ApiError(ApiErrorType.SERVER_ERROR, "Internal error", 500))
    );

    renderPage();

    expect(
      await screen.findByText("チャットスレッドの取得に失敗しました。")
    ).toBeInTheDocument();
  });
});
