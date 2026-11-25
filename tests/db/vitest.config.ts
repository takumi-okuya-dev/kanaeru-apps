// DB の変更の確かめ（scripts/db）の単体のテスト。DB には接続しない。
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "db",
    include: ["**/*.test.ts"],
  },
});
