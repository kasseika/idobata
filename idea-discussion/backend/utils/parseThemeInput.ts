/**
 * テーマ作成・更新リクエストボディの検証
 *
 * 目的: createTheme・updateTheme が受け取るリクエストボディを、DB のクエリに入れる前に
 *       型で検証し、検証済みの値だけで組み立て直したオブジェクトを返す（issue #149）。
 * 背景: 未検証の値をそのまま Theme.findByIdAndUpdate 等に渡すと、オブジェクトの値が
 *       MongoDB の演算子（$ で始まるキー）として解釈されうる（CodeQL 警告 #74）。
 * 注意: - 送られていないフィールド（undefined）は「変更しない」を表し、結果に含めない
 *       - pipelineConfig のキーは定義済みのステージ ID だけを受け付け、結果のキーも
 *         PIPELINE_STAGES から取る（リクエスト由来のキーをクエリに入れないため）
 *       - tags の null は、従来の挙動に合わせて空配列として扱う
 */
import { type Result, err, ok } from "neverthrow";
import {
  MIN_CONTRIBUTORS_LOWER_BOUND,
  isValidMinContributors,
} from "../constants/minContributors.js";
import { PIPELINE_STAGES } from "../constants/pipelineStages.js";
import { THEME_STATUSES } from "../constants/themeStatuses.js";
import type { IPipelineStageConfig, ITheme } from "../types/index.js";

/** 検証済みのテーマ入力。各フィールドは送られた場合だけ存在する */
interface ThemeInput {
  title?: string;
  description?: string;
  status?: ITheme["status"];
  customPrompt?: string;
  tags?: string[];
  pipelineConfig?: Record<string, IPipelineStageConfig>;
  minContributors?: number | null;
}

/** 値がプレーンなオブジェクト（配列・null でない）かを判定する */
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** 値が THEME_STATUSES のいずれかかを判定する */
const isThemeStatus = (value: unknown): value is ITheme["status"] =>
  typeof value === "string" &&
  (THEME_STATUSES as readonly string[]).includes(value);

/**
 * tags を検証する。null は空配列として扱う
 *
 * 注意: 要素ごとに typeof で確かめて新しい配列に詰め直す（元の配列をそのまま返さない）
 */
const parseTags = (value: unknown): Result<string[], string> => {
  if (value === null) {
    return ok([]);
  }
  if (!Array.isArray(value)) {
    return err("tags は文字列の配列で指定してください。");
  }
  const tags: string[] = [];
  for (const tag of value) {
    if (typeof tag !== "string") {
      return err("tags は文字列の配列で指定してください。");
    }
    tags.push(tag);
  }
  return ok(tags);
};

/**
 * pipelineConfig を検証する
 *
 * 注意: 定義済みのステージ ID 以外のキーはエラーにする。
 *       結果は PIPELINE_STAGES の ID をキーにし、model・prompt の文字列だけで組み立て直す。
 */
const parsePipelineConfig = (
  value: unknown
): Result<Record<string, IPipelineStageConfig>, string> => {
  if (!isPlainObject(value)) {
    return err("pipelineConfig はオブジェクトで指定してください。");
  }

  const knownStageIds = new Set(PIPELINE_STAGES.map((stage) => stage.id));
  const unknownStageId = Object.keys(value).find(
    (stageId) => !knownStageIds.has(stageId)
  );
  if (unknownStageId !== undefined) {
    return err(
      `pipelineConfig に存在しないステージ "${unknownStageId}" が含まれています。`
    );
  }

  const pipelineConfig: Record<string, IPipelineStageConfig> = {};
  for (const stage of PIPELINE_STAGES) {
    const stageConfig = value[stage.id];
    if (stageConfig === undefined) {
      continue;
    }
    if (!isPlainObject(stageConfig)) {
      return err(
        `pipelineConfig.${stage.id} はオブジェクトで指定してください。`
      );
    }
    const { model, prompt } = stageConfig;
    if (model !== undefined && typeof model !== "string") {
      return err(
        `pipelineConfig.${stage.id}.model は文字列で指定してください。`
      );
    }
    if (prompt !== undefined && typeof prompt !== "string") {
      return err(
        `pipelineConfig.${stage.id}.prompt は文字列で指定してください。`
      );
    }
    const parsedStageConfig: IPipelineStageConfig = {};
    if (model !== undefined) {
      parsedStageConfig.model = model;
    }
    if (prompt !== undefined) {
      parsedStageConfig.prompt = prompt;
    }
    pipelineConfig[stage.id] = parsedStageConfig;
  }
  return ok(pipelineConfig);
};

/**
 * 文字列フィールドを検証し、送られていれば結果に入れる
 *
 * @returns 不正な型ならエラーメッセージ、問題なければ undefined
 */
const assignStringField = (
  input: ThemeInput,
  key: "title" | "description" | "customPrompt",
  value: unknown
): string | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    return `${key} は文字列で指定してください。`;
  }
  input[key] = value;
  return undefined;
};

/**
 * テーマ作成・更新のリクエストボディを検証する
 *
 * @param body - リクエストボディ（未検証）。undefined は空のボディとして扱う
 * @returns 検証済みの入力。不正な値があれば、利用者に返せるエラーメッセージ
 */
export const parseThemeInput = (body: unknown): Result<ThemeInput, string> => {
  if (body === undefined) {
    return ok({});
  }
  if (!isPlainObject(body)) {
    return err("リクエストボディはオブジェクトで指定してください。");
  }

  const input: ThemeInput = {};

  for (const key of ["title", "description", "customPrompt"] as const) {
    const error = assignStringField(input, key, body[key]);
    if (error !== undefined) {
      return err(error);
    }
  }

  if (body.status !== undefined) {
    if (!isThemeStatus(body.status)) {
      return err(
        `status は次のいずれかを指定してください: ${THEME_STATUSES.join(", ")}`
      );
    }
    input.status = body.status;
  }

  if (body.tags !== undefined) {
    const tags = parseTags(body.tags);
    if (tags.isErr()) {
      return err(tags.error);
    }
    input.tags = tags.value;
  }

  if (body.pipelineConfig !== undefined) {
    const pipelineConfig = parsePipelineConfig(body.pipelineConfig);
    if (pipelineConfig.isErr()) {
      return err(pipelineConfig.error);
    }
    input.pipelineConfig = pipelineConfig.value;
  }

  if (body.minContributors !== undefined) {
    if (!isValidMinContributors(body.minContributors)) {
      return err(
        `minContributors は null または ${MIN_CONTRIBUTORS_LOWER_BOUND} 以上の整数を指定してください。`
      );
    }
    input.minContributors = body.minContributors;
  }

  return ok(input);
};
