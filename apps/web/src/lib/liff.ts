// LINE（LIFF）の始め方の1か所（構成の決めごと AD-4）。画面ごとに liff.init() を書かない。
// - 組み立て（main.tsx）が、ルーターを作る前に initLiff() を1度だけ呼ぶ（init の前に URL を変えると LIFF が壊れるため）。
// - LIFF ID は組み立てのときに埋める（設定 VITE_LIFF_ID → vite.config.ts の define の __LIFF_ID__）。
// - LIFF ID がない（手元・テスト・E2E）ときは、LINE につながない仮の形で動く：未ログイン・ID トークンなし・LINE の外。
//   手元とテストのログインは account の試験用の窓口（AD-12）で行う。
// - ID トークンを POST /api/v1/auth/line に送ってセッションを作る処理は account が作り、getIDToken() の生の値だけを送る
//   （getProfile・getDecodedIDToken の中身をサーバーに送らない）。
// - SDK は LIFF ID があるときだけ、開いたときに読む（別の束。仮の形では読まない）。

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

/**
 * LINE を始める（何度呼んでも、始めるのは1度だけ）。組み立てがルーターより先に呼ぶ。
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
  if (!ready) throw new Error("initLiff() が終わる前に getLiff() を呼びました。");
  return ready;
}

/** テストだけで使う：始めた LIFF を忘れる。 */
export function resetLiffForTest(): void {
  current = undefined;
  ready = undefined;
}
