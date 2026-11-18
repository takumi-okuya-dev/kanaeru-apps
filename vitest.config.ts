// 単体と結合のテストを、ワークスペースのまとめて流す。
// 領域やパッケージを足しても、ここは直さない（packages/* と tests/* は glob で読む）。
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: ["apps/api", "apps/web", "packages/*", "tests/*"],
  },
});
