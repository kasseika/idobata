import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // 本番ビルド時は /admin/ 配下で配信されるためベースパスを設定する
  // nginx の `location /admin/ { proxy_pass http://admin-prod/; }` と対応
  // 開発時は / のままとなるため既存の動作は変わらない
  base: process.env.NODE_ENV === "production" ? "/admin/" : "/",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5175,
    host: "0.0.0.0",
    allowedHosts:
      process.env.VITE_ADMIN_FRONTEND_ALLOWED_HOSTS?.split(",") || [],
  },
});
