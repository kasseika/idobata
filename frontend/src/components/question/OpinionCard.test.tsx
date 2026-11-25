/**
 * OpinionCard（課題・解決策のカード）のテスト（issue #179）
 *
 * 目的: 課題・解決策の「気になる」ボタンにマウスを乗せたとき、文字が背景に埋もれないことを検証する。
 *       outline のボタンは既定でマウスを乗せると背景を accent（緑）にするが、
 *       「気になる」ボタンは文字色を青系にするため、背景は変えないようにする。
 * 前提: apiClient と認証（useAuth）はモックする。結果は neverthrow の Result で返す。
 */
import { ok } from "neverthrow";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getLikeStatus: vi.fn(),
  toggleLike: vi.fn(),
}));

vi.mock("../../services/api/apiClient", () => ({
  apiClient: {
    getLikeStatus: mocks.getLikeStatus,
    toggleLike: mocks.toggleLike,
  },
}));
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "participant-tanaka" } }),
}));

import OpinionCard from "./OpinionCard";

describe("OpinionCard", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.getLikeStatus.mockReset();
    mocks.getLikeStatus.mockResolvedValue(ok({ liked: false, count: 2 }));
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("「気になる」ボタンにマウスを乗せても背景を accent に変えないこと", async () => {
    // 前提: 「通学路の歩道が狭い」という課題のカードを表示する
    await act(async () => {
      root.render(
        <OpinionCard
          type="課題点"
          text="通学路の歩道が狭い"
          relevance={80}
          id="650000000000000000000021"
        />
      );
    });
    const button = container.querySelector("button");
    if (!button) throw new Error("「気になる」ボタンが描画されていません");

    // 検証: 背景は変えずに文字色だけ変える
    expect(button.textContent).toContain("気になる");
    expect(button.className).toContain("hover:bg-background");
    expect(button.className).not.toContain("hover:bg-accent");
  });
});
