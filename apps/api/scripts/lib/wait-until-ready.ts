// 準備ができるまで、間を空けて確かめ直す（core-018）。DB の変更を当てる job（scripts/migrate.ts）が、台が立ち上がってから
// Direct VPC egress で DB につながるまで（Google の文書：1分以上かかることがある）を待つために使う。

/** 確かめ直し方。 */
export type WaitUntilReadyOptions = {
  /** 待つ上限（ミリ秒）。これを過ぎたら、最後の誤りを投げる */
  deadlineMs: number;
  /** 確かめ直すまでの間（ミリ秒） */
  intervalMs: number;
  /**
   * 確かめ直してよい誤りか（既定はどれも確かめ直す）。false なら待たずにすぐ投げる（パスワード違いなど、待っても直らないもの）
   * @param error その回の誤り
   * @returns 確かめ直すなら true
   */
  shouldRetry?: (error: unknown) => boolean;
  /**
   * 確かめ直す前に呼ぶ（ログに出すため）
   * @param attempt 失敗した回（1から）
   * @param error その回の誤り
   */
  onRetry?: (attempt: number, error: unknown) => void;
  /**
   * 今の時刻（ミリ秒。テストで差しかえる）
   * @returns 今の時刻
   */
  now?: () => number;
  /**
   * 待つ（テストで差しかえる）
   * @param ms 待つ時間（ミリ秒）
   * @returns 待ち終わり
   */
  sleep?: (ms: number) => Promise<void>;
};

/**
 * 確かめが通るまで、間を空けて確かめ直す。
 * @param check 確かめ（通らなければ投げる）
 * @param options 確かめ直し方
 * @returns 確かめが通ったら終わる
 * @throws {unknown} 上限までに通らなかったときは、最後の誤り
 */
export async function waitUntilReady(
  check: () => Promise<void>,
  options: WaitUntilReadyOptions,
): Promise<void> {
  const now = options.now ?? Date.now;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const deadline = now() + options.deadlineMs;
  for (let attempt = 1; ; attempt += 1) {
    try {
      await check();
      return;
    } catch (error) {
      if (options.shouldRetry && !options.shouldRetry(error)) throw error;
      if (now() + options.intervalMs > deadline) throw error;
      options.onRetry?.(attempt, error);
      await sleep(options.intervalMs);
    }
  }
}
