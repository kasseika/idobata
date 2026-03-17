/**
 * チャットパネル関連の共通定数。
 * PageLayout.tsx と FloatingChat.tsx で同じ幅・ヘッダー高さを参照するための単一の真実源。
 * 値を変更する場合はこのファイルのみを更新すること。
 *
 * ⚠️ TailwindCSSの制約: クラス文字列は静的スキャンのため完全な文字列として定義すること。
 * テンプレートリテラルによる動的生成はビルド時にクラスが欠落する。
 */

/**
 * ヘッダーの高さ（px）。
 * CHAT_PANEL_CLASSES の top-[75px] と一致させること。
 */
export const HEADER_HEIGHT = 75;

/**
 * デスクトップ時のチャットパネル固定サイドバーのTailwindクラス。
 * top の値は HEADER_HEIGHT (75px) に対応する。
 */
export const CHAT_PANEL_CLASSES =
  "fixed top-[75px] right-0 bottom-0 w-[480px] border-l border-b border-neutral-200 bg-white z-30 overflow-hidden";

/** PageLayoutでチャットパネル分の右側余白を確保するTailwindクラス */
export const CHAT_PANEL_OFFSET_CLASS = "xl:pr-[480px]";
