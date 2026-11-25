import { describe, expect, it } from "vitest";
import { PRODUCT_NAME } from "./brand.ts";

describe("PRODUCT_NAME", () => {
  it("画面と知らせの固定の文言に出す名前は PaletKit（内部の名前 kanaeru ではない）", () => {
    expect(PRODUCT_NAME).toBe("PaletKit");
  });
});
