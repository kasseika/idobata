# チャット機能仕様ドキュメント

## 目次

1. [概要](#1-概要)
2. [アーキテクチャ](#2-アーキテクチャ)
3. [APIエンドポイント](#3-apiエンドポイント)
4. [データモデル](#4-データモデル)
5. [メッセージ送信フロー](#5-メッセージ送信フロー)
6. [スレッド管理](#6-スレッド管理)
7. [UI構成](#7-ui構成)
8. [特殊ボタンの動作](#8-特殊ボタンの動作)
9. [LocalStorage使用状況](#9-localstorage使用状況)
10. [レガシーUI](#10-レガシーui)
11. [未使用・残存コード](#11-未使用残存コード)
12. [進化の経緯（時系列）](#12-進化の経緯時系列)

---

## 1. 概要

### 目的

チャット機能は、ユーザーがテーマ（議論トピック）または重要論点（SharpQuestion）についてAIと1対1で対話し、課題・解決策を抽出するための仕組みです。ユーザーが自由に意見を述べると、AIがその内容から課題（Problem）と解決策（Solution）を自動抽出し、テーマの議論データとして蓄積します。

### fork元との関係

本機能は [digitaldemocracy2030/idobata](https://github.com/digitaldemocracy2030/idobata) のforkを起点とし、プロトタイプ期（2025/4頃、blu3mo/idobata-prototype由来）から段階的に発展しています。

---

## 2. アーキテクチャ

### フロントエンド層の構成

フロントエンドのチャットUIは以下の3層構造になっています：

```text
FloatingChat（表示制御・モバイルボタン）
    └── ChatSheet（シート/サイドバーコンテナ）
            └── ExtendedChatHistory（メッセージ一覧・入力フォーム）
```

- `FloatingChat`: デスクトップでのサイドバー常時表示とモバイルでのフローティングボタンを切り替える最外層コンポーネント
- `ChatSheet`: シートまたはサイドバーのコンテナ。shadcn/ui の Sheet コンポーネントをベースにしています
- `ExtendedChatHistory`: メッセージの表示・送信フォームを担当する実体

### ビジネスロジック層

用途に応じて2つのChatManagerクラスが存在します：

| クラス | 使用ページ | 役割 |
|--------|-----------|------|
| `ThemeDetailChatManager` | ThemeDetail | テーマ単位でのチャット管理 |
| `QuestionChatManager` | QuestionDetail | 重要論点単位でのチャット管理 |

両クラスはスレッドIDの管理、メッセージの送受信、抽出結果の取得などのビジネスロジックを集約しています。

### バックエンド層

`idea-discussion/backend` の Express アプリケーション（`chatController.js`）が全チャットAPIを処理します。

### データストア

MongoDB の `ChatThread` コレクションにスレッド単位でデータを格納します。メッセージはサブドキュメント配列としてスレッドに埋め込んで保存されます。

### リアルタイム通信

Socket.IO は課題・解決策の抽出完了通知にのみ使用しています。チャットメッセージの送受信自体は REST API（HTTPリクエスト）で行います。

```text
チャット本文の送受信 → REST API（同期）
抽出結果の通知     → Socket.IO（非同期・リアルタイム）
```

---

## 3. APIエンドポイント

すべてのエンドポイントは `idea-discussion/backend` の `chatController.js` で実装されています。

### メッセージ送信・AI応答

```http
POST /api/themes/:themeId/chat/messages
```

- リクエストボディ: `{ userId, message, threadId? }`
- `threadId` 未指定時は新規スレッドを自動作成します
- バックエンドで参考情報収集 → LLM呼び出し → 応答保存 → 非同期で課題/解決策抽出の順に処理します
- レスポンス: AIの応答メッセージと `threadId`

### メッセージ履歴取得

```http
GET /api/themes/:themeId/chat/threads/:threadId/messages
```

- 指定スレッドのメッセージ一覧を返します

### 抽出結果取得

```http
GET /api/themes/:themeId/chat/threads/:threadId/extractions
```

- 指定スレッドから抽出された課題・解決策のドキュメント配列を返します（`extractedProblemIds` / `extractedSolutionIds` を populate して返すため、IDではなくドキュメント本体）

### テーマ別スレッド取得/作成

```http
GET /api/themes/:themeId/chat/thread?userId=xxx
```

- 指定ユーザーのテーマ単位スレッドを返します（存在しない場合は自動作成）

### 論点別スレッド取得/作成

```http
GET /api/themes/:themeId/chat/thread-by-question?userId=xxx&questionId=xxx
```

- 指定ユーザーの重要論点単位スレッドを返します（存在しない場合は自動作成）

---

## 4. データモデル

### ChatThreadスキーマ

`idea-discussion/backend/models/ChatThread.js` で定義されています。

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `userId` | String | 匿名ユーザーID（localStorage の UUID） |
| `themeId` | ObjectId | 所属テーマへの参照 |
| `questionId` | ObjectId（任意） | 論点別スレッドの場合の重要論点への参照 |
| `messages` | messageSchema[] | メッセージのサブドキュメント配列（messageSchema の配列） |
| `extractedProblemIds` | ObjectId[] | このスレッドから抽出された課題IDの配列 |
| `extractedSolutionIds` | ObjectId[] | このスレッドから抽出された解決策IDの配列 |

### messageSchema スキーマ

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `role` | String | `"user"` または `"assistant"` |
| `content` | String | メッセージ本文 |
| `timestamp` | Date | 送信日時 |

### 二重定義問題

`ChatThread.ts`（TypeScript版）と `ChatThread.js`（JavaScript版）の2ファイルが存在しますが、実際にバックエンドが使用しているのは `ChatThread.js` のみです。`ChatThread.ts` は現時点で未使用のデッドコードです。

---

## 5. メッセージ送信フロー

### フロントエンド → バックエンド

```text
1. ユーザーがテキストを入力・送信
2. ChatManager.addMessage() が呼び出される
3. apiClient.sendMessage() 経由で REST API を呼び出す
   POST /api/themes/:themeId/chat/messages
```

### バックエンド処理（同期）

```text
1. リクエスト受信
2. 参考情報の収集（過去の課題・解決策・重要論点等をコンテキストとして構築）
3. OpenRouter API 経由で LLM を呼び出しAI応答を生成（使用モデルは `resolveStageConfig(themeId, "chat")` でテーマのパイプライン設定から解決。未設定時はデフォルト `google/gemini-3.1-flash-lite-preview`）
4. ユーザーメッセージとAI応答をスレッドに保存
5. フロントエンドにAI応答を返す
```

### バックエンド処理（非同期）

```text
AI応答返却後、バックグラウンドで以下を実行：
1. チャット内容から課題・解決策を抽出（LLM呼び出し）
2. 抽出された課題・解決策をMongoDBに保存
3. Socket.IO でフロントエンドに抽出完了を通知
```

---

## 6. スレッド管理

### スレッドの作成

スレッドは以下の2つのパターンで作成されます：

- **メッセージ送信時の自動作成**: `POST /api/themes/:themeId/chat/messages` のリクエストに `threadId` が含まれない場合、新規スレッドが自動作成されます
- **スレッド取得APIによる作成**: `GET /api/themes/:themeId/chat/thread` および `GET /api/themes/:themeId/chat/thread-by-question` は、スレッドが存在しない場合に自動作成してIDを返します

### スレッドの多重度制約

- テーマ単位: 1ユーザーにつき1テーマで1スレッド
- 論点単位: 1ユーザーにつき1重要論点で1スレッド

### スレッドの終了・削除

スレッドの明示的な終了や削除の機能は実装されていません。`statusフィールド` も存在しません。スレッドは作成後、削除されることなくMongoDBに残り続けます。

> **注意**: スレッドが無期限に蓄積されるため、長期運用ではコレクションの肥大化が懸念されます。将来的な対策として、MongoDBのTTLインデックスによる自動削除、`status` フィールド導入による論理削除、または古いスレッドのアーカイブ化などが選択肢として考えられます。

---

## 7. UI構成

### デスクトップ（1280px以上）

画面右側に幅480pxの固定サイドバーとして常時表示されます。ページをスクロールしても追従する固定レイアウトです。

### モバイル（1280px未満）

画面右下にフローティングボタン（吹き出しアイコン）が表示されます。ボタンをタップするとボトムシートとして展開します。ボトムシートの高さはドラッグ操作で変更できます。

### 表示されるページ

| ページ | ChatManagerクラス | スレッド種別 |
|--------|-----------------|------------|
| ThemeDetail（テーマ詳細） | `ThemeDetailChatManager` | テーマ単位スレッド |
| QuestionDetail（重要論点詳細） | `QuestionChatManager` | 論点単位スレッド |

---

## 8. 特殊ボタンの動作

チャットUIには「テーマを変える」「対話を終わる」などの特殊ボタンが配置されています。

**これらのボタンは固定テキストをユーザーメッセージとして送信するだけです。**

```text
ユーザーが「テーマを変える」ボタンをクリック
    ↓
「テーマを変える」という文字列をユーザーメッセージとして送信
    ↓
通常のメッセージ送信フローと同一の処理
```

バックエンド側にはこれらのボタンに対応する特別なハンドリングは存在しません。AIのシステムプロンプトによって適切な応答が返されることを前提としています。

---

## 9. LocalStorage使用状況

### 現行UIで使用中のキー

| キー | 用途 | 読み書き |
|------|------|---------|
| `idobataUserId` | 匿名ユーザーのUUID | 読み書き |
| `defaultThemeId` | デフォルトテーマIDのキャッシュ | 読み書き |

### レガシーUI専用のキー（現行UIでは未使用）

| キー | 用途 |
|------|------|
| `currentThreadId` | レガシーUIでのカレントスレッドID |
| `currentThemeId` | レガシーUIでのカレントテーマID |

### デッドコードとなっているキー

| キー | 状況 |
|------|------|
| `chat_thread_*` | `setItem` による書き込みのみ実装されており、`getItem` による読み取りが存在しない。デッドコード |

### チャットメッセージの保存場所

チャットメッセージ本文はサーバー側（MongoDB）に永続化されます。LocalStorageにはメッセージ本文は一切保存されません。

現行UIにはLocalStorageをクリアする機能はありません（レガシーUIには「会話をリセット」機能があり、`currentThreadId` を削除していました）。

---

## 10. レガシーUI

### 概要

`/legacy` パスで提供されている旧UIです。2025/4/27にJun Itoが新UIへ移行した際に `/old` パスに退避され、後に `/legacy` にリネームされました。

### 現行UIとの差異

| 項目 | 現行UI | レガシーUI |
|------|--------|-----------|
| ChatManager | 使用する | 使用しない（直接 apiClient 呼び出し） |
| 抽出結果チェック | Socket.IO（リアルタイム通知） | 5秒ポーリング |
| 会話リセット | 未実装 | `currentThreadId` を localStorage から削除 |
| モバイル対応 | ドラッグ可能ボトムシート | 非対応 |

---

## 11. 未使用・残存コード

### ChatHeader コンポーネント

`ChatHeader`（デスクトップ用・モバイル用の2種類）が実装されていますが、`ChatSheet` コンポーネント自体がヘッダーを内包しているため、現在は使用されていません。

### `chat_thread_*` LocalStorageキー

`setItem` での書き込みは存在しますが、`getItem` での読み取りは存在しません。このキーへの書き込みは実質的に無効です。

### ChatThread.ts

TypeScript版のChatThreadモデル定義ファイルですが、バックエンドの実際の処理ではJavaScript版の `ChatThread.js` のみが使用されています。

---

## 12. 進化の経緯（時系列）

| 時期 | 変更内容 |
|------|---------|
| 2025/4 | プロトタイプ期。blu3mo/idobata-prototype 由来のコードを基盤として開発開始 |
| 2025/5初旬 | チャットUIの初期実装。AIによる応答の実装 |
| 2025/5中旬 | チャット履歴の永続化（MongoDB）、モバイル対応 |
| 2025/5下旬〜6月 | Socket.IO の導入。ChatThread モデルの整備。抽出結果のリアルタイム通知 |
| 2025/7〜 | vision-ui-v1 新デザインの統合。FloatingChat / ChatSheet / ExtendedChatHistory の現行構造へ移行 |
| 2025後半〜 | kasseika fork による独自改善。ThemeDetailChatManager / QuestionChatManager の導入 |
