// 今の利用者が替わったことを領域に知らせる。
import { describe, expect, it } from "vitest";
import { notifyAccountChange, onAccountChange } from "./account-events.ts";

describe("onAccountChange・notifyAccountChange", () => {
  it("受け手に今の利用者を知らせ、1つが失敗してもほかに届く。外すと届かない", async () => {
    const received: (string | null)[] = [];
    const stopFailing = onAccountChange(() => {
      throw new Error("失敗");
    });
    const stop = onAccountChange((accountId) => {
      received.push(accountId);
    });
    await notifyAccountChange("a1");
    await notifyAccountChange(null);
    expect(received).toEqual(["a1", null]);
    stop();
    stopFailing();
    await notifyAccountChange("a2");
    expect(received).toEqual(["a1", null]);
  });
});
