/**
 * 認証サービス
 *
 * 目的: 複数の認証プロバイダー（ローカル等）を管理し、JWT トークンの生成・検証を行う。
 * 注意: シングルトンとして export するため、直接 new AuthService() は行わないこと。
 */

import jwt from "jsonwebtoken";
import type { IAdminUser } from "../../types/index.js";
import AuthProviderInterface, {
  type AuthCredentials,
} from "./authProviderInterface.js";
import LocalAuthProvider from "./localAuthProvider.js";

/** JWT ペイロードの型 */
interface JwtPayload {
  id: string;
  role: string;
}

class AuthService {
  private providers: Record<string, AuthProviderInterface>;

  constructor() {
    this.providers = {
      local: new LocalAuthProvider(),
    };
  }

  getProvider(providerName: string): AuthProviderInterface {
    const provider = this.providers[providerName];
    if (!provider) {
      throw new Error(`認証プロバイダー '${providerName}' が見つかりません`);
    }
    return provider;
  }

  async authenticate(
    providerName: string,
    credentials: AuthCredentials
  ): Promise<{ user: IAdminUser; token: string }> {
    const provider = this.getProvider(providerName);
    const user = await provider.authenticate(credentials);

    user.lastLogin = new Date();
    await user.save();

    const token = this.generateToken(user);

    return {
      user,
      token,
    };
  }

  generateToken(user: IAdminUser): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET が設定されていません");
    const expiresIn = (process.env.JWT_EXPIRES_IN ??
      "7d") as jwt.SignOptions["expiresIn"];
    return jwt.sign(
      {
        id: user._id,
        role: user.role,
      },
      secret,
      { expiresIn }
    );
  }

  verifyToken(token: string): JwtPayload {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET が設定されていません");
    try {
      return jwt.verify(token, secret) as JwtPayload;
    } catch {
      throw new Error("無効なトークンです");
    }
  }
}

export default new AuthService();
