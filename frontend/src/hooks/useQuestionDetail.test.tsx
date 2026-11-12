import { ok } from "neverthrow";
/**
 * useQuestionDetail のテスト
 *
 * 目的: 重要論点の詳細を取得し、課題・解決策と重要論点の紐付けが終わった通知（extraction-update）を
 *       受けたときに、ページを更新しなくても詳細を取り直すことを検証する。
 *       取り直しの間は読み込み中にしない（読み込み中の表示に切り替わると、開いているチャットが消えるため）。
 * 前提: apiClient と socketClient はモックする。
 *       フックの戻り値は、フックを呼ぶだけの小さな部品を描画して読み取る。
 */
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtractionUpdateEvent } from "../services/socket/socketClient";
import type { QuestionDetailResponse } from "./useQuestionDetail";

const mocks = vi.hoisted(() => {
  const extractionUpdateCallbacks: Array<(event: unknown) => void> = [];
  return {
    extractionUpdateCallbacks,
    getQuestionDetails: vi.fn(),
    subscribeToTheme: vi.fn(),
    unsubscribeFromTheme: vi.fn(),
    unsubscribeExtractionUpdate: vi.fn(),
  };
});

vi.mock("../services/api/apiClient", () => ({
  apiClient: { getQuestionDetails: mocks.getQuestionDetails },
}));
vi.mock("../services/socket/socketClient", () => ({
  socketClient: {
    subscribeToTheme: mocks.subscribeToTheme,
    unsubscribeFromTheme: mocks.unsubscribeFromTheme,
    onExtractionUpdate: (callback: (event: unknown) => void) => {
      mocks.extractionUpdateCallbacks.push(callback);
      return mocks.unsubscribeExtractionUpdate;
    },
  },
}));

import { useQuestionDetail } from "./useQuestionDetail";

type HookResult = ReturnType<typeof useQuestionDetail>;

const THEME_ID = "650000000000000000000001";
const QUESTION_ID = "650000000000000000000002";

/** 関連する課題を指定して、質問詳細の API レスポンスを作る */
function buildDetail(problemStatements: string[]): QuestionDetailResponse {
  return {
    question: {
      _id: QUESTION_ID,
      questionText: "定例会議の時間をどう短くするか",
      voteCount: 0,
    },
    relatedProblems: problemStatements.map((statement, index) => ({
      _id: `problem-${index}`,
      statement,
      relevanceScore: 0.9,
    })),
    relatedSolutions: [],
  } as unknown as QuestionDetailResponse;
}

/** 紐付けの完了通知を、登録済みのコールバックすべてに届ける */
function emitExtractionUpdate(event: ExtractionUpdateEvent): void {
  for (const callback of mocks.extractionUpdateCallbacks) {
    callback(event);
  }
}

const linkedProblemEvent = {
  type: "problem",
  data: { _id: "problem-1", statement: "資料が当日配布で議論が浅くなる" },
} as unknown as ExtractionUpdateEvent;

/** 保留中の Promise（API のモックの応答）を処理しきるまで待つ */
async function flushPromises(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("useQuestionDetail", () => {
  let container: HTMLDivElement;
  let root: Root;
  /** 最後に描画したときのフックの戻り値 */
  let latest: HookResult;

  /** フックを呼び、戻り値を latest に記録するだけの部品 */
  function HookProbe() {
    latest = useQuestionDetail(THEME_ID, QUESTION_ID);
    return null;
  }

  /** フックを描画し、初回の取得が終わるまで待つ */
  async function renderHookAndWait(): Promise<void> {
    act(() => {
      root.render(<HookProbe />);
    });
    await flushPromises();
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.extractionUpdateCallbacks.length = 0;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("紐付けの完了通知を受けたら、読み込み中にせずに詳細を取り直すこと", async () => {
    mocks.getQuestionDetails
      .mockResolvedValueOnce(ok(buildDetail(["会議が長引いて結論が出ない"])))
      .mockResolvedValueOnce(
        ok(
          buildDetail([
            "会議が長引いて結論が出ない",
            "資料が当日配布で議論が浅くなる",
          ])
        )
      );

    await renderHookAndWait();
    expect(latest.isLoading).toBe(false);
    expect(latest.questionDetail?.relatedProblems).toHaveLength(1);

    act(() => emitExtractionUpdate(linkedProblemEvent));

    // 取り直しの最中も、読み込み中にはならない
    expect(latest.isLoading).toBe(false);
    await flushPromises();
    expect(latest.questionDetail?.relatedProblems).toHaveLength(2);
    expect(latest.isLoading).toBe(false);
  });

  it("テーマのルームを購読し、アンマウント時に購読をやめること", async () => {
    mocks.getQuestionDetails.mockResolvedValue(ok(buildDetail([])));

    await renderHookAndWait();
    expect(mocks.subscribeToTheme).toHaveBeenCalledWith(THEME_ID);

    act(() => {
      root.render(null);
    });

    expect(mocks.unsubscribeExtractionUpdate).toHaveBeenCalled();
    expect(mocks.unsubscribeFromTheme).toHaveBeenCalledWith(THEME_ID);
  });
});
