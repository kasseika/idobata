/**
 * 抽出元IDの非公開化
 *
 * 目的: 課題・解決策を外部（API レスポンス・ソケット送信）へ出すときに、抽出元のスレッドID
 *       （sourceOriginId）を取り除く規則を1か所で定義する。
 * 理由: sourceOriginId が公開されると、同じ参加者の発言をまとめて文体から書き手を推定したり、
 *       スレッドIDを手がかりに会話へアクセスを試みたりできてしまう。
 * 注意: サーバー内部（抽出処理・エクスポート）はドキュメントのプロパティを直接読むため影響しない。
 *       .lean() で取得したプレーンオブジェクトは toJSON を通らないため、omitSourceOriginId を直接使うこと。
 */

/**
 * オブジェクトから sourceOriginId を取り除いたコピーを返す
 *
 * @param item 課題・解決策のプレーンオブジェクト
 * @returns sourceOriginId を含まないコピー（元のオブジェクトは変更しない）
 */
export const omitSourceOriginId = <T extends { sourceOriginId?: unknown }>(
  item: T
): Omit<T, "sourceOriginId"> => {
  const { sourceOriginId: _sourceOriginId, ...rest } = item;
  return rest;
};

/**
 * スキーマの toJSON オプション。JSON 化の結果から sourceOriginId を取り除く
 */
export const hideSourceOriginIdInJson = {
  transform: (_doc: unknown, ret: { sourceOriginId?: unknown }) =>
    omitSourceOriginId(ret),
};
