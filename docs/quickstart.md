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

### 2. 起動する

```bash
docker compose -f docker-compose.quick.yml up -d
```

### 3. アクセスする

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
HTTP_PORT=8080 docker compose -f docker-compose.quick.yml up -d
# → http://localhost:8080 でアクセス
```

> ⚠️ `HTTP_PORT` を変更した場合は、`IDEA_CORS_ORIGIN` と `API_BASE_URL` も合わせて指定してください:
>
> ```bash
> HTTP_PORT=8080 \
> IDEA_CORS_ORIGIN=http://localhost:8080 \
> API_BASE_URL=http://localhost:8080 \
> docker compose -f docker-compose.quick.yml up -d
> ```

## 環境変数

| 変数 | 必須 | デフォルト | 説明 |
|---|---|---|---|
| `JWT_SECRET` | 任意 | 開発用デフォルト値 | JWT署名シークレット |
| `PASSWORD_PEPPER` | 任意 | 開発用デフォルト値 | パスワードハッシュ用ペッパー |
| `HTTP_PORT` | 任意 | `80` | Caddyが使用するホストポート |
| `ALLOW_DELETE_THEME` | 任意 | `false` | テーマ削除機能の有効化 |
| `JWT_EXPIRES_IN` | 任意 | `1d` | JWTトークン有効期限 |

> **OpenRouter APIキーについて**: LLM呼び出しと埋め込みベクトル生成に必須です。起動後に管理画面（http://localhost/admin/）のシステム設定から設定してください。未設定の場合、AI機能（意見要約・テーマ生成・類似検索）は利用できません。

## ⚠️ セキュリティ注意事項

デフォルトの `JWT_SECRET` および `PASSWORD_PEPPER` は**開発・試用目的専用**です。
本番環境・公開サーバーで利用する場合は必ず変更してください:

```bash
JWT_SECRET=$(openssl rand -hex 32) \
PASSWORD_PEPPER=$(openssl rand -hex 16) \
docker compose -f docker-compose.quick.yml up -d
```

## 本番環境へのデプロイ

VPSへの本番デプロイ（SSL証明書・MongoDB認証付き）については [docs/vps-deployment.md](./vps-deployment.md) を参照してください。
