/**
 * QuestionDetail（重要論点のページ）のテスト
 *
 * 目的: 「ほかの人の意見」に、重要論点に紐付いた課題・解決策だけが表示されることを検証する。
 *       - 抽出の通知（new-extraction）を受けても、紐付けが終わっていない意見は一覧に足さない
 *       - 詳細を取り直して紐付いた意見が増えたら、ページを更新しなくても表示される
 *       あわせて、詳細を取り直してもチャットを作り直さないことを検証する
 *       （作り直すと、スレッドの購読が外れ、チャットの状態が初期化されるため）。
 * 前提: 詳細の取得（useQuestionDetail）・テーマの取得・認証・Socket.IO・チャットの管理はモックする。
 *       参加者の userId は、チャットを作るテストでだけ設定する。
 *       レポートなど、この検証に関係しない子コンポーネントは空の部品に置き換える。
 */
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QuestionDetailResponse } from "../hooks/useQuestionDetail";
import type { NewExtractionEvent } from "../services/socket/socketClient";

const mocks = vi.hoisted(() => ({
  questionDetail: null as unknown,
  userId: undefined as string | undefined,
  newExtractionCallbacks: [] as Array<(event: unknown) => void>,
  createdChatManagers: 0,
}));

vi.mock("../hooks/useQuestionDetail", () => ({
  useQuestionDetail: () => ({
    questionDetail: mocks.questionDetail,
    isLoading: false,
    error: null,
  }),
}));
vi.mock("../hooks/useThemeDetail", () => ({
  useThemeDetail: () => ({
    themeDetail: { theme: { title: "定例会議の在り方", status: "active" } },
  }),
}));
vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: mocks.userId } }),
}));
vi.mock("../services/chatManagers/QuestionChatManager", () => ({
  QuestionChatManager: class {
    constructor() {
      mocks.createdChatManagers += 1;
    }
    cleanup() {}
  },
}));
vi.mock("../services/socket/socketClient", () => ({
  socketClient: {
    subscribeToTheme: vi.fn(),
    unsubscribeFromTheme: vi.fn(),
    onNewExtraction: (callback: (event: unknown) => void) => {
      mocks.newExtractionCallbacks.push(callback);
      return () => {};
    },
  },
}));
vi.mock("../components/chat", () => ({ FloatingChat: () => null }));
vi.mock("../components/question/DebatePointsContent", () => ({
  default: () => null,
}));
vi.mock("../components/question/IllustrationReportCard", () => ({
  default: () => null,
}));
vi.mock("../components/question/IllustrationSummaryContent", () => ({
  default: () => null,
}));
vi.mock("../components/question/OpinionSummaryContent", () => ({
  default: () => null,
}));
vi.mock("../components/question/ReportCard", () => ({ default: () => null }));
vi.mock("../components/question/ThemePromptSection", () => ({
  default: () => null,
}));

import { MockProvider } from "../contexts/MockContext";
import QuestionDetail from "./QuestionDetail";

const THEME_ID = "650000000000000000000001";
const QUESTION_ID = "650000000000000000000002";

/** 紐付いた課題の文面を指定して、重要論点の詳細を作る */
function buildDetail(problemStatements: string[]): QuestionDetailResponse {
  return {
    question: {
      _id: QUESTION_ID,
      questionText: "定例会議の時間をどう短くするか",
      tagLine: "会議の時間",
      tags: [],
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

/** 重要論点のページの要素ツリーを作る（ルーターとモックモードの文脈を含む） */
function buildPageTree() {
  return (
    <MemoryRouter
      initialEntries={[`/themes/${THEME_ID}/questions/${QUESTION_ID}`]}
    >
      <MockProvider>
        <Routes>
          <Route
            path="/themes/:themeId/questions/:qId"
            element={<QuestionDetail />}
          />
        </Routes>
      </MockProvider>
    </MemoryRouter>
  );
}

describe("QuestionDetail のほかの人の意見", () => {
  let container: HTMLDivElement;
  let root: Root;

  /** ページを描画する（2回目以降の呼び出しは、同じ root での再描画になる） */
  function renderPage(): void {
    act(() => {
      root.render(buildPageTree());
    });
  }

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.newExtractionCallbacks.length = 0;
    mocks.userId = undefined;
    mocks.createdChatManagers = 0;
    // jsdom には matchMedia がないため、画面幅の判定に使う部分を広い画面として固定する
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    );
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  it("抽出の通知を受けても、紐付けが終わっていない課題は表示しないこと", () => {
    mocks.questionDetail = buildDetail(["会議が長引いて結論が出ない"]);
    renderPage();
    expect(container.textContent).toContain("会議が長引いて結論が出ない");

    // 前提: 別の話題の課題が抽出された（この重要論点にはまだ紐付いていない）
    const unlinkedProblem = {
      type: "problem",
      data: {
        _id: "problem-unlinked",
        statement: "社内チャットの通知が多すぎる",
      },
    } as unknown as NewExtractionEvent;
    act(() => {
      for (const callback of mocks.newExtractionCallbacks) {
        callback(unlinkedProblem);
      }
    });

    expect(container.textContent).not.toContain("社内チャットの通知が多すぎる");
  });

  it("詳細を取り直して紐付いた課題が増えたら、更新しなくても表示されること", () => {
    mocks.questionDetail = buildDetail(["会議が長引いて結論が出ない"]);
    renderPage();
    expect(container.textContent).not.toContain(
      "資料が当日配布で議論が浅くなる"
    );

    // 前提: 紐付けが終わり、取り直した詳細に課題が1件増えた
    mocks.questionDetail = buildDetail([
      "会議が長引いて結論が出ない",
      "資料が当日配布で議論が浅くなる",
    ]);
    renderPage();

    expect(container.textContent).toContain("資料が当日配布で議論が浅くなる");
  });

  it("詳細を取り直しても、チャットを作り直さないこと", () => {
    // 前提: 参加者の端末の userId があり、チャットが作られる
    mocks.userId = "uuid-営業部の佐藤さんの端末";
    mocks.questionDetail = buildDetail(["会議が長引いて結論が出ない"]);
    renderPage();
    expect(mocks.createdChatManagers).toBe(1);

    // 紐付けが終わり、詳細を取り直した（重要論点の文面は変わらない）
    mocks.questionDetail = buildDetail([
      "会議が長引いて結論が出ない",
      "資料が当日配布で議論が浅くなる",
    ]);
    renderPage();

    expect(mocks.createdChatManagers).toBe(1);
  });
});
