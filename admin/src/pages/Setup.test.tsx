/**
 * Setup ページのユニットテスト
 *
 * 目的: セットアップ状態に応じたリダイレクトと、
 *       初期管理者作成フォームの動作を検証する。
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { apiClient } from "../services/api/apiClient";
import Setup from "./Setup";

// apiClient のモック
vi.mock("../services/api/apiClient", () => ({
  apiClient: {
    getSetupStatus: vi.fn(),
    initializeAdmin: vi.fn(),
  },
}));

/**
 * テスト用のレンダリングヘルパー
 * MemoryRouter でラップしてルーティングを有効にする
 */
const renderSetup = () => {
  return render(
    <MemoryRouter initialEntries={["/setup"]}>
      <Routes>
        <Route path="/setup" element={<Setup />} />
        <Route path="/login" element={<div>ログインページ</div>} />
      </Routes>
    </MemoryRouter>
  );
};

describe("Setup ページ", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("needsSetup が false の場合", () => {
    test("/login にリダイレクトされること", async () => {
      vi.mocked(apiClient.getSetupStatus).mockResolvedValue({
        isOk: () => true,
        value: { needsSetup: false },
      } as Awaited<ReturnType<typeof apiClient.getSetupStatus>>);

      renderSetup();

      // getByText は要素が見つからない場合に例外をスローするため、これ自体がアサーション
      await waitFor(() => {
        screen.getByText("ログインページ");
      });
    });
  });

  describe("needsSetup が true の場合", () => {
    test("セットアップフォームが表示されること", async () => {
      vi.mocked(apiClient.getSetupStatus).mockResolvedValue({
        isOk: () => true,
        value: { needsSetup: true },
      } as Awaited<ReturnType<typeof apiClient.getSetupStatus>>);

      renderSetup();

      await waitFor(() => {
        screen.getByLabelText(/名前/);
        screen.getByLabelText(/メールアドレス/);
        screen.getByLabelText(/パスワード/);
      });
    });

    test("フォーム送信時に initializeAdmin が正しい引数で呼ばれること", async () => {
      vi.mocked(apiClient.getSetupStatus).mockResolvedValue({
        isOk: () => true,
        value: { needsSetup: true },
      } as Awaited<ReturnType<typeof apiClient.getSetupStatus>>);
      vi.mocked(apiClient.initializeAdmin).mockResolvedValue({
        isOk: () => true,
        value: {
          message: "初期管理者ユーザーが正常に作成されました",
          user: {
            id: "ユーザーID001",
            name: "テスト管理者",
            email: "admin@example.com",
            role: "admin",
          },
        },
      } as Awaited<ReturnType<typeof apiClient.initializeAdmin>>);

      renderSetup();

      await waitFor(() => {
        screen.getByLabelText(/名前/);
      });

      fireEvent.change(screen.getByLabelText(/名前/), {
        target: { value: "テスト管理者" },
      });
      fireEvent.change(screen.getByLabelText(/メールアドレス/), {
        target: { value: "admin@example.com" },
      });
      fireEvent.change(screen.getByLabelText(/パスワード/), {
        target: { value: "安全なパスワード123" },
      });

      fireEvent.click(screen.getByRole("button", { name: /セットアップ/ }));

      await waitFor(() => {
        expect(apiClient.initializeAdmin).toHaveBeenCalledWith({
          name: "テスト管理者",
          email: "admin@example.com",
          password: "安全なパスワード123",
        });
      });
    });

    test("API 成功時に成功メッセージが表示されること", async () => {
      vi.mocked(apiClient.getSetupStatus).mockResolvedValue({
        isOk: () => true,
        value: { needsSetup: true },
      } as Awaited<ReturnType<typeof apiClient.getSetupStatus>>);
      vi.mocked(apiClient.initializeAdmin).mockResolvedValue({
        isOk: () => true,
        value: {
          message: "初期管理者ユーザーが正常に作成されました",
          user: {
            id: "ユーザーID001",
            name: "テスト管理者",
            email: "admin@example.com",
            role: "admin",
          },
        },
      } as Awaited<ReturnType<typeof apiClient.initializeAdmin>>);

      renderSetup();

      await waitFor(() => {
        screen.getByLabelText(/名前/);
      });

      fireEvent.change(screen.getByLabelText(/名前/), {
        target: { value: "テスト管理者" },
      });
      fireEvent.change(screen.getByLabelText(/メールアドレス/), {
        target: { value: "admin@example.com" },
      });
      fireEvent.change(screen.getByLabelText(/パスワード/), {
        target: { value: "安全なパスワード123" },
      });
      fireEvent.click(screen.getByRole("button", { name: /セットアップ/ }));

      await waitFor(() => {
        screen.getByText(/管理者アカウントが正常に作成されました/);
      });
    });

    test("API エラー時にエラーメッセージが表示されること", async () => {
      vi.mocked(apiClient.getSetupStatus).mockResolvedValue({
        isOk: () => true,
        value: { needsSetup: true },
      } as Awaited<ReturnType<typeof apiClient.getSetupStatus>>);
      vi.mocked(apiClient.initializeAdmin).mockResolvedValue({
        isOk: () => false,
        error: { message: "セットアップに失敗しました" },
      } as Awaited<ReturnType<typeof apiClient.initializeAdmin>>);

      renderSetup();

      await waitFor(() => {
        screen.getByLabelText(/名前/);
      });

      fireEvent.change(screen.getByLabelText(/名前/), {
        target: { value: "テスト管理者" },
      });
      fireEvent.change(screen.getByLabelText(/メールアドレス/), {
        target: { value: "admin@example.com" },
      });
      fireEvent.change(screen.getByLabelText(/パスワード/), {
        target: { value: "安全なパスワード123" },
      });
      fireEvent.click(screen.getByRole("button", { name: /セットアップ/ }));

      await waitFor(() => {
        screen.getByText(/セットアップに失敗しました/);
      });
    });
  });
});
