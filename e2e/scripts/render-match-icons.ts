// 試合表のホーム画面のアイコン（apps/web/public/match/ の SVG）から、PNG を作り直す（match-007）。
// 手で流す（アイコンの SVG を直したときだけ。組み立てやテストでは流さない）：
//   pnpm exec tsx e2e/scripts/render-match-icons.ts
// 通しのテストと同じ Playwright の Chromium（版は pnpm-lock.yaml で決まる）で、SVG を等倍（deviceScaleFactor 1）の
// ちょうどの大きさに描いて写す。同じ SVG と同じ Chromium なら同じ絵になる。
// - icon.svg → apple-touch-icon.png（180。iPhone のホーム画面）・icon-192.png・icon-512.png（manifest の any）
// - icon-maskable.svg → icon-maskable-192.png・icon-maskable-512.png（manifest の maskable。絵を安全な円の中に収めたもの）
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

/** アイコンの置き場所（画面の public の下の match）。 */
const ICON_DIR = fileURLToPath(new URL("../../apps/web/public/match/", import.meta.url));

/** 作る PNG（もとの SVG・書き出す名前・一辺の画素）。 */
const OUTPUTS = [
  { svg: "icon.svg", png: "apple-touch-icon.png", size: 180 },
  { svg: "icon.svg", png: "icon-192.png", size: 192 },
  { svg: "icon.svg", png: "icon-512.png", size: 512 },
  { svg: "icon-maskable.svg", png: "icon-maskable-192.png", size: 192 },
  { svg: "icon-maskable.svg", png: "icon-maskable-512.png", size: 512 },
] as const;

/**
 * SVG を、一辺 size の PNG に描く。
 * @param svg SVG の中身
 * @param size 一辺の画素
 * @returns PNG のバイト
 */
async function render(svg: string, size: number): Promise<Buffer> {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    const source = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:#fff">` +
        `<img id="icon" alt="" src="${source}" width="${size}" height="${size}" style="display:block">` +
        `</body></html>`,
    );
    await page.locator("#icon").evaluate((image: HTMLImageElement) => image.decode());
    return await page.screenshot({ clip: { x: 0, y: 0, width: size, height: size } });
  } finally {
    await browser.close();
  }
}

for (const output of OUTPUTS) {
  const svg = readFileSync(`${ICON_DIR}${output.svg}`, "utf8");
  await writeFile(`${ICON_DIR}${output.png}`, await render(svg, output.size));
  console.log(`${output.png}（${output.size}×${output.size}）を書き出しました。`);
}
