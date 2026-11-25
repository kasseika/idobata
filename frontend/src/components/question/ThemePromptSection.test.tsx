/**
 * ThemePromptSection（重要論点のページの見出し部分）のテスト
 *
 * 目的: 重要論点のページで、重要論点への「気になる」ボタンを表示することを検証する（issue #178）。
 *       重要論点の ID を渡さないときは、ボタンを表示しないことも確かめる。
 * 前提: 「気になる」の状態を取得する apiClient と、認証（useAuth）はモックする。
 */
import { ok } from "neverthrow";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../services/api/apiClient", () => ({
  apiClient: {
    getLikeStatus: vi.fn(async () => ok({ liked: false, count: 2 })),
    toggleLike: vi.fn(),
  },
}));
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "participant-tanaka" } }),
}));

import ThemePromptSection from "./ThemePromptSection";

describe("ThemePromptSection", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  /** 「気になる」と書かれたボタンを探す */
  const findLikeButton = () =>
    Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("気になる")
    );

  it("重要論点の ID を渡すと、「気になる」ボタンを件数つきで表示すること", async () => {
    await act(async () => {
      root.render(
        <ThemePromptSection
          themeTitle="会議の時間"
          themeDescription="定例会議の時間をどう短くするか"
          questionId="650000000000000000000011"
        />
      );
    });

    const likeButton = findLikeButton();
    expect(likeButton).toBeDefined();
    expect(likeButton?.textContent).toContain("2");
  });

  it("重要論点の ID を渡さないときは、「気になる」ボタンを表示しないこと", async () => {
    await act(async () => {
      root.render(
        <ThemePromptSection
          themeTitle="会議の時間"
          themeDescription="定例会議の時間をどう短くするか"
        />
      );
    });

    expect(findLikeButton()).toBeUndefined();
  });
});
