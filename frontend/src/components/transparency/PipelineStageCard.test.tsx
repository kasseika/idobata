/**
 * PipelineStageCard のテスト
 *
 * 目的: カスタム設定がある場合に解決済みのmodel/promptが表示され、
 *       ない場合はデフォルト値が表示されることを検証する。
 */

import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PipelineStage } from "../../services/api/apiClient";
import { PipelineStageCard } from "./PipelineStageCard";

// PromptDrawerをモックしてpropsを検証しやすくする
vi.mock("./PromptDrawer", () => ({
  PromptDrawer: ({
    stageName,
    prompt,
  }: { stageName: string; prompt: string }) => (
    <span data-testid="prompt-text" data-stage-name={stageName}>
      {prompt}
    </span>
  ),
}));

/** テスト用ステージデータの基本値 */
const baseStage: PipelineStage = {
  id: "chat",
  name: "チャット応答",
  description: "ユーザーとの対話を処理するステージ",
  defaultModel: "gpt-4o",
  defaultPrompt: "デフォルトのシステムプロンプト",
  sourceFile: "chatController.ts",
  order: 1,
};

describe("PipelineStageCard", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    root?.unmount();
    document.body.removeChild(container);
  });

  it("カスタム設定なしの場合、defaultModelとdefaultPromptが表示される", async () => {
    await act(async () => {
      root = createRoot(container);
      root.render(<PipelineStageCard stage={baseStage} />);
    });

    // モデル名はdefaultModelが表示される
    expect(container.textContent).toContain("gpt-4o");
    // プロンプトはdefaultPromptが渡される
    const promptEl = container.querySelector("[data-testid='prompt-text']");
    expect(promptEl?.textContent).toBe("デフォルトのシステムプロンプト");
  });

  it("カスタム設定ありの場合、解決済みのmodelとpromptが優先表示される", async () => {
    const customizedStage: PipelineStage = {
      ...baseStage,
      model: "gpt-4o-mini",
      prompt: "カスタムシステムプロンプト",
      isCustomized: true,
    };

    await act(async () => {
      root = createRoot(container);
      root.render(<PipelineStageCard stage={customizedStage} />);
    });

    // カスタムモデル名が表示される（defaultModelのgpt-4oではなくgpt-4o-mini）
    const badge = container.querySelector("[data-testid='model-badge']");
    expect(badge?.textContent).toBe("gpt-4o-mini");
    // カスタムプロンプトがPromptDrawerに渡される
    const promptEl = container.querySelector("[data-testid='prompt-text']");
    expect(promptEl?.textContent).toBe("カスタムシステムプロンプト");
  });

  it("isCustomized=true の場合、モデルBadgeにカスタマイズ済みを示すスタイルが適用される", async () => {
    const customizedStage: PipelineStage = {
      ...baseStage,
      model: "gpt-4o-mini",
      prompt: "カスタムシステムプロンプト",
      isCustomized: true,
    };

    await act(async () => {
      root = createRoot(container);
      root.render(<PipelineStageCard stage={customizedStage} />);
    });

    // isCustomized=true の場合、Badgeにアンバー系のクラスが付与される
    const badge = container.querySelector("[data-testid='model-badge']");
    expect(badge?.className).toContain("amber");
  });

  it("isCustomized=false の場合、モデルBadgeにデフォルトのスタイルが適用される", async () => {
    await act(async () => {
      root = createRoot(container);
      root.render(<PipelineStageCard stage={baseStage} />);
    });

    // isCustomized未指定の場合、デフォルトのblue系クラス
    const badge = container.querySelector("[data-testid='model-badge']");
    expect(badge?.className).toContain("blue");
  });
});
