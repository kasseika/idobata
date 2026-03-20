/**
 * テーマモデル
 *
 * 目的: いどばたビジョンのテーマ（議題）を管理する。
 *       テーマのライフサイクル（draft/active/closed）を status フィールドで管理し、
 *       公開中（active）のプロンプト変更を原則ロックすることで透明性を担保する。
 * 注意: status フィールドが isActive/disableNewComment の状態を決定する。
 *       status から isActive/disableNewComment の同期は pre-save フックおよびコントローラーで行う。
 */

import mongoose from "mongoose";

/**
 * status ごとの isActive/disableNewComment マッピング
 * - draft: 準備中。非公開
 * - active: 意見募集中。公開中
 * - closed: 終了。コメント不可
 */
export const STATUS_FIELD_MAP = {
  draft: { isActive: false, disableNewComment: false },
  active: { isActive: true, disableNewComment: false },
  closed: { isActive: true, disableNewComment: true },
};

const themeSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      unique: true,
    },
    description: {
      type: String,
      required: false,
    },
    slug: {
      // URLなどで使用するための識別子
      type: String,
      required: true,
      unique: true,
    },
    // テーマのライフサイクルステータス
    // draft: 準備中（編集可）、active: 公開中（プロンプトロック）、closed: 終了（全ロック）
    status: {
      type: String,
      enum: ["draft", "active", "closed"],
      default: "draft",
    },
    isActive: {
      type: Boolean,
      default: false,
    },
    tags: {
      type: [{ type: String, trim: true, maxlength: 50 }],
      default: [],
    },
    customPrompt: {
      type: String,
      required: false,
    },
    disableNewComment: {
      type: Boolean,
      default: false,
    },
    // 透明性表示のON/OFFフラグ。nullの場合はSiteConfigの設定に従う
    showTransparency: {
      type: Boolean,
      default: null,
    },
    clusteringResults: {
      type: Map,
      of: Object,
      default: {},
    },
    // パイプラインステージ別のモデル/プロンプト設定
    // Map<stageId, { model?, prompt? }> 形式。未設定のステージはエントリなし
    pipelineConfig: {
      type: Map,
      of: new mongoose.Schema(
        {
          model: { type: String, required: false },
          prompt: { type: String, required: false },
        },
        { _id: false }
      ),
      default: {},
    },
  },
  { timestamps: true }
);

/**
 * pre-save フック: status から isActive/disableNewComment を同期する
 * findByIdAndUpdate を使用する場合はこのフックは動作しないため、
 * コントローラー側でも明示的に同期処理を行うこと。
 */
themeSchema.pre("save", function (next) {
  const fields = STATUS_FIELD_MAP[this.status];
  if (fields) {
    this.isActive = fields.isActive;
    this.disableNewComment = fields.disableNewComment;
  }
  next();
});

const Theme = mongoose.model("Theme", themeSchema);

export default Theme;
