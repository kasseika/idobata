/**
 * レート制限ミドルウェア
 *
 * 目的: 総当たりのログイン・LLM や外部APIを呼ぶルートの連打から、サーバーと API 費用を守る。
 *       上限を超えたリクエストには 429 を返し、コントローラーを実行しない。
 * 内容: 次の制限を作る。上限値は環境変数で変えられる（parseRateLimitConfig を参照）。
 *       - api: API 全体。IP ごと・1分あたり。DoS への最低限の備え
 *       - login: ログイン・初期管理者作成。IP ごと・15分あたり。失敗したリクエストだけを数える
 *       - chatPerUser / chatPerIp: チャット送信。参加者ごとと IP ごとの二段で数える。
 *         参加者ごとの制限を先に通し、そこで断った送信は IP ごとの上限に数えない
 *       - participantWrite: 参加者の書き込み（表示名・プロフィール画像・いいね）。参加者ごと・1分あたり
 *       - generation: 管理者専用の生成系ルート。管理者ごと・15分あたり。全ルートの合計で数える
 *       - search: 管理者の検索。管理者ごと・15分あたり。生成系とは別に数える
 * 注意: 企業研修では参加者が同じグローバルIPからアクセスするため、参加者が使うルートの
 *       IP ごとの上限は大きくし、1人あたりの制限は「IP と userId の組」で掛ける。
 *       userId は参加者の端末が作る値で詐称できる。IP と組にすることで、別の IP から
 *       他人の userId を名乗って本人の上限を使い切ることを防ぐ。userId を毎回変えて
 *       参加者ごとの制限を逃れる送信は、IP ごとの上限で止める。
 *       記録はプロセスのメモリに持つ。backend を複数台で動かす場合は共有ストアが要る。
 *       リバースプロキシの後ろでは trust proxy の設定が要る（utils/parseTrustProxy.ts を参照）。
 */

import { createHash } from "node:crypto";
import type { Request } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";

const ONE_MINUTE_MS = 60 * 1000;
const FIFTEEN_MINUTES_MS = 15 * ONE_MINUTE_MS;

/** 上限を超えたときに返す本文 */
const TOO_MANY_REQUESTS_BODY = {
  message: "リクエストが多すぎます。しばらく待ってから、もう一度お試しください",
};

/** レート制限の上限値 */
export type RateLimitConfig = {
  /** API 全体: IP ごと・1分あたりのリクエスト数 */
  apiPerIpPerMinute: number;
  /** ログイン・初期管理者作成: IP ごと・15分あたりの失敗数 */
  loginPerIpPer15Minutes: number;
  /** チャット送信: 参加者（userId）ごと・1分あたりの送信数 */
  chatPerUserPerMinute: number;
  /** チャット送信: IP ごと・1分あたりの送信数（参加者全員の合計） */
  chatPerIpPerMinute: number;
  /** 生成系ルート: 管理者ごと・15分あたりの呼び出し数 */
  generationPerAdminPer15Minutes: number;
  /** 検索: 管理者ごと・15分あたりの呼び出し数 */
  searchPerAdminPer15Minutes: number;
  /** 参加者の書き込み: 参加者ごと・1分あたりの書き込み数 */
  participantWritePerUserPerMinute: number;
};

/** 設定項目ごとの環境変数名と既定値 */
const CONFIG_SOURCES = {
  apiPerIpPerMinute: {
    envName: "RATE_LIMIT_API_PER_IP_PER_MINUTE",
    // 300人が同じIPから使っても、1人あたり1分10リクエストまで許す
    defaultValue: 3000,
  },
  loginPerIpPer15Minutes: {
    envName: "RATE_LIMIT_LOGIN_PER_IP_PER_15_MINUTES",
    defaultValue: 10,
  },
  chatPerUserPerMinute: {
    envName: "RATE_LIMIT_CHAT_PER_USER_PER_MINUTE",
    defaultValue: 10,
  },
  chatPerIpPerMinute: {
    envName: "RATE_LIMIT_CHAT_PER_IP_PER_MINUTE",
    // 300人が同じIPから、1人あたり1分2件ずつ送っても弾かない
    defaultValue: 600,
  },
  generationPerAdminPer15Minutes: {
    envName: "RATE_LIMIT_GENERATION_PER_ADMIN_PER_15_MINUTES",
    defaultValue: 60,
  },
  searchPerAdminPer15Minutes: {
    envName: "RATE_LIMIT_SEARCH_PER_ADMIN_PER_15_MINUTES",
    // 検索は管理画面から対話的に呼ぶため、生成系より多く許す
    defaultValue: 300,
  },
  participantWritePerUserPerMinute: {
    envName: "RATE_LIMIT_PARTICIPANT_WRITE_PER_USER_PER_MINUTE",
    defaultValue: 30,
  },
} as const satisfies Record<
  keyof RateLimitConfig,
  { envName: string; defaultValue: number }
>;

/** 正の整数を表す文字列 */
const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;

/**
 * 環境変数からレート制限の上限値を読む。
 * 未設定の項目は既定値を使う。正の整数でない値が設定されていれば、起動時にエラーにする（Fail-Fast）。
 *
 * @param env - 環境変数（通常は process.env）
 * @returns 上限値
 * @throws 正の整数でない値が設定されているとき
 */
export const parseRateLimitConfig = (
  env: Record<string, string | undefined>
): RateLimitConfig => {
  const read = (key: keyof RateLimitConfig): number => {
    const { envName, defaultValue } = CONFIG_SOURCES[key];
    const raw = env[envName];
    if (raw === undefined) return defaultValue;
    if (!POSITIVE_INTEGER_PATTERN.test(raw)) {
      throw new Error(
        `${envName} には正の整数を指定してください（指定された値: '${raw}'）`
      );
    }
    return Number(raw);
  };

  return {
    apiPerIpPerMinute: read("apiPerIpPerMinute"),
    loginPerIpPer15Minutes: read("loginPerIpPer15Minutes"),
    chatPerUserPerMinute: read("chatPerUserPerMinute"),
    chatPerIpPerMinute: read("chatPerIpPerMinute"),
    generationPerAdminPer15Minutes: read("generationPerAdminPer15Minutes"),
    searchPerAdminPer15Minutes: read("searchPerAdminPer15Minutes"),
    participantWritePerUserPerMinute: read("participantWritePerUserPerMinute"),
  };
};

/**
 * リクエスト元の IP からキーを作る。
 * IPv6 は /56 のサブネット単位にまとめ、アドレスを変えて上限を逃れられないようにする。
 * 注意: IP が取れない（接続が切れた等）ときは、全員を同じキーで数えないようエラーにする。
 */
const ipKey = (req: Request): string => {
  if (!req.ip) {
    throw new Error(
      "リクエスト元の IP を取得できないため、レート制限を適用できません"
    );
  }
  return `ip:${ipKeyGenerator(req.ip)}`;
};

/**
 * 参加者のキーを作る。userId をパス（:userId）か本文から読み、IP と組にして数える。
 * userId がなければ IP ごとに数える。
 * キーは SHA-256 のハッシュにし、長い userId を送られても記録の大きさが一定になるようにする。
 * 注意: 本文の userId を使うルートでは、express.json() で本文を読んだ後に使うこと。
 */
const participantKey = (req: Request): string => {
  const fromParams: unknown = req.params?.userId;
  const fromBody: unknown = req.body?.userId;
  const userId = typeof fromParams === "string" ? fromParams : fromBody;
  if (typeof userId !== "string" || userId === "") return ipKey(req);
  const digest = createHash("sha256")
    .update(`${ipKey(req)}\n${userId}`)
    .digest("hex");
  return `participant:${digest}`;
};

/**
 * 管理者専用ルート（生成系・検索）のキーを作る。管理者ごとに数える。
 * 注意: protect・admin の後に使うこと。req.user がなければ設定の誤りのため、エラーにする。
 */
const adminKey = (req: Request): string => {
  if (!req.user) {
    throw new Error(
      "管理者ごとのレート制限は、protect・admin の後に設定してください"
    );
  }
  return `admin:${String(req.user.id)}`;
};

/** 全ての制限に共通する設定 */
const COMMON_OPTIONS = {
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: TOO_MANY_REQUESTS_BODY,
} as const;

/**
 * レート制限ミドルウェアを作る。
 * 返す各ミドルウェアは自分の記録を持つ。同じミドルウェアを複数のルートに付けると、
 * それらのルートの合計で数える。
 *
 * @param config - 上限値
 * @returns 用途ごとのレート制限ミドルウェア
 */
export const createRateLimiters = (config: RateLimitConfig) => ({
  api: rateLimit({
    ...COMMON_OPTIONS,
    windowMs: ONE_MINUTE_MS,
    limit: config.apiPerIpPerMinute,
    keyGenerator: ipKey,
  }),
  login: rateLimit({
    ...COMMON_OPTIONS,
    windowMs: FIFTEEN_MINUTES_MS,
    limit: config.loginPerIpPer15Minutes,
    keyGenerator: ipKey,
    // 正しいパスワードでのログインは数えず、総当たりの失敗だけを数える
    skipSuccessfulRequests: true,
  }),
  chatPerUser: rateLimit({
    ...COMMON_OPTIONS,
    windowMs: ONE_MINUTE_MS,
    limit: config.chatPerUserPerMinute,
    keyGenerator: participantKey,
  }),
  chatPerIp: rateLimit({
    ...COMMON_OPTIONS,
    windowMs: ONE_MINUTE_MS,
    limit: config.chatPerIpPerMinute,
    keyGenerator: ipKey,
  }),
  participantWrite: rateLimit({
    ...COMMON_OPTIONS,
    windowMs: ONE_MINUTE_MS,
    limit: config.participantWritePerUserPerMinute,
    keyGenerator: participantKey,
  }),
  generation: rateLimit({
    ...COMMON_OPTIONS,
    windowMs: FIFTEEN_MINUTES_MS,
    limit: config.generationPerAdminPer15Minutes,
    keyGenerator: adminKey,
  }),
  search: rateLimit({
    ...COMMON_OPTIONS,
    windowMs: FIFTEEN_MINUTES_MS,
    limit: config.searchPerAdminPer15Minutes,
    keyGenerator: adminKey,
  }),
});

/** 環境変数の上限値で作った、アプリ全体で共有するレート制限ミドルウェア */
export const rateLimiters = createRateLimiters(
  parseRateLimitConfig(process.env)
);
