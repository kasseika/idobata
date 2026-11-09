/**
 * テーマの最小寄与人数（k）の規則
 *
 * 目的: 管理画面で k を入力・検証するときの規則を1か所にまとめる（issue #146）。
 * 注意: バックエンド（idea-discussion/backend/constants/minContributors.ts）と同じ規則にすること。
 *       k は「2以上の整数」または null（無効）とする。k=1 は保護として意味を持たない。
 */

/** 最小寄与人数として設定できる最小の値 */
export const MIN_CONTRIBUTORS_LOWER_BOUND = 2;

/** 有効化したときに初期値として入れる推奨値（企業研修向け） */
export const RECOMMENDED_MIN_CONTRIBUTORS = 5;

/**
 * 最小寄与人数として有効な値かを判定する
 *
 * @param value - 判定する値。null は「無効」を表し、有効な値とみなす
 * @returns null または2以上の整数なら true
 */
export const isValidMinContributors = (value: number | null): boolean =>
  value === null ||
  (Number.isInteger(value) && value >= MIN_CONTRIBUTORS_LOWER_BOUND);
