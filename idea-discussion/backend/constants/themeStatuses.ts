/**
 * テーマのライフサイクルステータスの一覧と、参加者に見せるかどうかの規則
 *
 * 目的: Theme スキーマの enum と、テーマ作成・更新の入力検証（utils/parseThemeInput.ts）で
 *       同じ一覧を使うために1か所にまとめる。
 *       また、非管理者（参加者）に見せないステータスの規則も、テーマ取得 API と論点取得 API で共有する。
 * 注意: 各ステータスの意味と遷移の規則は models/Theme.ts の冒頭コメントを参照する。
 */
export const THEME_STATUSES = [
  "draft",
  "active",
  "closed",
  "archived",
] as const;

/** 非管理者（参加者）には存在しないものとして扱うステータス（準備中とアーカイブ済み） */
const HIDDEN_FROM_PARTICIPANTS_STATUSES: readonly string[] = [
  "draft",
  "archived",
];

/**
 * このステータスのテーマを、非管理者（参加者）から隠すかどうかを返す
 *
 * @param status - テーマの status フィールドの値
 * @returns 準備中・アーカイブ済みなら true
 * 注意: 管理者には隠さない。管理者かどうかは呼び出し元で判定する。
 */
export const isHiddenFromParticipants = (status: string): boolean =>
  HIDDEN_FROM_PARTICIPANTS_STATUSES.includes(status);
