/**
 * 論点ページの「ほかの人の意見」カード
 *
 * 目的: 論点に関連する他の参加者の課題・対策を表示する。
 *       onReact を渡すと「私もそう思う」「自分の場合は少し違う」のボタンを出し、
 *       その意見を起点に対話を始められるようにする（issue #177）。
 */
import { User } from "lucide-react";
import type { OpinionReaction } from "../../lib/opinionReaction";
import OpinionReactionButtons from "./OpinionReactionButtons";

interface OtherOpinionCardProps {
  text: string;
  userName: string;
  type: "課題" | "対策";
  userIconColor: "red" | "blue" | "yellow" | "green";
  /** 押された反応の種類を受け取る。渡さなければ反応ボタンを出さない */
  onReact?: (reaction: OpinionReaction) => void;
  /** 反応ボタンを押せなくする（コメントを受け付けないテーマなど） */
  reactionDisabled?: boolean;
}

const OtherOpinionCard = ({
  text,
  userName,
  type,
  userIconColor,
  onReact,
  reactionDisabled = false,
}: OtherOpinionCardProps) => {
  const getTagStyles = () => {
    if (type === "課題") {
      return "bg-red-100 border border-red-200 text-red-500";
    }
    return "bg-green-100 border border-green-300 text-green-500";
  };

  const getUserIconStyles = () => {
    switch (userIconColor) {
      case "red":
        return "bg-red-50 text-red-300";
      case "blue":
        return "bg-blue-50 text-blue-300";
      case "yellow":
        return "bg-yellow-50 text-yellow-400";
      case "green":
        return "bg-green-50 text-green-300";
      default:
        return "bg-gray-50 text-gray-300";
    }
  };

  return (
    <div className="bg-white border border-black/16 rounded-2xl p-5 flex flex-col gap-2.5 relative w-full md:w-[calc(50%-8px)]">
      <div className="absolute -top-3 left-0">
        <div
          className={`${getTagStyles()} rounded-full px-3 py-0 flex items-center justify-center gap-1`}
        >
          <span className="text-sm font-normal leading-8 tracking-wide">
            {type}
          </span>
        </div>
      </div>
      <p className="text-base font-normal text-gray-800 leading-8 tracking-wide">
        {text}
      </p>
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 border border-black/36 rounded-full flex items-center justify-center">
          <div
            className={`w-8 h-8 ${getUserIconStyles()} rounded-full flex items-center justify-center`}
          >
            <User className="w-6 h-6 stroke-2" />
          </div>
        </div>
        <span className="text-base font-bold text-gray-800 leading-8 tracking-wide">
          {userName}
        </span>
      </div>
      {onReact && (
        <OpinionReactionButtons onReact={onReact} disabled={reactionDisabled} />
      )}
    </div>
  );
};

export default OtherOpinionCard;
