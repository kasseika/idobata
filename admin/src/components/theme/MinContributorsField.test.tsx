/**
 * MinContributorsField コンポーネントのユニットテスト
 *
 * 目的: テーマ編集フォームの「最小寄与人数 k」入力欄の振る舞いを検証する（issue #146）。
 *       - 有効化のチェックボックスで、推奨値 5 の設定と無効化（null）を切り替えられること
 *       - 人数を入力すると、その値が親に通知されること
 *       - draft 以外（ロック中）は操作できず、理由が表示されること
 *       - 不正な値（2未満・小数）のときにエラーが表示されること
 */
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import MinContributorsField from "./MinContributorsField";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MinContributorsField", () => {
  describe("有効・無効の切り替え", () => {
    test("値が null のとき、チェックボックスは未選択で、人数の入力欄は表示されないこと", () => {
      render(
        <MinContributorsField
          value={null}
          onChange={vi.fn()}
          isLocked={false}
        />
      );

      expect(
        screen.getByRole("checkbox", { name: /最小寄与人数を有効にする/ })
      ).not.toBeChecked();
      expect(screen.queryByLabelText("最小寄与人数")).not.toBeInTheDocument();
    });

    test("チェックボックスを選択すると、推奨値の 5 が通知されること", async () => {
      const onChange = vi.fn();
      render(
        <MinContributorsField
          value={null}
          onChange={onChange}
          isLocked={false}
        />
      );

      await userEvent.click(
        screen.getByRole("checkbox", { name: /最小寄与人数を有効にする/ })
      );

      expect(onChange).toHaveBeenCalledWith(5);
    });

    test("有効なときにチェックを外すと、null（無効）が通知されること", async () => {
      const onChange = vi.fn();
      render(
        <MinContributorsField value={5} onChange={onChange} isLocked={false} />
      );

      await userEvent.click(
        screen.getByRole("checkbox", { name: /最小寄与人数を有効にする/ })
      );

      expect(onChange).toHaveBeenCalledWith(null);
    });
  });

  describe("人数の入力", () => {
    test("人数を 7 に変更すると、7 が通知されること", () => {
      const onChange = vi.fn();
      render(
        <MinContributorsField value={5} onChange={onChange} isLocked={false} />
      );

      fireEvent.change(screen.getByLabelText("最小寄与人数"), {
        target: { value: "7" },
      });

      expect(onChange).toHaveBeenCalledWith(7);
    });

    test.each([1, 2.5])(
      "値が %s のとき、エラーメッセージが表示されること",
      (value) => {
        render(
          <MinContributorsField
            value={value}
            onChange={vi.fn()}
            isLocked={false}
          />
        );

        expect(screen.getByRole("alert")).toHaveTextContent(
          "2 以上の整数を入力してください"
        );
      }
    );

    test("値が 5 のとき、エラーメッセージは表示されないこと", () => {
      render(
        <MinContributorsField value={5} onChange={vi.fn()} isLocked={false} />
      );

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  describe("ロック中（draft 以外）", () => {
    test("チェックボックスと人数の入力欄が操作できず、draft の間しか設定できない旨が表示されること", () => {
      render(<MinContributorsField value={5} onChange={vi.fn()} isLocked />);

      expect(
        screen.getByRole("checkbox", { name: /最小寄与人数を有効にする/ })
      ).toBeDisabled();
      expect(screen.getByLabelText("最小寄与人数")).toBeDisabled();
      expect(
        screen.getByText(/下書きの間だけ設定できます/)
      ).toBeInTheDocument();
    });
  });
});
