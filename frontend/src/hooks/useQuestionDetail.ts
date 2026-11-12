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
 */
import { useCallback, useEffect, useState } from "react";
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

  /**
   * 通知を受けて詳細を取り直す
   * 注意: 失敗しても error にはしない。error にするとページ全体がエラー表示に切り替わり、
   *       表示中の詳細と開いているチャットが消えるため。失敗は記録し、表示中の詳細をそのまま残す。
   */
  const refetchQuietly = useCallback(async () => {
    const result = await apiClient.getQuestionDetails(questionId, themeId);
    if (!result.isOk()) {
      console.error(
        "Failed to refetch question detail after linking:",
        result.error
      );
      return;
    }
    setQuestionDetail(result.value);
  }, [themeId, questionId]);

  useEffect(() => {
    const fetchQuestionDetail = async () => {
      setIsLoading(true);
      setError(null);

      const result = await apiClient.getQuestionDetails(questionId, themeId);

      if (!result.isOk()) {
        setError(`質問の取得に失敗しました: ${result.error.message}`);
        console.error("Error fetching question detail:", result.error);
        setIsLoading(false);
        return;
      }

      setQuestionDetail(result.value);
      setIsLoading(false);
    };

    fetchQuestionDetail();
  }, [themeId, questionId]);

  // 紐付けの完了通知を受けたら、詳細を取り直す
  useEffect(() => {
    if (!themeId) return;

    socketClient.subscribeToTheme(themeId);
    const unsubscribeExtractionUpdate = socketClient.onExtractionUpdate(() => {
      void refetchQuietly();
    });

    return () => {
      unsubscribeExtractionUpdate();
      socketClient.unsubscribeFromTheme(themeId);
    };
  }, [themeId, refetchQuietly]);

  return { questionDetail, isLoading, error };
}
