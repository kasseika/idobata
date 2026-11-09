/**
 * 課題・解決策の JSON 化 テスト
 *
 * 目的: 課題・解決策を API やソケットで送るときに、抽出元のスレッドID（sourceOriginId）が
 *       含まれないことを検証する。sourceOriginId が公開されると、同じ人の発言をまとめたり、
 *       スレッドIDを手がかりに会話へアクセスを試みたりできてしまうため。
 * 前提: DB には接続しない。Mongoose のドキュメントをメモリ上で作り、toJSON() の結果を検査する。
 *       エクスポートや抽出処理はドキュメントのプロパティを直接読むため、sourceOriginId を引き続き使える。
 */
import mongoose from "mongoose";
import { describe, expect, test } from "vitest";
import Problem from "../models/Problem.js";
import Solution from "../models/Solution.js";

const themeId = new mongoose.Types.ObjectId();
const sourceThreadId = new mongoose.Types.ObjectId();

describe("課題ドキュメントの JSON 化", () => {
  const problem = new Problem({
    statement:
      "評価基準が不透明であることが課題です。面談で根拠が説明されていません。",
    sourceOriginId: sourceThreadId,
    sourceType: "chat",
    themeId,
  });

  test("JSON には課題文が含まれ、抽出元のスレッドIDは含まれない", () => {
    const json = JSON.parse(JSON.stringify(problem));

    expect(json.statement).toBe(
      "評価基準が不透明であることが課題です。面談で根拠が説明されていません。"
    );
    expect(json).not.toHaveProperty("sourceOriginId");
    expect(JSON.stringify(json)).not.toContain(sourceThreadId.toString());
  });

  test("サーバー内部ではプロパティから抽出元のスレッドIDを読める", () => {
    expect(problem.sourceOriginId.toString()).toBe(sourceThreadId.toString());
  });
});

describe("解決策ドキュメントの JSON 化", () => {
  const solution = new Solution({
    statement:
      "評価面談で根拠を書面で示します。現在は口頭のみで説明されています。",
    sourceOriginId: sourceThreadId,
    sourceType: "chat",
    themeId,
  });

  test("JSON には解決策文が含まれ、抽出元のスレッドIDは含まれない", () => {
    const json = JSON.parse(JSON.stringify(solution));

    expect(json.statement).toBe(
      "評価面談で根拠を書面で示します。現在は口頭のみで説明されています。"
    );
    expect(json).not.toHaveProperty("sourceOriginId");
  });

  test("サーバー内部ではプロパティから抽出元のスレッドIDを読める", () => {
    expect(solution.sourceOriginId.toString()).toBe(sourceThreadId.toString());
  });
});
