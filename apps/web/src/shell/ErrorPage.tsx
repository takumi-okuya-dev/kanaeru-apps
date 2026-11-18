// 画面を描けなかったときの画面（外枠の中に出す）。中身は出さず、やり直す操作を1つ出す（EXPERIENCE.md 4「失敗」）。
import { Button } from "@workspace/ui/components/button";
import { Page } from "../lib/page.tsx";

/**
 * 画面を描けなかったときの画面。
 * @returns 画面の要素
 */
export function ErrorPage() {
  return (
    <Page title="画面を出せませんでした">
      <p className="text-m">うまくいきませんでした。読み込み直してから、もう一度お試しください。</p>
      <div>
        <Button variant="primary" onClick={() => window.location.reload()}>
          読み込み直す
        </Button>
      </div>
    </Page>
  );
}
