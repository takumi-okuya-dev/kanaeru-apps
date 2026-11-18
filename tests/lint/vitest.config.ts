// lint の規則が働くかの確かめ（境界・守りの規則・見た目の値）。
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "lint",
    include: ["**/*.test.ts"],
  },
});
