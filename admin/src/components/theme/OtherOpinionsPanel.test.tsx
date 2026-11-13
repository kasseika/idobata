/**
 * OtherOpinionsPanel コンポーネントのユニットテスト
 *
 * 目的: テーマ編集画面の「その他の意見」パネルの振る舞いを検証する（issue #147）。
 *       - 開いたときに最新の「その他の意見」を読み込み、要約の一覧を表示すること
 *       - 未生成のときは、その旨を表示すること
 *       - 生成ボタンで生成を起動し、起動できたことを伝えること
 *       - 再読み込みボタンで、最新の結果を表示し直すこと
 *       - 読み込み・生成に失敗したときは、エラーを表示すること
 * 前提: apiClient はモックする。結果は neverthrow の Result で返す。
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { err, ok } from "neverthrow";
import React from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { apiClient } from "../../services/api/apiClient";
import { ApiError, ApiErrorType } from "../../services/api/apiError";
import OtherOpinionsPanel from "./OtherOpinionsPanel";

vi.mock("../../services/api/apiClient", () => ({
  apiClient: {
    getOtherOpinions: vi.fn(),
    generateOtherOpinions: vi.fn(),
  },
}));

const THEME_ID = "650000000000000000000001";

/** 生成済みの「その他の意見」（2グループ） */
const generatedOtherOpinions = {
  createdAt: "2026-11-10T09:00:00.000Z",
  groups: [
    {
      summary:
        "会議の資料が直前に届き、準備の時間が足りないという意見があります。",
    },
    { summary: "社内の問い合わせ窓口が分かりにくいという意見があります。" },
  ],
};

const serverError = new ApiError(
  ApiErrorType.SERVER_ERROR,
  "Internal Server Error"
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("OtherOpinionsPanel", () => {
  describe("読み込み", () => {
    test("生成済みのとき、要約の件数と各要約を表示すること", async () => {
      vi.mocked(apiClient.getOtherOpinions).mockResolvedValue(
        ok(generatedOtherOpinions)
      );

      render(<OtherOpinionsPanel themeId={THEME_ID} />);

      expect(await screen.findByText("要約（2件）")).toBeInTheDocument();
      expect(
        screen.getByText(
          "会議の資料が直前に届き、準備の時間が足りないという意見があります。"
        )
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "社内の問い合わせ窓口が分かりにくいという意見があります。"
        )
      ).toBeInTheDocument();
      expect(apiClient.getOtherOpinions).toHaveBeenCalledWith(THEME_ID);
    });

    test("未生成のとき、まだ生成されていないことを表示すること", async () => {
      vi.mocked(apiClient.getOtherOpinions).mockResolvedValue(ok(null));

      render(<OtherOpinionsPanel themeId={THEME_ID} />);

      expect(
        await screen.findByText("まだ生成されていません。")
      ).toBeInTheDocument();
    });

    test("生成した結果、要約が0件のとき、まとめられる意見が無かったことを表示すること", async () => {
      // k が有効なテーマで、k 人以上の書き手が集まるまとまりが無かった場合など
      vi.mocked(apiClient.getOtherOpinions).mockResolvedValue(
        ok({ createdAt: "2026-11-10T09:00:00.000Z", groups: [] })
      );

      render(<OtherOpinionsPanel themeId={THEME_ID} />);

      expect(
        await screen.findByText("まとめて表示できる意見はありませんでした。")
      ).toBeInTheDocument();
    });

    test("読み込みに失敗したとき、エラーを表示すること", async () => {
      vi.mocked(apiClient.getOtherOpinions).mockResolvedValue(err(serverError));

      render(<OtherOpinionsPanel themeId={THEME_ID} />);

      expect(
        await screen.findByText("「その他の意見」の読み込みに失敗しました。")
      ).toBeInTheDocument();
    });

    test("再読み込みボタンを押すと、最新の結果を表示し直すこと", async () => {
      // 初回は未生成、再読み込み時には生成済み
      vi.mocked(apiClient.getOtherOpinions)
        .mockResolvedValueOnce(ok(null))
        .mockResolvedValueOnce(ok(generatedOtherOpinions));

      render(<OtherOpinionsPanel themeId={THEME_ID} />);
      await screen.findByText("まだ生成されていません。");

      await userEvent.click(screen.getByRole("button", { name: "再読み込み" }));

      expect(await screen.findByText("要約（2件）")).toBeInTheDocument();
      expect(
        screen.queryByText("まだ生成されていません。")
      ).not.toBeInTheDocument();
    });
  });

  describe("生成", () => {
    test("生成ボタンを押すと、このテーマの生成を起動し、起動できたことを伝えること", async () => {
      vi.mocked(apiClient.getOtherOpinions).mockResolvedValue(ok(null));
      vi.mocked(apiClient.generateOtherOpinions).mockResolvedValue(
        ok(undefined)
      );

      render(<OtherOpinionsPanel themeId={THEME_ID} />);
      await screen.findByText("まだ生成されていません。");

      await userEvent.click(
        screen.getByRole("button", { name: "その他の意見を生成" })
      );

      expect(apiClient.generateOtherOpinions).toHaveBeenCalledWith(THEME_ID);
      expect(await screen.findByText(/生成を開始しました/)).toBeInTheDocument();
    });

    test("生成の起動に失敗したとき、エラーを表示すること", async () => {
      vi.mocked(apiClient.getOtherOpinions).mockResolvedValue(ok(null));
      vi.mocked(apiClient.generateOtherOpinions).mockResolvedValue(
        err(serverError)
      );

      render(<OtherOpinionsPanel themeId={THEME_ID} />);
      await screen.findByText("まだ生成されていません。");

      await userEvent.click(
        screen.getByRole("button", { name: "その他の意見を生成" })
      );

      expect(
        await screen.findByText("「その他の意見」の生成の開始に失敗しました。")
      ).toBeInTheDocument();
      expect(screen.queryByText(/生成を開始しました/)).not.toBeInTheDocument();
    });
  });
});
