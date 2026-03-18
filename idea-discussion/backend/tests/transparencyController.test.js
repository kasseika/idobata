/**
 * transparencyController のユニットテスト
 *
 * 目的: 透明性APIエンドポイントが正しいレスポンスを返すことを検証する。
 * 注意: DBアクセスを伴う操作は Mongoose モデルをモックして検証する。
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

import { PIPELINE_STAGES } from "../constants/pipelineStages.js";

// Mongoose モデルのモック
vi.mock("../models/Theme.js", () => ({
  default: {
    findById: vi.fn(),
  },
}));
vi.mock("../models/SiteConfig.js", () => ({
  default: {
    findOne: vi.fn(),
  },
}));

import {
  getPipelineStages,
  getThemeTransparency,
} from "../controllers/transparencyController.js";
import SiteConfig from "../models/SiteConfig.js";
import Theme from "../models/Theme.js";

/**
 * モック用のリクエスト・レスポンスオブジェクトを生成するヘルパー関数
 */
const createMockReqRes = (params = {}, query = {}) => {
  const req = { params, query };
  const res = {
    json: vi.fn(),
    status: vi.fn().mockReturnThis(),
  };
  return { req, res };
};

describe("getPipelineStages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("全ステージのメタデータをHTTP 200 JSONで返す", async () => {
    const { req, res } = createMockReqRes();

    await getPipelineStages(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledTimes(1);
    const response = res.json.mock.calls[0][0];
    expect(response).toHaveProperty("stages");
    expect(Array.isArray(response.stages)).toBe(true);
  });

  test("10個のパイプラインステージを返す", async () => {
    const { req, res } = createMockReqRes();

    await getPipelineStages(req, res);

    const response = res.json.mock.calls[0][0];
    expect(response.stages).toHaveLength(10);
  });

  test("各ステージに必須フィールドが含まれる", async () => {
    const { req, res } = createMockReqRes();

    await getPipelineStages(req, res);

    const response = res.json.mock.calls[0][0];
    for (const stage of response.stages) {
      expect(stage).toHaveProperty("id");
      expect(stage).toHaveProperty("name");
      expect(stage).toHaveProperty("description");
      expect(stage).toHaveProperty("defaultModel");
      expect(stage).toHaveProperty("defaultPrompt");
      expect(stage).toHaveProperty("order");
    }
  });

  test("ステージが order フィールドで昇順に並ぶ", async () => {
    const { req, res } = createMockReqRes();

    await getPipelineStages(req, res);

    const response = res.json.mock.calls[0][0];
    const orders = response.stages.map((s) => s.order);
    const sortedOrders = [...orders].sort((a, b) => a - b);
    expect(orders).toEqual(sortedOrders);
  });

  test("PIPELINE_STAGES 定数と一致するデータを返す", async () => {
    const { req, res } = createMockReqRes();

    await getPipelineStages(req, res);

    const response = res.json.mock.calls[0][0];
    expect(response.stages).toEqual(PIPELINE_STAGES);
  });
});

describe("getThemeTransparency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("テーマが存在しない場合は404を返す", async () => {
    Theme.findById.mockResolvedValue(null);
    const { req, res } = createMockReqRes({ themeId: "存在しないテーマID" });

    await getThemeTransparency(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(String) })
    );
  });

  test("テーマに showTransparency=null のとき SiteConfig の値を使用する", async () => {
    Theme.findById.mockResolvedValue({
      _id: "テーマID001",
      showTransparency: null,
    });
    SiteConfig.findOne.mockResolvedValue({
      showTransparency: true,
    });
    const { req, res } = createMockReqRes({ themeId: "テーマID001" });

    await getThemeTransparency(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const response = res.json.mock.calls[0][0];
    expect(response.showTransparency).toBe(true);
  });

  test("テーマに showTransparency=false のとき SiteConfig より優先される", async () => {
    Theme.findById.mockResolvedValue({
      _id: "テーマID002",
      showTransparency: false,
    });
    SiteConfig.findOne.mockResolvedValue({
      showTransparency: true,
    });
    const { req, res } = createMockReqRes({ themeId: "テーマID002" });

    await getThemeTransparency(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const response = res.json.mock.calls[0][0];
    expect(response.showTransparency).toBe(false);
  });

  test("SiteConfig が存在しない場合はデフォルト true を使用する", async () => {
    Theme.findById.mockResolvedValue({
      _id: "テーマID003",
      showTransparency: null,
    });
    SiteConfig.findOne.mockResolvedValue(null);
    const { req, res } = createMockReqRes({ themeId: "テーマID003" });

    await getThemeTransparency(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const response = res.json.mock.calls[0][0];
    expect(response.showTransparency).toBe(true);
  });

  test("レスポンスに stages フィールドが含まれる", async () => {
    Theme.findById.mockResolvedValue({
      _id: "テーマID004",
      showTransparency: true,
    });
    SiteConfig.findOne.mockResolvedValue({ showTransparency: true });
    const { req, res } = createMockReqRes({ themeId: "テーマID004" });

    await getThemeTransparency(req, res);

    const response = res.json.mock.calls[0][0];
    expect(response).toHaveProperty("stages");
    expect(response.stages).toHaveLength(10);
  });
});
