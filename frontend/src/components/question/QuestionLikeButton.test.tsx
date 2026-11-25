/**
 * QuestionLikeButton（重要論点の「気になる」ボタン）のテスト（issue #178）
 *
 * 目的: 参加者が重要論点のページで「気になる」を押せることを検証する。
 *       - 現在の件数と、自分が押したかどうかを表示すること
 *       - 押すと、その重要論点への「気になる」を切り替え、件数と押した状態を更新すること
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

import QuestionLikeButton from "./QuestionLikeButton";

const QUESTION_ID = "650000000000000000000011";

describe("QuestionLikeButton", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.getLikeStatus.mockReset();
    mocks.toggleLike.mockReset();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  /** ボタンを描画し、件数の読み込みが終わるまで待つ */
  const renderButton = async () => {
    await act(async () => {
      root.render(<QuestionLikeButton questionId={QUESTION_ID} />);
    });
    const button = container.querySelector("button");
    if (!button) throw new Error("ボタンが描画されていません");
    return button;
  };

  it("重要論点の現在の件数と、まだ押していないことを表示すること", async () => {
    // 前提: この論点には「気になる」が4件あり、田中さんはまだ押していない
    mocks.getLikeStatus.mockResolvedValue(ok({ liked: false, count: 4 }));

    const button = await renderButton();

    // 検証: 重要論点（question）の状態を、参加者の ID で問い合わせている
    expect(mocks.getLikeStatus).toHaveBeenCalledWith(
      "question",
      QUESTION_ID,
      "participant-tanaka"
    );
    expect(button.textContent).toContain("気になる");
    expect(button.textContent).toContain("4");
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });

  it("押すと「気になる」を付け、件数と押した状態を更新すること", async () => {
    // 前提: 4件の論点に、田中さんが「気になる」を付ける
    mocks.getLikeStatus.mockResolvedValue(ok({ liked: false, count: 4 }));
    mocks.toggleLike.mockResolvedValue(ok({ liked: true, count: 5 }));

    const button = await renderButton();
    await act(async () => {
      button.click();
    });

    // 検証: 重要論点への「気になる」を切り替え、5件・押した状態になる
    expect(mocks.toggleLike).toHaveBeenCalledWith(
      "question",
      QUESTION_ID,
      "participant-tanaka"
    );
    expect(button.textContent).toContain("5");
    expect(button.getAttribute("aria-pressed")).toBe("true");
  });
});
