// 守りの確かめのうち、リポジトリのファイルを読むだけのもの。
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "security",
    include: ["**/*.test.ts"],
  },
});
