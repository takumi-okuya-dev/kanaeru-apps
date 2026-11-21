// P1 見るだけのページ（/match/view/$viewToken）。モックアップの P1。PRD FR-M18・FR-M25・FR-M23。AD-26・Constitution 1.3.0 の例外。
// - ログインなし・ふつうのブラウザ・ナビのない外枠（"bare"）。ページに noindex を付ける（窓口は no-store と X-Robots-Tag）
// - 出すのは試合表の名前と日付・組（タブ）・呼び名・組み合わせ・進み具合だけ（レベル・氏名は窓口が出さない）
// - 「自分の名前」を選ぶと、その呼び名に印を付ける（選んだ名前はこの端末にだけ残す）
// - つながっている間は30秒おきに版の番号を確かめ、変わっていれば読み直す。読めないときは、最後に読んだ表とその時刻を出す
//   （最後に読んだ表はこの端末に置く。ネットなしでページを開く形は、ネットなしの段で足す）
// - 下に「試合表は当日に参加者へ公開されます」と「kanaeru で作った試合表・自分のサークルでも使う」（FR-M25）
import type { MatchView } from "@workspace/contracts/match";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/cn";
import { useEffect, useId, useState } from "react";
import { ApiError, NetworkError, errorMessage } from "../../lib/api.ts";
import { Page } from "../../lib/page.tsx";
import { fetchView, fetchViewVersion } from "./api.ts";
import { formatPlayDate } from "./format.ts";
import { GroupTabs } from "./GroupTabs.tsx";
import { useOnline } from "./online.ts";
import { MATCH_ROUTE_PATTERNS } from "./paths.ts";
import { useNoIndex } from "./no-index.ts";

/** 版の番号を確かめる間（ミリ秒。AD-26【仮決め】）。 */
const VERSION_CHECK_MS = 30_000;

/** 最後に読んだ表（この端末に置く）。 */
type SavedView = {
  /** 中身 */
  view: MatchView;
  /** 読んだ時刻（ミリ秒） */
  readAt: number;
};

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
 * 時刻を「13:02」の形にする。
 * @param time 時刻（ミリ秒）
 * @returns 文字
 */
function clockOf(time: number): string {
  return new Date(time).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

/**
 * 組の今の試合の番号（0から。みな終わっていれば試合の数）。
 * @param games 試合
 * @returns 番号
 */
function nowIndex(games: MatchView["groups"][number]["games"]): number {
  const index = games.findIndex((game) => !game.done);
  return index < 0 ? games.length : index;
}

/**
 * 見るだけのページの中身。
 * @param props 中身（view）・読んだ時刻（readAt）・読めていないか（stale）・札（token）
 * @param props.view 中身
 * @param props.readAt 読んだ時刻（ミリ秒）
 * @param props.stale 新しい表を読めていない（電波なし・読めなかった）
 * @param props.token 見るだけの札
 * @returns 画面の要素
 */
function ViewBody({
  view,
  readAt,
  stale,
  token,
}: {
  view: MatchView;
  readAt: number;
  stale: boolean;
  token: string;
}) {
  const baseId = useId();
  const meId = useId();
  const [me, setMe] = useState(() => load(storageKey(token, "me")) ?? "");
  const groups = view.groups.filter((group) => group.games.length > 0);
  const mine = groups.find((group) => group.games.some((game) => game.players.includes(me)));
  const [selected, setSelected] = useState(mine?.key ?? groups[0]?.key ?? "");
  const group = groups.find((entry) => entry.key === selected) ?? groups[0];
  const names = [
    ...new Set(view.groups.flatMap((entry) => entry.games.flatMap((game) => game.players))),
  ]
    .filter((name) => name !== "")
    .sort((a, b) => a.localeCompare(b, "ja"));
  const now = group ? nowIndex(group.games) : 0;
  const progress =
    group && now < group.games.length
      ? `今 第${now + 1}試合${now + 1 < group.games.length ? `・次 第${now + 2}試合` : ""}`
      : "すべて終わりました";

  return (
    <Page title={view.name} lead={`${formatPlayDate(view.playDate)}・レベル別の試合表`}>
      <p
        role="status"
        className={cn(
          "rounded-md border px-xs py-xxs text-s",
          stale ? "border-warning bg-surface" : "border-border bg-surface-over",
        )}
      >
        {stale
          ? `電波がないか読めないため、${clockOf(readAt)} に読んだ表を出しています。つながったら自動で読み直します。`
          : `${clockOf(readAt)} に読んだ表です。つながっている間は30秒おきに確かめます。`}
      </p>
      {groups.length === 0 || !group ? (
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
          {groups.length > 1 ? (
            <GroupTabs
              groups={groups.map((entry) => ({ key: entry.key, label: entry.label, levels: [] }))}
              selected={group.key}
              onSelect={setSelected}
              baseId={baseId}
              nowOf={(key) => {
                const games = groups.find((entry) => entry.key === key)?.games ?? [];
                const index = nowIndex(games);
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
                            <mark className="rounded-sm bg-warning px-x3s text-text">{name}</mark>
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
        </div>
      )}
      <footer className="flex flex-col items-center gap-x3s text-center text-s text-text-sub">
        <p>試合表は当日に参加者へ公開されます。当日に組み直すことがあります。</p>
        <p>
          kanaeru で作った試合表・
          <a href="/match" className="text-text-link underline">
            自分のサークルでも使う
          </a>
        </p>
      </footer>
    </Page>
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
  const version = useQuery({
    queryKey: ["match", "view", viewToken, "version"],
    queryFn: () => fetchViewVersion(viewToken),
    refetchInterval: online ? VERSION_CHECK_MS : false,
    refetchOnWindowFocus: true,
    retry: false,
  });
  const latest = version.data?.version;
  const view = useQuery({
    queryKey: ["match", "view", viewToken],
    queryFn: () => fetchView(viewToken),
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    retry: false,
  });
  // 版の番号が変わっていたら読み直す
  const loadedVersion = view.data?.version;
  const { refetch } = view;
  useEffect(() => {
    if (latest !== undefined && loadedVersion !== undefined && latest !== loadedVersion) {
      void refetch();
    }
  }, [latest, loadedVersion, refetch]);
  useEffect(() => {
    if (!view.data) return;
    const next = { view: view.data, readAt: view.dataUpdatedAt };
    save(storageKey(viewToken, "view"), JSON.stringify(next));
    setSaved(next);
  }, [view.data, view.dataUpdatedAt, viewToken]);

  const failure = view.error ?? version.error;
  const gone = failure instanceof ApiError && failure.status === 404;
  if (gone) {
    return (
      <Page title="見られません" lead={failure.message}>
        <p className="text-s text-text-sub">
          kanaeru で作った試合表・
          <a href="/match" className="text-text-link underline">
            自分のサークルでも使う
          </a>
        </p>
      </Page>
    );
  }
  const current = view.data ? { view: view.data, readAt: view.dataUpdatedAt } : saved;
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
        <div>
          <Button onClick={() => void view.refetch()}>もう一度</Button>
        </div>
      </Page>
    );
  }
  const stale = !online || failure instanceof NetworkError || !view.data;
  return <ViewBody view={current.view} readAt={current.readAt} stale={stale} token={viewToken} />;
}
