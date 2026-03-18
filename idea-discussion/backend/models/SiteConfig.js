import mongoose from "mongoose";

const siteConfigSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    aboutMessage: {
      type: String,
      required: false,
    },
    // 透明性表示のON/OFFフラグ。trueの場合、AIパイプライン情報をユーザーに公開する
    showTransparency: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

const SiteConfig = mongoose.model("SiteConfig", siteConfigSchema);

export default SiteConfig;
