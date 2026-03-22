/**
 * ChatThread モデルのユニットテスト
 *
 * 目的: messages[].content フィールドの透過的暗号化（Mongoose set/get トランスフォーム）を検証する。
 *       - set トランスフォーム: content 設定時に AES-256-GCM で暗号化されること
 *       - get トランスフォーム: content 読み取り時に復号されること
 *       - 後方互換性: 既存の平文データも正しく読み取れること
 * 注意: MongoDB接続不要。Mongoose ドキュメントインスタンスを直接生成してスキーマ動作を検証する。
 */

import mongoose from "mongoose";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isEncrypted } from "../services/encryptionService.js";

const VALID_KEY_BASE64 = Buffer.from("a".repeat(32)).toString("base64");

describe("ChatThread モデルの透過的暗号化", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.SYSTEM_CONFIG_ENCRYPTION_KEY = VALID_KEY_BASE64;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  const テーマID = new mongoose.Types.ObjectId();
  const ユーザーID = "テスト用ユーザー001";
  const メッセージ本文 = "これは機密性の高いチャットメッセージです";

  it("messages[].content を設定するとDBには暗号化された値が保存されること", async () => {
    const { default: ChatThread } = await import("./ChatThread.js");

    const スレッド = new ChatThread({
      userId: ユーザーID,
      themeId: テーマID,
      messages: [{ role: "user", content: メッセージ本文 }],
    });

    // getters: false で生の値（暗号化済み）を取得する
    const 生データ = スレッド.toObject({ getters: false });
    const 生のContent = 生データ.messages[0].content;

    expect(isEncrypted(生のContent)).toBe(true);
  });

  it("messages[].content を読み取るとプレーンテキストが返ること", async () => {
    const { default: ChatThread } = await import("./ChatThread.js");

    const スレッド = new ChatThread({
      userId: ユーザーID,
      themeId: テーマID,
      messages: [{ role: "user", content: メッセージ本文 }],
    });

    // getters: true でトランスフォームを通した値（復号済み）を取得する
    const データ = スレッド.toObject({ getters: true });
    const 復号されたContent = データ.messages[0].content;

    expect(復号されたContent).toBe(メッセージ本文);
  });

  it("toJSON() でもプレーンテキストが返ること", async () => {
    const { default: ChatThread } = await import("./ChatThread.js");

    const スレッド = new ChatThread({
      userId: ユーザーID,
      themeId: テーマID,
      messages: [{ role: "user", content: メッセージ本文 }],
    });

    const json = JSON.parse(JSON.stringify(スレッド.toJSON()));
    expect(json.messages[0].content).toBe(メッセージ本文);
  });

  it("複数のメッセージがすべて暗号化されること", async () => {
    const { default: ChatThread } = await import("./ChatThread.js");

    const スレッド = new ChatThread({
      userId: ユーザーID,
      themeId: テーマID,
      messages: [
        { role: "user", content: "ユーザーの最初のメッセージ" },
        { role: "assistant", content: "AIの返答メッセージ" },
        { role: "user", content: "ユーザーの続きのメッセージ" },
      ],
    });

    const 生データ = スレッド.toObject({ getters: false });
    for (const msg of 生データ.messages) {
      expect(isEncrypted(msg.content)).toBe(true);
    }

    const データ = スレッド.toObject({ getters: true });
    expect(データ.messages[0].content).toBe("ユーザーの最初のメッセージ");
    expect(データ.messages[1].content).toBe("AIの返答メッセージ");
    expect(データ.messages[2].content).toBe("ユーザーの続きのメッセージ");
  });

  it("既存の平文データ（暗号化前）もそのまま読み取れること（後方互換性）", async () => {
    const { default: ChatThread } = await import("./ChatThread.js");

    // 平文のままMongooseドキュメントのinternal stateに直接書き込む（マイグレーション前の状態を模倣）
    const スレッド = new ChatThread({
      userId: ユーザーID,
      themeId: テーマID,
      messages: [],
    });
    // set トランスフォームを回避して平文を内部に書き込む
    スレッド.messages.push({
      role: "user",
      content: "平文のまま保存されたメッセージ",
    } as never);
    // 後方互換用: get トランスフォームが isEncrypted チェックで平文をそのまま返すこと
    // ただし上記 push は set を通るため、実際には push 直前に直接書き込む必要がある
    // → MongoDB から直接読み込んだ平文データをシミュレートするため hydrate を使用
    const 平文ドキュメント = ChatThread.hydrate({
      _id: new mongoose.Types.ObjectId(),
      userId: ユーザーID,
      themeId: テーマID,
      messages: [{ role: "user", content: "平文のまま保存されたメッセージ" }],
    });

    const データ = 平文ドキュメント.toObject({ getters: true });
    expect(データ.messages[0].content).toBe("平文のまま保存されたメッセージ");
  });
});
