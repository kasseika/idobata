/**
 * ExtendedChatHistory のテスト
 *
 * 目的: チャットの「登録しました」通知が、AI との会話を邪魔しないように表示されることを検証する。
 *       - 全文（detail）を持つ通知は、短い1行だけを表示し、全文は開いたときに読めること
 *       - 全文を持たない通知（「チャットを開始しました」等）は、本文だけを表示すること
 *       - 通知を開いたときは、開いた全文が見える位置までスクロールすること
 * 前提: jsdom には scrollIntoView が無いため、テストの中でモック関数に差し替える。
 */

import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SystemNotification } from "../../../types";
import ExtendedChatHistory from "./ExtendedChatHistory";

describe("ExtendedChatHistory の通知", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    // jsdom は scrollIntoView を実装していないため、呼び出しを記録するモック関数にする
    Element.prototype.scrollIntoView = vi.fn();
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

  it("全文を持つ通知は、短い1行を見出しにし、全文を開いて読めるようにすること", () => {
    const fullStatement =
      "会議の議題を前日までに共有する。この案は会議の準備不足が話題になったときに出た。";

    act(() => {
      root.render(
        <ExtendedChatHistory
          messages={[
            new SystemNotification(
              "解決策「会議の議題を前日までに共有する…」を登録しました",
              new Date(),
              false,
              undefined,
              fullStatement
            ),
          ]}
        />
      );
    });

    // 見出し（閉じた状態で見える1行）は短い文面であること
    const summary = container.querySelector("details > summary");
    expect(summary?.textContent).toBe(
      "解決策「会議の議題を前日までに共有する…」を登録しました"
    );
    // 全文は、閉じた状態では隠れる details の中身にあること
    const details = container.querySelector("details");
    expect(details?.open).toBe(false);
    expect(details?.textContent).toContain(fullStatement);

    // 見出しを押すと全文が開くこと
    act(() => {
      summary?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(details?.open).toBe(true);
  });

  it("全文を持つ通知の見出しには、押すと開けることを示す目印を表示すること", () => {
    // 前提: summary に display を指定すると、ブラウザ標準の「▶」の目印は表示されなくなるため、
    //       代わりの目印を見出しの中に置く必要がある
    act(() => {
      root.render(
        <ExtendedChatHistory
          messages={[
            new SystemNotification(
              "課題「定例会議が長引いて結論が出ない」を登録しました",
              new Date(),
              false,
              undefined,
              "定例会議が長引いて結論が出ない"
            ),
          ]}
        />
      );
    });

    const indicator = container.querySelector(
      "details > summary [data-testid='disclosure-indicator']"
    );
    expect(indicator).not.toBeNull();
  });

  it("全文を持たない通知は、開閉できる形にせず本文だけを表示すること", () => {
    act(() => {
      root.render(
        <ExtendedChatHistory
          messages={[new SystemNotification("チャットを開始しました")]}
        />
      );
    });

    expect(container.querySelector("details")).toBeNull();
    expect(container.textContent).toContain("チャットを開始しました");
  });

  it("通知を開いたときは、開いた全文が見える位置までスクロールすること", async () => {
    act(() => {
      root.render(
        <ExtendedChatHistory
          messages={[
            new SystemNotification(
              "課題「定例会議が長引いて結論が出ない」を登録しました",
              new Date(),
              false,
              undefined,
              "定例会議が長引いて結論が出ない。会議の進め方の話題で出た。"
            ),
          ]}
        />
      );
    });
    const details = container.querySelector("details");
    const scrollIntoView = vi.mocked(Element.prototype.scrollIntoView);
    // 前提: 最初の描画で、チャットの末尾へのスクロールが呼ばれている
    scrollIntoView.mockClear();

    // 見出しを押して開く。toggle イベントは非同期に届くため、届くまで待つ
    await act(async () => {
      details
        ?.querySelector("summary")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // 開いた通知（details 要素）が見える位置までスクロールしたこと
    const scrolledElements = scrollIntoView.mock.contexts;
    expect(scrolledElements).toContain(details);
  });

  it("通知を閉じたときは、スクロールしないこと", async () => {
    act(() => {
      root.render(
        <ExtendedChatHistory
          messages={[
            new SystemNotification(
              "課題「定例会議が長引いて結論が出ない」を登録しました",
              new Date(),
              false,
              undefined,
              "定例会議が長引いて結論が出ない。会議の進め方の話題で出た。"
            ),
          ]}
        />
      );
    });
    const details = container.querySelector("details");
    const summary = details?.querySelector("summary");
    const scrollIntoView = vi.mocked(Element.prototype.scrollIntoView);

    // 一度開いてから、スクロールの記録を消す
    await act(async () => {
      summary?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    scrollIntoView.mockClear();

    // 閉じる
    await act(async () => {
      summary?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(details?.open).toBe(false);
    expect(scrollIntoView.mock.contexts).not.toContain(details);
  });
});
