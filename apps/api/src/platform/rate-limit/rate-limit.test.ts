// 回数の制限：決めた秒の間に max 回まで許し、秒が過ぎたら数え直す。鍵の上限を超えたら、いちばん長く使っていない鍵から捨てる。
// IPv6 は /64 ごとにまとめて数える。
import { describe, expect, it } from "vitest";
import { clientKeyOf } from "./client-ip.ts";
import { createCounter } from "./rate-limit.ts";

describe("回数の数え方", () => {
  it("max 回まで許し、超えたら待つ秒を返し、秒が過ぎたら数え直す", () => {
    const counter = createCounter({ enabled: true, windowSeconds: 10, max: 2 });
    expect(counter.consume("a", 0)).toBeUndefined();
    expect(counter.consume("a", 1000)).toBeUndefined();
    expect(counter.consume("a", 2000)).toBe(8);
    // 鍵ごとに別に数える
    expect(counter.consume("b", 2000)).toBeUndefined();
    expect(counter.consume("a", 10_000)).toBeUndefined();
  });

  it("enabled が false なら数えない", () => {
    const counter = createCounter({ enabled: false, windowSeconds: 10, max: 1 });
    for (let index = 0; index < 5; index += 1) expect(counter.consume("a", 0)).toBeUndefined();
  });

  it("鍵がいっぱいなら、いちばん長く使っていない鍵を捨てる（よく使う鍵の数は残る）", () => {
    const counter = createCounter({ enabled: true, windowSeconds: 60, max: 1 }, { maxEntries: 3 });
    expect(counter.consume("busy", 0)).toBeUndefined();
    counter.consume("x1", 1);
    counter.consume("x2", 2);
    // busy を使う（上限なので止まる）→ 使った順の後ろへ移る
    expect(counter.consume("busy", 3)).toBeGreaterThan(0);
    // 新しい鍵で押し出されるのは x1（いちばん長く使っていない）で、busy は残って止まったまま
    counter.consume("x3", 4);
    expect(counter.size()).toBe(3);
    expect(counter.consume("busy", 5)).toBeGreaterThan(0);
    expect(counter.consume("x1", 6)).toBeUndefined();
  });

  it("終わった数は、数える秒が過ぎたらまとめて捨てる", () => {
    const counter = createCounter({ enabled: true, windowSeconds: 1, max: 1 });
    for (let index = 0; index < 50; index += 1) counter.consume(`k${index}`, 0);
    expect(counter.size()).toBe(50);
    counter.consume("later", 1000);
    expect(counter.size()).toBe(1);
  });
});

describe("数える鍵（IP のまとまり）", () => {
  it("IPv4 はその IP、IPv4 を IPv6 の形で書いたものも IPv4", () => {
    expect(clientKeyOf("203.0.113.5")).toBe("203.0.113.5");
    expect(clientKeyOf("::ffff:203.0.113.5")).toBe("203.0.113.5");
    expect(clientKeyOf("::ffff:cb00:7105")).toBe("203.0.113.5");
  });

  it("IPv6 は /64 にまとめる（/64 の中で替えても同じ鍵、ほかの /64 は別の鍵）", () => {
    const key = clientKeyOf("2001:db8:1:2::1");
    expect(key).toBe("2001:0db8:0001:0002::/64");
    expect(clientKeyOf("2001:DB8:1:2:ffff:ffff:ffff:ffff")).toBe(key);
    expect(clientKeyOf("2001:db8:1:2:0:0:0:abcd%eth0")).toBe(key);
    expect(clientKeyOf("2001:db8:1:3::1")).not.toBe(key);
    expect(clientKeyOf("::1")).toBe("0000:0000:0000:0000::/64");
  });
});
