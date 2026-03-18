/**
 * プロンプト表示ドロワーコンポーネント
 *
 * 目的: パイプラインステージのプロンプト全文をSheet（ドロワー）形式で表示する。
 *       @radix-ui/react-dialog を利用した既存の Sheet コンポーネントを再利用する。
 */

import { X } from "lucide-react";
import { useState } from "react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../ui/base/sheet";
import { Button } from "../ui/button";

interface PromptDrawerProps {
  /** ステージ名（ドロワーのタイトルに使用） */
  stageName: string;
  /** 表示するプロンプトテキスト */
  prompt: string;
}

/**
 * 「プロンプトを見る」ボタンを押すとプロンプト全文をドロワー表示するコンポーネント
 */
export function PromptDrawer({ stageName, prompt }: PromptDrawerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0 text-xs text-blue-600 hover:text-blue-800"
        >
          プロンプトを見る
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="h-[70vh] overflow-y-auto">
        <SheetHeader className="mb-4">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-base font-semibold text-zinc-800">
              {stageName} - プロンプト
            </SheetTitle>
            <SheetClose className="rounded-sm opacity-70 hover:opacity-100">
              <X className="h-4 w-4" />
              <span className="sr-only">閉じる</span>
            </SheetClose>
          </div>
        </SheetHeader>
        <div className="rounded-lg bg-zinc-50 border border-zinc-200 p-4">
          <pre className="text-xs text-zinc-700 whitespace-pre-wrap font-mono leading-relaxed">
            {prompt}
          </pre>
        </div>
      </SheetContent>
    </Sheet>
  );
}
