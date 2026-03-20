/**
 * PipelineConfigChangeLog モデル
 *
 * 目的: 公開中テーマのパイプライン設定（プロンプト・モデル）を緊急修正した際の
 *       変更履歴を記録する。変更理由・変更前後の差分・変更者を保持し、
 *       透明性APIで公開することで説明責任を担保する。
 * 注意: このログは緊急修正APIからのみ記録される。削除・更新は原則禁止。
 */

import mongoose from "mongoose";

const pipelineConfigChangeLogSchema = new mongoose.Schema({
  themeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Theme",
    required: true,
  },
  stageId: { type: String, required: true },
  previousModel: { type: String },
  previousPrompt: { type: String },
  newModel: { type: String },
  newPrompt: { type: String },
  // 変更理由。緊急修正の場合に必須
  reason: { type: String, required: true },
  changedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "AdminUser",
  },
  changedAt: { type: Date, default: Date.now },
});

// themeId + changedAt の複合インデックス（透明性APIのクエリパフォーマンス確保）
pipelineConfigChangeLogSchema.index({ themeId: 1, changedAt: 1 });

const PipelineConfigChangeLog = mongoose.model(
  "PipelineConfigChangeLog",
  pipelineConfigChangeLogSchema
);

export default PipelineConfigChangeLog;
