/**
 * 重要論点の詳細を取得するフック
 *
 * 目的: 重要論点（SharpQuestion）の詳細と、紐付いた課題・解決策を取得する。
 *       課題・解決策と重要論点の紐付けが終わった通知（Socket.IO の extraction-update）を受けたら、
 *       ページを更新しなくても新しい紐付けが見えるように、詳細を取り直す。
 * 注意: 取り直しの間は isLoading を true にしない。読み込み中の表示に切り替わると、
 *       開いているチャットが消えてしまうため。
 *       抽出の通知（new-extraction）では取り直さない。抽出した直後はまだ紐付けが終わっておらず、
 *       どの重要論点に関係するかが決まっていないため。
 *       取得は通知のたびに並行して走りうるため、最後に始めた取得の応答だけを反映する
 *       （先に始めた取得の古い応答が、後から返って新しい詳細を上書きしないようにするため）。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "../services/api/apiClient";
import { socketClient } from "../services/socket/socketClient";
import type { Question, RelatedProblem, RelatedSolution } from "../types";

export interface QuestionDetailResponse {
  question: Question & {
    voteCount: number;
  };
  debateData: {
    axes: {
      title: string;
      options: {
        label: string;
        description: string;
      }[];
    }[];
    agreementPoints: string[];
    disagreementPoints: string[];
  };
  relatedProblems: RelatedProblem[];
  relatedSolutions: RelatedSolution[];
  reportExample: {
    introduction: string;
    issues: {
      title: string;
      description: string;
    }[];
  };
  visualReport: string;
  participantCount?: number;
  dialogueCount?: number;
}

/**
 * 重要論点の詳細を取得し、紐付けの完了通知を受けたら取り直す
 * @param themeId - テーマ ID
 * @param questionId - 重要論点 ID
 * @returns 詳細・初回読み込み中かどうか・初回取得のエラー
 */
export function useQuestionDetail(themeId: string, questionId: string) {
  const [questionDetail, setQuestionDetail] =
    useState<QuestionDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** 最後に始めた取得の連番。応答が返ったとき、これと一致しなければ古い応答として捨てる */
  const latestRequestIdRef = useRef(0);
  /** 詳細を1度でも表示できたか。取り直しの失敗をエラーにするかの判断に使う */
  const hasDetailRef = useRef(false);

  /**
   * 詳細を取得する
   * @param mode - "initial" は初回の取得（読み込み中にする）、"quiet" は通知による取り直し（読み込み中にしない）
   * 注意: 最後に始めた取得の応答だけを反映する。初回の取得が取り直しに追い越された場合は、
   *       取り直しの応答で読み込み中を終える。
   *       取り直しの失敗は、詳細を表示できていればエラーにしない。エラーにするとページ全体が
   *       エラー表示に切り替わり、表示中の詳細と開いているチャットが消えるため。失敗は記録し、
   *       表示中の詳細をそのまま残す。一時的な失敗は apiClient.getQuestionDetails が再試行しており、
   *       再試行しても失敗した場合も、次の紐付けの完了通知で再び取り直す。
   *       詳細をまだ表示できていない場合は、取り直しの失敗もエラーにする（読み込み中のまま止めないため）。
   */
  const loadDetail = useCallback(
    async (mode: "initial" | "quiet") => {
      latestRequestIdRef.current += 1;
      const requestId = latestRequestIdRef.current;
      if (mode === "initial") {
        hasDetailRef.current = false;
        setIsLoading(true);
        setError(null);
      }

      const result = await apiClient.getQuestionDetails(questionId, themeId);
      if (requestId !== latestRequestIdRef.current) return;

      if (result.isOk()) {
        hasDetailRef.current = true;
        setQuestionDetail(result.value);
        setIsLoading(false);
        return;
      }

      console.error("Error fetching question detail:", result.error);
      if (mode === "initial" || !hasDetailRef.current) {
        setError(`質問の取得に失敗しました: ${result.error.message}`);
        setIsLoading(false);
      }
    },
    [themeId, questionId]
  );

  useEffect(() => {
    void loadDetail("initial");
  }, [loadDetail]);

  // 紐付けの完了通知を受けたら、詳細を取り直す
  useEffect(() => {
    if (!themeId) return;

    socketClient.subscribeToTheme(themeId);
    const unsubscribeExtractionUpdate = socketClient.onExtractionUpdate(() => {
      void loadDetail("quiet");
    });

    return () => {
      unsubscribeExtractionUpdate();
      socketClient.unsubscribeFromTheme(themeId);
    };
  }, [themeId, loadDetail]);

  return { questionDetail, isLoading, error };
}
