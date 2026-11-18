// 画面を始められなかったとき（LINE の始め方〈liff.init〉が失敗したとき）の画面。道の道具の外で描く。
// 文は EXPERIENCE.md の「読みこめない」（何が起きたか・どうすればよいか）。
import { Button } from "@workspace/ui/components/button";

/**
 * 画面を始められなかったときの画面。
 * @returns 画面の要素
 */
export function StartupErrorPage() {
  return (
    <main className="mx-auto flex max-w-page flex-col gap-s px-xs py-m">
      <h1 className="text-xl leading-tight font-bold">読みこめませんでした</h1>
      <p className="text-m">
        電波の良い所で、もう一度試してください。開かないときは、受付の人に声をかけてください。
      </p>
      <div>
        <Button variant="primary" onClick={() => window.location.reload()}>
          読み込み直す
        </Button>
      </div>
    </main>
  );
}
