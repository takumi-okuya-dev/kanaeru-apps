// 動かすコンテナ（Dockerfile）が、API の使う workspace の包みをすべて写すことの確かめ（core-004 のセルフレビュー）。
// 包みは pnpm のリンク（node_modules/@workspace/<名前> → packages/<名前>）なので、写し忘れると起動で ERR_MODULE_NOT_FOUND になる。
// 手元の確かめと E2E は workspace の全体で動くので気づけない。包みの数は書かない（apps/api/package.json から読む）。
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../..", import.meta.url));
const dockerfile = readFileSync(join(root, "Dockerfile"), "utf8");
const apiPackage = JSON.parse(readFileSync(join(root, "apps/api/package.json"), "utf8")) as {
  dependencies?: Record<string, string>;
};

/** API の本番の依存のうち、workspace の包みの名前（@workspace/<名前> の <名前>）。 */
const workspacePackages = Object.entries(apiPackage.dependencies ?? {})
  .filter(([, version]) => version.startsWith("workspace:"))
  .map(([name]) => name.replace(/^@workspace\//, ""));

describe("Dockerfile", () => {
  it("API は workspace の包みを1つ以上使う（読み方の確かめ）", () => {
    expect(workspacePackages.length).toBeGreaterThan(0);
  });

  it.each(workspacePackages)("動かすコンテナに packages/%s を写す", (name) => {
    expect(dockerfile).toContain(`COPY --from=api /app/packages/${name} ./packages/${name}\n`);
  });

  it.each(workspacePackages)("packages/%s のテストのファイルを消してから写す", (name) => {
    const findLine = dockerfile
      .split("\n")
      .find((line) => line.includes('-name "*.test.ts" -delete'));
    expect(findLine).toContain(`packages/${name}/src`);
  });
});
