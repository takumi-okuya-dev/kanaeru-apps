// 利用者の IP を決める。回数の制限（このフォルダ）が使う。ログインを足したら、ログインの回数の制限も同じ決め方の IP を使う。
// X-Forwarded-For は利用者が好きに書けるので、前に置いた中継の数（設定 TRUSTED_PROXY_HOPS）だけ右から数えた値を使う。
import { isIP } from "node:net";
import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";

/**
 * 要求から利用者の IP を決める。
 * @param c Hono の文脈
 * @param trustedProxyHops 前に置いた中継の数。0 なら接続の相手、1以上なら X-Forwarded-For の右から数えた値
 * @returns 利用者の IP。決められないときは undefined
 */
export function resolveClientIp(c: Context, trustedProxyHops: number): string | undefined {
  if (trustedProxyHops > 0) {
    const chain = (c.req.header("x-forwarded-for") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const ip = chain[chain.length - trustedProxyHops];
    return ip && isIP(ip) ? ip : undefined;
  }
  try {
    const address = getConnInfo(c).remote.address;
    return address && isIP(address) ? address : undefined;
  } catch {
    // Node の接続がない（テストの app.request など）
    return undefined;
  }
}

/**
 * IPv6 の書き方を、8つの16進の段（省略なし・小文字）に広げる。末尾が IPv4 の書き方（::ffff:1.2.3.4）でも読む。
 * @param ip IPv6（isIP で 6 と確かめたもの。%zone はあってよい）
 * @returns 8つの段（読めなければ undefined）
 */
function expandIpv6(ip: string): string[] | undefined {
  let text = ip.toLowerCase().split("%")[0] ?? "";
  const v4 = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (v4) {
    const [a, b, c, d] = v4.slice(1).map(Number) as [number, number, number, number];
    text = `${text.slice(0, v4.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head = "", tail] = text.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const missing = 8 - left.length - right.length;
  if (tail === undefined ? left.length !== 8 : missing < 0) return undefined;
  return [...left, ...Array<string>(tail === undefined ? 0 : missing).fill("0"), ...right].map(
    (part) => part.padStart(4, "0"),
  );
}

/**
 * 回数を数える鍵にする、利用者の IP のまとまり。IPv4 はその IP、IPv6 は前の 64 ビット（/64。ふつう1つの家や1台の機械に
 * まるごと渡されるので、/64 の中で IP を替えても、同じ人として数える）。IPv4 を IPv6 の形で書いたもの（::ffff:…）は IPv4 にする。
 * @param ip 利用者の IP（resolveClientIp の値）
 * @returns 数える鍵
 */
export function clientKeyOf(ip: string): string {
  if (isIP(ip) !== 6) return ip;
  const parts = expandIpv6(ip);
  if (!parts) return ip;
  if (parts.slice(0, 5).every((part) => part === "0000") && parts[5] === "ffff") {
    const [high = 0, low = 0] = [parts[6], parts[7]].map((part) =>
      Number.parseInt(part ?? "0", 16),
    );
    return [high >> 8, high & 255, low >> 8, low & 255].join(".");
  }
  return `${parts.slice(0, 4).join(":")}::/64`;
}
