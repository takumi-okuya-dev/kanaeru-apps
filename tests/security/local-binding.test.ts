// 手元の DB の容器と開発のサーバーが、手元の外から届かないことの確かめ。
// ファイルの文字を読む（サービスとアプリの数は書かない）。API の既定の 127.0.0.1 は apps/api/test/config.test.ts が確かめる。
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../..", import.meta.url));

/**
 * docker-compose.yml の ports の値を、すべて読む（YAML の依存を足さず、ports: の下の「- 」の行を読む）。
 * @param source docker-compose.yml の文字
 * @returns ports の値
 */
function composePorts(source: string): string[] {
  const values: string[] = [];
  let portsIndent: number | undefined;
  for (const line of source.split("\n")) {
    if (/^\s*#/.test(line) || line.trim() === "") continue;
    const indent = line.length - line.trimStart().length;
    if (/^\s*ports:\s*$/.test(line)) {
      portsIndent = indent;
      continue;
    }
    if (portsIndent === undefined) continue;
    const item = /^\s*-\s*(.+?)\s*$/.exec(line);
    if (item && indent > portsIndent) {
      values.push((item[1] ?? "").replace(/^["']|["']$/g, ""));
    } else {
      portsIndent = undefined;
    }
  }
  return values;
}

describe("手元の外から届かない", () => {
  it("docker-compose.yml のすべてのサービスのすべての ports が 127.0.0.1: で始まる", () => {
    const ports = composePorts(readFileSync(join(root, "docker-compose.yml"), "utf8"));
    expect(ports.length, "ports が見つかりません").toBeGreaterThan(0);
    for (const port of ports) {
      expect(port, "手元の外から届く口です（127.0.0.1: を頭に付けてください）").toMatch(
        /^127\.0\.0\.1:/,
      );
    }
  });

  it("ports の読み方：127.0.0.1 のない口と、長い書き方も読む", () => {
    const sample = [
      "services:",
      "  a:",
      "    ports:",
      '      - "5432:5432"',
      "      - 127.0.0.1:1:1",
      "    image: x",
    ].join("\n");
    expect(composePorts(sample)).toEqual(["5432:5432", "127.0.0.1:1:1"]);
  });

  it("apps/*/vite.config.ts の server.host と preview.host が localhost", () => {
    const apps = readdirSync(join(root, "apps")).filter((app) =>
      existsSync(join(root, "apps", app, "vite.config.ts")),
    );
    expect(apps.length, "vite.config.ts が見つかりません").toBeGreaterThan(0);
    for (const app of apps) {
      const source = readFileSync(join(root, "apps", app, "vite.config.ts"), "utf8");
      for (const key of ["server", "preview"]) {
        const block = new RegExp(`\\b${key}:\\s*\\{([\\s\\S]*?)\\}`).exec(source)?.[1] ?? "";
        expect(block, `apps/${app}/vite.config.ts の ${key} がありません`).not.toBe("");
        expect(block, `apps/${app}/vite.config.ts の ${key}.host`).toMatch(/\bhost:\s*"localhost"/);
      }
    }
  });
});
