/**
 * コメント画面の課題・解決策のカード
 *
 * 目的: 論点に関連する課題・解決策を、関連度とともに表示する。
 *       参加者は「私もそう思う」「自分の場合は少し違う」で反応し、その意見を起点に対話を始められる（issue #177）。
 * 注意: 課題・解決策には「気になる」を付けない。「気になる」は重要論点だけに付ける（issue #178）。
 */
import type { OpinionReaction } from "../../lib/opinionReaction";
import OpinionReactionButtons from "./OpinionReactionButtons";

export interface OpinionCardProps {
  type: "課題点" | "解決策";
  text: string;
  relevance: number;
  /** 押された反応の種類を受け取る */
  onReact: (reaction: OpinionReaction) => void;
}

const OpinionCard = ({ type, text, relevance, onReact }: OpinionCardProps) => (
  <div className="border border-neutral-200 rounded-lg p-3 bg-white hover:shadow-sm transition-all duration-200">
    <div className="flex items-center gap-2">
      <div
        className={`px-2 py-1 text-sm rounded-md ${type === "課題点" ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"}`}
      >
        {type}
      </div>
      <div className="text-base text-neutral-500">関連度: {relevance}%</div>
    </div>
    <p className="text-base text-neutral-700 mt-2">{text}</p>
    <div className="mt-3">
      <OpinionReactionButtons onReact={onReact} />
    </div>
  </div>
);

export default OpinionCard;
