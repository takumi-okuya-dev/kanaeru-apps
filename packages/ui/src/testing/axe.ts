// 部品と画面のテストの手伝い（テストだけで使う）：jsdom で axe-core を流す。
// 色の比べは jsdom で測れないので外す（値の側は tokens.test.ts と DESIGN.md の確かめに頼る）。
import axe from "axe-core";
import { expect } from "vitest";

/**
 * jsdom で axe-core を流し、違反が0件であることを確かめる。
 * @param container 確かめる要素
 * @param skip ほかに外す規則（例：jsdom は CSS を当てないので、幅で隠す部分が見えてしまうときの規則）
 */
export async function expectNoAxeViolations(
  container: Element,
  skip: readonly string[] = [],
): Promise<void> {
  const rules: Record<string, { enabled: boolean }> = {
    "color-contrast": { enabled: false },
    region: { enabled: false },
  };
  for (const id of skip) rules[id] = { enabled: false };
  const results = await axe.run(container, { rules });
  expect(results.violations.map(({ id, help }) => `${id}：${help}`)).toEqual([]);
}
