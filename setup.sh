#!/usr/bin/env bash
# setup.sh
# idobata 本番環境セットアップスクリプト
#
# 使用方法:
#   curl -fsSL https://raw.githubusercontent.com/kasseika/idobata/main/setup.sh -o setup.sh
#   bash setup.sh
#
# 動作:
#   1. 前提条件チェック（Docker、Docker Compose、openssl）
#   2. デプロイモード選択（quick: HTTP試用 / prod: HTTPS本番）
#   3. シークレット自動生成、本番設定の対話入力
#   4. .env ファイルの生成
#   5. Caddyfile の生成
#   6. docker-compose.yml のダウンロード
#   7. docker compose up -d による起動

set -euo pipefail

# ---------------------------------------------------------------------------
# カラー定義
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# ---------------------------------------------------------------------------
# 出力ヘルパー関数
# ---------------------------------------------------------------------------
info() {
  printf "${BLUE}[INFO]${RESET} %s\n" "$1"
}

success() {
  printf "${GREEN}[OK]${RESET} %s\n" "$1"
}

warn() {
  printf "${YELLOW}[WARN]${RESET} %s\n" "$1"
}

error() {
  printf "${RED}[ERROR]${RESET} %s\n" "$1" >&2
}

step() {
  printf "\n${BOLD}${CYAN}==> %s${RESET}\n" "$1"
}

# ---------------------------------------------------------------------------
# 定数
# ---------------------------------------------------------------------------
REPO_RAW_URL="https://raw.githubusercontent.com/kasseika/idobata/main"
COMPOSE_URL="${REPO_RAW_URL}/docker-compose.prod.yml"

# ---------------------------------------------------------------------------
# ステップ1: 前提条件チェック
# ---------------------------------------------------------------------------
step "前提条件を確認しています..."

# Docker チェック
if ! command -v docker &>/dev/null; then
  error "Docker がインストールされていません。"
  error "インストールガイド: https://docs.docker.com/engine/install/"
  exit 1
fi
success "Docker: $(docker --version)"

# Docker Compose チェック（v2 プラグイン形式）
if ! docker compose version &>/dev/null 2>&1; then
  error "Docker Compose (v2) が見つかりません。"
  error "Docker Desktop を更新するか、以下を参照してください:"
  error "  https://docs.docker.com/compose/install/"
  exit 1
fi
success "Docker Compose: $(docker compose version --short 2>/dev/null || docker compose version)"

# Docker デーモン起動確認
if ! docker info &>/dev/null 2>&1; then
  error "Docker デーモンが起動していません。Docker を起動してから再度実行してください。"
  exit 1
fi
success "Docker デーモンが起動しています"

# openssl チェック
if ! command -v openssl &>/dev/null; then
  error "openssl がインストールされていません。インストール後に再度実行してください。"
  exit 1
fi
success "openssl: $(openssl version)"

# curl チェック
if ! command -v curl &>/dev/null; then
  error "curl がインストールされていません。インストール後に再度実行してください。"
  exit 1
fi
success "curl: $(curl --version | head -n1)"

# ---------------------------------------------------------------------------
# ステップ2: デプロイモード選択
# ---------------------------------------------------------------------------
step "デプロイモードを選択してください"

printf "\n"
printf "  ${BOLD}[1] quick${RESET} - HTTP試用モード（ローカルまたは社内ネットワーク向け）\n"
printf "       Caddy が HTTP(:80)でサービスを提供。SSL不要、設定最小。\n"
printf "\n"
printf "  ${BOLD}[2] prod${RESET}  - HTTPS本番モード（インターネット公開向け）\n"
printf "       Cloudflare DNS-01チャレンジで自動SSL。MongoDB認証あり。Watchtower有効。\n"
printf "\n"

while true; do
  printf "${BOLD}モードを選択してください [1/2]: ${RESET}"
  read -r mode_input
  case "${mode_input}" in
    1) DEPLOY_MODE="quick"; break ;;
    2) DEPLOY_MODE="prod"; break ;;
    *) warn "1 または 2 を入力してください" ;;
  esac
done

info "選択されたモード: ${DEPLOY_MODE}"

# ---------------------------------------------------------------------------
# ステップ3: 設定値の収集
# ---------------------------------------------------------------------------
step "設定値を収集しています..."

# --- シークレット自動生成 ---
JWT_SECRET_VALUE=$(openssl rand -hex 32)
ENCRYPTION_KEY_VALUE=$(openssl rand -base64 32)
PASSWORD_PEPPER_VALUE=$(openssl rand -hex 16)

success "JWT_SECRET を自動生成しました"
success "SYSTEM_CONFIG_ENCRYPTION_KEY を自動生成しました"
success "PASSWORD_PEPPER を自動生成しました"

# --- モード別設定 ---
if [[ "${DEPLOY_MODE}" == "prod" ]]; then
  printf "\n${BOLD}本番環境の設定を入力してください${RESET}\n\n"

  # ドメイン
  while true; do
    printf "${BOLD}ドメイン名を入力してください（例: example.com）: ${RESET}"
    read -r DOMAIN_VALUE
    if [[ -n "${DOMAIN_VALUE}" ]]; then
      break
    fi
    warn "ドメイン名を入力してください"
  done

  # Cloudflare API トークン
  printf "\n${BOLD}Cloudflare API トークンを入力してください${RESET}\n"
  printf "  必要な権限: Zone:Zone:Read + Zone:DNS:Edit\n"
  printf "  取得先: https://dash.cloudflare.com/profile/api-tokens\n"
  while true; do
    printf "${BOLD}CF_API_TOKEN: ${RESET}"
    read -r CF_API_TOKEN_VALUE
    if [[ -n "${CF_API_TOKEN_VALUE}" ]]; then
      break
    fi
    warn "Cloudflare API トークンを入力してください"
  done

  # MongoDB 認証情報
  MONGO_ROOT_USERNAME_VALUE="admin"
  MONGO_ROOT_PASSWORD_VALUE=$(openssl rand -base64 24 | tr -d '/')
  success "MONGO_ROOT_USERNAME: ${MONGO_ROOT_USERNAME_VALUE}"
  success "MONGO_ROOT_PASSWORD を自動生成しました（後で .env で確認できます）"

  # CORS・URL 設定
  IDEA_CORS_ORIGIN_VALUE="https://${DOMAIN_VALUE},https://www.${DOMAIN_VALUE}"
  API_BASE_URL_VALUE="https://${DOMAIN_VALUE}"
  IDEA_FRONTEND_API_BASE_URL_VALUE="https://${DOMAIN_VALUE}"
  ADMIN_API_BASE_URL_VALUE="https://${DOMAIN_VALUE}"

  # CADDY_IMAGE: Cloudflare DNS-01 プラグイン入りカスタムイメージを使用
  CADDY_IMAGE_VALUE="ghcr.io/kasseika/idobata/caddy:latest"

  # MongoDB 接続 URI（認証あり）
  # パスワードに特殊文字が含まれる可能性があるため URL エンコードして生成
  MONGODB_URI_VALUE="mongodb://${MONGO_ROOT_USERNAME_VALUE}:${MONGO_ROOT_PASSWORD_VALUE}@mongo:27017/idea_discussion_db?authSource=admin"

  # Watchtower を有効化
  COMPOSE_PROFILES_VALUE="watchtower"

else
  # quickモード: 認証なし、デフォルト値
  DOMAIN_VALUE=""
  CF_API_TOKEN_VALUE=""
  MONGO_ROOT_USERNAME_VALUE=""
  MONGO_ROOT_PASSWORD_VALUE=""
  IDEA_CORS_ORIGIN_VALUE="http://localhost"
  API_BASE_URL_VALUE="http://localhost"
  IDEA_FRONTEND_API_BASE_URL_VALUE="http://localhost"
  ADMIN_API_BASE_URL_VALUE="http://localhost"
  CADDY_IMAGE_VALUE="caddy:2-alpine"
  MONGODB_URI_VALUE="mongodb://mongo:27017/idea_discussion_db"
  COMPOSE_PROFILES_VALUE=""
fi

# ---------------------------------------------------------------------------
# ステップ4: .env ファイル生成
# ---------------------------------------------------------------------------
step ".env ファイルを生成しています..."

# 既存 .env がある場合は上書き確認
if [[ -f .env ]]; then
  warn "既存の .env ファイルが見つかりました。"
  printf "${YELLOW}上書きしますか？既存の .env は .env.backup にバックアップされます [y/N]: ${RESET}"
  read -r overwrite_answer
  if [[ "${overwrite_answer}" =~ ^[Yy]$ ]]; then
    cp .env ".env.backup.$(date +%Y%m%d_%H%M%S)"
    success "既存の .env をバックアップしました"
  else
    info "既存の .env を維持します。セットアップを中止します。"
    info "手動で .env を編集してから docker compose up -d を実行してください。"
    exit 0
  fi
fi

cat > .env << EOF
# .env - idobata 本番環境設定
# setup.sh によって自動生成されました（$(date +%Y-%m-%d)）
# このファイルは Git にコミットしないでください

# --- モード ---
# デプロイモード: ${DEPLOY_MODE}

# --- 共通設定 ---
NODE_ENV=production

# --- システム設定の暗号化キー ---
# AES-256-GCM で使用する32バイト（256ビット）の Base64 エンコードキー
SYSTEM_CONFIG_ENCRYPTION_KEY=${ENCRYPTION_KEY_VALUE}

# --- JWT 設定 ---
JWT_SECRET=${JWT_SECRET_VALUE}
JWT_EXPIRES_IN=1d

# --- パスワードハッシュ用ペッパー ---
PASSWORD_PEPPER=${PASSWORD_PEPPER_VALUE}

# --- フロントエンド API URL ---
IDEA_FRONTEND_API_BASE_URL=${IDEA_FRONTEND_API_BASE_URL_VALUE}
ADMIN_API_BASE_URL=${ADMIN_API_BASE_URL_VALUE}
API_BASE_URL=${API_BASE_URL_VALUE}

# --- CORS 設定 ---
IDEA_CORS_ORIGIN=${IDEA_CORS_ORIGIN_VALUE}

# --- MongoDB 接続 ---
MONGODB_URI=${MONGODB_URI_VALUE}
MONGO_ROOT_USERNAME=${MONGO_ROOT_USERNAME_VALUE}
MONGO_ROOT_PASSWORD=${MONGO_ROOT_PASSWORD_VALUE}

# --- テーマ削除機能 ---
ALLOW_DELETE_THEME=false

# --- Caddy 設定 ---
# quickモード: caddy:2-alpine（HTTP のみ）
# prodモード:  ghcr.io/kasseika/idobata/caddy:latest（Cloudflare DNS-01 SSL）
CADDY_IMAGE=${CADDY_IMAGE_VALUE}
DOMAIN=${DOMAIN_VALUE}
CF_API_TOKEN=${CF_API_TOKEN_VALUE}

# --- Watchtower（prodモードのみ有効）---
# prodモードでは watchtower プロファイルを有効化して自動デプロイを実現
COMPOSE_PROFILES=${COMPOSE_PROFILES_VALUE}
EOF

success ".env ファイルを生成しました"

# ---------------------------------------------------------------------------
# ステップ5: Caddyfile 生成
# ---------------------------------------------------------------------------
step "Caddyfile を生成しています..."

if [[ -f Caddyfile ]]; then
  warn "既存の Caddyfile が見つかりました。上書きします。"
  cp Caddyfile "Caddyfile.backup.$(date +%Y%m%d_%H%M%S)"
  success "既存の Caddyfile をバックアップしました"
fi

if [[ "${DEPLOY_MODE}" == "prod" ]]; then
  # 本番モード: Cloudflare DNS-01 チャレンジで自動 SSL
  cat > Caddyfile << EOF
# Caddyfile
# 本番環境用 Caddy リバースプロキシ設定
# Cloudflare DNS-01 チャレンジで Let's Encrypt SSL 証明書を自動取得・更新
# setup.sh によって自動生成されました（$(date +%Y-%m-%d)）

# www サブドメイン → apex ドメインへリダイレクト
www.${DOMAIN_VALUE} {
    tls {
        dns cloudflare {env.CF_API_TOKEN}
    }
    redir https://${DOMAIN_VALUE}{uri} permanent
}

${DOMAIN_VALUE} {
    # Cloudflare DNS-01 チャレンジで TLS 証明書を取得・更新
    tls {
        dns cloudflare {env.CF_API_TOKEN}
    }

    # レスポンス圧縮（帯域節約・表示速度向上）
    encode zstd gzip

    # ヘルスチェック
    respond /health "OK" 200

    # Socket.IO WebSocket プロキシ
    # Caddy は WebSocket アップグレードを自動的に処理する
    handle /socket.io/* {
        reverse_proxy idea-backend:3100
    }

    # いどばたビジョン バックエンド API（/api/idea/ プレフィックスを除去してプロキシ）
    handle_path /api/idea/* {
        reverse_proxy idea-backend:3100
    }

    # Python 埋め込みサービス API（/api/python/ プレフィックスを除去してプロキシ）
    handle_path /api/python/* {
        reverse_proxy python-service:8000
    }

    # 管理画面（/admin/ プレフィックスを除去してプロキシ）
    redir /admin /admin/ permanent
    handle_path /admin/* {
        reverse_proxy admin:80
    }

    # フロントエンド（SPA: React）
    handle {
        reverse_proxy frontend:80
    }
}
EOF
else
  # quickモード: HTTP のみ
  cat > Caddyfile << EOF
# Caddyfile
# クイックスタート用 Caddy リバースプロキシ設定（HTTP のみ）
# setup.sh によって自動生成されました（$(date +%Y-%m-%d)）

:80 {
    # レスポンス圧縮
    encode zstd gzip

    # ヘルスチェック
    respond /health "OK" 200

    # Socket.IO WebSocket プロキシ
    handle /socket.io/* {
        reverse_proxy idea-backend:3100
    }

    # いどばたビジョン バックエンド API（/api/idea/ プレフィックスを除去してプロキシ）
    handle_path /api/idea/* {
        reverse_proxy idea-backend:3100
    }

    # Python 埋め込みサービス API（/api/python/ プレフィックスを除去してプロキシ）
    handle_path /api/python/* {
        reverse_proxy python-service:8000
    }

    # 管理画面（/admin/ プレフィックスを除去してプロキシ）
    redir /admin /admin/ permanent
    handle_path /admin/* {
        reverse_proxy admin:80
    }

    # フロントエンド（SPA: React）
    handle {
        reverse_proxy frontend:80
    }
}
EOF
fi

success "Caddyfile を生成しました"

# ---------------------------------------------------------------------------
# ステップ6: docker-compose.yml のダウンロード
# ---------------------------------------------------------------------------
step "docker-compose.yml をダウンロードしています..."

if [[ -f docker-compose.yml ]]; then
  warn "既存の docker-compose.yml が見つかりました。上書きします。"
  cp docker-compose.yml "docker-compose.yml.backup.$(date +%Y%m%d_%H%M%S)"
  success "既存の docker-compose.yml をバックアップしました"
fi

if ! curl -fsSL "${COMPOSE_URL}" -o docker-compose.yml; then
  error "docker-compose.yml のダウンロードに失敗しました。"
  error "URL: ${COMPOSE_URL}"
  error "ネットワーク接続を確認してください。"
  exit 1
fi
success "docker-compose.yml をダウンロードしました"

# ---------------------------------------------------------------------------
# ステップ7: Docker Compose 起動
# ---------------------------------------------------------------------------
step "Docker Compose でサービスを起動しています..."

info "サービスを起動します（初回はイメージのダウンロードで数分かかる場合があります）..."
docker compose up -d

# 起動確認（最大120秒待機）
info "サービスの起動を確認しています..."
MAX_WAIT=120
INTERVAL=5
elapsed=0

# watchtower は healthcheck がなく、プロファイル指定のため除外して判定
EXPECTED_SERVICES=$(docker compose config --services 2>/dev/null | grep -v "^watchtower$" | wc -l | tr -d ' ')

while [[ ${elapsed} -lt ${MAX_WAIT} ]]; do
  running=$(docker compose ps --status running --quiet 2>/dev/null | wc -l | tr -d ' ')
  if [[ "${running}" -ge "${EXPECTED_SERVICES}" ]]; then
    success "全サービスが起動しました（${running}/${EXPECTED_SERVICES}）"
    break
  fi
  info "起動待機中... (${elapsed}秒 / ${MAX_WAIT}秒, ${running}/${EXPECTED_SERVICES} サービス起動中)"
  sleep "${INTERVAL}"
  elapsed=$((elapsed + INTERVAL))
done

if [[ ${elapsed} -ge ${MAX_WAIT} ]]; then
  warn "タイムアウト：一部のサービスがまだ起動中の可能性があります。"
  warn "以下のコマンドでログを確認してください: docker compose logs -f"
fi

# ---------------------------------------------------------------------------
# 完了メッセージ
# ---------------------------------------------------------------------------
printf "\n"
printf "${GREEN}${BOLD}==========================================${RESET}\n"
printf "${GREEN}${BOLD}  idobata のセットアップが完了しました！${RESET}\n"
printf "${GREEN}${BOLD}==========================================${RESET}\n"
printf "\n"

if [[ "${DEPLOY_MODE}" == "prod" ]]; then
  printf "${BOLD}アクセスURL:${RESET}\n"
  printf "  フロントエンド: ${CYAN}https://%s${RESET}\n" "${DOMAIN_VALUE}"
  printf "  管理画面:       ${CYAN}https://%s/admin/${RESET}\n" "${DOMAIN_VALUE}"
  printf "\n"
  printf "${YELLOW}※ SSL 証明書の取得には数分かかる場合があります。${RESET}\n"
  printf "${YELLOW}  証明書取得中は HTTPS アクセスでエラーが表示されることがありますが、${RESET}\n"
  printf "${YELLOW}  しばらく待ってから再度アクセスしてください。${RESET}\n"
else
  printf "${BOLD}アクセスURL:${RESET}\n"
  printf "  フロントエンド: ${CYAN}http://localhost${RESET}\n"
  printf "  管理画面:       ${CYAN}http://localhost/admin/${RESET}\n"
  printf "  ヘルスチェック: ${CYAN}http://localhost/health${RESET}\n"
fi

printf "\n"
printf "${BOLD}便利なコマンド:${RESET}\n"
printf "  ログ確認:    docker compose logs -f\n"
printf "  停止:        docker compose down\n"
printf "  再起動:      docker compose restart\n"
printf "  設定確認:    cat .env\n"
printf "\n"
printf "${BOLD}APIキーの設定:${RESET}\n"
printf "  管理画面の「システム設定」から OpenRouter APIキーを設定してください。\n"
printf "  未設定の場合、AI機能（意見要約・テーマ生成・類似検索）は利用できません。\n"
printf "\n"
