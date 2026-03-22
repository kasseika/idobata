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
> 全サービス（Express + MongoDB + FastAPI/ChromaDB + Caddy）の合計メモリ使用量は約 2〜3GB です。
> 4GB では OS オーバーヘッドを含めるとスワップが発生しやすく、本番環境でのパフォーマンス低下リスクがあります。

### 月額料金の目安（2026年3月時点）

| プロバイダ | プラン | 月額 | 時間課金 | 停止中の課金 |
|-----------|-------|------|---------|------------|
| WebArena Indigo | 8GB/6vCPU | ¥3,410（上限） | ¥5.35/時間 | **あり（削除のみ停止）** |
| ConoHa VPS | 8GB | ¥6,545〜 | あり | プランによる |
| さくら VPS | 8GB | ¥4,620〜 | なし | なし |
| GCP GCE | e2-standard-2（8GB） | 約¥8,000 | あり | **あり（削除のみ停止）** |

> **時間課金のプロバイダを使う場合の注意**
> インスタンスを「停止」しても課金が続く場合があります（WebArena Indigo、GCE など）。
> 課金を完全に止めるにはインスタンスを**削除**する必要があります。
> 短期イベント用途では「作成 → デプロイ → イベント終了後に削除」が最も安価です。

### 短期イベント用途のコスト例（WebArena Indigo 8GB/6vCPU の場合）

| 期間 | コスト |
|------|------|
| 1日（24時間） | 約 ¥128 |
| 3日間 | 約 ¥385 |
| 1週間 | 約 ¥898 |
| 1ヶ月（上限到達） | ¥3,410 |

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
│  Caddy（SSL 終端・リバースプロキシ）           │
│  ├─ /            → frontend-prod:80          │
│  ├─ /admin/      → admin-prod:80             │
│  ├─ /api/idea/   → idea-backend-prod:3100    │
│  ├─ /socket.io/  → idea-backend-prod:3100（WS）|
│  └─ /api/python/ → idobata-python-service-prod:8000  │ ※将来の外部利用向け定義
│                                              │
│  idea-backend（Express + Socket.IO）         │
│  frontend（nginx:alpine）                   │
│  admin（nginx:alpine）                      │
│  python-service（FastAPI + ChromaDB）        │
│  mongo（MongoDB 認証あり）                   │
└─────────────────────────────────────────────┘
         ↕ DNS-01 チャレンジ（ACME）
   Cloudflare DNS
```

> **注意**: `/api/python/` 経路は将来の外部利用向けに定義されています。
> 現在の運用では idea-backend が Docker 内部ネットワーク経由で python-service を直接呼び出しており、この経路は使用していません。
> 外部から利用する場合はパスプレフィックスが除去されてプロキシされる点に注意してください。

### Caddy による自動 SSL

Caddy は Cloudflare DNS-01 チャレンジを使用して Let's Encrypt / ZeroSSL から TLS 証明書を自動取得・更新します。

- HTTP-01 チャレンジ不要のため、ポート 80 を開けなくても証明書取得が可能です
- 証明書は Caddy が定期的に自動更新するため、certbot のような別プロセスは不要です
- `CF_API_TOKEN`（Zone:Zone:Read + Zone:DNS:Edit 権限）が必要です

### Socket.IO の接続方式について

本番環境では Socket.IO の `transports` を `['websocket']` に限定しています。

- **理由**: 300人同時接続時に polling フォールバックが有効だと、秒間 150〜300 の HTTP リクエストが発生してサーバー負荷が急増します
- **影響**: 2026年現在 WebSocket 非対応のブラウザはほぼ存在しないため、実質的な影響はありません
- **注意**: Caddy は WebSocket アップグレードを自動的に処理するため、追加設定は不要です

---

## デプロイフロー（GitHub Actions CD）

main ブランチへの push を起点に、CI → ビルド → デプロイが自動実行されます。

```text
main ブランチへ push
  │
  ▼
[Job 1: check]
  Lint + 型チェック + テスト（CI ゲート）
  │
  ▼
[Job 2: build-and-push]
  5サービスを並列ビルドして GHCR（ghcr.io/kasseika/idobata/*）へ push
  （idea-backend / frontend / admin / python-service / caddy）
  │
  ▼
[Job 3: deploy]
  SSH で VPS に接続し、以下を実行:
  1. docker-compose.prod.yml / Caddyfile を転送
  2. GHCR からイメージを pull
  3. docker compose up -d（ローリング再起動）
  4. 不要イメージを削除
  │
  ▼
[ヘルスチェック]
  https://<DOMAIN>/health が 200 を返すまで最大 60 秒待機
```

### 必要な GitHub Secrets（`production` 環境）

| シークレット名 | 説明 |
|-------------|------|
| `VPS_HOST` | VPS の IP アドレスまたはホスト名 |
| `VPS_USER` | SSH ユーザー名 |
| `VPS_SSH_KEY` | SSH 秘密鍵（ed25519 推奨） |
| `VPS_SSH_PORT` | SSH ポート番号（デフォルト: 22） |
| `VPS_KNOWN_HOSTS` | `ssh-keyscan -p <PORT> <HOST>` の出力（MITM 対策） |
| `DOMAIN` | 本番ドメイン名（ヘルスチェック用） |

---

## VPS 初期セットアップ（初回のみ）

初めて VPS にデプロイする際に必要な準備です。2回目以降は GitHub Actions が自動でデプロイします。

### 1. VPS の初期セットアップ

VPS に SSH でログインし、以下を実行します。

```bash
# システム更新
apt update && apt upgrade -y

# Docker のインストール
curl -fsSL https://get.docker.com | sh

# Docker Compose プラグインの確認
docker compose version

# ファイアウォール設定（SSH・HTTP・HTTPS を許可）
# ポート 80 は Caddy が HTTP→HTTPS リダイレクトに使用するため開放する
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

### 2. GHCR 認証の配置

GitHub Actions の CI/CD では GITHUB_TOKEN で GHCR へイメージを push しますが、VPS 上での `docker compose pull`（自動デプロイ・手動デプロイともに）は VPS に事前配置した PAT を使用します。`read:packages` スコープの PAT を以下の手順で配置してください。

```bash
# read:packages スコープの Personal Access Token を配置
echo "YOUR_GHCR_PAT" > ~/.ghcr_pat
chmod 600 ~/.ghcr_pat
```

> **注意**: GHCR_PAT はコマンドライン引数経由での漏洩（`/proc/<pid>/cmdline`）を防ぐため、
> ファイルから読み込む方式を採用しています。GitHub Secrets には登録しないでください。

### 3. 環境変数ファイルの配置

GitHub Actions はコード・設定ファイルのみを転送します。`.env.prod`（秘密情報を含む）は
事前に VPS へ直接配置してください。

```bash
mkdir -p ~/idobata

# ローカルマシンから転送する場合
scp .env.prod <VPS_USER>@<VPS_HOST>:~/idobata/.env.prod

# または VPS 上で直接作成
nano ~/idobata/.env.prod
chmod 600 ~/idobata/.env.prod
```

設定が必要な項目：

| 変数 | 説明 | 例 |
|------|------|---|
| `JWT_SECRET` | JWT 署名用シークレット（`openssl rand -hex 32` で生成） | 64文字の16進数 |
| `PASSWORD_PEPPER` | 管理者パスワードのペッパー（`openssl rand -hex 32` で生成） | 64文字の16進数 |
| `IDEA_FRONTEND_API_BASE_URL` | 本番ドメインの URL | `https://example.com` |
| `ADMIN_API_BASE_URL` | 同上 | `https://example.com` |
| `IDEA_CORS_ORIGIN` | CORS 許可オリジン | `https://example.com,https://www.example.com` |
| `MONGO_ROOT_USERNAME` | MongoDB 管理ユーザー名 | `admin` |
| `MONGO_ROOT_PASSWORD` | MongoDB 管理パスワード（`openssl rand -base64 32` で生成） | 強固なパスワード |
| `OPENAI_API_KEY` | OpenAI API キー（python-service 用） | `sk-...` |
| `DOMAIN` | ドメイン名 | `example.com` |
| `CF_API_TOKEN` | Cloudflare API トークン（Zone:Zone:Read + Zone:DNS:Edit） | Cloudflare ダッシュボードで取得 |

テンプレートは `.env.prod.template` を参照してください。

---

## 運用

### ログの確認

```bash
# 全サービスのログ
docker compose -f ~/idobata/docker-compose.prod.yml logs -f

# 特定サービスのみ
docker compose -f ~/idobata/docker-compose.prod.yml logs -f idea-backend
```

### 緊急時の手動デプロイ

通常は GitHub Actions による自動デプロイを使用してください。緊急時のみ以下を実行します。

```bash
# VPS 上で実行
cd ~/idobata

# GHCR にログイン
cat ~/.ghcr_pat | docker login ghcr.io -u <GITHUB_USER> --password-stdin

# イメージを取得して再起動
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d

# 不要イメージを削除
docker image prune -f
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

---

## トラブルシューティング

### コンテナが起動しない

```bash
# 詳細ログを確認
docker compose -f docker-compose.prod.yml logs <サービス名>

# コンテナの状態確認
docker compose -f docker-compose.prod.yml ps
```

### SSL 証明書が取得できない

- `CF_API_TOKEN` の権限（Zone:Zone:Read + Zone:DNS:Edit）を確認してください
- Caddy のログを確認: `docker compose -f docker-compose.prod.yml logs caddy`
- DNS が正しく設定されているか確認してください

### Socket.IO が接続できない

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
| `Caddyfile` | Caddy 設定（SSL・WebSocket・リバースプロキシ） |
| `.env.prod.template` | 環境変数のテンプレート |
| `.github/workflows/deploy.yml` | GitHub Actions CD ワークフロー |
| `frontend/Dockerfile.prod` | フロントエンドの本番用 Dockerfile |
| `admin/Dockerfile.prod` | 管理画面の本番用 Dockerfile |
| `idea-discussion/backend/Dockerfile` | バックエンドの Dockerfile（production/development ステージ） |
