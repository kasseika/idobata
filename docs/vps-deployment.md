# VPS デプロイガイド

このドキュメントでは、idobata を一般的な VPS（仮想プライベートサーバー）に本番デプロイする手順を説明します。

## 推奨スペックと料金の目安

### VPS スペック

| 項目 | 最小構成 | 推奨構成 |
|------|---------|---------|
| vCPU | 2 | 4 |
| RAM | 4GB | **8GB** |
| ストレージ | 40GB | 100GB |
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |

> **推奨は 8GB RAM の理由**
> 全サービス（Express + MongoDB + FastAPI/ChromaDB + nginx × 3）の合計メモリ使用量は約 2〜3GB です。
> 4GB では OS オーバーヘッドを含めるとスワップが発生しやすく、本番環境でのパフォーマンス低下リスクがあります。

### 月額料金の目安（2026年3月時点）

| プロバイダ | プラン | 月額 | 時間課金 | 停止中の課金 |
|-----------|-------|------|---------|------------|
| WebArena IndigoPro | 8GB/4vCPU | ¥8,900（上限） | ¥13.34/時間 | **あり（削除のみ停止）** |
| ConoHa VPS | 8GB | ¥6,545〜 | あり | プランによる |
| さくら VPS | 8GB | ¥4,620〜 | なし | なし |
| GCP GCE | e2-standard-2（8GB） | 約¥8,000 | あり | **あり（削除のみ停止）** |

> **時間課金のプロバイダを使う場合の注意**
> インスタンスを「停止」しても課金が続く場合があります（WebArena IndigoPro、GCE など）。
> 課金を完全に止めるにはインスタンスを**削除**する必要があります。
> 短期イベント用途では「作成 → デプロイ → イベント終了後に削除」が最も安価です。

### 短期イベント用途のコスト例（WebArena IndigoPro 8GB/4vCPU の場合）

| 期間 | コスト |
|------|------|
| 1日（24時間） | 約 ¥320 |
| 3日間 | 約 ¥961 |
| 1週間 | 約 ¥2,243 |
| 1ヶ月（上限到達） | ¥8,900 |

---

## アーキテクチャ概要

```text
ブラウザ
  │
  │ HTTPS（443）/ HTTP→HTTPS リダイレクト（80）
  ▼
┌─────────────────────────────────────────────┐
│  VPS                                         │
│                                              │
│  nginx（SSL 終端・リバースプロキシ）          │
│  ├─ /            → frontend:80（nginx）     │
│  ├─ /admin/      → admin:80（nginx）        │
│  ├─ /api/idea/   → idea-backend:3000        │
│  ├─ /socket.io/  → idea-backend:3000（WS）  │
│  └─ /api/python/ → python-service:8000      │
│                                              │
│  idea-backend（Express + Socket.IO）         │
│  frontend（nginx:alpine）                   │
│  admin（nginx:alpine）                      │
│  python-service（FastAPI + ChromaDB）        │
│  mongo（MongoDB 認証あり）                   │
│  certbot（Let's Encrypt 自動更新）           │
└─────────────────────────────────────────────┘
```

### Socket.IO の接続方式について

本番環境では Socket.IO の `transports` を `['websocket']` に限定しています。

- **理由**: 300人同時接続時に polling フォールバックが有効だと、秒間 150〜300 の HTTP リクエストが発生してサーバー負荷が急増します
- **影響**: 2026年現在 WebSocket 非対応のブラウザはほぼ存在しないため、実質的な影響はありません
- **注意**: nginx の `/socket.io/` ルートに `proxy_read_timeout 86400`（24時間）を設定しており、長時間の WebSocket 接続を維持できます

---

## デプロイ手順

### 前提条件

- VPS の root または sudo 権限付きユーザーでの SSH アクセス
- ドメイン名（SSL 証明書取得に必要）
- DNS レコードが VPS の IP アドレスを向いていること

### 1. VPS の初期セットアップ

VPS に SSH でログインし、以下を実行します。

```bash
# システム更新
apt update && apt upgrade -y

# Docker のインストール
curl -fsSL https://get.docker.com | sh

# Docker Compose プラグインの確認
docker compose version

# ファイアウォール設定（HTTP・HTTPS・SSH のみ許可）
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

### 2. リポジトリのクローン

```bash
git clone https://github.com/digitaldemocracy2030/idobata.git
cd idobata
```

### 3. 環境変数の設定

```bash
# テンプレートをコピー
cp .env.prod.template .env.prod

# エディタで各値を設定
nano .env.prod
```

設定が必要な項目：

| 変数 | 説明 | 例 |
|------|------|---|
| `OPENROUTER_API_KEY` | OpenRouter API キー | `sk-or-...` |
| `JWT_SECRET` | JWT 署名用シークレット（`openssl rand -hex 32` で生成） | 64文字の16進数 |
| `IDEA_FRONTEND_API_BASE_URL` | 本番ドメインの URL | `https://example.com` |
| `ADMIN_API_BASE_URL` | 同上 | `https://example.com` |
| `IDEA_CORS_ORIGIN` | CORS 許可オリジン | `https://example.com,https://www.example.com` |
| `MONGO_ROOT_USERNAME` | MongoDB 管理ユーザー名 | `admin` |
| `MONGO_ROOT_PASSWORD` | MongoDB 管理パスワード（`openssl rand -base64 32` で生成） | 強固なパスワード |
| `OPENAI_API_KEY` | OpenAI API キー（python-service 用） | `sk-...` |
| `DOMAIN` | ドメイン名 | `example.com` |

### 4. nginx 設定のドメイン名書き換え

```bash
# YOUR_DOMAIN_HERE を実際のドメイン名に置換
sed -i 's/YOUR_DOMAIN_HERE/example.com/g' nginx.prod.conf
```

### 5. SSL 証明書の取得（初回のみ）

> **重要**: `nginx.prod.conf` は SSL 証明書ファイルを参照するため、証明書が存在しない状態では
> nginx が起動できません。`deploy.sh` を使う場合はこの問題を自動的に処理します（`nginx.init.conf`
> による HTTP 専用の一時起動 → 証明書取得 → 本番 nginx 起動）。

手動で証明書を取得する場合は、`nginx.init.conf`（HTTP のみ）を使って一時的に起動します。

```bash
# HTTP 専用の一時 nginx で ACME チャレンジに対応
docker run -d --name nginx-init-tmp \
  -p 80:80 \
  -v $(pwd)/nginx.init.conf:/etc/nginx/nginx.conf:ro \
  -v certbot_www:/var/www/certbot \
  nginx:alpine
sleep 3

# 証明書取得（example.com を実際のドメインに変更）
docker run --rm \
  -v certbot_www:/var/www/certbot \
  -v certbot_conf:/etc/letsencrypt \
  certbot/certbot certonly \
  --webroot -w /var/www/certbot \
  --email admin@example.com \
  --agree-tos --no-eff-email \
  -d example.com -d www.example.com

# 一時 nginx を停止
docker stop nginx-init-tmp && docker rm nginx-init-tmp
```

### 6. 全サービスの起動

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

起動確認：

```bash
docker compose -f docker-compose.prod.yml ps

# ログ確認
docker compose -f docker-compose.prod.yml logs -f
```

### 7. デプロイスクリプトを使う場合（2回目以降）

リポジトリに含まれる `deploy.sh` を使うと、ローカルから VPS へのデプロイを自動化できます。

```bash
# ローカルマシンから実行
./deploy.sh <VPS の IP アドレスまたはホスト名>

# SSH ユーザーを指定する場合
SSH_USER=ubuntu ./deploy.sh example.com
```

スクリプトは以下を自動実行します：

1. ローカルでの事前チェック（環境変数・ドメイン設定の確認）
2. VPS へのファイル同期（rsync）
3. SSL 証明書の取得（未取得の場合のみ）
4. Docker イメージのビルドと起動
5. ヘルスチェック

---

## 運用

### ログの確認

```bash
# 全サービスのログ
docker compose -f docker-compose.prod.yml logs -f

# 特定サービスのみ
docker compose -f docker-compose.prod.yml logs -f idea-backend
```

### アップデート（コード変更後の再デプロイ）

```bash
git pull origin main
docker compose -f docker-compose.prod.yml --env-file .env.prod build --no-cache
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

### MongoDB のバックアップ

> **注意**: `/data/db` は `mongo_data` ボリュームのマウントポイントです。
> バックアップをここに保存するとボリューム削除時にバックアップも消失します。
> ボリューム外のパス（`/tmp/backup`）に出力してから VPS のホストディレクトリへコピーしてください。

```bash
# コンテナ内の /tmp にバックアップ取得（ボリューム外）
docker exec mongo-prod mongodump \
  --username admin \
  --password <MONGO_ROOT_PASSWORD> \
  --authenticationDatabase admin \
  --out /tmp/mongo-backup

# VPS ホストへコピー
docker cp mongo-prod:/tmp/mongo-backup ./mongo-backup-$(date +%Y%m%d)

# （任意）ローカルマシンへ転送
scp -r root@<VPS_HOST>:~/idobata/mongo-backup-$(date +%Y%m%d) .
```

### SSL 証明書の更新確認

certbot コンテナが 12 時間ごとに自動更新を試みます。手動で更新する場合：

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm certbot renew
docker compose -f docker-compose.prod.yml --env-file .env.prod restart nginx
```

---

## トラブルシューティング

### コンテナが起動しない

```bash
# 詳細ログを確認
docker compose -f docker-compose.prod.yml logs <サービス名>

# コンテナの状態確認
docker compose -f docker-compose.prod.yml ps
```

### Socket.IO が接続できない

- nginx の `/socket.io/` ロケーションに `Upgrade` ヘッダーの設定があるか確認
- ブラウザの開発者ツールでネットワークタブを確認し、WebSocket の接続が 101 Switching Protocols になっているか確認
- `IDEA_CORS_ORIGIN` に本番ドメインが含まれているか確認

### MongoDB に接続できない

- `MONGO_ROOT_USERNAME` / `MONGO_ROOT_PASSWORD` が `.env.prod` と `MONGODB_URI` で一致しているか確認
- MongoDB コンテナのログを確認: `docker compose -f docker-compose.prod.yml logs mongo`

### メモリ不足

```bash
free -h
docker stats
```

スワップが大量に使われている場合は VPS のスペックアップを検討してください（推奨: 8GB RAM）。

---

## 関連ファイル

| ファイル | 説明 |
|---------|------|
| `docker-compose.prod.yml` | 本番環境の Docker Compose 設定 |
| `nginx.prod.conf` | nginx 設定（SSL・WebSocket・リバースプロキシ） |
| `.env.prod.template` | 環境変数のテンプレート |
| `deploy.sh` | デプロイ自動化スクリプト |
| `frontend/Dockerfile.prod` | フロントエンドの本番用 Dockerfile |
| `admin/Dockerfile.prod` | 管理画面の本番用 Dockerfile |
| `idea-discussion/backend/Dockerfile` | バックエンドの Dockerfile（production/development ステージ） |
