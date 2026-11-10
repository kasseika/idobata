/**
 * 「その他の意見」の生成
 *
 * 目的: 重要論点に拾われなかった意見を、テーマごとにまとめる（issue #147）。
 *       #146 の追加実験では、匿名投稿の40%がどの重要論点にもリンクされず、参加者向けの集約に現れなかった。
 * 仕様:
 *   - 材料は、テーマの課題のうち、表示される重要論点のどれにも relevanceScore
 *     CONTRIBUTION_MIN_RELEVANCE_SCORE 以上でリンクされていないもの。
 *     リンクがない課題・弱いリンクしかない課題・k で非表示の論点にだけリンクされた課題が入る
 *   - LLM で趣旨が近い課題をグループに分け、グループごとに要約させる
 *   - k が有効なテーマでは、次の条件をかける
 *     - 書き手が分からない課題は材料に入れない。LLM には userId ではなく書き手の記号（a1, a2 …）を渡す
 *     - 各グループの異なる書き手をサーバーで数え、k 人以上のグループだけを保存する
 *     - 材料の書き手が k 人未満なら、LLM を呼ばずにグループのない版を保存する
 *     - 要約に原文がほぼそのまま含まれていれば書き直させ、含まれたままなら保存しない
 *   - 結果は上書きせず、版を重ねて保存する
 * 注意: プロンプトはパイプライン設定（Theme.pipelineConfig）で上書きできない。
 *       脅威モデルに管理者を含むため（#146）、k が有効なテーマで管理者が条件を外せないようにする。
 */
import OtherOpinions from "../models/OtherOpinions.js";
import Problem from "../models/Problem.js";
import QuestionLink from "../models/QuestionLink.js";
import SharpQuestion from "../models/SharpQuestion.js";
import Theme from "../models/Theme.js";
import { type LLMMessage, callLLM } from "../services/llmService.js";
import {
  CONTRIBUTION_MIN_RELEVANCE_SCORE,
  resolveAuthorIds,
  selectVisibleQuestions,
} from "../services/minContributorsService.js";
import { generateWithoutVerbatimQuotes } from "../services/verbatimQuoteCheck.js";
import type { IOtherOpinions } from "../types/index.js";

/** 「その他の意見」の生成に使うモデル（政策ドラフト・レポート例と同じ） */
const OTHER_OPINIONS_MODEL = "google/gemini-3.1-pro-preview";

/** LLM に渡す1件の意見 */
interface OpinionInput {
  id: string;
  /** 書き手の記号（k が有効なテーマだけ） */
  author?: string;
  text: string;
}

/** LLM が返すグループ */
interface GroupOutput {
  summary: string;
  memberIds: string[];
}

/** LLM の出力が、想定どおりのグループの一覧かを確かめる */
const isGroupsOutput = (value: unknown): value is { groups: GroupOutput[] } => {
  if (typeof value !== "object" || value === null || !("groups" in value)) {
    return false;
  }
  const { groups } = value;
  return (
    Array.isArray(groups) &&
    groups.every(
      (group: unknown) =>
        typeof group === "object" &&
        group !== null &&
        "summary" in group &&
        typeof group.summary === "string" &&
        group.summary !== "" &&
        "memberIds" in group &&
        Array.isArray(group.memberIds) &&
        group.memberIds.every((id: unknown) => typeof id === "string")
    )
  );
};

/**
 * システムプロンプトを作る
 *
 * @param minContributors - テーマの k。null なら k が無効なテーマ（書き手の条件をかけない）
 */
const buildSystemPrompt = (minContributors: number | null): string => {
  const rules =
    minContributors === null
      ? [
          "趣旨が近い意見を同じグループにまとめてください。1つの意見は、1つのグループにだけ入れてください。",
          "趣旨の近い意見がない意見は、その意見だけでグループにしてください。",
          "要約には、グループの意見の多くに共通する趣旨を書いてください。",
          "意見の言い回しを写さず、自分の言葉で書いてください。",
          "要約は1〜3文の日本語で書いてください。",
        ]
      : [
          `各グループには、異なる書き手が ${minContributors} 人以上含まれるようにしてください。同じ書き手の意見が複数あっても、1人と数えます。`,
          "趣旨が近い意見を同じグループにまとめてください。1つの意見は、1つのグループにだけ入れてください。",
          "要約には、グループの意見の多くに共通する趣旨だけを書いてください。一部の書き手だけに当てはまる具体的な事情は書かないでください。",
          "部署名・職種・役職・担当業務の名前、年代・勤続年数・家庭の事情、固有の製品・取引先・システム・プロジェクト・出来事、具体的な数値など、書いた人を絞り込める情報は書かないでください。どの部署の人にも当てはまる表現に言い換えてください。",
          "意見の言い回しを写さず、自分の言葉で書いてください。",
          "要約は1〜3文の日本語で書いてください。",
          `${minContributors} 人以上をまとめられない意見は、無理にグループに入れず、どのグループにも入れないでください。`,
        ];
  const inputDescription =
    minContributors === null
      ? "入力の意見は、それぞれ ID（id）を持ちます。"
      : "入力の意見は、それぞれ ID（id）と書き手の記号（author。a1, a2 …）を持ちます。同じ記号は同じ書き手を表します。書き手が誰かは分かりません。";

  return `あなたは、職場で集めた意見のうち、重要論点に拾われなかったものをまとめる担当です。

${inputDescription}
次の規則で意見をグループに分け、グループごとに要約を書いてください。

${rules.map((rule, i) => `${i + 1}. ${rule}`).join("\n")}

出力は次の形式の JSON だけにしてください。
{"groups": [{"summary": "要約", "memberIds": ["意見の ID", ...]}]}`;
};

/**
 * 表示される重要論点のどれにも強くリンクされていない課題を集める
 *
 * @param themeId - 対象のテーマ
 * @returns 材料にする課題（_id・statement・sourceType・sourceOriginId）
 */
const findUncoveredProblems = async (themeId: string) => {
  const questions = await SharpQuestion.find({ themeId })
    .select("_id themeId")
    .lean();
  const { visibleQuestions } = await selectVisibleQuestions(questions);

  const links = await QuestionLink.find({
    questionId: { $in: visibleQuestions.map((q) => q._id) },
    linkedItemType: "problem",
  }).lean();
  // スコアの閾値はクエリではなくここで判定する（スコアのないリンクを確実に除くため）
  const coveredProblemIds = new Set(
    links
      .filter(
        (link) =>
          typeof link.relevanceScore === "number" &&
          link.relevanceScore >= CONTRIBUTION_MIN_RELEVANCE_SCORE
      )
      .map((link) => String(link.linkedItemId))
  );

  const problems = await Problem.find({ themeId })
    .select("statement sourceType sourceOriginId")
    .lean();
  return problems.filter((p) => !coveredProblemIds.has(String(p._id)));
};

/**
 * テーマの「その他の意見」を生成して保存する
 *
 * @param themeId - 対象のテーマ
 * @returns 保存した「その他の意見」
 * @throws テーマが見つからない場合、LLM の出力が想定の形でない場合
 * @throws VerbatimQuoteError k が有効なテーマで、何度生成しても要約に原文が含まれていた場合
 */
export const generateOtherOpinions = async (
  themeId: string
): Promise<IOtherOpinions> => {
  const theme = await Theme.findById(themeId).select("minContributors").lean();
  if (theme === null) {
    throw new Error(`Theme not found: ${themeId}`);
  }
  // フィールドがない既存のテーマ（undefined）と null は、k 無効として扱う
  const minContributors =
    typeof theme.minContributors === "number" ? theme.minContributors : null;

  const uncoveredProblems = await findUncoveredProblems(themeId);

  // 材料にする意見と、意見 ID → 書き手（k が有効なテーマだけ）
  let opinions: OpinionInput[];
  let authorByOpinionId = new Map<string, string>();
  if (minContributors === null) {
    opinions = uncoveredProblems.map((p) => ({
      id: String(p._id),
      text: p.statement,
    }));
  } else {
    const authorIds = await resolveAuthorIds(uncoveredProblems);
    // 書き手が分からない課題は、人数を数えられないため材料に入れない
    const authoredProblems = uncoveredProblems.filter((p) =>
      authorIds.has(String(p._id))
    );
    authorByOpinionId = new Map(
      authoredProblems.map((p) => [
        String(p._id),
        authorIds.get(String(p._id)) as string,
      ])
    );
    // userId は LLM に渡さず、出てきた順に振った記号に置き換える
    const tagByAuthorId = new Map<string, string>();
    for (const authorId of authorByOpinionId.values()) {
      if (!tagByAuthorId.has(authorId)) {
        tagByAuthorId.set(authorId, `a${tagByAuthorId.size + 1}`);
      }
    }
    opinions = authoredProblems.map((p) => ({
      id: String(p._id),
      author: tagByAuthorId.get(authorByOpinionId.get(String(p._id)) ?? ""),
      text: p.statement,
    }));
  }

  const canMeetMinContributors =
    minContributors === null ||
    new Set(authorByOpinionId.values()).size >= minContributors;

  let groups: GroupOutput[] = [];
  if (opinions.length > 0 && canMeetMinContributors) {
    const messages: LLMMessage[] = [
      { role: "system", content: buildSystemPrompt(minContributors) },
      { role: "user", content: JSON.stringify({ opinions }) },
    ];
    // k が有効なテーマでは、要約に原文がほぼそのまま含まれていれば書き直させる
    const output = await generateWithoutVerbatimQuotes({
      themeId,
      statements: opinions.map((o) => o.text),
      messages,
      generate: async (attemptMessages) => {
        const response = await callLLM(
          attemptMessages,
          true,
          OTHER_OPINIONS_MODEL
        );
        if (!isGroupsOutput(response)) {
          throw new Error(
            "Invalid response format from LLM for other opinions generation."
          );
        }
        return response;
      },
    });
    groups = output.groups;
  } else {
    console.log(
      `[OtherOpinionsGenerator] Theme ${themeId} has no opinions that can be summarized. Saving an empty version.`
    );
  }

  // 材料にない ID を捨て、前のグループに入った意見は数えない
  const materialIds = new Set(opinions.map((o) => o.id));
  const usedIds = new Set<string>();
  const acceptedGroups = groups.flatMap((group) => {
    const memberIds = [...new Set(group.memberIds)].filter(
      (id) => materialIds.has(id) && !usedIds.has(id)
    );
    const meetsMinContributors =
      minContributors === null
        ? memberIds.length > 0
        : new Set(memberIds.map((id) => authorByOpinionId.get(id))).size >=
          minContributors;
    if (!meetsMinContributors) {
      return [];
    }
    for (const id of memberIds) {
      usedIds.add(id);
    }
    return [{ summary: group.summary, problemIds: memberIds }];
  });

  const latest = await OtherOpinions.findOne({ themeId }).sort({
    version: -1,
  });
  const otherOpinions = new OtherOpinions({
    themeId,
    groups: acceptedGroups,
    version: latest ? latest.version + 1 : 1,
  });
  await otherOpinions.save();
  console.log(
    `[OtherOpinionsGenerator] Saved other opinions (version ${otherOpinions.version}, ${acceptedGroups.length} groups) for theme ${themeId}`
  );
  return otherOpinions;
};
