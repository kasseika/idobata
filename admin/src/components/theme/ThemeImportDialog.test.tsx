/**
 * ThemeImportDialog コンポーネントのユニットテスト
 *
 * 目的: shadcn/ui Dialog に移行後のアクセシビリティ要件と、
 *       ファイル選択・インポート実行・結果表示の既存機能が
 *       正しく動作することを検証する。
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { describe, expect, test, vi } from "vitest";
import type { ThemeImportStats } from "../../services/api/types";
import ThemeImportDialog from "./ThemeImportDialog";

/** テスト用のデフォルト props */
const defaultProps = {
  open: true,
  onImport: vi.fn(),
  onClose: vi.fn(),
  isLoading: false,
  importStats: null,
};

/** テスト用の有効なエクスポートJSON */
const validExportData = JSON.stringify({
  theme: { title: "民主主義テーマ" },
  chatThreads: [{ id: "1" }, { id: "2" }],
  problems: [{ id: "3" }],
});

/** テスト用のインポート成功統計情報 */
const sampleImportStats: ThemeImportStats = {
  themeTitle: "民主主義テーマ",
  themeId: "theme-001",
  counts: {
    chatThreads: 2,
    importedItems: 0,
    problems: 1,
    solutions: 0,
    sharpQuestions: 0,
    pipelineConfigChangeLogs: 0,
    policyDrafts: 0,
    digestDrafts: 0,
    debateAnalyses: 0,
    questionVisualReports: 0,
    questionLinks: 0,
    reportExamples: 0,
    likes: 0,
  },
};

describe("ThemeImportDialog", () => {
  describe("アクセシビリティ", () => {
    test("role='dialog' が設定されていること", () => {
      // Radix Dialog は自動で role="dialog" を付与する
      render(<ThemeImportDialog {...defaultProps} />);
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    test("Escapeキーで onClose が呼ばれること", async () => {
      const onClose = vi.fn();
      render(<ThemeImportDialog {...defaultProps} onClose={onClose} />);

      // ダイアログにフォーカスがあることを確認してからEscapeキーを押す
      await userEvent.keyboard("{Escape}");

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    test("isLoading 中は Escapeキーでダイアログが閉じないこと", async () => {
      const onClose = vi.fn();
      render(
        <ThemeImportDialog
          {...defaultProps}
          onClose={onClose}
          isLoading={true}
        />
      );

      await userEvent.keyboard("{Escape}");

      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe("ファイル選択・プレビュー", () => {
    test("初期状態でファイル選択UIと説明文が表示されること", () => {
      render(<ThemeImportDialog {...defaultProps} />);

      // ダイアログタイトルが表示されている
      expect(screen.getByText("テーマをインポート")).toBeInTheDocument();
      // ファイル選択インプットが存在する
      expect(
        screen.getByRole("button", { name: /インポート実行/ })
      ).toBeDisabled();
    });

    test("有効なJSONファイル選択後にプレビューが表示されること", async () => {
      render(<ThemeImportDialog {...defaultProps} />);

      // JSONファイルを選択する
      const file = new File([validExportData], "テーマエクスポート.json", {
        type: "application/json",
      });
      const input = screen
        .getByRole("button", { name: /インポート実行/ })
        .closest("div")
        ?.querySelector("input[type='file']") as HTMLInputElement;

      // input要素を直接取得
      const fileInput = document.querySelector(
        "input[type='file']"
      ) as HTMLInputElement;
      fireEvent.change(fileInput, { target: { files: [file] } });

      // プレビューにテーマタイトルが表示されるのを待つ
      await waitFor(() => {
        expect(screen.getByText(/民主主義テーマ/)).toBeInTheDocument();
      });

      // データ件数が表示される
      await waitFor(() => {
        expect(screen.getByText(/チャットスレッド/)).toBeInTheDocument();
        expect(screen.getByText(/2件/)).toBeInTheDocument();
      });
    });

    test("不正なJSONファイル選択時にエラーメッセージが表示されること", async () => {
      render(<ThemeImportDialog {...defaultProps} />);

      // 不正なJSONファイルを選択する
      const file = new File(["これはJSONではありません"], "invalid.json", {
        type: "application/json",
      });
      const fileInput = document.querySelector(
        "input[type='file']"
      ) as HTMLInputElement;
      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        expect(
          screen.getByText(/JSONファイルの解析に失敗しました/)
        ).toBeInTheDocument();
      });
    });
  });

  describe("インポート実行", () => {
    test("ファイル未選択時はインポートボタンが無効であること", () => {
      render(<ThemeImportDialog {...defaultProps} />);

      expect(
        screen.getByRole("button", { name: /インポート実行/ })
      ).toBeDisabled();
    });

    test("インポートボタンクリックで onImport が呼ばれること", async () => {
      const onImport = vi.fn().mockResolvedValue(undefined);
      render(<ThemeImportDialog {...defaultProps} onImport={onImport} />);

      // ファイルを選択してプレビューを表示させる
      const file = new File([validExportData], "テーマエクスポート.json", {
        type: "application/json",
      });
      const fileInput = document.querySelector(
        "input[type='file']"
      ) as HTMLInputElement;
      fireEvent.change(fileInput, { target: { files: [file] } });

      // インポートボタンが有効になるのを待つ
      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /インポート実行/ })
        ).not.toBeDisabled();
      });

      // インポートボタンをクリック
      fireEvent.click(screen.getByRole("button", { name: /インポート実行/ }));

      expect(onImport).toHaveBeenCalledTimes(1);
    });

    test("isLoading 中はボタンに「インポート中...」と表示されること", async () => {
      render(<ThemeImportDialog {...defaultProps} isLoading={true} />);

      expect(
        screen.getByRole("button", { name: /インポート中\.\.\./ })
      ).toBeInTheDocument();
    });

    test("isLoading 中はキャンセルボタンが無効であること", () => {
      render(<ThemeImportDialog {...defaultProps} isLoading={true} />);

      expect(screen.getByRole("button", { name: /キャンセル/ })).toBeDisabled();
    });
  });

  describe("インポート結果表示", () => {
    test("importStats が渡された場合に結果が表示されること", () => {
      render(
        <ThemeImportDialog {...defaultProps} importStats={sampleImportStats} />
      );

      // 完了メッセージが表示される
      expect(screen.getByText(/インポートが完了しました/)).toBeInTheDocument();
      // テーマタイトルが表示される
      expect(screen.getByText(/民主主義テーマ/)).toBeInTheDocument();
    });

    test("結果表示の閉じるボタンで onClose が呼ばれること", () => {
      const onClose = vi.fn();
      render(
        <ThemeImportDialog
          {...defaultProps}
          onClose={onClose}
          importStats={sampleImportStats}
        />
      );

      fireEvent.click(screen.getByRole("button", { name: /閉じる/ }));

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("open prop", () => {
    test("open=false のときダイアログが表示されないこと", () => {
      render(<ThemeImportDialog {...defaultProps} open={false} />);

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
