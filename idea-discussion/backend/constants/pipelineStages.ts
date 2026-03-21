/**
 * AIパイプラインステージ定義定数
 *
 * 目的: いどばたビジョンのAI処理パイプラインのメタデータを一元定義する。
 *       透明性表示APIおよびadmin画面からのプロンプト/モデル変更の基盤として使用する。
 * 注意: defaultPrompt はテンプレートの固定部分のみを定義する。
 *       動的なデータ注入部分（会話履歴、問題一覧等）は実行時に結合される。
 *       政策ドラフト（policy）・ダイジェスト（digest）はバックエンド実装済みだが
 *       admin UIが未実装のため、透明性表示からは省略している。
 *       参照: https://github.com/kasseika/idobata/issues/18
 *            https://github.com/kasseika/idobata/issues/19
 *
 * order フィールドは配列のインデックスから自動計算されるため、
 * 個別のステージ定義には記載しない。
 */

/** パイプラインステージの型定義 */
export interface IPipelineStage {
  id: string;
  name: string;
  description: string;
  defaultModel: string;
  defaultPrompt: string;
  sourceFile: string;
  /** 配列インデックスから自動計算される表示順序（1始まり） */
  order: number;
}

const _STAGES = [
  {
    id: "chat",
    name: "チャット対話",
    description:
      "ユーザーとAIが対話し、課題や解決策を深掘りする。テーマごとにカスタムプロンプトを設定可能。",
    defaultModel: "google/gemini-3.1-flash-lite-preview",
    defaultPrompt: `あなたは、ユーザーが抱える課題やその解決策についての考えを深めるための、対話型アシスタントです。以下の点を意識して応答してください。

1.  **思考の深掘り:** ユーザーの発言から、具体的な課題や解決策のアイデアを引き出すことを目指します。曖昧な点や背景が不明な場合は、「いつ」「どこで」「誰が」「何を」「なぜ」「どのように」といった質問（5W1H）を自然な会話の中で投げかけ、具体的な情報を引き出してください。
2.  **簡潔な応答:** あなたの応答は、最大でも4文以内にまとめてください。
3.  **課題/解決策の抽出支援:** ユーザーが自身の考えを整理し、明確な「課題」や「解決策」として表現できるよう、対話を通じてサポートしてください。
4.  **心理的安全性の確保:** ユーザーのペースを尊重し、急かさないこと。論理的な詰め寄りや過度な質問攻めを避けること。
5.  **話題の誘導:** ユーザーの発言が曖昧で、特に話したいトピックが明確でない場合、参考情報として提示された既存の重要論点のどれかをピックアップしてそれについて議論することを優しく提案してください。`,
    sourceFile: "constants/defaultPrompts.js, controllers/chatController.js",
  },
  {
    id: "extraction_chat",
    name: "課題/解決策抽出（チャット）",
    description:
      "チャット会話から課題（Problem）と解決策（Solution）を自動抽出し、データベースに保存する。",
    defaultModel: "google/gemini-3.1-flash-lite-preview",
    defaultPrompt: `会話履歴を分析し、最新のユーザーメッセージから新しい課題や解決策を抽出してください。

出力は必ず日本語で行い、以下のJSON形式で返してください：
{
  "additions": [
    { "type": "problem", "statement": "課題の説明（二文構成）..." },
    { "type": "solution", "statement": "解決策の説明（二文構成）..." }
  ],
  "updates": [
    { "id": "既存項目のID", "type": "problem", "statement": "更新された説明..." }
  ]
}

課題文のガイドライン:
- 二文構成: 一文目は主語を明確にした課題定義、二文目はチャットの文脈・背景情報
- 現状と理想のギャップを明確に記述する
- 解決策の先走りや抽象的な表現を避ける

解決策文のガイドライン:
- 二文構成: 一文目は具体的な行動・機能・価値、二文目は文脈・背景情報
- 実現可能性や費用対効果も考慮する
- 曖昧な表現や抽象的な概念を避ける`,
    sourceFile: "workers/extractionWorker.js",
  },
  {
    id: "extraction_import",
    name: "課題/解決策抽出（インポート）",
    description:
      "インポートされたテキスト（SNS投稿・記事等）から課題と解決策を自動抽出する。",
    defaultModel: "google/gemini-3.1-flash-lite-preview",
    defaultPrompt: `インポートされたテキストを分析し、課題と解決策を抽出してください。

出力は必ず日本語で行い、以下のJSON形式で返してください：
{
  "additions": [
    { "type": "problem", "statement": "課題の説明（課題とコメントの背景の二文構成）..." },
    { "type": "solution", "statement": "解決策の説明（解決策とコメントの背景の二文構成）..." }
  ]
}

課題文のガイドライン:
- 二文構成: 一文目は主語を明確にした課題定義、二文目はコメントの文脈・背景情報
- 現状と理想のギャップを明確に記述する
- 解決策の先走りや抽象的な表現を避ける

解決策文のガイドライン:
- 二文構成: 一文目は具体的な行動・機能・価値、二文目は文脈・背景情報
- 実現可能性や費用対効果も考慮する`,
    sourceFile: "workers/extractionWorker.js",
  },
  {
    id: "question_generation",
    name: "重要論点生成",
    description:
      "収集された課題から「How Might We...」形式の重要論点（シャープクエスチョン）を6個生成する。",
    defaultModel: "google/gemini-3.1-pro-preview",
    defaultPrompt: `あなたは「How Might We...」（HMW）形式の質問を生成するAIアシスタントです。Design Thinking の原則に基づき、問題ステートメントを洞察深い質問に変換してください。

質問1〜3: 現状（「現状はこう」）と理想像（「それをこうしたい」）の両方を詳細に記述することに集中してください。具体的な手段・方法・解決策は示さず、問題空間をオープンに保つこと。
質問4〜6: 「現状は○○だが、それが○○になるのは望ましいだろうか？」という形式で、将来像の妥当性・望ましさ自体を問う質問。

出力は日本語で、以下のJSON形式:
{
  "questions": [
    {
      "question": "HMW形式の質問（50-100文字）",
      "tagLine": "キャッチーな要約（約20文字）",
      "tags": ["タグ1（2-7文字）", "タグ2（2-7文字）"]
    }
  ]
}

6個の質問を生成すること。`,
    sourceFile: "workers/questionGenerator.js",
  },
  {
    id: "linking",
    name: "リンキング判定",
    description:
      "課題・解決策と重要論点の関連性をAIが判定し、リンク（QuestionLink）を作成する。",
    defaultModel: "google/gemini-3.1-flash-lite-preview",
    defaultPrompt: `あなたは「シャープクエスチョン」（HMW形式の質問）と「ステートメント」（課題または解決策）の関係を判定するAIアシスタントです。

以下の2種類の関係を判定してください:
1. **問いを促す (prompts_question)**: 課題ステートメントがこの質問の根底にある問題を示している
2. **質問に答える (answers_question)**: 解決策ステートメントがこの質問への潜在的な対応を提供している

以下のJSON形式で返してください:
{
  "is_relevant": boolean,
  "link_type": "prompts_question" | "answers_question" | null,
  "rationale": "判断理由（1-2文）",
  "relevanceScore": 0.0〜1.0の数値
}

relevanceScore: 1.0=直接的で強い関連性、0.5=部分的な関連性、0.0=無関連`,
    sourceFile: "workers/linkingWorker.js",
  },
  {
    id: "report",
    name: "レポート生成",
    description:
      "重要論点に関連する課題と解決策をまとめ、市民向けの構造化レポートを生成する。",
    defaultModel: "google/gemini-3.1-pro-preview",
    defaultPrompt: `重要論点について、市民からの意見を通じて特定された問題点とその潜在的な解決策を含むレポートを作成してください。

以下のJSON形式で出力してください：
{
  "introduction": "意見を集約したことを示し200文字程度で集まった意見の要点を記述",
  "issues": [
    {
      "title": "問題の内容を説明する短いタイトル",
      "description": "その課題の詳細な説明（100〜400文字）"
    }
  ]
}

JSON構造外に他のテキストや説明を含めないでください。`,
    sourceFile: "workers/reportGenerator.js",
  },
  {
    id: "debate_analysis",
    name: "論点分析",
    description:
      "重要論点に関連する課題と解決策から、主要な対立軸・合意点・対立点を分析する。",
    defaultModel: "google/gemini-3.1-pro-preview",
    defaultPrompt: `以下の課題点と解決策を分析し、主要な論点と対立軸、および合意形成の状況を抽出してください。

分析内容:
1. 主要な論点と対立軸（3つ以内）:
   - 各論点における対立する視点や選択肢を明らかにする
   - 各対立軸に簡潔なタイトルと対立する選択肢（ラベル+説明文）を提供

2. 合意形成の状況:
   - 合意点: 大多数の意見が一致している点（3-5項目）
   - 対立点: 意見が分かれている点（3-5項目）

JSON形式で返してください:
{
  "axes": [
    {
      "title": "対立軸のタイトル",
      "options": [
        { "label": "選択肢1", "description": "説明" },
        { "label": "選択肢2", "description": "説明" }
      ]
    }
  ],
  "agreementPoints": ["合意点1", ...],
  "disagreementPoints": ["対立点1", ...]
}`,
    sourceFile: "services/debateAnalysisGenerator.js",
  },
  {
    id: "visual_report",
    name: "ビジュアルレポート",
    description:
      "重要論点の内容をグラフィックレコーディング風のHTMLインフォグラフィックに変換する。",
    defaultModel: "anthropic/claude-sonnet-4.6",
    defaultPrompt: `以下の内容を、超一流デザイナーが作成したような、日本語で完璧なグラフィックレコーディング風のHTMLインフォグラフィックに変換してください。

デザイン仕様:
- カラースキーム: 青系5段階（青-1: #0A2463, 青-2: #1E5EF3, 青-3: #00A8E8, 青-4: #38B6FF, 青-5: #8CDBFF）
- フォント: Zen Maru Gothic（日本語手書き風）
- レイアウト: 幅375px中央揃え、高さ1440px以上
- 手書き風の囲み線、矢印、バナー、吹き出し
- 絵文字を効果的に配置（imgタグではなく絵文字を使用）
- グラスモーフィズムを適切に活用

レスポンスは完全なHTML+CSSコードのみを返してください。`,
    sourceFile: "services/questionVisualReportGenerator.js",
  },
];

/** 配列インデックスから order を自動付与したパイプラインステージ定義 */
export const PIPELINE_STAGES: IPipelineStage[] = _STAGES.map(
  (stage, index) => ({
    ...stage,
    order: index + 1,
  })
);

/**
 * ステージIDからステージ情報を取得する
 * @param stageId - ステージID
 * @returns ステージ情報。見つからない場合は undefined
 */
export function getPipelineStageById(
  stageId: string
): IPipelineStage | undefined {
  return PIPELINE_STAGES.find((stage) => stage.id === stageId);
}
