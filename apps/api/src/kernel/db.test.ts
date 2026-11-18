import { describe, expect, it, vi } from "vitest";
import { createDatabase } from "./db.ts";

describe("createDatabase", () => {
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
