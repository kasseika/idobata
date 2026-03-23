import { UserIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { Card } from "../ui/card";

interface OpinionCardProps {
  id: string | number;
  type: "problem" | "solution";
  text: string;
  authorName: string;
  authorAvatar?: string;
  questionTagline: string;
  questionId: string;
  themeId: string;
  themeName: string;
  createdAt: string | Date;
}

const OpinionCard = ({
  text,
  authorName,
  authorAvatar,
  questionTagline,
  questionId,
  themeId,
  themeName,
  createdAt,
}: OpinionCardProps) => {
  // Format timestamp
  const formatTimestamp = (date: string | Date) => {
    const d = new Date(date);
    const now = new Date();
    const diffInHours = (now.getTime() - d.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 1) {
      const diffInMinutes = Math.floor(
        (now.getTime() - d.getTime()) / (1000 * 60)
      );
      return `${diffInMinutes}分前`;
    }
    if (diffInHours < 24) {
      return `${Math.floor(diffInHours)}時間前`;
    }
    return d.toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  };

  return (
    <Card className="h-full pt-4 px-4 pb-0 border border-gray-200 rounded-lg bg-white overflow-hidden flex flex-col">
      <div className="flex-1 flex flex-col">
        <p className="text-sm text-gray-700 leading-relaxed flex-1">{text}</p>

        <div className="flex items-center gap-3 text-gray-600 mt-2">
          <div className="flex items-center gap-2 py-2">
            {authorAvatar ? (
              <img
                src={authorAvatar}
                alt={authorName}
                className="w-4 h-4 rounded-full"
              />
            ) : (
              <UserIcon className="w-6 h-6 text-gray-400" />
            )}
            <span className="text-sm font-bold text-gray-700">
              {authorName}
            </span>
          </div>
        </div>
      </div>

      <div className="border-t">
        <div className="py-2 flex flex-col gap-1">
          <div className="flex items-center justify-between">
            {themeId ? (
              <Link
                to={`/themes/${themeId}`}
                className="text-sm font-semibold text-blue-600 hover:underline truncate min-w-0 flex-1"
              >
                {themeName}
              </Link>
            ) : (
              <p className="text-sm font-semibold text-gray-600 truncate min-w-0 flex-1">
                {themeName || "テーマ未設定"}
              </p>
            )}
            <span className="text-sm text-gray-500 ml-2 flex-shrink-0">
              {formatTimestamp(createdAt)}
            </span>
          </div>
          {questionTagline && questionId && themeId && (
            <Link
              to={`/themes/${themeId}/questions/${questionId}`}
              className="text-xs text-gray-500 hover:underline truncate"
            >
              {questionTagline}
            </Link>
          )}
          {questionTagline && (!questionId || !themeId) && (
            <p className="text-xs text-gray-500 truncate">{questionTagline}</p>
          )}
        </div>
      </div>
    </Card>
  );
};

export default OpinionCard;
