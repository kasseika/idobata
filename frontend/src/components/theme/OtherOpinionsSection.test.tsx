/**
 * OtherOpinionsSection のテスト
 *
 * 目的: テーマ詳細ページで、重要論点に拾われなかった意見の要約（「その他の意見」）を
 *       表示する部品の内容を検証する（issue #147）。
 *       - 要約が1件以上あるとき、見出し「その他の意見」と各要約を表示すること
 *       - 要約が0件のとき（未生成、または k を満たすまとまりが無いとき）は何も表示しないこと
 */

import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import OtherOpinionsSection from "./OtherOpinionsSection";

describe("OtherOpinionsSection", () => {
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

  it("要約が2件あるとき、見出しと2件の要約を表示すること", () => {
    act(() => {
      root.render(
        <OtherOpinionsSection
          summaries={[
            "会議の資料が直前に届き、準備の時間が足りないという意見があります。",
            "社内の問い合わせ窓口が分かりにくいという意見があります。",
          ]}
        />
      );
    });

    expect(container.textContent).toContain("その他の意見（2件）");
    // 各要約が、一覧の項目として表示されること
    const items = Array.from(container.querySelectorAll("li")).map(
      (li) => li.textContent
    );
    expect(items).toEqual([
      "会議の資料が直前に届き、準備の時間が足りないという意見があります。",
      "社内の問い合わせ窓口が分かりにくいという意見があります。",
    ]);
  });

  it("要約が0件のとき、何も表示しないこと", () => {
    act(() => {
      root.render(<OtherOpinionsSection summaries={[]} />);
    });

    expect(container.textContent).toBe("");
  });
});
