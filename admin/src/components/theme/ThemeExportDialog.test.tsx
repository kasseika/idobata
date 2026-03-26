/**
 * ThemeExportDialog コンポーネントのユニットテスト
 *
 * 目的: テーマエクスポート確認ダイアログの開閉動作、チェックボックスによる
 *       includeLikes オプション選択、エクスポート実行コールバックの呼び出しを検証する。
 */
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { describe, expect, test, vi } from "vitest";
import ThemeExportDialog from "./ThemeExportDialog";

/** テスト用のデフォルト props */
const defaultProps = {
  open: true,
  onExport: vi.fn(),
  onClose: vi.fn(),
  isLoading: false,
};

describe("ThemeExportDialog", () => {
  describe("open/close 動作", () => {
    test("open=true のとき role='dialog' が表示されること", () => {
      render(<ThemeExportDialog {...defaultProps} />);

      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    test("open=false のときダイアログが表示されないこと", () => {
      render(<ThemeExportDialog {...defaultProps} open={false} />);

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  describe("Escape キー / キャンセルボタン", () => {
    test("Escapeキーで onClose が呼ばれること", async () => {
      const onClose = vi.fn();
      render(<ThemeExportDialog {...defaultProps} onClose={onClose} />);

      await userEvent.keyboard("{Escape}");

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    test("isLoading 中は Escapeキーで onClose が呼ばれないこと", async () => {
      const onClose = vi.fn();
      render(
        <ThemeExportDialog
          {...defaultProps}
          onClose={onClose}
          isLoading={true}
        />
      );

      await userEvent.keyboard("{Escape}");

      expect(onClose).not.toHaveBeenCalled();
    });

    test("キャンセルボタンで onClose が呼ばれること", () => {
      const onClose = vi.fn();
      render(<ThemeExportDialog {...defaultProps} onClose={onClose} />);

      fireEvent.click(screen.getByRole("button", { name: /キャンセル/ }));

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    test("isLoading 中はキャンセルボタンが無効であること", () => {
      render(<ThemeExportDialog {...defaultProps} isLoading={true} />);

      expect(screen.getByRole("button", { name: /キャンセル/ })).toBeDisabled();
    });
  });

  describe("チェックボックス", () => {
    test("「いいねデータを含める」ラベルのチェックボックスが表示されること", () => {
      render(<ThemeExportDialog {...defaultProps} />);

      expect(
        screen.getByRole("checkbox", { name: /いいねデータを含める/ })
      ).toBeInTheDocument();
    });

    test("チェックボックスはデフォルトで未チェックであること", () => {
      render(<ThemeExportDialog {...defaultProps} />);

      expect(
        screen.getByRole("checkbox", { name: /いいねデータを含める/ })
      ).not.toBeChecked();
    });

    test("チェックボックスをクリックするとチェック状態に切り替わること", async () => {
      render(<ThemeExportDialog {...defaultProps} />);

      const checkbox = screen.getByRole("checkbox", {
        name: /いいねデータを含める/,
      });
      await userEvent.click(checkbox);

      expect(checkbox).toBeChecked();
    });
  });

  describe("エクスポート実行", () => {
    test("チェックなしでエクスポートボタンをクリックすると onExport(false) が呼ばれること", () => {
      const onExport = vi.fn();
      render(<ThemeExportDialog {...defaultProps} onExport={onExport} />);

      fireEvent.click(screen.getByRole("button", { name: /エクスポート実行/ }));

      expect(onExport).toHaveBeenCalledWith(false);
    });

    test("チェックありでエクスポートボタンをクリックすると onExport(true) が呼ばれること", async () => {
      const onExport = vi.fn();
      render(<ThemeExportDialog {...defaultProps} onExport={onExport} />);

      // チェックボックスをオンにしてからエクスポート
      await userEvent.click(
        screen.getByRole("checkbox", { name: /いいねデータを含める/ })
      );
      fireEvent.click(screen.getByRole("button", { name: /エクスポート実行/ }));

      expect(onExport).toHaveBeenCalledWith(true);
    });

    test("isLoading 中はエクスポートボタンが「エクスポート中...」と表示されて無効であること", () => {
      render(<ThemeExportDialog {...defaultProps} isLoading={true} />);

      const button = screen.getByRole("button", {
        name: /エクスポート中\.\.\./,
      });
      expect(button).toBeInTheDocument();
      expect(button).toBeDisabled();
    });
  });
});
