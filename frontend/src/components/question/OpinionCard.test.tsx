/**
 * OpinionCard（コメント画面の課題・解決策のカード）のテスト（issue #177）
 *
 * 目的: 課題・解決策への反応は「私もそう思う」「自分の場合は少し違う」で受け持ち、
 *       「気になる」ボタンは表示しないことを検証する。「気になる」は重要論点だけに付ける（issue #178）。
 *       押した反応をそのまま呼び出し元へ渡すことも検証する。
 */
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OpinionCard from "./OpinionCard";

describe("OpinionCard", () => {
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

  it("反応ボタンを表示し、「気になる」ボタンは表示しないこと", async () => {
    // 前提: 「通学路の歩道が狭い」という課題のカードを表示する
    await act(async () => {
      root.render(
        <OpinionCard
          type="課題点"
          text="通学路の歩道が狭い"
          relevance={80}
          onReact={vi.fn()}
        />
      );
    });
    const labels = [...container.querySelectorAll("button")].map(
      (b) => b.textContent
    );

    expect(labels).toEqual(["私もそう思う", "自分の場合は少し違う"]);
    expect(container.textContent).not.toContain("気になる");
  });

  it("「私もそう思う」を押すと、agree を渡すこと", async () => {
    const onReact = vi.fn();
    await act(async () => {
      root.render(
        <OpinionCard
          type="解決策"
          text="通学路に見守りボランティアを配置する"
          relevance={75}
          onReact={onReact}
        />
      );
    });
    const button = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "私もそう思う"
    );
    if (!button) throw new Error("「私もそう思う」ボタンが描画されていません");

    await act(async () => {
      button.click();
    });

    expect(onReact).toHaveBeenCalledWith("agree");
  });
});
