// ログのテスト：1行1つの JSON で、名前・メール・通行証・クッキーを消す。
import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { REDACTED, createLogger } from "./logger.ts";

/**
 * ログの行を集める書き出し先を作る。
 * @returns 集めた行と、書き出し先
 */
function collect() {
  const lines: Record<string, unknown>[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(JSON.parse(chunk.toString()) as Record<string, unknown>);
      callback();
    },
  });
  return { lines, stream };
}

describe("ログ", () => {
  it("1行1つの JSON で、名前・メール・通行証・クッキーを消す", () => {
    const { lines, stream } = collect();
    const logger = createLogger({ level: "info", pretty: false }, stream);
    logger.info(
      {
        email: "operator@example.com",
        user: { id: "u1", name: "見本の名前", email: "operator@example.com" },
        account: { accessToken: "a", refreshToken: "r", idToken: "i" },
        req: { headers: { cookie: "c=1", authorization: "Bearer x", "user-agent": "見本" } },
        res: { headers: { "set-cookie": "c=2" } },
      },
      "要求",
    );
    const line = lines[0];
    expect(line).toBeDefined();
    const text = JSON.stringify(line);
    expect(text).not.toContain("operator@example.com");
    expect(text).not.toContain("見本の名前");
    expect(text).not.toContain("Bearer x");
    expect(text).not.toContain("c=1");
    expect(text).not.toContain("c=2");
    expect(text).toContain(REDACTED);
    expect(text).toContain("u1");
    expect(text).toContain("見本");
  });
});
