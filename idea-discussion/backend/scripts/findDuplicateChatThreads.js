/**
 * ChatThread の重複確認スクリプト（読み取り専用）
 *
 * 目的: ChatThread に一意インデックス（userId + themeId + questionId）を追加する前に、
 *       同じ組み合わせのスレッドが複数ある（インデックス作成が失敗する）かどうかを確認する（issue #169）。
 * 使い方: MONGODB_URI を設定して `node scripts/findDuplicateChatThreads.js` を実行する。
 * 注意: データは変更しない。出力は重複グループの件数と、各グループのスレッド件数だけで、
 *       会話の内容は出力しない。questionId が無いスレッドは null として同じグループにまとめる。
 *       重複があった場合は、デプロイ前に手動でスレッドを統合・削除する必要がある。
 */

import mongoose from "mongoose";

const mongoUri = process.env.MONGODB_URI;

if (!mongoUri) {
  console.error("Error: MONGODB_URI is not defined.");
  process.exit(1);
}

async function findDuplicateChatThreads() {
  await mongoose.connect(mongoUri);
  try {
    const duplicateGroups = await mongoose.connection
      .collection("chatthreads")
      .aggregate([
        {
          $group: {
            _id: {
              userId: "$userId",
              themeId: "$themeId",
              // 未設定の questionId も null として扱い、MongoDB の一意インデックスと同じ判定にする
              questionId: { $ifNull: ["$questionId", null] },
            },
            threadCount: { $sum: 1 },
          },
        },
        { $match: { threadCount: { $gt: 1 } } },
      ])
      .toArray();

    console.log(`重複しているグループ数: ${duplicateGroups.length}`);
    for (const group of duplicateGroups) {
      console.log(
        `themeId=${group._id.themeId} questionId=${group._id.questionId} スレッド数=${group.threadCount}`
      );
    }
    process.exitCode = duplicateGroups.length > 0 ? 1 : 0;
  } finally {
    await mongoose.disconnect();
  }
}

findDuplicateChatThreads().catch((error) => {
  console.error("重複確認に失敗しました:", error);
  process.exit(1);
});
