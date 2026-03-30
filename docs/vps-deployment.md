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
│  ├─ /            → frontend:80              │
│  ├─ /admin/      → admin:80                 │
│  ├─ /api/idea/   → idea-backend:3100        │
│  ├─ /socket.io/  → idea-backend:3100（WS）  │
│  └─ /api/python/ → python-service:8000      │ ※将来の外部利用向け定義
│                                              │
│  idea-backend（Express + Socket.IO）         │
│  frontend（nginx:alpine）                   │
│  admin（nginx:alpine）                      │
│  python-service（FastAPI + ChromaDB）        │
│  mongo（MongoDB 認証あり）                   │
│  watchtower（イメージ自動更新）              │
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

main ブランチへの push を起点に、CI → ビルド → GHCR push が自動実行されます。
VPS への反映は Watchtower が GHCR のイメージ更新を検知して自動的に行います。

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
[Watchtower（VPS 上で常駐）]
  5分間隔で GHCR を監視し、新しいイメージを自動 pull・コンテナ再起動
```

### 必要な GitHub Secrets（`production` 環境）

なし。GHCR イメージは public のため認証不要です。

---

## VPS 初期セットアップ（初回のみ）

初めて VPS にデプロイする際に必要な準備です。2回目以降は Watchtower が自動でデプロイします。

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

### 2. setup.sh でセットアップ

VPS 上で `setup.sh` を実行します。prod モードを選択してください。

```bash
curl -fsSL https://raw.githubusercontent.com/kasseika/idobata/main/setup.sh -o setup.sh
bash setup.sh
```

`setup.sh` は以下を自動的に行います：

- JWT_SECRET・SYSTEM_CONFIG_ENCRYPTION_KEY・PASSWORD_PEPPER を `openssl rand` で自動生成
- DOMAIN・CF_API_TOKEN を対話的に入力
- MONGO_ROOT_PASSWORD を自動生成
- `.env`・`Caddyfile`・`docker-compose.yml` をカレントディレクトリに生成
- `docker compose up -d` でサービスを起動

> **ファイルの保管場所について**
> `setup.sh` を実行したディレクトリに `.env`・`Caddyfile`・`docker-compose.yml` が生成されます。
> ホームディレクトリ直下（`~/`）または `~/idobata/` などで実行することを推奨します。

---

## 運用

### ログの確認

```bash
# 全サービスのログ
docker compose logs -f

# 特定サービスのみ
docker compose logs -f idea-backend
```

### 緊急時の手動デプロイ

通常は Watchtower による自動デプロイを使用してください。緊急時のみ以下を実行します。

```bash
# setup.sh を実行したディレクトリで実行
docker compose pull
docker compose up -d

# 不要イメージを削除
docker image prune -f
```

### MongoDB のバックアップ

> **注意**: `/data/db` は `mongo_data` ボリュームのマウントポイントです。
> バックアップをここに保存するとボリューム削除時にバックアップも消失します。
> ボリューム外のパス（`/tmp/backup`）に出力してから VPS のホストディレクトリへコピーしてください。

```bash
# コンテナ内の /tmp にバックアップ取得（ボリューム外）
docker exec $(docker compose ps -q mongo) mongodump \
  --username admin \
  --password <MONGO_ROOT_PASSWORD> \
  --authenticationDatabase admin \
  --out /tmp/mongo-backup

# VPS ホストへコピー
docker cp $(docker compose ps -q mongo):/tmp/mongo-backup ./mongo-backup-$(date +%Y%m%d)

# （任意）ローカルマシンへ転送
scp -r root@<VPS_HOST>:~/mongo-backup-$(date +%Y%m%d) .
```

> `MONGO_ROOT_PASSWORD` は `.env` ファイルで確認できます：`grep MONGO_ROOT_PASSWORD .env`

---

## トラブルシューティング

### コンテナが起動しない

```bash
# 詳細ログを確認
docker compose logs <サービス名>

# コンテナの状態確認
docker compose ps
```

### SSL 証明書が取得できない

- `CF_API_TOKEN` の権限（Zone:Zone:Read + Zone:DNS:Edit）を確認してください
- Caddy のログを確認: `docker compose logs caddy`
- DNS が正しく設定されているか確認してください

### Socket.IO が接続できない

- ブラウザの開発者ツールでネットワークタブを確認し、WebSocket の接続が 101 Switching Protocols になっているか確認
- `IDEA_CORS_ORIGIN` に本番ドメインが含まれているか確認: `grep IDEA_CORS_ORIGIN .env`

### MongoDB に接続できない

- `MONGO_ROOT_USERNAME` / `MONGO_ROOT_PASSWORD` が `.env` と `MONGODB_URI` で一致しているか確認
- MongoDB コンテナのログを確認: `docker compose logs mongo`

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
| `docker-compose.prod.yml` | 本番環境の Docker Compose 設定（setup.sh が docker-compose.yml としてダウンロード） |
| `Caddyfile` | Caddy 設定のテンプレート（setup.sh が自動生成） |
| `setup.sh` | 本番環境セットアップスクリプト |
| `.github/workflows/build-and-push.yml` | GitHub Actions CI/CD ワークフロー |
| `frontend/Dockerfile.prod` | フロントエンドの本番用 Dockerfile |
| `admin/Dockerfile.prod` | 管理画面の本番用 Dockerfile |
| `idea-discussion/backend/Dockerfile` | バックエンドの Dockerfile（production/development ステージ） |
