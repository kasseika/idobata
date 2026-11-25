/**
 * apiClient.getQuestionLikeCounts のテスト（issue #178）
 *
 * 目的: 重要論点ごとの「気になる」の数を、管理者用 API から取得できることを検証する。
 *       - テーマの like-counts API を呼ぶこと
 *       - レスポンスの likeCounts を、論点 ID → 件数の対応として返すこと
 *       - 失敗したときは、エラーとして返すこと
 * 前提: fetch はモックする。
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { apiClient } from "./apiClient";
import { ApiErrorType } from "./apiError";

afterEach(() => {
  vi.unstubAllGlobals();
});

const THEME_ID = "650000000000000000000001";

describe("apiClient.getQuestionLikeCounts", () => {
  test("テーマの like-counts API を呼び、論点ごとの件数を返す", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          likeCounts: {
            "650000000000000000000011": 3,
            "650000000000000000000012": 0,
          },
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiClient.getQuestionLikeCounts(THEME_ID);

    expect(String(fetchMock.mock.calls[0][0])).toMatch(
      new RegExp(`/api/themes/${THEME_ID}/questions/like-counts$`)
    );
    expect(result._unsafeUnwrap()).toEqual({
      "650000000000000000000011": 3,
      "650000000000000000000012": 0,
    });
  });

  test("管理者でないとき（403）は、エラーとして返す", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "管理者権限が必要です" }), {
          status: 403,
        })
      )
    );

    const result = await apiClient.getQuestionLikeCounts(THEME_ID);

    expect(result._unsafeUnwrapErr().type).toBe(ApiErrorType.FORBIDDEN);
  });
});
