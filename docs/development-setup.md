# Idobata プロジェクト - 開発環境構築手順

## 重要なドキュメント

- [プロジェクト概要](./README.md)
- [プロジェクト状況](./project_status.md) (開発者向け)
- [開発環境構築ガイド](./development-setup.md) (開発者向け、本ドキュメント)
- [コントリビューションガイド](./CONTRIBUTING.md) (開発者向け)

このドキュメントでは、`idea-discussion` アプリケーションの開発環境を Docker Compose を使用してセットアップし、実行する方法について説明します。

## プロジェクト構成

このプロジェクトは以下のコンポーネントで構成されています：

- **ルートレベルの frontend**: idea-discussion 用のフロントエンド。TypeScript をサポートし、JSX と TSX の両方のファイル形式を扱えます。（かつて idea-discussion/frontend だったものです）
- **idea-discussion/backend**: アイデア議論のためのバックエンド（Node.js）
- **MongoDB**: データベース

## 前提条件

- **Docker:** お使いのオペレーティングシステム用の Docker Desktop（または Docker Engine + Docker Compose）をインストールしてください。[https://www.docker.com/get-started](https://www.docker.com/get-started)
- **リポジトリのクローン:** まず、プロジェクトリポジトリをクローンします。
  ```bash
  git clone <your-repository-url>
  cd idobata
  ```

## セットアップ

### 共通のセットアップ

1.  **`.env` ファイルの作成:**
    テンプレートファイル `.env.template` をコピーして `.env` という名前の新しいファイルを作成します。
    ```bash
    cp .env.template .env
    ```

### Idea Discussion セットアップ

`idea-discussion` を実行するために必要な設定です。

1.  **`.env` ファイルの設定:**
    `.env` ファイルを編集し、以下の変数を設定してください。
    - `OPENROUTER_API_KEY`: OpenRouter の API キー (バックエンドで使用)
    - `IDEA_FRONTEND_API_BASE_URL`: フロントエンドがアクセスするバックエンド API の URL（通常は `http://localhost:3000`）

## 開発環境の実行

### 全サービスの起動

すべてのサービスを同時に起動する場合：

```bash
docker compose up --build -d
```

### Idea Discussion の起動

ルートレベルのフロントエンドと idea-discussion のバックエンド、および MongoDB を起動する場合：

```bash
# 必要なセットアップ: Idea Discussion セットアップ
docker compose up --build -d frontend idea-backend mongo
```

## アプリケーションへのアクセス

- **Idea Discussion フロントエンド:** [http://localhost:5173](http://localhost:5173)
- **管理者ページ:** [http://localhost:5175/](http://localhost:5175/)
  - 管理者作成の設定が必要です。[../admin/README.md](../admin/README.md)

## ログの表示

実行中の全サービスのログを表示するには:

```bash
docker compose logs -f
```

特定のサービス（例: `idea-backend`）のログを表示するには:

```bash
docker compose logs -f idea-backend
```

## 環境の停止

実行中のサービスを停止し、コンテナ、ネットワークを削除するには（名前付きボリューム `mongo_data` は保持されます）:

```bash
docker compose down
```

名前付きボリューム `mongo_data` も含めて削除する（すべてのデータベースデータが削除されます）には:

```bash
docker compose down -v
```

## 開発ワークフロー

- ローカルのエディタでフロントエンドまたはバックエンドのプロジェクトのコードを編集します。
- 変更は自動的に以下をトリガーするはずです:
  - フロントエンドコンテナ (Vite): Hot Module Replacement (HMR)
  - `idea-backend` コンテナ (`nodemon`): サーバーの再起動
- HMR が自動的に適用されない場合は、ブラウザをリフレッシュしてフロントエンドの変更を確認してください。
- `package.json` ファイルを変更した場合は、特定のサービスのイメージを再ビルドする必要があるかもしれません:
  ```bash
  # 特定のサービスを再ビルドして再起動
  docker compose build <service_name> # 例: docker compose build idea-backend
  docker compose up -d --no-deps <service_name>
  ```
  または、単に `docker compose up --build -d` を再度実行します。
