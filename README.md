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

### セットアップスクリプトで起動（推奨）

`setup.sh` 1つで環境構築が完了します。git clone 不要です：

```bash
curl -fsSL https://raw.githubusercontent.com/kasseika/idobata/main/setup.sh -o setup.sh
bash setup.sh
```

> **セキュリティ上の注意**: 実行前にスクリプトの内容を確認することを推奨します：
> ```bash
> curl -fsSL https://raw.githubusercontent.com/kasseika/idobata/main/setup.sh | less
> ```

実行すると以下を選択できます：
- **quick モード**: HTTP試用（ローカル・社内ネットワーク向け）
- **prod モード**: HTTPS本番（SSL証明書自動取得・MongoDB認証・Watchtower自動更新）

### ワンライナーセットアップ（開発環境構築）

git clone とローカルビルドを含む開発環境を一括でセットアップするには：

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/kasseika/idobata/main/scripts/setup.sh)"
```

- Docker 未導入でも Linux/WSL 環境なら自動インストールを提案します
- 起動後に管理画面からOpenRouter APIキーを設定できます
- 実行後は http://localhost:5173 でアクセスできます

---

## セットアップ・デプロイ

- **開発環境（詳細）**: [docs/development-setup.md](./docs/development-setup.md)
- **本番デプロイ（VPS）**: [docs/vps-deployment.md](./docs/vps-deployment.md)

---

## ライセンス

GNU General Public License v3.0 — 詳細は [LICENSE](./LICENSE) を参照してください。
