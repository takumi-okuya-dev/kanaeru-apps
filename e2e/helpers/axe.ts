// アクセシビリティの確かめ。WCAG 2.2 AA までの印で、違反が0件であることを確かめる。
import AxeBuilder from "@axe-core/playwright";
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/** 確かめる WCAG の印。 */
export const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/**
 * 今の画面を axe にかけ、違反が0件であることを確かめる。
 * @param page Playwright の画面
 * @param label 失敗したときに出す、画面の名前
 */
export async function expectNoA11yViolations(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const summary = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    nodes: violation.nodes.map((node) => node.target.join(" ")),
  }));
  expect(summary, `${label} のアクセシビリティの違反`).toEqual([]);
}
