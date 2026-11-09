/**
 * 最小寄与人数（k）の入力欄
 *
 * 目的: テーマ編集フォームで、最小寄与人数 k の有効・無効と人数を設定する（issue #146）。
 *       k が有効なテーマでは、k 人以上が寄与した重要論点だけが参加者・管理者に表示される。
 * 注意: k は下書き（draft）の間だけ設定できる。保存済みのステータスが draft 以外なら isLocked を true にする。
 *       実施中に k を下げる・無効にできると、それまでの投稿を少人数の論点として表示させられるため。
 */
import type { FC } from "react";
import {
  MIN_CONTRIBUTORS_LOWER_BOUND,
  RECOMMENDED_MIN_CONTRIBUTORS,
  isValidMinContributors,
} from "../../utils/minContributors";
import { Input } from "../ui/input";

interface MinContributorsFieldProps {
  /** 現在の k。null は無効 */
  value: number | null;
  /** k が変わったときに呼ばれる。無効化したときは null を渡す */
  onChange: (value: number | null) => void;
  /** true のとき操作できない（保存済みステータスが draft 以外） */
  isLocked: boolean;
}

const MinContributorsField: FC<MinContributorsFieldProps> = ({
  value,
  onChange,
  isLocked,
}) => {
  const isEnabled = value !== null;
  const hasError = !isValidMinContributors(value);

  return (
    <div className="mb-4">
      <p className="block text-foreground font-medium mb-2">最小寄与人数</p>
      <p className="text-muted-foreground text-sm mb-3">
        有効にすると、指定した人数以上の参加者が寄与した重要論点だけを、参加者にも管理者にも表示します。個々の課題・解決策の文は表示しません。少人数の研修で、文体や話題から書き手を推定されるのを防ぎます。
      </p>
      <label className="flex items-center gap-2 text-sm mb-2">
        <input
          type="checkbox"
          checked={isEnabled}
          disabled={isLocked}
          onChange={(e) =>
            onChange(e.target.checked ? RECOMMENDED_MIN_CONTRIBUTORS : null)
          }
        />
        最小寄与人数を有効にする（企業研修では {RECOMMENDED_MIN_CONTRIBUTORS}{" "}
        を推奨）
      </label>
      {isEnabled && (
        <div className="flex items-center gap-2">
          <label htmlFor="minContributors" className="sr-only">
            最小寄与人数
          </label>
          <Input
            id="minContributors"
            type="number"
            min={MIN_CONTRIBUTORS_LOWER_BOUND}
            step={1}
            value={value}
            disabled={isLocked}
            onChange={(e) => onChange(Number(e.target.value))}
            aria-invalid={hasError}
            aria-describedby={hasError ? "minContributors-error" : undefined}
            className={`w-24 ${hasError ? "border-destructive" : ""}`}
          />
          <span className="text-sm">人以上</span>
        </div>
      )}
      {hasError && (
        <p
          id="minContributors-error"
          role="alert"
          className="text-destructive text-sm mt-1"
        >
          {MIN_CONTRIBUTORS_LOWER_BOUND} 以上の整数を入力してください
        </p>
      )}
      {isLocked && (
        <p className="text-muted-foreground text-sm mt-1">
          最小寄与人数は下書きの間だけ設定できます。
        </p>
      )}
    </div>
  );
};

export default MinContributorsField;
