import { describe, expect, it, vi } from "vitest";
import { createDatabase, DEFAULT_DATABASE_OPTIONS } from "./db.ts";

describe("createDatabase", () => {
  it("1台の接続の数の上限は、渡した poolMax（渡さなければ既定の10）", async () => {
    const url = "postgres://user:pass@127.0.0.1:1/app";
    const limited = createDatabase(url, { poolMax: 5 });
    const byDefault = createDatabase(url, { connectTimeoutMs: 300, queryTimeoutMs: 300 });
    expect(limited.pool.options.max).toBe(5);
    expect(byDefault.pool.options.max).toBe(DEFAULT_DATABASE_OPTIONS.poolMax);
    expect(DEFAULT_DATABASE_OPTIONS.poolMax).toBe(10);
    await Promise.all([limited.pool.end(), byDefault.pool.end()]);
  });

  it("待っている接続が切れたときの 'error' を受け、プロセスを落とさない", async () => {
    const onIdleClientError = vi.fn();
    const { pool } = createDatabase(
      "postgres://user:pass@127.0.0.1:1/app",
      undefined,
      onIdleClientError,
    );
    const error = new Error("terminating connection due to administrator command");
    expect(() => pool.emit("error", error)).not.toThrow();
    expect(onIdleClientError).toHaveBeenCalledWith(error);
    await pool.end();
  });

  it("受け手を渡さなくても 'error' で落ちない", async () => {
    const { pool } = createDatabase("postgres://user:pass@127.0.0.1:1/app");
    expect(() => pool.emit("error", new Error("x"))).not.toThrow();
    await pool.end();
  });
});
