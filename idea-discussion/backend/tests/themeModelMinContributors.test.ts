/**
 * Theme モデルの minContributors（最小寄与人数）スキーマ検証のテスト
 *
 * 目的: コントローラーを経由しない保存経路（インポート等）でも、
 *       最小寄与人数 k が「2以上の整数」または null 以外の値で保存されないことを検証する。
 * 注意: DB には接続せず、Mongoose の validateSync でスキーマ検証だけを行う。
 */
import { describe, expect, test } from "vitest";
import Theme from "../models/Theme.js";

describe("Theme モデル - minContributors", () => {
  test("未指定の場合は null（無効）になること", () => {
    const theme = new Theme({ title: "地域の防災を考える" });

    expect(theme.minContributors).toBeNull();
    expect(theme.validateSync()).toBeUndefined();
  });

  test("5 は有効な値として保存できること", () => {
    const theme = new Theme({ title: "新人研修 2026 春", minContributors: 5 });

    expect(theme.validateSync()).toBeUndefined();
  });

  test.each([1, 0, -3, 2.5])(
    "%s は不正な値として検証エラーになること",
    (value) => {
      const theme = new Theme({
        title: "新人研修 2026 春",
        minContributors: value,
      });

      const error = theme.validateSync();
      expect(error?.errors.minContributors).toBeDefined();
    }
  );
});
