/**
 * ThemeList ページのテスト（エクスポートの失敗表示）
 *
 * 目的: テーマのエクスポートが拒否された（403）場合に、拒否された理由を表示することを検証する（issue #146）。
 *       最小寄与人数 k が有効なテーマは、チャットの原文を含むためエクスポートできない。
 *       それ以外の失敗では、従来どおりの文言を表示することも確かめる。
 * 前提: apiClient と window.alert はモックする。
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { err, ok } from "neverthrow";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { apiClient } from "../services/api/apiClient";
import { ApiError, ApiErrorType } from "../services/api/apiError";
import type { Theme } from "../services/api/types";
import ThemeList from "./ThemeList";

vi.mock("../services/api/apiClient", () => ({
  apiClient: { getAllThemes: vi.fn(), exportTheme: vi.fn() },
}));

const trainingTheme: Theme = {
  _id: "650000000000000000000001",
  title: "新人研修 2026 春",
  status: "active",
  minContributors: 5,
};

/** テーマ一覧からエクスポートを実行する */
const exportFirstTheme = async () => {
  render(
    <MemoryRouter>
      <ThemeList />
    </MemoryRouter>
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "エクスポート" })
  );
  const dialog = await screen.findByRole("dialog");
  const confirmButtons = Array.from(dialog.querySelectorAll("button")).filter(
    (button) => button.textContent?.includes("エクスポート")
  );
  await userEvent.click(confirmButtons[confirmButtons.length - 1]);
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiClient.getAllThemes).mockResolvedValue(ok([trainingTheme]));
  vi.spyOn(window, "alert").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ThemeList のエクスポートの失敗表示", () => {
  test("k が有効なテーマで拒否された場合は、拒否された理由を表示すること", async () => {
    const reason =
      "このテーマは最小寄与人数が有効なため、個々の意見やチャットの内容を参照する機能は使えません。";
    vi.mocked(apiClient.exportTheme).mockResolvedValue(
      err(new ApiError(ApiErrorType.FORBIDDEN, reason, 403))
    );

    await exportFirstTheme();

    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining(reason));
  });

  test("サーバーエラーの場合は、従来どおりの文言を表示すること", async () => {
    vi.mocked(apiClient.exportTheme).mockResolvedValue(
      err(new ApiError(ApiErrorType.SERVER_ERROR, "Internal error", 500))
    );

    await exportFirstTheme();

    expect(window.alert).toHaveBeenCalledWith(
      "テーマのエクスポートに失敗しました。"
    );
  });
});
