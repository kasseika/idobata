/**
 * 他の人の意見への反応（issue #177）
 *
 * 目的: 参加者が他の人の意見（課題・解決策）に反応して論点チャットを始めるときの、
 *       起点の型と反応の表示文を1か所で定義する。
 * 注意: 反応の表示文は、バックエンドが参加者の発言として保存する文
 *       （idea-discussion/backend/constants/defaultPrompts.ts の OPINION_REACTION_MESSAGES）と同じにする。
 *       履歴を読み直したときと、送信直後の表示を揃えるため。
 */

/** 反応の種類。agree は「私もそう思う」、differ は「自分の場合は少し違う」 */
export type OpinionReaction = "agree" | "differ";

/** 起点にした意見と、それへの反応 */
export interface OpinionOrigin {
  type: "problem" | "solution";
  id: string;
  reaction: OpinionReaction;
}

/** 反応のボタンとチャットに表示する文（表示順に並べる） */
export const OPINION_REACTION_LABELS: Record<OpinionReaction, string> = {
  agree: "私もそう思う",
  differ: "自分の場合は少し違う",
};

/**
 * コメント画面から論点ページへ移動して、意見を起点に対話を始めるための指示
 *
 * 用途: コメント画面にはチャットがないため、反応したら論点ページへ移動し、そこで対話を始める。
 *       この指示はページ遷移の状態（location.state の opinionStart）で渡す。
 */
export interface PendingOpinionStart {
  origin: OpinionOrigin;
  opinionText: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/**
 * ページ遷移の状態から、意見を起点に対話を始める指示を読み取る
 *
 * @param state location.state（ブラウザの履歴に残るため形は保証されない）
 * @returns 正しい形の指示。無い、または形が不正なら null
 */
export const readPendingOpinionStart = (
  state: unknown
): PendingOpinionStart | null => {
  if (!isRecord(state) || !isRecord(state.opinionStart)) return null;
  const { origin, opinionText } = state.opinionStart;
  if (!isRecord(origin) || typeof opinionText !== "string") return null;
  const { type, id, reaction } = origin;
  if (
    (type !== "problem" && type !== "solution") ||
    typeof id !== "string" ||
    (reaction !== "agree" && reaction !== "differ")
  ) {
    return null;
  }
  return { origin: { type, id, reaction }, opinionText };
};
