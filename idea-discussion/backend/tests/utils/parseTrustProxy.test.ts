/**
 * TRUST_PROXY 環境変数の解釈 テスト
 *
 * 目的: リバースプロキシ（Caddy・nginx）の後ろで、レート制限が利用者ごとの IP を数えられるよう、
 *       Express の trust proxy 設定値を環境変数から正しく作ることを検証する。
 *       X-Forwarded-For を無条件に信じる "true" は、IP を詐称できるため起動時にエラーにする。
 */
import { describe, expect, test } from "vitest";
import { parseTrustProxy } from "../../utils/parseTrustProxy.js";

describe("parseTrustProxy", () => {
  test("未設定・空文字のときは、プロキシを信頼しない", () => {
    expect(parseTrustProxy(undefined)).toBe(false);
    expect(parseTrustProxy("")).toBe(false);
  });

  test("'false' のときは、プロキシを信頼しない", () => {
    expect(parseTrustProxy("false")).toBe(false);
  });

  test("数値のときは、信頼するプロキシの段数として扱う", () => {
    expect(parseTrustProxy("1")).toBe(1);
    expect(parseTrustProxy("2")).toBe(2);
  });

  test("IPアドレス・サブネットの指定は、そのまま渡す", () => {
    expect(parseTrustProxy("loopback, 172.16.0.0/12")).toBe(
      "loopback, 172.16.0.0/12"
    );
  });

  test("'true' はすべてのプロキシを信頼して IP を詐称できるため、エラーにする", () => {
    expect(() => parseTrustProxy("true")).toThrow("TRUST_PROXY");
  });

  test("負の段数はエラーにする", () => {
    expect(() => parseTrustProxy("-1")).toThrow("TRUST_PROXY");
  });
});
