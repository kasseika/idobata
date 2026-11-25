/**
 * 他の人の意見への反応ボタン（issue #177）
 *
 * 目的: 他の人の意見（課題・解決策）のカードに「私もそう思う」「自分の場合は少し違う」の2つのボタンを出し、
 *       押された反応の種類を呼び出し元へ渡す。呼び出し元は、その意見を起点に論点チャットを始める。
 * 注意: 「気になる」とは意味が違うため、「気になる」の代わりには使わない（issue #178）。
 */
import { MessageCircle } from "lucide-react";
import {
  OPINION_REACTION_LABELS,
  type OpinionReaction,
} from "../../lib/opinionReaction";
import { Button } from "../ui/button";

/** ボタンの表示順 */
const REACTIONS: OpinionReaction[] = ["agree", "differ"];

interface OpinionReactionButtonsProps {
  /** 押された反応の種類を受け取る */
  onReact: (reaction: OpinionReaction) => void;
  /** コメントを受け付けないテーマなどで押せなくする */
  disabled?: boolean;
}

const OpinionReactionButtons = ({
  onReact,
  disabled = false,
}: OpinionReactionButtonsProps) => (
  <div className="flex flex-wrap gap-2">
    {REACTIONS.map((reaction) => (
      <Button
        key={reaction}
        type="button"
        size="sm"
        variant="outline"
        // outline の既定ではマウスを乗せると背景が accent（緑）になり文字が埋もれるため、背景は変えない（issue #179）
        className="h-8 px-3 text-neutral-600 hover:bg-background hover:text-primary-400"
        disabled={disabled}
        onClick={() => onReact(reaction)}
      >
        <MessageCircle className="h-4 w-4" aria-hidden="true" />
        {OPINION_REACTION_LABELS[reaction]}
      </Button>
    ))}
  </div>
);

export default OpinionReactionButtons;
