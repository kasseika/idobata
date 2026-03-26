/**
 * SiteConfigForm コンポーネントのユニットテスト
 *
 * 目的: サイト設定フォームの更新成功時およびキャンセル時に
 *       正しいルート（"/"）へナビゲーションすることを検証する。
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { apiClient } from "../../services/api/apiClient";
import type { SiteConfig } from "../../services/api/types";
import SiteConfigForm from "./SiteConfigForm";

// apiClient のモック
vi.mock("../../services/api/apiClient", () => ({
  apiClient: {
    updateSiteConfig: vi.fn(),
  },
}));

// react-router-dom の useNavigate のモック
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

/**
 * テスト用のレンダリングヘルパー
 */
const renderSiteConfigForm = (siteConfig?: SiteConfig) => {
  return render(
    <MemoryRouter>
      <SiteConfigForm siteConfig={siteConfig} />
    </MemoryRouter>
  );
};

describe("SiteConfigForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("更新成功時", () => {
    test('ダッシュボード（"/"）にナビゲーションすること', async () => {
      // 更新APIが成功を返す
      vi.mocked(apiClient.updateSiteConfig).mockResolvedValue({
        match: (onOk: () => void, _onErr: unknown) => {
          onOk();
        },
      } as Awaited<ReturnType<typeof apiClient.updateSiteConfig>>);

      renderSiteConfigForm({
        _id: "site-config-id-001",
        title: "いどばたサイト",
        aboutMessage: "",
      });

      // タイトルフィールドを入力してフォームを送信
      const titleInput = screen.getByLabelText(/サイト名/);
      fireEvent.change(titleInput, { target: { value: "いどばたサイト" } });
      fireEvent.submit(titleInput.closest("form") as HTMLFormElement);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith("/");
      });
    });
  });

  describe("キャンセルボタンクリック時", () => {
    test('ダッシュボード（"/"）にナビゲーションすること', () => {
      renderSiteConfigForm({
        _id: "site-config-id-001",
        title: "いどばたサイト",
        aboutMessage: "",
      });

      const cancelButton = screen.getByRole("button", { name: "キャンセル" });
      fireEvent.click(cancelButton);

      expect(mockNavigate).toHaveBeenCalledWith("/");
    });
  });
});
