# クイックスタートガイド

git clone やローカルビルドなしで、`docker-compose.quick.yml` 1ファイルだけで idobata を起動する手順です。

## 前提条件

- Docker（Docker Desktop または Docker Engine）
- Docker Compose v2.23.1 以上

```bash
# バージョン確認
docker compose version
# → Docker Compose version v2.23.1 以上であることを確認
```

## 手順

### 1. compose ファイルをダウンロード

```bash
curl -O https://raw.githubusercontent.com/kasseika/idobata/main/docker-compose.quick.yml
```

### 2. OPENROUTER_API_KEY を用意する

[OpenRouter](https://openrouter.ai/) でアカウントを作成し、APIキーを取得してください。LLMによる意見要約・テーマ生成・埋め込みベクトル生成に使用します。

### 3. 起動する

```bash
OPENROUTER_API_KEY=sk-or-xxxxxxxxxx docker compose -f docker-compose.quick.yml up -d
```

または `.env` ファイルを作成して管理する場合:

```bash
echo "OPENROUTER_API_KEY=sk-or-xxxxxxxxxx" > .env
docker compose -f docker-compose.quick.yml up -d
```

> ⚠️ `.env` ファイルには機密情報が含まれるため、**リポジトリにコミットしないでください**。
> git リポジトリで管理する場合は `.gitignore` に追加してください: `echo ".env" >> .gitignore`

### 4. アクセスする

サービスの起動完了（30〜60秒程度）を確認してからアクセスしてください。

| 画面 | URL |
|---|---|
| フロントエンド（ユーザー画面） | http://localhost |
| 管理画面 | http://localhost/admin/ |
| ヘルスチェック | http://localhost/health |

## 停止・削除

```bash
# 停止（データは保持）
docker compose -f docker-compose.quick.yml down

# 停止 + データ削除（MongoDB・ChromaDBのデータも削除）
docker compose -f docker-compose.quick.yml down -v
```

## ポート変更

80番ポートが使用中の場合、環境変数でポートを変更できます:

```bash
HTTP_PORT=8080 OPENROUTER_API_KEY=sk-or-xxx docker compose -f docker-compose.quick.yml up -d
# → http://localhost:8080 でアクセス
```

> ⚠️ `HTTP_PORT` を変更した場合は、`IDEA_CORS_ORIGIN` と `API_BASE_URL` も合わせて指定してください:
> ```bash
> HTTP_PORT=8080 \
> IDEA_CORS_ORIGIN=http://localhost:8080 \
> API_BASE_URL=http://localhost:8080 \
> OPENROUTER_API_KEY=sk-or-xxx \
> docker compose -f docker-compose.quick.yml up -d
> ```

## 環境変数

| 変数 | 必須 | デフォルト | 説明 |
|---|---|---|---|
| `OPENROUTER_API_KEY` | **必須** | - | OpenRouter APIキー |
| `JWT_SECRET` | 任意 | 開発用デフォルト値 | JWT署名シークレット |
| `PASSWORD_PEPPER` | 任意 | 開発用デフォルト値 | パスワードハッシュ用ペッパー |
| `HTTP_PORT` | 任意 | `80` | Caddyが使用するホストポート |
| `ALLOW_DELETE_THEME` | 任意 | `true` | テーマ削除機能の有効化 |
| `JWT_EXPIRES_IN` | 任意 | `1d` | JWTトークン有効期限 |

## ⚠️ セキュリティ注意事項

デフォルトの `JWT_SECRET` および `PASSWORD_PEPPER` は**開発・試用目的専用**です。
本番環境・公開サーバーで利用する場合は必ず変更してください:

```bash
JWT_SECRET=$(openssl rand -hex 32) \
PASSWORD_PEPPER=$(openssl rand -hex 16) \
OPENROUTER_API_KEY=sk-or-xxx \
docker compose -f docker-compose.quick.yml up -d
```

## 本番環境へのデプロイ

VPSへの本番デプロイ（SSL証明書・MongoDB認証付き）については [docs/vps-deployment.md](./vps-deployment.md) を参照してください。
