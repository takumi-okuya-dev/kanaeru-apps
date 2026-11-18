// アカウント（account-001）：LIFF ID のない画面で、手元のログイン（試験用のログイン。AD-12）から入り、
// 今の利用者（GET /api/v1/accounts/me）が自分になること。ログアウトで 401 に戻ること。両方の幅で axe にかける。
// DB は消さない（同じ LINE のユーザー ID でログインしても、アカウントは1つのまま。表示名は上書き）。
import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "../helpers/axe.ts";

test("手元のログインから入り、今の利用者が自分になる。ログアウトで戻る", async ({
  page,
}, testInfo) => {
  // 幅ごとに別の利用者（U と16進の32文字）
  const lineUserId = `U${(testInfo.project.name === "mobile" ? "e2e2" : "e2e1").padStart(32, "0")}`;
  const displayName = `E2E の利用者（${testInfo.project.name}）`;

  expect((await page.request.get("/api/v1/accounts/me")).status()).toBe(401);

  await page.goto("/dev/login");
  await expect(page.getByRole("heading", { level: 1, name: "手元のログイン" })).toBeVisible();
  await expectNoA11yViolations(page, "手元のログイン（入力）");

  await page.getByRole("textbox", { name: /LINE のユーザー ID/ }).fill(lineUserId);
  await page.getByRole("textbox", { name: /表示名/ }).fill(displayName);
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(
    page.getByRole("heading", { level: 2, name: `ログインしています：${displayName}` }),
  ).toBeVisible();
  await expectNoA11yViolations(page, "手元のログイン（ログイン済み）");

  // 画面と同じ源のクッキーで、API が今の利用者を返す
  const me = await page.request.get("/api/v1/accounts/me");
  expect(me.status()).toBe(200);
  expect(await me.json()).toMatchObject({ displayName, isOrganizer: false });
  const cookie = (await page.context().cookies()).find((item) => item.name === "kanaeru_session");
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/" });

  // 開き直しても、ログインしたまま
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 2, name: `ログインしています：${displayName}` }),
  ).toBeVisible();

  await page.getByRole("button", { name: "ログアウト" }).click();
  await expect(page.getByRole("button", { name: "ログイン" })).toBeVisible();
  expect((await page.request.get("/api/v1/accounts/me")).status()).toBe(401);
});
