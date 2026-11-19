// 秘密の箱（暗号）の道具の単体のテスト。
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "secret-box",
    include: ["src/**/*.test.ts"],
  },
});
