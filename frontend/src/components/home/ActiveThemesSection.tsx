/**
 * 意見募集中のテーマ一覧セクション
 *
 * トップページに表示する、activeなテーマのカードリスト。
 * 各カードはテーマ詳細ページへのリンクを持つ。
 */
import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { Theme } from "../../types";

interface ActiveThemesSectionProps {
  themes: Theme[];
}

const ActiveThemesSection = ({ themes }: ActiveThemesSectionProps) => {
  if (themes.length === 0) return null;

  return (
    <section className="py-8">
      <div className="px-8 md:px-16">
        <div className="mb-4">
          <div className="flex items-center justify-start gap-4 mb-4">
            <img
              src="/images/home-themes.png"
              alt="意見募集中のテーマ"
              className="w-10 h-10"
            />
            <h2 className="text-2xl font-bold text-gray-900">
              意見募集中のテーマ
            </h2>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {themes.map((theme) => (
            <Link key={theme._id} to={`/themes/${theme._id}`} className="block">
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#94B9F9] to-[#9CE0E5] p-5 hover:shadow-md transition-shadow duration-200">
                {/* 白色半透明オーバーレイ */}
                <div className="absolute inset-0 bg-white/70" />

                <div className="relative z-10">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div className="flex-1">
                      {/* テーマラベル */}
                      <div className="inline-flex items-center justify-center rounded px-3 py-0 bg-white mb-2">
                        <span className="text-sm font-normal text-zinc-800 tracking-[0.025em] leading-6">
                          テーマ
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-zinc-800 leading-snug">
                        {theme.title}
                      </h3>
                      {theme.description && (
                        <p className="whitespace-pre-line text-sm text-zinc-600 mt-1 line-clamp-2">
                          {theme.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-4 md:flex-col md:items-end md:gap-1 shrink-0">
                      <div className="flex items-center gap-1">
                        <span className="text-sm text-zinc-500">重要論点</span>
                        <span className="text-base font-bold text-zinc-800">
                          {theme.keyQuestionCount ?? 0}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-sm text-zinc-500">対話数</span>
                        <span className="text-base font-bold text-zinc-800">
                          {theme.commentCount ?? 0}
                        </span>
                      </div>
                    </div>

                    <ChevronRight
                      className="hidden md:block w-4 h-4 text-blue-600 shrink-0"
                      aria-label="詳細を見る"
                      role="img"
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

export default ActiveThemesSection;
