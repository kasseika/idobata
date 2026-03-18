#!/usr/bin/env bash
# deploy.sh
# 本番 VPS へのデプロイスクリプト（緊急手動デプロイ用）
#
# 注意: 通常のデプロイは GitHub Actions の deploy.yml で自動化されている。
# このスクリプトは GitHub Actions 障害時の緊急手動デプロイ手段として残している。
#
# ⚠️  docker-compose.prod.yml が image 参照（GHCR）に変更されたため、
#     手動デプロイ時はビルドではなく pull が必要:
#       docker compose -f docker-compose.prod.yml pull
#       docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
#
# 使用方法:
#   chmod +x deploy.sh
#   ./deploy.sh <VPS_HOST>
#
# 前提条件:
#   - VPS に SSH 鍵認証でアクセスできること
#   - VPS に Docker / Docker Compose がインストール済みであること
#   - VPS 上の ~/idobata/.env.prod が設定済みであること
#   - nginx.prod.conf の YOUR_DOMAIN_HERE が実際のドメインに置換済みであること

set -euo pipefail

# --- 設定 ---
VPS_HOST="${1:-}"
REMOTE_DIR="${REMOTE_DIR:-~/idobata}"
SSH_USER="${SSH_USER:-root}"
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.prod"

# ヘルスチェックの最大リトライ回数と待機時間（秒）
HEALTH_RETRIES=6
HEALTH_WAIT=10

# --- 引数チェック ---
if [[ -z "$VPS_HOST" ]]; then
  echo "使用方法: $0 <VPS_HOST>" >&2
  echo "例: $0 192.0.2.1" >&2
  exit 1
fi

echo "=========================================="
echo "デプロイ開始: ${SSH_USER}@${VPS_HOST}:${REMOTE_DIR}"
echo "=========================================="

# --- ローカルでの事前チェック ---
echo ""
echo "[1/5] ローカル事前チェック..."

if [[ ! -f "$ENV_FILE" ]]; then
  echo "エラー: $ENV_FILE が見つかりません" >&2
  echo "  cp .env.prod.template .env.prod して設定してください" >&2
  exit 1
fi

if grep -q "YOUR_DOMAIN_HERE" nginx.prod.conf; then
  echo "エラー: nginx.prod.conf に YOUR_DOMAIN_HERE が残っています" >&2
  echo "  sed -i 's/YOUR_DOMAIN_HERE/your-actual-domain.com/g' nginx.prod.conf" >&2
  exit 1
fi

if grep -q "YOUR_DOMAIN_HERE" "$ENV_FILE"; then
  echo "エラー: $ENV_FILE に YOUR_DOMAIN_HERE が残っています" >&2
  exit 1
fi

echo "  OK"

# --- VPS へのファイル同期 ---
echo ""
echo "[2/5] VPS へのファイル同期..."

ssh "${SSH_USER}@${VPS_HOST}" "mkdir -p ${REMOTE_DIR}"

# git で管理されているファイルを rsync（node_modules は除外）
rsync -avz --delete \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='.env' \
  --exclude='.env.prod' \
  --filter=':- .gitignore' \
  . "${SSH_USER}@${VPS_HOST}:${REMOTE_DIR}/"

# .env.prod は別途コピー（git 管理外のため）
rsync -avz "$ENV_FILE" "${SSH_USER}@${VPS_HOST}:${REMOTE_DIR}/"

echo "  OK"

# --- VPS での初回 SSL 証明書取得（初回のみ必要）---
echo ""
echo "[3/5] SSL 証明書の確認..."

# ローカルの .env.prod から DOMAIN を読み取る
# 注意: ここ以降のヒアドキュメントはクォートなし（意図的なローカル変数展開）
# ${DOMAIN}, ${COMPOSE_FILE}, ${ENV_FILE}, ${REMOTE_DIR} はローカルで定義した値を使用する
DOMAIN=$(grep "^DOMAIN=" "$ENV_FILE" | cut -d'=' -f2)
if [[ -z "$DOMAIN" ]]; then
  echo "  警告: .env.prod に DOMAIN が設定されていません。SSL 証明書取得をスキップします"
else
  # 注意: heredoc がクォートされていないため ${DOMAIN} 等はローカルで展開される（意図通り）
  ssh "${SSH_USER}@${VPS_HOST}" bash << REMOTE_SCRIPT
    set -euo pipefail
    cd ${REMOTE_DIR}
    if [[ ! -d /etc/letsencrypt/live/${DOMAIN} ]]; then
      echo "  初回 SSL 証明書を取得します: ${DOMAIN}"

      # SSL 証明書が存在しない状態では nginx.prod.conf は起動できない（証明書参照のため）
      # 証明書取得専用の HTTP のみ設定（nginx.init.conf）で一時起動する
      docker run -d --name nginx-init-tmp \
        -p 80:80 \
        -v ${REMOTE_DIR}/nginx.init.conf:/etc/nginx/nginx.conf:ro \
        -v certbot_www:/var/www/certbot \
        nginx:alpine || true
      sleep 3

      # certbot で Let's Encrypt 証明書を取得
      docker run --rm \
        -v certbot_www:/var/www/certbot \
        -v certbot_conf:/etc/letsencrypt \
        certbot/certbot certonly \
        --webroot -w /var/www/certbot \
        --email admin@${DOMAIN} \
        --agree-tos --no-eff-email \
        --non-interactive \
        -d ${DOMAIN} -d www.${DOMAIN}

      # 一時 nginx を停止・削除
      docker stop nginx-init-tmp && docker rm nginx-init-tmp || true

      echo "  SSL 証明書を取得しました"
    else
      echo "  SSL 証明書は取得済みです。スキップします"
    fi
REMOTE_SCRIPT
fi

# --- Docker イメージビルドと起動 ---
echo ""
echo "[4/5] Docker イメージのビルドと起動..."

# 注意: heredoc がクォートされていないため ${COMPOSE_FILE} 等はローカルで展開される（意図通り）
ssh "${SSH_USER}@${VPS_HOST}" bash << REMOTE_SCRIPT
  set -euo pipefail
  cd ${REMOTE_DIR}

  echo "  イメージをビルドしています..."
  docker compose -f ${COMPOSE_FILE} --env-file ${ENV_FILE} build --no-cache

  echo "  サービスを起動しています..."
  docker compose -f ${COMPOSE_FILE} --env-file ${ENV_FILE} up -d

  echo "  起動確認..."
  sleep 5
  docker compose -f ${COMPOSE_FILE} ps
REMOTE_SCRIPT

echo "  OK"

# --- ヘルスチェック ---
echo ""
echo "[5/5] ヘルスチェック..."

DOMAIN=$(grep "^DOMAIN=" "$ENV_FILE" | cut -d'=' -f2 || echo "")
if [[ -n "$DOMAIN" ]]; then
  # コンテナ起動直後はまだ準備中の場合があるためリトライする
  HTTP_STATUS="000"
  for i in $(seq 1 ${HEALTH_RETRIES}); do
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
      --max-time 10 --connect-timeout 5 \
      "https://${DOMAIN}/health" || echo "000")
    if [[ "$HTTP_STATUS" == "200" ]]; then
      break
    fi
    echo "  リトライ ${i}/${HEALTH_RETRIES}: HTTP ${HTTP_STATUS}（${HEALTH_WAIT}秒後に再試行）..."
    sleep ${HEALTH_WAIT}
  done

  if [[ "$HTTP_STATUS" == "200" ]]; then
    echo "  ヘルスチェック成功: https://${DOMAIN}/health → HTTP ${HTTP_STATUS}"
  else
    echo "  警告: ヘルスチェック失敗（HTTP ${HTTP_STATUS}）。ログを確認してください"
    echo "  ssh ${SSH_USER}@${VPS_HOST} 'cd ${REMOTE_DIR} && docker compose -f ${COMPOSE_FILE} logs'"
  fi
else
  echo "  ドメイン未設定のためヘルスチェックをスキップします"
fi

echo ""
echo "=========================================="
echo "デプロイ完了"
echo "  URL: https://${DOMAIN:-$VPS_HOST}"
echo "  ログ確認: ssh ${SSH_USER}@${VPS_HOST} 'cd ${REMOTE_DIR} && docker compose -f ${COMPOSE_FILE} logs -f'"
echo "=========================================="
