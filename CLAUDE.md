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

npm workspaces を使用。ルートの `package.json` が 3 つのワークスペースを定義：

```
idobata/
├── frontend/              # いどばたビジョン ユーザー画面（React + Vite）
├── admin/                 # 管理画面（React + Vite）
├── idea-discussion/
│   └── backend/           # いどばたビジョン バックエンド（Express + MongoDB）
├── python-service/        # 埋め込み・クラスタリング（FastAPI + Chromadb）
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

## 環境変数

各ワークスペースに `.env` ファイルが必要。`.env.template` または `.env.example` を参照してコピーして設定する。

---

## 開発環境セットアップ

詳細は `docs/development-setup.md` を参照。Docker Compose を使用した環境構築が前提。
