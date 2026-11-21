// 送っていない変更の列（担当の端末。AD-28。match-005）。React を知らない（table-editor.ts が包む）。
// - 直すたびに、中身のまるごとを「変更の ID・もとにした版」と一緒に端末の置き場所（IndexedDB）に足し、古い順に1つずつ送る
// - もとにした版は、前の変更のもとの版＋1（前の変更がなければ、最後にサーバーが受けた版）。送るときは置いた値をそのまま送る
// - 電波がない・届かない（通信の誤り）・サーバーが一時的に答えない（5xx・429）ときは、端末に残して待ち、つながったら送り直す
//   （同じ変更の ID で送るので、前の送りが届いていても二重にならない。サーバーが同じ答えを返す）
// - 409（MATCH_VERSION_CONFLICT：ほかの端末で直された／MATCH_NOT_EDITOR：担当が替わった）と、直せない誤り（400・403・404）は、
//   送りを止めて変更を端末に残し、知らせる（held）。運営が「この端末の変更を捨てる」か「この端末の変更で上書きする」を選ぶ
// - 401（ログインが切れた）は、変更を残して、ログインし直すのを待つ
import type { MatchTable, MatchTableContent } from "@workspace/contracts/match";
import { ApiError, NetworkError } from "../../../lib/api.ts";
import type { OfflineStore, OutboxEntry } from "./store.ts";

/** 送れなかった理由の分け方。 */
export type SendFailure =
  "network" | "server" | "conflict" | "not-editor" | "unauthenticated" | "rejected";

/**
 * 送れなかった誤りを分ける。
 * @param error 送りの誤り
 * @returns 理由
 */
export function classifySendError(error: unknown): SendFailure {
  if (error instanceof NetworkError || error instanceof TypeError) return "network";
  if (!(error instanceof ApiError)) return "server";
  if (error.code === "MATCH_VERSION_CONFLICT") return "conflict";
  if (error.code === "MATCH_NOT_EDITOR") return "not-editor";
  if (error.status === 401) return "unauthenticated";
  if (error.status >= 500 || error.status === 429) return "server";
  return "rejected";
}

/** 送りの列の状態。 */
export type OutboxState =
  /** 送っていない変更はない */
  | { status: "idle" }
  /** 送っている */
  | { status: "sending"; count: number }
  /** 電波がない・届かない・サーバーが一時的に答えない。端末に残して、つながったら送る */
  | { status: "waiting"; reason: "offline" | "server"; count: number; savedAt: number }
  /** ログインが切れた。端末に残して、ログインし直すのを待つ */
  | { status: "unauthenticated"; count: number; savedAt: number }
  /** 送りを止めた（409・直せない誤り）。端末に残して知らせる */
  | {
      status: "held";
      reason: "conflict" | "not-editor" | "rejected";
      message: string;
      count: number;
      savedAt: number;
    };

/** Outbox が受け取るもの。 */
export type OutboxOptions = {
  /** 試合表の ID */
  tableId: string;
  /** 端末の置き場所 */
  store: OfflineStore;
  /** 1つの変更を送る（答えはサーバーが受けた試合表） */
  send: (entry: OutboxEntry) => Promise<MatchTable>;
  /** 今つながっているか（navigator.onLine。false なら送らずに待つ） */
  isOnline: () => boolean;
  /** 送れた（残りの数と、サーバーが受けた試合表） */
  onSent?: (table: MatchTable, remaining: number) => void;
  /** 状態が変わった */
  onChange?: (state: OutboxState) => void;
  /** 今の時刻（ミリ秒。テストで替える） */
  now?: () => number;
  /** 変更の ID を作る（テストで替える） */
  newChangeId?: () => string;
  /** 待っているときに、もう一度送るまでの間（ミリ秒。0 なら自分からは送り直さない） */
  retryMs?: number;
};

/** 待っているときに、もう一度送るまでの既定の間（ミリ秒）。 */
const DEFAULT_RETRY_MS = 15_000;

/** 試合表ごとの送っていない変更の列。 */
export class Outbox {
  /** 送っていない変更（古い順。置き場所と同じ） */
  private entries: OutboxEntry[] = [];
  /** 最後にサーバーが受けた版（まだ知らなければ undefined） */
  private confirmed: number | undefined;
  /** 今の状態 */
  private current: OutboxState = { status: "idle" };
  /** 送っている途中の Promise（同時に2つ送らない） */
  private running: Promise<void> | undefined;
  /** 送っている途中に、もう一度送るよう頼まれたか */
  private again = false;
  /** 置き場所から読み終えたか */
  private readonly ready: Promise<void>;
  /** もう一度送る時計 */
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** 受け取ったもの */
  private readonly options: Required<Omit<OutboxOptions, "onSent" | "onChange">> &
    Pick<OutboxOptions, "onSent" | "onChange">;

  /**
   * 置き場所から送っていない変更を読み始める。
   * @param options 試合表の ID・置き場所・送り方など
   */
  constructor(options: OutboxOptions) {
    this.options = {
      now: () => Date.now(),
      newChangeId: () => crypto.randomUUID(),
      retryMs: DEFAULT_RETRY_MS,
      ...options,
    };
    this.ready = options.store.listChanges(options.tableId).then((entries) => {
      this.entries = [...entries, ...this.entries];
      if (this.entries.length > 0) this.setState(this.waitingState("offline"));
    });
  }

  /**
   * 置き場所から読み終えるのを待つ。
   * @returns 終わり
   */
  loaded(): Promise<void> {
    return this.ready;
  }

  /**
   * 今の状態。
   * @returns 状態
   */
  state(): OutboxState {
    return this.current;
  }

  /**
   * 送っていない変更の数。
   * @returns 数
   */
  count(): number {
    return this.entries.length;
  }

  /**
   * 最後の送っていない変更（画面に出す中身）。
   * @returns 変更（なければ undefined）
   */
  latest(): OutboxEntry | undefined {
    return this.entries.at(-1);
  }

  /**
   * 送りを止めているか（held。この間は直さない）。
   * @returns 止めていれば true
   */
  isHeld(): boolean {
    return this.current.status === "held";
  }

  /**
   * 送り終えたあとにサーバーが持つはずの版（送っていない変更がなければ、最後にサーバーが受けた版）。
   * 電波なしで渡す QR に入れる版（AD-28）。
   * @returns 版（まだ知らなければ undefined）
   */
  expectedVersion(): number | undefined {
    const last = this.entries.at(-1);
    return last ? last.baseVersion + 1 : this.confirmed;
  }

  /**
   * サーバーから読んだ版を知らせる（送っていない変更がないときだけ、次のもとにする）。
   * @param version 読んだ版
   */
  observe(version: number): void {
    if (this.entries.length === 0 && !this.running) {
      this.confirmed = Math.max(this.confirmed ?? 0, version);
    }
  }

  /**
   * 担当を受け取った・上書きを決めたあと：最後にサーバーが受けた版を置きかえる。
   * @param version サーバーの今の版
   */
  reset(version: number): void {
    this.confirmed = version;
  }

  /**
   * 変更を足して送る（置き場所に足してから送り始める）。
   * @param change 中身とくじの種
   * @param change.content 直した中身
   * @param change.seed くじの種
   * @param fallbackVersion 最後にサーバーが受けた版をまだ知らないときに使う版（読みこんだ試合表の版）
   * @returns 足した変更
   */
  async enqueue(
    change: { content: MatchTableContent; seed: number },
    fallbackVersion: number,
  ): Promise<OutboxEntry> {
    await this.ready;
    const last = this.entries.at(-1);
    const entry: OutboxEntry = {
      tableId: this.options.tableId,
      changeId: this.options.newChangeId(),
      baseVersion: last ? last.baseVersion + 1 : (this.confirmed ?? fallbackVersion),
      content: change.content,
      seed: change.seed,
      createdAt: this.options.now(),
    };
    this.entries.push(entry);
    try {
      entry.seq = await this.options.store.addChange(entry);
    } catch {
      // 置けなくても、画面を開いている間は列に残して送る
    }
    void this.flush();
    return entry;
  }

  /**
   * 古い順に送る（送っている途中なら、その終わりを待つ）。止めている（held）ときは送らない。
   * @returns 終わり
   */
  flush(): Promise<void> {
    if (this.running) {
      // 送っている途中に呼ばれたら、終わったあとにもう一度回す（つながった・足したのを取りこぼさない）
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      do {
        this.again = false;
        await this.run();
      } while (this.again);
    })().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  /**
   * 今の送りが終わるのを待つ（送っていなければすぐ終わる。新しくは送らない）。
   * @returns 終わり
   */
  settled(): Promise<void> {
    return this.running ?? Promise.resolve();
  }

  /**
   * 送っていない変更をみな捨てる（held を解く）。
   * @returns 終わり
   */
  async discard(): Promise<void> {
    await this.ready;
    await this.running;
    this.entries = [];
    await this.options.store.clearChanges(this.options.tableId).catch(() => undefined);
    this.setState({ status: "idle" });
  }

  /**
   * この端末の変更で上書きする：最後の変更の中身を、サーバーの今の版をもとにした1つの変更にして送り直す（held を解く）。
   * @param serverVersion サーバーの今の版
   * @returns 終わり
   */
  async overwrite(serverVersion: number): Promise<void> {
    await this.ready;
    await this.running;
    const last = this.entries.at(-1);
    if (!last) return;
    this.entries = [];
    await this.options.store.clearChanges(this.options.tableId).catch(() => undefined);
    this.confirmed = serverVersion;
    this.setState({ status: "idle" });
    await this.enqueue({ content: last.content, seed: last.seed }, serverVersion);
    await this.flush();
  }

  /** もう一度送る時計を止める（画面を閉じたとき）。 */
  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  /**
   * 送る本体：古い順に1つずつ送り、送れたら消す。送れなければ理由で分けて止まる。
   * @returns 終わり
   */
  private async run(): Promise<void> {
    await this.ready;
    this.stop();
    while (this.entries.length > 0) {
      if (this.isHeld()) return;
      if (!this.options.isOnline()) {
        this.setState(this.waitingState("offline"));
        return;
      }
      const head = this.entries[0] as OutboxEntry;
      this.setState({ status: "sending", count: this.entries.length });
      let saved: MatchTable;
      try {
        saved = await this.options.send(head);
      } catch (caught) {
        this.fail(caught);
        return;
      }
      this.entries.shift();
      if (head.seq !== undefined) {
        await this.options.store.removeChange(head.seq).catch(() => undefined);
      }
      this.confirmed = saved.version;
      this.options.onSent?.(saved, this.entries.length);
    }
    this.setState({ status: "idle" });
  }

  /**
   * 送れなかったときに、理由で状態を決める（変更は残す）。
   * @param caught 送りの誤り
   */
  private fail(caught: unknown): void {
    const failure = classifySendError(caught);
    const savedAt = this.entries.at(-1)?.createdAt ?? this.options.now();
    const count = this.entries.length;
    if (failure === "network" || failure === "server") {
      this.setState(this.waitingState(failure === "network" ? "offline" : "server"));
      if (this.options.retryMs > 0) {
        this.timer = setTimeout(() => void this.flush(), this.options.retryMs);
      }
      return;
    }
    if (failure === "unauthenticated") {
      this.setState({ status: "unauthenticated", count, savedAt });
      return;
    }
    this.setState({
      status: "held",
      reason: failure,
      message: caught instanceof Error ? caught.message : String(caught),
      count,
      savedAt,
    });
  }

  /**
   * 待っている状態を作る。
   * @param reason 電波がない・サーバーが答えない
   * @returns 状態
   */
  private waitingState(reason: "offline" | "server"): OutboxState {
    return {
      status: "waiting",
      reason,
      count: this.entries.length,
      savedAt: this.entries.at(-1)?.createdAt ?? this.options.now(),
    };
  }

  /**
   * 状態を変えて知らせる。
   * @param state 新しい状態
   */
  private setState(state: OutboxState): void {
    this.current = state;
    this.options.onChange?.(state);
  }
}
