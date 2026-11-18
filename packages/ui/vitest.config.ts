// 見た目の値と部品の単体のテスト。
// 既定は node（値のテストは node:fs でファイルを読む）。部品のテストは、ファイルの頭の「@vitest-environment jsdom」で jsdom にする。
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "ui",
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
