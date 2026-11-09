/**
 * apiClient.exportTheme のテスト
 *
 * 目的: テーマのエクスポートが拒否された（403）場合に、バックエンドが返した理由を
 *       エラーのメッセージに入れることを検証する（issue #146）。
 *       k が有効なテーマは、チャットの原文を含むためエクスポートできない。
 *       バックエンドが理由を返さない 403 では、従来どおりの文言にすることも確かめる。
 * 前提: fetch はモックする。
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { apiClient } from "./apiClient";
import { ApiErrorType } from "./apiError";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiClient.exportTheme", () => {
  test("403 でバックエンドが理由を返した場合は、その理由をメッセージにすること", async () => {
    const reason =
      "このテーマは最小寄与人数が有効なため、個々の意見やチャットの内容を参照する機能は使えません。";
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ message: reason }), { status: 403 })
        )
    );

    const result = await apiClient.exportTheme("650000000000000000000001");

    expect(result.isErr()).toBe(true);
    const error = result._unsafeUnwrapErr();
    expect(error.type).toBe(ApiErrorType.FORBIDDEN);
    expect(error.message).toBe(reason);
  });

  test("403 でバックエンドが理由を返さない場合は、従来どおりの文言にすること", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 403 }))
    );

    const result = await apiClient.exportTheme("650000000000000000000001");

    expect(result._unsafeUnwrapErr().message).toBe("アクセス権限がありません");
  });
});
