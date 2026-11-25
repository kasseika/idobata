/**
 * CommentCard（テーマ詳細ページの「寄せられた意見」のカード）のテスト（issue #177）
 *
 * 目的: 反応の受け取り先（onReact）を渡したときだけ「私もそう思う」「自分の場合は少し違う」のボタンを表示し、
 *       押した反応をそのまま渡すことを検証する。無効のときは押せないことも検証する。
 */
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CommentCard from "./CommentCard";

describe("CommentCard", () => {
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

  const text =
    "菓子類を購入する際、価格が高いと日常的な購買をためらってしまう。";

  it("onReact を渡すと反応ボタンを表示し、押した反応を渡すこと", async () => {
    const onReact = vi.fn();
    await act(async () => {
      root.render(<CommentCard text={text} type="issue" onReact={onReact} />);
    });
    const button = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "私もそう思う"
    );
    if (!button) throw new Error("反応ボタンが描画されていません");

    await act(async () => {
      button.click();
    });

    expect(onReact).toHaveBeenCalledWith("agree");
  });

  it("reactionDisabled のときは、反応ボタンを押せないこと", async () => {
    await act(async () => {
      root.render(
        <CommentCard
          text={text}
          type="solution"
          onReact={vi.fn()}
          reactionDisabled
        />
      );
    });

    const buttons = [...container.querySelectorAll("button")];
    expect(buttons).toHaveLength(2);
    expect(buttons.every((b) => b.disabled)).toBe(true);
  });

  it("onReact を渡さないと、反応ボタンを表示しないこと", async () => {
    await act(async () => {
      root.render(<CommentCard text={text} type="issue" />);
    });

    expect(container.querySelectorAll("button")).toHaveLength(0);
  });
});
