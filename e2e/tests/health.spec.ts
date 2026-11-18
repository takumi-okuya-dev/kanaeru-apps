// 動いているか・守りの見出し・CSP（両方の幅で流す）。
// - API（画面の /api の中継を通したもの。ブラウザが見るのと同じ）と、画面の vite preview の見出し。
// - CSP を効かせたまま、組み立てた画面が読み込め、CSP の違反が1つも出ないこと（確かめの枠を開いても）。
import { expect, test } from "@playwright/test";
import { collectCspViolations } from "../helpers/csp.ts";
import { resetNotes } from "../helpers/db.ts";

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
  expect(Object.keys(document.paths)).toEqual(
    expect.arrayContaining(["/api/v1/health", "/api/v1/notes", "/api/v1/notes/{noteId}"]),
  );
});

test("画面（組み立てたもの）に、守りの見出しと CSP がつく", async ({ request }) => {
  for (const path of ["/", "/notes", "/no/such/page"]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    const headers = response.headers();
    expect(headers["x-content-type-options"], path).toBe("nosniff");
    expect(headers["x-frame-options"], path).toBe("DENY");
    const csp = headers["content-security-policy"] ?? "";
    expect(csp, path).toContain("script-src 'self'");
    expect(csp, path).toContain("frame-ancestors 'none'");
    expect(csp, path).not.toContain("unsafe-inline");
    expect(csp, path).not.toContain("unsafe-eval");
  }
});

test("CSP を効かせたまま、一覧・追加・編集・確かめの枠が出せ、違反が出ない", async ({ page }) => {
  await resetNotes(["CSP の確かめ"]);
  const violations = await collectCspViolations(page);
  await page.goto("/");
  await expect(page).toHaveURL("/notes");
  await expect(page.getByRole("heading", { level: 1, name: "メモ" })).toBeVisible();
  await page.getByRole("link", { name: "メモを追加" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "メモを追加" })).toBeVisible();
  await page.goto("/notes");
  await page.getByRole("link", { name: "CSP の確かめ" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "メモの編集" })).toBeVisible();
  await page.getByRole("button", { name: "削除" }).click();
  await expect(page.getByRole("alertdialog", { name: "メモを削除しますか" })).toBeVisible();
  expect(await violations()).toEqual([]);
});
