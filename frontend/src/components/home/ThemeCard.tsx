import { ArrowRight, HelpCircle, MessageSquare } from "lucide-react";
import { Link } from "../../contexts/MockContext";
import { Button } from "../ui/button";
import { Card, CardContent, CardFooter, CardTitle } from "../ui/card";

interface ThemeCardProps {
  id?: string;
  title: string;
  description?: string;
  keyQuestionCount?: number;
  commentCount?: number;
  problemCount?: number;
  solutionCount?: number;
  tags?: string[];
}

const ThemeCard = ({
  id,
  title,
  description,
  keyQuestionCount,
  commentCount,
  tags,
}: ThemeCardProps) => {
  return (
    <Link to={`/themes/${id}`} className="block">
      <Card className="hover:shadow-md transition-all duration-200 hover:border-primary-700/50">
        <CardContent className="pt-4">
          <CardTitle className="text-lg mb-2">{title}</CardTitle>
          <div className="h-[2px] bg-gray-300 w-full my-2" />
          <p className="whitespace-pre-line text-base text-muted-foreground mb-4">
            {description}
          </p>
          {tags && tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 mb-2">
              {tags.map((tag) => (
                <div
                  key={tag}
                  className="inline-flex items-center justify-center rounded-full border border-zinc-300 bg-white px-3 py-0"
                >
                  <span className="text-sm font-normal leading-6 tracking-[0.025em] text-zinc-500">
                    {tag}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-between items-center pt-0">
          <div className="flex text-sm sm:text-base text-muted-foreground">
            {keyQuestionCount !== undefined && keyQuestionCount > 0 && (
              <span className="flex items-center mr-4">
                <HelpCircle className="h-4 w-4 mr-1 text-primary" />
                重要論点：{keyQuestionCount}件
              </span>
            )}
            {commentCount !== undefined && commentCount > 0 && (
              <span className="flex items-center">
                <MessageSquare className="h-4 w-4 mr-1 text-primary" />
                コメント数: {commentCount}件
              </span>
            )}
          </div>
          <Button className="px-3">
            <ArrowRight className="h-5 w-5" />
          </Button>
        </CardFooter>
      </Card>
    </Link>
  );
};

export default ThemeCard;
