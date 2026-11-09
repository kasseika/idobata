/**
 * テーマ削除時の関連データ削除 テスト
 *
 * 目的: 管理者がテーマを削除したとき、そのテーマで集めた参加者のデータ（チャット・課題・解決策・
 *       重要論点・レポート類・いいね・インポート項目）もすべて削除されることを検証する。
 *       企業研修では「終了後はデータを削除できる」と約束するため、テーマだけが消えて
 *       会話が残る状態を防ぐ。
 * 前提: Mongoose モデルはモックし、各コレクションに対する deleteMany の呼び出し（＝DBへの削除）を検査する。
 *       設定変更の監査ログ（PipelineConfigChangeLog）は参加者のデータではないため削除対象にしない。
 */
import type { Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const ids = vi.hoisted(() => ({
  themeId: "650000000000000000000001",
  questionId: "650000000000000000000002",
  problemId: "650000000000000000000010",
  solutionId: "650000000000000000000020",
}));

/** distinct と deleteMany を持つモデルのモックを作る */
const modelMock = vi.hoisted(() => (distinctIds: string[] = []) => ({
  distinct: vi.fn().mockResolvedValue(distinctIds),
  deleteMany: vi.fn().mockResolvedValue({ deletedCount: 1 }),
}));

vi.mock("../models/Theme.js", () => ({
  default: {
    findById: vi.fn(),
    findByIdAndDelete: vi.fn().mockResolvedValue(null),
  },
}));
vi.mock("../models/SharpQuestion.js", () => ({
  default: modelMock([ids.questionId]),
}));
vi.mock("../models/Problem.js", () => ({
  default: modelMock([ids.problemId]),
}));
vi.mock("../models/Solution.js", () => ({
  default: modelMock([ids.solutionId]),
}));
vi.mock("../models/ChatThread.js", () => ({ default: modelMock() }));
vi.mock("../models/ImportedItem.js", () => ({ default: modelMock() }));
vi.mock("../models/QuestionLink.js", () => ({ default: modelMock() }));
vi.mock("../models/Like.js", () => ({ default: modelMock() }));
vi.mock("../models/PolicyDraft.js", () => ({ default: modelMock() }));
vi.mock("../models/DigestDraft.js", () => ({ default: modelMock() }));
vi.mock("../models/DebateAnalysis.js", () => ({ default: modelMock() }));
vi.mock("../models/QuestionVisualReport.js", () => ({ default: modelMock() }));
vi.mock("../models/ReportExample.js", () => ({ default: modelMock() }));
vi.mock("../models/PipelineConfigChangeLog.js", () => ({
  default: modelMock(),
}));

import { deleteTheme } from "../controllers/themeController.js";
import ChatThread from "../models/ChatThread.js";
import DebateAnalysis from "../models/DebateAnalysis.js";
import DigestDraft from "../models/DigestDraft.js";
import ImportedItem from "../models/ImportedItem.js";
import Like from "../models/Like.js";
import PipelineConfigChangeLog from "../models/PipelineConfigChangeLog.js";
import PolicyDraft from "../models/PolicyDraft.js";
import Problem from "../models/Problem.js";
import QuestionLink from "../models/QuestionLink.js";
import QuestionVisualReport from "../models/QuestionVisualReport.js";
import ReportExample from "../models/ReportExample.js";
import SharpQuestion from "../models/SharpQuestion.js";
import Solution from "../models/Solution.js";
import Theme from "../models/Theme.js";

/** deleteTheme を呼び、レスポンスのステータスコードを返す */
const callDeleteTheme = async () => {
  const json = vi.fn();
  const status = vi.fn((_statusCode: number) => ({ json }));
  const req = { params: { themeId: ids.themeId } } as unknown as Request;
  await deleteTheme(req, { status } as unknown as Response);
  return status.mock.calls[0][0];
};

describe("deleteTheme の関連データ削除", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ALLOW_DELETE_THEME", "true");
    vi.mocked(Theme.findById).mockResolvedValue({
      _id: ids.themeId,
      title: "働きやすい職場に必要なこと",
    } as never);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("テーマに属する参加者のデータとテーマ本体がすべて削除される", async () => {
    const statusCode = await callDeleteTheme();

    expect(statusCode).toBe(200);
    // テーマに直接ひもづくデータ
    expect(ChatThread.deleteMany).toHaveBeenCalledWith({
      themeId: ids.themeId,
    });
    expect(Problem.deleteMany).toHaveBeenCalledWith({ themeId: ids.themeId });
    expect(Solution.deleteMany).toHaveBeenCalledWith({ themeId: ids.themeId });
    expect(ImportedItem.deleteMany).toHaveBeenCalledWith({
      themeId: ids.themeId,
    });
    expect(SharpQuestion.deleteMany).toHaveBeenCalledWith({
      themeId: ids.themeId,
    });
    // 重要論点にひもづくデータ
    const byQuestion = { questionId: { $in: [ids.questionId] } };
    expect(QuestionLink.deleteMany).toHaveBeenCalledWith(byQuestion);
    expect(PolicyDraft.deleteMany).toHaveBeenCalledWith(byQuestion);
    expect(DigestDraft.deleteMany).toHaveBeenCalledWith(byQuestion);
    expect(DebateAnalysis.deleteMany).toHaveBeenCalledWith(byQuestion);
    expect(QuestionVisualReport.deleteMany).toHaveBeenCalledWith(byQuestion);
    expect(ReportExample.deleteMany).toHaveBeenCalledWith(byQuestion);
    // 課題・解決策・重要論点へのいいね
    expect(Like.deleteMany).toHaveBeenCalledWith({
      targetId: { $in: [ids.problemId, ids.solutionId, ids.questionId] },
    });
    expect(Theme.findByIdAndDelete).toHaveBeenCalledWith(ids.themeId);
  });

  test("設定変更の監査ログは参加者のデータではないため削除しない", async () => {
    await callDeleteTheme();

    expect(PipelineConfigChangeLog.deleteMany).not.toHaveBeenCalled();
  });

  test("チャットの削除に失敗したら 500 を返し、テーマ本体は残す（再実行で削除しきれるようにする）", async () => {
    vi.mocked(ChatThread.deleteMany).mockRejectedValueOnce(
      new Error("MongoDB への接続が切れました")
    );

    const statusCode = await callDeleteTheme();

    expect(statusCode).toBe(500);
    expect(Theme.findByIdAndDelete).not.toHaveBeenCalled();
  });

  test("ALLOW_DELETE_THEME が無効なら、何も削除しない", async () => {
    vi.stubEnv("ALLOW_DELETE_THEME", "false");

    const statusCode = await callDeleteTheme();

    expect(statusCode).toBe(400);
    expect(ChatThread.deleteMany).not.toHaveBeenCalled();
    expect(Theme.findByIdAndDelete).not.toHaveBeenCalled();
  });
});
