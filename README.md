# idobata（kasseika fork）

[digitaldemocracy2030/idobata](https://github.com/digitaldemocracy2030/idobata) のforkです。

PoCの**いどばたビジョン**を組織内で継続的に活用するため、本番VPSへのセルフホスティングを目的としています。

プロジェクトの詳細（目的・機能・ワークフロー）はfork元のREADMEをご参照ください。

---

## fork元との差分

### いどばたビジョン特化

policy-editモジュールを削除し、**いどばたビジョン**のみに絞り込んでいます。

### VPS本番デプロイ基盤の追加

自前のVPSで本番運用するための設定一式を追加しています。

- SSL終端nginx設定（Let's Encrypt対応）
- MongoDB認証設定
- 本番用Docker Compose構成
- デプロイスクリプト（`deploy.sh`）

---

## セットアップ・デプロイ

- **開発環境**: [docs/development-setup.md](./docs/development-setup.md)
- **本番デプロイ（VPS）**: [docs/vps-deployment.md](./docs/vps-deployment.md)

---

## ライセンス

GNU General Public License v3.0 — 詳細は [LICENSE](./LICENSE) を参照してください。
