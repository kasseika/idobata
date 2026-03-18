# いどばたビジョン 概要ドキュメント

## 目次

1. [いどばたビジョンとは](#1-いどばたビジョンとは)
2. [サービスの仕組み](#2-サービスの仕組み)
3. [AIと技術の透明性](#3-aiと技術の透明性)
4. [システムアーキテクチャ](#4-システムアーキテクチャ)
5. [データモデル](#5-データモデル)
6. [管理機能](#6-管理機能)
7. [デプロイと運用](#7-デプロイと運用)
8. [開発への参加](#8-開発への参加)

---

## 1. いどばたビジョンとは

### 目的・ビジョン

いどばたビジョンは、民主主義における議論・合意形成を支援するオープンソースプラットフォームです。市民や自治体関係者が特定のテーマについて意見を出し合い、AIが論点を整理・可視化することで、より多くの人が政策立案プロセスに参加できることを目指しています。

主な特徴は以下の通りです：

- **メールアドレス不要の匿名参加**: 端末ごとに自動生成されるIDで誰でも即座に参加できます
- **AIによる論点整理**: 多数の意見から重要な課題や解決策をAIが自動で抽出・整理します
- **透明性の高いプロセス**: AIがどのように意見を処理しているかを可視化します

### fork元との関係

本プロジェクトは [digitaldemocracy2030/idobata](https://github.com/digitaldemocracy2030/idobata) のforkです。fork元のいどばたビジョン（意見収集・論点整理）モジュールに特化し、セルフホスティング向けの本番運用基盤（SSL対応nginx設定、MongoDB認証、本番用Docker Compose構成）を追加しています。

### ライセンス

GNU General Public License v3.0 — 詳細は [LICENSE](../LICENSE) を参照してください。

---

## 2. サービスの仕組み

### ユーザー体験フロー

いどばたビジョンは以下の流れで利用します：

```text
トップページ
    ↓
テーマ一覧（議論のトピック一覧）
    ↓
テーマ詳細（課題・解決策・重要論点の一覧）
    ↓
AIチャット（テーマについてAIと対話）
    ↓
課題・解決策の自動抽出（AIがチャット内容から抽出）
    ↓
重要論点の閲覧（AIが生成した「How Might We...」形式の問い）
    ↓
レポート閲覧（論点まとめ・政策ドラフト・ダイジェスト等）
```

### 匿名参加の仕組み

いどばたビジョンへの参加にメールアドレスや会員登録は不要です。初めてアクセスした端末に対して、ブラウザのlocalStorageにUUID（ランダムな識別子）が自動生成・保存されます。この識別子が匿名ユーザーIDとして機能するため、ユーザーはサービスを即座に利用できます（`frontend/src/utils/userIdManager.ts`）。

> **注意**: 同じ端末・ブラウザを使用する限り同一ユーザーとして認識されますが、ブラウザのデータを消去すると新しいIDが生成されます。

### 主要概念

| 概念 | 説明 |
|------|------|
| **テーマ (Theme)** | 議論のトピック。例：「地域の公共交通をどう改善するか」。管理者が作成・管理します |
| **AIチャット** | テーマについてAIと1対1で対話する場。ユーザーの意見・考えを自由に話し合えます |
| **課題 (Problem)** | チャット内容からAIが自動抽出する「現状の問題点」 |
| **解決策 (Solution)** | チャット内容からAIが自動抽出する「改善のアイデア」 |
| **重要論点 (SharpQuestion)** | 抽出された課題群を分析してAIが生成する「How Might We...」形式の問い。議論の焦点を明確にします |
| **レポート** | テーマの議論全体をまとめた各種文書。論点まとめ、意見まとめ、イラスト要約、政策ドラフト、ダイジェストの形式があります |

---

## 3. AIと技術の透明性

### 使用しているAIモデルと用途

いどばたビジョンは複数のAIモデルを用途に応じて使い分けています。すべてのLLM（大規模言語モデル）呼び出しはOpenRouter API経由で行われます。

| モデル | 用途 |
|--------|------|
| `google/gemini-2.0-flash-001` | チャット応答・課題/解決策の抽出・論点リンキング（日常的な処理に使用） |
| `google/gemini-2.5-pro-preview-03-25` | 重要論点生成・政策ドラフト・ダイジェスト・レポート生成・論点分析（高精度が必要な処理に使用） |
| `anthropic/claude-3.7-sonnet` | ビジュアルレポート（HTML形式のイラスト要約生成） |
| `text-embedding-3-small`（OpenAI） | テキストの埋め込みベクトル生成（python-serviceが使用） |

### AI処理パイプラインの全体フロー

```text
ユーザーがAIチャットで意見を入力
        │
        ▼
[Gemini 2.0 Flash]
チャット応答を生成 → ユーザーに返答
        │
        ▼
[Gemini 2.0 Flash]（バックグラウンドワーカー）
チャット内容から課題・解決策を自動抽出
        │
        ▼
[Gemini 2.0 Flash]（バックグラウンドワーカー）
課題・解決策と重要論点を関連付け（リンキング）
        │
        ▼
[Gemini 2.5 Pro]（管理者操作によるトリガー）
重要論点（SharpQuestion）を生成
        │
        ▼
[Gemini 2.5 Pro]（管理者操作によるトリガー）
政策ドラフト・ダイジェスト・レポート・論点分析を生成
        │
        ▼
[Claude 3.7 Sonnet]（管理者操作によるトリガー）
ビジュアルレポート（HTML形式）を生成
```

### データの流れ

```text
ユーザー入力（テキスト）
        │
        ▼
idea-discussion/backend（Express）
        │
        ├─→ OpenRouter API（LLM処理）
        │         │
        │         ▼
        │   AIレスポンス・抽出結果
        │
        ├─→ MongoDB（全データを永続化）
        │         │
        │         ▼
        │   Theme / ChatThread / Problem / Solution /
        │   SharpQuestion / QuestionLink 等
        │
        └─→ python-service（FastAPI）
                  │
                  ▼
            OpenAI Embeddings API
            （テキスト→ベクトル変換）
                  │
                  ▼
            ChromaDB（ベクトルデータベース）
            （類似検索・クラスタリングに使用）
```

### プライバシーに関する注意

- チャット内容はLLM処理のためOpenRouter API経由でLLMプロバイダー（Google、Anthropic）に送信されます
- 埋め込みベクトル生成のためOpenAI APIに課題・解決策のテキストが送信されます
- MongoDBにはチャット履歴・抽出結果・レポートがすべて保存されます

---

## 4. システムアーキテクチャ

### サービス構成（4サービス + nginxリバースプロキシ）

```text
                        インターネット
                             │
                             ▼
                      ┌─────────────┐
                      │    nginx    │
                      │（リバースプロキシ）│
                      └──────┬──────┘
                             │
           ┌─────────────────┼──────────────────┐
           │                 │                  │
           ▼                 ▼                  ▼
    ┌─────────────┐  ┌──────────────┐  ┌──────────────┐
    │  frontend   │  │    admin     │  │   backend    │
    │ React 19    │  │  React 19    │  │  Express 5   │
    │  + Vite     │  │   + Vite     │  │ + MongoDB    │
    │ ポート:5173  │  │ ポート:5175   │  │ + Socket.IO  │
    └─────────────┘  └──────────────┘  └──────┬───────┘
                                              │
                                              ▼
                                    ┌──────────────────┐
                                    │  python-service  │
                                    │  FastAPI         │
                                    │  + ChromaDB      │
                                    │  ポート:8000      │
                                    └──────────────────┘
```

### nginxルーティング

| パス | 転送先 | 用途 |
|------|--------|------|
| `/` | `frontend:5173` | ユーザー向け画面 |
| `/admin/` | `admin:5175` | 管理画面 |
| `/api/idea/` | `backend:3000` | REST API |
| `/socket.io/` | `backend:3000` | Socket.IO（WebSocket） |
| `/api/python/` | `python-service:8000` | 埋め込み・クラスタリングAPI |

### Socket.IOによるリアルタイム通信

AIチャットとデータ更新通知にSocket.IOを使用しています。

- **チャット**: ユーザーのメッセージ送信・AIレスポンスの受信をリアルタイムで処理
- **抽出通知**: 課題・解決策の抽出完了をリアルタイムでフロントエンドに通知
- **設定**: 負荷軽減のため、WebSocket専用（ポーリングフォールバックなし）

---

## 5. データモデル

### エンティティ関係図

```text
Theme（テーマ）
  ├── ChatThread（チャットスレッド）
  │     └── messages[]（チャット履歴）
  ├── Problem（課題）          ←── ChatThread から抽出
  ├── Solution（解決策）       ←── ChatThread から抽出
  ├── SharpQuestion（重要論点）←── Problem 群から生成
  │     └── QuestionLink（論点リンク）
  │           ├── Problem へのリンク（関連スコア付き）
  │           └── Solution へのリンク（関連スコア付き）
  ├── PolicyDraft（政策ドラフト）
  ├── DigestDraft（ダイジェスト）
  └── Like（投票）
```

### 各モデルの役割

| モデル | 役割 |
|--------|------|
| **Theme** | 議論のトピック。タイトル・説明・スラッグ・公開状態・タグを持ちます |
| **ChatThread** | ユーザーとAIのチャット履歴。匿名ユーザーIDとセッションIDを保持します |
| **Problem** | チャットから抽出された課題。抽出元チャットへの参照を持ちます |
| **Solution** | チャットから抽出された解決策。抽出元チャットへの参照を持ちます |
| **SharpQuestion** | 「How Might We...」形式の重要論点。表示順序とタグを持ちます |
| **QuestionLink** | 重要論点と課題・解決策を関連付けるリンク。関連度スコア付き |
| **PolicyDraft** | AIが生成した政策ドラフト文書 |
| **DigestDraft** | AIが生成したダイジェスト（要約文書） |
| **Like** | ユーザーによる課題・解決策・重要論点への投票 |

---

## 6. 管理機能

### 管理者ができること

管理画面（`/admin/`）では以下の操作が可能です：

| 機能 | 説明 |
|------|------|
| **テーマ管理** | テーマの作成・編集・削除・公開状態の切り替え |
| **重要論点生成** | Gemini 2.5 Proを使用した重要論点（SharpQuestion）の自動生成 |
| **レポート生成** | 政策ドラフト・ダイジェスト・ビジュアルレポート等の生成 |
| **埋め込み生成** | 課題・解決策のテキストをベクトル化（python-service連携） |
| **クラスタリング** | ベクトル化されたデータをクラスタリングして分類 |
| **ベクトル検索** | 意味的に類似した課題・解決策を検索 |
| **サイト設定** | サイト名・説明等のグローバル設定の管理 |

### 認証の仕組み

管理画面へのアクセスにはJWT（JSON Web Token）認証が必要です。

- パスワードはbcryptでハッシュ化し、pepperを付与して保存
- JWTトークンは環境変数`JWT_SECRET`で署名
- トークンの有効期限は環境変数`JWT_EXPIRES_IN`で設定（`.env.template` の推奨値は `1d`。未設定時の動作はjsonwebtokenライブラリに依存します）

---

## 7. デプロイと運用

### 構成

Docker Composeを使用したコンテナベースの構成です。VPSへのセルフホスティングを前提として設計されています。

```text
docker-compose.yml        # 開発環境用
docker-compose.prod.yml   # 本番環境用
nginx.conf                # 開発用nginx設定
nginx.prod.conf           # 本番用nginx設定（SSL終端）
deploy.sh                 # 本番デプロイスクリプト
```

### SSL/TLS

本番環境ではLet's Encryptが発行するTLS証明書とcertbotを使用してHTTPS接続を実現します。証明書の自動更新もcertbotが担当します。

### 必要な外部サービス

| サービス | 用途 | 環境変数 |
|---------|------|---------|
| **OpenRouter API** | LLM呼び出し（Gemini、Claude） | `OPENROUTER_API_KEY` |
| **OpenAI API** | 埋め込みベクトル生成 | `OPENAI_API_KEY` |

### 主要な環境変数

| 変数 | 説明 |
|------|------|
| `OPENROUTER_API_KEY` | OpenRouter APIキー（必須） |
| `OPENAI_API_KEY` | OpenAI APIキー（必須） |
| `JWT_SECRET` | JWT署名キー（必須） |
| `MONGODB_URI` | MongoDB接続URL |
| `IDEA_CORS_ORIGIN` | CORS許可オリジン |

詳細は `.env.template` を参照してください。

---

## 8. 開発への参加

### 関連ドキュメント

| ドキュメント | 内容 |
|-------------|------|
| [開発環境セットアップ](./development-setup.md) | Docker Composeを使った開発環境の構築手順 |
| [本番デプロイ（VPS）](./vps-deployment.md) | VPSへの本番デプロイ手順（SSL、MongoDB認証設定） |
| [コントリビューションガイド](./CONTRIBUTING.md) | Issue作成・PR手順・コーディング規約 |
| [プロジェクト状況](./project_status.md) | 現在の開発状況と今後の計画 |

### 技術スタック一覧

| レイヤー | 技術 |
|---------|------|
| フロントエンド | React 19、Vite、TypeScript、Socket.IO Client、shadcn/ui、lucide-react |
| バックエンド | Express 5、TypeScript、MongoDB（Mongoose）、Socket.IO |
| AI/ML | FastAPI、ChromaDB、scikit-learn、OpenAI Python SDK |
| AI API | OpenRouter API（Gemini 2.0 Flash / Gemini 2.5 Pro / Claude 3.7 Sonnet）、OpenAI Embeddings |
| インフラ | Docker Compose、nginx、Let's Encrypt（certbot） |
| コード品質 | Biome（Lint/Format）、Vitest（テスト）、TypeScript（型チェック） |
