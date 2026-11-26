// LINE（LIFF）の始め方の1か所（構成の決めごと AD-4）。画面ごとに liff.init() を書かない。
// - 組み立て（main.tsx）が、ルーターを作る前に startLiffFor() で initLiff() を1度だけ呼ぶ（init の前に URL を変えると LIFF が壊れるため）。
// - LIFF ID は組み立てのときに埋める（設定 VITE_LIFF_ID → vite.config.ts の define の __LIFF_ID__）。
// - LIFF ID がない（手元・テスト・E2E）ときは、LINE につながない仮の形で動く：未ログイン・ID トークンなし・LINE の外。
//   手元とテストのログインは account の試験用の窓口（AD-12）で行う。
// - ID トークンを POST /api/v1/auth/line に送ってセッションを作る処理は account が作り、getIDToken() の生の値だけを送る
//   （getProfile・getDecodedIDToken の中身をサーバーに送らない）。
// - SDK は LIFF ID があるときだけ、開いたときに読む（別の束。仮の形では読まない）。
// - 例外：試合表の道（/match・/match/…）は LIFF を始めずに開く（AD-4 の例外。電波のない体育館・ふつうのブラウザ。core-013）。
//   組み立ては startLiffFor(開いた道) で決める。始めずに開いたあとは getLiff() を使えない。LIFF の要る道へ移るときは、
//   道の根（lib/router.ts）が mustReloadForLiff で見て、ページを読み直して LIFF を始める（ほかの道は今までどおり）。

/** LINE の始め方が出すもの。 */
export type LiffClient = {
  /** "line"：本物の LIFF。"fake"：LIFF ID がないときの仮の形 */
  readonly mode: "line" | "fake";
  /**
   * LINE にログインしているか（LINE の中なら init で済んでいる）。
   * @returns ログインしていれば true
   */
  isLoggedIn(): boolean;
  /**
   * LINE のログインの画面へ移る（外のブラウザで使う。仮の形では何もしない）。
   * @param redirectUri ログインのあとに戻る URL（なければ今の URL）
   */
  login(redirectUri?: string): void;
  /**
   * 古い LINE のログインを捨ててから、LINE のログインの画面へ移る（外のブラウザの「LINEでログインし直す」。仮の形では何もしない）。
   * LIFF は ID トークンをブラウザ（localStorage）に残し、期限（1時間）が切れても isLoggedIn() は true のままで、login() は
   * 何もせず古いトークンを使い続ける。先に logout() で消すと、LINE のログインで新しいトークンが取れる。
   * @param redirectUri ログインのあとに戻る URL（なければ今の URL）
   */
  relogin(redirectUri?: string): void;
  /**
   * 生の ID トークン（API が LINE の verify で確かめる）。
   * @returns ID トークン（ログインしていない・仮の形では null）
   */
  getIDToken(): string | null;
  /**
   * LINE の中（LIFF ブラウザ）で開いているか。
   * @returns LINE の中なら true
   */
  isInClient(): boolean;
  /**
   * 公式 LINE の友だち追加を勧める小さな画面を出す（LIFF 2.28.0 から。使えないときは何もしない）。
   * @returns 画面を出せたら true（友だちになったかは分からない）。使えない・失敗したら false
   */
  requestFriendship(): Promise<boolean>;
};

/** 仮の LIFF の状態（テストで変える）。 */
export type FakeLiffState = {
  /** ログインしているか（既定は false） */
  loggedIn?: boolean;
  /** 返す ID トークン（既定は null） */
  idToken?: string | null;
  /** LINE の中か（既定は false） */
  inClient?: boolean;
};

/** initLiff に渡せるもの。 */
export type InitLiffOptions = {
  /** LIFF ID（既定は組み立てのときに埋めた値。空なら仮の形） */
  liffId?: string;
  /** 外のブラウザで、init のときに自動で LINE のログインへ移るか（既定は false。account が決める） */
  withLoginOnExternalBrowser?: boolean;
};

/**
 * LINE につながない仮の LIFF を作る（LIFF ID がないとき・テスト）。
 * @param state 仮の状態
 * @returns 仮の LIFF
 */
export function createFakeLiff(state: FakeLiffState = {}): LiffClient {
  const loggedIn = state.loggedIn ?? false;
  return {
    mode: "fake",
    isLoggedIn: () => loggedIn,
    login: () => {},
    relogin: () => {},
    getIDToken: () => (loggedIn ? (state.idToken ?? null) : null),
    isInClient: () => state.inClient ?? false,
    requestFriendship: () => Promise.resolve(false),
  };
}

/**
 * 本物の LIFF を始める（SDK は開いたときに読む）。
 * @param liffId LIFF ID
 * @param withLoginOnExternalBrowser 外のブラウザで自動でログインへ移るか
 * @returns 始めた LIFF
 * @throws {Error} SDK を読めない・liff.init() が失敗したとき
 */
async function createLineLiff(
  liffId: string,
  withLoginOnExternalBrowser: boolean,
): Promise<LiffClient> {
  const { default: liff } = await import("@line/liff");
  await liff.init({ liffId, withLoginOnExternalBrowser });
  return {
    mode: "line",
    isLoggedIn: () => liff.isLoggedIn(),
    login: (redirectUri) => {
      liff.login(redirectUri ? { redirectUri } : undefined);
    },
    relogin: (redirectUri) => {
      // 期限の切れた ID トークンが残っていると login() が何もしないので、先に消す
      if (liff.isLoggedIn()) liff.logout();
      liff.login(redirectUri ? { redirectUri } : undefined);
    },
    getIDToken: () => liff.getIDToken(),
    isInClient: () => liff.isInClient(),
    requestFriendship: async () => {
      // 文書の一覧にはないが、SDK は isApiAvailable で受け付ける（未ログイン・Full でない画面では false）
      if (!liff.isApiAvailable("requestFriendship")) return false;
      try {
        await liff.requestFriendship();
        return true;
      } catch {
        return false;
      }
    },
  };
}

/** 始めた LIFF（1つだけ）。 */
let current: Promise<LiffClient> | undefined;
/** 始め終えた LIFF（getLiff が返す）。 */
let ready: LiffClient | undefined;
/** 組み立てが LIFF を始めずに画面を開いたか（startLiffFor が決める）。 */
let skipped = false;

/**
 * LIFF を始めずに開く道の頭（AD-4 の例外。試合表の道。見るだけ・受付・運営のどれも含む）。
 * 道は大文字と小文字を分けて比べる（形の違う道は、今までどおり LIFF を始める側に倒す）。
 */
const PATH_PREFIXES_WITHOUT_LIFF: readonly string[] = ["/match"];

/**
 * LINE を始める（何度呼んでも、始めるのは1度だけ）。組み立てがルーターより先に、startLiffFor から呼ぶ。
 * @param options LIFF ID・外のブラウザでの自動のログイン
 * @returns 始めた LIFF（LIFF ID がなければ仮の形）
 * @throws {Error} 本物の LIFF を始められないとき（画面は「読みこめない」を出す）
 */
export function initLiff(options: InitLiffOptions = {}): Promise<LiffClient> {
  current ??= (async () => {
    const liffId = (options.liffId ?? __LIFF_ID__).trim();
    const client = liffId
      ? await createLineLiff(liffId, options.withLoginOnExternalBrowser ?? false)
      : createFakeLiff();
    ready = client;
    return client;
  })();
  return current;
}

/**
 * 始め終えた LIFF を返す（initLiff のあとに呼ぶ）。
 * @returns 始めた LIFF
 * @throws {Error} initLiff が終わる前に呼んだとき
 */
export function getLiff(): LiffClient {
  if (!ready && skipped) {
    throw new Error(
      "この道は LIFF を始めずに開いたので、getLiff() は使えません（構成の決めごと AD-4 の例外）。",
    );
  }
  if (!ready) throw new Error("initLiff() が終わる前に getLiff() を呼びました。");
  return ready;
}

/**
 * 開いた道で LIFF を始めるか（AD-4。試合表の道だけは始めない）。電波の有無では変えない。
 * @param pathname 道（location.pathname。クエリと # は含めない）
 * @returns 始めるなら true
 */
export function needsLiff(pathname: string): boolean {
  return !PATH_PREFIXES_WITHOUT_LIFF.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** startLiffFor の答え。"started"：始めた。"skipped"：始めない道なので始めなかった。"failed"：始められなかった。 */
export type LiffStart = "started" | "skipped" | "failed";

/**
 * 組み立てが、ルーターを作る前に1度だけ呼ぶ：開いた道で LIFF を始めるかを決め、始める道なら initLiff() を待つ。
 * @param pathname 開いた道（location.pathname）
 * @param options initLiff に渡すもの
 * @returns 始めた・始めなかった・始められなかった（"failed" なら画面は「読みこめない」を出し、ルーターを作らない）
 */
export async function startLiffFor(
  pathname: string,
  options: InitLiffOptions = {},
): Promise<LiffStart> {
  if (!needsLiff(pathname)) {
    skipped = true;
    return "skipped";
  }
  try {
    await initLiff(options);
    return "started";
  } catch {
    return "failed";
  }
}

/**
 * 移る先の道へ、ページを読み直して移るか（LIFF を始めずに開いたあと、LIFF の要る道へ移るとき）。
 * 読み直すと、組み立てがその道で LIFF を始める（始められなければ「読みこめない」。今までと同じ）。
 * @param pathname 移る先の道
 * @returns 読み直すなら true
 */
export function mustReloadForLiff(pathname: string): boolean {
  return skipped && !ready && needsLiff(pathname);
}

/** テストだけで使う：始めた LIFF を忘れる。 */
export function resetLiffForTest(): void {
  current = undefined;
  ready = undefined;
  skipped = false;
}
