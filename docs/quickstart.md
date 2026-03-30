# クイックスタートガイド

`setup.sh` を使って idobata を素早く起動する手順です。git clone やローカルビルドは不要です。

## 前提条件

- Docker（Docker Desktop または Docker Engine）
- Docker Compose v2
- openssl、curl

## 手順

### 1. setup.sh をダウンロード

```bash
curl -fsSL https://raw.githubusercontent.com/kasseika/idobata/main/setup.sh -o setup.sh
```

### 2. 実行

```bash
bash setup.sh
```

実行すると以下のモードを選択できます：

| モード | 用途 | SSL | MongoDB認証 | Watchtower |
|--------|------|-----|-------------|------------|
| **quick** | ローカル・社内試用 | なし（HTTP） | なし | なし |
| **prod** | インターネット公開 | あり（Cloudflare DNS-01） | あり | あり |

### 3. アクセス

**quick モード:**

| 画面 | URL |
|------|-----|
| フロントエンド | http://localhost |
| 管理画面 | http://localhost/admin/ |
| ヘルスチェック | http://localhost/health |

**prod モード:**

| 画面 | URL |
|------|-----|
| フロントエンド | https://your-domain.com |
| 管理画面 | https://your-domain.com/admin/ |

### 4. OpenRouter APIキーの設定

起動後、管理画面（`/admin/`）の「システム設定」から OpenRouter APIキーを設定してください。
未設定の場合、AI機能（意見要約・テーマ生成・類似検索）は利用できません。

## 生成されるファイル

`setup.sh` を実行すると、カレントディレクトリに以下のファイルが生成されます：

| ファイル | 内容 |
|---------|------|
| `docker-compose.yml` | Docker Compose 設定（GitHub からダウンロード） |
| `.env` | 環境変数（シークレット自動生成） |
| `Caddyfile` | Caddy リバースプロキシ設定 |

## 停止・削除

```bash
# 停止（データは保持）
docker compose down

# 停止 + データ削除（MongoDB・ChromaDB のデータも削除）
docker compose down -v
```

## prod モードの追加条件

prod モードで実行するには Cloudflare の設定が必要です：

- ドメインが Cloudflare で管理されていること
- `Zone:Zone:Read` + `Zone:DNS:Edit` 権限を持つ API トークン
  - 取得先: https://dash.cloudflare.com/profile/api-tokens

## ⚠️ セキュリティ注意事項

- `setup.sh` はシークレット（JWT_SECRET 等）を `openssl rand` で自動生成します
- 生成された `.env` ファイルは Git にコミットしないでください
- `.env` には機密情報が含まれます。本番環境では適切なファイルパーミッションを設定してください：
  ```bash
  chmod 600 .env
  ```

## 本番環境へのデプロイ

VPS へのデプロイ（GitHub Actions による CD 含む）については [docs/vps-deployment.md](./vps-deployment.md) を参照してください。
