import type { ReactNode } from "react";
import { CHAT_PANEL_OFFSET_CLASS } from "../../lib/chatPanelConstants";
import { cn } from "../../lib/utils";
import Header from "./Header";
import Footer from "./footer/Footer";

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
