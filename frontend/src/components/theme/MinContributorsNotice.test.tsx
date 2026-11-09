/**
 * MinContributorsNotice のテスト
 *
 * 目的: 最小寄与人数 k が有効なテーマの詳細ページで、「寄せられた意見」の代わりに表示する
 *       お知らせの内容を検証する（issue #146）。
 *       - 個々の意見を表示しない理由と、k 人以上が関わった論点だけを表示することを伝えること
 *       - k を満たさず非表示にした論点の件数を伝えること（0件のときは伝えないこと）
 */

import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import MinContributorsNotice from "./MinContributorsNotice";

describe("MinContributorsNotice", () => {
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

  it("個々の意見を表示しないことと、5人以上が関わった論点だけを表示することを伝えること", () => {
    act(() => {
      root.render(
        <MinContributorsNotice minContributors={5} hiddenQuestionCount={0} />
      );
    });

    expect(container.textContent).toContain("個々の意見は表示しません");
    expect(container.textContent).toContain("5人以上");
  });

  it("非表示にした論点が2件あるとき、その件数を伝えること", () => {
    act(() => {
      root.render(
        <MinContributorsNotice minContributors={5} hiddenQuestionCount={2} />
      );
    });

    expect(container.textContent).toContain("表示していない論点が2件あります");
  });

  it("非表示にした論点が0件のとき、件数の文を表示しないこと", () => {
    act(() => {
      root.render(
        <MinContributorsNotice minContributors={5} hiddenQuestionCount={0} />
      );
    });

    expect(container.textContent).not.toContain("表示していない論点");
  });
});
