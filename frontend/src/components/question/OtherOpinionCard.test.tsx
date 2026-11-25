/**
 * OtherOpinionCard（論点ページの「ほかの人の意見」カード）のテスト（issue #177）
 *
 * 目的: 反応の受け取り先（onReact）を渡したときだけ反応ボタンを表示し、
 *       押した反応をそのまま渡すことを検証する。
 */
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OtherOpinionCard from "./OtherOpinionCard";

describe("OtherOpinionCard", () => {
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

  const baseProps = {
    text: "評価面談が年1回しかなく、日々の成果が評価に反映されにくい。",
    userName: "ユーザー1",
    type: "課題" as const,
    userIconColor: "red" as const,
  };

  it("onReact を渡すと反応ボタンを表示し、押した反応を渡すこと", async () => {
    const onReact = vi.fn();
    await act(async () => {
      root.render(<OtherOpinionCard {...baseProps} onReact={onReact} />);
    });
    const button = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "自分の場合は少し違う"
    );
    if (!button) throw new Error("反応ボタンが描画されていません");

    await act(async () => {
      button.click();
    });

    expect(onReact).toHaveBeenCalledWith("differ");
  });

  it("onReact を渡さないと、反応ボタンを表示しないこと", async () => {
    await act(async () => {
      root.render(<OtherOpinionCard {...baseProps} />);
    });

    expect(container.querySelectorAll("button")).toHaveLength(0);
  });
});
