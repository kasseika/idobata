/**
 * トップページコントローラー
 *
 * 目的: トップページ表示に必要なテーマ・質問・意見のデータを一括取得するAPIを提供する。
 * 注意: 最小寄与人数 k が有効なテーマの課題・解決策は「最新の意見」に含めず、
 *       k 人未満しか寄与していない重要論点は「最新の論点」に含めない（issue #146）。
 */

import type { Request, Response } from "express";
import { hidesIndividualOpinions } from "../constants/minContributors.js";
import ChatThread from "../models/ChatThread.js";
import Like from "../models/Like.js";
import Problem from "../models/Problem.js";
import QuestionLink from "../models/QuestionLink.js";
import SharpQuestion from "../models/SharpQuestion.js";
import Solution from "../models/Solution.js";
import Theme from "../models/Theme.js";
import {
  omitProblemReferences,
  selectVisibleQuestions,
} from "../services/minContributorsService.js";
import type { ISharpQuestion, ITheme } from "../types/index.js";
import { getUser } from "./userController.js";

/** トップページに出す最新の論点の上限件数 */
const LATEST_QUESTIONS_LIMIT = 100;

/** 投稿者名を出さないときに表示する名前 */
const ANONYMOUS_AUTHOR_NAME = "匿名ユーザー";

/**
 * トップページ用のテーマ・質問・意見データを取得する
 */
export const getTopPageData = async (req: Request, res: Response) => {
  const anonymizeAuthorNames = process.env.ANONYMIZE_AUTHOR_NAMES === "true";
  try {
    const themeStatusFilter = { status: { $in: ["active", "closed"] } };

    // トップページ表示用テーマ一覧（新着順・上限100件）
    const themes = await Theme.find(themeStatusFilter)
      .sort({ createdAt: -1 })
      .limit(100);

    // フィード用テーマ ID 一覧（表示上限と分離し、全 active/closed テーマを対象にする）
    // 理由: themes は表示用に100件に絞っているため、101件目以降のテーマの意見が欠落しないようにする
    const visibleThemes = await Theme.find(themeStatusFilter)
      .select("_id minContributors")
      .lean();
    // k が有効なテーマ（個々の意見を隠すテーマ）と、無効なテーマに分ける
    const protectedThemeIds = visibleThemes
      .filter((t) => hidesIndividualOpinions(t))
      .map((t) => t._id);
    const protectedThemeIdSet = new Set(protectedThemeIds.map(String));
    // 個々の意見を出してよいテーマ（k が無効なテーマ）だけを、最新の意見の対象にする
    const opinionThemeIds = visibleThemes
      .filter((t) => !hidesIndividualOpinions(t))
      .map((t) => t._id);

    // active/closed テーマに属する論点のうち、k を満たすものを新しい順に最大100件取得する。
    // k が有効なテーマの論点は、全件を k で絞ってから他のテーマの論点と合わせる。
    // 理由: 先に100件に絞ると、k を満たさない新しい論点が枠を占め、表示できる論点が欠けるため。
    //       k が有効なテーマは少人数の研修向けで論点の数も少ないため、全件を取得する。
    const [openThemeQuestions, protectedThemeQuestions] = await Promise.all([
      SharpQuestion.find({ themeId: { $in: opinionThemeIds } })
        .sort({ createdAt: -1 })
        .limit(LATEST_QUESTIONS_LIMIT),
      SharpQuestion.find({ themeId: { $in: protectedThemeIds } }).sort({
        createdAt: -1,
      }),
    ]);
    const { visibleQuestions: visibleProtectedQuestions } =
      await selectVisibleQuestions(protectedThemeQuestions);
    const questions = [...openThemeQuestions, ...visibleProtectedQuestions]
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      .slice(0, LATEST_QUESTIONS_LIMIT);

    // Get latest problems and solutions (active/closed かつ k が無効なテーマのみ)
    const latestProblems = await Problem.find({
      themeId: { $in: opinionThemeIds },
    })
      .sort({ createdAt: -1 })
      .limit(15)
      .populate<{ themeId: ITheme }>("themeId");

    const latestSolutions = await Solution.find({
      themeId: { $in: opinionThemeIds },
    })
      .sort({ createdAt: -1 })
      .limit(15)
      .populate<{ themeId: ITheme }>("themeId");

    // Combine and sort opinions by creation date
    const allOpinions = [
      ...latestProblems.map((p) => ({
        _id: p._id,
        type: "problem" as const,
        statement: p.statement,
        themeId: p.themeId,
        createdAt: p.createdAt,
      })),
      ...latestSolutions.map((s) => ({
        _id: s._id,
        type: "solution" as const,
        statement: s.statement,
        themeId: s.themeId,
        createdAt: s.createdAt,
      })),
    ]
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      .slice(0, 15);

    // Get sharp question details for opinions
    const opinionsWithQuestions = await Promise.all(
      allOpinions.map(async (opinion) => {
        // Find which sharp question this opinion is linked to
        const questionLink = await QuestionLink.findOne({
          linkedItemId: opinion._id,
          linkedItemType: opinion.type,
        }).populate<{ questionId: ISharpQuestion }>("questionId");

        // Get author info from chat thread
        const chatThread = await ChatThread.findOne({
          $or: [
            { extractedProblemIds: opinion._id },
            { extractedSolutionIds: opinion._id },
          ],
        });

        let authorName = ANONYMOUS_AUTHOR_NAME;
        // 企業研修用のインスタンスでは、少人数の参加者が表示名から特定されないよう名前を出さない
        if (!anonymizeAuthorNames && chatThread?.userId) {
          const user = await getUser(chatThread.userId);
          if (user?.displayName) {
            authorName = user.displayName;
          }
        }

        // Get like and comment counts
        const likeCount = await Like.countDocuments({
          targetId: opinion._id,
          targetType: opinion.type,
        });

        return {
          id: opinion._id,
          type: opinion.type,
          text: opinion.statement,
          authorName,
          questionTitle:
            questionLink?.questionId?.questionText ||
            opinion.themeId?.title ||
            "質問",
          questionTagline: questionLink?.questionId?.tagLine || "",
          questionId: questionLink?.questionId?._id || "",
          themeId: opinion.themeId?._id || "",
          themeName: opinion.themeId?.title || "",
          createdAt: opinion.createdAt,
          likeCount,
          commentCount: 0, // You can implement comment counting if needed
        };
      })
    );

    const enhancedThemes = await Promise.all(
      themes.map(async (theme) => {
        const keyQuestionCount = await SharpQuestion.countDocuments({
          themeId: theme._id,
        });

        const commentCount = await ChatThread.countDocuments({
          themeId: theme._id,
        });

        return {
          _id: theme._id,
          title: theme.title,
          description: theme.description || "",
          status: theme.status,
          keyQuestionCount,
          commentCount,
        };
      })
    );

    const enhancedQuestions = await Promise.all(
      questions.map(async (question) => {
        const questionId = question._id;

        const issueCount = await QuestionLink.countDocuments({
          questionId,
          linkedItemType: "problem",
        });

        const solutionCount = await QuestionLink.countDocuments({
          questionId,
          linkedItemType: "solution",
        });

        const likeCount = await Like.countDocuments({
          targetId: questionId,
          targetType: "question",
        });

        // Get unique participant count from chat threads
        const uniqueParticipantCount = await ChatThread.distinct("userId", {
          themeId: question.themeId,
        }).then((userIds) => userIds.filter((userId) => userId).length);

        // k が有効なテーマの論点からは、個々の課題の ID を持つフィールドを除く
        const questionObject = protectedThemeIdSet.has(String(question.themeId))
          ? omitProblemReferences(question.toObject())
          : question.toObject();

        return {
          ...questionObject,
          issueCount,
          solutionCount,
          likeCount,
          uniqueParticipantCount,
        };
      })
    );

    return res.status(200).json({
      latestThemes: enhancedThemes,
      latestQuestions: enhancedQuestions,
      latestOpinions: opinionsWithQuestions,
    });
  } catch (error) {
    console.error("Error fetching top page data:", error);
    return res.status(500).json({
      message: "Error fetching top page data",
      error: (error as Error).message,
    });
  }
};
