/**
 * テーマ編集画面の重要論点一覧に「気になる」の数を表示することのテスト（issue #178）
 *
 * 目的: 管理者が、どの重要論点に「気になる」が集まったかを、重要論点一覧で把握できることを検証する。
 *       - 論点ごとに「気になる」の数を表示すること（付いていない論点は 0）
 *       - 数の読み込みに失敗したときは、0 と誤解させずにエラーを表示すること
 * 前提: apiClient はモックする。結果は neverthrow の Result で返す。
 *       ThemeForm は編集モード（isEdit）で描画する。重要論点一覧は編集モードでだけ表示される。
 */
import { act, render, screen, within } from "@testing-library/react";
import { err, ok } from "neverthrow";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { apiClient } from "../../services/api/apiClient";
import { ApiError, ApiErrorType } from "../../services/api/apiError";
import type { Question, Theme } from "../../services/api/types";
import ThemeForm from "./ThemeForm";

vi.mock("../../services/api/apiClient", () => ({
  apiClient: {
    getPipelineDefaults: vi.fn(),
    getQuestionsByTheme: vi.fn(),
    getQuestionLikeCounts: vi.fn(),
  },
}));

const theme: Theme = {
  _id: "650000000000000000000001",
  title: "働き方の見直し",
  description: "これからの働き方について意見を集めます。",
  status: "active",
};

const workStyleQuestion: Question = {
  _id: "650000000000000000000011",
  themeId: theme._id,
  tagLine: "在宅と出社の両立",
  questionText: "在宅勤務と出社をどう両立させればよいだろうか？",
  createdAt: "2026-11-10T09:00:00.000Z",
  updatedAt: "2026-11-10T09:00:00.000Z",
};
const evaluationQuestion: Question = {
  _id: "650000000000000000000012",
  themeId: theme._id,
  tagLine: "評価への納得感",
  questionText: "評価への納得感を高めるにはどうすればよいだろうか？",
  createdAt: "2026-11-11T09:00:00.000Z",
  updatedAt: "2026-11-11T09:00:00.000Z",
};

const renderThemeForm = () =>
  render(
    <MemoryRouter>
      <ThemeForm theme={theme} isEdit />
    </MemoryRouter>
  );

/** 論点の見出しから、その論点の行を探す */
const findQuestionRow = async (tagLine: string) => {
  const cell = await screen.findByText(tagLine);
  const row = cell.closest("tr");
  if (!row) throw new Error(`「${tagLine}」の行が見つかりません`);
  return row;
};

beforeEach(() => {
  vi.mocked(apiClient.getPipelineDefaults).mockResolvedValue(
    ok({ stages: [] })
  );
  vi.mocked(apiClient.getQuestionsByTheme).mockResolvedValue(
    ok([workStyleQuestion, evaluationQuestion])
  );
});

describe("ThemeForm の重要論点一覧の「気になる」", () => {
  test("論点ごとに「気になる」の数を表示する", async () => {
    // 前提: 在宅と出社の論点に3件、評価の論点には0件
    vi.mocked(apiClient.getQuestionLikeCounts).mockResolvedValue(
      ok({ [workStyleQuestion._id]: 3, [evaluationQuestion._id]: 0 })
    );

    renderThemeForm();

    // 検証: 一覧に「気になる」の列があり、各行に論点の数が出る
    expect(
      await screen.findByRole("columnheader", { name: "気になる" })
    ).toBeInTheDocument();
    const workStyleRow = await findQuestionRow("在宅と出社の両立");
    expect(await within(workStyleRow).findByText("3")).toBeInTheDocument();
    const evaluationRow = await findQuestionRow("評価への納得感");
    expect(await within(evaluationRow).findByText("0")).toBeInTheDocument();
    expect(apiClient.getQuestionLikeCounts).toHaveBeenCalledWith(theme._id);
  });

  test("前の読み込みの応答が後から届いても、新しい読み込みの数を表示し続ける", async () => {
    // 前提: 別のテーマ（福利厚生）に切り替える。前のテーマ（働き方）の数の応答は、
    //       切り替え後のテーマの応答より遅れて届く
    const benefitsTheme: Theme = {
      _id: "650000000000000000000002",
      title: "福利厚生の見直し",
      status: "active",
    };
    const lunchQuestion: Question = {
      _id: "650000000000000000000021",
      themeId: benefitsTheme._id,
      tagLine: "社員食堂",
      questionText:
        "社員食堂をもっと使いやすくするにはどうすればよいだろうか？",
      createdAt: "2026-11-12T09:00:00.000Z",
      updatedAt: "2026-11-12T09:00:00.000Z",
    };
    vi.mocked(apiClient.getQuestionsByTheme).mockImplementation(
      async (themeId) =>
        ok(
          themeId === benefitsTheme._id ? [lunchQuestion] : [workStyleQuestion]
        )
    );
    let resolveStaleLikeCounts: (counts: Record<string, number>) => void =
      () => {};
    vi.mocked(apiClient.getQuestionLikeCounts).mockImplementation(
      async (themeId) => {
        if (themeId === benefitsTheme._id) {
          return ok({ [lunchQuestion._id]: 7 });
        }
        return ok(
          await new Promise<Record<string, number>>((resolve) => {
            resolveStaleLikeCounts = resolve;
          })
        );
      }
    );

    const { rerender } = renderThemeForm();
    await screen.findByText("在宅と出社の両立");
    rerender(
      <MemoryRouter>
        <ThemeForm theme={benefitsTheme} isEdit />
      </MemoryRouter>
    );
    const lunchRow = await findQuestionRow("社員食堂");
    expect(await within(lunchRow).findByText("7")).toBeInTheDocument();

    // 前のテーマの応答が、ここで遅れて届く
    await act(async () => {
      resolveStaleLikeCounts({ [workStyleQuestion._id]: 3 });
    });

    // 検証: 切り替え後のテーマの数（7）が残る
    expect(within(lunchRow).getByText("7")).toBeInTheDocument();
  });

  test("数の読み込みに失敗したときは、エラーを表示する", async () => {
    // 前提: 「気になる」の数の取得がサーバーエラーで失敗する
    vi.mocked(apiClient.getQuestionLikeCounts).mockResolvedValue(
      err(new ApiError(ApiErrorType.SERVER_ERROR, "サーバーエラー", 500))
    );

    renderThemeForm();

    // 検証: エラーを表示し、論点の行に 0 を出さない
    expect(
      await screen.findByText("「気になる」の数の読み込みに失敗しました。")
    ).toBeInTheDocument();
    const workStyleRow = await findQuestionRow("在宅と出社の両立");
    expect(within(workStyleRow).queryByText("0")).not.toBeInTheDocument();
  });
});
