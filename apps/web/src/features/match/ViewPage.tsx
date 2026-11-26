// P1 見るだけのページ（/match/view/$viewToken）。モックアップの P1。PRD FR-M18・FR-M25・FR-M23。AD-26・Constitution 1.3.0 の例外。
// - ログインなし・ふつうのブラウザ・ナビのない外枠（"bare"）。ページに noindex を付ける（窓口は no-store と X-Robots-Tag）
// - 出すのは試合表の名前と日付・組（タブ）・呼び名・組み合わせ・進み具合だけ（レベル・氏名は窓口が出さない）
// - 「自分の名前」を選ぶと、その呼び名に印を付ける（選んだ名前はこの端末にだけ残す）
// - つながっている間は30秒おきに版の番号を確かめ、変わっていれば読み直す。読めないときは、最後に読んだ表とその時刻を出す
//   （最後に読んだ表はこの端末に置く。ページそのものは試合表の Service Worker がネットなしで開く。AD-27。match-005）
// - 分け方（レベル別・分けない・ミニゲーム）が2つ以上なら分け方のタブ、レベル別の中で組が2つ以上なら組のタブ。ミニゲームはコートごとの
//   チームの呼び名（match-009）。つながらない間の今の試合の見込みは、1試合の長さを持たなくなったのでやめた（match-009）
// - 「QR を読む」（M4・FR-M24）：担当の端末が出した試合表の QR を読み、同じ試合表で今より新しい版のときだけ取り込む（AD-28）
// - 下に「試合表は当日に参加者へ公開されます」と「PaletKit で作った試合表・自分のサークルでも使う」（FR-M25）
import type { MatchSet, MatchView } from "@workspace/contracts/match";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/cn";
import { useEffect, useId, useState } from "react";
import { Dialog } from "@workspace/ui/components/dialog";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { endOfJstDate } from "@workspace/contracts/core";
import { ApiError, NetworkError, errorMessage } from "../../lib/api.ts";
import { Page } from "../../lib/page.tsx";
import { fetchView, fetchViewVersion } from "./api.ts";
import { formatClock, formatPlayDate } from "./format.ts";
import { GroupTabs } from "./GroupTabs.tsx";
import {
  HandoffCollector,
  HandoffFormatError,
  decodeTableHandoff,
  readHandoffPart,
} from "./handoff.ts";
import { tokenHint } from "./link-store.ts";
import { QrScanner } from "./QrScanner.tsx";
import { MiniTeams } from "./MiniTeams.tsx";
import { SetTabs } from "./SetTabs.tsx";
import { decideHandoffImport, isHandoffNewer, newerView } from "./view-import.ts";
import type { SavedView } from "./view-import.ts";
import { useOnline } from "./online.ts";
import { MATCH_ROUTE_PATTERNS } from "./paths.ts";
import { useNoIndex } from "./no-index.ts";
import { PRODUCT_NAME } from "@workspace/contracts/core";

/** 版の番号を確かめる間（ミリ秒。AD-26【仮決め】）。 */
const VERSION_CHECK_MS = 30_000;

/**
 * 端末に置く鍵（札ごと）。
 * @param token 見るだけの札
 * @param what 何を置くか
 * @returns 鍵
 */
function storageKey(token: string, what: "view" | "me"): string {
  return `kanaeru.match.${what}.${token}`;
}

/**
 * 端末から読む（読めなければ undefined）。
 * @param key 鍵
 * @returns 値の文字
 */
function load(key: string): string | undefined {
  try {
    return window.localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * 端末に置く（置けなければ何もしない）。
 * @param key 鍵
 * @param value 値の文字（undefined なら消す）
 */
function save(key: string, value: string | undefined): void {
  try {
    if (value === undefined) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // 置けないときは、この画面を開いている間だけ
  }
}

/**
 * 最後に読んだ表を読む。
 * @param token 見るだけの札
 * @returns 最後に読んだ表
 */
function loadSaved(token: string): SavedView | undefined {
  const raw = load(storageKey(token, "view"));
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as SavedView;
    return Date.parse(parsed.view.expiresAt) > Date.now() ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 今の試合の番号（0から。チェックのない最初の試合。みな終わっていれば試合の数）。
 * @param games 試合
 * @returns 番号
 */
function nowIndexOf(games: readonly { done: boolean }[]): number {
  const index = games.findIndex((game) => !game.done);
  return index < 0 ? games.length : index;
}

/**
 * 見るだけのページの中身。
 * @param props 中身（view）・読んだ時刻（readAt）・読めていないか（stale）・札（token）・QR で受け取ったか（fromQr）・QR を読む（onReadQr）
 * @param props.view 中身
 * @param props.readAt 読んだ時刻（ミリ秒）
 * @param props.stale 新しい表を読めていない（電波なし・読めなかった）
 * @param props.token 見るだけの札
 * @param props.fromQr QR で受け取った表か
 * @param props.onReadQr 「QR を読む」を押した
 * @returns 画面の要素
 */
function ViewBody({
  view,
  readAt,
  stale,
  token,
  fromQr,
  onReadQr,
}: {
  view: MatchView;
  readAt: number;
  stale: boolean;
  token: string;
  fromQr: boolean;
  onReadQr: () => void;
}) {
  const baseId = useId();
  const meId = useId();
  const [me, setMe] = useState(() => load(storageKey(token, "me")) ?? "");
  const groupsWithGames = view.groups.filter((group) => group.games.length > 0);
  const teams = view.teams ?? [];
  const sets: MatchSet[] = [
    ...(groupsWithGames.some((group) => group.key !== "all") ? (["levels"] as const) : []),
    ...(groupsWithGames.some((group) => group.key === "all") ? (["ungrouped"] as const) : []),
    ...(teams.length > 0 ? (["mini"] as const) : []),
  ];
  const groupsOf = (set: MatchSet) =>
    set === "mini"
      ? []
      : groupsWithGames.filter((group) => (group.key === "all") === (set === "ungrouped"));
  const mine = groupsWithGames.find((group) =>
    group.games.some((game) => game.players.includes(me)),
  );
  const [chosenSet, setChosenSet] = useState<MatchSet | undefined>(() =>
    mine ? (mine.key === "all" ? "ungrouped" : "levels") : sets[0],
  );
  const set = chosenSet && sets.includes(chosenSet) ? chosenSet : sets[0];
  const groups = set ? groupsOf(set) : [];
  const [selected, setSelected] = useState(mine?.key ?? groups[0]?.key ?? "");
  const group = groups.find((entry) => entry.key === selected) ?? groups[0];
  const names = [
    ...new Set([
      ...view.groups.flatMap((entry) => entry.games.flatMap((game) => game.players)),
      ...teams.flat(),
    ]),
  ]
    .filter((name) => name !== "")
    .sort((a, b) => a.localeCompare(b, "ja"));
  const now = group ? nowIndexOf(group.games) : 0;
  const progress =
    set === "mini"
      ? `ミニゲーム・${teams.length / 2}コート`
      : group && now < group.games.length
        ? `今 第${now + 1}試合${now + 1 < group.games.length ? `・次 第${now + 2}試合` : ""}`
        : "すべて終わりました";

  /**
   * 分け方を選ぶ（その分け方の最初の組を選ぶ）。
   * @param next 分け方
   */
  const chooseSet = (next: MatchSet) => {
    setChosenSet(next);
    const first = groupsOf(next)[0];
    if (first) setSelected(first.key);
  };

  return (
    <Page title={view.name} lead={`${formatPlayDate(view.playDate)}・試合表`}>
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-xxs rounded-md border px-xs py-xxs",
          stale ? "border-warning bg-surface" : "border-border bg-surface-over",
        )}
      >
        <p role="status" className="text-s">
          {fromQr
            ? `${formatClock(readAt)} に QR で受け取った表です（版 ${view.version}）。${stale ? "つながったら自動で読み直します。" : ""}`
            : stale
              ? `電波がないか読めないため、${formatClock(readAt)} に読んだ表を出しています。つながったら自動で読み直します。`
              : `${formatClock(readAt)} に読んだ表です。つながっている間は30秒おきに確かめます。`}
        </p>
        <Button size="small" onClick={onReadQr}>
          QR を読む
        </Button>
      </div>
      {sets.length === 0 || !set ? (
        <p className="text-m text-text-sub">まだ試合表はありません。運営が作ると、ここに出ます。</p>
      ) : (
        <div className="flex flex-col gap-xs">
          <div className="flex flex-wrap items-end justify-between gap-xs">
            <p className="text-m text-text-sub">{progress}</p>
            <div className="flex flex-col gap-x3s">
              <label htmlFor={meId} className="text-s font-bold">
                自分の名前に印を付ける
              </label>
              <select
                id={meId}
                className="min-h-l rounded-sm border border-border-input bg-surface px-xxs text-m"
                value={me}
                onChange={(change) => {
                  const next = change.target.value;
                  setMe(next);
                  save(storageKey(token, "me"), next || undefined);
                }}
              >
                <option value="">選ばない</option>
                {names.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {sets.length > 1 ? (
            <SetTabs sets={sets} selected={set} onSelect={chooseSet} baseId={baseId} />
          ) : null}
          <div
            id={`${baseId}-set-panel`}
            role={sets.length > 1 ? "tabpanel" : undefined}
            aria-labelledby={sets.length > 1 ? `${baseId}-set-${set}` : undefined}
            className="flex flex-col gap-xs"
          >
            {set === "mini" ? (
              <MiniTeams
                teams={teams.map((team) =>
                  team.map((name) => ({ name, ...(me && name === me ? { note: "自分" } : {}) })),
                )}
              />
            ) : group ? (
              <>
                {groups.length > 1 ? (
                  <GroupTabs
                    groups={groups.map((entry) => ({
                      key: entry.key,
                      label: entry.label,
                      levels: [],
                    }))}
                    selected={group.key}
                    onSelect={setSelected}
                    baseId={baseId}
                    nowOf={(key) => {
                      const games = groups.find((entry) => entry.key === key)?.games ?? [];
                      const index = nowIndexOf(games);
                      return index < games.length ? index + 1 : null;
                    }}
                  />
                ) : null}
                <div
                  id={`${baseId}-panel`}
                  role={groups.length > 1 ? "tabpanel" : undefined}
                  aria-labelledby={groups.length > 1 ? `${baseId}-tab-${group.key}` : undefined}
                >
                  <table
                    aria-label={`${group.label}の試合表`}
                    className="w-full table-fixed border-collapse border border-border bg-surface"
                  >
                    <tbody>
                      {group.games.map((game, index) => {
                        const isNow = index === now;
                        const isNext = index === now + 1;
                        return (
                          <tr
                            key={index}
                            aria-current={isNow ? "true" : undefined}
                            className={cn(
                              "border-t border-border first:border-t-0",
                              isNow && "bg-primary text-on-primary",
                              isNext && "bg-primary-subtle",
                              game.done && "text-text-sub",
                            )}
                          >
                            <td
                              className={cn(
                                "w-m px-x3s py-xxs text-right text-xs tabular-nums",
                                isNow ? "text-on-primary" : "text-text-sub",
                              )}
                            >
                              {index + 1}
                            </td>
                            {game.players.map((name, column) => (
                              <td
                                key={column}
                                className={cn(
                                  "truncate border-l border-border px-xxs py-xxs text-m",
                                  game.done ? "font-normal" : "font-bold",
                                )}
                              >
                                {me && name === me ? (
                                  <mark className="rounded-sm bg-warning px-x3s text-text">
                                    {name}
                                  </mark>
                                ) : (
                                  name
                                )}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
      <footer className="flex flex-col items-center gap-x3s text-center text-s text-text-sub">
        <p>試合表は当日に参加者へ公開されます。当日に組み直すことがあります。</p>
        <p>
          {PRODUCT_NAME} で作った試合表・
          <a href="/match" className="text-text-link underline">
            自分のサークルでも使う
          </a>
        </p>
      </footer>
    </Page>
  );
}

/** QR を読んだ結果。 */
type ImportResult = { tone: "success" | "info" | "danger"; text: string };

/**
 * 「QR を読む」の枠（担当の端末が出した試合表の QR を読み、同じ試合表で今より新しい版で、画面に出せるときだけ取り込む。
 * 決め方は view-import.ts の decideHandoffImport）。
 * @param props 開いているか・開く閉じる・札・今出している表・サーバーから読んだ表・取り込む関数
 * @param props.open 開いているか
 * @param props.onOpenChange 開く・閉じる
 * @param props.token 見るだけの札
 * @param props.current 今出している表（なければ undefined）
 * @param props.server サーバーから読んだ表（なければ undefined）
 * @param props.onImport 取り込む（新しい中身を受け取る）
 * @returns 枠の要素
 */
function ReadQrDialog({
  open,
  onOpenChange,
  token,
  current,
  server,
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  current: MatchView | undefined;
  server: MatchView | undefined;
  onImport: (view: MatchView) => void;
}) {
  const [collector] = useState(() => new HandoffCollector());
  const [result, setResult] = useState<ImportResult>();

  /**
   * 読んだ文字を受け取る。
   * @param text 読んだ文字
   * @returns カメラを止めるか
   */
  const read = async (text: string): Promise<"done" | "continue"> => {
    const part = readHandoffPart(text);
    if (part?.kind !== "table") {
      setResult({
        tone: "danger",
        text: "試合表の QR ではありません。運営の端末の「電波なしで渡す」の QR を読んでください。",
      });
      return "continue";
    }
    const progress = collector.add(part);
    if (!progress.data) {
      setResult({
        tone: "info",
        text: `${progress.have}/${progress.total}枚読みました。続けて、ほかの QR を読んでください。`,
      });
      return "continue";
    }
    try {
      const table = await decodeTableHandoff(progress.data);
      const decision = decideHandoffImport(table, {
        hint: await tokenHint(token),
        current,
        server,
        now: Date.now(),
        expiresAt: current?.expiresAt ?? endOfJstDate(table.playDate).toISOString(),
      });
      if (decision.kind === "reject") {
        setResult({ tone: decision.tone, text: decision.text });
        return "continue";
      }
      onImport(decision.view);
      setResult({ tone: "success", text: decision.text });
      return "done";
    } catch (caught) {
      setResult({
        tone: "danger",
        text:
          caught instanceof HandoffFormatError
            ? caught.message
            : "QR を読めませんでした。もう一度読んでください。",
      });
      return "continue";
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="QR を読む"
      description="運営の端末の「電波なしで渡す」の QR を読むと、ネットなしで今の試合表が入ります（今より新しい版のときだけ）。"
      footer={<Button onClick={() => onOpenChange(false)}>閉じる</Button>}
    >
      {result?.tone !== "success" ? <QrScanner onRead={read} /> : null}
      {result ? (
        <ResponseMessage tone={result.tone === "danger" ? "danger" : "success"}>
          {result.text}
        </ResponseMessage>
      ) : null}
    </Dialog>
  );
}

/**
 * 見るだけのページ（道の部品）。
 * @returns 画面の要素
 */
export function ViewRoute() {
  const { viewToken } = useParams({ from: MATCH_ROUTE_PATTERNS.view });
  useNoIndex();
  const online = useOnline();
  const [saved, setSaved] = useState(() => loadSaved(viewToken));
  const [qrOpen, setQrOpen] = useState(false);
  const version = useQuery({
    queryKey: ["match", "view", viewToken, "version"],
    queryFn: () => fetchViewVersion(viewToken),
    // 電波がなくても読みにいき、読めなければ端末に置いた表を出す（止めて待たない）
    networkMode: "always",
    refetchInterval: online ? VERSION_CHECK_MS : false,
    refetchOnWindowFocus: true,
    retry: false,
  });
  const latest = version.data?.version;
  const view = useQuery({
    queryKey: ["match", "view", viewToken],
    queryFn: () => fetchView(viewToken),
    networkMode: "always",
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    retry: false,
    // 届かない（通信の誤り）間は、つながっていれば30秒おきに読み直す（失敗のたびにすぐ読み直さない）
    refetchInterval: (query) =>
      online && query.state.error instanceof NetworkError ? VERSION_CHECK_MS : false,
  });
  // 版の番号が変わっていたら読み直す
  const loadedVersion = view.data?.version;
  const { refetch } = view;
  useEffect(() => {
    if (latest !== undefined && loadedVersion !== undefined && latest !== loadedVersion) {
      void refetch();
    }
  }, [latest, loadedVersion, refetch]);
  // 電波が戻った知らせ（online）で、1回だけ読み直す（電波がない間に読めなかったとき）。失敗のたびに誤りは新しくなるので、
  // 誤りそのものを見て読み直すと、onLine が true のまま届かないときに読み直しが止まらない
  const unreachable = view.error instanceof NetworkError;
  useEffect(() => {
    if (!unreachable) return;
    const onOnline = () => void refetch();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [refetch, unreachable]);
  // サーバーから読んだ表を端末に置く（QR で受け取ったもっと新しい表は上書きしない）
  useEffect(() => {
    if (!view.data) return;
    const next: SavedView = { view: view.data, readAt: view.dataUpdatedAt };
    const current = loadSaved(viewToken);
    if (current?.source === "qr" && isHandoffNewer(current.view, view.data)) return;
    save(storageKey(viewToken, "view"), JSON.stringify(next));
    setSaved(next);
  }, [view.data, view.dataUpdatedAt, viewToken]);

  const failure = view.error ?? version.error;
  const gone = failure instanceof ApiError && failure.status === 404;
  if (gone) {
    return (
      <Page title="見られません" lead={failure.message}>
        <p className="text-s text-text-sub">
          {PRODUCT_NAME} で作った試合表・
          <a href="/match" className="text-text-link underline">
            自分のサークルでも使う
          </a>
        </p>
      </Page>
    );
  }
  const fromServer = view.data ? { view: view.data, readAt: view.dataUpdatedAt } : undefined;
  const current = newerView(fromServer, saved);
  /**
   * QR で受け取った表を端末に置いて出す。
   * @param imported 受け取った中身
   */
  const importView = (imported: MatchView) => {
    const next: SavedView = { view: imported, readAt: Date.now(), source: "qr" };
    save(storageKey(viewToken, "view"), JSON.stringify(next));
    setSaved(next);
  };
  const dialog = qrOpen ? (
    <ReadQrDialog
      open
      onOpenChange={setQrOpen}
      token={viewToken}
      current={current?.view}
      server={fromServer?.view}
      onImport={importView}
    />
  ) : null;
  if (!current) {
    if (view.isPending) {
      return (
        <p aria-busy="true" className="text-m text-text-sub">
          読みこんでいます…
        </p>
      );
    }
    return (
      <Page title="読みこめませんでした" lead={errorMessage(failure)}>
        <div className="flex flex-wrap gap-xxs">
          <Button onClick={() => void view.refetch()}>もう一度</Button>
          <Button onClick={() => setQrOpen(true)}>QR を読む</Button>
        </div>
        {dialog}
      </Page>
    );
  }
  const stale = !online || failure instanceof NetworkError || current !== fromServer;
  return (
    <>
      <ViewBody
        view={current.view}
        readAt={current.readAt}
        stale={stale}
        token={viewToken}
        fromQr={current.source === "qr"}
        onReadQr={() => setQrOpen(true)}
      />
      {dialog}
    </>
  );
}
