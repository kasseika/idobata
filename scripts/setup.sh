#!/usr/bin/env bash
# scripts/setup.sh
# idobata ワンライナーセットアップスクリプト
#
# 使用方法:
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/kasseika/idobata/main/scripts/setup.sh)"
#
# 事前設定（非対話モード用）:
#   OPENROUTER_API_KEY=xxx OPENAI_API_KEY=yyy bash setup.sh
#
# 動作:
#   1. OS・git・Docker の存在確認
#   2. リポジトリの取得（clone または pull）
#   3. .env ファイルの生成（JWT_SECRET 自動生成、APIキー対話入力）
#   4. docker compose up --build -d による起動
#   5. アクセスURLの表示

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
REPO_URL="https://github.com/kasseika/idobata.git"
DEFAULT_INSTALL_DIR="idobata"
FRONTEND_URL="http://localhost:5173"
ADMIN_URL="http://localhost:5175"

# ---------------------------------------------------------------------------
# ステップ1: OS・前提条件チェック
# ---------------------------------------------------------------------------
step "前提条件を確認しています..."

# OS検出
detect_os() {
  if [[ -f /proc/version ]] && grep -qi microsoft /proc/version; then
    echo "wsl"
  elif [[ "$(uname -s)" == "Darwin" ]]; then
    echo "macos"
  elif [[ "$(uname -s)" == "Linux" ]]; then
    echo "linux"
  else
    echo "unknown"
  fi
}

OS=$(detect_os)
info "OS: ${OS}"

# git チェック
if ! command -v git &>/dev/null; then
  error "git がインストールされていません。"
  case "${OS}" in
    linux|wsl)
      error "以下のコマンドでインストールしてください:"
      error "  sudo apt-get update && sudo apt-get install -y git"
      ;;
    macos)
      error "以下のコマンドでインストールしてください:"
      error "  xcode-select --install"
      ;;
  esac
  exit 1
fi
success "git: $(git --version)"

# Docker チェック
install_docker_linux() {
  printf "${YELLOW}Docker をインストールしますか？ [y/N]: ${RESET}"
  read -r answer
  if [[ "${answer}" =~ ^[Yy]$ ]]; then
    info "Docker 公式スクリプトでインストールします..."
    curl -fsSL https://get.docker.com | sh
    # 現在のユーザーを docker グループに追加
    if id -nG "${USER}" | grep -qw docker; then
      success "ユーザー ${USER} はすでに docker グループに属しています"
    else
      sudo usermod -aG docker "${USER}"
      warn "ユーザー ${USER} を docker グループに追加しました。"
      warn "変更を反映するには一度ログアウト・再ログインが必要です。"
      warn "このセッションでは 'newgrp docker' を実行してください。"
    fi
  else
    error "Docker のインストールをスキップしました。"
    error "Docker をインストールしてから再度実行してください。"
    error "インストールガイド: https://docs.docker.com/engine/install/"
    exit 1
  fi
}

if ! command -v docker &>/dev/null; then
  error "Docker がインストールされていません。"
  case "${OS}" in
    linux|wsl)
      install_docker_linux
      ;;
    macos)
      error "Docker Desktop をインストールしてください:"
      error "  https://www.docker.com/products/docker-desktop/"
      exit 1
      ;;
    *)
      error "Docker のインストールガイド: https://docs.docker.com/engine/install/"
      exit 1
      ;;
  esac
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
  error "Docker デーモンが起動していません。"
  case "${OS}" in
    linux|wsl)
      error "以下のコマンドで起動してください:"
      error "  sudo systemctl start docker"
      ;;
    macos)
      error "Docker Desktop を起動してください。"
      ;;
  esac
  exit 1
fi
success "Docker デーモンが起動しています"

# ---------------------------------------------------------------------------
# ステップ2: リポジトリ取得
# ---------------------------------------------------------------------------
step "リポジトリを取得しています..."

# インストール先ディレクトリの決定
INSTALL_DIR="${IDOBATA_INSTALL_DIR:-${DEFAULT_INSTALL_DIR}}"

if [[ -d "${INSTALL_DIR}/.git" ]]; then
  info "${INSTALL_DIR} は既に存在します。最新化します..."
  cd "${INSTALL_DIR}"
  git pull --ff-only origin main
  success "リポジトリを最新化しました"
else
  if [[ -d "${INSTALL_DIR}" ]]; then
    error "${INSTALL_DIR} ディレクトリが既に存在しますが git リポジトリではありません。"
    error "別のディレクトリを指定するか、既存ディレクトリを移動してください。"
    error "例: IDOBATA_INSTALL_DIR=idobata2 bash setup.sh"
    exit 1
  fi
  info "${REPO_URL} を ${INSTALL_DIR} にクローンします..."
  git clone "${REPO_URL}" "${INSTALL_DIR}"
  cd "${INSTALL_DIR}"
  success "リポジトリをクローンしました"
fi

# ---------------------------------------------------------------------------
# ステップ3: .env ファイル生成
# ---------------------------------------------------------------------------
step ".env ファイルを設定しています..."

if [[ ! -f .env.template ]]; then
  error ".env.template が見つかりません。リポジトリが正しく取得されているか確認してください。"
  exit 1
fi

# 既存 .env のバックアップ
if [[ -f .env ]]; then
  BACKUP_PATH=".env.backup.$(date +%Y%m%d_%H%M%S)"
  warn "既存の .env を ${BACKUP_PATH} にバックアップします..."
  cp .env "${BACKUP_PATH}"
fi

# .env.template からコピー
cp .env.template .env
success ".env.template を .env にコピーしました"

# JWT_SECRET 自動生成
if command -v openssl &>/dev/null; then
  JWT_SECRET_VALUE=$(openssl rand -hex 32)
else
  # openssl がない場合は /dev/urandom から生成
  JWT_SECRET_VALUE=$(head -c 32 /dev/urandom | xxd -p | tr -d '\n' 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null | tr -d '-' || date +%s%N | sha256sum | head -c 64)
fi

# sedでJWT_SECRETを置換（macOS/GNU sed 互換）
if [[ "${OS}" == "macos" ]]; then
  sed -i '' "s|JWT_SECRET=generate_a_strong_secret_key_here.*|JWT_SECRET=${JWT_SECRET_VALUE}|" .env
else
  sed -i "s|JWT_SECRET=generate_a_strong_secret_key_here.*|JWT_SECRET=${JWT_SECRET_VALUE}|" .env
fi
success "JWT_SECRET を自動生成しました"

# OPENROUTER_API_KEY の設定
set_env_value() {
  local key="$1"
  local value="$2"
  local placeholder="$3"
  if [[ "${OS}" == "macos" ]]; then
    sed -i '' "s|${key}=${placeholder}|${key}=${value}|" .env
  else
    sed -i "s|${key}=${placeholder}|${key}=${value}|" .env
  fi
}

# 非対話モード判定（環境変数で事前設定されているか確認）
if [[ -n "${OPENROUTER_API_KEY:-}" ]]; then
  info "OPENROUTER_API_KEY が環境変数から設定されました"
  set_env_value "OPENROUTER_API_KEY" "${OPENROUTER_API_KEY}" "your_openrouter_api_key_here"
elif [[ -t 0 ]]; then
  # 対話モード（TTY が接続されている場合）
  printf "\n${BOLD}OPENROUTER_API_KEY を入力してください（必須・LLM通信用）${RESET}\n"
  printf "取得先: https://openrouter.ai/\n"
  printf "スキップする場合はそのまま Enter を押してください: "
  read -r input_openrouter_key
  if [[ -n "${input_openrouter_key}" ]]; then
    set_env_value "OPENROUTER_API_KEY" "${input_openrouter_key}" "your_openrouter_api_key_here"
    success "OPENROUTER_API_KEY を設定しました"
  else
    warn "OPENROUTER_API_KEY をスキップしました。後で .env を編集して設定してください。"
  fi
else
  warn "非対話モードで実行中。OPENROUTER_API_KEY は未設定です。後で .env を編集してください。"
fi

# OPENAI_API_KEY の設定（任意）
if [[ -n "${OPENAI_API_KEY:-}" ]]; then
  info "OPENAI_API_KEY が環境変数から設定されました"
  set_env_value "OPENAI_API_KEY" "${OPENAI_API_KEY}" "your_openai_api_key_here.*"
elif [[ -t 0 ]]; then
  printf "\n${BOLD}OPENAI_API_KEY を入力してください（任意・埋め込み機能用）${RESET}\n"
  printf "スキップする場合はそのまま Enter を押してください: "
  read -r input_openai_key
  if [[ -n "${input_openai_key}" ]]; then
    set_env_value "OPENAI_API_KEY" "${input_openai_key}" "your_openai_api_key_here"
    success "OPENAI_API_KEY を設定しました"
  else
    warn "OPENAI_API_KEY をスキップしました（埋め込み機能は無効になります）。"
  fi
fi

success ".env の設定が完了しました"

# ---------------------------------------------------------------------------
# ステップ4: Docker Compose 起動
# ---------------------------------------------------------------------------
step "Docker Compose でサービスを起動しています..."

info "ビルドと起動を開始します（初回は数分かかる場合があります）..."
docker compose up --build -d

# 起動確認（最大60秒待機）
info "サービスの起動を確認しています..."
MAX_WAIT=60
INTERVAL=5
elapsed=0

while [[ ${elapsed} -lt ${MAX_WAIT} ]]; do
  running=$(docker compose ps --status running --quiet 2>/dev/null | wc -l | tr -d ' ')
  if [[ "${running}" -gt 0 ]]; then
    success "サービスが起動しました（起動中のコンテナ数: ${running}）"
    break
  fi
  info "起動待機中... (${elapsed}秒 / ${MAX_WAIT}秒)"
  sleep "${INTERVAL}"
  elapsed=$((elapsed + INTERVAL))
done

if [[ ${elapsed} -ge ${MAX_WAIT} ]]; then
  warn "タイムアウト：一部のサービスがまだ起動中の可能性があります。"
  warn "以下のコマンドでログを確認してください: docker compose logs -f"
fi

# ---------------------------------------------------------------------------
# ステップ5: 完了メッセージ
# ---------------------------------------------------------------------------
printf "\n"
printf "${GREEN}${BOLD}========================================${RESET}\n"
printf "${GREEN}${BOLD}  idobata のセットアップが完了しました！${RESET}\n"
printf "${GREEN}${BOLD}========================================${RESET}\n"
printf "\n"
printf "${BOLD}アクセスURL:${RESET}\n"
printf "  フロントエンド: ${CYAN}%s${RESET}\n" "${FRONTEND_URL}"
printf "  管理画面:       ${CYAN}%s${RESET}\n" "${ADMIN_URL}"
printf "\n"
printf "${BOLD}便利なコマンド:${RESET}\n"
printf "  ログ確認:    docker compose logs -f\n"
printf "  停止:        docker compose down\n"
printf "  再起動:      docker compose restart\n"
printf "\n"
printf "${BOLD}APIキーの設定:${RESET}\n"
printf "  .env ファイルを編集してAPIキーを設定してください:\n"
printf "  %s\n" "$(pwd)/.env"
printf "\n"
printf "  設定後にサービスを再起動:  docker compose restart\n"
printf "\n"
