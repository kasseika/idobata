/**
 * チャットパネル関連の共通定数。
 * PageLayout.tsx と FloatingChat.tsx で同じ幅を参照するための単一の真実源。
 * 幅を変更する場合はこのファイルのみを更新すること。
 */

/** デスクトップ時のチャットパネル固定サイドバーのTailwindクラス */
export const CHAT_PANEL_CLASSES =
  "fixed top-[75px] right-0 bottom-0 w-[480px] border-l border-b border-neutral-200 bg-white z-30 overflow-hidden";

/** PageLayoutでチャットパネル分の右側余白を確保するTailwindクラス */
export const CHAT_PANEL_OFFSET_CLASS = "xl:pr-[480px]";
