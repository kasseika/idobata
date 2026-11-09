/**
 * トップページの意見の投稿者名 テスト
 *
 * 目的: 環境変数 ANONYMIZE_AUTHOR_NAMES=true のインスタンス（企業研修用）では、
 *       参加者が表示名を設定していても、意見の投稿者名を「匿名ユーザー」として返すことを検証する。
 *       未設定のインスタンス（市民向けの既存運用）では、これまでどおり表示名を返すことも確かめる。
 * 前提: Mongoose モデルと userController の getUser はモックする。意見は課題1件だけを用意する。
 */
import type { Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("../models/Theme.js", () => ({
  default: {
    find: vi.fn(() => ({
      sort: () => ({ limit: vi.fn().mockResolvedValue([]) }),
      select: () => ({ lean: vi.fn().mockResolvedValue([]) }),
    })),
  },
}));
vi.mock("../models/SharpQuestion.js", () => ({
  default: {
    find: vi.fn(() => ({
      sort: () => ({ limit: vi.fn().mockResolvedValue([]) }),
    })),
  },
}));
vi.mock("../models/Problem.js", () => ({
  default: {
    find: vi.fn(() => ({
      sort: () => ({
        limit: () => ({
          populate: vi.fn().mockResolvedValue([
            {
              _id: "650000000000000000000010",
              statement: "評価基準が不透明であることが課題です。",
              themeId: {
                _id: "650000000000000000000001",
                title: "働きやすい職場に必要なこと",
              },
              createdAt: new Date("2026-11-19T10:30:00+09:00"),
            },
          ]),
        }),
      }),
    })),
  },
}));
vi.mock("../models/Solution.js", () => ({
  default: {
    find: vi.fn(() => ({
      sort: () => ({
        limit: () => ({ populate: vi.fn().mockResolvedValue([]) }),
      }),
    })),
  },
}));
vi.mock("../models/QuestionLink.js", () => ({
  default: {
    findOne: vi.fn(() => ({ populate: vi.fn().mockResolvedValue(null) })),
  },
}));
vi.mock("../models/ChatThread.js", () => ({
  default: {
    findOne: vi
      .fn()
      .mockResolvedValue({ userId: "uuid-営業部の佐藤さんの端末" }),
  },
}));
vi.mock("../models/Like.js", () => ({
  default: { countDocuments: vi.fn().mockResolvedValue(0) },
}));
vi.mock("../controllers/userController.js", () => ({
  getUser: vi.fn().mockResolvedValue({ displayName: "佐藤 花子" }),
}));

import { getTopPageData } from "../controllers/topPageController.js";

/** getTopPageData を呼び、最初の意見の投稿者名とレスポンス全体の JSON 文字列を返す */
const fetchFirstOpinion = async () => {
  const json = vi.fn();
  const res = { status: vi.fn(() => ({ json })) } as unknown as Response;
  await getTopPageData({} as Request, res);
  expect(res.status).toHaveBeenCalledWith(200);
  const body = json.mock.calls[0][0];
  return {
    authorName: body.latestOpinions[0].authorName,
    raw: JSON.stringify(body),
  };
};

describe("getTopPageData の意見の投稿者名", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("ANONYMIZE_AUTHOR_NAMES が未設定なら、参加者が設定した表示名を返す（既存の挙動）", async () => {
    vi.stubEnv("ANONYMIZE_AUTHOR_NAMES", "");

    const { authorName } = await fetchFirstOpinion();

    expect(authorName).toBe("佐藤 花子");
  });

  test("ANONYMIZE_AUTHOR_NAMES=true なら、表示名があっても「匿名ユーザー」を返し、表示名はどこにも含まれない", async () => {
    vi.stubEnv("ANONYMIZE_AUTHOR_NAMES", "true");

    const { authorName, raw } = await fetchFirstOpinion();

    expect(authorName).toBe("匿名ユーザー");
    expect(raw).not.toContain("佐藤 花子");
  });
});
