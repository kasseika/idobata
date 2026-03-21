/**
 * ローカル認証プロバイダー
 *
 * 目的: メールアドレスとパスワードによるローカル認証を実装する。
 * 注意: password フィールドは select: false のため、findOne 時に明示的に select("+password") が必要。
 */

import AdminUser from "../../models/AdminUser.js";
import AuthProviderInterface, {
  type AuthCredentials,
} from "./authProviderInterface.js";

export default class LocalAuthProvider extends AuthProviderInterface {
  async authenticate(credentials: AuthCredentials) {
    const { email, password } = credentials as {
      email: string;
      password: string;
    };
    const user = await AdminUser.findOne({ email }).select("+password");

    if (!user) {
      throw new Error("認証に失敗しました");
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      throw new Error("認証に失敗しました");
    }

    return user;
  }
}
