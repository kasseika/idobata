/**
 * レート制限の設定と、API全体のレート制限 テスト
 *
 * 目的: 環境変数から読む上限値の既定値と、不正な値で起動を止めること（Fail-Fast）を検証する。
 *       あわせて、API全体に掛ける IP ごとのレート制限が、上限を超えると 429 を返すことを確かめる。
 */
import express from "express";
import request from "supertest";
import { describe, expect, test } from "vitest";
import {
  createRateLimiters,
  parseRateLimitConfig,
} from "../middleware/rateLimiters.js";

describe("parseRateLimitConfig", () => {
  test("環境変数がないときは既定の上限値を使う", () => {
    expect(parseRateLimitConfig({})).toEqual({
      apiPerIpPerMinute: 3000,
      loginPerIpPer15Minutes: 10,
      chatPerUserPerMinute: 10,
      chatPerIpPerMinute: 600,
      generationPerAdminPer15Minutes: 60,
    });
  });

  test("環境変数で上限値を変えられる", () => {
    const config = parseRateLimitConfig({
      RATE_LIMIT_API_PER_IP_PER_MINUTE: "6000",
      RATE_LIMIT_LOGIN_PER_IP_PER_15_MINUTES: "5",
      RATE_LIMIT_CHAT_PER_USER_PER_MINUTE: "20",
      RATE_LIMIT_CHAT_PER_IP_PER_MINUTE: "1200",
      RATE_LIMIT_GENERATION_PER_ADMIN_PER_15_MINUTES: "30",
    });

    expect(config).toEqual({
      apiPerIpPerMinute: 6000,
      loginPerIpPer15Minutes: 5,
      chatPerUserPerMinute: 20,
      chatPerIpPerMinute: 1200,
      generationPerAdminPer15Minutes: 30,
    });
  });

  test.each(["0", "-1", "1.5", "たくさん", ""])(
    "上限値に正の整数でない値 '%s' を指定すると、起動時にエラーにする",
    (value) => {
      expect(() =>
        parseRateLimitConfig({ RATE_LIMIT_CHAT_PER_USER_PER_MINUTE: value })
      ).toThrow("RATE_LIMIT_CHAT_PER_USER_PER_MINUTE");
    }
  );
});

describe("API全体のレート制限", () => {
  /** API全体の上限だけを小さくしたアプリを作る */
  const createApp = () => {
    const { api } = createRateLimiters({
      ...parseRateLimitConfig({}),
      apiPerIpPerMinute: 3,
    });
    const app = express();
    app.use("/api", api);
    app.get("/api/themes", (_req, res) => {
      res.status(200).json({ message: "テーマの一覧です" });
    });
    return app;
  };

  test("同じIPからのリクエストが上限を超えると 429 を返す", async () => {
    const app = createApp();
    for (let i = 0; i < 3; i++) {
      const res = await request(app).get("/api/themes");
      expect(res.status).toBe(200);
    }

    const res = await request(app).get("/api/themes");

    expect(res.status).toBe(429);
    expect(res.body.message).toBe(
      "リクエストが多すぎます。しばらく待ってから、もう一度お試しください"
    );
  });

  test("上限と残り回数を RateLimit ヘッダで返す", async () => {
    const res = await request(createApp()).get("/api/themes");

    expect(res.headers.ratelimit).toContain("r=2");
    expect(res.headers["ratelimit-policy"]).toContain("q=3");
  });
});
