/**
 * FloatingChat の open（外からチャットを開く操作）のテスト（issue #177）
 *
 * 目的: スマートフォン幅（チャットが閉じている状態）で、ref の open を呼ぶとチャットが開くことを検証する。
 *       他の人の意見の「私もそう思う」等を押したとき、始まった対話をすぐ見られるようにするため。
 * 前提: 画面幅の判定（useMediaQuery）はスマートフォン幅としてモックする。
 *       チャット本体（ChatSheet）は、描画されたかどうかだけを観測できる部品に置き換える。
 */
import { act, createRef } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../hooks/useMediaQuery", () => ({
  useMediaQuery: () => false,
}));
vi.mock("./ChatSheet", () => ({
  ChatSheet: () => <div data-testid="chat-sheet">チャット</div>,
}));

import { FloatingChat, type FloatingChatRef } from "./FloatingChat";

describe("FloatingChat の open", () => {
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

  it("スマートフォン幅で閉じているチャットを、open で開くこと", async () => {
    const ref = createRef<FloatingChatRef>();
    await act(async () => {
      root.render(<FloatingChat ref={ref} />);
    });
    // 前提: 最初はチャットが閉じている
    expect(container.querySelector('[data-testid="chat-sheet"]')).toBeNull();

    await act(async () => {
      ref.current?.open();
    });

    expect(
      container.querySelector('[data-testid="chat-sheet"]')
    ).not.toBeNull();
  });
});
