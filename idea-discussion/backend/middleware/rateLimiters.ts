/**
 * レート制限ミドルウェア
 *
 * 目的: 総当たりのログイン・LLM や外部APIを呼ぶルートの連打から、サーバーと API 費用を守る。
 *       上限を超えたリクエストには 429 を返し、コントローラーを実行しない。
 * 内容: 次の5つの制限を作る。上限値は環境変数で変えられる（parseRateLimitConfig を参照）。
 *       - api: API 全体。IP ごと・1分あたり。DoS への最低限の備え
 *       - login: ログイン・初期管理者作成。IP ごと・15分あたり。失敗したリクエストだけを数える
 *       - chatPerIp / chatPerUser: チャット送信。IP ごとと参加者（userId）ごとの二段で数える
 *       - generation: 管理者専用の生成系ルート。管理者ごと・15分あたり。全ルートの合計で数える
 * 注意: 企業研修では参加者が同じグローバルIPからアクセスするため、参加者が使うルートの
 *       IP ごとの上限は大きくし、1人あたりの制限は userId で掛ける。
 *       userId は参加者の端末が作る値で詐称できるため、IP ごとの上限と組み合わせる。
 *       記録はプロセスのメモリに持つ。backend を複数台で動かす場合は共有ストアが要る。
 *       リバースプロキシの後ろでは trust proxy の設定が要る（utils/parseTrustProxy.ts を参照）。
 */

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
 * チャット送信のキーを作る。本文に userId があれば参加者ごと、なければ IP ごとに数える。
 * 注意: express.json() で本文を読んだ後に使うこと。
 */
const chatUserKey = (req: Request): string => {
  const userId: unknown = req.body?.userId;
  if (typeof userId === "string" && userId !== "") return `user:${userId}`;
  return ipKey(req);
};

/**
 * 生成系ルートのキーを作る。管理者ごとに数える。
 * 注意: protect・admin の後に使うこと。req.user がなければ設定の誤りのため、エラーにする。
 */
const adminKey = (req: Request): string => {
  if (!req.user) {
    throw new Error(
      "生成系ルートのレート制限は、protect・admin の後に設定してください"
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
  chatPerIp: rateLimit({
    ...COMMON_OPTIONS,
    windowMs: ONE_MINUTE_MS,
    limit: config.chatPerIpPerMinute,
    keyGenerator: ipKey,
  }),
  chatPerUser: rateLimit({
    ...COMMON_OPTIONS,
    windowMs: ONE_MINUTE_MS,
    limit: config.chatPerUserPerMinute,
    keyGenerator: chatUserKey,
  }),
  generation: rateLimit({
    ...COMMON_OPTIONS,
    windowMs: FIFTEEN_MINUTES_MS,
    limit: config.generationPerAdminPer15Minutes,
    keyGenerator: adminKey,
  }),
});

/** 環境変数の上限値で作った、アプリ全体で共有するレート制限ミドルウェア */
export const rateLimiters = createRateLimiters(
  parseRateLimitConfig(process.env)
);
