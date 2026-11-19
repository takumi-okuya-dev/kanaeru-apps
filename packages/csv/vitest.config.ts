// CSV の道具の単体のテスト。
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "csv",
    include: ["src/**/*.test.ts"],
  },
});
