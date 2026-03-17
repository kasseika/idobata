# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

idobata は民主主義における議論・合意形成を支援するオープンソースプラットフォームです。**いどばたビジョン**（意見収集・論点整理）モジュールで構成されています。

---

## コマンド

### 全ワークスペース一括実行（ルートから）

```bash
npm run lint        # Biome Lint（全ワークスペース）
npm run format      # Biome フォーマット（全ワークスペース）
npm run test        # Vitest テスト（全ワークスペース）
npm run typecheck   # TypeScript 型チェック（全ワークスペース）
npm run check       # lint + typecheck + test まとめて実行
npm run knip        # 未使用依存関係チェック
```

### 各ワークスペースの個別実行

各ワークスペースディレクトリに移動して実行するか、Makefile ショートカットを使用：

```bash
# 例：いどばたビジョン バックエンド
cd idea-discussion/backend && npm run test
cd idea-discussion/backend && npm run lint

# Makefile ショートカット（同等）
make idea-discussion-backend-test
make frontend-test
make admin-test
```

### 単一テストファイルの実行

```bash
cd <ワークスペースディレクトリ> && npx vitest run <テストファイルパス>
```

### 開発サーバー起動

```bash
# 全サービス起動（Docker Compose）
docker compose up
make containers-start  # 同等

# いどばたビジョンのみ
make idea-discussion-containers-start
```

---

## アーキテクチャ

### モノレポ構成

npm workspaces を使用。ルートの `package.json` が 3 つの npm ワークスペースを定義（`frontend`, `admin`, `idea-discussion/backend`）。`python-service` は npm ワークスペースではなく Docker Compose で管理される独立サービス：

```text
idobata/
├── frontend/              # いどばたビジョン ユーザー画面（React + Vite）
├── admin/                 # 管理画面（React + Vite）
├── idea-discussion/
│   └── backend/           # いどばたビジョン バックエンド（Express + MongoDB）
├── python-service/        # 埋め込み・クラスタリング（FastAPI + Chromadb）※npm workspace外
└── docker-compose.yml     # 全サービスのオーケストレーション
```

### データフロー

- **いどばたビジョン**: `frontend` → `idea-discussion/backend`（Express + MongoDB + Socket.IO）→ OpenAI API
- **管理**: `admin` → `idea-discussion/backend`（同一バックエンドを共有）
- **AI/ML**: `python-service`（FastAPI）が埋め込みベクトル生成・クラスタリングを担当、Chromadb でベクトル検索

### 各ワークスペースの技術スタック

| ワークスペース | フレームワーク | DB | 特記事項 |
|---|---|---|---|
| `frontend` | React 19 + Vite | - | Socket.IO クライアント |
| `admin` | React 19 + Vite | - | |
| `idea-discussion/backend` | Express 5 + TypeScript | MongoDB（Mongoose） | Socket.IO、JWT 認証 |

---

## コード規約

### Linting / Formatting

**Biome**（`biome.json`）がプロジェクト全体のルールを管理：
- インデント：スペース 2
- セミコロン：必須
- 行末：LF
- TypeScript の `as` 型アサーションは最小限に

### フロントエンドコンポーネント

- **shadcn/ui** コンポーネントを優先使用
- アイコンは **lucide-react** を使用

---

## Git Worktree ワークフロー

**⚠️ CRITICAL: 変更作業は必ず git worktree を作成してから開始すること。メインのリポジトリディレクトリ（`/home/mtane0412/dev/idobata`）では直接変更を行わない。**

### 目的

- mainブランチを常にクリーンに保つ
- 作業の分離と並列作業を容易にする

### Worktree 作成手順

```bash
# 1. worktreeを作成（ブランチ命名規則は @rules/git-workflow.md に従う）
git worktree add ../idobata-<branch-name> -b <branch-name>

# 2. settings.local.jsonをコピー（権限設定のため必須）
mkdir -p ../idobata-<branch-name>/.claude
cp .claude/settings.local.json ../idobata-<branch-name>/.claude/

# 3. .envをコピー（環境変数の引き継ぎ）
cp .env ../idobata-<branch-name>/

# 4. 依存パッケージをインストール
cd ../idobata-<branch-name> && npm ci
```

### Worktree 削除手順（作業完了・マージ後）

```bash
cd /home/mtane0412/dev/idobata
git worktree remove ../idobata-<branch-name>
```

---

## 環境変数

- **Docker Compose 利用時**（推奨）: ルートの `.env.template` をコピーして `.env` を作成する。Docker Compose はルートの `.env` を読み込む。
- **各ワークスペースを単体起動する場合**: 各ワークスペースディレクトリに `.env` を配置するか、環境変数を直接渡す。

---

## 開発環境セットアップ

詳細は `docs/development-setup.md` を参照。Docker Compose を使用した環境構築が前提。
