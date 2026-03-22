/**
 * SiteConfigContext のテスト
 *
 * サイト設定の取得とdocument.titleへの反映を検証する。
 */
import { err, ok } from "neverthrow";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, ApiErrorType } from "../services/api/apiError";
import { SiteConfigProvider } from "./SiteConfigContext";

// apiClientのモック
vi.mock("../services/api/apiClient", () => ({
  apiClient: {
    getSiteConfig: vi.fn(),
  },
}));

import { apiClient } from "../services/api/apiClient";

/** テスト用にdocument.titleを元に戻すヘルパー */
const originalTitle = document.title;

describe("SiteConfigProvider", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    document.title = originalTitle;
    vi.resetAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    root?.unmount();
    document.body.removeChild(container);
    document.title = originalTitle;
  });

  it("サイト設定の取得に成功した場合、document.titleがサイト名に更新される", async () => {
    const mockSiteConfig = {
      _id: "test-id",
      title: "テスト政策フォーラム",
      aboutMessage: "テスト説明文",
    };

    vi.mocked(apiClient.getSiteConfig).mockResolvedValue(ok(mockSiteConfig));

    await act(async () => {
      root = createRoot(container);
      root.render(
        <SiteConfigProvider>
          <span />
        </SiteConfigProvider>
      );
    });

    expect(document.title).toBe("テスト政策フォーラム");
  });

  it("サイト設定の取得に失敗した場合、document.titleがデフォルト値に更新される", async () => {
    vi.mocked(apiClient.getSiteConfig).mockResolvedValue(
      err(new ApiError(ApiErrorType.NETWORK_ERROR, "API error"))
    );

    await act(async () => {
      root = createRoot(container);
      root.render(
        <SiteConfigProvider>
          <span />
        </SiteConfigProvider>
      );
    });

    expect(document.title).toBe("XX党 みんなの政策フォーラム");
  });
});
