// 画面の単体のテスト（jsdom と Testing Library）。
import { defineConfig } from "vitest/config";

export default defineConfig({
  // 組み立てのときに埋める値（vite.config.ts の define と同じ名前。テストでは仮の名前）
  define: { __APP_NAME__: JSON.stringify("テストのアプリ") },
  test: {
    name: "web",
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
