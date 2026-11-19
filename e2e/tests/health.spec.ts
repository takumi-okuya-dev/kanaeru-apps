// 動いているか・守りの見出し・CSP（両方の幅で流す）。
// - API が返す /api と、API が返す組み立てた画面（同じ源。本番と同じ形）の見出し。
// - CSP を効かせたまま、組み立てた画面が読み込め、CSP の違反が1つも出ないこと。
import { expect, test } from "@playwright/test";
import { collectCspViolations } from "../helpers/csp.ts";

test("API は動いていて、守りの見出しがつく", async ({ request }) => {
  const health = await request.get("/api/v1/health");
  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({ status: "ok" });
  for (const path of ["/api/v1/health", "/api/v1/nothing-here"]) {
    const headers = (await request.get(path)).headers();
    expect(headers["x-content-type-options"], path).toBe("nosniff");
    expect(headers["x-frame-options"], path).toBe("DENY");
    expect(headers["referrer-policy"], path).toBe("no-referrer");
    expect(headers["content-security-policy"], path).toContain("default-src 'none'");
    expect(headers["x-request-id"], path).toBeTruthy();
  }
});

test("窓口の文書（OpenAPI 3.1）に、すべての道が載る（E2E は OPENAPI_DOC_ENABLED=true）", async ({
  request,
}) => {
  const response = await request.get("/api/openapi.json");
  expect(response.status()).toBe(200);
  const document = (await response.json()) as { openapi: string; paths: Record<string, unknown> };
  expect(document.openapi).toBe("3.1.0");
  expect(Object.keys(document.paths)).toEqual(expect.arrayContaining(["/api/v1/health"]));
});

test("画面（組み立てたもの）に、守りの見出しと CSP がつく", async ({ request }) => {
  for (const path of ["/", "/e/0193a1b2-0000-7000-8000-000000000000/checkin", "/no/such/page"]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    const headers = response.headers();
    expect(headers["cache-control"], path).toBe("no-cache");
    expect(headers["x-content-type-options"], path).toBe("nosniff");
    expect(headers["x-frame-options"], path).toBe("DENY");
    const csp = headers["content-security-policy"] ?? "";
    expect(csp, path).toContain("script-src 'self' https://static.line-scdn.net");
    expect(csp, path).toContain("connect-src 'self' https://api.line.me");
    expect(csp, path).toContain("frame-ancestors 'none'");
    expect(csp, path).not.toContain("unsafe-inline");
    expect(csp, path).not.toContain("unsafe-eval");
  }
});

test("CSP を効かせたまま、画面を出して道を変えても、違反が出ない", async ({ page }) => {
  const violations = await collectCspViolations(page);
  await page.goto("/no/such/page");
  await expect(
    page.getByRole("heading", { level: 1, name: "ページが見つかりません" }),
  ).toBeVisible();
  // はじめの画面（/）は、ナビの最初の項目へ移る（どの画面になるかは書かない。並行開発の決まり 3-2）
  await page.getByRole("link", { name: "はじめの画面へ戻る" }).click();
  await expect(page).not.toHaveURL(/\/no\/such\/page$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await violations()).toEqual([]);
});
