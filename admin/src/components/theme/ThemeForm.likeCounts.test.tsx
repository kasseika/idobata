/**
 * テーマ編集画面の重要論点一覧に「気になる」の数を表示することのテスト（issue #178）
 *
 * 目的: 管理者が、どの重要論点に「気になる」が集まったかを、重要論点一覧で把握できることを検証する。
 *       - 論点ごとに「気になる」の数を表示すること（付いていない論点は 0）
 *       - 数の読み込みに失敗したときは、0 と誤解させずにエラーを表示すること
 * 前提: apiClient はモックする。結果は neverthrow の Result で返す。
 *       ThemeForm は編集モード（isEdit）で描画する。重要論点一覧は編集モードでだけ表示される。
 */
import { render, screen, within } from "@testing-library/react";
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
