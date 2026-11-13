/**
 * 「その他の意見」のセクション
 *
 * 目的: テーマ詳細ページの重要論点の一覧の後に、重要論点に拾われなかった意見の要約を表示する（issue #147）。
 *       少数の意見も、参加者が議論の場で目にできるようにする。
 * 注意: 要約が0件のとき（未生成、または k を満たすまとまりが無いとき）は、セクションごと表示しない。
 *       バックエンドは材料にした課題の ID を返さないため、要約から個々の意見へのリンクは置かない。
 */
import SectionHeading from "../common/SectionHeading";
import { Card, CardContent } from "../ui/card";

interface OtherOpinionsSectionProps {
  /** 最新の版の要約（グループごとに1件） */
  summaries: string[];
}

const OtherOpinionsSection = ({ summaries }: OtherOpinionsSectionProps) => {
  if (summaries.length === 0) {
    return null;
  }

  return (
    <div className="mb-8">
      <SectionHeading title={`その他の意見（${summaries.length}件）`} />
      <p className="mb-4 text-md text-zinc-800">
        重要論点には含まれなかった意見を、趣旨の近いものごとにまとめています。
      </p>
      <ul className="space-y-3">
        {summaries.map((summary) => (
          <li key={summary}>
            <Card>
              <CardContent className="p-3 text-md text-zinc-800">
                {summary}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default OtherOpinionsSection;
