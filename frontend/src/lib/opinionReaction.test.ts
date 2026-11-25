/**
 * readPendingOpinionStart のテスト（issue #177）
 *
 * 目的: コメント画面から論点ページへ移動するときに渡す「意見を起点に対話を始める」指示を、
 *       ページ遷移の状態（location.state）から正しく読み取ることを検証する。
 *       location.state はブラウザの履歴に残り、形が保証されないため、形が不正なら指示なし（null）として扱う。
 */
import { describe, expect, it } from "vitest";
import { readPendingOpinionStart } from "./opinionReaction";

const validStart = {
  origin: {
    type: "problem",
    id: "650000000000000000000201",
    reaction: "agree",
  },
  opinionText: "通学路の歩道が狭い",
};

describe("readPendingOpinionStart", () => {
  it("正しい形の指示を読み取ること", () => {
    expect(readPendingOpinionStart({ opinionStart: validStart })).toEqual(
      validStart
    );
  });

  it.each([
    ["状態がない", null],
    ["指示がない", { from: "comments" }],
    [
      "起点の種類が不明",
      {
        opinionStart: {
          ...validStart,
          origin: { ...validStart.origin, type: "question" },
        },
      },
    ],
    [
      "反応の種類が不明",
      {
        opinionStart: {
          ...validStart,
          origin: { ...validStart.origin, reaction: "like" },
        },
      },
    ],
    ["意見の文がない", { opinionStart: { origin: validStart.origin } }],
  ])("%sの場合は null を返すこと", (_label, state) => {
    expect(readPendingOpinionStart(state)).toBeNull();
  });
});
