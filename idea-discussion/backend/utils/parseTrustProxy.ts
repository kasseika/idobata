/**
 * TRUST_PROXY 環境変数の解釈
 *
 * 目的: リバースプロキシ（Caddy・nginx）の後ろで動かすとき、Express の trust proxy を設定し、
 *       req.ip が X-Forwarded-For の利用者の IP になるようにする。レート制限は req.ip で数えるため、
 *       設定しないと全利用者がプロキシの IP 1つにまとめて数えられる。
 * 内容: 未設定・空文字・"false" → false（信頼しない）、整数 → 信頼するプロキシの段数、
 *       それ以外 → IP アドレス・サブネットの一覧（Express にそのまま渡す）。
 * 注意: "true" はすべてのプロキシを信頼し、X-Forwarded-For を書き換えて IP を詐称できるため、
 *       起動時にエラーにする（Fail-Fast）。
 */

/** 0 以上の整数を表す文字列 */
const NON_NEGATIVE_INTEGER_PATTERN = /^\d+$/;

/**
 * TRUST_PROXY の値を Express の trust proxy 設定値に変換する。
 *
 * @param raw - TRUST_PROXY 環境変数の値
 * @returns app.set("trust proxy", ...) に渡す値
 * @throws "true" または負の数が指定されたとき
 */
export const parseTrustProxy = (
  raw: string | undefined
): boolean | number | string => {
  if (raw === undefined || raw === "" || raw === "false") return false;
  if (raw === "true") {
    throw new Error(
      "TRUST_PROXY=true は IP を詐称できるため使えません。プロキシの段数（例: 1）を指定してください"
    );
  }
  if (NON_NEGATIVE_INTEGER_PATTERN.test(raw)) return Number(raw);
  if (raw.startsWith("-")) {
    throw new Error(
      `TRUST_PROXY には 0 以上の段数か、IP アドレスの一覧を指定してください（指定された値: '${raw}'）`
    );
  }
  return raw;
};
