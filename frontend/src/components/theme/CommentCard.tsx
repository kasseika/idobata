/**
 * テーマ詳細ページの「寄せられた意見」のカード
 *
 * 目的: テーマに寄せられた課題・解決策を表示する。
 *       onReact を渡すと「私もそう思う」「自分の場合は少し違う」のボタンを出し、
 *       その意見を起点にテーマ全体のチャットで対話を始められるようにする（issue #177）。
 */
import { MessageSquare } from "lucide-react";
import { Card, CardContent } from "../../components/ui/card";
import type { OpinionReaction } from "../../lib/opinionReaction";
import OpinionReactionButtons from "../question/OpinionReactionButtons";

interface CommentCardProps {
  text: string;
  type?: "issue" | "solution";
  /** 押された反応の種類を受け取る。渡さなければ反応ボタンを出さない */
  onReact?: (reaction: OpinionReaction) => void;
  /** 反応ボタンを押せなくする（コメントを受け付けないテーマなど） */
  reactionDisabled?: boolean;
}

const CommentCard = ({
  text,
  type = "issue",
  onReact,
  reactionDisabled = false,
}: CommentCardProps) => {
  return (
    <Card className="hover:shadow-sm transition-all duration-200">
      <CardContent className="p-3">
        <div className="flex items-start gap-2">
          <div className="mt-1">
            <MessageSquare
              className={`h-4 w-4 ${type === "issue" ? "text-destructive" : "text-accent"}`}
            />
          </div>
          <p className="text-base text-foreground">{text}</p>
        </div>
        {onReact && (
          <div className="mt-3 pl-6">
            <OpinionReactionButtons
              onReact={onReact}
              disabled={reactionDisabled}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CommentCard;
