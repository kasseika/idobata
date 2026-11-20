/**
 * backend の Vitest 設定
 *
 * 目的: テストの対象をソースのテストだけに限定する。
 * 注意: `npm run build` の出力先 `build/` に古いテストのコンパイル結果が残っていても、
 *       実行しないように除外する（issue #172）。
 */
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "build/**"],
  },
});
