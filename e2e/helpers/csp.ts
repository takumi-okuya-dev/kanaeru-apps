// E2E の手伝い：画面の CSP の違反を集める（画面の script より先に動く）。
import type { Page } from "@playwright/test";

/** 違反を集める入れ物（画面の中の window に置く）。 */
type ViolationWindow = Window & { __cspViolations?: string[] };

/**
 * CSP の違反を集め始める。
 * @param page Playwright の画面
 * @returns 集めた違反を読む関数（画面の securitypolicyviolation と、ブラウザの知らせ）
 */
export async function collectCspViolations(page: Page): Promise<() => Promise<string[]>> {
  const messages: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("Content Security Policy")) messages.push(message.text());
  });
  await page.addInitScript(() => {
    const target = window as ViolationWindow;
    target.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      target.__cspViolations?.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  return async () => [
    ...messages,
    ...(await page.evaluate(() => (window as ViolationWindow).__cspViolations ?? [])),
  ];
}
