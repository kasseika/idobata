/**
 * テーマエクスポート確認ダイアログ
 *
 * 目的: テーマをJSONファイルとしてエクスポートする際の確認UIを提供する。
 *       「いいねデータを含める」チェックボックスで includeLikes オプションを選択し、
 *       エクスポート実行コールバックに渡す。
 *       shadcn/ui の Dialog コンポーネントを使用し、アクセシビリティ要件を満たす。
 *       - role="dialog" の自動付与（Radix UI による）
 *       - フォーカストラップ（Radix UI による）
 *       - Escapeキーでの閉じる操作
 *
 * 注意: isLoading 中は Escape キーおよびオーバーレイクリックによる閉じる操作を無効化する。
 *       ダイアログを開くたびにチェックボックスは未チェック状態にリセットされる。
 */
import React, { useEffect, useState } from "react";
import type { FC } from "react";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Label } from "../ui/label";

interface ThemeExportDialogProps {
  /** ダイアログの開閉状態 */
  open: boolean;
  /** エクスポート実行コールバック。includeLikes オプションを受け取る */
  onExport: (includeLikes: boolean) => void;
  /** ダイアログを閉じるコールバック */
  onClose: () => void;
  /** エクスポート処理中フラグ */
  isLoading: boolean;
}

const ThemeExportDialog: FC<ThemeExportDialogProps> = ({
  open,
  onExport,
  onClose,
  isLoading,
}) => {
  const [includeLikes, setIncludeLikes] = useState(false);

  // ダイアログを開くたびにチェックボックスをリセットする
  useEffect(() => {
    if (open) {
      setIncludeLikes(false);
    }
  }, [open]);

  /** エクスポート中は閉じる操作を無効化する */
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen && !isLoading) onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="w-full max-w-md"
        // エクスポート中は Escape キーでの閉じる操作を無効化する
        onEscapeKeyDown={(e) => {
          if (isLoading) e.preventDefault();
        }}
        // エクスポート中はオーバーレイクリックでの閉じる操作を無効化する
        onInteractOutside={(e) => {
          if (isLoading) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>テーマをエクスポート</DialogTitle>
          <DialogDescription>
            テーマデータをJSONファイルとしてダウンロードします。
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 py-2">
          <input
            type="checkbox"
            id="include-likes"
            checked={includeLikes}
            onChange={(e) => setIncludeLikes(e.target.checked)}
            className="h-4 w-4 cursor-pointer"
          />
          <Label htmlFor="include-likes" className="cursor-pointer">
            いいねデータを含める（ファイルサイズが増加します）
          </Label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            キャンセル
          </Button>
          <Button onClick={() => onExport(includeLikes)} disabled={isLoading}>
            {isLoading ? "エクスポート中..." : "エクスポート実行"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ThemeExportDialog;
