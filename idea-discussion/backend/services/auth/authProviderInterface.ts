/**
 * 認証プロバイダー基底クラス
 *
 * 目的: 異なる認証方式（ローカル、Google OAuth 等）の共通インターフェースを定義する。
 * 注意: このクラスを直接インスタンス化せず、必ずサブクラスで authenticate を実装すること。
 */

import type { IAdminUser } from "../../types/index.js";

/** 認証クレデンシャルの基底型 */
export interface AuthCredentials {
  [key: string]: unknown;
}

/** ローカル認証のクレデンシャル型 */
export interface LocalAuthCredentials extends AuthCredentials {
  email: string;
  password: string;
}

export default abstract class AuthProviderInterface {
  abstract authenticate(credentials: AuthCredentials): Promise<IAdminUser>;
}
