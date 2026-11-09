/**
 * テーマのライフサイクルステータスの一覧
 *
 * 目的: Theme スキーマの enum と、テーマ作成・更新の入力検証（utils/parseThemeInput.ts）で
 *       同じ一覧を使うために1か所にまとめる。
 * 注意: 各ステータスの意味と遷移の規則は models/Theme.ts の冒頭コメントを参照する。
 */
export const THEME_STATUSES = [
  "draft",
  "active",
  "closed",
  "archived",
] as const;
