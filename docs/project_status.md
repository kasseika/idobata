# idobata（kasseika fork）プロジェクト状況（最終更新 2026/3/21）

本ドキュメントは [digitaldemocracy2030/idobata](https://github.com/digitaldemocracy2030/idobata) の
kasseika fork における現在の運用状況と課題を記録しています。

---

## 1. プロジェクト概要

fork元の「いどばたビジョン」を kasseika 組織内で継続的に活用するため、自前のVPSにセルフホスティングして運用しています。

### 現在のシステム構成

```text
.
├── admin                    # いどばたビジョンの管理画面
├── frontend                 # いどばたビジョンのユーザー画面
├── idea-discussion/
│   └── backend              # いどばたビジョンのバックエンド
├── python-service           # 埋め込み・クラスタリング（FastAPI + ChromaDB）
├── Caddyfile                # 本番リバースプロキシ設定
├── docker-compose.prod.yml  # 本番用Docker Compose構成
└── .github/workflows/
    └── deploy.yml           # GitHub Actions CD ワークフロー
```

---

## 2. 達成済みの項目

### fork元からの改善・追加

- **いどばたビジョン特化**: policy-editモジュールを削除し、いどばたビジョンのみに絞り込み
- **VPS本番デプロイ基盤**: Caddy + Cloudflare DNS-01による自動SSL取得・更新
- **GitHub Actions CD**: main push → CI → GHCRビルド → VPSデプロイの自動化
- **MongoDB認証**: 本番環境でのMongoDBユーザー認証設定
- **TypeScript strict化**: tsconfig strict オプション有効化（tsマイグレーション完了）

### fork元で実装済み（運用中）

- レポート出力機能（政策ドラフト・ダイジェスト・ビジュアルレポート等）
- チャット履歴保存
- テーマ設定・レポート管理（管理画面）
- AIによる課題・解決策の自動抽出
- 重要論点（SharpQuestion）生成
- リアルタイム更新（Socket.IO）
- 匿名参加（localStorage UUID）

---

## 3. 残課題

### 運用面

- MongoDB の定期バックアップ自動化（現在は手動）
- VPS リソース監視・アラート設定

### 機能面

- シェア時の見栄え調整（OGP設定）
- UI ブラッシュアップ

---

## 4. 参照リソース

- [プロジェクト概要](./overview.md)
- [開発環境構築ガイド](./development-setup.md)
- [本番デプロイガイド](./vps-deployment.md)
- [コントリビューションガイド](./CONTRIBUTING.md)
