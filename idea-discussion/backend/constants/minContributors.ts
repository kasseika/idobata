/**
 * テーマの最小寄与人数（k）に関する定数と検証
 *
 * 目的: 少人数の研修で書き手を推定されないように、k 人以上が寄与した重要論点だけを
 *       参加者・管理者に表示する仕組み（issue #146）の設定値の規則を1か所にまとめる。
 * 注意: k は「2以上の整数」または null（無効）とする。
 *       k=1 は「1人でも寄与すれば表示」となり、保護として意味を持たないため認めない。
 *       コントローラー（入力の境界）と Theme スキーマ（保存時）の両方でこの関数を使う。
 */

/** 最小寄与人数として設定できる最小の値 */
export const MIN_CONTRIBUTORS_LOWER_BOUND = 2;

/**
 * 最小寄与人数として有効な値かを判定する
 *
 * @param value - 判定する値（リクエストボディ等の未検証の値）
 * @returns null（無効）または2以上の整数なら true
 */
export const isValidMinContributors = (
  value: unknown
): value is number | null =>
  value === null ||
  (typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_CONTRIBUTORS_LOWER_BOUND);
