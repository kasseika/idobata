/**
 * ThemeDetailTemplate（テーマ詳細ページの表示）のテスト（issue #177）
 *
 * 目的: 「寄せられた意見」の課題・解決策のカードで反応を押すと、チャットを開き、
 *       その意見（種類・ID・反応）と意見の文をページへ渡すことを検証する。
 *       コメントを受け付けないテーマ（disabled）では、反応ボタンを押せないことも検証する。
 * 前提: チャット（FloatingChat）は、open の呼び出しだけを観測できる部品に置き換える。
 *       処理の透明性の欄など、この検証に関係しない部品は空の部品に置き換える。
 */
import { act, forwardRef, useImperativeHandle } from "react";
import { type Root, createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ openChat: vi.fn() }));

vi.mock("../chat", () => ({
  FloatingChat: forwardRef((_props, ref) => {
    useImperativeHandle(ref, () => ({ open: mocks.openChat }));
    return null;
  }),
}));
vi.mock("../transparency/PipelineTransparency", () => ({
  PipelineTransparency: () => null,
}));
vi.mock("../common/BreadcrumbView", () => ({ default: () => null }));

import ThemeDetailTemplate from "./ThemeDetailTemplate";

const issues = [
  {
    id: "650000000000000000000201",
    text: "菓子類の価格が高いと、日常的な購買をためらってしまう。",
  },
];
const solutions = [
  { id: "650000000000000000000301", text: "小容量の安価な商品を用意する。" },
];

describe("ThemeDetailTemplate の寄せられた意見", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.openChat.mockReset();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  /** テーマ詳細を描画する（重要論点がないため「寄せられた意見」を表示する） */
  const renderTemplate = async (
    props: Partial<Parameters<typeof ThemeDetailTemplate>[0]>
  ) => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <ThemeDetailTemplate
            theme={{
              _id: "650000000000000000000001",
              title: "お菓子の好み",
              description: "",
            }}
            keyQuestions={[]}
            issues={issues}
            solutions={solutions}
            {...props}
          />
        </MemoryRouter>
      );
    });
  };

  /** 表示文でボタンを探す（最初に見つかったもの） */
  const findButton = (label: string): HTMLButtonElement => {
    const button = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === label
    );
    if (!button) throw new Error(`「${label}」ボタンが描画されていません`);
    return button;
  };

  it("課題のカードで「自分の場合は少し違う」を押すと、チャットを開き、起点と意見の文を渡すこと", async () => {
    const onReactToOpinion = vi.fn();
    await renderTemplate({ onReactToOpinion });

    await act(async () => {
      findButton("自分の場合は少し違う").click();
    });

    expect(mocks.openChat).toHaveBeenCalled();
    expect(onReactToOpinion).toHaveBeenCalledWith(
      {
        type: "problem",
        id: "650000000000000000000201",
        reaction: "differ",
      },
      "菓子類の価格が高いと、日常的な購買をためらってしまう。"
    );
  });

  it("解決策のタブのカードでは、解決策を起点として渡すこと", async () => {
    const onReactToOpinion = vi.fn();
    await renderTemplate({ onReactToOpinion });
    await act(async () => {
      findButton("解決策 (1)").click();
    });

    await act(async () => {
      findButton("私もそう思う").click();
    });

    expect(onReactToOpinion).toHaveBeenCalledWith(
      {
        type: "solution",
        id: "650000000000000000000301",
        reaction: "agree",
      },
      "小容量の安価な商品を用意する。"
    );
  });

  it("コメントを受け付けないテーマでは、反応ボタンを押せないこと", async () => {
    await renderTemplate({ onReactToOpinion: vi.fn(), disabled: true });

    expect(findButton("私もそう思う").disabled).toBe(true);
    expect(findButton("自分の場合は少し違う").disabled).toBe(true);
  });
});
