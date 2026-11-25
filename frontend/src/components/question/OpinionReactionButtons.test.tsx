/**
 * OpinionReactionButtons（他の人の意見への反応ボタン）のテスト（issue #177）
 *
 * 目的: 「私もそう思う」「自分の場合は少し違う」の2つのボタンを表示し、
 *       押したボタンに応じた反応の種類を呼び出し元へ渡すことを検証する。
 *       無効のとき（コメントを受け付けないテーマ）は押せないことも検証する。
 */
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OpinionReactionButtons from "./OpinionReactionButtons";

describe("OpinionReactionButtons", () => {
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

  /** 表示文でボタンを探す */
  const findButton = (label: string): HTMLButtonElement => {
    const button = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === label
    );
    if (!button) throw new Error(`「${label}」ボタンが描画されていません`);
    return button;
  };

  it("「私もそう思う」を押すと agree、「自分の場合は少し違う」を押すと differ を渡すこと", async () => {
    const onReact = vi.fn();
    await act(async () => {
      root.render(<OpinionReactionButtons onReact={onReact} />);
    });

    await act(async () => {
      findButton("私もそう思う").click();
    });
    await act(async () => {
      findButton("自分の場合は少し違う").click();
    });

    expect(onReact.mock.calls).toEqual([["agree"], ["differ"]]);
  });

  it("無効のときは、どちらのボタンも押せないこと", async () => {
    const onReact = vi.fn();
    await act(async () => {
      root.render(<OpinionReactionButtons onReact={onReact} disabled />);
    });

    expect(findButton("私もそう思う").disabled).toBe(true);
    expect(findButton("自分の場合は少し違う").disabled).toBe(true);
  });
});
