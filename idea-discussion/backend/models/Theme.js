import mongoose from "mongoose";

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
    isActive: {
      type: Boolean,
      default: true,
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
      default: new Map(),
    },
  },
  { timestamps: true }
);

const Theme = mongoose.model("Theme", themeSchema);

export default Theme;
