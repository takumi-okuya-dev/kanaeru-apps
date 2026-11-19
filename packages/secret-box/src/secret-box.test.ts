// 秘密の箱の単体のテスト：包んで開ける・ひもづけが違えば開けない・IV を使い回さない・鍵を替えても古い値を開ける・鍵の束の形。
import { describe, expect, it } from "vitest";
import { KeyRingError, createSecretBox } from "./index.ts";

/**
 * 決まったバイトの鍵（base64）。
 * @param fill 埋める値
 * @returns 32バイトの base64
 */
function key(fill: number): string {
  return btoa(String.fromCharCode(...new Uint8Array(32).fill(fill)));
}

describe("秘密の箱", () => {
  it("包んだ値は、同じひもづけで開ける", async () => {
    const box = createSecretBox(JSON.stringify({ "1": key(1) }), 1);
    const sealed = await box.seal("トークンの値", "account-1");
    expect(sealed.keyVersion).toBe(1);
    expect(sealed.iv).toHaveLength(12);
    expect(new TextDecoder().decode(sealed.ciphertext)).not.toContain("トークン");
    await expect(box.open(sealed, "account-1")).resolves.toBe("トークンの値");
  });

  it("ひもづけが違えば開けない（別の行へ写しても使えない）", async () => {
    const box = createSecretBox(JSON.stringify({ "1": key(1) }), 1);
    const sealed = await box.seal("値", "account-1");
    await expect(box.open(sealed, "account-2")).rejects.toThrow();
  });

  it("包むたびに IV を作りなおす", async () => {
    const box = createSecretBox(JSON.stringify({ "1": key(1) }), 1);
    const a = await box.seal("同じ値", "x");
    const b = await box.seal("同じ値", "x");
    expect(a.iv).not.toEqual(b.iv);
  });

  it("鍵を替えても、古い版で包んだ値を開ける", async () => {
    const old = createSecretBox(JSON.stringify({ "1": key(1) }), 1);
    const sealed = await old.seal("古い値", "x");
    const rotated = createSecretBox(JSON.stringify({ "1": key(1), "2": key(2) }), 2);
    await expect(rotated.open(sealed, "x")).resolves.toBe("古い値");
    expect((await rotated.seal("新しい値", "x")).keyVersion).toBe(2);
  });

  it("包んだ版の鍵がなければ KeyRingError", async () => {
    const old = createSecretBox(JSON.stringify({ "1": key(1) }), 1);
    const sealed = await old.seal("値", "x");
    const other = createSecretBox(JSON.stringify({ "2": key(2) }), 2);
    await expect(other.open(sealed, "x")).rejects.toBeInstanceOf(KeyRingError);
  });

  it.each([
    ["JSON でない", "not json", 1],
    ["配列", "[]", 1],
    ["空", "{}", 1],
    ["版が数でない", JSON.stringify({ a: key(1) }), 1],
    ["鍵の長さが違う", JSON.stringify({ "1": btoa("short") }), 1],
    ["base64 でない", JSON.stringify({ "1": "!!!!" }), 1],
    ["今の版がない", JSON.stringify({ "1": key(1) }), 2],
  ])("鍵の束の形が合わなければ KeyRingError（%s）", (_label, json, version) => {
    expect(() => createSecretBox(json, version)).toThrow(KeyRingError);
  });

  it("エラーの文に鍵の値を入れない", () => {
    const secret = key(7);
    expect(() => createSecretBox(JSON.stringify({ "1": secret }), 9)).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining(secret) as string }),
    );
  });
});
