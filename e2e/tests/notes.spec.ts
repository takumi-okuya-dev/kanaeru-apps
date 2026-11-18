// メモの通しの流れ（両方の幅で流す）：空の状態 → 追加 → 一覧と知らせの帯 → 編集して保存（ボタンの近くの結果）→
// 確かめの枠で削除 → 一覧と知らせの帯。入力の誤りは欄のそばに出る。
import { expect, test } from "@playwright/test";
import { resetNotes } from "../helpers/db.ts";

test.beforeEach(async () => {
  await resetNotes();
});

test("追加・編集・削除の流れ", async ({ page }) => {
  await page.goto("/notes");
  // 空の状態：なぜ空か・最初にすることと、その操作を1つ
  await expect(page.getByRole("heading", { level: 2, name: "まだメモがありません" })).toBeVisible();
  await expect(page.getByRole("link", { name: "メモを追加" })).toHaveCount(1);
  await page.getByRole("link", { name: "メモを追加" }).click();

  await expect(page).toHaveURL("/notes/new");
  await page.getByRole("textbox", { name: /題/ }).fill("買い物");
  await page.getByRole("textbox", { name: "本文" }).fill("牛乳と卵");
  await page.getByRole("button", { name: "追加" }).click();

  // 画面が切り替わるので、画面の上の知らせの帯で伝える
  await expect(page).toHaveURL("/notes");
  await expect(page.getByRole("status")).toHaveText(/メモを追加しました。/);
  const row = page.getByRole("row", { name: /買い物/ });
  await expect(row).toBeVisible();

  await row.getByRole("link", { name: "買い物" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "メモの編集" })).toBeVisible();
  // ほかの道へ移ったら、前の知らせは消える
  await expect(page.getByText("メモを追加しました。")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: /題/ })).toHaveValue("買い物");
  await page.getByRole("textbox", { name: /題/ }).fill("買い物（週末）");
  await page.getByRole("button", { name: "保存" }).click();
  // 結果は押したボタンの近くに出す
  await expect(page.getByRole("status")).toHaveText("保存しました。");

  await page.getByRole("button", { name: "削除" }).click();
  const dialog = page.getByRole("alertdialog", { name: "メモを削除しますか" });
  await expect(dialog).toContainText(
    "「買い物（週末）」を削除します。削除したメモは元に戻せません。",
  );
  await expect(dialog.getByRole("button", { name: "キャンセル" })).toBeFocused();
  // 消したあと、消したメモを読み直さない（404 の要求・読みこみ中を出さない）
  const notFound: string[] = [];
  page.on("response", (response) => {
    if (response.url().includes("/api/v1/notes/") && response.status() === 404) {
      notFound.push(response.url());
    }
  });
  await dialog.getByRole("button", { name: "削除" }).click();

  await expect(page).toHaveURL("/notes");
  await expect(page.getByRole("status")).toHaveText(/メモを削除しました。/);
  await expect(page.getByRole("heading", { level: 2, name: "まだメモがありません" })).toBeVisible();
  // 一覧の読み直しが終わるまで待ってから確かめる
  await page.waitForLoadState("networkidle");
  expect(notFound).toEqual([]);
});

test("入力の誤りは欄のそばに出し、最初の誤りの欄にフォーカスを移す。同じ題は題の欄に出す", async ({
  page,
}) => {
  await resetNotes(["買い物"]);
  await page.goto("/notes/new");
  await page.getByRole("button", { name: "追加" }).click();
  const title = page.getByRole("textbox", { name: /題/ });
  await expect(title).toBeFocused();
  await expect(title).toHaveAttribute("aria-invalid", "true");
  await expect(title).toHaveAccessibleDescription(/題を入れてください。/);

  await title.fill("買い物");
  await page.getByRole("button", { name: "追加" }).click();
  await expect(title).toHaveAccessibleDescription(
    /同じ題のメモがあります。ほかの題にしてください。/,
  );
  await expect(page.getByRole("alert")).toContainText("同じ題のメモがあります。");
  await expect(title).toHaveValue("買い物");
});

test("ないメモを開くと、見つからないことと戻る道を出す", async ({ page }) => {
  await page.goto("/notes/0193a1b2-0000-7000-8000-000000000000");
  await expect(page.getByRole("heading", { level: 1, name: "メモが見つかりません" })).toBeVisible();
  await expect(page.getByRole("link", { name: "メモの一覧へ戻る" })).toBeVisible();
});

test("ない道は、外枠の中の見つからない画面", async ({ page }) => {
  await page.goto("/no/such/page");
  await expect(
    page.getByRole("heading", { level: 1, name: "ページが見つかりません" }),
  ).toBeVisible();
  await expect(page.getByRole("navigation", { name: "メイン" })).toBeVisible();
});
