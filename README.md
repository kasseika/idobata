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

- Caddy リバースプロキシ（Cloudflare DNS-01 による自動SSL）
- MongoDB認証設定
- 本番用Docker Compose構成
- GitHub Actions による自動デプロイ（CD）

---

## クイックスタート

以下のコマンドをターミナルに貼り付けるだけでセットアップが完了します：

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/kasseika/idobata/main/scripts/setup.sh)"
```

> **セキュリティ上の注意**: 実行前にスクリプトの内容を確認することを推奨します：
> ```bash
> curl -fsSL https://raw.githubusercontent.com/kasseika/idobata/main/scripts/setup.sh | less
> ```

- Docker 未導入でも Linux/WSL 環境なら自動インストールを提案します
- OPENROUTER_API_KEY などのAPIキーを対話形式で入力できます
- 実行後は http://localhost:5173 でアクセスできます

---

## セットアップ・デプロイ

- **開発環境（詳細）**: [docs/development-setup.md](./docs/development-setup.md)
- **本番デプロイ（VPS）**: [docs/vps-deployment.md](./docs/vps-deployment.md)

---

## ライセンス

GNU General Public License v3.0 — 詳細は [LICENSE](./LICENSE) を参照してください。
