/**
 * 最小寄与人数 k が有効なテーマのお知らせ
 *
 * 目的: k が有効なテーマの詳細ページで、「寄せられた意見」の一覧の代わりに表示する（issue #146）。
 *       個々の意見を表示しない理由と、k を満たさず非表示にした重要論点の件数を伝える。
 * 注意: 非表示にした論点の内容は、件数以外は一切表示しない（バックエンドも返さない）。
 */
import SectionHeading from "../common/SectionHeading";

interface MinContributorsNoticeProps {
  /** テーマの最小寄与人数 k */
  minContributors: number;
  /** 寄与人数が k に満たないため非表示にした重要論点の件数 */
  hiddenQuestionCount: number;
}

const MinContributorsNotice = ({
  minContributors,
  hiddenQuestionCount,
}: MinContributorsNoticeProps) => (
  <div className="mb-12">
    <SectionHeading title="寄せられた意見" />
    <div className="space-y-2 text-md text-zinc-800">
      <p>
        このテーマでは、書き手が推定されないように、個々の意見は表示しません。
        {minContributors}
        人以上の参加者が関わった重要論点だけを表示します。
      </p>
      {hiddenQuestionCount > 0 && (
        <p>
          このほか、関わった参加者が{minContributors}
          人に満たないため表示していない論点が{hiddenQuestionCount}件あります。
        </p>
      )}
    </div>
  </div>
);

export default MinContributorsNotice;
