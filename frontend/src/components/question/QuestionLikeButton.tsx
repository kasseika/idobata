/**
 * 重要論点の「気になる」ボタン（issue #178）
 *
 * 目的: 参加者が、関心のある重要論点に「気になる」を付けられるようにする。
 * 内容: 現在の件数と、自分が押したかどうかを表示し、押すと「気になる」を付け外しする。
 * 注意: 「気になる」は重要論点だけに付ける。課題・解決策への反応は issue #177 で扱う。
 *       「気になる」は関心の表明であり、「賛同」とは意味が違う。
 */
import { ThumbsUp } from "lucide-react";
import { useLike } from "../../hooks/useLike";
import { Button } from "../ui/button";

interface QuestionLikeButtonProps {
  /** 「気になる」を付ける重要論点の ID */
  questionId: string;
}

const QuestionLikeButton = ({ questionId }: QuestionLikeButtonProps) => {
  const { isLiked, likeCount, isLoading, toggleLike } = useLike(
    "question",
    questionId
  );

  return (
    <Button
      className={`${isLiked ? "text-primary hover:text-primary-400" : "text-neutral-400 hover:text-primary-400"} flex items-center gap-1 h-7 px-1`}
      size="sm"
      variant="outline"
      onClick={toggleLike}
      disabled={isLoading}
      aria-pressed={isLiked}
    >
      <ThumbsUp className="h-4 w-4" fill={isLiked ? "currentColor" : "none"} />
      気になる
      <span className="text-sm min-w-2">{likeCount}</span>
    </Button>
  );
};

export default QuestionLikeButton;
