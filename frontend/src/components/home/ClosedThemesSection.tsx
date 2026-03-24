/**
 * 募集終了したテーマ一覧セクション
 *
 * トップページに表示する、closedなテーマのカードリスト。
 * 各カードはテーマ詳細ページへのリンクを持つ（チャットは無効だが閲覧可能）。
 */
import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { Theme } from "../../types";

interface ClosedThemesSectionProps {
  themes: Theme[];
}

const ClosedThemesSection = ({ themes }: ClosedThemesSectionProps) => {
  if (themes.length === 0) return null;

  return (
    <section className="py-8">
      <div className="px-8 md:px-16">
        <div className="mb-4">
          <div className="flex items-center justify-start gap-4 mb-4">
            <h2 className="text-2xl font-bold text-gray-700">
              募集終了したテーマ
            </h2>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {themes.map((theme) => (
            <Link key={theme._id} to={`/themes/${theme._id}`} className="block">
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-gray-300 to-gray-400 p-5 hover:shadow-md transition-shadow duration-200">
                {/* 白色半透明オーバーレイ */}
                <div className="absolute inset-0 bg-white/70" />

                <div className="relative z-10">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div className="flex-1">
                      {/* 募集終了ラベル */}
                      <div className="inline-flex items-center justify-center rounded px-3 py-0 bg-white mb-2">
                        <span className="text-sm font-normal text-zinc-500 tracking-[0.025em] leading-6">
                          募集終了
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-zinc-700 leading-snug">
                        {theme.title}
                      </h3>
                      {theme.description && (
                        <p className="whitespace-pre-line text-sm text-zinc-500 mt-1 line-clamp-2">
                          {theme.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-4 md:flex-col md:items-end md:gap-1 shrink-0">
                      <div className="flex items-center gap-1">
                        <span className="text-sm text-zinc-400">重要論点</span>
                        <span className="text-base font-bold text-zinc-600">
                          {theme.keyQuestionCount ?? 0}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-sm text-zinc-400">対話数</span>
                        <span className="text-base font-bold text-zinc-600">
                          {theme.commentCount ?? 0}
                        </span>
                      </div>
                    </div>

                    <ChevronRight
                      className="hidden md:block w-4 h-4 text-gray-500 shrink-0"
                      aria-hidden="true"
                    />
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ClosedThemesSection;
