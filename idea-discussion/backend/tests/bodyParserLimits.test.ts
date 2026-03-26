/**
 * ボディパーサーのサイズ制限テスト
 *
 * グローバル express.json() を削除し、ルート単位でサイズ制限を設定した後の
 * 動作を検証する。テーマインポートルートのみ 10MB を許可し、
 * 他のルートはデフォルト（100KB）に制限されることを確認する。
 *
 * 【重要な設計前提】
 * router.use(express.json()) をルーターレベルで設定すると、
 * ルート単位の express.json({ limit: "10mb" }) より先に実行されてしまい、
 * インポートルートの 10MB 制限が機能しなくなる。
 * そのため、インポートルートのある themeRoutes.ts ではルート単位でパーサーを設定している。
 */

import express, { type Request, type Response } from "express";
import supertest from "supertest";
import { describe, expect, it } from "vitest";

/**
 * デフォルト制限（100KB）のテスト用Expressアプリを生成する
 */
function createDefaultLimitApp() {
  const app = express();
  const router = express.Router();
  // デフォルト制限（100KB）のbodyパーサー
  router.use(express.json());
  router.post("/test", (req: Request, res: Response) => {
    res.json({ received: true, size: JSON.stringify(req.body).length });
  });
  app.use(router);
  return app;
}

/**
 * 10MB制限のテスト用Expressアプリを生成する
 */
function create10MBLimitApp() {
  const app = express();
  const router = express.Router();
  // テーマインポート用の大容量制限（10MB）
  router.use(express.json({ limit: "10mb" }));
  router.post("/import", (req: Request, res: Response) => {
    res.json({ received: true, size: JSON.stringify(req.body).length });
  });
  app.use(router);
  return app;
}

/**
 * ルーター単位の 100KB 制限とルート単位の 10MB 制限が混在する誤ったパターンを再現するアプリを生成する。
 * router.use(express.json()) が 10MB 制限のルートより先に実行されるため、
 * インポートルートに 1MB のペイロードを送っても 413 になることを検証する（回帰テスト）。
 */
function createMixedLimitAppWrongPattern() {
  const app = express();
  const router = express.Router();
  // ルーターレベルで 100KB 制限を設定すると、後続のルート単位 10MB 制限が機能しない
  router.use(express.json());
  router.post(
    "/import",
    express.json({ limit: "10mb" }),
    (req: Request, res: Response) => {
      res.json({ received: true, size: JSON.stringify(req.body).length });
    }
  );
  app.use(router);
  return app;
}

/**
 * 指定バイト数のJSONペイロードを生成する
 * @param targetBytes 目標バイト数
 */
function generateJsonPayload(targetBytes: number): { data: string } {
  // {"data":"<value>"} の形式で指定バイト数に近いペイロードを生成
  // キー部分 '{"data":""}' は 11バイト
  const valueLength = Math.max(0, targetBytes - 11);
  return { data: "a".repeat(valueLength) };
}

describe("ボディパーサーのサイズ制限", () => {
  describe("デフォルト制限（100KB）のルート", () => {
    const app = createDefaultLimitApp();

    it("100KB以下のJSONペイロードが正常に処理される", async () => {
      // 50KBのペイロード
      const payload = generateJsonPayload(50 * 1024);
      const response = await supertest(app)
        .post("/test")
        .set("Content-Type", "application/json")
        .send(JSON.stringify(payload));

      expect(response.status).toBe(200);
      expect(response.body.received).toBe(true);
    });

    it("100KBを超えるJSONペイロードが413エラーを返す", async () => {
      // 200KBのペイロード（100KBを超える）
      const payload = generateJsonPayload(200 * 1024);
      const response = await supertest(app)
        .post("/test")
        .set("Content-Type", "application/json")
        .send(JSON.stringify(payload));

      expect(response.status).toBe(413);
    });
  });

  describe("10MB制限のルート（テーマインポート）", () => {
    const app = create10MBLimitApp();

    it("1MBのJSONペイロードが正常に処理される", async () => {
      // 1MBのペイロード
      const payload = generateJsonPayload(1 * 1024 * 1024);
      const response = await supertest(app)
        .post("/import")
        .set("Content-Type", "application/json")
        .send(JSON.stringify(payload));

      expect(response.status).toBe(200);
      expect(response.body.received).toBe(true);
    });

    it("5MBのJSONペイロードが正常に処理される", async () => {
      // 5MBのペイロード（10MB制限内）
      const payload = generateJsonPayload(5 * 1024 * 1024);
      const response = await supertest(app)
        .post("/import")
        .set("Content-Type", "application/json")
        .send(JSON.stringify(payload));

      expect(response.status).toBe(200);
      expect(response.body.received).toBe(true);
    });

    it("10MBを超えるJSONペイロードが413エラーを返す", async () => {
      // 11MBのペイロード（10MBを超える）
      const payload = generateJsonPayload(11 * 1024 * 1024);
      const response = await supertest(app)
        .post("/import")
        .set("Content-Type", "application/json")
        .send(JSON.stringify(payload));

      expect(response.status).toBe(413);
    });
  });

  describe("ルーター単位 100KB + ルート単位 10MB の誤ったパターン（回帰テスト）", () => {
    // router.use(express.json()) を設定すると、ルート単位の 10MB 制限より先に実行されてしまう。
    // この誤ったパターンでは、1MB のペイロードが /import に届いても 413 になることを確認する。
    // themeRoutes.ts でルーター単位の router.use() を使わずルート単位で設定している理由を示す。
    const app = createMixedLimitAppWrongPattern();

    it("router.use(express.json())が先に実行されると1MBのペイロードでも413エラーになる", async () => {
      // 1MBのペイロード（本来は10MB制限のルートなので通るべきだが、誤ったパターンでは413になる）
      const payload = generateJsonPayload(1 * 1024 * 1024);
      const response = await supertest(app)
        .post("/import")
        .set("Content-Type", "application/json")
        .send(JSON.stringify(payload));

      // ルーターレベルの 100KB 制限が先に適用されるため 413 が返る
      expect(response.status).toBe(413);
    });
  });
});
