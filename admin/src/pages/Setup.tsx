/**
 * 初期管理者セットアップページ
 *
 * 目的: 管理者ユーザーが存在しない初回起動時に、初期管理者アカウントを
 *       Web UI から作成できるようにする。
 *
 * 動作:
 * - マウント時に getSetupStatus を呼び出し、needsSetup: false なら /login にリダイレクト
 * - needsSetup: true の場合はセットアップフォームを表示
 * - 送信成功後は成功メッセージを表示してから /login にリダイレクト
 */
import React, { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { apiClient } from "../services/api/apiClient";

const Setup: React.FC = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  // null: 確認中、true: セットアップ必要、false: 不要
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const checkSetupStatus = async () => {
      const result = await apiClient.getSetupStatus();
      if (result.isOk()) {
        setNeedsSetup(result.value.needsSetup);
      } else {
        // ステータス確認に失敗した場合はフォームを表示する
        setNeedsSetup(true);
      }
    };

    checkSetupStatus();
  }, []);

  // セットアップ不要の場合はログインページにリダイレクト
  if (needsSetup === false) {
    return <Navigate to="/login" replace />;
  }

  // 確認中はローディング表示
  if (needsSetup === null) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <p className="text-gray-600">確認中...</p>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name) {
      setError("名前を入力してください");
      return;
    }

    if (!email) {
      setError("メールアドレスを入力してください");
      return;
    }

    if (!password) {
      setError("パスワードを入力してください");
      return;
    }

    setError("");
    setIsLoading(true);

    try {
      const result = await apiClient.initializeAdmin({ name, email, password });

      if (result.isOk()) {
        setSuccessMessage(
          "管理者アカウントが正常に作成されました。ログインページに移動します..."
        );
        setTimeout(() => {
          navigate("/login");
        }, 2000);
      } else {
        setError(
          result.error.message || "セットアップ中にエラーが発生しました"
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="w-full max-w-md p-8 space-y-8 bg-white rounded-lg shadow-md">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">初期セットアップ</h1>
          <p className="mt-2 text-gray-600">
            管理者アカウントを作成してください
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {successMessage && (
          <Alert>
            <AlertDescription>{successMessage}</AlertDescription>
          </Alert>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="mb-4">
            <Label
              htmlFor="name"
              className="block text-foreground font-medium mb-2"
            >
              名前
              <span className="text-destructive ml-1">*</span>
            </Label>
            <Input
              id="name"
              name="name"
              type="text"
              value={name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setName(e.target.value)
              }
              placeholder="管理者の名前"
            />
          </div>

          <div className="mb-4">
            <Label
              htmlFor="email"
              className="block text-foreground font-medium mb-2"
            >
              メールアドレス
              <span className="text-destructive ml-1">*</span>
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setEmail(e.target.value)
              }
              placeholder="admin@example.com"
            />
          </div>

          <div className="mb-4">
            <Label
              htmlFor="password"
              className="block text-foreground font-medium mb-2"
            >
              パスワード
              <span className="text-destructive ml-1">*</span>
            </Label>
            <Input
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setPassword(e.target.value)
              }
              placeholder="••••••••"
            />
          </div>

          <Button type="submit" disabled={isLoading}>
            {isLoading ? "セットアップ中..." : "セットアップ実行"}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default Setup;
