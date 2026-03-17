import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import Header from "./Header";
import Footer from "./footer/Footer";

/**
 * デスクトップ表示時にチャットパネル（480px）分だけ右側を空けるTailwindクラス。
 * 幅を変更する場合はFloatingChat.tsxのw-[480px]も合わせて更新すること。
 */
const CHAT_PANEL_OFFSET_CLASS = "xl:pr-[480px]";

interface PageLayoutProps {
  children: ReactNode;
  /** PCでチャットパネルを表示するページではtrueを指定する（CHAT_PANEL_OFFSET_CLASS分だけ右側を空ける） */
  hasChatPanel?: boolean;
}

const PageLayout = ({ children, hasChatPanel = false }: PageLayoutProps) => {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div
        className={cn(
          "flex flex-col flex-grow",
          hasChatPanel && CHAT_PANEL_OFFSET_CLASS
        )}
      >
        <main className="flex-grow relative">{children}</main>
        <Footer />
      </div>
    </div>
  );
};

export default PageLayout;
