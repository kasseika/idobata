/**
 * Login ページのユニットテスト
 *
 * 目的: セットアップ未完了時に /setup へのリダイレクトが行われることと、
 *       セットアップ済みの場合にログインフォームが表示されることを検証する。
 */
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, test, vi } from "vitest";
import { apiClient } from "../services/api/apiClient";
import Login from "./Login";

// apiClient のモック
vi.mock("../services/api/apiClient", () => ({
  apiClient: {
    getSetupStatus: vi.fn(),
    login: vi.fn(),
  },
}));

// AuthContext のモック（isAuthenticated: false の状態を想定）
vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({
    login: vi.fn(),
    isAuthenticated: false,
  }),
}));

/**
 * テスト用のレンダリングヘルパー
 */
const renderLogin = () => {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/setup" element={<div>セットアップページ</div>} />
      </Routes>
    </MemoryRouter>
  );
};

describe("Login ページ", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("needsSetup が true の場合", () => {
    test("/setup にリダイレクトされること", async () => {
      vi.mocked(apiClient.getSetupStatus).mockResolvedValue({
        isOk: () => true,
        value: { needsSetup: true },
      } as Awaited<ReturnType<typeof apiClient.getSetupStatus>>);

      renderLogin();

      await waitFor(() => {
        screen.getByText("セットアップページ");
      });
    });
  });

  describe("needsSetup が false の場合", () => {
    test("ログインフォームが表示されること", async () => {
      vi.mocked(apiClient.getSetupStatus).mockResolvedValue({
        isOk: () => true,
        value: { needsSetup: false },
      } as Awaited<ReturnType<typeof apiClient.getSetupStatus>>);

      renderLogin();

      await waitFor(() => {
        screen.getByLabelText(/メールアドレス/);
        screen.getByLabelText(/パスワード/);
      });
    });
  });

  describe("セットアップ状態確認中", () => {
    test("ローディング表示が出ること", async () => {
      // getSetupStatus が解決しないようにする（ペンディング状態）
      vi.mocked(apiClient.getSetupStatus).mockImplementation(
        () => new Promise(() => {})
      );

      renderLogin();

      // ローディング中はスピナーまたはローディングテキストが表示される
      screen.getByText(/確認中/);
    });
  });
});
