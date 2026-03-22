/**
 * チャットスレッド暗号化マイグレーションスクリプト
 *
 * 目的: 既存の ChatThread.messages[].content（平文）を AES-256-GCM で暗号化する。
 *       Mongoose の set/get トランスフォームを回避するため、ネイティブドライバで直接操作する。
 * 使い方:
 *   npx tsx scripts/migrateChatThreadEncryption.ts           # 実際に移行を実行
 *   npx tsx scripts/migrateChatThreadEncryption.ts --dry-run # 変換対象件数のみ確認
 * 注意:
 *   - 実行前に MongoDB のバックアップを取得すること
 *   - 環境変数 MONGODB_URI と SYSTEM_CONFIG_ENCRYPTION_KEY が必要
 *   - 既に暗号化済み（enc:v1: プレフィックス）のメッセージはスキップする
 *   - ダウンタイムなし: get トランスフォームの isEncrypted チェックにより平文・暗号文が混在可能
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { encryptPacked, isEncrypted } from "../services/encryptionService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../../..", ".env") });

const MONGODB_URI = process.env.MONGODB_URI;
const IS_DRY_RUN = process.argv.includes("--dry-run");
/** 一括処理のバッチサイズ（メモリ消費を抑制する） */
const BATCH_SIZE = 100;

if (!MONGODB_URI) {
  console.error(
    "エラー: MONGODB_URI が設定されていません。.env ファイルを確認してください。"
  );
  process.exit(1);
}

if (!process.env.SYSTEM_CONFIG_ENCRYPTION_KEY) {
  console.error(
    "エラー: SYSTEM_CONFIG_ENCRYPTION_KEY が設定されていません。.env ファイルを確認してください。"
  );
  process.exit(1);
}

async function migrateChatThreadEncryption(): Promise<void> {
  await mongoose.connect(MONGODB_URI as string);
  console.log("MongoDB に接続しました。");

  if (IS_DRY_RUN) {
    console.log("[ドライラン] 実際のデータ変更は行いません。");
  }

  // ネイティブコレクションを取得（Mongoose の set/get トランスフォームを回避するため）
  const collection = mongoose.connection.collection("chatthreads");

  let 処理済みスレッド数 = 0;
  let 暗号化済みメッセージ数 = 0;
  let スキップ済みメッセージ数 = 0;
  let 対象スレッド数 = 0;

  // カーソルを使用してバッチ処理（全ドキュメントを一度にメモリに展開しない）
  const カーソル = collection.find({});

  let バッファ: Array<{
    _id: mongoose.Types.ObjectId;
    messages: Array<{ role: string; content: string; timestamp?: Date }>;
  }> = [];

  for await (const ドキュメント of カーソル) {
    バッファ.push(ドキュメント as never);

    if (バッファ.length >= BATCH_SIZE) {
      const 結果 = await processBatch(バッファ, collection, IS_DRY_RUN);
      処理済みスレッド数 += 結果.処理済みスレッド数;
      暗号化済みメッセージ数 += 結果.暗号化済みメッセージ数;
      スキップ済みメッセージ数 += 結果.スキップ済みメッセージ数;
      対象スレッド数 += 結果.対象スレッド数;
      バッファ = [];
    }
  }

  // 残りのバッファを処理する
  if (バッファ.length > 0) {
    const 結果 = await processBatch(バッファ, collection, IS_DRY_RUN);
    処理済みスレッド数 += 結果.処理済みスレッド数;
    暗号化済みメッセージ数 += 結果.暗号化済みメッセージ数;
    スキップ済みメッセージ数 += 結果.スキップ済みメッセージ数;
    対象スレッド数 += 結果.対象スレッド数;
  }

  console.log("\n===== マイグレーション完了 =====");
  console.log(`スキャン済みスレッド数  : ${処理済みスレッド数}`);
  console.log(`暗号化対象スレッド数    : ${対象スレッド数}`);
  console.log(`暗号化したメッセージ数  : ${暗号化済みメッセージ数}`);
  console.log(
    `スキップしたメッセージ数: ${スキップ済みメッセージ数}（既に暗号化済み）`
  );
  if (IS_DRY_RUN) {
    console.log("\n[ドライラン] 実際の変更は加えていません。");
  }

  await mongoose.disconnect();
  console.log("MongoDB との接続を切断しました。");
}

type BatchResult = {
  処理済みスレッド数: number;
  暗号化済みメッセージ数: number;
  スキップ済みメッセージ数: number;
  対象スレッド数: number;
};

async function processBatch(
  バッファ: Array<{
    _id: mongoose.Types.ObjectId;
    messages: Array<{ role: string; content: string; timestamp?: Date }>;
  }>,
  collection: mongoose.mongo.Collection,
  isDryRun: boolean
): Promise<BatchResult> {
  let 暗号化済みメッセージ数 = 0;
  let スキップ済みメッセージ数 = 0;
  let 対象スレッド数 = 0;

  for (const ドキュメント of バッファ) {
    const messages = ドキュメント.messages ?? [];
    if (messages.length === 0) continue;

    let このスレッドに変更あり = false;
    const 更新後メッセージ = messages.map((msg) => {
      if (isEncrypted(msg.content)) {
        スキップ済みメッセージ数++;
        return msg;
      }
      // 平文を暗号化する
      このスレッドに変更あり = true;
      暗号化済みメッセージ数++;
      return { ...msg, content: encryptPacked(msg.content) };
    });

    if (!このスレッドに変更あり) continue;

    対象スレッド数++;
    if (!isDryRun) {
      await collection.updateOne(
        { _id: ドキュメント._id },
        { $set: { messages: 更新後メッセージ } }
      );
    }
  }

  return {
    処理済みスレッド数: バッファ.length,
    暗号化済みメッセージ数,
    スキップ済みメッセージ数,
    対象スレッド数,
  };
}

migrateChatThreadEncryption().catch((error) => {
  console.error("マイグレーション中にエラーが発生しました:", error);
  process.exit(1);
});
