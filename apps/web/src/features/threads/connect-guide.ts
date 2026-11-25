// Threads につなぐときの案内の文と、トークンの欄を隠す道具（threads-012。めぐるの TokenConnectForm の TOKEN_STEPS・unmask と、
// packages/shared の threads-account-guide.ts を写した）。文と手順はここだけに置き、画面はこれを出すだけにする。
// 許可の画面は、ブラウザで threads.com にログインしているアカウントを使い、アプリから切り替えられない（めぐるの specs/025）。

/** threads.com のはじめの画面（新しいタブで開く）。 */
export const THREADS_WEB_URL = "https://www.threads.com/";

/** トークンの作り方の短い手順（めぐるの specs/010）。 */
export const TOKEN_STEPS = [
  "Meta の開発者のサイトで、自分のアプリを作る（Threads の使い方を選ぶ）",
  "権限に「threads_basic」「threads_content_publish」「threads_manage_insights」を足す",
  "自分の Threads のアカウントをテスターに足し、Threads のアプリで招待を受ける",
  "「ユーザートークン生成ツール」で、長期のトークンを作ってコピーする",
  "下の欄に貼って「つなぐ」を押す",
] as const;

/** 隠している間に欄に出す文字。 */
export const TOKEN_MASK = "•";

/**
 * 隠している間の入力を、本当の値に写す。隠した「•」がそのまま残っていれば、打った文字を最後に足す。
 * 「•」が欠けたとき（消した・選んで打ちかえた）は、どこが変わったか分からないので、打った文字だけを新しい値にする
 * （消したなら空になる。貼り直してもらう）。
 * @param value 今の本当の値
 * @param shown 欄に入った文字（「•」と、打った文字）
 * @returns 新しい本当の値
 */
export function unmask(value: string, shown: string): string {
  const masked = TOKEN_MASK.repeat(value.length);
  if (shown.startsWith(masked))
    return value + shown.slice(masked.length).replaceAll(TOKEN_MASK, "");
  return shown.replaceAll(TOKEN_MASK, "");
}

/** 違う Threads のアカウントで許可したときに出るエラー（切り替えの手順を添える）。 */
export const ACCOUNT_SWITCH_ERRORS = [
  "THREADS_RECONNECT_MISMATCH",
  "THREADS_ACCOUNT_TAKEN",
  "THREADS_ACCOUNT_REGISTERED",
] as const;

/**
 * 切り替えの手順を添えるエラーか。
 * @param code エラーの code（なければ undefined）
 * @returns 添えるなら true
 */
export function isAccountSwitchError(code: string | undefined): boolean {
  return !!code && (ACCOUNT_SWITCH_ERRORS as readonly string[]).includes(code);
}

/**
 * 「Meta のアプリでつなぐ」を押す前の案内の文を、@名前を太くできるように分けて返す。
 * @param expected 使うべきアカウントのユーザー名（@ なし。決まっていなければ null）
 * @returns 前半の文（lead）と、@名前とそれに続く文（check。決まっていなければ null）
 */
export function accountGuideParts(expected: string | null): {
  lead: string;
  check: { name: string; rest: string } | null;
} {
  return {
    lead: "threads.com でログインしているアカウントで許可されます。",
    check: expected
      ? { name: `@${expected}`, rest: " でログインしているか確かめてください。" }
      : null,
  };
}

/**
 * 違うアカウントが出たときの、切り替えの手順の3行。
 * @param expected 使うべきアカウントのユーザー名（@ なし。決まっていなければ null）
 * @param again もう一度押すボタンの名前
 * @returns 手順の3行
 */
export function accountSwitchSteps(
  expected: string | null,
  again: string,
): [string, string, string] {
  return [
    "threads.com（または Threads のアプリ）で、今のアカウントからログアウトする",
    expected ? `@${expected} でログインし直す` : "つなぎたいアカウントでログインし直す",
    `この画面に戻って、もう一度「${again}」を押す`,
  ];
}

/**
 * 待たせている間が終わる時刻（日本時間の「HH:MM」）。
 * @param until 終わる時刻（ミリ秒）
 * @returns 「HH:MM」
 */
export function lockedUntilLabel(until: number): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(until));
}
