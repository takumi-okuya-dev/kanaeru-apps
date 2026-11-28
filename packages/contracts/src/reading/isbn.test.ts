// ISBN の読み方：10桁を13桁に・ハイフン・確かめの数字。
import { describe, expect, it } from "vitest";
import { toIsbn13 } from "./index.ts";

describe("ISBN", () => {
  it.each([
    ["978-4-87311-778-2", "9784873117782"],
    ["9784873117782", "9784873117782"],
    ["4-87311-778-X", "9784873117782"],
    ["487311778x", "9784873117782"],
    ["4 87311 778 X", "9784873117782"],
  ])("%s → %s", (input, expected) => {
    expect(toIsbn13(input)).toBe(expected);
  });

  it.each(["9784873117783", "4873117781", "Kubernetes", "123"])("%s は ISBN でない", (input) => {
    expect(toIsbn13(input)).toBeNull();
  });
});
